import {VEHICLE_TYPES,advanceVehicle} from "./vehicle-dynamics.js?v=2.3";
import {createSignalController} from "./signal-controller.js?v=2.4.3";
const ns="http://www.w3.org/2000/svg",svg=document.getElementById("scene"),$=id=>document.getElementById(id);
const map=$("map"),photoMap=$("photo-map"),markings=$("markings"),carsLayer=$("vehicles"),lights=$("lights");
let tracks=[],cars=[],passed=0,running=false,clock=0,spawnClock=0,last=0,phase=0,nextId=1,signals=[],controller=null,signalLocations=[];
function svgEl(name,attrs={}){const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;}
function category(el){const style=el.getAttribute("style")||"";const stroke=(el.getAttribute("stroke")||(style.match(/stroke:\s*([^;]+)/)||[])[1]||"").toLowerCase(),fill=(el.getAttribute("fill")||(style.match(/fill:\s*([^;]+)/)||[])[1]||"").toLowerCase();const c=stroke&&stroke!=="none"?stroke:fill;if(["#fff","#ffffff"].includes(c))return"markings";if(["#61cbf4","#37b5ed"].includes(c))return"lane";if(["#ffc000","#f59e0b"].includes(c))return"route";if(["#7030a0","#a855f7"].includes(c))return"boundary";if(["#00b050","#22c55e"].includes(c)||stroke==="#042433"&&fill==="#00b050")return"signal";return"map";}
function readSvg(xml){
 const doc=new DOMParser().parseFromString(xml,"image/svg+xml");if(doc.querySelector("parsererror"))throw Error("Neplatné SVG");
 const root=doc.documentElement;for(const el of root.querySelectorAll("script,foreignObject,animate,set"))el.remove();
 for(const el of root.querySelectorAll("*"))for(const a of [...el.attributes])if(a.name.startsWith("on"))el.removeAttribute(a.name);
 const d=root.querySelector("defs");if(d)for(const x of d.children)$("defs").append(document.importNode(x,true));
 const v=root.getAttribute("viewBox");svg.setAttribute("viewBox",v||"0 0 "+(parseFloat(root.getAttribute("width"))||1280)+" "+(parseFloat(root.getAttribute("height"))||720));
 const parts={lane:[],route:[],signal:[],boundary:[]};
 function visit(el,parents){
  if(el.localName==="defs"||el.localName==="clipPath")return;
  if(el.localName==="g"){for(const c of el.children)visit(c,[...parents,el]);return;}
  if(!["path","line","polyline","circle","ellipse","polygon","image","rect","use","text"].includes(el.localName))return;
  const kind=category(el);let dest=kind==="markings"?markings:map;
  // PowerPoint stores the real aerial photograph as a <use> of a JPEG held
  // in <defs>. Inline that JPEG directly: linked SVG images are unreliable
  // when cloned into a different document and can leave a white map.
  const href=el.getAttribute("href")||el.getAttributeNS("http://www.w3.org/1999/xlink","href")||"";
  const sourcePhoto=href==="#img1"?root.querySelector("defs image#img1"):null;
  const node=document.importNode(sourcePhoto||el,true);
  if(sourcePhoto){
   node.removeAttribute("id");
   if(el.hasAttribute("transform"))node.setAttribute("transform",el.getAttribute("transform"));
   const imageHref=sourcePhoto.getAttributeNS("http://www.w3.org/1999/xlink","href")||sourcePhoto.getAttribute("href");
   if(imageHref)node.setAttribute("href",imageHref);
  }
  for(const p of parents){const g=svgEl("g");for(const a of p.attributes)if(["transform","opacity","clip-path"].includes(a.name))g.setAttribute(a.name,a.value);dest.append(g);dest=g;}
  dest.append(node);
  if(parts[kind]&&["path","line","polyline","circle","ellipse"].includes(el.localName))parts[kind].push(node);
 }
 for(const c of root.children)visit(c,[]);
 // Public renderer: draw the original SVG as one correctly ordered tree.
 // Keep its embedded image, clip paths and parent transforms intact.
 // Only remove authoring overlays; invisible geometry above remains
 // available for car path sampling.
 const nativeRoot=document.importNode(root,true);
 nativeRoot.removeAttribute("width");nativeRoot.removeAttribute("height");
 nativeRoot.setAttribute("width","100%");nativeRoot.setAttribute("height","100%");
 for(const node of [...nativeRoot.querySelectorAll("path,line,polyline,circle,ellipse,polygon,use")]){
  const kind=category(node);
  const ref=node.getAttribute("href")||node.getAttributeNS("http://www.w3.org/1999/xlink","href");
  if(["lane","route","boundary","signal"].includes(kind)||ref==="#img3")node.remove();
 }
 $("native-map").replaceChildren(nativeRoot);
 // PowerPoint's slide clip truncates long white road lines. Redraw only
 // white-stroked road markings without inherited slide clipping.
 const freeMarkings=svgEl("g",{"data-overlay":"true","pointer-events":"none"});
 for(const el of root.querySelectorAll("path,line,polyline")){
  const stroke=(el.getAttribute("stroke")||((el.getAttribute("style")||"").match(/stroke:\\s*([^;]+)/)||[])[1]||"").trim().toLowerCase();
  if(stroke!=="#fff"&&stroke!=="#ffffff"&&stroke!=="white")continue;
  let node=document.importNode(el,true);
  const ancestors=[];for(let p=el.parentElement;p&&p!==root;p=p.parentElement)if(p.localName==="g")ancestors.unshift(p);
  for(let i=ancestors.length-1;i>=0;i--){
   const p=ancestors[i],g=svgEl("g");
   for(const attr of ["transform","opacity"])if(p.hasAttribute(attr))g.setAttribute(attr,p.getAttribute(attr));
   g.append(node);node=g;
  }
  freeMarkings.append(node);
 }
 $("native-map").append(freeMarkings);
 map.setAttribute("visibility","hidden");markings.setAttribute("visibility","hidden");

 // Draw the aerial photograph explicitly over PowerPoint's opaque white slide
 // background. The original <use href="#img1"> is deeply nested in clipped
 // transformed groups and was not reliably painted in the public view.
 const photoSource=root.querySelector("defs image#img1");
 if(photoSource){
  const href=photoSource.getAttributeNS("http://www.w3.org/1999/xlink","href")||photoSource.getAttribute("href");
  const use=[...root.querySelectorAll("use")].find(n=>(n.getAttribute("href")||n.getAttributeNS("http://www.w3.org/1999/xlink","href"))==="#img1");
  if(href&&use){
   const chain=[];for(let n=use;n&&n!==root;n=n.parentElement)if(n.hasAttribute("transform"))chain.unshift(n.getAttribute("transform"));
   let matrix=new DOMMatrix();
   for(const transform of chain){
    // PowerPoint writes SVG matrices separated by spaces. DOMMatrix(string)
    // expects a CSS transform and rejects the otherwise valid SVG syntax.
    const ops=[...transform.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)];
    for(const op of ops){
     const nums=(op[2].match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)||[]).map(Number);
     if(op[1]==="matrix"&&nums.length===6)matrix=matrix.multiply(new DOMMatrix(nums));
     else if(op[1]==="translate")matrix=matrix.translate(nums[0]||0,nums[1]||0);
     else if(op[1]==="scale")matrix=matrix.scale(nums[0]??1,nums[1]??nums[0]??1);
     else if(op[1]==="rotate")matrix=matrix.rotate(nums[0]||0);
    }
   }
   const width=Number(photoSource.getAttribute("width"))||1149,height=Number(photoSource.getAttribute("height"))||928;
   const rect=svgEl("image",{width,height,preserveAspectRatio:"none"});
   rect.setAttribute("href",href);rect.setAttribute("transform",`matrix(${[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].join(" ")})`);photoMap.append(rect);
  }
 }
 // Hide configuration markup; movement remains aligned in the same coordinates.
 for(const k of ["lane","route","boundary","signal"])for(const n of parts[k])n.setAttribute("visibility","hidden");
 try{
  // Use the actual photograph bounds, not the wide PowerPoint slide.
  // Keep the whole background visible and preserve its true aspect ratio.
  const b=photoMap.children.length?photoMap.getBBox():map.getBBox();
  if(b.width>0&&b.height>0){
    svg.setAttribute("viewBox",[b.x,b.y,b.width,b.height].join(" "));
    svg.style.aspectRatio=b.width+"/"+b.height;
    svg.parentElement.style.setProperty("--map-aspect",b.width+"/"+b.height);
  }
}catch{}
 return parts;
}
function samplePath(el,reverse=false){
 const len=el.getTotalLength(),n=Math.max(8,Math.ceil(len/5));const p=[];
 const matrix=svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
 for(let i=0;i<=n;i++){const q=el.getPointAtLength(len*(reverse?1-i/n:i/n));const v=new DOMPoint(q.x,q.y).matrixTransform(matrix);p.push({x:v.x,y:v.y});}
 return p;
}
// Road-network geometry is independent of individual turn movements.
// A lane is sampled once, and any movement referring to it reuses the same
// upstream segment. If its origin is inside the mapped road bounds, extend
// that segment along its existing tangent to the border, not per movement.
function roadBounds(parts){
 const points=parts.lane.flatMap(el=>{
  const p=samplePath(el);return[p[0],p[p.length-1]];
 });
 return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
function extendToRoadEdge(points,bounds){
 if(points.length<3)return points;
 const first=points[0],probe=points[Math.min(4,points.length-1)];
 const dx=first.x-probe.x,dy=first.y-probe.y;
 const hits=[];
 if(dx<-0.5)hits.push((bounds.left-first.x)/dx);
 if(dx>0.5)hits.push((bounds.right-first.x)/dx);
 if(dy<-0.5)hits.push((bounds.top-first.y)/dy);
 if(dy>0.5)hits.push((bounds.bottom-first.y)/dy);
 const t=Math.min(...hits.filter(t=>t>0));
 if(!Number.isFinite(t))return points;
 const distance=Math.hypot(dx*t,dy*t);
 if(distance<20||distance>280)return points;
 const segments=Math.max(2,Math.ceil(distance/5)),prefix=[];
 for(let i=0;i<segments;i++){const f=1-i/segments;prefix.push({x:first.x+dx*t*f,y:first.y+dy*t*f});}
 return prefix.concat(points);
}
function makeRoadNetwork(parts,directions){
 const direction=new Map((directions?.items||[]).filter(d=>d.confirmed).map(d=>[d.id,d.direction]));
 const bounds=roadBounds(parts),segments=new Map();
 function segment(id,entry=false){
  const key=id+(entry?":entry":"");
  if(segments.has(key))return segments.get(key);
  if(!direction.has(id))return null;
  const el=id[0]==="P"?parts.lane[Number(id.slice(1))-1]:parts.route[Number(id.slice(1))-1];
  if(!el)return null;
  let points=samplePath(el,direction.get(id)==="end-to-start");
  if(entry)points=extendToRoadEdge(points,bounds);
  segments.set(key,points);
  return points;
 }
 return {segment};
}
function joinPointsSmoothly(previous,next){
 if(!previous.length)return next;
 if(next.length<2)return next;
 const last=previous[previous.length-1],first=next[0];
 if(Math.hypot(last.x-first.x,last.y-first.y)>50)return null;
 // Join on the *forward* part of the outgoing path. Never drive backwards
 // to its nominal start, even when two authoring paths overlap by a few px.
 const probe=next[Math.min(5,next.length-1)];
 const tx=probe.x-first.x,ty=probe.y-first.y,mag=Math.hypot(tx,ty);
 if(mag<0.001)return next.slice(1);
 const ux=tx/mag,uy=ty/mag;
 const along=(p)=>(p.x-last.x)*ux+(p.y-last.y)*uy;
 let start=next.findIndex(p=>along(p)>=0.5);
 if(start<0)return [];
 // If the last authored point lies slightly ahead of the start of the next
 // path, choose the first forward point rather than visiting the overlap.
 const trimmed=next.slice(start);
 if(!trimmed.length)return [];
 const target=trimmed[0],dx=target.x-last.x,dy=target.y-last.y;
 const gap=Math.hypot(dx,dy);
 if(gap<0.05)return trimmed.slice(1);
 // A short smooth connection, never reversing the longitudinal direction.
 // The control points use the incoming and outgoing tangents.
 const prev=previous[Math.max(0,previous.length-4)];
 let vx=last.x-prev.x,vy=last.y-prev.y;
 const vmag=Math.hypot(vx,vy)||1;vx/=vmag;vy/=vmag;
 const reach=Math.min(gap*.3,4),steps=Math.max(2,Math.ceil(gap/2));
 const bridge=[];
 for(let i=1;i<=steps;i++){
  const t=i/steps,a=1-t;
  bridge.push({
   x:a*a*a*last.x+3*a*a*t*(last.x+vx*reach)+3*a*t*t*(target.x-ux*reach)+t*t*t*target.x,
   y:a*a*a*last.y+3*a*a*t*(last.y+vy*reach)+3*a*t*t*(target.y-uy*reach)+t*t*t*target.y
  });
 }
 return bridge.concat(trimmed.slice(1));
}
function makeTrack(network,movement){
 const combined=[];let approach=0,exitStart=0;
 for(const id of [movement.entryLane,movement.id,movement.exitLane]){
  let points=network.segment(id,id===movement.entryLane);
  if(!points)return null;
  // The two Opavska incoming lanes share one approach until the
  // physical fork. Preserve both original authored downstream paths.
  if(movement.id==="T03"&&id===movement.entryLane){
   const common=network.segment("P01",true);
   if(common){
    const fork=points[0];
    let nearest=0,best=Infinity;
    for(let j=0;j<common.length;j++){
     const d=Math.hypot(common[j].x-fork.x,common[j].y-fork.y);
     if(d<best){best=d;nearest=j;}
    }
    if(best<45&&nearest>3){
     const prefix=common.slice(0,nearest+1);
     const transition=joinPointsSmoothly(prefix,points);
     if(transition)points=prefix.concat(transition);
    }
   }
  }
  if(combined.length&&Math.hypot(combined.at(-1).x-points[0].x,combined.at(-1).y-points[0].y)>50)return null;
  if(id===movement.id)approach=combined.length?combined.reduce((acc,p,i,a)=>i?acc+Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y):0,0):0;
  if(id===movement.exitLane)exitStart=combined.length?combined.reduce((acc,p,i,a)=>i?acc+Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y):0,0):0;
  const joining=combined.length?joinPointsSmoothly(combined,points):points;
  if(!joining)return null;
  combined.push(...joining);
 }
 const cumulative=[0];for(let i=1;i<combined.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(combined[i].x-combined[i-1].x,combined[i].y-combined[i-1].y));
 return{id:movement.id,entryLane:movement.id==="T03"?"P01":movement.entryLane,exitLane:movement.exitLane,entryEnd:approach,exitStart,signal:movement.signal,points:combined,dist:cumulative,length:cumulative.at(-1),stopAt:approach-12};
}
function position(t,s){
 s=Math.max(0,Math.min(t.length,s));let lo=0,hi=t.dist.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(t.dist[mid]<s)lo=mid;else hi=mid;}const a=t.points[lo],b=t.points[hi],f=(s-t.dist[lo])/(t.dist[hi]-t.dist[lo]||1);return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
}
// Oriented rectangular vehicle footprints, including a small safety margin.
function vehicleFootprint(car,margin=2){
 const p=position(car.track,car.s),a=p.angle*Math.PI/180;
 const ux=Math.cos(a),uy=Math.sin(a),vx=-uy,vy=ux;
 const halfL=car.length/2+margin,halfW=(car.spec.width||10)/2+margin;
 return {p,ux,uy,vx,vy,halfL,halfW};
}
function footprintClearance(a,b){
 const dx=b.p.x-a.p.x,dy=b.p.y-a.p.y;
 for(const [x,y] of [[a.ux,a.uy],[a.vx,a.vy],[b.ux,b.uy],[b.vx,b.vy]]){
  const distance=Math.abs(dx*x+dy*y);
  const ra=a.halfL*Math.abs(a.ux*x+a.uy*y)+a.halfW*Math.abs(a.vx*x+a.vy*y);
  const rb=b.halfL*Math.abs(b.ux*x+b.uy*y)+b.halfW*Math.abs(b.vx*x+b.vy*y);
  if(distance>ra+rb)return distance-ra-rb;
 }
 return 0;
}

