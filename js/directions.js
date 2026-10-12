import {inferTopology} from "./topology.js?v=1.5";
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
   const midpoint=pointToRoot(el,svg,el.getPointAtLength(length*.5));
   const before=pointToRoot(el,svg,el.getPointAtLength(length*.46));
   const after=pointToRoot(el,svg,el.getPointAtLength(length*.54));
   out.push({id:prefix+String(++n).padStart(2,"0"),start,end,midpoint,before,after,el,direction:0,confirmed:false});
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
 const decisions=inferTopology(all.map(x=>({...x,type:x.id[0]==="P"?"lane":"route"})),near);
 all.forEach((item,i)=>{item.direction=decisions[i].direction;item.confidence=decisions[i].confidence;item.reason=decisions[i].reason;item.suggestedDirection=item.direction;});
 const head=document.createElement("p");head.className="help";
 head.textContent="Návrhy využívají návaznosti pruhů a trajektorií. Neurčité případy zůstávají neurčené. Pravidla provozu a značení budou ověřována v samostatné vrstvě; zde směr potvrď nebo oprav.";container.append(head);
 const list=document.createElement("div");list.className="direction-list";container.append(list);
 let selected=null;
 const baseView=svg.getAttribute("viewBox");
 function selectItem(item){
  selected=item.id;
  svg.dispatchEvent(new CustomEvent("semafory:direction-selected"));
  const bounds=baseView.trim().split(/[\s,]+/).map(Number);
  const center=item.midpoint;
  const w=bounds[2]/2.1,h=bounds[3]/2.1;
  svg.setAttribute("viewBox",[center.x-w/2,center.y-h/2,w,h].join(" "));
  render();
 }
 function render(){
  layer.replaceChildren();list.replaceChildren();
  for(const item of all){
   const forward=item.direction!==-1;
   const from=forward?item.start:item.end,to=forward?item.end:item.start;
   const mid=item.midpoint;
   const tangent=item.direction===-1?{x:item.before.x-item.after.x,y:item.before.y-item.after.y}:{x:item.after.x-item.before.x,y:item.after.y-item.before.y};
   const dx=tangent.x,dy=tangent.y,mag=Math.hypot(dx,dy)||1;
   const ux=dx/mag,uy=dy/mag;
   const color=item.confirmed?"#22c55e":item.direction===0?"#eab308":"#60a5fa";
   if(selected===item.id){
    const elementMatrix=svg.getScreenCTM().inverse().multiply(item.el.getScreenCTM());
    const transform="matrix("+[elementMatrix.a,elementMatrix.b,elementMatrix.c,elementMatrix.d,elementMatrix.e,elementMatrix.f].join(" ")+")";
    const copy=item.el.cloneNode(true);
    copy.removeAttribute("id");copy.setAttribute("transform",transform);
    copy.setAttribute("stroke","#00ff88");copy.setAttribute("stroke-width","7");
    copy.setAttribute("fill","none");copy.setAttribute("opacity","0.9");
    copy.setAttribute("vector-effect","non-scaling-stroke");
    layer.append(copy);
   }
   const marker=shape("g",{cursor:"pointer",role:"button",tabindex:0,"aria-label":"Vybrat "+item.id},layer);
   const p=shape("path",{d:"M "+(mid.x-ux*11)+" "+(mid.y-uy*11)+" L "+(mid.x+ux*11)+" "+(mid.y+uy*11)+" M "+(mid.x+ux*11)+" "+(mid.y+uy*11)+" L "+(mid.x+ux*4-uy*5)+" "+(mid.y+uy*4+ux*5)+" M "+(mid.x+ux*11)+" "+(mid.y+uy*11)+" L "+(mid.x+ux*4+uy*5)+" "+(mid.y+uy*4-ux*5),fill:"none",stroke:color,"stroke-width":selected===item.id?5:3,"vector-effect":"non-scaling-stroke"},marker);
   shape("circle",{cx:mid.x,cy:mid.y,r:16,fill:"transparent"},marker);
   const badge=shape("g",{cursor:"pointer"},layer);
   const bx=mid.x-uy*21,by=mid.y+ux*21;
   shape("line",{x1:mid.x,y1:mid.y,x2:bx,y2:by,stroke:color,"stroke-width":1.5,"stroke-dasharray":"3 3","pointer-events":"none"},badge);
   shape("circle",{cx:bx,cy:by,r:14,fill:"#172338",stroke:color,"stroke-width":selected===item.id?3:2},badge);
   const tag=shape("text",{x:bx,y:by+4,"text-anchor":"middle","font-size":10,"font-weight":"bold",fill:"#ffffff","pointer-events":"none"},badge);tag.textContent=item.id;
   shape("circle",{cx:bx,cy:by,r:18,fill:"transparent"},badge);
   const choose=()=>selectItem(item);
   badge.addEventListener("click",choose);
   marker.addEventListener("click",choose);marker.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();choose();}});
   const row=document.createElement("div");row.className="direction-item"+(selected===item.id?" selected":"");
   const title=document.createElement("button");title.textContent=item.id+" · "+(item.confirmed?"potvrzeno":item.direction===0?"směr neurčen":"návrh ("+item.confidence+")");
   title.type="button";title.addEventListener("click",choose);row.append(title);
   const flip=document.createElement("button");flip.type="button";flip.textContent="Obrátit";flip.addEventListener("click",()=>{item.direction=item.direction===-1?1:-1;item.confirmed=false;selectItem(item);});
   const confirm=document.createElement("button");confirm.type="button";confirm.textContent="Potvrdit";confirm.disabled=item.confirmed;confirm.addEventListener("click",()=>{item.direction=item.direction===-1?-1:1;item.confirmed=true;selected=item.id;render();});
   row.append(flip,confirm);list.append(row);
  }
  document.getElementById("direction-report").textContent="Pruhy: "+lanes.length+" · trajektorie: "+routes.length+" · potvrzeno: "+all.filter(x=>x.confirmed).length+"/"+all.length+". Žlutá šipka znamená neurčený směr.";
 }
 render();
 return {export:()=>({format:"semafory-directions-1.0",items:all.map(p=>({id:p.id,type:p.id[0]==="P"?"lane":"route",direction:p.direction===-1?"end-to-start":p.direction===1?"start-to-end":"unknown",suggestedDirection:p.suggestedDirection===-1?"end-to-start":p.suggestedDirection===1?"start-to-end":"unknown",confidence:p.confidence,confirmed:p.confirmed,manuallyChanged:p.confirmed&&p.direction!==p.suggestedDirection,start:p.start,end:p.end}))}),dispose(){layer.replaceChildren();container.replaceChildren();}};
}
