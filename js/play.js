import {VEHICLE_TYPES,advanceVehicle} from "./vehicle-dynamics.js?v=2.5.31";
import {createSignalController} from "./signal-controller.js?v=2.4.3";
const ns="http://www.w3.org/2000/svg",svg=document.getElementById("scene"),$=id=>document.getElementById(id);
const map=$("map"),photoMap=$("photo-map"),markings=$("markings"),carsLayer=$("vehicles"),lights=$("lights");
const APP_VERSION="2.5.31";
const FIXED_DT=0.01;let accumulator=0,dayElapsed=0,spawnBudget=0;let collisionReport=null,selectedCarId=null;let signalsEnabled=false,collisionLocked=false,tracks=[],cars=[],passed=0,running=false,clock=0,spawnClock=0,last=0,phase=0,nextId=1,signals=[],controller=null,signalLocations=[];
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
 return{id:movement.id,roadPriority:(["P03","P04"].includes(movement.entryLane)?"main":"minor"),entryLane:movement.id==="T03"?"P01":movement.entryLane,exitLane:movement.exitLane,entryEnd:approach,exitStart,signal:movement.signal,points:combined,dist:cumulative,length:cumulative.at(-1),stopAt:approach-12};
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

let freeSignals=new Set(),yieldRules=[];
function headingAt(t,s){const a=position(t,Math.max(0,s-8)),b=position(t,Math.min(t.length,s+8)),d=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/d,y:(b.y-a.y)/d};}
function leftTurn(t){const a=headingAt(t,t.entryEnd-10),b=headingAt(t,t.exitStart+10);return a.x*b.y-a.y*b.x<-.25;}
function opposingTracks(a,b){
 if(a===b||a.entryLane===b.entryLane)return false;
 const x=headingAt(a,a.entryEnd-10),y=headingAt(b,b.entryEnd-10);
 return x.x*y.x+x.y*y.y<-.65;
}
// Predict rectangular vehicle occupancy at a common future time. Geometry
// belongs to the route, not to a pre-computed crossing point or exit ID.
function predictedFootprint(car,s,margin=5){
 return vehicleFootprint({...car,s:Math.min(car.track.length,Math.max(0,s))},margin);
}
function overlaps(a,b){
 const dx=b.p.x-a.p.x,dy=b.p.y-a.p.y;
 for(const [x,y] of [[a.ux,a.uy],[a.vx,a.vy],[b.ux,b.uy],[b.vx,b.vy]]){
  const distance=Math.abs(dx*x+dy*y);
  const ra=a.halfL*Math.abs(a.ux*x+a.uy*y)+a.halfW*Math.abs(a.vx*x+a.vy*y);
  const rb=b.halfL*Math.abs(b.ux*x+b.uy*y)+b.halfW*Math.abs(b.vx*x+b.vy*y);
  if(distance>ra+rb)return false;
 }
 return true;
}
// Use the SAME longitudinal dynamics as the live simulation. Predict a
// low-speed launch as well as free acceleration: obstacles ahead may delay
// the yielding vehicle even when its current acceleration looks sufficient.
function predictedProgress(car,t,fromStop=false,conservative=false){
 const ghost={spec:car.spec,s:0,v:fromStop?0:Math.max(0,car.v)};
 const n=Math.ceil(t/.05),dt=n?t/n:0;
 for(let i=0;i<n;i++)advanceVehicle(ghost,null,dt);
 if(!conservative)return ghost.s;
 // A yielding movement starting near its entry can be slowed by traffic
 // ahead; use a more cautious arrival estimate, never faster than free flow.
 const slow={spec:car.spec,s:0,v:fromStop?0:Math.max(0,car.v*.6)};
 for(let i=0;i<n;i++)advanceVehicle(slow,null,dt);
 return Math.min(ghost.s,slow.s*.85);
}
// Cache only static geometric route relationships. Dynamic priority and
// physical positions remain evaluated every simulation step.
const priorityConflictCache=new Map();
function priorityRouteConflict(car,other){
 const key=[car.track.id,other.track.id,car.length,other.length].join("|");
 if(priorityConflictCache.has(key))return priorityConflictCache.get(key);
 const a=car.track,b=other.track;
 const aEnd=Math.min(a.length,a.exitStart+car.length+15);
 const bEnd=Math.min(b.length,b.exitStart+other.length+15);
 let last=-Infinity;
 // Use actual vehicle envelopes along the future swept routes, not the
 // visual width of SVG paths. Include endpoints when stepping.
 for(let x=a.stopAt;x<=aEnd+6;x+=6){
  const af=predictedFootprint(car,Math.min(x,aEnd));
  for(let y=b.stopAt;y<=bEnd+6;y+=6){
   const sy=Math.min(y,bEnd);
   if(overlaps(af,predictedFootprint(other,sy)))last=Math.max(last,sy);
  }
 }
 const result=Number.isFinite(last)?{lastPriorityPosition:last}:null;
 priorityConflictCache.set(key,result);
 return result;
}
function priorityGate(car,snapshot,trace=null){
 const stop=car.track.stopAt;
 // Commitment starts once the front has passed the yield/entry boundary.
 if(car.s>stop+.1){if(trace)trace.gateStatus="Po překročení rozhodovací hranice – přednost se už znovu nevyhodnocuje";return null;}
 const priority=snapshot.filter(other=>{
  if(other.id===car.id)return false;
  // A minor approach yields to ALL main-road movements, including turns.
  if(!signalsEnabled&&car.track.roadPriority==="minor"&&other.track.roadPriority==="main")return true;
  // Among approaches of the same status, left turn yields to opposing
  // through traffic and right turns. Opposing left turns do not claim priority.
  if((signalsEnabled||car.track.roadPriority===other.track.roadPriority)&&leftTurn(car.track)&&opposingTracks(car.track,other.track)&&!leftTurn(other.track))return true;
  return yieldRules.some(rule=>rule.from===car.track.id&&rule.to.includes(other.track.id));
 });
 if(trace){trace.gateStatus="Kontrola přednosti před vjezdem";trace.priorityCandidates=priority.map(c=>({id:c.id,route:c.track.id,s:+c.s.toFixed(1),v:+c.v.toFixed(1)}));}
 if(!priority.length)return null;
 // At the entry line simulate a fresh launch. When approaching the line,
 // use current speed, allowing natural braking before reaching the gate.
 const fromStop=car.v<3;
 const start=Math.min(car.s,stop);
 const end=Math.min(car.track.length,car.track.exitStart+car.length+65);
 const distance=end-start;
 const accel=Math.max(3,car.spec.maxAcceleration*.55);
 const timeToClear=Math.sqrt(2*distance/accel)+distance/Math.max(12,car.spec.cruise)+2;
 const horizon=Math.min(24,Math.max(8,timeToClear+3));
 for(const other of priority){
  // A vehicle held at its own red light cannot claim priority until it
  // enters, whereas a vehicle already past the signal remains relevant.
  if(!lightIsGreen(other.track.signal)&&other.s<other.track.stopAt)continue;
  if(other.s-other.length/2>other.track.length)continue;
  // A priority vehicle which is held up at its own entrance retains
  // priority. Do not exploit its temporarily low current speed to cut
  // across its intended future route. The conflict geometry is independent
  // of the particular junction or SVG exit boundaries.
  const priorityHeld=other.s<=other.track.stopAt+other.length &&
   other.v<other.spec.cruise*.75;
  if(priorityHeld){
   const conflict=priorityRouteConflict(car,other);
   if(conflict && other.s-other.length/2<=conflict.lastPriorityPosition){
    if(trace)trace.blocker={id:other.id,route:other.track.id,rule:"Zpomalující nebo čekající vozidlo s předností na konfliktní trase",prioritySpeed:+other.v.toFixed(2),lastConflictPosition:conflict.lastPriorityPosition};
    return {gap:Math.max(0,stop-car.s),v:0};
   }
  }
  const mainGhost={s:0,v:fromStop?0:car.v,spec:car.spec};
  const cautiousGhost={s:0,v:fromStop?0:car.v*.6,spec:car.spec};
  const otherGhost={s:0,v:other.v,spec:other.spec};
  for(let tick=0;tick<=Math.ceil(horizon/.1);tick++){
   if(tick){advanceVehicle(mainGhost,null,.1);advanceVehicle(cautiousGhost,null,.1);advanceVehicle(otherGhost,null,.1);}
   const t=tick*.1;
   const ownS=Math.min(car.track.length,start+mainGhost.s);
   const cautiousS=Math.min(car.track.length,start+Math.min(mainGhost.s,cautiousGhost.s*.85));
   const otherS=Math.min(other.track.length,other.s+otherGhost.s);
   if(ownS>=end&&cautiousS>=end)break;
   if(overlaps(predictedFootprint(car,ownS),predictedFootprint(other,otherS))||
      overlaps(predictedFootprint(car,cautiousS),predictedFootprint(other,otherS))){
    if(trace)trace.blocker={id:other.id,route:other.track.id,rule:"Předpovězený překryv obrysů vozidel (dynamika, opatrný dojezd)",secondsAhead:+t.toFixed(2),ownPosition:+ownS.toFixed(2),cautiousPosition:+cautiousS.toFixed(2),otherPosition:+otherS.toFixed(2)};
    return {gap:Math.max(0,stop-car.s),v:0};
   }
  }
 }
 if(trace)trace.allowed=true;
 return null;
}
// Diagnostic-only telemetry: each car owns its history while on the map.
const telemetryInterval=.1;
function recordTelemetry(car,reason,obstacle=null,gate=null,force=false){
 if(!car.history)return;
 const tick=Math.floor((clock+1e-8)/telemetryInterval);
 const signal=signalsEnabled?(controller?.state(car.track.signal)||"unknown"):"off";
 const cause=gate&&obstacle===gate?"priority":obstacle?"vehicle-or-signal":"free";
 const state=cause+"|"+signal+"|"+(car.s>car.track.stopAt?"entered":"approach");
 if(!force&&tick===car.lastTelemetryTick&&state===car.lastTelemetryState)return;
 // A state transition is retained immediately; routine positions once per .1s.
 const transition=state!==car.lastTelemetryState;
 if(!force&&!transition&&tick===car.lastTelemetryTick)return;
 const p=position(car.track,car.s);
 car.history.push({t:+clock.toFixed(3),s:+car.s.toFixed(3),v:+car.v.toFixed(3),
  x:+p.x.toFixed(2),y:+p.y.toFixed(2),angle:+p.angle.toFixed(2),
  mode:cause,obstacle:obstacle?{gap:+obstacle.gap.toFixed(3),v:+obstacle.v.toFixed(3)}:null,
  signal,event:force?reason:transition?"change":null});
 car.lastTelemetryTick=tick;car.lastTelemetryState=state;
}
function exportDiagnostics(){
 const payload={version:APP_VERSION,metersPerSvgUnit:0.125,speedLimitKmH:50,clock,signalsEnabled,dayHour:dayHour(),dayElapsed,dayAcceleration:DAY_ACCELERATION,trafficProfile:trafficProfile(dayHour()),intensityMultiplier:Number($("rate").value),collision:collisionReport,
  cars:cars.map(c=>({id:c.id,route:c.track.id,entryLane:c.track.entryLane,
   exitLane:c.track.exitLane,roadPriority:c.track.roadPriority,type:c.spec===VEHICLE_TYPES.truck?"truck":"car",
   length:c.length,enteredAt:c.enteredAt,entryDecision:c.entryDecision||null,history:c.history}))};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="semafory-"+APP_VERSION+"-diagnostika-"+formatTime(clock).replaceAll(":","-")+".json";
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// Hourly cordon OD movements for profiles {1,2}<->{4,5}, 7:00–17:00.
// All 10 measured values are a RELATIVE temporal shape, not absolute
// Massag traffic counts. Outside that window the curve is an estimate.
const CORDON_HOURLY=Object.freeze([187,163,151,128,113,151,152,230,234,183]);
const CORDON_AVG=CORDON_HOURLY.reduce((a,b)=>a+b,0)/CORDON_HOURLY.length;
// One real second advances the daily clock by two minutes: 24h = 12 minutes.
const DAY_HOURS=24,REAL_DAY_SECONDS=720,DAY_ACCELERATION=DAY_HOURS*3600/REAL_DAY_SECONDS;
function startingHour(){
 const [h,m]=($("start-time")?.value||"07:00").split(":").map(Number);
 return Number.isFinite(h)&&Number.isFinite(m)?(h+m/60)%24:7;
}
function dayHour(){
 return (startingHour()+dayElapsed*DAY_ACCELERATION/3600)%24;
}
function trafficProfile(hour){
 // Empirical measured 07–17; off-period coefficients intentionally
 // estimated (no claim of having surveyed evening/night Massag traffic).
 const shape=[.22,.14,.10,.09,.12,.23,.55,...CORDON_HOURLY.map(n=>n/CORDON_AVG),.68,.57,.46,.37,.32,.27,.24];
 const i=Math.floor(hour)%24,f=hour-i;
 return shape[i]*(1-f)+shape[(i+1)%24]*f;
}
function updateDayClock(){
 const h=dayHour(),hours=Math.floor(h),minutes=Math.floor((h-hours)*60);
 const el=$("day-time");if(el)el.textContent=String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0");
 const mul=$("current-profile");if(mul)mul.textContent=trafficProfile(h).toFixed(2)+"×";
}
const TRAFFIC_SURVEY_MOVEMENTS=Object.freeze({T01:2356,T02:2077,T03:1323,T04:1767,T05:779,T06:758});
function sampleTrafficMovement(options=tracks){
 const total=options.reduce((sum,t)=>sum+(TRAFFIC_SURVEY_MOVEMENTS[t.id]||0),0);
 if(total<=0)return options[Math.floor(Math.random()*options.length)];
 let draw=Math.random()*total;
 for(const track of options){draw-=TRAFFIC_SURVEY_MOVEMENTS[track.id]||0;if(draw<0)return track;}
 return options[options.length-1];
}
function spawn(){
 if(!tracks.length||cars.length>90)return;
 // Observed directional traffic counts at Massag, survey April 2018.
 const available=tracks.filter(t=>!cars.some(c=>c.track.entryLane===t.entryLane&&c.s-c.length/2<65));
 if(!available.length)return false;
 const t=sampleTrafficMovement(available);
 const truck=Math.random()<.09,spec=truck?VEHICLE_TYPES.truck:VEHICLE_TYPES.car;const g=svgEl("g"),body=svgEl("rect",{x:-spec.length/2,y:-spec.width/2,width:spec.length,height:spec.width,rx:2,fill:truck?"#f0c673":["#fff5bf","#e14e5a","#61b9ef","#9ee08e"][Math.floor(Math.random()*4)],stroke:"#172536","stroke-width":1.5});
 g.append(body);g.append(svgEl("rect",{x:-spec.length/2-6,y:-spec.width/2-8,width:spec.length+12,height:spec.width+16,fill:"transparent","pointer-events":"all"}));carsLayer.append(g);const car={id:nextId++,track:t,s:0,v:spec.cruise,length:spec.length,spec,el:g,
  enteredAt:clock,history:[],lastTelemetryTick:-1,lastTelemetryState:""};
 car.el.style.cursor="pointer";car.el.addEventListener("click",e=>{e.stopPropagation();selectedCarId=car.id;updateInspector();});
 cars.push(car);recordTelemetry(car,"spawn",null,null,true);return true;
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
 if(!signalsEnabled){lights.replaceChildren();signalVisuals.clear();return;}
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
 if(!signalsEnabled||!controller||freeSignals.has(id))return;
 if(!$("manual").checked){$("state").textContent="Nejprve zapni ruční ovládání.";return;}
 const ok=controller.requestSignal(id);
 $("state").textContent=ok?"Vyžádána zelená pro "+id+" (bezpečné přepnutí).":"Tento semafor už má zelenou.";
}
function lightIsGreen(signal){return freeSignals.has(signal)||controller?.state(signal)==="green";}
function updateInspector(){
 const panel=$("vehicle-inspector"),car=cars.find(c=>c.id===selectedCarId);
 const selector=$("inspect-select");
 const ids=cars.map(c=>c.id).join(",");
 if(selector.dataset.ids!==ids){selector.replaceChildren();for(const c of cars){const opt=document.createElement("option");opt.value=c.id;opt.textContent="#"+c.id+" · "+c.track.id+" · "+(c.v<2?"stojí":"jede");selector.append(opt);}selector.dataset.ids=ids;}
 if(!car){panel.hidden=true;return;}
 panel.hidden=false;selector.value=String(car.id);
 const d=car.liveInspection||{},block=d.blocker||null,active=d.activeObstacle||null;
 $("inspect-title").textContent="Vozidlo "+car.id+" · "+car.track.id+" · "+(car.track.roadPriority==="main"?"hlavní":"vedlejší");
 $("inspect-info").textContent="Čas "+formatTime(clock)+" | rychlost "+car.v.toFixed(2)+" | poloha "+car.s.toFixed(2)+" / "+car.track.length.toFixed(1)+" | rozhodovací hranice "+car.track.stopAt.toFixed(2);
 $("inspect-status").textContent=active?"Aktuálně omezuje: "+active.rule+(active.id?" · auto "+active.id+" ("+active.route+")":""):"Aktuálně bez omezení";
 $("inspect-detail").textContent=(d.gateStatus||"Zatím bez výpočtu přednosti")+
  (block?"\\n\\nPŘEDNOST BLOKUJE: "+JSON.stringify(block,null,2):"\\nPřednost nyní neblokuje vjezd.")+
  (d.priorityCandidates?"\\n\\nVozidla posuzovaná pro přednost: "+d.priorityCandidates.map(c=>"#"+c.id+" "+c.route+" (s="+c.s+", v="+c.v+")").join("; "):"")+
  (d.obstacle?"\\n\\nÚčinná překážka: "+JSON.stringify(d.obstacle):"");
}
function formatTime(seconds){const n=Math.floor(seconds);return String(Math.floor(n/3600)).padStart(2,"0")+":"+String(Math.floor(n/60)%60).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
function animate(now){
 if(!last)last=now;const real=Math.min(.05,(now-last)/1000);last=now;
 if(running){accumulator+=real*Number($("speed").value);dayElapsed+=real;}
 updateDayClock();
 while(running&&accumulator>=FIXED_DT){const dt=FIXED_DT;accumulator-=FIXED_DT;clock+=dt;if(signalsEnabled)controller.tick(dt,active=>cars.some(c=>!freeSignals.has(c.track.signal)&&active.includes(c.track.signal)&&c.s>=c.track.stopAt&&c.s<c.track.exitStart+c.length));// Traffic clock runs 24h/12min, but the vehicle density must scale with
 // PHYSICAL simulation time. The old /speed term reduced density at 5×.
 // A multiplier of 1× uses a calibrated visual arrival rate (~1.3 veh/s
 // near the reference hour), not a literal 24h volume in 12 minutes.
 const currentRate=1.3*trafficProfile(dayHour())*Number($("rate").value);
 spawnBudget=Math.min(6,spawnBudget+dt*currentRate);
 while(spawnBudget>=1){if(!spawn())break;spawnBudget-=1;}
 // Take one consistent snapshot so all vehicles react to the same traffic state.
 const snapshots=cars.map(c=>({...c}));
 for(const car of cars){
  let obstacle=null;
  const inspect=car.id===selectedCarId?{t:clock,vehicle:car.id,route:car.track.id,road:car.track.roadPriority,s:car.s,v:car.v,stopAt:car.track.stopAt}:null;
  let obstacleSource=null;
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
      if(!obstacle||clearance<obstacle.gap){obstacle={gap:clearance,v:other.v};if(inspect)obstacleSource={rule:"Geometrické následování ve společném příjezdu",id:other.id,route:other.track.id};}
     }
    }
   }
   // Follow an already merging vehicle BEFORE either route reaches its
   // separately authored exitStart marker. Both routes join the same lane;
   // the car physically ahead must be treated as a leader, even if it
   // began the turn earlier or on another route. No priority rule changes.
   if(car.track!==other.track&&car.track.exitLane===other.track.exitLane&&
      car.s>=car.track.exitStart-105&&other.s>=other.track.exitStart-105){
    const p=position(car.track,car.s),q=position(other.track,other.s);
    const a=p.angle*Math.PI/180,b=q.angle*Math.PI/180;
    const ux=Math.cos(a),uy=Math.sin(a),vx=-uy,vy=ux;
    const dx=q.x-p.x,dy=q.y-p.y;
    const ahead=dx*ux+dy*uy;
    const side=Math.abs(dx*vx+dy*vy);
    const aligned=Math.cos(a-b)>.7;
    if(aligned&&ahead>0&&ahead<Math.max(120,car.v*3)&&
       side<Math.max(23,(car.spec.width+other.spec.width)/2+7)){
     delta=Math.min(delta,ahead);
    }
   }
   if(car.track.exitLane===other.track.exitLane&&car.s>=car.track.exitStart&&other.s>=other.track.exitStart){
    const otherExit=other.s-other.track.exitStart;
    const ourExit=car.s-car.track.exitStart;
    if(otherExit>ourExit&&otherExit>-other.length)delta=Math.min(delta,otherExit-ourExit);
   }
   const gap=delta-(other.length+car.length)/2;
   if(Number.isFinite(gap)&&(!obstacle||gap<obstacle.gap)){obstacle={gap,v:other.v};if(inspect)obstacleSource={rule:"Následování v jízdním pruhu",id:other.id,route:other.track.id};}
  }
  // Physical follower envelope independent of route identities.
  const ownFoot=vehicleFootprint(car,1);
  for(const other of snapshots){
   if(other.id===car.id)continue;
   // Only follow a vehicle belonging to the same physical stream.
   // A crossing priority vehicle is NOT a leader on this lane; yielding
   // was already decided before the junction entry.
   const sameMovement=car.track===other.track;
   const commonApproach=car.track.entryLane===other.track.entryLane&&car.s<car.track.entryEnd&&other.s<other.track.entryEnd;
   const commonExit=car.track.exitLane===other.track.exitLane&&car.s>=car.track.exitStart&&other.s>=other.track.exitStart;
   if(!sameMovement&&!commonApproach&&!commonExit)continue;
   const p=ownFoot.p,q=position(other.track,other.s);
   const forward=(q.x-p.x)*ownFoot.ux+(q.y-p.y)*ownFoot.uy;
   const sideways=Math.abs((q.x-p.x)*ownFoot.vx+(q.y-p.y)*ownFoot.vy);
   if(forward<=0||forward>Math.max(85,car.v*2.2)||sideways>13)continue;
   const clearance=footprintClearance(ownFoot,vehicleFootprint(other,1));
   if(clearance<Math.max(12,car.v*1.25)){
    const candidate={gap:Math.max(0,clearance),v:other.v};
    if(!obstacle||candidate.gap<obstacle.gap){obstacle=candidate;if(inspect)obstacleSource={rule:"Fyzická vzdálenost za vozidlem",id:other.id,route:other.track.id};}
   }
  }
  const beforeEntry=car.s<=car.track.stopAt+.1;
  const gateTrace=beforeEntry?{t:clock,vehicle:car.id,route:car.track.id,position:+car.s.toFixed(3),speed:+car.v.toFixed(3)}:null;
  const gate=priorityGate(car,snapshots,gateTrace);
  if(inspect&&gateTrace)Object.assign(inspect,gateTrace);
  if(gate&&(!obstacle||gate.gap<obstacle.gap)){obstacle=gate;if(inspect)obstacleSource={rule:"Dávání přednosti",...(inspect.blocker||{})};}
   // A red signal acts like a stationary lead vehicle at the stop line.
  if(!lightIsGreen(car.track.signal)&&car.s<car.track.stopAt){
   const gap=car.track.stopAt-car.s;
   if(!obstacle||gap<obstacle.gap){obstacle={gap,v:0};if(inspect)obstacleSource={rule:"Červený signál",signal:car.track.signal};}
  }
  if(inspect){inspect.activeObstacle=obstacleSource;inspect.obstacle=obstacle?{gap:obstacle.gap,velocity:obstacle.v}:null;car.liveInspection=inspect;}
  const previousS=car.s;
  advanceVehicle(car,obstacle,dt);
  if(previousS<=car.track.stopAt+.1&&car.s>car.track.stopAt+.1){
   car.entryDecision={...gateTrace,t:+clock.toFixed(3),crossedAt:+car.s.toFixed(3),crossingSpeed:+car.v.toFixed(3),effectiveObstacle:obstacleSource||null,priorityGateBlocked:!!gate};
  }
  recordTelemetry(car,"step",obstacle,gate);
 }
 // Detect overlap of real oriented body rectangles, not buffered prediction footprints.
 // Reuse the identical oriented footprint for every pair in this step.
 const bodies=cars.map(c=>vehicleFootprint(c,0));
 let collision=null;
 outer:for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
  if(overlaps(bodies[i],bodies[j])){
   collision=[cars[i],cars[j]];break outer;
  }
 }
 if(collision){
  for(const c of cars)recordTelemetry(c,"collision",null,null,true);
  running=false;collisionLocked=true;
  const detail=collision.map(c=>{
   const before=snapshots.find(v=>v.id===c.id);
   const p=position(c.track,c.s);
   return {id:c.id,route:c.track.id,priority:c.track.roadPriority,entry:c.track.entryLane,exit:c.track.exitLane,position:Math.round(c.s*100)/100,speed:Math.round(c.v*100)/100,x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100,before:{position:before.s,speed:before.v},stopAt:c.track.stopAt,entryEnd:c.track.entryEnd,exitStart:c.track.exitStart};
  });
  collisionReport={time:clock,signalsEnabled,detail};
  console.warn("Semafory collision diagnostics",collisionReport);
  $("diagnostics").textContent=JSON.stringify(collisionReport,null,2);
  $("diagnostics").hidden=false;
  $("state").textContent="KOLIZE – běh zastaven, vozidla "+collision[0].id+" ("+collision[0].track.id+") a "+collision[1].id+" ("+collision[1].track.id+") · čas "+formatTime(clock);
 }
 cars=cars.filter(c=>{if(c.s<c.track.length)return true;c.el.remove();passed++;return false;});
 }
 // Rendering happens once per animation frame, not hundreds of times per
 // real second. The simulation itself retains exactly the same 10 ms steps.
 for(const car of cars){
  const p=position(car.track,car.s);
  car.el.setAttribute("transform",`translate(${p.x} ${p.y}) rotate(${p.angle})`);
 }
 for(const c of cars){const rect=c.el.firstElementChild;rect.setAttribute("stroke",c.id===selectedCarId?"#ffff00":"#172536");rect.setAttribute("stroke-width",c.id===selectedCarId?"3.8":"1.5");}
 updateInspector();
 const stage=controller?.status();$("phase").textContent=signalsEnabled?(stage?"Semafory · fáze "+stage.stage+" · "+stage.mode:"Semafory"):"Bez semaforů · hlavní / vedlejší";$("elapsed").textContent=formatTime(clock);$("count").textContent=cars.length;$("passed").textContent=passed;
 renderSignalLights();
 requestAnimationFrame(animate);
}
async function init(){
 const response=await fetch("./projects/massag-4.json",{cache:"no-store"});if(!response.ok)throw Error("Veřejný projekt není dostupný");
 const data=await response.json(),parts=readSvg(data.svg.content);
 signalLocations=locateSignals(parts);
 const network=makeRoadNetwork(parts,data.directions);
 tracks=(data.movements?.movements||[]).filter(m=>m.confirmed).map(m=>makeTrack(network,m)).filter(Boolean);

  signals=[...new Set(tracks.map(t=>t.signal))];if(!signals.length||!tracks.length)throw Error("Chybí potvrzené průjezdy nebo směry");
 const freeTraffic=data.uncontrolledMovements||{};
  freeSignals=new Set(tracks.map(t=>t.signal)); // Unsignalized mode by default
  yieldRules=freeTraffic.yieldRules||[];
  const plan={...data.signalPlan,linkedSignals:(data.signalPlan?.linkedSignals||[]).map(g=>g.filter(id=>!freeSignals.has(id))).filter(g=>g.length>1)};
 if(!plan||plan.stages.some(stage=>stage.green.some(signal=>!signals.includes(signal))))throw Error("Chybí platný fázový plán projektu");
 controller=createSignalController(plan);
 controller.setManual($("manual").checked);
 $("manual").onchange=()=>{controller.setManual($("manual").checked);$("state").textContent=$("manual").checked?"Ruční řízení: klikni na semafor.":"Automatické řízení.";};
 if(signals.some(id=>!signalLocations.some(loc=>loc.id===id)))throw Error("V SVG chybí pozice potvrzeného semaforu");
 $("state").textContent="Bez semaforů: hlavní Dukelská–Nová cesta · "+tracks.length+" průjezdů";
 $("signals-enabled").onchange=()=>{
  signalsEnabled=$("signals-enabled").checked;accumulator=0;
  freeSignals=signalsEnabled?new Set(freeTraffic.freeSignals||[]):new Set(tracks.map(t=>t.signal));
  controller.reset();
  $("state").textContent=signalsEnabled?"Semafory zapnuté – konfigurace projektu":"Semafory vypnuté – přednost hlavní / vedlejší";
  renderSignalLights();
 };
 $("start").onclick=()=>{if(collisionLocked){$("state").textContent="Po kolizi spusť novou simulaci.";return;}running=true;$("state").textContent="Simulace běží";};
 $("pause").onclick=()=>{running=false;$("state").textContent="Pozastaveno";};
 $("export-diagnostics").onclick=exportDiagnostics;
 $("inspect-toggle").onclick=()=>{if(selectedCarId!==null&&!$("vehicle-inspector").hidden){selectedCarId=null;updateInspector();return;}selectedCarId=(cars.find(c=>c.v<2)||cars[0])?.id??null;updateInspector();};
 $("inspect-select").onchange=()=>{selectedCarId=Number($("inspect-select").value);updateInspector();};
 $("reset").onclick=()=>{for(const c of cars)c.el.remove();cars=[];selectedCarId=null;clock=0;accumulator=0;dayElapsed=0;spawnBudget=0;collisionLocked=false;collisionReport=null;$("diagnostics").hidden=true;phase=0;controller.reset();passed=0;spawnClock=0;running=true;$("state").textContent="Simulace běží";};
 for(const id of ["speed","rate"])$(id).oninput=()=>$(id+"-value").textContent=$(id).value+"×";
 $("start-time").onchange=()=>{if(!running&&clock===0)updateDayClock();};
 updateDayClock();
 requestAnimationFrame(animate);
}
init().catch(err=>{$("state").textContent="Chyba: "+err.message;console.error(err);});
