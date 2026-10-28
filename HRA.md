# Semafory – veřejná hra a dopravní simulace

**Aktuální verze veřejné hry: 2.6.11** · [Otevřít hru](https://jhalasz.github.io/semafory/hra.html)

## Verze 2.6.11 – více křižovatek

Hra už není pevně svázaná s jediným souborem Massag 4. V horním ovládacím panelu je výběr **Křižovatka** a hra umí načíst dva druhy projektů:

- **GitHub** – zveřejněné křižovatky uvedené v `projects/index.json`;
- **místní** – projekty uložené Intersection Builderem v IndexedDB stejného prohlížeče.

Přepnutí křižovatky znovu sestaví síť, trajektorie, semafory, statistiku i konfiguraci simulace. Původní projekt se nepřepisuje. Poslední zvolená křižovatka se pamatuje v prohlížeči.

V katalogu je nyní zveřejněn **Massag 4**. Další křižovatku lze před zveřejněním testovat přímo jako místní projekt z Builderu.

## Oddělení univerzální logiky a dat křižovatky

Simulační jádro je společné pro všechny křižovatky. Do projektu nebo jeho herní konfigurace patří geometrie, směry, průjezdy, semafory, priority, dopravní intenzity a specifické fyzické návaznosti.

Verze 2.6.11 odstranila z herního jádra dřívější pevné vazby na Massag:

- hra už nenačítá natvrdo `projects/massag-4.json`;
- sdílený příjezd Opavské není rozpoznáván přes pevná ID `T03/P01`;
- rozdělení pruhů nemá pevnou souřadnici;
- hlavní/vedlejší komunikace nejsou určeny pevnými ID `P03/P04`;
- poměry jednotlivých směrů, podíl nákladních aut a denní profil nejsou globální konstanty;
- tlačítka semaforů se vytvářejí podle právě načteného projektu.

Pohyb vozidel, odstupy, detekce geometrických konfliktů, levé odbočení, přednosti mezi konfliktními proudy a řízení semaforů zůstávají ve společném jádru.

## Herní konfigurace projektu

Zveřejněné projekty mohou mít v `projects/index.json` položku `game`. Ta může obsahovat například:

- `roadPriorityByLane` / `roadPriorityByMovement` – prioritu příjezdů;
- `trafficWeights` – relativní zastoupení jednotlivých průjezdů;
- `dailyProfile` – 24hodinový profil intenzity;
- `baseSpawnRate` – základní četnost vzniku vozidel;
- `truckShare` – podíl nákladních vozidel;
- `sharedApproaches` – deklaraci společného fyzického příjezdu před rozdělením;
- `signalLabels` – názvy semaforů v ovládání;
- `freeSignals`, `yieldRules` a případný záložní `signalPlan`.

U Massagu 4 je v katalogu zachována dosavadní kalibrace dopravy, hlavní/vedlejší komunikace, společný příjezd Opavské, S04 bez světelného řízení a pravidlo přednosti T06 vůči T02.

Nový místní projekt bez zvláštní herní konfigurace lze také otevřít. Pro test použije rovnoměrné směrové zastoupení, plochý denní profil a neutrální prioritu; pokud obsahuje semafory bez platného fázového plánu, hra vytvoří jednoduchý testovací plán. Takový fallback slouží k ověření geometrie, nikoli jako finální dopravní nastavení.

## Ovládání

- **Křižovatka** – přepnutí mezi zveřejněnými a místními projekty.
- **Spustit**, **Pozastavit**, **Nová simulace**.
- **Zapnout semafory** a **Ruční ovládání semaforů**.
- **TEST: nezávislé semafory bez kontroly** – experimentální režim, ve kterém lze jednotlivé řízené semafory přepínat samostatně bez bezpečnostních intervalů.
- **Začátek dne**, **Intenzita dopravy** a **Rychlost**.
- **Diagnostika vozidla** a **Export diagnostiky**.
- **Statistika dopravy podle směrů**.

## Simulační model

- Fyzikální krok je **0,01 s** a je oddělený od rychlosti vykreslení.
- Modelové měřítko zůstává **8 jednotek SVG / metr**; osobní vozidlo má při volné jízdě limit 50 km/h.
- Vozidla používají geometrické obálky pro sledování odstupu a kontrolu kolizí.
- Při rozpoznané srážce se simulace zastaví.
- U Massagu 4 je zachován dosavadní kalibrovaný dopravní profil; ostatní projekty mohou mít vlastní data.

**Upozornění:** jde o vyvíjený simulační model, nikoli certifikovaný dopravně-inženýrský výpočet. Nové křižovatky vyžadují vlastní kontrolu priorit, intenzit a provozní konfigurace.

## Struktura zdrojů

- `hra.html` – veřejné rozhraní hry 2.6.
- `js/play.js` – výběr projektu, sestavení sítě, simulace, statistika a diagnostika.
- `js/project-store.js` – přístup k místním projektům vytvořeným Builderem.
- `js/vehicle-dynamics.js`, `js/driver-behavior.js` – univerzální model pohybu a chování.
- `js/signal-controller.js` – univerzální řízení semaforů.
- `projects/index.json` – katalog zveřejněných křižovatek a jejich herní konfigurace.
- `projects/*.json` – jednotlivé zveřejněné projekty.

## Další směr

Dalším krokem je přiřazení křižovatek k herním **levelům**. Výběr křižovatky ve verzi 2.6.11 je technický základ: level později určí nejen projekt křižovatky, ale i režim řízení, cíle a obtížnost.

Dokumentace přípravy geometrie je v [BUILDER.md](BUILDER.md).

## Historie

- **2.5.46:** poslední verze pevně načítající Massag 4.
- **2.6.11:** výběr více křižovatek, lokální projekty z Builderu, katalog zveřejněných projektů a přesun Massag-specifických parametrů z univerzálního jádra do dat.

## 2.6.11 – rozměry a intenzity

- Osobní a nákladní vozidla mají o 20 % menší fyzické a vizuální rozměry; kolizní logika používá tyto nové rozměry.
- Massag: rozdílné podíly nákladních vozidel podle šesti směrů z průzkumu duben 2018; počty a podíly jsou v katalogu projektů.
- Pracovní poměr 59 : 35 : 5 : 1 pro Novou cestu, Čs. armády a Radotínskou zdokumentován samostatně v DOPRAVA.md; na nesouvisející křižovatku Kaple se neaplikuje.

## 2.6.11 – ořez mapy

Převzat výpočet výřezu z Builderu: naimportované vrstvy se změří bez bílého exportního pozadí a přidá se 2% okraj. Výřez už neurčují pouze rozměry fotomapy. Bez změny geometrie tras a pravidel dopravy.

## 2.6.11

- Oprava přetékajícího desktopového horního panelu, který roztahoval stránku a posouval křižovatku doprava.
- Pokud je v projektu uložené `viewport.viewBox`, Player použije přesně hranice výřezu z Builderu; starší exporty nadále používají automatický odhad.
- Osobní vozidlo 22,4 × 9 jednotek, nákladní 40 × 13 jednotek (grafika i kolize).

## 2.6.11 – maska fotomapy

Player znovu aplikuje ořezovou masku původního SVG (`clipPath`) na samostatně vykreslovanou fotomapu. Tím zabrání zobrazování částí fotografie, které Builder správně ořezává.

## 2.6.11 – ovládání semaforů u mapy

Výška herního rámečku se odvozuje od skutečného poměru stran výřezu, ne od pevné výšky okna. Tlačítka semaforů ve spodní části proto následují fotografii místo původní prázdné plochy.

## 2.6.11 – zákaz nákladních vozidel na úzkém rameni Kaple

Univerzální generátor podporuje `game.truckForbiddenLanes`. Pro Kapli jsou v katalogu zakázané P07/P08: nákladní vozidlo se nesmí vygenerovat na trase, která do některého z těchto pruhů přijíždí nebo z něj odjíždí. Rozdělení dopravy Kaple dosud není doložené dopravním průzkumem a prozatím zůstává rovnoměrné mezi dostupnými trasami; poměr 59:35:5:1 pro jinou křižovatku sem nebyl nesprávně zkopírován.

## 2.6.11 – Kaple: poměry dopravy

Do `projects/index.json` byl zanesen pracovní poměr 59 : 35 : 5 : 1 pro Kapli. 59 % sever–jih T05/T07, 35 % sever/jih–východ T01/T03/T04/T08, 5 % sever/jih–severozápad T06/T09/T10/T12, 1 % východ–severozápad T02/T11. Uvnitř skupin jsou proudy rovnoměrně rozděleny, protože samostatné intenzity pro jednotlivé směry nemáme. Zákaz nákladních na P07/P08 zachován.

## 2.6.11 – oprava významu podílů Kaple

Hodnoty 59/35/5/1 jsou podíly dopravy příjezdových větví, nikoli odbočovacích tras. Nová cesta 59 %, Čs. armády 35 %, Radlická 5 %, tovární vjezd Massag 1 % (dosud neaktivní). Generátor nyní používá `game.entryTrafficWeights`, vybere nejprve příjezd a pak pohyb rovnoměrně mezi jeho potvrzenými trasami. Aktivní podíly se normalizují ze 99. Mapování ulic na P04/P06/P01/P07 je pracovní a vyžaduje ověření.

## 2.6.11 – mobilní zobrazení a skutečný výřez

Player vypočítává viditelnou plochu z transformované ořezové masky (`clipPath`) fotomapy. Neviditelná část původního SVG už nezvětšuje rámeček a nevytváří prázdné místo pod mapou. Při přepnutí telefonu naležato je mapa jako první, před ovládacím panelem, a její velikost se přizpůsobí výšce displeje.
