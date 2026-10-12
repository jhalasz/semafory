// Universal geometric conflicts, independent of street names or signal schedules.
function segmentDistance(a,b,c,d){
 const vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y;
 const denom=vx*wy-vy*wx;
 if(Math.abs(denom)>1e-8){const px=c.x-a.x,py=c.y-a.y,t=(px*wy-py*wx)/denom,u=(px*vy-py*vx)/denom;if(t>=0&&t<=1&&u>=0&&u<=1)return {distance:0,point:{x:a.x+t*vx,y:a.y+t*vy}};}
 const project=(p,s,e)=>{const dx=e.x-s.x,dy=e.y-s.y,t=Math.max(0,Math.min(1,((p.x-s.x)*dx+(p.y-s.y)*dy)/(dx*dx+dy*dy||1)));const q={x:s.x+t*dx,y:s.y+t*dy};return {distance:Math.hypot(p.x-q.x,p.y-q.y),point:{x:(p.x+q.x)/2,y:(p.y+q.y)/2}};};
 return [project(a,c,d),project(b,c,d),project(c,a,b),project(d,a,b)].sort((x,y)=>x.distance-y.distance)[0];
}
export function findConflicts(paths,clearance=8){
 const results=[];
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
  const a=paths[i],b=paths[j];const points=[];
  for(let u=0;u<a.points.length-1;u++)for(let v=0;v<b.points.length-1;v++){
   const q=segmentDistance(a.points[u],a.points[u+1],b.points[v],b.points[v+1]);
   if(q.distance<=clearance&&!points.some(p=>Math.hypot(p.x-q.point.x,p.y-q.point.y)<clearance*1.4))points.push(q.point);
  }
  if(points.length)results.push({a:a.id,b:b.id,points,kind:"geometric-proximity",clearance});
 }
 return results;
}