let conflictZones=[],freeSignals=new Set(),yieldRules=[];
function headingAt(t,s){const a=position(t,Math.max(0,s-8)),b=position(t,Math.min(t.length,s+8)),d=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/d,y:(b.y-a.y)/d};}
function leftTurn(t){const a=headingAt(t,t.entryEnd-10),b=headingAt(t,t.exitStart+10);return a.x*b.y-a.y*b.x<-.25;}
function buildConflicts(){
 const result=[];
 for(let i=0;i<tracks.length;i++)for(let j=i+1;j<tracks.length;j++){
  const a=tracks[i],b=tracks[j];
  if(a.entryLane===b.entryLane||a.exitLane===b.exitLane)continue;
  let count=0,sumA=0,sumB=0;
  for(let x=a.entryEnd-12;x<a.exitStart+12;x+=5)for(let y=b.entryEnd-12;y<b.exitStart+12;y+=5){
   const p=position(a,x),q=position(b,y);
   if(Math.hypot(p.x-q.x,p.y-q.y)<14){count++;sumA+=x;sumB+=y;}
  }
  if(count){const ha=headingAt(a,a.entryEnd-10),hb=headingAt(b,b.entryEnd-10);
   result.push({a,b,sa:sumA/count,sb:sumB/count,opposite:ha.x*hb.x+ha.y*hb.y<-.65});}
 }
 return result;
}
// Universal priority for two opposing movements joining the same exit lane.
// The left-turning vehicle must not enter unless the priority stream can
// continue without braking or changing course.
function sharedExitPriority(car,snapshot){
 if(!leftTurn(car.track))return null;
 let obstacle=null;
 for(const priorityTrack of tracks){
  if(priorityTrack===car.track||priorityTrack.entryLane===car.track.entryLane||priorityTrack.exitLane!==car.track.exitLane||leftTurn(priorityTrack))continue;
  const u=headingAt(car.track,car.track.entryEnd-10),v=headingAt(priorityTrack,priorityTrack.entryEnd-10);
  if(u.x*v.x+u.y*v.y>-.55)continue;
  const conflictS=car.track.exitStart;
  // Yield BEFORE entering the junction, not at the downstream merge.
  const stopS=car.track.stopAt;
  if(car.s>=stopS)continue;
  const approach=conflictS-car.s;
  if(approach>Math.max(170,car.v*4))continue;
  const distanceToClear=approach+car.length/2+26;
  const acc=Math.max(3,car.spec.maxAcceleration*.45);
  const launch=Math.min(car.v,10);
  const clearance=(Math.sqrt(launch*launch+2*acc*distanceToClear)-launch)/acc+4;
  for(const other of snapshot){
   if(other.track!==priorityTrack)continue;
   if(!lightIsGreen(other.track.signal)&&other.s<other.track.stopAt)continue;
   const remaining=priorityTrack.exitStart-other.s;
   if(remaining<-(other.length/2+35))continue;
   const arrival=Math.max(0,remaining-other.length/2)/Math.max(5,other.v);
   if(arrival>clearance+3)continue;
   const gap=Math.max(0,stopS-car.s);
   if(!obstacle||gap<obstacle.gap)obstacle={gap,v:0};
  }
 }
 return obstacle;
}
function conflictAhead(car,snapshot){
 let obstacle=null;
 for(const zone of conflictZones){
  if(car.track!==zone.a&&car.track!==zone.b)continue;
  const own=car.track===zone.a?zone.sa:zone.sb;
  const otherAt=car.track===zone.a?zone.sb:zone.sa;
  const otherTrack=car.track===zone.a?zone.b:zone.a;
  const d=own-car.s;
  // Stop before the crossing, but never try to stop a vehicle already
  // committed to the conflict space.
  // Once past the junction entry, the vehicle is committed and may not
  // be stopped by a late priority decision inside the crossing.
  const stopS=Math.min(car.track.stopAt,own-car.length/2-16);
  if(car.s>=stopS||d>Math.max(155,car.v*4))continue;
  for(const other of snapshot){
   if(other.track!==otherTrack)continue;
   const od=otherAt-other.s;
   const left=leftTurn(car.track),otherLeft=leftTurn(other.track);
   let mustYield=false;
   if(zone.opposite&&left!==otherLeft)mustYield=left;
   else if(zone.opposite&&left&&otherLeft)mustYield=false;
   else {
    const tOwn=d/Math.max(8,car.v),tOther=od/Math.max(8,other.v);
    mustYield=tOther<tOwn-.3||(Math.abs(tOther-tOwn)<=.3&&other.id<car.id);
   }
   if(!mustYield)continue;
   if(!lightIsGreen(other.track.signal)&&other.s<other.track.stopAt)continue;
   // Compute the full time required for the yielding vehicle to accelerate
   // from the line and completely clear the overlapping vehicle footprints.
   const remaining=Math.max(0,own-stopS);
   const traverse=Math.max(0,own-car.s)+car.length/2+other.length/2+30;
   // Conservative crossing estimate: starting from a stop, with reduced
   // effective acceleration through a turn and a margin for its full body.
   const acceleration=Math.max(3,car.spec.maxAcceleration*.55);
   const launchSpeed=Math.min(car.v,12);
   const clearanceTime=(Math.sqrt(launchSpeed*launchSpeed+2*acceleration*traverse)-launchSpeed)/acceleration+3;
   // A priority vehicle already across the conflict only clears it after
   // its rear bumper passes. An approaching vehicle needs a safe time gap.
   if(od<-(other.length/2+18))continue;
   const arrival=od<=other.length/2?0:(od-other.length/2)/Math.max(6,other.v);
   if(arrival>clearanceTime+3)continue;
   const gap=Math.max(0,stopS-car.s);
   if(!obstacle||gap<obstacle.gap)obstacle={gap,v:0};
  }
 }
 return obstacle;
}

 // Yield at a physical merge: the minor stream must leave the shared lane
 // free for vehicles already there or about to reach it.
 function mergeYieldObstacle(car,snapshot){
  let result=null;
  for(const rule of yieldRules){
   if(car.track.id!==rule.from)continue;
   const stop=car.track.stopAt,remaining=stop-car.s;
   // Once the front of the vehicle has crossed the boundary, it is
   // committed to the merge and may not stop inside the junction.
   if(remaining<=0||remaining>Math.max(125,car.v*3.5))continue;
   const ownMerge=car.track.exitStart;
   const distanceAfterStop=Math.max(0,ownMerge-stop);
   // Include acceleration from a full stop plus the time for the REAR
   // of this vehicle to clear the shared entry.
   const acceleration=Math.max(5,car.spec.maxAcceleration);
   const crossingTime=Math.sqrt(2*(distanceAfterStop+car.length+20)/acceleration)+1.5;
   for(const other of snapshot){
    if(!rule.to.includes(other.track.id))continue;
    const otherDistance=other.track.exitStart-other.s;
    // Vehicle still upstream, alongside the merge, or just past it.
    // A car past the merge is only safe once its rear clears the entry.
    if(otherDistance<-(other.length+32))continue;
    const otherArrival=otherDistance<=0?0:otherDistance/Math.max(5,other.v);
    // Guard the entire time window needed to enter AND clear the
    // priority lane; a momentarily empty merge is not sufficient.
    if(otherArrival>crossingTime+1.5)continue;
    const gap=Math.max(0,remaining);
    if(!result||gap<result.gap)result={gap,v:0};
   }
  }
  return result;
 }

