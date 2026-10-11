const NS="http://www.w3.org/2000/svg";
function pointToRoot(el,svg,p){const a=svg.getScreenCTM(),b=el.getScreenCTM();if(!a||!b)return null;const q=new DOMPoint(p.x,p.y).matrixTransform(a.inverse().multiply(b));return {x:q.x,y:q.y};}
function paths(group,svg,prefix){
 const out=[];let n=0;
 for(const el of group.querySelectorAll("path,line,polyline")){
  try{
   const length=el.getTotalLength();if(length<1)continue;
   const start=pointToRoot(el,svg,el.getPointAtLength(0));
   const end=pointToRoot(el,svg,el.getPointAtLength(length));
   if(!start||!end)continue;
   out.push({id:prefix+String(++n).padStart(2,"0"),start,end,el,direction:0,confirmed:false});
  }catch(e){}
 }
 return out;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function shape(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;}
export function createDirectionEditor(svg,container){
 const layer=svg.querySelector("#directions-layer");layer.replaceChildren();container.replaceChildren();
 const lanes=paths(svg.querySelector("#lanes-layer"),svg,"P");
 const routes=paths(svg.querySelector("#routes-layer"),svg,"T");
 const all=[...lanes,...routes],vb=svg.viewBox.baseVal;
 const near=Math.hypot(vb.width,vb.height)*.018;
 // Heuristic based on continuity: the end closer to another network endpoint is
 // a possible destination. It is not a legal inference of traffic direction.
 for(const item of all){
  const others=all.filter(o=>o!==item);
  const a=Math.min(Infinity,...others.map(o=>Math.min(distance(item.start,o.start),distance(item.start,o.end))));
  const b=Math.min(Infinity,...others.map(o=>Math.min(distance(item.end,o.start),distance(item.end,o.end))));
  if(Math.min(a,b)<=near&&Math.abs(a-b)>near*.35)item.direction=a>b?1:-1;
 }
 const head=document.createElement("p");head.className="help";
 head.textContent="Směry jsou pouze geometrické návrhy; skutečný směr musí být ověřen podle komunikace a dopravního značení. Klikni na řádek nebo šipku a směr potvrď.";container.append(head);
 const list=document.createElement("div");list.className="direction-list";container.append(list);
 let selected=null;
 function render(){
  layer.replaceChildren();list.replaceChildren();
  for(const item of all){
   const forward=item.direction!==-1;
   const from=forward?item.start:item.end,to=forward?item.end:item.start;
   const mid={x:(item.start.x+item.end.x)/2,y:(item.start.y+item.end.y)/2};
   const dx=to.x-from.x,dy=to.y-from.y,mag=Math.hypot(dx,dy)||1;
   const ux=dx/mag,uy=dy/mag;
   const color=item.confirmed?"#22c55e":item.direction===0?"#eab308":"#60a5fa";
   const marker=shape("g",{cursor:"pointer",role:"button",tabindex:0,"aria-label":"Vybrat "+item.id},layer);
   const p=shape("path",{d:"M "+(mid.x-ux*11)+" "+(mid.y-uy*11)+" L "+(mid.x+ux*11)+" "+(mid.y+uy*11)+" M "+(mid.x+ux*11)+" "+(mid.y+uy*11)+" L "+(mid.x+ux*4-uy*5)+" "+(mid.y+uy*4+ux*5)+" M "+(mid.x+ux*11)+" "+(mid.y+uy*11)+" L "+(mid.x+ux*4+uy*5)+" "+(mid.y+uy*4-ux*5),fill:"none",stroke:color,"stroke-width":selected===item.id?5:3,"vector-effect":"non-scaling-stroke"},marker);
   shape("circle",{cx:mid.x,cy:mid.y,r:16,fill:"transparent"},marker);
   const choose=()=>{selected=item.id;render();};
   marker.addEventListener("click",choose);marker.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();choose();}});
   const row=document.createElement("div");row.className="direction-item"+(selected===item.id?" selected":"");
   const title=document.createElement("button");title.textContent=item.id+" · "+(item.confirmed?"potvrzeno":item.direction===0?"směr neurčen":"návrh směru");
   title.type="button";title.addEventListener("click",choose);row.append(title);
   const flip=document.createElement("button");flip.type="button";flip.textContent="Obrátit";flip.addEventListener("click",()=>{item.direction=item.direction===-1?1:-1;item.confirmed=false;selected=item.id;render();});
   const confirm=document.createElement("button");confirm.type="button";confirm.textContent="Potvrdit";confirm.disabled=item.confirmed;confirm.addEventListener("click",()=>{item.direction=item.direction===-1?-1:1;item.confirmed=true;selected=item.id;render();});
   row.append(flip,confirm);list.append(row);
  }
  document.getElementById("direction-report").textContent="Pruhy: "+lanes.length+" · trajektorie: "+routes.length+" · potvrzeno: "+all.filter(x=>x.confirmed).length+"/"+all.length+". Žlutá šipka znamená neurčený směr.";
 }
 render();
 return {export:()=>({format:"semafory-directions-1.0",items:all.map(p=>({id:p.id,type:p.id[0]==="P"?"lane":"route",direction:p.direction===-1?"end-to-start":p.direction===1?"start-to-end":"unknown",confirmed:p.confirmed,start:p.start,end:p.end}))}),dispose(){layer.replaceChildren();container.replaceChildren();}};
}
