# Bemanningsbalans

Bemanningsbalansen räknar som verksamhetens Excel-mall: budget, bemanningsbehov, personal och övrig arbetstid,
med resultat per vecka och per period. Den påverkar inte schemaläggningen.

- Beräkning: `schemamotor/bemanningsbalans.py` (`berakna`) och samma i `schemawebb/statisk/bemanningsbalans.js`
  (`BB.berakna`), som också ritar sidan. `tests/test_bemanningsbalans.py` jämför dem med varandra och med mallens siffror.
- Webben: menyn **Bemanningsbalans** (`#/e/{id}/bemanningsbalans`), med import av en ifylld mall
  (`POST /api/bemanningsbalans/las`, filen skickas som base64 och sparas inte).
- Telefonen: fliken **Bemanningsbalans** under enheten (utan import).
- Kommandorad: `python -m schemamotor.bemanningsbalans mall.xlsx` eller `indata.json`.
- Excel-exporten av ett schema får bladet *Bemanningsbalans* när enheten har en budget eller bemanningsbalans.

## Steg

1. **Budget.** Årsarbetare (ÅA) × heltid per vecka = budgeterade timmar (`budget_timmar_vecka`). Buffert i procent
   dras av: budget inklusive buffert = budget × (1 − buffert).
2. **Bemanningsbehov.** Pass med dagar, från, till, rast och antal per dag. Arbetstid = till − från (över midnatt) − rast.
   Jour räknas med angiven arbetstid (till exempel 3 h av 6). Brukarnära tid per vecka = summan över veckans dagar.
   Antal pass per vecka räknas utan jour. Helgbehov = (pass på lördag + pass på söndag) ÷ 2.
3. **Personal.** Från enhetens medarbetare: sysselsättningsgrad × heltid per vecka (personens heltid om den är angiven,
   till exempel 36,33 h för natt), antal pass per period som motorn räknar dem (eller det som är angivet) och helger
   (varannan helg räknas som 0,5).
4. **Övrig arbetstid.** Arbetstid som inte ingår i bemanningskravet: tillfällen per år × timmar per tillfälle × antal
   personer ÷ 52 per vecka. Knappen *Hämta från aktiviteterna i schemat* lägger till APT, utbildning med mera från
   enhetens aktiviteter.
5. **Resultat.** Bemanning = brukarnära + övrig arbetstid.
   - Vecka: budget − bemanning och bemanning − personal, i timmar och ÅA. Negativt bemanning − personal betyder
     överkapacitet; positivt betyder vakanta timmar.
   - Period: bemanningskrav och personalresurser i timmar, pass, snitt per pass och helg.

## Skillnader mot mallen

- Natt angiven för mån–sön eller lör–sön räknas med i brukarnära tid (i mallen ingår bara dagsektionerna och jouren).
- Antal pass för personalen är det motorn räknar med (4,75 per vecka för dag och kväll) om inget annat är angivet;
  mallen har en egen kolumn för arbetsdagar. Vid import läses den kolumnen som `antal_pass`.
- Rader som är likadana alla vardagar (eller lördag och söndag) slås ihop vid import.

## Import och personuppgifter

Importen läser de ifyllda värdena, inte formlerna, och räknar själv. Namn ersätts med id-koder (P1, P2 … och N1 …
för nattpersonal) och sparas aldrig. Medarbetare ersätts bara när användaren kryssar i det; då tas önskemål och
deltagare som gäller borttagna id-koder bort.

## Indata

```json
"budget_timmar_vecka": 301.92,
"bemanningsbalans": {
  "buffert_procent": 0,
  "pass": [
    {"dagar": "vardag", "fran": "06:00", "till": "11:00", "rast_minuter": 0, "antal": 1},
    {"dagar": "mån-sön", "fran": "00:00", "till": "06:00", "antal": 1, "typ": "jour", "raknad_minuter": 180}
  ],
  "ovrig_tid": [{"namn": "APT", "tillfallen_ar": 10, "timmar": 22, "personer": 1}]
}
```

`dagar`: `mån` … `sön`, `vardag`, `helg`/`lör-sön`, `alla`/`mån-sön`. `antal` är per dag.