function spawn(){
 if(!tracks.length||cars.length>90)return;
 const t=tracks[Math.floor(Math.random()*tracks.length)];
 if(cars.some(c=>c.track.entryLane===t.entryLane&&c.s-c.length/2<65))return;
 const truck=Math.random()<.09,spec=truck?VEHICLE_TYPES.truck:VEHICLE_TYPES.car;const g=svgEl("g"),body=svgEl("rect",{x:truck?-17:-12,y:truck?-6:-5,width:truck?34:24,height:truck?12:10,rx:2,fill:truck?"#f0c673":["#fff5bf","#e14e5a","#61b9ef","#9ee08e"][Math.floor(Math.random()*4)],stroke:"#172536","stroke-width":1.5});
 g.append(body);carsLayer.append(g);cars.push({id:nextId++,track:t,s:0,v:spec.cruise,length:spec.length,spec,el:g});
}
function locateSignals(parts){
 // Signal marker order is the canonical S01, S02 ... identifier order.
 // The group transforms are accounted for in SVG screen-to-viewBox coordinates.
 const inverse=svg.getScreenCTM().inverse();
 return parts.signal.map((node,i)=>{
  const box=node.getBBox(),center=new DOMPoint(box.x+box.width/2,box.y+box.height/2);
  const point=center.matrixTransform(inverse.multiply(node.getScreenCTM()));
  return {id:"S"+String(i+1).padStart(2,"0"),x:point.x,y:point.y};
 });
}
const signalVisuals=new Map();
function renderSignalLights(){
 for(const loc of signalLocations){
   if(freeSignals.has(loc.id))continue;
  let visual=signalVisuals.get(loc.id);
  if(!visual){
   const g=svgEl("g",{transform:`translate(${loc.x} ${loc.y})`,cursor:"pointer","data-signal":loc.id,role:"button",tabindex:0});
   g.append(svgEl("rect",{x:-8,y:-21,width:16,height:42,rx:4,fill:"#18202a",stroke:"#e4edf7","stroke-width":1.4}));
   const lamps=[-13,0,13].map(y=>{const lamp=svgEl("circle",{cx:0,cy:y,r:5.3,fill:"#343940",stroke:"#111820","stroke-width":.7});g.append(lamp);return lamp;});
   g.append(svgEl("rect",{x:-14,y:-26,width:28,height:52,fill:"transparent","pointer-events":"all"}));
   const title=svgEl("title");g.append(title);
   g.addEventListener("click",()=>requestSignal(loc.id));
   g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();requestSignal(loc.id);}});
   lights.append(g);visual={lamps,title};signalVisuals.set(loc.id,visual);
  }
  const state=controller.state(loc.id);
  const active=[state==="red"||state==="red-yellow",state==="yellow"||state==="red-yellow",state==="green"];
  ["#f43f46","#ffbf37","#2bdf64"].forEach((color,i)=>visual.lamps[i].setAttribute("fill",active[i]?color:"#343940"));
  visual.title.textContent=loc.id+" – "+state+" · kliknutím vyžádat zelenou";
 }
}
function requestSignal(id){
 if(!controller||freeSignals.has(id))return;
 if(!$("manual").checked){$("state").textContent="Nejprve zapni ruční ovládání.";return;}
 const ok=controller.requestSignal(id);
 $("state").textContent=ok?"Vyžádána zelená pro "+id+" (bezpečné přepnutí).":"Tento semafor už má zelenou.";
}
function lightIsGreen(signal){return freeSignals.has(signal)||controller?.state(signal)==="green";}
function animate(now){
 if(!last)last=now;const real=Math.min(.05,(now-last)/1000);last=now;
 if(running){const dt=real*Number($("speed").value);clock+=dt;controller.tick(dt,active=>cars.some(c=>!freeSignals.has(c.track.signal)&&active.includes(c.track.signal)&&c.s>=c.track.stopAt&&c.s<c.track.exitStart+c.length));spawnClock+=dt;const interval=2.6/Number($("rate").value)*6;
 while(spawnClock>=interval){spawnClock-=interval;spawn();}
 // Take one consistent snapshot so all vehicles react to the same traffic state.
 const snapshots=cars.map(c=>({...c}));
 for(const car of cars){
  let obstacle=null;
  for(const other of snapshots){
   if(other.id===car.id)continue;
   let delta=Infinity;
   if(other.track===car.track&&other.s>car.s)delta=other.s-car.s;
   // Common incoming approach: use road position rather than the end of
   // a movement's authored entry segment as the physical fork.
   if(car.track.entryLane===other.track.entryLane){
    const p=position(car.track,car.s),q=position(other.track,other.s);
    const forkX=435; // physical beginning of the second Opavska lane
    const shared=car.track.entryLane==="P01";
    // Other entry lanes (including Dukelska P04) also carry multiple
    // movements. Preserve one FIFO queue until the authored lane ends.
    if(!shared){
     // A single entry lane is a FIFO resource up to the physical fork.
     // Creation order is the lane order: differing movement progress after
     // a stop must never let the following car jump ahead.
     const fork=Math.min(car.track.entryEnd,other.track.entryEnd);
     const followerStillShared=car.s-car.length/2<fork+car.length/2;
     const leaderStillShared=other.s-other.length/2<fork+other.length/2;
     if(other.id<car.id&&followerStillShared&&leaderStillShared){
      delta=Math.min(delta,Math.max(0,other.s-car.s));
     }
    }
    const longitudinal=q.x-p.x;
    const lateral=Math.abs(q.y-p.y);
    // Before the fork cars form one queue, irrespective of their turn.
    // Beyond it, vehicles on divergent lanes no longer block one another.
    if(shared&&p.x<forkX+car.length/2&&q.x<forkX+other.length/2&&
       longitudinal>0&&lateral<34){
     delta=Math.min(delta,longitudinal);
    }
    // Where lanes overlap at the fork, keep a spatial collision envelope.
    if(shared&&p.x>forkX-45&&p.x<forkX+65&&
       q.x>forkX-45&&q.x<forkX+65&&longitudinal>0){
     // Exact oriented footprints avoid false conflicts between diverging
     // vehicles whose centres are close but whose bodies do not overlap.
     const clearance=footprintClearance(vehicleFootprint(car),vehicleFootprint(other));
     if(clearance<Math.max(4,car.v*.65)){
      if(!obstacle||clearance<obstacle.gap)obstacle={gap:clearance,v:other.v};
     }
    }
   }
   if(car.track.exitLane===other.track.exitLane&&car.s>=car.track.exitStart-35){
    const otherExit=other.s-other.track.exitStart;
    const ourExit=car.s-car.track.exitStart;
    if(otherExit>ourExit&&otherExit>-other.length)delta=Math.min(delta,otherExit-ourExit);
   }
   const gap=delta-(other.length+car.length)/2;
   if(Number.isFinite(gap)&&(!obstacle||gap<obstacle.gap))obstacle={gap,v:other.v};
  }
  // Physical follower envelope independent of route identities.
  const ownFoot=vehicleFootprint(car,1);
  for(const other of snapshots){
   if(other.id===car.id)continue;
   const p=ownFoot.p,q=position(other.track,other.s);
   const forward=(q.x-p.x)*ownFoot.ux+(q.y-p.y)*ownFoot.uy;
   const sideways=Math.abs((q.x-p.x)*ownFoot.vx+(q.y-p.y)*ownFoot.vy);
   if(forward<=0||forward>Math.max(85,car.v*2.2)||sideways>13)continue;
   const clearance=footprintClearance(ownFoot,vehicleFootprint(other,1));
   if(clearance<Math.max(12,car.v*1.25)){
    const candidate={gap:Math.max(0,clearance),v:other.v};
    if(!obstacle||candidate.gap<obstacle.gap)obstacle=candidate;
   }
  }
  const exitPriority=sharedExitPriority(car,snapshots);
  if(exitPriority&&(!obstacle||exitPriority.gap<obstacle.gap))obstacle=exitPriority;
  const yielding=mergeYieldObstacle(car,snapshots);
   if(yielding&&(!obstacle||yielding.gap<obstacle.gap))obstacle=yielding;
   const crossing=conflictAhead(car,snapshots);
   if(crossing&&(!obstacle||crossing.gap<obstacle.gap))obstacle=crossing;
   // A red signal acts like a stationary lead vehicle at the stop line.
  if(!lightIsGreen(car.track.signal)&&car.s<car.track.stopAt){
   const gap=car.track.stopAt-car.s;
   if(!obstacle||gap<obstacle.gap)obstacle={gap,v:0};
  }
  advanceVehicle(car,obstacle,dt);
  const p=position(car.track,car.s);car.el.setAttribute("transform",`translate(${p.x} ${p.y}) rotate(${p.angle})`);
 }
 cars=cars.filter(c=>{if(c.s<c.track.length)return true;c.el.remove();passed++;return false;});
 }
 const stage=controller?.status();$("phase").textContent=stage?("Fáze "+stage.stage+" · "+stage.mode+" · "+stage.green.join(", ")):"—";$("count").textContent=cars.length;$("passed").textContent=passed;
 renderSignalLights();
 requestAnimationFrame(animate);
}
async function init(){
 const response=await fetch("./projects/massag-4.json",{cache:"no-store"});if(!response.ok)throw Error("Veřejný projekt není dostupný");
 const data=await response.json(),parts=readSvg(data.svg.content);
 signalLocations=locateSignals(parts);
 const network=makeRoadNetwork(parts,data.directions);
 tracks=(data.movements?.movements||[]).filter(m=>m.confirmed).map(m=>makeTrack(network,m)).filter(Boolean);
 conflictZones=buildConflicts();
  signals=[...new Set(tracks.map(t=>t.signal))];if(!signals.length||!tracks.length)throw Error("Chybí potvrzené průjezdy nebo směry");
 const freeTraffic=data.uncontrolledMovements||{};
  freeSignals=new Set(freeTraffic.freeSignals||[]);
  yieldRules=freeTraffic.yieldRules||[];
  const plan={...data.signalPlan,linkedSignals:(data.signalPlan?.linkedSignals||[]).map(g=>g.filter(id=>!freeSignals.has(id))).filter(g=>g.length>1)};
 if(!plan||plan.stages.some(stage=>stage.green.some(signal=>!signals.includes(signal))))throw Error("Chybí platný fázový plán projektu");
 controller=createSignalController(plan);
 controller.setManual($("manual").checked);
 $("manual").onchange=()=>{controller.setManual($("manual").checked);$("state").textContent=$("manual").checked?"Ruční řízení: klikni na semafor.":"Automatické řízení.";};
 if(signals.some(id=>!signalLocations.some(loc=>loc.id===id)))throw Error("V SVG chybí pozice potvrzeného semaforu");
 $("state").textContent="Připraveno: "+tracks.length+" průjezdů";
 $("start").onclick=()=>{running=true;$("state").textContent="Simulace běží";};
 $("pause").onclick=()=>{running=false;$("state").textContent="Pozastaveno";};
 $("reset").onclick=()=>{for(const c of cars)c.el.remove();cars=[];clock=0;phase=0;controller.reset();passed=0;spawnClock=0;running=true;$("state").textContent="Simulace běží";};
 for(const id of ["speed","rate"])$(id).oninput=()=>$(id+"-value").textContent=$(id).value+(id==="speed"?"×":"");
 requestAnimationFrame(animate);
}
init().catch(err=>{$("state").textContent="Chyba: "+err.message;console.error(err);});
