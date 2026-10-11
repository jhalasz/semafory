// Vizuální editor pouze spravuje vrstvy. Dopravní pravidla a simulace sem nepatří.
const layers = [
  {id:"photo-layer", label:"Původní fotomapa", color:"#64748b"},
  {id:"beautified-layer", label:"Upravená mapa", color:"#39a78e"},
  {id:"markings-layer", label:"Vodorovné značení", color:"#ffffff"},
  {id:"lanes-layer", label:"Logické jízdní pruhy", color:"#37b5ed"},
  {id:"routes-layer", label:"Trajektorie", color:"#f59e0b"},
  {id:"entry-layer", label:"Řídicí hranice", color:"#a855f7"},
  {id:"signals-layer", label:"Semafory", color:"#22c55e"}
];
const svg = document.getElementById("scene");
const photo = document.getElementById("photo-layer");
const placeholder = document.getElementById("placeholder");
const status = document.getElementById("status");
const root = document.getElementById("layers");
let imageUrl = null;
for (const layer of layers) {
  const g = document.getElementById(layer.id);
  const wrap = document.createElement("div");
  wrap.className = "layer";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = true; cb.id = "show-"+layer.id;
  cb.addEventListener("change", () => g.setAttribute("visibility", cb.checked ? "visible":"hidden"));
  const swatch = document.createElement("span");
  swatch.className = "swatch"; swatch.style.background = layer.color;
  const label = document.createElement("label");
  label.htmlFor = cb.id; label.textContent = layer.label;
  const alpha = document.createElement("input");
  alpha.type = "range"; alpha.min="0"; alpha.max="100"; alpha.value="100";
  alpha.setAttribute("aria-label", "Průhlednost: "+layer.label);
  alpha.addEventListener("input", () => g.setAttribute("opacity", String(Number(alpha.value)/100)));
  wrap.append(cb, swatch, label, alpha); root.append(wrap);
}
document.getElementById("photo").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  const nextUrl = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=reject; img.src=nextUrl; });
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl=nextUrl;
    const w=img.naturalWidth, h=img.naturalHeight;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.aspectRatio=`${w}/${h}`;
    photo.setAttribute("width", String(w));
    photo.setAttribute("height", String(h));
    photo.setAttribute("href", imageUrl);
    photo.setAttribute("visibility",document.getElementById("show-photo-layer").checked?"visible":"hidden");
    placeholder.setAttribute("visibility","hidden");
    status.textContent=`${file.name} (${w} × ${h})`;
  } catch {
    URL.revokeObjectURL(nextUrl);
    status.textContent="Soubor obrázku se nepodařilo načíst.";
  }
});
document.getElementById("reset").addEventListener("click", () => {
  if(imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl=null;
  photo.removeAttribute("href"); photo.setAttribute("visibility","hidden");
  placeholder.setAttribute("visibility","visible");
  svg.setAttribute("viewBox","0 0 1000 700");
  svg.style.aspectRatio="10/7";
  document.getElementById("photo").value="";
  status.textContent="Čeká na fotomapu";
});