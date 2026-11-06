# OB – ersättning för obekväm arbetstid

OB räknas i `schemawebb/statisk/ob.js`, som används av både webben och lättversionen. Det är en uppskattning för planering och budget. Den faktiska utbetalningen följer lönesystemet och eventuella lokala avtal.

## Källa

AB 25 § 21 mom. 1, i lydelse 2025-04-01 (Sveriges Kommuner och Regioner). Beloppen har kontrollerats mot SKR:s PDF av AB 25. Detta är **centralt avtal**, inte lag och inte lokala regler.

| Gäller | A | A natt | B | B natt | C | D |
|---|---:|---:|---:|---:|---:|---:|
| 2025-04-01 – 2026-03-31 | 126,90 | 152,30 | 66,10 | 76,00 | 56,70 | 25,60 |
| 2026-04-01 – 2027-03-31 | 130,70 | 156,90 | 68,10 | 78,30 | 58,40 | 26,40 |

Kronor per timme. HÖK 25 med Kommunal gäller till och med 2027-03-31.

- **Efter 2027-03-31** finns ingen kontrollerad nivå. Där räknas OB-tid men inga kronor, och gränssnittet säger det.
- **När ett nytt avtal har kontrollerats** läggs en ny daterad rad till i `NIVAER`. Gamla rader ska ligga kvar.
- **Belopp räknas aldrig upp med procent.**

## Kategorier

Kategorierna prövas i ordningen A, sedan B, sedan C och D.

**A, storhelg.** Gäller under tre perioder:
- påsk: från kl. 18 dagen före långfredagen till kl. 07 dagen efter annandag påsk
- midsommar: från kl. 18 dagen före midsommarafton till kl. 07 vardagen närmast efter aftonen
- jul och nyår: från kl. 18 dagen före julafton eller nyårsafton till kl. 07 vardagen närmast efter aftonen; lördag räknas inte som en sådan vardag

Nattförhöjning gäller kl. 22–06 natt mot helgdag. Påsk-, midsommar-, jul- och nyårsafton räknas här som helgdagar.

**B, helg.** Gäller när A inte gäller:
- hela lördagen, söndagen och helgdagar
- en dag som både föregås och följs av söndag eller helgdag (jul- och nyårsafton räknas som helgdag)
- kl. 16–24 vardagen närmast före trettondag jul, första maj, Kristi himmelsfärdsdag, nationaldagen och alla helgons dag
- kl. 00–07 på måndagar och på vardagen närmast efter trettondag jul, första maj, Kristi himmelsfärdsdag och nationaldagen
- kl. 17–24 på fredagar

Nattförhöjning gäller kl. 22–06 natt mot lördag, söndag och helgdag.

**C, vardagsnatt.** Kl. 22–24 måndag–torsdag och kl. 00–06 tisdag–fredag.

**D, vardagskväll.** Kl. 19–22 på vardagar.

”Vardag” betyder dag som inte är söndag eller helgdag. Lördag räknas alltså som vardag, i lagens mening. Helgdagarna räknas fram för varje år: påsk med Meeus algoritm, midsommardagen som lördagen 20–26 juni och alla helgons dag som lördagen 31 oktober–6 november.

## Grundschema och kalender

Ett grundschema har schemaveckor, inte datum. Fältet `startdatum` (en måndag) kopplar vecka 1 till verkliga datum. Två beräkningar görs:

- **Period:** en schemacykel från startdatum. Exakt tid, utan avrundning.
- **År:** 52 veckor, där cykeln upprepas. Här ingår årets helgdagar och storhelger. Tiden summeras per kalendermånad och kategori och avrundas uppåt till närmaste hel- eller halvtimme. Under en timme ger ingen ersättning (AB 25 § 21).

Om startdatum saknas väljs den senaste måndagen där hela året ryms inom kontrollerade belopp. Det står i gränssnittet att datumet är antaget.

## Förenklingar

- Rasten antas ligga mitt i passet och ger ingen OB. Nattpass med måltidsuppehåll har ingen rast.
- Alla pass behandlas som ordinarie arbetstid. Regeln om OB vid mertid och övertid tillämpas inte, eftersom grundschemat bara innehåller ordinarie tid.
- Lokala, högre OB-nivåer och växling mot ledighet ingår inte.

## Kostnad

Personalkostnaden är arbetstid × `timkostnad_kr` plus OB. Timkostnaden anges utan OB, alltså lön med personalomkostnader. Kostnaden visas i översikten och per person.

## Tester

`tests/test_ob.py` kör `tests/js/ob_test.js`. Testerna täcker typfallen för fredagskväll, vardagskväll och natt, nivåbytet 1 april, månadsavrundningen, storhelgerna och nattförhöjningen.
