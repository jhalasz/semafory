// Pure, intersection-independent network direction inference.
// Each road segment has two possible orientations: +1 start->end, -1 end->start.
// Soft constraints: joins are preferred when an outgoing endpoint meets an incoming endpoint.
// Geometric proximity alone never establishes a legal direction of travel.
export function inferTopology(items, tolerance) {
 const threshold=Math.max(2,tolerance);
 const connections=[];
 const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const orient=(item,value)=>value===1?{entry:item.start,exit:item.end}:{entry:item.end,exit:item.start};
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  const a=items[i],b=items[j];
  if(a.type===b.type)continue;
  for(const ae of ["start","end"])for(const be of ["start","end"]){
   const distance=d(a[ae],b[be]);
   if(distance>threshold)continue;
   connections.push({i,j,ae,be,distance,weight:Math.max(.1,1-distance/threshold)});
  }
 }
 // A lane is an approach/exit whose intersection-side endpoint is nearer a route end.
 // This is topological evidence, not proof of legality. Avoid assumptions about road names.
 const score=(idx,value,choices)=>{
  const here=items[idx],dir=orient(here,value);let total=0;
  for(const c of connections){
   if(c.i!==idx&&c.j!==idx)continue;
   const mine=c.i===idx?c.ae:c.be;
   const otherIndex=c.i===idx?c.j:c.i,otherEnd=c.i===idx?c.be:c.ae;
   const other=items[otherIndex],otherDir=orient(other,choices[otherIndex]);
   const out=mine===(value===1?"end":"start");
   const theirOut=otherEnd===(choices[otherIndex]===1?"end":"start");
   // Every directed route-to-lane link must be exit->entry, not entry->entry or exit->exit.
   total+=c.weight*(out!==theirOut?1:-1);
  }
  // Outward end that is isolated is weak evidence of an exit lane, not categorical.
  const incoming=connections.filter(c=>c.i===idx||c.j===idx).length;
  if(!incoming)return 0;
  return total;
 };
 let choices=items.map(()=>1);
 // Deterministic coordinate descent with multiple seeds to reduce order bias.
 const candidates=[];
 for(const seed of [1,-1]){
  let curr=items.map(()=>seed);
  for(let k=0;k<25;k++){
   let changed=false;
   for(let i=0;i<items.length;i++){
    const plus=score(i,1,curr),minus=score(i,-1,curr);
    const next=plus>minus+1e-6?1:minus>plus+1e-6?-1:curr[i];
    if(next!==curr[i]){curr[i]=next;changed=true;}
   }
   if(!changed)break;
  }
  const global=curr.reduce((v,x,i)=>v+score(i,x,curr),0)/2;
  candidates.push({curr,global});
 }
 candidates.sort((a,b)=>b.global-a.global);
 const best=candidates[0];
 return items.map((item,i)=>{
  if(!connections.some(c=>c.i===i||c.j===i))return {direction:0,confidence:"unknown",reason:"Bez geometrické návaznosti"};
  const p=score(i,1,best.curr),m=score(i,-1,best.curr);
  const gap=Math.abs(p-m);
  // With weak or contradictory evidence the correct response is UNKNOWN.
  if(gap<.4||candidates.some(x=>Math.abs(x.global-best.global)<.3&&x.curr[i]!==best.curr[i])){
   return {direction:0,confidence:"unknown",reason:"Nejednoznačná návaznost"};
  }
  return {direction:p>m?1:-1,confidence:gap>1.5?"medium":"low",reason:"Návaznost pruh ↔ trajektorie; nutné ověřit značení"};
 });
}
