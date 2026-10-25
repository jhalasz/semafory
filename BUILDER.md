# Semafory – Intersection Builder

**Aktuální verze: 2.6.3** · [Otevřít Builder](https://jhalasz.github.io/semafory/)

## Účel

Builder slouží k přípravě, kontrole a uchovávání **samostatných projektů křižovatek**. Konkrétní křižovatka obsahuje geometrii a nastavení; dopravní předpisy a obecná simulační logika mají zůstat nezávislé na konkrétním projektu.

- Vstup: SVG (včetně exportu z PowerPointu) nebo samostatný rastrový podklad PNG/JPEG/WebP. Úplný editovatelný projekt vyžaduje SVG s příslušnými vrstvami.
- Původní fotomapa, případná upravená mapa, skutečné bílé vodorovné značení, logické jízdní pruhy, trajektorie, řídicí hranice a semafory mají společné souřadnice. Úpravy vzhledu nesmí měnit geometrii tras.
- Při importu se automaticky vypustí celostránkový bílý obdélník exportu PowerPointu a pracovní pohled se přizpůsobí obsahu SVG s malým okrajem. Pravidlo platí pro všechny křižovatky.

## Projekty a bezpečné ukládání

- **Nová prázdná křižovatka**, **Uložit jako novou křižovatku (kopie)**, přejmenování, místní ukládání, otevření uloženého projektu, import a export celého projektu.
- Projekty v prohlížeči se spravují samostatně. Založení nového projektu ani import nemají přepsat původní Massag.
- Export kompletního projektu je JSON (`.semafory.json`): obsahuje původní SVG a uložená nastavení, mimo jiné směry, potvrzené návaznosti, průjezdy, konflikty, parametry chování řidičů a viditelnost.
- Místní úložiště je vázané na konkrétní prohlížeč/profil; **automatické uložení není publikování na GitHub**. Zálohy pravidelně exportovat do souboru.
- Výběr projektu z GitHubu vychází z `projects/index.json`. Na webu se projekty pouze načítají; uživatelské tlačítko „Uložit v prohlížeči“ nedělá commit do repozitáře.

## Import SVG a aktualizace

Import roztřídí prvky především podle barvy a typu SVG: fotomapa, značení, jízdní pruhy (světle modrá), trajektorie (žlutá), hranice (fialová), semafory (zelená) a ostatní. Následně vytvoří diagnostiku návazností, editor směrů, editor řízených průjezdů a náhled kolizních oblastí.

**Aktualizovat SVG v otevřeném projektu (zachovat nastavení)** je bezpečnostně omezená operace: porovná počty, typy a pořadí relevantních prvků, připustí jednu změněnou trajektorii bez změny pruhů/hranice/semaforů, vyžádá potvrzení, stáhne zálohu a obnoví původní nastavení; při nekonzistenci se pokusí vrátit původní projekt. Novou křižovatku importovat jako nový projekt, ne touto funkcí.

## Ovládání náhledu

- Kolečko myši nad mapou mění přiblížení směrem k poloze ukazatele.
- Posuvník **Přiblížení** nad mapou nastavuje přibližně 100–800 %. Tlačítko **100 %** vrátí celý pohled.
- Panel **Zobrazit celou mapu** obnoví výchozí výřez. Výběr bodu návaznosti může mapu samostatně přiblížit.
- Každou vrstvu lze zapnout/vypnout a nastavit její průhlednost.
- Přibližování mění pouze SVG `viewBox`, **nikoli souřadnice uložené geometrie**.

## Struktura zdrojů

- `index.html` – rozhraní Builderu.
- `js/app.js` – import, skládání vrstev, přibližování a správa projektů.
- `js/project-store.js` – lokální úložiště.
- `js/connection-editor.js`, `js/directions.js`, `js/movement-editor.js`, `js/conflict-editor.js` – specializované editory.
- `css/style.css` – rozvržení a vzhled Builderu.
- `projects/` – zveřejněné projektové soubory a index.

## Stav a omezení

Builder není plnohodnotný grafický editor PowerPointu: geometrie se primárně připravuje v SVG a v aplikaci se diagnostikuje a konfiguruje. Režim aktualizace SVG záměrně odmítá strukturální změny, které by mohly přepárovat uložené identifikátory. Ovládání hry je samostatné a popsané v [HRA.md](HRA.md).

## Historie verzí

- **2.6.0:** samostatné projekty křižovatek a import/export konfigurace.
- **2.6.1:** první pokus o automatický ořez výřezu; nepokrýval zobrazený bílý obdélník.
- **2.6.2:** skutečné odstranění celostránkového bílého pozadí ze zobrazení při importu SVG.
- **2.6.3:** kolečko myši, posuvník zoomu a reset na 100 %.

> Verze Builderu a veřejné hry se vyvíjejí **nezávisle**. Aktuální veřejná hra není automaticky aktualizována při změně Builderu.
