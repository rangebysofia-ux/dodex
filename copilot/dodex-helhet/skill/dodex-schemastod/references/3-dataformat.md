# 3 Dataformat

## Excel från DODEX Scheduler (Exportera → Excel)

Fliken **Schema**:
- A1: enhetens namn. A2: "6 veckor, cykliskt · vakanta pass 0 · vakanta tidpunkter 0".
- Rad 4: "Vecka 1", "Vecka 2" … över sju kolumner var.
- Rad 5: "Person" i kolumn A, därefter mån, tis, ons, tor, fre, lör, sön för varje vecka.
- Från rad 6: en rad per person. Kolumn A = id-kod. Cellerna: "D 07:00–15:15" (dag), "K 14:00–22:00" (kväll), "N 21:45–06:45" (natt), tom = ledig. Tillägg: "◼R" = resurspass utöver behovet, "★ namn" = aktivitet.
- Under personerna: raden "Vakant" (vakanta pass per dag) och raderna "I tjänst dag", "I tjänst kväll" och "I tjänst natt".

Fliken **Per person**: id, pass, timmar, kontrakterade timmar, kvällspass, helggrupp.
Fliken **Vakanser**: vecka, dag, dygnsdel eller klockslag, antal.
Fliken **Granskning**: regel, nivå, person, beskrivning, typ (brott eller att notera).
Fliken **Bemanningsbalans** (om den finns): budget, behov och bemanning i timmar och årsarbetare.

## Andra scheman

Ett schema från ett annat system eller en egen Excel kan läsas om det har en rad per person och en kolumn per dag. Fråga efter:
- vilka koder som betyder dag, kväll, natt och ledigt, och passens tider,
- vilken veckodag första kolumnen är,
- behovet per dag och dygnsdel.

## Behov

Vardag och helg per dygnsdel, till exempel: vardag dag 3, kväll 3, natt 1; helg dag 2, kväll 2, natt 1. Egna rader för enskilda dagar (fredag) går före.

## Indata till DODEX (JSON)

För den som vill lägga schemat i DODEX: `veckor`, `cykliskt`, `behov` {vardag/helg: {morgon, kvall, natt}}, `personal` [{id, grad, dygnsdelar, helgfrekvens, extra_helgpass}], `regler`, `onskemal`. Dygnsdelen dag heter `morgon` i filerna.
