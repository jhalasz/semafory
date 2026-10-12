import {findConflicts} from "./conflict-core.js?v=2.0";
const NS="http://www.w3.org/2000/svg";
function world(el,svg,p){const a=svg.getScreenCTM(),b=el.getScreenCTM();if(!a||!b)throw Error("SVG není připraveno");const v=new DOMPoint(p.x,p.y).matrixTransform(a.inverse().multiply(b));return{x:v.x,y:v.y};}
export function createConflictEditor(svg,host,getMovements){
 const overlay=svg.querySelector("#conflicts-layer");overlay.replaceChildren();host.replaceChildren();
 const btn=document.createElement("button");btn.type="button";btn.textContent="Přepočítat kolizní místa";host.append(btn);
 const visible=document.createElement("label");const toggle=document.createElement("input");toggle.type="checkbox";toggle.checked=true;visible.append(toggle,document.createTextNode(" Zobrazit kolizní oblasti"));host.append(visible);
 const widthLabel=document.createElement("label");widthLabel.textContent="Orientační odstup os trajektorií: ";
 const width=document.createElement("input");width.type="number";width.min="2";width.max="30";width.step="1";width.value="9";width.style.width="65px";widthLabel.append(width);host.append(widthLabel);
 const info=document.createElement("p");info.className="help";host.append(info);
 const listing=document.createElement("div");host.append(listing);
 let result=[];
 function shapes(){
  const movements=new Set((getMovements()?.movements||[]).filter(m=>m.confirmed).map(m=>m.id));
  const group=svg.querySelector("#routes-layer");
  return [...group.querySelectorAll("path,line,polyline")].map((el,i)=>{
   try{const id="T"+String(i+1).padStart(2,"0");if(!movements.has(id))return null;const len=el.getTotalLength(),segments=Math.max(12,Math.ceil(len/4));const points=[];for(let j=0;j<=segments;j++)points.push(world(el,svg,el.getPointAtLength(len*j/segments)));return{id,points};}catch{return null;}
  }).filter(Boolean);
 }
 function recalc(){
  const paths=shapes(),gap=Math.max(2,Math.min(30,Number(width.value)||9));
  result=findConflicts(paths,gap);
  overlay.replaceChildren();listing.replaceChildren();
  overlay.setAttribute("visibility",toggle.checked?"visible":"hidden");
  info.textContent="Potvrzené trajektorie: "+paths.length+" · geometricky blízké dvojice: "+result.length+". Jedná se o kandidáty kolizí při zvoleném odstupu os, nikoli o vypočtené kolize vozidel. Délky a šířky vozidel teprve doplníme.";
  for(const r of result){
   const row=document.createElement("button");row.type="button";row.textContent=r.a+" × "+r.b+" ("+r.points.length+" oblasti)";listing.append(row);
   row.onclick=()=>{const p=r.points[0],box=svg.viewBox.baseVal,w=Math.max(120,box.width*.55),h=Math.max(120,box.height*.55);svg.setAttribute("viewBox",[p.x-w/2,p.y-h/2,w,h].join(" "));};
   for(const p of r.points){
    const c=document.createElementNS(NS,"circle");c.setAttribute("cx",p.x);c.setAttribute("cy",p.y);c.setAttribute("r",gap);c.setAttribute("fill","#ef4444");c.setAttribute("fill-opacity",".32");c.setAttribute("stroke","#ff5252");c.setAttribute("stroke-width","2");c.setAttribute("vector-effect","non-scaling-stroke");overlay.append(c);
   }
  }
 }
 btn.onclick=recalc;toggle.onchange=()=>overlay.setAttribute("visibility",toggle.checked?"visible":"hidden");width.onchange=recalc;
 recalc();
 return {refresh:recalc,export:()=>({format:"semafory-conflict-preview-1.0",clearance:Number(width.value),pairs:result.map(({a,b})=>({a,b}))}),restore(saved){if(Number.isFinite(saved?.clearance)){width.value=String(saved.clearance);recalc();}},dispose(){overlay.replaceChildren();host.replaceChildren();}};
}
