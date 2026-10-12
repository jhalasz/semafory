import {createConflictEditor} from "./conflict-editor.js?v=2.0";
import {createMovementEditor} from "./movement-editor.js?v=1.9";
import {createControlEditor} from "./control-editor.js?v=1.8.2";
import {projectStore} from "./project-store.js?v=1.7";
import {createDirectionEditor} from "./directions.js?v=1.6";
import {createConnectionEditor} from "./connection-editor.js?v=1.6";
let connections=null,directions=null,controls=null,movements=null,conflicts=null;
const ns="http://www.w3.org/2000/svg";
const keys=[["photo","Původní fotomapa","#64748b"],["beautified","Upravená mapa","#39a78e"],["markings","Vodorovné značení","#fff"],["lanes","Logické jízdní pruhy","#61cbf4"],["routes","Trajektorie","#ffc000"],["entry","Řídicí hranice","#7030a0"],["signals","Semafory","#00b050"],["other","Ostatní objekty","#aaa"]];
const scene=document.getElementById("scene"),ph=document.getElementById("placeholder"),status=document.getElementById("status"),note=document.getElementById("diagnostic"),input=document.getElementById("photo");
const el=k=>document.getElementById(k+"-layer");
let fileUrl=null,sourceSvg=null,projectId=null,loading=false,saveTimer=null,beautifiedMap=null,fullViewBox=null;
for(const [key,label,color] of keys){
 const row=document.createElement("div");row.className="layer";
 const check=document.createElement("input");check.type="checkbox";check.checked=true;
 check.onchange=()=>el(key).setAttribute("visibility",check.checked?"visible":"hidden");
 const chip=document.createElement("span");chip.className="swatch";chip.style.background=color;
 const name=document.createElement("label");name.textContent=label;
 const opacity=document.createElement("input");opacity.type="range";opacity.min=0;opacity.max=100;opacity.value=100;
 opacity.oninput=()=>el(key).setAttribute("opacity",opacity.value/100);
 row.append(check,chip,name,opacity);document.getElementById("layers").append(row);
}
function clear(){if(conflicts){conflicts.dispose();conflicts=null;}if(movements){movements.dispose();movements=null;}if(controls){controls.dispose();controls=null;}beautifiedMap=null;fullViewBox=null;document.getElementById("show-full-map").disabled=true;document.getElementById("show-beautified-map").disabled=true;if(directions){directions.dispose();directions=null;}document.getElementById("export-directions").disabled=true;document.getElementById("direction-report").textContent="";if(connections){connections.dispose();connections=null;}document.getElementById("export-connections").disabled=true;for(const [k] of keys)el(k).replaceChildren();document.getElementById("import-defs").replaceChildren();document.getElementById("connections-layer").replaceChildren();document.getElementById("connection-report").textContent="Nahraj SVG pro kontrolu napojení.";}
function color(e){const style=e.getAttribute("style")||"";const stroke=e.getAttribute("stroke")||(style.match(/stroke:\s*([^;]+)/)||[])[1];const fill=e.getAttribute("fill")||(style.match(/fill:\s*([^;]+)/)||[])[1];return (stroke&&stroke!=="none"?stroke:fill||"").toLowerCase();}
function category(e){
 if(e.localName==="image"||e.localName==="use"||e.localName==="rect")return "photo";
 const c=color(e);
 if(color(e).toLowerCase()==="#042433" && (e.getAttribute("fill")||"").toLowerCase()==="#00b050")return "signals";
 if(["#ffffff","#fff"].includes(c))return "markings";
 if(["#61cbf4","#37b5ed"].includes(c))return "lanes";
 if(["#ffc000","#f59e0b"].includes(c))return "routes";
 if(["#7030a0","#a855f7"].includes(c))return "entry";
 if(["#00b050","#22c55e"].includes(c))return "signals";
 return "photo";
}
function svgImport(xml,name){
 const doc=new DOMParser().parseFromString(xml,"image/svg+xml");
 if(doc.querySelector("parsererror")||doc.documentElement.localName!=="svg")throw Error("Neplatné SVG");
 const root=doc.documentElement;clear();
 for(const bad of root.querySelectorAll("script,foreignObject,animate,set"))bad.remove();
 for(const node of root.querySelectorAll("*"))for(const a of [...node.attributes])if(a.name.startsWith("on"))node.removeAttribute(a.name);
 const defs=root.querySelector("defs");if(defs)for(const child of defs.children)document.getElementById("import-defs").append(document.importNode(child,true));
 const vb=root.getAttribute("viewBox");const w=parseFloat(root.getAttribute("width"))||1280,h=parseFloat(root.getAttribute("height"))||720;
 scene.setAttribute("viewBox",vb||"0 0 "+w+" "+h);
 const nums=vb?vb.split(/[\s,]+/).map(Number):[0,0,w,h];scene.style.aspectRatio=nums[2]+"/"+nums[3];
 const count={};const allowed=["path","image","rect","circle","ellipse","line","polyline","polygon","use","text"];
 function visit(node,parents){
  if(node.localName==="defs"||node.localName==="clipPath")return;
  if(node.localName==="g"){for(const child of node.children)visit(child,[...parents,node]);return;}
  if(!allowed.includes(node.localName))return;
  const k=category(node);count[k]=(count[k]||0)+1;let dest=el(k);
  for(const p of parents){const g=document.createElementNS(ns,"g");for(const a of p.attributes)if(["transform","opacity","clip-path"].includes(a.name))g.setAttribute(a.name,a.value);dest.append(g);dest=g;}
  dest.append(document.importNode(node,true));
 }
 for(const child of root.children)visit(child,[]);
 // Fit the scene to the actual embedded photograph, not to an assumed SVG page.
 // PowerPoint may export a slide-sized viewBox with content offset inside it.
 try{
  const photo=el("photo");
  const box=photo.getBBox();
  if(box.width>0&&box.height>0&&[box.x,box.y,box.width,box.height].every(Number.isFinite)){
   const pad=Math.max(box.width,box.height)*.04;
   scene.setAttribute("viewBox",[box.x-pad,box.y-pad,box.width+2*pad,box.height+2*pad].join(" "));
   scene.style.aspectRatio=(box.width+2*pad)+"/"+(box.height+2*pad);
  }
 }catch(err){console.warn("Nelze vypočítat rozměry fotografie",err);}
 sourceSvg=xml;
 fullViewBox=scene.getAttribute("viewBox");
 document.getElementById("show-full-map").disabled=false;
 ph.setAttribute("visibility","hidden");status.textContent=name;
 note.textContent="Import dokončen. "+keys.map(([k,n])=>n+": "+(count[k]||0)).join("; ");
 try{
  connections=createConnectionEditor(scene,document.getElementById("connection-list"));
  document.getElementById("export-connections").disabled=false;
 }catch(error){
  document.getElementById("connection-report").textContent="SVG bylo zobrazeno, ale diagnostika návazností selhala: "+error.message;
  console.error("Chyba diagnostiky",error);
 }
 try{
  directions=createDirectionEditor(scene,document.getElementById("direction-editor"));
  document.getElementById("export-directions").disabled=false;
 }catch(error){
  document.getElementById("direction-report").textContent="Chyba určení směrů: "+error.message;
  console.error(error);
 }
 try{movements=createMovementEditor(scene,document.getElementById("movement-editor"),()=>directions?.export());}
 catch(error){document.getElementById("movement-report").textContent="Chyba průjezdů: "+error.message;console.error(error);}
 try{conflicts=createConflictEditor(scene,document.getElementById("conflict-editor"),()=>movements?.export());}
 catch(error){document.getElementById("conflict-report").textContent="Chyba kolizního náhledu: "+error.message;console.error(error);}
 // The former P→H→S editor is superseded by per-trajectory movements.
 // Its historical project data are preserved for backward compatibility.
 /*  try{controls=createControlEditor(scene,document.getElementById("control-editor"),()=>directions?.export());}
 catch(error){document.getElementById("control-report").textContent="Chyba řídicích vazeb: "+error.message;console.error(error);} */
}
input.onchange=async()=>{
 const f=input.files[0];input.value="";if(!f)return;
 status.textContent="Načítám: "+f.name;
 note.textContent="Probíhá import souboru…";
 try{
  if(f.name.toLowerCase().endsWith(".svg")){projectId=crypto.randomUUID();document.getElementById("project-name").value=f.name.replace(/\.svg$/i,"");svgImport(await f.text(),f.name);await saveProject();}
  else{
   const url=URL.createObjectURL(f),img=new Image();
   await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url;});
   if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=url;clear();
   scene.setAttribute("viewBox","0 0 "+img.naturalWidth+" "+img.naturalHeight);scene.style.aspectRatio=img.naturalWidth+"/"+img.naturalHeight;
   const e=document.createElementNS(ns,"image");e.setAttribute("href",url);e.setAttribute("width",img.naturalWidth);e.setAttribute("height",img.naturalHeight);el("photo").append(e);
   fullViewBox=scene.getAttribute("viewBox");document.getElementById("show-full-map").disabled=false;ph.setAttribute("visibility","hidden");status.textContent=f.name;note.textContent="Fotomapa načtena.";
  }
 }catch(e){status.textContent="Chyba importu";note.textContent="Import se nezdařil: "+e.message;console.error("Chyba importu SVG",e);}
};
document.getElementById("reset").onclick=()=>{sourceSvg=null;projectId=null;localStorage.removeItem("semafory-last-project");clear();input.value="";if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=null;ph.setAttribute("visibility","visible");status.textContent="Čeká na podklad";note.textContent="";};

