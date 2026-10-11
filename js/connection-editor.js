const NS="http://www.w3.org/2000/svg";
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function sample(group,root){
 const found=[];
 for(const el of group.querySelectorAll("path,line,polyline")){
  try{
   const length=el.getTotalLength();if(length<0.1)continue;
   const m=root.getScreenCTM().inverse().multiply(el.getScreenCTM());
   const xy=t=>{const p=el.getPointAtLength(Math.max(0,Math.min(length,t)));const q=new DOMPoint(p.x,p.y).matrixTransform(m);return {x:q.x,y:q.y};};
   const n=Math.min(length/3,Math.max(2,length*.07));
   const points=[{side:"start",p:xy(0),q:xy(n)},{side:"end",p:xy(length),q:xy(length-n)}];
   for(const s of points){
    const vx=s.p.x-s.q.x,vy=s.p.y-s.q.y,mag=Math.hypot(vx,vy);
    if(mag<.001)continue;
    found.push({id:found.length,element:el,side:s.side,p:s.p,out:{x:vx/mag,y:vy/mag}});
   }
  }catch(e){/* ignore invalid geometry */ }
 }
 return found;
}
function angle(a,b){
 // outward tangent vectors of two joined segment endpoints must oppose.
 const dot=-(a.out.x*b.out.x+a.out.y*b.out.y);
 return Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
}
function make(tag,attrs,parent){
 const el=document.createElementNS(NS,tag);
 for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
 parent.append(el);return el;
}
export function createConnectionEditor(scene,host,tolerancePercent=1.2){
 const overlay=scene.querySelector("#connections-layer");
 const report=document.getElementById("connection-report");
 overlay.replaceChildren();host.replaceChildren();
 const lane=sample(scene.querySelector("#lanes-layer"),scene),route=sample(scene.querySelector("#routes-layer"),scene);
 const view=scene.viewBox.baseVal;
 const tolerance=Math.hypot(view.width,view.height)*tolerancePercent/100;
 let proposals=[];
 for(const [idx,r] of route.entries()){
  const candidates=lane.map(l=>({l,d:dist(r.p,l.p),a:angle(r,l)}))
    .filter(c=>c.d<=tolerance&&c.a<=85)
    .sort((a,b)=>(a.d/tolerance+a.a/90)-(b.d/tolerance+b.a/90));
  const best=candidates[0];
  const alternative=candidates[1];
  const uncertain=!!(best&&alternative&&
   (alternative.d/tolerance+alternative.a/90)-(best.d/tolerance+best.a/90)<.25);
  const status= !best?"missing":uncertain?"ambiguous":best.d<.5&&best.a<25?"exact":"proposed";
  proposals.push({id:idx+1,r,best,alternatives:candidates,status,decision:status==="exact"?"accepted":"pending"});
 }
 const list=document.createElement("div");
 list.className="connection-list";host.append(list);
 const buttons=[];
 function redraw(){
  overlay.replaceChildren();list.replaceChildren();
  let exact=0,ready=0,ambiguous=0,missing=0,accepted=0,rejected=0;
  for(const p of proposals){
   if(p.status==="exact")exact++;
   if(p.status==="proposed")ready++;
   if(p.status==="ambiguous")ambiguous++;
   if(p.status==="missing")missing++;
   if(p.decision==="accepted")accepted++;
   if(p.decision==="rejected")rejected++;
   if(p.status==="exact")continue;
   const color=p.decision==="accepted"?"#22c55e":p.decision==="rejected"?"#64748b":p.status==="missing"?"#ef4444":p.status==="ambiguous"?"#eab308":"#f97316";
   make("circle",{cx:p.r.p.x,cy:p.r.p.y,r:5,fill:"#111827",stroke:color,"stroke-width":2,"vector-effect":"non-scaling-stroke"},overlay);
   if(p.best&&p.decision!=="rejected"){
    // Smooth cubic bridge: tangents point away from each joined endpoint;
    // joining segment points away from r and approaches l.
    const a=p.r.p,b=p.best.l.p,delta=dist(a,b),h=Math.min(delta*.4,12);
    const ra=p.r.out,lb=p.best.l.out;
    const path="M "+a.x+" "+a.y+" C "+(a.x+ra.x*h)+" "+(a.y+ra.y*h)+" "+(b.x+lb.x*h)+" "+(b.y+lb.y*h)+" "+b.x+" "+b.y;
    make("path",{d:path,fill:"none",stroke:color,"stroke-width":2.5,"stroke-dasharray":p.decision==="accepted"?"none":"4 4","vector-effect":"non-scaling-stroke"},overlay);
   }
   if(p.status==="missing")continue;
   const item=document.createElement("div");item.className="connection-item";
   const title=document.createElement("span");
   title.textContent="Spoj "+p.id+" · vzdálenost "+p.best.d.toFixed(1)+" · odchylka "+p.best.a.toFixed(0)+"°"+(p.status==="ambiguous"?" · nejasné":"");
   item.append(title);
   const yes=document.createElement("button");yes.type="button";yes.textContent="Potvrdit";yes.disabled=p.decision==="accepted";
   yes.addEventListener("click",()=>{p.decision="accepted";redraw();});
   const no=document.createElement("button");no.type="button";no.textContent="Odmítnout";no.disabled=p.decision==="rejected";
   no.addEventListener("click",()=>{p.decision="rejected";redraw();});
   item.append(yes,no);list.append(item);
  }
  report.textContent="Modré konce: "+lane.length+" · oranžové konce: "+route.length+" · přesné: "+exact+" · návrhy: "+ready+" · nejasné: "+ambiguous+" · bez kandidáta: "+missing+" · potvrzené: "+accepted+" · odmítnuté: "+rejected+". Tolerance "+tolerance.toFixed(1)+" jednotek SVG; mezní odchylka 85°. Zatím pouze návrh – původní data se nemění.";
 }
 redraw();
 return {
  export(){
   return proposals.filter(p=>p.decision==="accepted"&&p.best).map(p=>({
    routeEndpoint:p.id,routeSide:p.r.side,laneSide:p.best.l.side,
    from:p.r.p,to:p.best.l.p,distance:p.best.d,angleDegrees:p.best.a
   }));
  },
  dispose(){overlay.replaceChildren();host.replaceChildren();}
 };
}
