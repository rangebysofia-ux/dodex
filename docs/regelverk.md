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
- **Funktionsstöd med Bilaga J** kan bara väljas för enheter som ligger under LSS i Organisation, eller under en grupp vars namn innehåller LSS eller funktionsstöd (användarens beslut 2026-11-09). Andra enheter ser en rad om det i stället för valet. Har en enhet redan Bilaga J och flyttas bort från LSS tas regelverket inte bort tyst; det syns en varning.
- 40-timmarsveckan ändrar också medarbetarna (utom nattpersonal) till bara dagpass och sätter helgbehovet till 0. Behov på kväll eller natt ändras inte. Det visas i stället som en varning: *Stämmer inte med regelverket*.

## Jour (Bilaga J)

AB 25 § 13 mom. 5 tillåter undantag från dygnsvilan bara vid kombination av arbete och jour, och bara när det finns särskilda skäl i verksamhet med ansvar för liv, hälsa och säkerhet. Då gäller:
- Den sammanlagda arbetstiden får vara högst 20 timmar.
- Vilan efteråt ska vara minst lika lång som den sammanlagda arbetstiden.
- Arbetsgivaren ska begära MBL-förhandling innan arbetspass och jour läggs i följd.

Användarens beslut 2026-11-09: jouren läggs som ett **jourpass över dygnet**, som verksamheten brukar lägga dem.

### Så fungerar jourpasset

- Exempel: passet börjar 15:00, arbete till 24:00, jour 00:00–06:00 och arbete 06:00–08:00. Det räknas som **ett pass** men belastar **två arbetsdagar**: börjar det en måndag är både måndag och tisdag arbetsdagar. Det gäller för blockregler, helger och veckovila.
- Under **Behov → Jour** ändras när passet börjar och slutar, när jouren börjar och slutar, hur stor del av jourtiden som är arbetstid, och hur många jourpass som börjar varje veckodag.
- **Arbetstid:** arbetet 15–24 (med rast) och 06–08, plus hälften av jourtiden (användarens beslut, ändras under Behov). Exemplet ger 8,5 + 2 + 3 = 13,5 timmar. De andra passen blir kortare så att kontraktet stämmer.
- **Behovet:** jourpasset räknas in i kvällens bemanning samma dag och morgonens bemanning dagen efter (användarens beslut). Jourbehovet är mjukt, på samma nivå som behovet. En natt utan jourpass syns som *vakant jourpass* (`jourvakanser`, `jour_saknas`).
- **Vila:** hela passet är högst 20 timmar. Vilan efteråt ska vara minst lika lång som passet. Undantaget från dygnsvilan gäller bara inom jourpasset. Jourtiden är inte vila, så den räknas som upptagen tid för veckovilan.
- **I schemat** hänger passet ihop över båda dagarna: kvällsdelen (🌙 J 15:00–24:00) och morgondelen (☀️ 06:00–08:00) visas i full storlek med sina tider, och jourtiden däremellan som ett kort band med halva tjockleken (🛏️), utan tid. Morgondelen tar drygt halva rutan så att tiden får plats. Hela passet med jourtiden visas när man håller över eller trycker på passet.
- En medarbetare kan undantas från jourpass med `personal[].jour: false`. Jourpass går bara till dem som arbetar kväll.

### Hur många jourpass det blir

Varje jourpass tar två arbetsdagar och många timmar. Med få medarbetare räcker det inte till jourpass varje natt. I testfallet med nio personer, två på dagen och två på kvällen och jourpass måndag–torsdag läggs ungefär hälften av nätterna, utan avtalsbrott. Resten syns som vakanta jourpass. Lösaren hittar inte alltid det bästa schemat inom tidsgränsen.

### Källa

Kravet på högst 20 timmar och efterföljande vila är kontrollerat mot AB 25 i lydelse 2025-04-01 (§ 13 mom. 5). Enligt SKR:s redogörelse för AB 25 ändrades inte Bilaga J 2025. Bilagans egen text (lydelse 2024-04-01) gick inte att hämta när det här byggdes, så ersättning för jour räknas inte.

## Teknik

- `schemawebb/statisk/regelverk.js` (RV): `LISTA`, `andringar`, `tillampa`, `varningar` och `kort`. Delas av webben och lättversionen.
- `schemamotor/modell.py`: fälten `regelverk`, `jour` och `personal[].jour`.
- Jourpasset: passmallarna `JOUR-1` och `JOUR-2` i `schemamotor/build.py` (två halvor som hör ihop, `JOUR_MAX`), `justera.py`, `validate.py` (regeln JOUR, nivå avtal; `behovsdel`), `light/motor.js` (passtyperna `JA` och `JB`, `delAv`) och `light/granskning.js`. `explain.py` behöver ingen regelgrupp: jourpasset väljs av motorn och kan aldrig göra schemat olösbart, och ett pass över 20 timmar avvisas redan i indatakontrollen.
- Testfall: `tests/fall/regelverk_40_timmar.json`, `jour_bilaga_j.json` (jourpass 15–08 måndag–torsdag) och `jour_ingen_kan.json` (ingen arbetar kväll, så inga jourpass läggs). Tester: `tests/test_regelverk_enhet.py` och `tests/test_jour.py`.
