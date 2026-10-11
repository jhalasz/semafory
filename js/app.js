import {createConnectionEditor} from "./connection-editor.js?v=1.3";\nlet connections=null;
const ns="http://www.w3.org/2000/svg";
const keys=[["photo","Původní fotomapa","#64748b"],["beautified","Upravená mapa","#39a78e"],["markings","Vodorovné značení","#fff"],["lanes","Logické jízdní pruhy","#61cbf4"],["routes","Trajektorie","#ffc000"],["entry","Řídicí hranice","#7030a0"],["signals","Semafory","#00b050"],["other","Ostatní objekty","#aaa"]];
const scene=document.getElementById("scene"),ph=document.getElementById("placeholder"),status=document.getElementById("status"),note=document.getElementById("diagnostic"),input=document.getElementById("photo");
const el=k=>document.getElementById(k+"-layer");
let fileUrl=null;
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
function clear(){if(connections){connections.dispose();connections=null;}document.getElementById("export-connections").disabled=true;for(const [k] of keys)el(k).replaceChildren();document.getElementById("import-defs").replaceChildren();document.getElementById("connections-layer").replaceChildren();document.getElementById("connection-report").textContent="Nahraj SVG pro kontrolu napojení.";}
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
 ph.setAttribute("visibility","hidden");status.textContent=name;
 note.textContent="Import dokončen. "+keys.map(([k,n])=>n+": "+(count[k]||0)).join("; ");
 const result=inspectConnections(scene);
 document.getElementById("connection-report").textContent="Koncové body modrých pruhů: "+result.lanes+" · oranžových tras: "+result.routes+" · přesně spojeno: "+result.connected+" · drobné mezery: "+result.gaps+" · nejednoznačné: "+result.ambiguous+" · nenalezená návaznost: "+result.missing+". Tolerance "+result.tolerance.toFixed(1)+" jednotek SVG (orientační). Zatím se nic automaticky neupravuje.";
}
input.onchange=async()=>{
 const f=input.files[0];if(!f)return;
 try{
  if(f.name.toLowerCase().endsWith(".svg"))svgImport(await f.text(),f.name);
  else{
   const url=URL.createObjectURL(f),img=new Image();
   await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url;});
   if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=url;clear();
   scene.setAttribute("viewBox","0 0 "+img.naturalWidth+" "+img.naturalHeight);scene.style.aspectRatio=img.naturalWidth+"/"+img.naturalHeight;
   const e=document.createElementNS(ns,"image");e.setAttribute("href",url);e.setAttribute("width",img.naturalWidth);e.setAttribute("height",img.naturalHeight);el("photo").append(e);
   ph.setAttribute("visibility","hidden");status.textContent=f.name;note.textContent="Fotomapa načtena.";
  }
 }catch(e){status.textContent="Chyba importu";note.textContent=e.message;}
};
document.getElementById("reset").onclick=()=>{clear();input.value="";if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=null;ph.setAttribute("visibility","visible");status.textContent="Čeká na podklad";note.textContent="";};

document.getElementById("show-connections").addEventListener("change",e=>document.getElementById("connections-layer").setAttribute("visibility",e.target.checked?"visible":"hidden"));
\ndocument.getElementById("export-connections").addEventListener("click",()=>{if(!connections)return;const data={format:"semafory-connections-1.0",source:status.textContent,connections:connections.export()};const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="semafory-spoje.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});\n