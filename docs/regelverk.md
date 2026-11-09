# Regelverk för en enhet

Användarens beslut 2026-11-09 (beslut 36 i `regelhierarki.md`). En enhet kan följa ett av tre färdiga regelverk. Det väljs under **Regler**: *Inställningar → Regler* i webben, fliken *Regler* i telefonen.

| Regelverk | Heltid | Pass | Helger | Källa |
|---|---|---|---|---|
| **Dag, kväll och helgrotation** | 37 h (lokal standard) | dag och kväll, natt för nattpersonal, 4,75 pass/vecka | varannan helg | Verksamhetens värde. AB 25 § 13 mom. 2 anger 38 h 15 min vid arbete både vardag och helg; användaren har valt 37 h. |
| **40-timmarsvecka, dagtid mån–fre** | 40 h | bara dagpass mån–fre, 5 pass/vecka | inga | AB 25 § 13 mom. 2: ”40 timmar per helgfri vecka”. |
| **Funktionsstöd med Bilaga J** | 37 h (lokal standard) | som dag/kväll/helg, och arbetspass + jour i följd | varannan helg | AB 25 § 13 mom. 5 och Bilaga J (lydelse 2024-04-01). Se *Jour* nedan. |

## Hur det fungerar

- Ett regelverk sätter värden som annars ställs in för hand: heltid, lokala regler (`regler`) och undantag (`avvikelser`). Fältet `regelverk` sparar vilket som valts.
- Innan något ändras visas vad som ändras, och användaren bekräftar.
- Avtal och lag ändras aldrig: dygnsvila, veckovila och rast gäller i alla tre.
- 40-timmarsveckan har ingen helgtjänstgöring. Varannan helg låses då upp för enheten (`avvikelser: ["helgfrekvens"]`) och syns som en avvikelse, på samma sätt som när den låses upp för hand.
- Byter man regelverk återställs först det förra regelverkets värden. Det som har låsts upp för hand ligger kvar.
- 40-timmarsveckan ändrar också medarbetarna (utom nattpersonal) till bara dagpass och sätter helgbehovet till 0. Behov på kväll eller natt ändras inte. Det visas i stället som en varning: *Stämmer inte med regelverket*.

## Jour (Bilaga J)

AB 25 § 13 mom. 5 tillåter undantag från dygnsvilan bara vid kombination av arbete och jour, och bara när det finns särskilda skäl i verksamhet med ansvar för liv, hälsa och säkerhet. Då gäller:
- Den sammanlagda arbetstiden får vara högst 20 timmar.
- Vilan efteråt ska vara minst lika lång som den sammanlagda arbetstiden.
- Arbetsgivaren ska begära MBL-förhandling innan arbetspass och jour läggs i följd.

Användaren har valt att funktionsstödets regelverk ska ha *arbetspass och jour i följd* (inte sovande jour som egen passtyp och inte dygnspass upp till 24 timmar).

### Så fungerar jouren

- När regelverket *Funktionsstöd med Bilaga J* väljs får enheten jour efter kvällspasset, 22:00–07:00, en per natt. Under **Behov → Jour** ändras när jouren slutar och hur många jourer det ska vara natten efter varje veckodag.
- Jouren börjar när kvällspasset slutar (`kvall_slut`), alltså i direkt anslutning.
- Motorn väljer vem som har jour. Kvällspass och jour är högst 20 timmar sammanlagt. Dagen efter jouren är ledig, och nästa pass börjar tidigast när vilan efter jouren är minst lika lång som pass och jour tillsammans.
- Jour är inte vila. För veckovilan räknas jouren som upptagen tid. Undantaget från dygnsvilan gäller bara kombinationen pass + jour.
- Jourbehovet är mjukt, på samma nivå som behovet. En natt som saknar jour syns som *vakant jour* (`jourvakanser`, nyckeltalet `jour_saknas`).
- Jouren räknas inte som ordinarie arbetstid i DODEX: passets arbetstid är kvällspasset. Hur jourtid ersätts står i Bilaga J. Det räknas inte här.
- En medarbetare kan undantas från jour med `personal[].jour: false`.
- I schemat står **+J 07:00** på kvällspasset som följs av jour.

### Krock med de lokala helgreglerna

Jour fredag och lördag natt kräver ledig dag efter. Med hel arbetshelg och *ingen fredagskväll före ledig helg* arbetar den som har kväll fredag eller lördag hela helgen. Därför går det inte att lägga jour de nätterna med varannan helg. Regelverket varnar för det. Det som går att göra: ha jour söndag–torsdag, låta några ha andra helgregler (undantag per person), eller ändra de lokala helgreglerna för enheten. Det är ett beslut för verksamheten (öppen fråga i `regelhierarki.md`).

### Källa

Kravet på högst 20 timmar och efterföljande vila är kontrollerat mot AB 25 i lydelse 2025-04-01 (§ 13 mom. 5). Enligt SKR:s redogörelse för AB 25 ändrades inte Bilaga J 2025. Bilagans egen text (lydelse 2024-04-01) gick inte att hämta när det här byggdes, så ersättning för jour räknas inte.

## Teknik

- `schemawebb/statisk/regelverk.js` (RV): `LISTA`, `andringar`, `tillampa`, `varningar` och `kort`. Delas av webben och lättversionen.
- `schemamotor/modell.py`: fälten `regelverk`, `jour` och `personal[].jour`.
- Jouren: `schemamotor/build.py` (variablerna `j`, `JOUR_MAX`), `justera.py`, `validate.py` (regeln JOUR, nivå avtal, och vakant jour), `light/motor.js` (`jourDag`, `jourFor`) och `light/granskning.js`. `explain.py` behöver ingen regelgrupp: jouren väljs av motorn och kan aldrig göra schemat olösbart.
- Testfall: `tests/fall/regelverk_40_timmar.json`, `jour_bilaga_j.json` (jour söndag–torsdag natt) och `jour_over_20_timmar.json` (jour 22–15 blir över 20 timmar, så ingen jour läggs). Tester: `tests/test_regelverk_enhet.py` och `tests/test_jour.py`.
