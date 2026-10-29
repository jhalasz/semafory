import {VEHICLE_TYPES,advanceVehicle} from "./vehicle-dynamics.js?v=2.6.14";
import {createSignalController} from "./signal-controller.js?v=2.4.3";
import {projectStore} from "./project-store.js?v=1.7";
const ns="http://www.w3.org/2000/svg",svg=document.getElementById("scene"),$=id=>document.getElementById(id);
const map=$("map"),photoMap=$("photo-map"),markings=$("markings"),carsLayer=$("vehicles"),lights=$("lights");
const APP_VERSION="2.6.23";
const FIXED_DT=0.01;let accumulator=0,dayElapsed=0,spawnBudget=0;let collisionReport=null,selectedCarId=null;let signalsEnabled=false,collisionLocked=false,tracks=[],cars=[],passed=0,routeStats=new Map(),running=false,clock=0,spawnClock=0,last=0,phase=0,nextId=1,signals=[],controller=null,signalLocations=[];let activeProject=null,activeGameConfig={},projectCatalog=[];
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
 // Builder 2.6.4 excludes large white export-page rectangles from its map.
 // The player must do the same; otherwise the original SVG tree paints
 // white slide blocks on top of the aerial image.
 const pageNumbers=(root.getAttribute("viewBox")||"").trim().split(/[\s,]+/).map(Number);
 const page=pageNumbers.length===4&&pageNumbers.every(Number.isFinite)
  ?{x:pageNumbers[0],y:pageNumbers[1],width:pageNumbers[2],height:pageNumbers[3]}
  :{x:0,y:0,width:parseFloat(root.getAttribute("width"))||1280,height:parseFloat(root.getAttribute("height"))||720};
 for(const rect of [...nativeRoot.querySelectorAll("rect")]){
  const fill=(rect.getAttribute("fill")||((rect.getAttribute("style")||"").match(/fill:\s*([^;]+)/)||[])[1]||"").replace(/\s+/g,"").toLowerCase();
  if(!["#fff","#ffffff","white","rgb(255,255,255)"].includes(fill))continue;
  const x=Number(rect.getAttribute("x"))||0,y=Number(rect.getAttribute("y"))||0;
  const width=Number(rect.getAttribute("width")),height=Number(rect.getAttribute("height"));
  if(!(width>0&&height>0))continue;
  const tolerance=Math.max(page.width,page.height)*.002;
  const fullPage=Math.abs(x-page.x)<=tolerance&&Math.abs(y-page.y)<=tolerance&&
   Math.abs(width-page.width)<=tolerance&&Math.abs(height-page.height)<=tolerance;
  // Oversized plain-white rectangles in PowerPoint exports can also be
  // partial page backgrounds. Small white road markings remain untouched.
  const stroke=(rect.getAttribute("stroke")||"").toLowerCase();
  const largeBlank=width>page.width*.15&&height>page.height*.15&&
   width*height>page.width*page.height*.025&&(!stroke||stroke==="none");
  if(fullPage||largeBlank)rect.remove();
 }
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
   rect.setAttribute("href",href);rect.setAttribute("transform",`matrix(${[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].join(" ")})`);
   // The export clips the photograph inside transformed parent groups.
   // The standalone image has no parents, so reproduce their outer clipping.
   // Without this, hidden photo content spills far below the Builder crop.
   const clippedAncestor=[...function*(){for(let n=use.parentElement;n&&n!==root;n=n.parentElement)yield n;}()]
    .reverse().find(n=>n.hasAttribute("clip-path"));
   if(clippedAncestor){
    const match=(clippedAncestor.getAttribute("clip-path")||"").match(/url\(#([^)]*)\)/);
    const sourceClip=match&&[...root.querySelectorAll("clipPath")].find(n=>n.id===match[1]);
    const bounds=sourceClip?.querySelector("rect");
    if(bounds){
     let clipMatrix=new DOMMatrix();
     const chain=[];for(let n=clippedAncestor;n&&n!==root;n=n.parentElement)if(n.hasAttribute("transform"))chain.unshift(n.getAttribute("transform"));
     for(const transform of chain){
      for(const op of transform.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)){
       const nums=(op[2].match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)||[]).map(Number);
       if(op[1]==="matrix"&&nums.length===6)clipMatrix=clipMatrix.multiply(new DOMMatrix(nums));
       else if(op[1]==="translate")clipMatrix=clipMatrix.translate(nums[0]||0,nums[1]||0);
       else if(op[1]==="scale")clipMatrix=clipMatrix.scale(nums[0]??1,nums[1]??nums[0]??1);
       else if(op[1]==="rotate")clipMatrix=clipMatrix.rotate(nums[0]||0);
      }
     }
     const clipId="game-photo-crop";
     const clip=svgEl("clipPath",{id:clipId,clipPathUnits:"userSpaceOnUse"});
     const mask=svgEl("rect",{x:bounds.getAttribute("x")||0,y:bounds.getAttribute("y")||0,width:bounds.getAttribute("width"),height:bounds.getAttribute("height")});
     mask.setAttribute("transform",`matrix(${[clipMatrix.a,clipMatrix.b,clipMatrix.c,clipMatrix.d,clipMatrix.e,clipMatrix.f].join(" ")})`);
     clip.append(mask);$("defs").append(clip);
     photoMap.setAttribute("clip-path",`url(#${clipId})`);
     // Store the *visible clipped photo rectangle*, not the full embedded
     // photograph. The saved Builder viewport may include hidden content.
     const x=Number(bounds.getAttribute("x"))||0,y=Number(bounds.getAttribute("y"))||0;
     const w=Number(bounds.getAttribute("width")),h=Number(bounds.getAttribute("height"));
     if(w>0&&h>0){
      const corners=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]]
       .map(([cx,cy])=>new DOMPoint(cx,cy).matrixTransform(clipMatrix));
      const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));
      const right=Math.max(...corners.map(p=>p.x)),bottom=Math.max(...corners.map(p=>p.y));
      if([left,top,right,bottom].every(Number.isFinite))
       svg.dataset.photoCrop=[left,top,right-left,bottom-top].join(" ");
     }
    }
   }
   photoMap.append(rect);
  }
 }
 // Hide configuration markup; movement remains aligned in the same coordinates.
 for(const k of ["lane","route","boundary","signal"])for(const n of parts[k])n.setAttribute("visibility","hidden");
 // Use exactly the Builder's crop algorithm on the imported SVG layers.
 // Crucially, the photo's bounds alone are NOT the Builder's viewport.
 // This measurement layer is temporary and does not affect game rendering.
 const measuring=svgEl("g",{visibility:"hidden","pointer-events":"none"});
 svg.append(measuring);
 const cropGroups=new Map();
 const cropCategories=["photo","beautified","markings","lanes","routes","entry","signals","other"];
 for(const name of cropCategories){const g=svgEl("g");measuring.append(g);cropGroups.set(name,g);}
 function cropCategory(node){
  const kind=category(node);
  return {lane:"lanes",route:"routes",boundary:"entry",signal:"signals",markings:"markings"}[kind]||"photo";
 }
 function whitePageRect(node){
  if(node.localName!=="rect")return false;
  const fill=(node.getAttribute("fill")||((node.getAttribute("style")||"").match(/fill:\s*([^;]+)/)||[])[1]||"").replace(/\s+/g,"").toLowerCase();
  if(!["#fff","#ffffff","white","rgb(255,255,255)"].includes(fill))return false;
  const x=Number(node.getAttribute("x"))||0,y=Number(node.getAttribute("y"))||0;
  const w=Number(node.getAttribute("width")),h=Number(node.getAttribute("height"));
  const tol=Math.max(page.width,page.height)*.002;
  return w>0&&h>0&&Math.abs(x-page.x)<=tol&&Math.abs(y-page.y)<=tol&&
   Math.abs(w-page.width)<=tol&&Math.abs(h-page.height)<=tol;
 }
 function measureNode(node,parents){
  if(node.localName==="defs"||node.localName==="clipPath")return;
  if(node.localName==="g"){for(const c of node.children)measureNode(c,[...parents,node]);return;}
  if(!["path","image","rect","circle","ellipse","line","polyline","polygon","use","text"].includes(node.localName)||whitePageRect(node))return;
  let dest=cropGroups.get(cropCategory(node));
  for(const parent of parents){
   const group=svgEl("g");
   for(const a of parent.attributes)if(["transform","opacity","clip-path"].includes(a.name))group.setAttribute(a.name,a.value);
   dest.append(group);dest=group;
  }
  dest.append(document.importNode(node,true));
 }
 try{
  for(const node of root.children)measureNode(node,[]);
  const boxes=[];
  for(const group of cropGroups.values()){
   if(!group.childElementCount)continue;
   const b=group.getBBox();
   if(b.width>0&&b.height>0&&[b.x,b.y,b.width,b.height].every(Number.isFinite))boxes.push(b);
  }
  if(boxes.length){
   const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y));
   const maxX=Math.max(...boxes.map(b=>b.x+b.width)),maxY=Math.max(...boxes.map(b=>b.y+b.height));
   const w=maxX-minX,h=maxY-minY,pad=Math.max(w,h)*.02;
   if(w>0&&h>0){
    const box=[minX-pad,minY-pad,w+2*pad,h+2*pad];
    svg.setAttribute("viewBox",box.join(" "));
    svg.style.aspectRatio=box[2]+"/"+box[3];
    svg.parentElement.style.setProperty("--map-aspect",box[2]+"/"+box[3]);
    svg.parentElement.style.setProperty("--map-ratio",String(box[2]/box[3]));
   }
  }
 }catch(error){console.warn("Builder-compatible SVG crop failed",error);}
 finally{measuring.remove();}
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
 const shared=(activeGameConfig.sharedApproaches||[]).find(x=>x?.movement===movement.id&&(!x.branchLane||x.branchLane===movement.entryLane))||null;
 for(const id of [movement.entryLane,movement.id,movement.exitLane]){
  let points=network.segment(id,id===movement.entryLane);
  if(!points)return null;
  // Shared physical approaches are intersection data, not hard-coded game logic.
  if(shared&&id===movement.entryLane&&shared.commonLane){
   const common=network.segment(shared.commonLane,true);
   if(common){
    const fork=points[0];let nearest=0,best=Infinity;
    for(let j=0;j<common.length;j++){
     const d=Math.hypot(common[j].x-fork.x,common[j].y-fork.y);
     if(d<best){best=d;nearest=j;}
    }
    const limit=Number(shared.maxJoinDistance)||45;
    if(best<limit&&nearest>3){
     const prefix=common.slice(0,nearest+1);
     const transition=joinPointsSmoothly(prefix,points);
     if(transition)points=prefix.concat(transition);
    }
   }
  }
  if(combined.length&&Math.hypot(combined.at(-1).x-points[0].x,combined.at(-1).y-points[0].y)>50)return null;
  if(id===movement.id)approach=combined.length?combined.reduce((acc,p,i,x)=>i?acc+Math.hypot(p.x-x[i-1].x,p.y-x[i-1].y):0,0):0;
  if(id===movement.exitLane)exitStart=combined.length?combined.reduce((acc,p,i,x)=>i?acc+Math.hypot(p.x-x[i-1].x,p.y-x[i-1].y):0,0):0;
  const joining=combined.length?joinPointsSmoothly(combined,points):points;
  if(!joining)return null;
  combined.push(...joining);
 }
 const cumulative=[0];for(let i=1;i<combined.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(combined[i].x-combined[i-1].x,combined[i].y-combined[i-1].y));
 const physicalEntryLane=shared?.commonLane||movement.entryLane;
 const roadPriority=activeGameConfig.roadPriorityByMovement?.[movement.id]||
  activeGameConfig.roadPriorityByLane?.[physicalEntryLane]||
  activeGameConfig.roadPriorityByLane?.[movement.entryLane]||"equal";
 return{id:movement.id,roadPriority,entryLane:physicalEntryLane,authoredEntryLane:movement.entryLane,exitLane:movement.exitLane,entryEnd:approach,exitStart,signal:movement.signal||null,points:combined,dist:cumulative,length:cumulative.at(-1),stopAt:approach-12};
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

