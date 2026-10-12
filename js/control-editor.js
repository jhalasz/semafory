const NS="http://www.w3.org/2000/svg";
function globalPoint(el,svg,pt){const a=svg.getScreenCTM(),b=el.getScreenCTM();if(!a||!b)return null;const p=new DOMPoint(pt.x,pt.y).matrixTransform(a.inverse().multiply(b));return {x:p.x,y:p.y};}
function pointObjects(group,svg,prefix){
 const out=[];let n=0;
 for(const el of group.querySelectorAll("path,line,polyline,circle,ellipse")){
  try{
   let p;
   if(el.localName==="circle"||el.localName==="ellipse")p={x:+el.getAttribute("cx"),y:+el.getAttribute("cy")};
   else {const len=el.getTotalLength();p=el.getPointAtLength(len/2);}
   const xy=globalPoint(el,svg,p);if(xy)out.push({id:prefix+String(++n).padStart(2,"0"),p:xy,el});
  }catch(e){console.warn("Skipped control",e);}
 }
 return out;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function svgMake(type,attrs,parent){const node=document.createElementNS(NS,type);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;}
export function createControlEditor(scene,container,getDirections){
 const layer=scene.querySelector("#controls-layer");layer.replaceChildren();container.replaceChildren();
 const lanes=pointObjects(scene.querySelector("#lanes-layer"),scene,"P");
 const boundaries=pointObjects(scene.querySelector("#entry-layer"),scene,"H");
 const signals=pointObjects(scene.querySelector("#signals-layer"),scene,"S");
 const lanePaths=[...scene.querySelector("#lanes-layer").querySelectorAll("path,line,polyline")];
 const laneRecords=lanePaths.map((el,i)=>{try{const len=el.getTotalLength();return {id:"P"+String(i+1).padStart(2,"0"),start:globalPoint(el,scene,el.getPointAtLength(0)),end:globalPoint(el,scene,el.getPointAtLength(len))};}catch{return null;}}).filter(Boolean);
 const assignments=laneRecords.map(l=>({lane:l.id,boundary:null,signal:null,confirmed:false,proposed:false}));
 const box=scene.viewBox.baseVal,threshold=Math.hypot(box.width,box.height)*.05;
 for(const item of assignments){
  const lane=laneRecords.find(x=>x.id===item.lane);
  const candidates=boundaries.map(b=>({b,d:Math.min(distance(lane.start,b.p),distance(lane.end,b.p))})).sort((a,b)=>a.d-b.d);
  if(candidates[0]&&candidates[0].d<threshold&&(!candidates[1]||candidates[1].d>candidates[0].d*1.6)){
   item.boundary=candidates[0].b.id;item.proposed=true;
   const s=signals.map(x=>({x,d:distance(x.p,candidates[0].b.p)})).sort((a,b)=>a.d-b.d);
   if(s[0]&&s[0].d<threshold*1.6&&(!s[1]||s[1].d>s[0].d*1.5))item.signal=s[0].x.id;
  }
 }
 const help=document.createElement("p");help.className="help";
 help.textContent="Fialové hranice H01–H07 a zelené semafory S01–S04 jsou očíslované přímo na mapě. Vyber pruh P, pak klikni na štítek H a S nebo použij nabídky. Potvrzuj jen skutečné příjezdové pruhy.";container.append(help);
 const list=document.createElement("div");container.append(list);
 let selected=null;
 const render=()=>{
  list.replaceChildren();layer.replaceChildren();
  // Number all boundaries and signals permanently at their true SVG coordinates.
  for(const [items,color] of [[boundaries,"#d8a2ff"],[signals,"#34d399"]]){
   for(const item of items){
    const active=assignments.some(a=>a.lane===selected&&(a.boundary===item.id||a.signal===item.id));
    const x=item.p.x,y=item.p.y;
    const g=svgMake("g",{cursor:"pointer",role:"button"},layer);
    svgMake("line",{x1:x,y1:y,x2:x+19,y2:y-18,stroke:color,"stroke-width":active?3:1.5,"vector-effect":"non-scaling-stroke"},g);
    svgMake("rect",{x:x+7,y:y-38,width:43,height:21,rx:5,fill:"#162238",stroke:color,"stroke-width":active?3:1.5,"vector-effect":"non-scaling-stroke"},g);
    const t=svgMake("text",{x:x+28.5,y:y-23,"text-anchor":"middle",fill:"#fff","font-size":12,"font-weight":"bold","pointer-events":"none"},g);
    t.textContent=item.id;
    svgMake("rect",{x:x+3,y:y-43,width:52,height:32,fill:"transparent"},g);
    g.addEventListener("click",()=>{
     const rec=assignments.find(a=>a.lane===selected);
     if(!rec)return;
     if(item.id.startsWith("H"))rec.boundary=item.id;else rec.signal=item.id;
     rec.confirmed=false;rec.proposed=false;
     scene.dispatchEvent(new Event("semafory:project-changed"));render();
    });
   }
  }
  const status=document.getElementById("control-report");
  status.textContent="Řídicí hranice: "+boundaries.length+" · semafory: "+signals.length+" · potvrzené vazby: "+assignments.filter(x=>x.confirmed).length+"/"+assignments.length;
  for(const record of assignments){
   const row=document.createElement("div");row.className="direction-item"+(record.lane===selected?" selected":"");
   const btn=document.createElement("button");btn.type="button";btn.textContent=record.lane+" · "+(record.confirmed?"potvrzeno":record.proposed?"návrh":"nepřiřazeno");
   btn.onclick=()=>{selected=record.lane;render();const l=laneRecords.find(x=>x.id===record.lane);if(l){const x=(l.start.x+l.end.x)/2,y=(l.start.y+l.end.y)/2;const bb=scene.viewBox.baseVal,w=Math.max(120,bb.width*.65),h=Math.max(120,bb.height*.65);scene.setAttribute("viewBox",[x-w/2,y-h/2,w,h].join(" "));}};
   const boundary=document.createElement("select");boundary.setAttribute("aria-label","Řídicí hranice "+record.lane);
   boundary.add(new Option("Bez hranice",""));for(const b of boundaries)boundary.add(new Option(b.id,b.id));boundary.value=record.boundary||"";
   boundary.onchange=()=>{record.boundary=boundary.value||null;record.confirmed=false;record.proposed=false;scene.dispatchEvent(new Event("semafory:project-changed"));render();};
   const signal=document.createElement("select");signal.setAttribute("aria-label","Semafor "+record.lane);
   signal.add(new Option("Bez semaforu",""));for(const s of signals)signal.add(new Option(s.id,s.id));signal.value=record.signal||"";
   signal.onchange=()=>{record.signal=signal.value||null;record.confirmed=false;record.proposed=false;scene.dispatchEvent(new Event("semafory:project-changed"));render();};
   const ok=document.createElement("button");ok.type="button";ok.textContent="Potvrdit";ok.disabled=!record.boundary||!record.signal||record.confirmed;
   ok.onclick=()=>{record.confirmed=true;record.proposed=false;scene.dispatchEvent(new Event("semafory:project-changed"));render();};
   row.append(btn,boundary,signal,ok);list.append(row);
   if(selected!==record.lane)continue;
   const l=laneRecords.find(x=>x.id===record.lane);
   for(const [label,p,color] of [[l.id,l.start,"#38bdf8"],[l.id,l.end,"#38bdf8"],...[boundaries.filter(b=>b.id===record.boundary).map(b=>[b.id,b.p,"#c084fc"])],...[signals.filter(s=>s.id===record.signal).map(s=>[s.id,s.p,"#22c55e"])] ]){
    const g=svgMake("g",{},layer);svgMake("circle",{cx:p.x,cy:p.y,r:11,fill:"#142437",stroke:color,"stroke-width":3,"vector-effect":"non-scaling-stroke"},g);
    const t=svgMake("text",{x:p.x+15,y:p.y-13,fill:"#fff","font-size":14,"font-weight":"bold"},g);t.textContent=label;
   }
  }
 };
 render();
 return {export:()=>({format:"semafory-controls-1.0",assignments:assignments.map(x=>({...x})),boundaries:boundaries.map(x=>({id:x.id,point:x.p})),signals:signals.map(x=>({id:x.id,point:x.p}))}),restore(data){if(!Array.isArray(data?.assignments))return;for(const old of data.assignments){const a=assignments.find(x=>x.lane===old.lane);if(!a)continue;a.boundary=boundaries.some(b=>b.id===old.boundary)?old.boundary:null;a.signal=signals.some(b=>b.id===old.signal)?old.signal:null;a.confirmed=!!old.confirmed&&!!a.boundary&&!!a.signal;a.proposed=false;}render();},dispose(){layer.replaceChildren();container.replaceChildren();}};
}
