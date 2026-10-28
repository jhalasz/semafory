# Semafory

Webová aplikace pro přípravu křižovatek a experimentální simulaci dopravního provozu.

## Dvě oddělené části projektu

| Část | Aktuální verze | Dokumentace | Aplikace |
| --- | --- | --- | --- |
| Intersection Builder | **2.6.14** | [BUILDER.md](BUILDER.md) | [Otevřít Builder](https://jhalasz.github.io/semafory/) |
| Veřejná hra | **2.6.14** | [HRA.md](HRA.md) | [Otevřít hru](https://jhalasz.github.io/semafory/hra.html) |

**Builder** připravuje a ukládá projekty křižovatek (SVG, vrstvy, návaznosti a nastavení). **Hra** vykonává dopravní simulaci a ve verzi 2.6.4 umí přepínat mezi zveřejněnými i místními projekty křižovatek. Číslování verzí je oddělené.

## Architektonické zásady

- Dopravní předpisy, pohyb a rozhodování vozidel patří do univerzálního jádra, ne do dat jedné křižovatky.
- Každá křižovatka je samostatný datový projekt; nové projekty nesmějí přepsat předchozí konfigurace.
- Fotomapa a vektorové prvky používají společné souřadnice; změna vzhledu nebo zoomu nesmí měnit geometrii.
- Bílé reálné vodorovné značení je oddělené od logických, nemusících být nakreslených pruhů.
- Hra 2.6.4 umožňuje volbu křižovatky; dalším krokem je jejich přiřazování herním levelům.

## Publikování

Statické stránky GitHub Pages: `main` / kořen repozitáře. Změny v Builderu se nepromítají automaticky do verze nebo nastavení veřejné hry.

## Dokumentace

- [BUILDER.md](BUILDER.md) – import SVG, projekty, bezpečnost změn, vrstvy, zoom, historie verzí.
- [HRA.md](HRA.md) – ovládání simulace, semafory, statistika, model a plánované funkce.
