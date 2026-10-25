# Semafory – veřejná hra a dopravní simulace

**Aktuální verze veřejné hry: 2.5.46** · [Otevřít hru](https://jhalasz.github.io/semafory/hra.html)

## Účel a oddělení od Builderu

Veřejná hra zobrazuje dopravní provoz na křižovatce; návštěvník nepotřebuje rozhraní Builderu. Aktuální verze načítá zveřejněný projekt **Massag 4**. Import a správa dalších křižovatek v Builderu **samy o sobě neznamenají**, že je lze již přepínat ve veřejné hře nebo vybírat jako levely.

Zásadní architektonické pravidlo: fyzika, odstupy, reakce, přednosti a další pravidla mají být univerzální. Konkrétní křižovatka dodává pouze data sítě, trajektorií, návazností, semaforů a jejich konfiguraci. Cílem dalšího vývoje je výběr křižovatky a její pozdější přiřazení k hernímu levelu.

## Ovládání aktuální hry

- **Spustit**, **Pozastavit**, **Nová simulace**.
- **Zapnout semafory** a **Ruční ovládání semaforů**.
- **TEST: nezávislé semafory bez kontroly** – experimentální režim bez spřažení a bezpečnostních intervalů. V aktuálním rozhraní jsou tři samostatně ovladatelné semafory (S01, S02 a S03); neinterpretovat tento režim jako pravidla reálné křižovatky.
- **Začátek dne** (čas), **Intenzita dopravy** (násobitel) a **Rychlost** simulace.
- **Diagnostika vozidla** – výběr/kliknutí na vozidlo a zobrazení jeho aktuálních důvodů zastavení či přednosti.
- **Export diagnostiky** – JSON se záznamy aktuálních vozidel. Historie vozidel, která již odjela, se podle popisku hry neuchovává.
- **Statistika dopravy podle směrů** – dokončené průjezdy a vozidla na mapě; při nové simulaci se statistika vynuluje.

## Současné fungování simulace

- Veřejná hra používá konfiguraci a geometrická data zveřejněného projektu Massag 4; fotomapa a logické vektorové vrstvy sdílejí souřadnice.
- Denní profil provozu: hodiny 7–17 se opírají o kordonový průzkum; ostatní hodiny jsou odhadované. Celý modelový den je nastaven na 120 minut skutečného běhu.
- Modelové měřítko pohybu: **8 jednotek SVG / metr**, volná rychlost osobního vozidla je v aktuálním popisu omezena na 50 km/h.
- Fyzikální krok **0,01 s** nezávisí na zvoleném násobiteli rychlosti; vykreslení probíhá po snímcích.
- Při rozpoznané srážce se simulace zastaví; obnovit ji lze spuštěním nové simulace.
- V běžné konfiguraci Massagu je historicky popsáno spřažení S01+S03, střídání S02 a vypnutý S04. Testovací režim umožňuje nezávislé ruční přepínání bez bezpečnostní kontroly.

**Upozornění:** jde o vyvíjený simulační model, nikoli certifikovaný dopravně-inženýrský výpočet. Reálné intenzity jsou částečné a pohyb či rozhodování řidičů podléhá průběžné kalibraci.

## Struktura zdrojů

- `hra.html` – samostatné veřejné rozhraní (2.5.46).
- `js/play.js` – načtení zveřejněného projektu, vykreslení, průběh simulace, statistika a diagnostika.
- `js/vehicle-dynamics.js`, `js/driver-behavior.js` – model pohybu a chování řidičů.
- `js/signal-controller.js` – řízení semaforů.
- `js/topology.js`, `js/connections.js`, `js/conflict-core.js` – související univerzální dopravní komponenty (jejich konkrétní zapojení ověřovat v importech).

## Další plánované směry vývoje

1. Datově načítat a vybírat různé křižovatky nezávisle na společném simulačním jádru.
2. Přiřazovat křižovatky herním levelům.
3. Postupně zpřesňovat univerzální pravidla provozu, vyhodnocování konfliktů, provozní profily a kalibraci, bez regresí již opraveného řazení vozidel a trajektorií.

Dokumentace konfigurace a úprav geometrie je v [BUILDER.md](BUILDER.md).