document.getElementById("show-connections").addEventListener("change",e=>document.getElementById("connections-layer").setAttribute("visibility",e.target.checked?"visible":"hidden"));

document.getElementById("export-connections").addEventListener("click",()=>{if(!connections)return;const data={format:"semafory-connections-1.0",source:status.textContent,connections:connections.export()};const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="semafory-spoje.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});

document.getElementById("export-directions").addEventListener("click",()=>{
 if(!directions)return;
 const content=JSON.stringify(directions.export(),null,2);
 const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
 const anchor=document.createElement("a");anchor.href=url;anchor.download="semafory-smery.json";anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});

const projectNotice=document.getElementById("project-status");
function showProjectStatus(message){projectNotice.textContent=message;}
function snapshot(){
 if(!sourceSvg)return null;
 return {format:"semafory-project",version:1,id:projectId||crypto.randomUUID(),name:document.getElementById("project-name").value.trim()||status.textContent,updated:new Date().toISOString(),svg:{name:status.textContent,content:sourceSvg},directions:directions?.export()||null,connections:connections?.export()||[],controls:controls?.export()||null,movements:movements?.export()||null,conflicts:conflicts?.export()||null,beautifiedMap,visibility:Object.fromEntries(keys.map(([k])=>[k,el(k).getAttribute("visibility")!=="hidden"]))};
}
async function saveProject(){
 if(loading)return;
 const data=snapshot();if(!data)return;
 projectId=data.id;
 try{await projectStore.save(data);localStorage.setItem("semafory-last-project",projectId);showProjectStatus("Uloženo v tomto prohlížeči: "+new Date().toLocaleTimeString("cs-CZ"));await listProjects();}
 catch(e){showProjectStatus("Automatické uložení selhalo: "+e.message);}
}
async function listProjects(){
 const list=document.getElementById("project-list"),current=list.value;
 list.replaceChildren(new Option("Vyber uložený projekt…",""));
 try{
  const local=await projectStore.list();
  for(const p of local)list.add(new Option(p.name+" (místní · "+new Date(p.updated).toLocaleDateString("cs-CZ")+")","local:"+p.id));
 }catch(e){showProjectStatus("Místní seznam: "+e.message);}
 try{
  const response=await fetch("./projects/index.json",{cache:"no-store"});
  if(response.ok){
   const data=await response.json();
   for(const p of data.projects||[])list.add(new Option(p.name+" (GitHub)","github:"+p.file));
  }
 }catch(e){console.warn("GitHub seznam není dostupný",e);}
 list.value=current;
}
async function loadProject(data){
 if(data.format!=="semafory-project"||!data.svg?.content)throw Error("Projekt neobsahuje SVG. Otevři úplný projekt.");
 loading=true;
 try{
  projectId=data.id||crypto.randomUUID();
  document.getElementById("project-name").value=data.name||"";
  svgImport(data.svg.content,data.svg.name||data.name||"Projekt");
  directions?.restore(data.directions);
  connections?.restore(data.connections);
  controls?.restore(data.controls);
  movements?.restore(data.movements);
  conflicts?.restore(data.conflicts);
  conflicts?.refresh();
  setBeautifiedMap(data.beautifiedMap||null);
  fullButton.disabled=false;
  for(const [key,visible] of Object.entries(data.visibility||{})){
   if(keys.some(([k])=>k===key))el(key).setAttribute("visibility",visible?"visible":"hidden");
  }
  const useBeautified=!!data.beautifiedMap&&(data.visibility?.beautified!==false);
  document.getElementById("show-beautified-map").checked=useBeautified;
  document.getElementById("show-original-map").checked=!useBeautified;
  if(useBeautified)el("photo").setAttribute("visibility","hidden");
  showProjectStatus("Otevřen projekt: "+(data.name||"bez názvu"));
 }finally{loading=false;}
 await saveProject();
}
document.getElementById("project-save").onclick=()=>saveProject();
document.getElementById("project-name").addEventListener("change",()=>saveProject());
scene.addEventListener("semafory:project-changed",()=>{
 clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveProject(),500);
});
document.getElementById("project-open").onclick=async()=>{
 const value=document.getElementById("project-list").value;if(!value)return;
 try{
  let data;
  if(value.startsWith("local:"))data=await projectStore.get(value.slice(6));
  else if(value.startsWith("github:")){
   const file=value.slice(7);
   if(!/^[-a-zA-Z0-9_/]+\.json$/.test(file)||file.includes(".."))throw Error("Neplatná cesta projektu");
   const response=await fetch("./projects/"+file,{cache:"no-store"});
   if(!response.ok)throw Error("GitHub projekt nebyl nalezen");
   data=await response.json();
  }
  await loadProject(data);
 }catch(e){showProjectStatus("Nelze otevřít projekt: "+e.message);}
};
document.getElementById("project-export").onclick=()=>{
 const data=snapshot();if(!data){showProjectStatus("Nejdříve otevři projekt.");return;}
 const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download=(data.name||"krizovatka").replace(/[^a-zA-Z0-9_-]/g,"_")+".semafory.json";a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.getElementById("project-import").addEventListener("change",async e=>{
 const f=e.target.files[0];e.target.value="";if(!f)return;
 try{await loadProject(JSON.parse(await f.text()));}catch(err){showProjectStatus("Import selhal: "+err.message);}
});
(async()=>{await listProjects();try{const id=localStorage.getItem("semafory-last-project");if(id){const saved=await projectStore.get(id);if(saved)await loadProject(saved);}}catch(e){showProjectStatus("Obnovení posledního projektu: "+e.message);}})();


function setBeautifiedMap(asset){
 beautifiedMap=asset;
 const group=el("beautified");group.replaceChildren();
 const toggle=document.getElementById("show-beautified-map");
 const originalToggle=document.getElementById("show-original-map");
 if(!asset?.content){toggle.disabled=true;toggle.checked=false;group.setAttribute("visibility","hidden");return;}
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(asset.content))throw Error("Upravená mapa musí být obrázek PNG/JPEG/WebP.");
 const box=asset.rect||{x:266,y:37,width:814,height:660};
 if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)throw Error("Neplatné umístění upravené mapy.");
 const img=document.createElementNS(ns,"image");
 img.setAttribute("href",asset.content);
 for(const key of ["x","y","width","height"])img.setAttribute(key,box[key]);
 img.setAttribute("preserveAspectRatio","none");
 group.append(img);toggle.disabled=false;
 toggle.checked=true;originalToggle.checked=false;
 el("photo").setAttribute("visibility","hidden");group.setAttribute("visibility","visible");
}
const fullButton=document.getElementById("show-full-map");
function restoreFullView(){
 if(!fullViewBox)return;
 document.getElementById("reset-connection-zoom").click();
 scene.setAttribute("viewBox",fullViewBox);
 fullButton.disabled=false;
}
fullButton.addEventListener("click",restoreFullView);
document.getElementById("show-beautified-map").addEventListener("change",e=>{
 el("beautified").setAttribute("visibility",e.target.checked?"visible":"hidden");
 if(e.target.checked){el("photo").setAttribute("visibility","hidden");document.getElementById("show-original-map").checked=false;}
 scene.dispatchEvent(new Event("semafory:project-changed"));
});
document.getElementById("show-original-map").addEventListener("change",e=>{
 el("photo").setAttribute("visibility",e.target.checked?"visible":"hidden");
 if(e.target.checked){el("beautified").setAttribute("visibility","hidden");document.getElementById("show-beautified-map").checked=false;}
 scene.dispatchEvent(new Event("semafory:project-changed"));
});

const directionsToggle=document.getElementById("show-directions");
directionsToggle.addEventListener("change",()=>{
 document.getElementById("directions-layer").setAttribute("visibility",directionsToggle.checked?"visible":"hidden");
});
