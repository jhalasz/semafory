# Semafory — Intersection Builder

Webový projekt pro přípravu silničních křižovatek a budoucí univerzální dopravní simulaci.

## Zásady
- Dopravní pravidla jsou nezávislá na křižovatkách i rendereru.
- Simulační logika je nezávislá na křižovatkách i rendereru.
- Křižovatky obsahují data, nikoli vlastní dopravní logiku.
- Fotomapa a vektorové vrstvy používají společné souřadnice; zkrášlení nesmí měnit geometrii.
- Skutečné vodorovné značení je bílé a oddělené od fakticky používaných, nevyznačených pruhů.

## Aktuální stav
První kontrolní prohlížeč vrstev: import PNG/JPEG/WebP fotomapy, zapínání/vypínání vrstev, průhlednost a mobilní rozhraní.

**Zatím neumí** import PowerPointu, kreslení objektů, ukládání, vytváření upravené fotomapy ani simulaci dopravy.

## Publikování
GitHub Pages: Settings → Pages → Deploy from a branch → main / (root).