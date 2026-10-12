import {VEHICLE_TYPES,advanceVehicle} from "./vehicle-dynamics.js?v=2.3";
const ns="http://www.w3.org/2000/svg",svg=document.getElementById("scene"),$=id=>document.getElementById(id);
const map=$("map"),photoMap=$("photo-map"),markings=$("markings"),carsLayer=$("vehicles"),lights=$("lights");
let tracks=[],cars=[],passed=0,running=false,clock=0,spawnClock=0,last=0,phase=0,nextId=1,signals=[];
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
 try{const b=map.getBBox();if(b.width>0&&b.height>0){const pad=Math.max(b.width,b.height)*.04;svg.setAttribute("viewBox",[b.x-pad,b.y-pad,b.width+2*pad,b.height+2*pad].join(" "));}}catch{}
 return parts;
}
// Repair oversized Bezier control-point excursions in a working copy only.
// The SVG saved in the intersection project is left intact.
function correctedPath(el){
 if(el.localName!=="path")return el;
 const d=el.getAttribute("d")||"";
 const m=d.match(/^(\s*M\s*)([-+\d.eE]+)[ ,]+([-+\d.eE]+)(\s*C\s*)([-+\d.eE]+)[ ,]+([-+\d.eE]+)[ ,]+([-+\d.eE]+)[ ,]+([-+\d.eE]+)[ ,]+([-+\d.eE]+)[ ,]+([-+\d.eE]+)/);
 if(!m)return el;
 let [x0,y0,c1x,c1y,c2x,c2y,x1,y1]=[m[2],m[3],m[5],m[6],m[7],m[8],m[9],m[10]].map(Number);
 const adjust=(start,end,a,b)=>{
  const span=end-start,lo=Math.min(start,end),hi=Math.max(start,end);
  const overshoot=Math.max(lo-a,a-hi,lo-b,b-hi,0);
  if(Math.abs(span)<12||overshoot<Math.max(12,Math.abs(span)*.3))return[a,b];
  // The first segment must progress in its own direction, without
  // reversing just because an authored control point lies far beyond it.
  return[start+span/3,start+2*span/3];
 };
 [c1x,c2x]=adjust(x0,x1,c1x,c2x);
 [c1y,c2y]=adjust(y0,y1,c1y,c2y);
 if(c1x===Number(m[5])&&c1y===Number(m[6])&&c2x===Number(m[7])&&c2y===Number(m[8]))return el;
 const clone=el.cloneNode(true);
 const corrected=m[1]+m[2]+" "+m[3]+m[4]+[c1x,c1y,c2x,c2y,x1,y1].join(" ");
 clone.setAttribute("d",corrected+d.slice(m[0].length));
 // Retain the original ancestor CTM by replacing the hidden authoring path
 // in place, so sampling and vehicle positions remain in the same system.
 el.replaceWith(clone);
 return clone;
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
  let points=samplePath(correctedPath(el),direction.get(id)==="end-to-start");
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
  const points=network.segment(id,id===movement.entryLane);
  if(!points)return null;
  if(combined.length&&Math.hypot(combined.at(-1).x-points[0].x,combined.at(-1).y-points[0].y)>50)return null;
  if(id===movement.id)approach=combined.length?combined.reduce((acc,p,i,a)=>i?acc+Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y):0,0):0;
  if(id===movement.exitLane)exitStart=combined.length?combined.reduce((acc,p,i,a)=>i?acc+Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y):0,0):0;
  const joining=combined.length?joinPointsSmoothly(combined,points):points;
  if(!joining)return null;
  combined.push(...joining);
 }
 const cumulative=[0];for(let i=1;i<combined.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(combined[i].x-combined[i-1].x,combined[i].y-combined[i-1].y));
 return{id:movement.id,entryLane:movement.entryLane,exitLane:movement.exitLane,entryEnd:approach,exitStart,signal:movement.signal,points:combined,dist:cumulative,length:cumulative.at(-1),stopAt:approach-12};
}
function position(t,s){
 s=Math.max(0,Math.min(t.length,s));let lo=0,hi=t.dist.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(t.dist[mid]<s)lo=mid;else hi=mid;}const a=t.points[lo],b=t.points[hi],f=(s-t.dist[lo])/(t.dist[hi]-t.dist[lo]||1);return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
}
function spawn(){
 if(!tracks.length||cars.length>90)return;
 const t=tracks[Math.floor(Math.random()*tracks.length)];
 if(cars.some(c=>c.track.entryLane===t.entryLane&&c.s<65))return;
 const truck=Math.random()<.09,spec=truck?VEHICLE_TYPES.truck:VEHICLE_TYPES.car;const g=svgEl("g"),body=svgEl("rect",{x:truck?-17:-12,y:truck?-6:-5,width:truck?34:24,height:truck?12:10,rx:2,fill:truck?"#f0c673":["#fff5bf","#e14e5a","#61b9ef","#9ee08e"][Math.floor(Math.random()*4)],stroke:"#172536","stroke-width":1.5});
 g.append(body);carsLayer.append(g);cars.push({id:nextId++,track:t,s:0,v:spec.cruise,length:spec.length,spec,el:g});
}
function lightIsGreen(signal){return signals[phase]===signal&&clock%14<11;}
function animate(now){
 if(!last)last=now;const real=Math.min(.05,(now-last)/1000);last=now;
 if(running){const dt=real*Number($("speed").value);clock+=dt;phase=Math.floor(clock/14)%signals.length;spawnClock+=dt;const interval=2.6/Number($("rate").value)*6;
 while(spawnClock>=interval){spawnClock-=interval;spawn();}
 // Take one consistent snapshot so all vehicles react to the same traffic state.
 const snapshots=cars.map(c=>({...c}));
 for(const car of cars){
  let obstacle=null;
  for(const other of snapshots){
   if(other.id===car.id)continue;
   let delta=Infinity;
   if(other.track===car.track&&other.s>car.s)delta=other.s-car.s;
   if(car.track.entryLane===other.track.entryLane&&car.s<=car.track.entryEnd){
    if(other.s>car.s&&other.s<=other.track.entryEnd+other.length)delta=Math.min(delta,other.s-car.s);
   }
   if(car.track.exitLane===other.track.exitLane&&car.s>=car.track.exitStart-35){
    const otherExit=other.s-other.track.exitStart;
    const ourExit=car.s-car.track.exitStart;
    if(otherExit>ourExit&&otherExit>-other.length)delta=Math.min(delta,otherExit-ourExit);
   }
   const gap=delta-(other.length+car.length)/2;
   if(Number.isFinite(gap)&&(!obstacle||gap<obstacle.gap))obstacle={gap,v:other.v};
  }
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
 $("phase").textContent=signals[phase]||"—";$("count").textContent=cars.length;$("passed").textContent=passed;
 lights.replaceChildren();for(const [i,s]of signals.entries()){const g=svgEl("g",{transform:`translate(${22+i*75} 25)`});g.append(svgEl("circle",{r:8,fill:lightIsGreen(s)?"#31e779":"#ff5050",stroke:"#fff","stroke-width":1}));const t=svgEl("text",{x:12,y:5,fill:"#fff","font-size":15});t.textContent=s;g.append(t);lights.append(g);}
 requestAnimationFrame(animate);
}
async function init(){
 const response=await fetch("./projects/massag-4.json",{cache:"no-store"});if(!response.ok)throw Error("Veřejný projekt není dostupný");
 const data=await response.json(),parts=readSvg(data.svg.content);
 const network=makeRoadNetwork(parts,data.directions);
 tracks=(data.movements?.movements||[]).filter(m=>m.confirmed).map(m=>makeTrack(network,m)).filter(Boolean);
 signals=[...new Set(tracks.map(t=>t.signal))];if(!signals.length||!tracks.length)throw Error("Chybí potvrzené průjezdy nebo směry");
 $("state").textContent="Připraveno: "+tracks.length+" průjezdů";
 $("start").onclick=()=>{running=true;$("state").textContent="Simulace běží";};
 $("pause").onclick=()=>{running=false;$("state").textContent="Pozastaveno";};
 $("reset").onclick=()=>{for(const c of cars)c.el.remove();cars=[];clock=0;phase=0;passed=0;spawnClock=0;running=true;$("state").textContent="Simulace běží";};
 for(const id of ["speed","rate"])$(id).oninput=()=>$(id+"-value").textContent=$(id).value+(id==="speed"?"×":"");
 requestAnimationFrame(animate);
}
init().catch(err=>{$("state").textContent="Chyba: "+err.message;console.error(err);});
