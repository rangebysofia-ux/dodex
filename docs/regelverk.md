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

Användaren har valt att funktionsstödets regelverk ska ha *arbetspass och jour i följd*. Det kräver en ny passtyp i motorerna och granskningen, och den byggs i nästa steg. Bilaga J reglerar också ersättning för jour. DODEX räknar inte ersättning för jour förrän texten är kontrollerad mot SKR:s publicering, eftersom den inte kunde hämtas när regelverket byggdes.

## Teknik

- `schemawebb/statisk/regelverk.js` (RV): `LISTA`, `andringar`, `tillampa`, `varningar` och `kort`. Delas av webben och lättversionen.
- `schemamotor/modell.py`: fältet `regelverk`.
- Testfall: `tests/fall/regelverk_40_timmar.json`. Tester: `tests/test_regelverk_enhet.py`.
