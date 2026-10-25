# Dopravní model Kaple – poměry provozu

Zdroj: pracovní dohoda v projektu Semafory, 21. 9. 2026. Toto jsou **modelové poměry pro Kapli**, nikoliv přímo naměřené intenzity generelu.

## Směrové proudy (100 vozidel)

- 59 %: Nová cesta → Nová cesta, průjezd rovně
- 35 %: Nová cesta ↔ Čs. armády
- 5 %: Nová cesta ↔ Radotínská
- 1 %: Čs. armády ↔ Radotínská

Souhrnné příjezdy podle pracovního modelu: Nová cesta A 39,5 %, Nová cesta B 39,5 %, Čs. armády 18 %, Radotínská 3 %.

**Důležité:** Čísla se nesmějí mechanicky přiřadit k T01–T12 jiného projektu: identifikátory T jsou lokální pro konkrétní SVG a přiřazení vyžaduje ověření napojení ulic a směrů. Až bude příslušná křižovatka publikovaná a identifikátory průjezdů budou určeny, vloží se tento poměr do `game.trafficWeights` její položky v `projects/index.json`.

## Massag

Průzkum duben 2018: 9 060 vozidel, šest směrů. Poměry průjezdů i počty nákladních jsou uloženy v `projects/index.json` pro Massag 4. `truckShareByMovement` umožňuje u každého směru samostatný poměr nákladních aut. Nejde o globální pětiprocentní podíl.

## Velikost aut ve hře 2.6.3

Osobní vozidlo 28,8 × 11,52 SVG jednotek, nákladní vozidlo 51,2 × 16 SVG jednotek. Rozměry byly oproti 2.6.2 sníženy o 20 % v jednotném fyzikálním modelu `js/vehicle-dynamics.js` (vykreslení, vzdálenostní model, kolizní obálka).

## Použití ve hře 2.6.9

Poměr náleží ke křižovatce Kaple; v katalogu `projects/index.json` jsou nyní naváženy všechny průjezdy T01–T12 (59 % T05/T07; 35 % T01/T03/T04/T08; 5 % T06/T09/T10/T12; 1 % T02/T11). Rozdělení mezi průjezdy v každé skupině je prozatím rovnoměrný pracovní předpoklad.