let freeSignals=new Set(),yieldRules=[],freeTraffic={};
function headingAt(t,s){const a=position(t,Math.max(0,s-8)),b=position(t,Math.min(t.length,s+8)),d=Math.hypot(b.x-a.x,b.y-a.y)||1;return{x:(b.x-a.x)/d,y:(b.y-a.y)/d};}
function leftTurn(t){const a=headingAt(t,t.entryEnd-10),b=headingAt(t,t.exitStart+10);return a.x*b.y-a.y*b.x<-.25;}
function opposingTracks(a,b){
 if(a===b||a.entryLane===b.entryLane)return false;
 const x=headingAt(a,a.entryEnd-10),y=headingAt(b,b.entryEnd-10);
 return x.x*y.x+x.y*y.y<-.65;
}
function opposedLeftTurns(a,b){
 return leftTurn(a)&&leftTurn(b)&&opposingTracks(a,b);
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
 let last=-Infinity,first=Infinity,firstOwn=Infinity;
 // Use actual vehicle envelopes along the future swept routes, not the
 // visual width of SVG paths. Include endpoints when stepping.
 for(let x=a.stopAt;x<=aEnd+6;x+=6){
  const af=predictedFootprint(car,Math.min(x,aEnd));
  for(let y=b.stopAt;y<=bEnd+6;y+=6){
   const sy=Math.min(y,bEnd);
   if(overlaps(af,predictedFootprint(other,sy))){last=Math.max(last,sy);first=Math.min(first,sy);firstOwn=Math.min(firstOwn,x);}
  }
 }
 const result=Number.isFinite(last)?{firstPriorityPosition:first,lastPriorityPosition:last,firstOwnPosition:firstOwn}:null;
 priorityConflictCache.set(key,result);
 return result;
}
// The last non-conflicting waiting position for a left turn. The position
// is determined from swept vehicle envelopes, not from Massag route IDs.
// An uncontrolled minor-road turn stays at the entry line if advancing would
// conflict with main-road flows from other directions.
const innerWaitCache=new Map();
function waitingPosition(track,spec){
 const key=track.id+"|"+spec.length+"|"+spec.width+"|"+(signalsEnabled?"light":"priority");
 if(innerWaitCache.has(key))return innerWaitCache.get(key);
 let wait=track.stopAt;
 if(leftTurn(track)){
  const sample={track,length:spec.length,spec,s:wait};
  let first=Infinity;
  for(const other of tracks){
   if(other===track||other.entryLane===track.entryLane)continue;
   const opposed=opposingTracks(track,other)&&!opposedLeftTurns(track,other);
   const mainConflict=!signalsEnabled&&track.roadPriority==="minor"&&other.roadPriority==="main";
   if(!opposed&&!mainConflict)continue;
   const otherSpec=VEHICLE_TYPES.truck; // use larger envelope to be conservative
   const contender={track:other,length:otherSpec.length,spec:otherSpec,s:0};
   const targetEnd=Math.min(track.length,track.exitStart+spec.length);
   const otherEnd=Math.min(other.length,other.exitStart+otherSpec.length);
   outer:for(let p=track.stopAt;p<=targetEnd;p+=3){
    for(let q=other.stopAt;q<=otherEnd;q+=5){
     if(overlaps(predictedFootprint(sample,p,1),predictedFootprint(contender,q,1))){
      first=Math.min(first,p);break outer;
     }
    }
   }
  }
  // Stand BEFORE the first conflicting body position. The additional
  // clearance also gives the controller a proper braking buffer.
  if(Number.isFinite(first)&&first>track.stopAt+spec.length*.6){
   wait=Math.max(track.stopAt,first-10);
  }
 }
 innerWaitCache.set(key,wait);
 return wait;
}
function priorityApplies(a,b){
 if(a===b)return false;
 if(!signalsEnabled&&a.roadPriority==="minor"&&b.roadPriority==="main")return true;
 if((signalsEnabled||a.roadPriority===b.roadPriority)&&
    leftTurn(a)&&opposingTracks(a,b)&&!leftTurn(b))return true;
 return yieldRules.some(rule=>rule.from===a.id&&rule.to.includes(b.id));
}
// Signalised ordinary green: left turns yield to oncoming through/right
// traffic at each geometrically separate body-envelope conflict. This is
// independent of intersection IDs, streets and SVG scale.
const signalLeftStageCache=new Map();
function signalLeftStages(track,spec){
 const key=[track.id,spec.length,spec.width].join("|");
 if(signalLeftStageCache.has(key))return signalLeftStageCache.get(key);
 const conflicts=[];
 const own={track,spec,length:spec.length};
 const begin=track.stopAt;
 const end=Math.min(track.length,track.exitStart+spec.length+25);
 for(const other of tracks){
  if(!opposingTracks(track,other)||leftTurn(other))continue;
  // Use the largest actual vehicle category in this movement: yielding
  // positions must also be safe when a truck is oncoming.
  const os=VEHICLE_TYPES.truck,ghost={track:other,spec:os,length:os.length};
  const intervals=[];
  let opened=null,last=null;
  for(let p=begin;p<=end+2;p+=2){
   const ownFoot=predictedFootprint(own,Math.min(p,end),1);
   let collision=false;
   for(let q=other.stopAt;q<=Math.min(other.length,other.exitStart+os.length+30);q+=3){
    if(overlaps(ownFoot,predictedFootprint(ghost,q,1))){collision=true;break;}
   }
   if(collision){if(opened===null)opened=p;last=p;}
   else if(opened!==null){intervals.push({from:opened,to:last+2,route:other.id});opened=null;}
  }
  if(opened!==null)intervals.push({from:opened,to:last+2,route:other.id});
  conflicts.push(...intervals);
 }
 conflicts.sort((a,b)=>a.from-b.from);
 // Merge overlaps but do not merge two spatially independent hazards:
 // the complete vehicle may wait between them if its physical footprint fits.
 const zones=[];
 for(const item of conflicts){
  const last=zones[zones.length-1];
  if(last&&item.from<=last.to+2){last.to=Math.max(last.to,item.to);last.routes.add(item.route);}
  else zones.push({from:item.from,to:item.to,routes:new Set([item.route])});
 }
 const stages=[];
 for(let i=0;i<zones.length;i++){
  const zone=zones[i];
  // zone.from is already the first position where the COMPLETE oriented
  // rectangle (front, rear and corners) overlaps another swept vehicle.
  // Keep a further longitudinal safety reserve before that first contact.
  // The center coordinate is only a trajectory parameter, never the
  // collision criterion.
  const safetyReserve=Math.max(6,spec.length*.35);
  let stop=Math.max(begin,zone.from-safetyReserve);
  // Validate the final resting footprint for every route in this zone.
  // This protects long trucks on a curved trajectory as well as short cars.
  for(let attempts=0;attempts<Math.ceil(spec.length+15)&&stop>begin;attempts++){
   const footprint=predictedFootprint(own,stop,2);
   let wouldOverlap=false;
   for(const routeId of zone.routes){
    const other=tracks.find(t=>t.id===routeId);
    if(!other)continue;
    const os=VEHICLE_TYPES.truck,ghost={track:other,spec:os,length:os.length};
    for(let q=other.stopAt;q<=Math.min(other.length,other.exitStart+os.length+30);q+=2){
     if(overlaps(footprint,predictedFootprint(ghost,q,2))){wouldOverlap=true;break;}
    }
    if(wouldOverlap)break;
   }
   if(!wouldOverlap)break;
   stop=Math.max(begin,stop-1);
  }
  if(i>0&&stop-zones[i-1].to<spec.length+4){
   // No safe full-body waiting island: merge into earlier decision.
   const prev=stages[stages.length-1];
   prev.end=Math.max(prev.end,zone.to+2);
   for(const id of zone.routes)prev.routes.add(id);
   continue;
  }
  stages.push({stop,end:zone.to+2,routes:new Set(zone.routes)});
 }
 signalLeftStageCache.set(key,stages);
 return stages;
}
// Compute two decision gates only when there is a physically empty waiting
// area BETWEEN distinct priority conflicts. The entire vehicle envelope
// must fit, including its rear; no route IDs are hardcoded.
const stagedTurnCache=new Map();
function turnStages(track,spec){
 const key=track.id+"|"+spec.length+"|"+spec.width+"|"+(signalsEnabled?"signal":"yield");
 if(stagedTurnCache.has(key))return stagedTurnCache.get(key);
 const firstWait=waitingPosition(track,spec);
 const fullEnd=Math.min(track.length,track.exitStart+spec.length+65);
 const fallback=[{stop:firstWait,end:fullEnd}];
 if(!leftTurn(track)){stagedTurnCache.set(key,fallback);return fallback;}
 const own={track,spec,length:spec.length};
 const active=tracks.filter(t=>priorityApplies(track,t));
 const occupied=[];
 for(let p=firstWait+3;p<=fullEnd;p+=4){
  let collide=false;
  for(const other of active){
   const os=VEHICLE_TYPES.truck,ghost={track:other,spec:os,length:os.length};
   const last=Math.min(other.length,other.exitStart+os.length+40);
   for(let q=Math.max(0,other.stopAt);q<=last;q+=10){
    if(overlaps(predictedFootprint(own,p,2),predictedFootprint(ghost,q,2))){
     collide=true;break;
    }
   }
   if(collide)break;
  }
  occupied.push({p,collide});
 }
 // A valid island has two disjoint conflict clusters, with space for a
 // full vehicle body and an additional margin at rest.
 let seenFirst=false,clearStart=null,chosen=null;
 for(let i=0;i<occupied.length;i++){
  const v=occupied[i];
  if(v.collide){if(clearStart!==null&&seenFirst&&v.p-clearStart>=spec.length+20){
    chosen=Math.floor((clearStart+v.p)/2);
    break;
   }seenFirst=true;clearStart=null;
  }else if(seenFirst&&clearStart===null)clearStart=v.p;
 }
 const stages=chosen!==null&&chosen>firstWait+spec.length/2+12?
  [{stop:firstWait,end:chosen},{stop:chosen,end:fullEnd}]:fallback;
 stagedTurnCache.set(key,stages);
 return stages;
}
// Right-of-way does not authorize driving into an occupied conflict point.
// This symmetric safety gate protects vehicles which entered earlier, even
// when the approaching movement would ordinarily have priority.
function occupiedJunctionGate(car,snapshot){
 if(car.s>car.track.stopAt+.1)return null;
 for(const other of snapshot){
  if(other.id===car.id||other.track===car.track||
     other.track.entryLane===car.track.entryLane)continue;
  // Opposing left turns cross left-to-left, without yielding to each other.
  // Do not turn their approach into a mutual red-like gate. A genuine body
  // overlap is still detected by the independent physical collision test.
  if(opposedLeftTurns(car.track,other.track))continue;
  const conflict=priorityRouteConflict(car,other);
  if(!conflict)continue;
  // A vehicle anywhere inside the junction is NOT automatically occupying
  // this particular crossing/merge conflict. Check its actual full body
  // against the conflict interval along the other movement.
  const clearance=3;
  if(other.s+other.length/2 < conflict.firstPriorityPosition-clearance)continue;
  if(other.s-other.length/2 > conflict.lastPriorityPosition+clearance)continue;
  // Let the approaching vehicle reach the last collision-free position,
  // rather than impose a fictitious stop at the entry of the junction.
  const stop=Math.max(car.track.stopAt,conflict.firstOwnPosition-car.length/2-clearance);
  if(car.s>stop+.1)continue; // already passed this decision gate
  return {gap:Math.max(0,stop-car.s),v:0,blockingVehicle:other.id};
 }
 return null;
}
function priorityGate(car,snapshot,trace=null){
 const signalledLeft=signalsEnabled&&leftTurn(car.track);
 const stages=signalledLeft?signalLeftStages(car.track,car.spec):turnStages(car.track,car.spec);
 const next=stages.find(stage=>car.s<=stage.stop+.1);
 if(!next){if(trace)trace.gateStatus="Manévr dokončuje – všechna rozhodnutí provedena";return null;}
 const stop=next.stop,end=next.end;
 if(trace){trace.waitAt=+stop.toFixed(2);trace.stage=stages.indexOf(next)+1;trace.stages=stages.length;}
 const priority=snapshot.filter(other=>{
  if(other.id===car.id||!priorityApplies(car.track,other.track)||
     (signalledLeft&&!next.routes.has(other.track.id)))return false;
  // On a signalised left turn, the exact swept-envelope zone calculation
  // already established this pair's geometric conflict. Do not overwrite
  // that with the older sparse sampling check below.
  if(signalledLeft)return true;
  // Ignore conflicts that are wholly outside this decision segment.
  const model={track:car.track,spec:car.spec,length:car.length};
  const tester={track:other.track,spec:other.spec,length:other.length};
  const finish=Math.min(other.track.length,other.track.exitStart+other.length+40);
  for(let p=stop;p<=end;p+=8){
   for(let q=Math.max(0,other.track.stopAt);q<=finish;q+=12){
    if(overlaps(predictedFootprint(model,p,2),predictedFootprint(tester,q,2)))return true;
   }
  }
  return false;
 });
 if(trace){trace.gateStatus="Kontrola přednosti před vjezdem";trace.priorityCandidates=priority.map(c=>({id:c.id,route:c.track.id,s:+c.s.toFixed(1),v:+c.v.toFixed(1)}));}
 if(!priority.length)return null;
 // At the entry line simulate a fresh launch. When approaching the line,
 // use current speed, allowing natural braking before reaching the gate.
 const fromStop=car.v<3;
 const start=Math.min(car.s,stop);
 const distance=end-start;
 const accel=Math.max(3,car.spec.maxAcceleration*.55);
 const timeToClear=Math.sqrt(2*distance/accel)+distance/Math.max(12,car.spec.cruise)+3;
 const horizon=Math.min(28,Math.max(10,timeToClear+4));
 for(const other of priority){
  // A vehicle held at its own red light cannot claim priority until it
  // enters, whereas a vehicle already past the signal remains relevant.
  if(!lightIsGreen(other.track.signal)&&other.s<other.track.stopAt)continue;
  if(other.s-other.length/2>other.track.length)continue;
  // A priority vehicle which is held up at its own entrance retains
  // priority. Do not exploit its temporarily low current speed to cut
  // across its intended future route. The conflict geometry is independent
  // of the particular junction or SVG exit boundaries.
  // Waiting vehicles upstream of the stop line do not reserve an entire
  // future crossing area; the time-resolved forecast below handles them.
  const priorityHeld=other.s>other.track.stopAt+other.length/2 &&
   other.s<=other.track.stopAt+other.length &&
   other.v<other.spec.cruise*.75;
  if(priorityHeld){
   const conflict=priorityRouteConflict(car,other);
   // A stopped vehicle well upstream can be held by its own queue.
   // Do not veto a gap indefinitely based on that vehicle's entire
   // eventual route; the time-resolved forecast below handles arrivals.
   const immediatelyApproaching=other.s>=other.track.stopAt-other.length*1.5;
   if(conflict && immediatelyApproaching &&
      other.s-other.length/2<=conflict.lastPriorityPosition){
    if(trace)trace.blocker={id:other.id,route:other.track.id,rule:"Zpomalující nebo čekající vozidlo s předností na konfliktní trase",prioritySpeed:+other.v.toFixed(2),lastConflictPosition:conflict.lastPriorityPosition};
    return {gap:Math.max(0,stop-car.s),v:0};
   }
  }
  const mainGhost={s:0,v:fromStop?0:car.v,spec:car.spec};
  const cautiousGhost={s:0,v:fromStop?0:car.v*.45,spec:car.spec};
  const otherGhost={s:0,v:other.v,spec:other.spec};
  for(let tick=0;tick<=Math.ceil(horizon/.1);tick++){
   if(tick){advanceVehicle(mainGhost,null,.1);advanceVehicle(cautiousGhost,null,.1);advanceVehicle(otherGhost,null,.1);}
   const t=tick*.1;
   const ownS=Math.min(end,start+mainGhost.s);
   const cautiousS=Math.min(end,start+Math.min(mainGhost.s,cautiousGhost.s*.72));
   const otherS=other.s+otherGhost.s;
   // A priority vehicle is no longer an obstacle after its rear has
   // exited the map. Never clamp the ghost to its route endpoint: that
   // used to leave a fictitious stationary vehicle at the exit.
   if(otherS-other.length/2>other.track.length)break;
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
function renderRouteStats(){
 const body=$("route-stats-body");if(!body)return;
 body.replaceChildren();
 for(const track of tracks){
  const row=document.createElement("tr");
  const completed=routeStats.get(track.id)||0;
  const inMap=cars.filter(c=>c.track.id===track.id).length;
  const label=activeGameConfig.movementLabels?.[track.id]||`${track.id} · ${track.entryLane} → ${track.exitLane}`;
  for(const value of [label,completed,inMap]){
   const cell=document.createElement("td");cell.textContent=String(value);row.append(cell);
  }
  body.append(row);
 }
}
function exportDiagnostics(){
 const payload={version:APP_VERSION,metersPerSvgUnit:0.125,speedLimitKmH:50,clock,signalsEnabled,dayHour:dayHour(),dayElapsed,dayAcceleration:DAY_ACCELERATION,trafficProfile:trafficProfile(dayHour()),intensityMultiplier:Number($("rate").value),completedByRoute:Object.fromEntries(routeStats),collision:collisionReport,
  cars:cars.map(c=>({id:c.id,route:c.track.id,entryLane:c.track.entryLane,
   exitLane:c.track.exitLane,roadPriority:c.track.roadPriority,type:c.spec===VEHICLE_TYPES.truck?"truck":"car",
   length:c.length,enteredAt:c.enteredAt,entryDecision:c.entryDecision||null,history:c.history}))};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="semafory-"+APP_VERSION+"-diagnostika-"+formatTime(clock).replaceAll(":","-")+".json";
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// The daily traffic curve belongs to the selected intersection. Projects
// without calibrated traffic data use a neutral flat profile.
const DEFAULT_DAILY_PROFILE=Object.freeze(Array.from({length:24},()=>1));
const DAY_HOURS=24,REAL_DAY_SECONDS=7200,DAY_ACCELERATION=DAY_HOURS*3600/REAL_DAY_SECONDS;
function startingHour(){
 const [h,m]=($("start-time")?.value||"07:00").split(":").map(Number);
 return Number.isFinite(h)&&Number.isFinite(m)?(h+m/60)%24:7;
}
function dayHour(){
 return (startingHour()+dayElapsed*DAY_ACCELERATION/3600)%24;
}
function trafficProfile(hour){
 const configured=activeGameConfig.dailyProfile;
 const shape=Array.isArray(configured)&&configured.length===24?configured:DEFAULT_DAILY_PROFILE;
 const i=Math.floor(hour)%24,f=hour-i;
 const first=Number(shape[i]),second=Number(shape[(i+1)%24]);
 const x=Number.isFinite(first)?first:1,y=Number.isFinite(second)?second:1;
 return x*(1-f)+y*f;
}
function updateDayClock(){
 const h=dayHour(),hours=Math.floor(h),minutes=Math.floor((h-hours)*60);
 const el=$("day-time");if(el)el.textContent=String(hours).padStart(2,"0")+":"+String(minutes).padStart(2,"0");
 const mul=$("current-profile");if(mul)mul.textContent=trafficProfile(h).toFixed(2)+"×";
}
function sampleTrafficMovement(options=tracks){
 const approachWeights=activeGameConfig.entryTrafficWeights;
 if(approachWeights&&Object.keys(approachWeights).length){
  const byLane=new Map();
  for(const t of options){if(!byLane.has(t.entryLane))byLane.set(t.entryLane,[]);byLane.get(t.entryLane).push(t);}
  const lanes=[...byLane].map(([lane,routes])=>({lane,routes,weight:Math.max(0,Number(approachWeights[lane])||0)}));
  const total=lanes.reduce((sum,v)=>sum+v.weight,0);
  if(total>0){
   let draw=Math.random()*total;
   for(const v of lanes){draw-=v.weight;if(draw<0){
    const shares=activeGameConfig.movementShareByEntry||{};
    const routeTotal=v.routes.reduce((sum,t)=>sum+Math.max(0,Number(shares[t.id])||0),0);
    if(routeTotal>0){
     let turnDraw=Math.random()*routeTotal;
     for(const route of v.routes){turnDraw-=Math.max(0,Number(shares[route.id])||0);if(turnDraw<0)return route;}
    }
    return v.routes[Math.floor(Math.random()*v.routes.length)];
   }}
   return lanes[lanes.length-1].routes[0];
  }
 }
 const weights=activeGameConfig.trafficWeights||{};
 const total=options.reduce((sum,t)=>sum+Math.max(0,Number(weights[t.id])||0),0);
 if(total<=0)return options[Math.floor(Math.random()*options.length)];
 let draw=Math.random()*total;
 for(const track of options){draw-=Math.max(0,Number(weights[track.id])||0);if(draw<0)return track;}
 return options[options.length-1];
}
function spawn(){
 if(!tracks.length||cars.length>90)return true;
 // Draw from ALL configured approaches, never just currently free lanes.
 // A blocked arrival is lost, NOT redistributed into another road.
 const t=sampleTrafficMovement(tracks);
 if(cars.some(c=>c.track.entryLane===t.entryLane&&c.s-c.length/2<65))return true;
 const movementTruckShare=activeGameConfig.truckShareByMovement?.[t.id];
 const forbidden=new Set(activeGameConfig.truckForbiddenLanes||[]);
 const truckRouteAllowed=!forbidden.has(t.entryLane)&&!forbidden.has(t.exitLane);
 const truck=truckRouteAllowed&&Math.random()<Math.max(0,Math.min(1,Number(movementTruckShare??activeGameConfig.truckShare??.05))),spec=truck?VEHICLE_TYPES.truck:VEHICLE_TYPES.car;const g=svgEl("g"),body=svgEl("rect",{x:-spec.length/2,y:-spec.width/2,width:spec.length,height:spec.width,rx:2,fill:truck?"#f0c673":["#fff5bf","#e14e5a","#61b9ef","#9ee08e"][Math.floor(Math.random()*4)],stroke:"#172536","stroke-width":1.5});
 g.append(body);g.append(svgEl("rect",{x:-spec.length/2-6,y:-spec.width/2-8,width:spec.length+12,height:spec.width+16,fill:"transparent","pointer-events":"all"}));carsLayer.append(g);const car={id:nextId++,track:t,s:0,v:0,length:spec.length,spec,el:g,
  enteredAt:clock,history:[],lastTelemetryTick:-1,lastTelemetryState:""};
 car.el.style.cursor="pointer";car.el.addEventListener("click",e=>{e.stopPropagation();selectedCarId=car.id;updateInspector();});
 cars.push(car);recordTelemetry(car,"spawn",null,null,true);return true;
}
function locateSignals(parts){
 // SVG document order is not semantically stable. Match each actual signal
 // glyph to the stop line of the movement it controls, using a minimum
 // total-distance assignment. This survives exported SVG element reordering.
 const inverse=svg.getScreenCTM().inverse();
 const markers=parts.signal.map(node=>{
  const box=node.getBBox(),p=new DOMPoint(box.x+box.width/2,box.y+box.height/2);
  return p.matrixTransform(inverse.multiply(node.getScreenCTM()));
 });
 const targets=[...new Set(tracks.map(t=>t.signal))].map(id=>{
  const group=tracks.filter(t=>t.signal===id);
  const positions=group.map(t=>position(t,t.stopAt));
  return {id,positions};
 });
 if(markers.length<targets.length)throw Error("Nedostatek značek semaforů v mapě");
 let best=Infinity,solution=null;
 const assign=(i,used,score,selection)=>{
  if(i===targets.length){if(score<best){best=score;solution=selection.slice();}return;}
  for(let j=0;j<markers.length;j++){
   if(used.has(j))continue;
   const m=markers[j];
   const dist=Math.min(...targets[i].positions.map(p=>Math.hypot(p.x-m.x,p.y-m.y)));
   const total=score+dist;
   if(total>=best)continue;
   used.add(j);selection.push(j);assign(i+1,used,total,selection);
   selection.pop();used.delete(j);
  }
 };
 assign(0,new Set(),0,[]);
 return targets.map((t,i)=>({id:t.id,x:markers[solution[i]].x,y:markers[solution[i]].y}));
}
let activeSignalPlan=null;
const signalVisuals=new Map();
function makeUnrestrictedController(ids){
 const lamps=new Map(ids.map(id=>[id,"red"]));
 return {state:id=>lamps.get(id)||"red",tick:()=>{},
  requestSignal(id){if(!lamps.has(id))return false;lamps.set(id,lamps.get(id)==="green"?"red":"green");return true;},
  setManual:()=>{},reset(){for(const id of lamps.keys())lamps.set(id,"red");},
  status(){return {stage:"nezávisle",mode:"bez kontroly",manual:true,green:[...lamps].filter(([,v])=>v==="green").map(([id])=>id)};}
 };
}
let normalController=null,unrestrictedController=null;
function experimentalMode(){return !!$("unrestricted")?.checked;}
function activateController(){
 controller=experimentalMode()?unrestrictedController:normalController;
 if(controller){controller.reset();controller.setManual(experimentalMode()||$("manual").checked);}
 $("manual").disabled=experimentalMode()||!controller;
 freeSignals=signalsEnabled?new Set(freeTraffic.freeSignals||[]):new Set(tracks.map(t=>t.signal).filter(Boolean));
}
function buildSignalPanel(){
 const panel=$("signal-panel");if(!panel)return;
 panel.replaceChildren();
 const excluded=new Set(freeTraffic.freeSignals||[]);
 for(const id of signals.filter(id=>!excluded.has(id))){
  const button=document.createElement("button");
  button.type="button";button.dataset.signal=id;
  button.dataset.name=activeGameConfig.signalLabels?.[id]||id;
  button.onclick=()=>requestSignal(id);
  panel.append(button);
 }
}
function renderSignalPanel(){
 const panel=$("signal-panel");if(!panel)return;
 panel.hidden=!signalsEnabled||!panel.children.length;
 for(const button of panel.querySelectorAll("button[data-signal]")){
  const state=controller?.state(button.dataset.signal)||"red";
  button.textContent=button.dataset.name+" · "+(state==="green"?"ZELENÁ":state==="red"?"ČERVENÁ":state.toUpperCase());
  button.style.background=state==="green"?"#146d37":state==="red"?"#8c2634":"#976811";
 }
}
function renderSignalLights(){
 if(!signalsEnabled){lights.replaceChildren();signalVisuals.clear();renderSignalPanel();return;}
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
  visual.title.textContent=loc.id+" – "+state+(experimentalMode()?" · kliknutím přepnout červená/zelená":" · kliknutím vyžádat zelenou");
 }
 renderSignalPanel();
}
function requestSignal(id){
 if(!signalsEnabled||!controller||freeSignals.has(id))return;
 if(experimentalMode()){
  controller.requestSignal(id);
  $("state").textContent="TEST BEZ KONTROLY: "+id+" → "+controller.state(id)+"; ostatní semafory beze změny.";
  renderSignalLights();return;
 }
 if(!$("manual").checked){$("state").textContent="Nejprve zapni ruční ovládání.";return;}
 const ok=controller.requestSignal(id);
 const group=(activeSignalPlan?.linkedSignals||[]).find(g=>g.includes(id))||[id];
 $("state").textContent=ok?"Požadavek: zelená pro "+group.join(" + ")+"; probíhá bezpečné přepnutí.":"Skupina "+group.join(" + ")+" má zelenou nebo je právě aktivní.";
}
function lightIsGreen(signal){return !signal||freeSignals.has(signal)||controller?.state(signal)==="green";}
function updateInspector(){
 const panel=$("vehicle-inspector"),car=cars.find(c=>c.id===selectedCarId);
 const selector=$("inspect-select");
 const ids=cars.map(c=>c.id).join(",");
 if(selector.dataset.ids!==ids){selector.replaceChildren();for(const c of cars){const opt=document.createElement("option");opt.value=c.id;opt.textContent="#"+c.id+" · "+c.track.id+" · "+(c.v<2?"stojí":"jede");selector.append(opt);}selector.dataset.ids=ids;}
 if(!car){panel.hidden=true;return;}
 panel.hidden=false;selector.value=String(car.id);
 const d=car.liveInspection||{},block=d.blocker||null,active=d.activeObstacle||null;
 $("inspect-title").textContent="Vozidlo "+car.id+" · "+car.track.id+" · "+(car.track.roadPriority==="main"?"hlavní":car.track.roadPriority==="minor"?"vedlejší":"rovnocenná");
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
 // In 2.5.42 intensity 1.0 equals intensity 0.5 in 2.5.41.
 const baseRate=Math.max(.05,Number(activeGameConfig.baseSpawnRate)||.65);
 const currentRate=baseRate*trafficProfile(dayHour())*Number($("rate").value);
 spawnBudget=Math.min(6,spawnBudget+dt*currentRate);
 while(spawnBudget>=1){spawnBudget-=1;spawn();}
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
   // Vehicles sharing one physical entry stream form a FIFO queue while
   // their live geometry is still aligned. No road ID or fixed fork point is
   // embedded in the universal engine.
   if(car.track.entryLane===other.track.entryLane){
    const p=position(car.track,car.s),q=position(other.track,other.s);
    const angle=p.angle*Math.PI/180,otherAngle=q.angle*Math.PI/180;
    const ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;
    const dx=q.x-p.x,dy=q.y-p.y;
    const forward=dx*ux+dy*uy,lateral=Math.abs(dx*vx+dy*vy);
    const aligned=Math.cos(angle-otherAngle)>.72;
    const laneWidth=(car.spec.width+other.spec.width)/2+8;
    if(aligned&&forward>0&&forward<Math.max(135,car.v*3)&&lateral<laneWidth){
     delta=Math.min(delta,forward);
     const clearance=footprintClearance(vehicleFootprint(car),vehicleFootprint(other));
     if(clearance<Math.max(4,car.v*.65)&&(!obstacle||clearance<obstacle.gap)){
      obstacle={gap:clearance,v:other.v};
      if(inspect)obstacleSource={rule:"Geometrické následování ve společném příjezdu",id:other.id,route:other.track.id};
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
   // Different routes can have different exitStart coordinates. Comparing
   // their route-relative distances creates a phantom leader and can deadlock
   // a priority right turn against a yielding left turn. For a common exit,
   // follow only a vehicle physically ahead in the same aligned corridor.
   if(car.track!==other.track&&car.track.exitLane===other.track.exitLane&&
      car.s>=car.track.exitStart&&other.s>=other.track.exitStart){
    const p=position(car.track,car.s),q=position(other.track,other.s);
    const a=p.angle*Math.PI/180,b=q.angle*Math.PI/180;
    const dx=q.x-p.x,dy=q.y-p.y;
    const ahead=dx*Math.cos(a)+dy*Math.sin(a);
    const side=Math.abs(-dx*Math.sin(a)+dy*Math.cos(a));
    const corridor=(car.spec.width+other.spec.width)/2+3;
    if(Math.cos(a-b)>.85&&ahead>0&&side<corridor)
     delta=Math.min(delta,ahead);
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
   // Different turning movements still share the same PHYSICAL lane after
   // the authored entryEnd. Follow the real vehicle ahead until the paths
   // separate laterally; do not stop checking at the route's marker.
   const p0=position(car.track,car.s),q0=position(other.track,other.s);
   const angle=p0.angle*Math.PI/180,otherAngle=q0.angle*Math.PI/180;
   const forward0=(q0.x-p0.x)*Math.cos(angle)+(q0.y-p0.y)*Math.sin(angle);
   const lateral0=Math.abs(-(q0.x-p0.x)*Math.sin(angle)+(q0.y-p0.y)*Math.cos(angle));
   const sharedPhysicalLane=car.track.entryLane===other.track.entryLane&&
      Math.cos(angle-otherAngle)>.72&&forward0>0&&
      forward0<Math.max(135,car.v*3)&&
      lateral0<(car.spec.width+other.spec.width)/2+6;
   const commonExit=car.track.exitLane===other.track.exitLane&&car.s>=car.track.exitStart&&other.s>=other.track.exitStart;
   if(!sameMovement&&!commonApproach&&!sharedPhysicalLane&&!commonExit)continue;
   const p=ownFoot.p,q=position(other.track,other.s);
   const forward=(q.x-p.x)*ownFoot.ux+(q.y-p.y)*ownFoot.uy;
   const sideways=Math.abs((q.x-p.x)*ownFoot.vx+(q.y-p.y)*ownFoot.vy);
   if(forward<=0||forward>Math.max(135,car.v*3)||sideways>(sharedPhysicalLane?(car.spec.width+other.spec.width)/2+6:13))continue;
   const clearance=footprintClearance(ownFoot,vehicleFootprint(other,1));
   if(clearance<Math.max(12,car.v*1.25)){
    const projectedGap=forward-(car.length+other.length)/2;
    const candidate={gap:Math.max(0,Math.min(clearance,projectedGap)),v:other.v};
    if(!obstacle||candidate.gap<obstacle.gap){obstacle=candidate;if(inspect)obstacleSource={rule:"Fyzická vzdálenost za vozidlem",id:other.id,route:other.track.id};}
   }
  }
  const beforeEntry=car.s<=car.track.stopAt+.1;
  const gateTrace=beforeEntry?{t:clock,vehicle:car.id,route:car.track.id,position:+car.s.toFixed(3),speed:+car.v.toFixed(3)}:null;
  const gate=priorityGate(car,snapshots,gateTrace);
  if(inspect&&gateTrace)Object.assign(inspect,gateTrace);
  if(gate&&(!obstacle||gate.gap<obstacle.gap)){obstacle=gate;if(inspect)obstacleSource={rule:"Dávání přednosti",...(inspect.blocker||{})};}
  // The generic entry-wide occupancy veto must not override the staged
  // geometric waiting positions of a signalled left turn.
  const occupied=signalsEnabled&&leftTurn(car.track)?null:occupiedJunctionGate(car,snapshots);
  if(occupied&&(!obstacle||occupied.gap<obstacle.gap)){
   obstacle=occupied;
   if(inspect)obstacleSource={rule:"Obsazená konfliktní plocha křižovatky",id:occupied.blockingVehicle};
  }
   // A red signal acts like a stationary lead vehicle at the stop line.
  if(!lightIsGreen(car.track.signal)&&car.s<car.track.stopAt){
   const gap=car.track.stopAt-car.s;
   if(!obstacle||gap<obstacle.gap){obstacle={gap,v:0};if(inspect)obstacleSource={rule:"Červený signál",signal:car.track.signal};}
  }
  if(inspect){inspect.activeObstacle=obstacleSource;inspect.obstacle=obstacle?{gap:obstacle.gap,velocity:obstacle.v}:null;car.liveInspection=inspect;}
  const previousS=car.s;
  advanceVehicle(car,obstacle,dt);
  const stageStops=turnStages(car.track,car.spec);
  const decisionAt=stageStops.find(t=>previousS<=t.stop+.1&&car.s>t.stop+.1)?.stop;
  if(decisionAt!==undefined){
   car.entryDecision={...gateTrace,t:+clock.toFixed(3),crossedAt:+car.s.toFixed(3),crossingSpeed:+car.v.toFixed(3),effectiveObstacle:obstacleSource||null,priorityGateBlocked:!!gate,decisionAt};
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
 cars=cars.filter(c=>{if(c.s<c.track.length)return true;c.el.remove();passed++;routeStats.set(c.track.id,(routeStats.get(c.track.id)||0)+1);return false;});
 }
 // Rendering happens once per animation frame, not hundreds of times per
 // real second. The simulation itself retains exactly the same 10 ms steps.
 for(const car of cars){
  const p=position(car.track,car.s);
  car.el.setAttribute("transform",`translate(${p.x} ${p.y}) rotate(${p.angle})`);
 }
 for(const c of cars){const rect=c.el.firstElementChild;rect.setAttribute("stroke",c.id===selectedCarId?"#ffff00":"#172536");rect.setAttribute("stroke-width",c.id===selectedCarId?"3.8":"1.5");}
 updateInspector();
 const stage=controller?.status();$("phase").textContent=signalsEnabled?(stage?(experimentalMode()?"TEST: nezávislé semafory · bez kontroly":"Semafory · fáze "+stage.stage+" · "+stage.mode):"Semafory"):"Bez semaforů · přednosti projektu";$("elapsed").textContent=formatTime(clock);$("count").textContent=cars.length;$("passed").textContent=passed;
 renderRouteStats();
 renderSignalLights();
 requestAnimationFrame(animate);
}
function clearProjectScene(){
 running=false;
 for(const car of cars)car.el?.remove();
 cars=[];selectedCarId=null;tracks=[];signals=[];signalLocations=[];routeStats=new Map();
 collisionLocked=false;collisionReport=null;clock=0;accumulator=0;dayElapsed=0;spawnBudget=0;spawnClock=0;passed=0;phase=0;nextId=1;
 for(const id of ["defs","map","photo-map","markings","native-map","vehicles","lights"])$(id)?.replaceChildren();
 delete svg.dataset.photoCrop;
 photoMap.removeAttribute("clip-path");
 signalVisuals.clear();priorityConflictCache.clear();innerWaitCache.clear();stagedTurnCache.clear();
 normalController=null;unrestrictedController=null;controller=null;activeSignalPlan=null;freeSignals=new Set();yieldRules=[];freeTraffic={};
 $("diagnostics").hidden=true;$("vehicle-inspector").hidden=true;
}
function fallbackSignalPlan(controlledSignals){
 if(!controlledSignals.length)return null;
 return {type:"generated-test",stages:controlledSignals.map(id=>({green:[id],greenSeconds:12})),yellowSeconds:3,allRedSeconds:2,redYellowSeconds:2,linkedSignals:[]};
}
function validSignalPlan(plan,known){
 return !!plan&&Array.isArray(plan.stages)&&plan.stages.length>0&&plan.stages.every(stage=>Array.isArray(stage.green)&&stage.green.length&&stage.green.every(id=>known.includes(id)));
}
function gameConfigFor(data,source){
 const byId=projectCatalog.find(p=>p.id&&p.id===data.id);
 const byFile=source?.startsWith("github:")?projectCatalog.find(p=>"github:"+p.file===source):null;
 return {...(byId?.game||byFile?.game||{}),...(data.game||{})};
}
async function loadIntersection(source,{initial=false}={}){
 $("state").textContent="Načítám křižovatku…";
 let data;
 if(source.startsWith("local:")){
  data=await projectStore.get(source.slice(6));
  if(!data)throw Error("Místní projekt nebyl nalezen");
 }else if(source.startsWith("github:")){
  const file=source.slice(7);
  if(!/^[-a-zA-Z0-9_/]+\.json$/.test(file)||file.includes(".."))throw Error("Neplatná cesta projektu");
  const response=await fetch("./projects/"+file,{cache:"no-store"});
  if(!response.ok)throw Error("Zveřejněný projekt není dostupný");
  data=await response.json();
 }else throw Error("Neplatný zdroj projektu");
 if(!data?.svg?.content)throw Error("Projekt neobsahuje SVG");
 clearProjectScene();activeProject=data;activeGameConfig=gameConfigFor(data,source);
 const parts=readSvg(data.svg.content),network=makeRoadNetwork(parts,data.directions);
 if(data.viewport?.viewBox){
  const numbers=data.viewport.viewBox.trim().split(/[\s,]+/).map(Number);
  if(numbers.length===4&&numbers.every(Number.isFinite)&&numbers[2]>0&&numbers[3]>0){
   svg.setAttribute("viewBox",numbers.join(" "));
   svg.style.aspectRatio=numbers[2]+"/"+numbers[3];
   svg.parentElement.style.setProperty("--map-aspect",numbers[2]+"/"+numbers[3]);
   svg.parentElement.style.setProperty("--map-ratio",String(numbers[2]/numbers[3]));
  }
 }
 // Prefer the actual rendered photo clip to the saved Builder viewport:
 // unrendered PowerPoint objects can expand the latter vertically.
 if(svg.dataset.photoCrop){
  const [x,y,w,h]=svg.dataset.photoCrop.split(" ").map(Number);
  if(w>0&&h>0){
   const pad=Math.max(w,h)*.02;
   const box=[x-pad,y-pad,w+2*pad,h+2*pad];
   svg.setAttribute("viewBox",box.join(" "));
   svg.style.aspectRatio=box[2]+"/"+box[3];
   svg.parentElement.style.setProperty("--map-aspect",box[2]+"/"+box[3]);
   svg.parentElement.style.setProperty("--map-ratio",String(box[2]/box[3]));
  }
 }
 tracks=(data.movements?.movements||[]).filter(m=>m.confirmed).map(m=>makeTrack(network,m)).filter(Boolean);
 if(!tracks.length)throw Error("Projekt nemá potvrzené průjezdy");
 signals=[...new Set(tracks.map(t=>t.signal).filter(Boolean))];
 freeTraffic={
  freeSignals:activeGameConfig.freeSignals||[],
  yieldRules:activeGameConfig.yieldRules||[],
  ...(data.uncontrolledMovements||{})
 };
 yieldRules=freeTraffic.yieldRules||[];
 freeSignals=new Set(tracks.map(t=>t.signal).filter(Boolean));
 const controlled=signals.filter(id=>!(freeTraffic.freeSignals||[]).includes(id));
 const sourcePlan=data.signalPlan||activeGameConfig.signalPlan||null;
 const configured=sourcePlan?{...sourcePlan,linkedSignals:sourcePlan.linkedSignals||[]}:null;
 activeSignalPlan=validSignalPlan(configured,signals)?configured:fallbackSignalPlan(controlled);
 if(signals.length){
  normalController=activeSignalPlan?createSignalController(activeSignalPlan):makeUnrestrictedController(signals);
  unrestrictedController=makeUnrestrictedController(signals);
 }
 signalLocations=signals.length?locateSignals(parts):[];
 routeStats=new Map(tracks.map(t=>[t.id,0]));
 signalsEnabled=signals.length?$("signals-enabled").checked:false;
 $("signals-enabled").disabled=!signals.length;
 activateController();buildSignalPanel();
 if(signals.some(id=>!signalLocations.some(loc=>loc.id===id)))throw Error("V SVG chybí pozice potvrzeného semaforu");
 $("intersection-name").textContent=data.name||"Křižovatka";
 document.title="Semafory – "+(data.name||"křižovatka")+" – "+APP_VERSION;
 localStorage.setItem("semafory-game-project",source);
 const configNote=Object.keys(activeGameConfig).length?"konfigurace projektu":"neutrální testovací konfigurace";
 $("state").textContent=(data.name||"Křižovatka")+" připravena · "+tracks.length+" průjezdů · "+configNote;
 renderRouteStats();renderSignalLights();updateDayClock();
 if(!initial)running=false;
}
async function listIntersections(){
 const select=$("intersection");select.replaceChildren();projectCatalog=[];
 try{
  const response=await fetch("./projects/index.json?v="+encodeURIComponent(APP_VERSION),{cache:"no-store"});
  if(response.ok){const index=await response.json();projectCatalog=Array.isArray(index.projects)?index.projects:[];}
 }catch(e){console.warn("Seznam zveřejněných projektů není dostupný",e);}
 const refs=[];
 for(const p of projectCatalog){
  if(!p?.file)continue;
  const value="github:"+p.file;refs.push(value);
  select.add(new Option((p.name||p.file)+" · GitHub",value));
 }
 try{
  const local=await projectStore.list();
  for(const p of local){
   const value="local:"+p.id;refs.push(value);
   select.add(new Option((p.name||"Křižovatka")+" · místní",value));
  }
 }catch(e){console.warn("Místní projekty nejsou dostupné",e);}
 if(!refs.length){
  const fallback="github:massag-4.json";refs.push(fallback);select.add(new Option("Massag 4 · GitHub",fallback));
 }
 const remembered=localStorage.getItem("semafory-game-project");
 const defaultRef=refs.includes(remembered)?remembered:(refs.find(x=>x==="github:massag-4.json")||refs[0]);
 select.value=defaultRef;return defaultRef;
}
function resetSimulation({start=true}={}){
 for(const car of cars)car.el.remove();
 cars=[];selectedCarId=null;clock=0;accumulator=0;dayElapsed=0;spawnBudget=0;collisionLocked=false;collisionReport=null;
 $("diagnostics").hidden=true;phase=0;controller?.reset();passed=0;routeStats=new Map(tracks.map(t=>[t.id,0]));spawnClock=0;running=start;
 $("state").textContent=start?"Simulace běží":"Simulace připravena";
}
async function init(){
 $("intersection").onchange=async()=>{try{await loadIntersection($("intersection").value);}catch(err){$("state").textContent="Chyba: "+err.message;console.error(err);}};
 $("manual").onchange=()=>{if(!controller)return;controller.setManual($("manual").checked);$("state").textContent=$("manual").checked?"Ruční řízení: klikni na semafor.":"Automatické řízení.";};
 $("unrestricted").onchange=()=>{
  activateController();
  $("state").textContent=experimentalMode()?"TEST BEZ KONTROLY: každý řízený semafor lze přepínat samostatně.":"Standardní bezpečné řízení obnoveno.";
  lights.replaceChildren();signalVisuals.clear();renderSignalLights();
 };
 $("signals-enabled").onchange=()=>{
  signalsEnabled=$("signals-enabled").checked&&signals.length>0;accumulator=0;activateController();
  $("state").textContent=signalsEnabled?"Semafory zapnuté – konfigurace projektu":"Semafory vypnuté – přednosti podle konfigurace projektu";
  renderSignalLights();
 };
 $("start").onclick=()=>{if(collisionLocked){$("state").textContent="Po kolizi spusť novou simulaci.";return;}running=true;$("state").textContent="Simulace běží";};
 $("pause").onclick=()=>{running=false;$("state").textContent="Pozastaveno";};
 $("reset").onclick=()=>resetSimulation({start:true});
 $("export-diagnostics").onclick=exportDiagnostics;
 $("inspect-toggle").onclick=()=>{if(selectedCarId!==null&&!$("vehicle-inspector").hidden){selectedCarId=null;updateInspector();return;}selectedCarId=(cars.find(c=>c.v<2)||cars[0])?.id??null;updateInspector();};
 $("inspect-select").onchange=()=>{selectedCarId=Number($("inspect-select").value);updateInspector();};
 for(const id of ["speed","rate"])$(id).oninput=()=>$(id+"-value").textContent=$(id).value+"×";
 $("start-time").onchange=()=>{if(!running&&clock===0)updateDayClock();};
 const source=await listIntersections();
 await loadIntersection(source,{initial:true});
 requestAnimationFrame(animate);
}
init().catch(err=>{$("state").textContent="Chyba: "+err.message;console.error(err);});
