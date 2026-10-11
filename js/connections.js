const NS="http://www.w3.org/2000/svg";
const geomTags="path,line,polyline,polygon";
function endpoints(group,scene){
 const out=[];
 for(const el of group.querySelectorAll(geomTags)){
  try{
   let p0,p1;
   if(typeof el.getTotalLength==="function"){
    const length=el.getTotalLength();if(length<0.01)continue;
    p0=el.getPointAtLength(0);p1=el.getPointAtLength(length);
   }else if(el.localName==="line"){
    p0={x:Number(el.getAttribute("x1")||0),y:Number(el.getAttribute("y1")||0)};
    p1={x:Number(el.getAttribute("x2")||0),y:Number(el.getAttribute("y2")||0)};
   }else continue;
   const m=el.getCTM();if(!m)continue;
   for(const [side,p] of [["začátek",p0],["konec",p1]]){
    const q=new DOMPoint(p.x,p.y).matrixTransform(m);
    // getCTM is expressed in the root SVG user coordinates.
    out.push({x:q.x,y:q.y,side,el});
   }
  }catch(e){continue;}
 }
 return out;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function dot(g,p,stroke,r=5){
 const c=document.createElementNS(NS,"circle");
 c.setAttribute("cx",p.x);c.setAttribute("cy",p.y);c.setAttribute("r",r);
 c.setAttribute("fill","#111827");c.setAttribute("fill-opacity",".82");
 c.setAttribute("stroke",stroke);c.setAttribute("stroke-width","2");c.setAttribute("vector-effect","non-scaling-stroke");
 g.append(c);
}
function connector(g,a,b){
 const l=document.createElementNS(NS,"line");
 for(const [key,v] of [["x1",a.x],["y1",a.y],["x2",b.x],["y2",b.y]])l.setAttribute(key,v);
 l.setAttribute("stroke","#f97316");l.setAttribute("stroke-width","2");
 l.setAttribute("stroke-dasharray","5 4");l.setAttribute("vector-effect","non-scaling-stroke");
 g.append(l);
}
export function inspectConnections(scene, tolerancePercent=1.2){
 const layer=scene.querySelector("#connections-layer");layer.replaceChildren();
 const lanes=endpoints(scene.querySelector("#lanes-layer"),scene);
 const routes=endpoints(scene.querySelector("#routes-layer"),scene);
 const view=scene.viewBox.baseVal;
 const tolerance=Math.hypot(view.width,view.height)*tolerancePercent/100;
 const report={lanes:lanes.length,routes:routes.length,connected:0,gaps:0,ambiguous:0,missing:0,tolerance};
 if(!lanes.length||!routes.length)return report;
 for(const endpoint of routes){
  const sorted=lanes.map(p=>({p,d:distance(p,endpoint)})).sort((a,b)=>a.d-b.d);
  const candidate=sorted[0],near=sorted.filter(x=>x.d<=tolerance);
  if(!candidate||candidate.d>tolerance){
   report.missing++;dot(layer,endpoint,"#ef4444",7);continue;
  }
  if(near.length>1&&near[1].d-candidate.d<tolerance*.2){
   report.ambiguous++;dot(layer,endpoint,"#eab308",6);continue;
  }
  if(candidate.d<.5){report.connected++;continue;}
  report.gaps++;connector(layer,endpoint,candidate.p);dot(layer,endpoint,"#f97316");
 }
 return report;
}
