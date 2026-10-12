const NS="http://www.w3.org/2000/svg";
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function world(el,svg,p){const m=svg.getScreenCTM().inverse().multiply(el.getScreenCTM());const q=new DOMPoint(p.x,p.y).matrixTransform(m);return{x:q.x,y:q.y};}
function collect(group,svg,prefix){
 return [...group.querySelectorAll("path,line,polyline,circle,ellipse")].map((el,i)=>{
 try{const round=el.localName==="circle"||el.localName==="ellipse";const at=t=>round?{x:+el.getAttribute("cx"),y:+el.getAttribute("cy")}:el.getPointAtLength(el.getTotalLength()*t);return{id:prefix+String(i+1).padStart(2,"0"),start:world(el,svg,at(0)),end:world(el,svg,at(1)),mid:world(el,svg,at(.5))};}catch{return null;}
 }).filter(Boolean);
}
export function createMovementEditor(svg,host,directions){
 const layer=svg.querySelector("#movements-layer");layer.replaceChildren();host.replaceChildren();
 const lanes=collect(svg.querySelector("#lanes-layer"),svg,"P"),routes=collect(svg.querySelector("#routes-layer"),svg,"T"),boundaries=collect(svg.querySelector("#entry-layer"),svg,"H"),signals=collect(svg.querySelector("#signals-layer"),svg,"S");
 const states=routes.map(r=>({id:r.id,entryLane:null,entryBoundary:null,signal:null,exitBoundary:null,exitLane:null,confirmed:false}));
 let selected=states[0]?.id||null;
 const intro=document.createElement("p");intro.className="help";intro.textContent="Každý průjezd: příjezdový pruh → vjezdová hranice → trajektorie → výjezdová hranice → výjezdový pruh. Semafor ovládá vjezd. Všechny návrhy před potvrzením zkontroluj.";host.append(intro);
 const proposeButton=document.createElement("button");proposeButton.type="button";proposeButton.textContent="Navrhnout návaznosti podle potvrzených směrů";host.append(proposeButton);
 const listing=document.createElement("div");listing.className="movement-list";host.append(listing);
 const report=document.createElement("p");report.className="help";host.append(report);
 const choices=(label,items,record,key)=>{const wrap=document.createElement("label");wrap.className="movement-field";wrap.textContent=label;const select=document.createElement("select");select.add(new Option("— neurčeno —",""));for(const obj of items)select.add(new Option(obj.id,obj.id));select.value=record[key]||"";select.onchange=()=>{record[key]=select.value||null;record.confirmed=false;svg.dispatchEvent(new Event("semafory:project-changed"));redraw();};wrap.append(select);return wrap;};
 function direction(id,start,end){const item=directions()?.items?.find(x=>x.id===id&&x.confirmed);return item?.direction==="start-to-end"?{from:start,to:end}:item?.direction==="end-to-start"?{from:end,to:start}:null;}
 function propose(){
 const limit=Math.hypot(svg.viewBox.baseVal.width,svg.viewBox.baseVal.height)*.045;
 for(const rec of states){
 if(rec.confirmed)continue;
 const route=routes.find(x=>x.id===rec.id),path=direction(route.id,route.start,route.end);if(!path)continue;
 const unique=(items,target,project)=>{const ranked=items.map(x=>({id:x.id,d:distance(project(x),target)})).filter(x=>Number.isFinite(x.d)).sort((a,b)=>a.d-b.d);return ranked[0]?.d<limit&&(!ranked[1]||ranked[0].d<ranked[1].d*.7)?ranked[0].id:null;};
 const into=lanes.map(l=>({...l,d:direction(l.id,l.start,l.end)})).filter(l=>l.d);
 rec.entryLane=rec.entryLane||unique(into,path.from,l=>l.d.to);
 rec.exitLane=rec.exitLane||unique(into,path.to,l=>l.d.from);
 rec.entryBoundary=rec.entryBoundary||unique(boundaries,path.from,b=>b.mid);
 rec.exitBoundary=rec.exitBoundary||unique(boundaries,path.to,b=>b.mid);
 }
 }
 function drawTag(record,color){
 const g=document.createElementNS(NS,"g");g.setAttribute("cursor","pointer");layer.append(g);
 const circle=document.createElementNS(NS,"circle");circle.setAttribute("cx",record.mid.x+20);circle.setAttribute("cy",record.mid.y-15);circle.setAttribute("r","15");circle.setAttribute("fill","#19283a");circle.setAttribute("stroke",color);circle.setAttribute("stroke-width","2");g.append(circle);
 const t=document.createElementNS(NS,"text");t.setAttribute("x",record.mid.x+20);t.setAttribute("y",record.mid.y-11);t.setAttribute("text-anchor","middle");t.setAttribute("font-size","11");t.setAttribute("fill","#fff");t.textContent=record.id;g.append(t);
 g.onclick=()=>{const rec=states.find(x=>x.id===selected);if(!rec)return;if(record.id.startsWith("S"))rec.signal=record.id;else if(!rec.entryBoundary)rec.entryBoundary=record.id;else rec.exitBoundary=record.id;rec.confirmed=false;svg.dispatchEvent(new Event("semafory:project-changed"));redraw();};
 }
 function redraw(){
 listing.replaceChildren();layer.replaceChildren();
 boundaries.forEach(x=>drawTag(x,"#c084fc"));signals.forEach(x=>drawTag(x,"#34d399"));
 for(const rec of states){
 const wrap=document.createElement("div");wrap.className="movement-item"+(selected===rec.id?" selected":"");
 const title=document.createElement("button");title.type="button";title.textContent=rec.id+" · "+(rec.confirmed?"potvrzeno":"nepotvrzeno");title.onclick=()=>{selected=selected===rec.id?null:rec.id;redraw();};wrap.append(title);
 if(selected===rec.id){
 for(const [label,key,items] of [["Příjezdový pruh","entryLane",lanes],["Vjezdová hranice","entryBoundary",boundaries],["Semafor","signal",signals],["Výjezdová hranice","exitBoundary",boundaries],["Výjezdový pruh","exitLane",lanes]])wrap.append(choices(label,items,rec,key));
 const ok=document.createElement("button");ok.type="button";ok.textContent="Potvrdit průjezd";ok.disabled=!rec.entryLane||!rec.entryBoundary||!rec.signal||!rec.exitBoundary||!rec.exitLane||rec.confirmed;
 ok.onclick=()=>{rec.confirmed=true;svg.dispatchEvent(new Event("semafory:project-changed"));redraw();};wrap.append(ok);
 }
 listing.append(wrap);
 }
 report.textContent="Trajektorie: "+states.length+" · potvrzené průjezdy: "+states.filter(x=>x.confirmed).length+". Kolize a vyklizení vozidel budou vyhodnocovány až v simulačním jádru.";
 }
 proposeButton.onclick=()=>{propose();redraw();};
 propose();redraw();
 return {export:()=>({format:"semafory-movements-1.0",movements:states.map(x=>({...x}))}),restore(saved){if(!Array.isArray(saved?.movements))return;for(const old of saved.movements){const rec=states.find(x=>x.id===old.id);if(!rec)continue;for(const [key,items] of [["entryLane",lanes],["exitLane",lanes],["entryBoundary",boundaries],["exitBoundary",boundaries],["signal",signals]])rec[key]=items.some(x=>x.id===old[key])?old[key]:null;rec.confirmed=!!old.confirmed&&!!rec.entryLane&&!!rec.exitLane&&!!rec.entryBoundary&&!!rec.exitBoundary&&!!rec.signal;}redraw();},dispose(){layer.replaceChildren();host.replaceChildren();}};
}
