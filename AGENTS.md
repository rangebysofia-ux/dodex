# Instruktioner för kodagenter

Det här projektet bygger ett system för cykliska grundscheman i dygnet runt-verksamhet inom äldreomsorg och funktionsstöd i svenska kommuner (Kommunal, HÖK/AB). Läs den här filen och `docs/regelhierarki.md` innan du ändrar något.

## Systemets delar

- `schemamotor/build.py` – lägger schemat med OR-Tools CP-SAT i två faser (mönster, sedan passlängder) och lexikografisk optimering.
- `schemamotor/validate.py` – fristående granskning av ett färdigt schema. **Får aldrig importera något från build.py.** Ett test kontrollerar det. Den ska kunna fånga fel i motorn.
- `schemamotor/explain.py` – hittar en minimal uppsättning regler som krockar.
- `schemamotor/compare.py` – kör och jämför scenarier.
- `schemamotor/modell.py` – kontroll av indata med Pydantic och felmeddelanden på svenska. Avtal och lag kan inte försvagas här.
- `schemamotor/balans.py` – bemanningsbalans före schemaläggningen. Ska förutsäga lösarens vakanta pass för testfallen.
- `schemamotor/onskemal.py` – varningar för önskemål som inte påverkar något eller krockar.
- `schemamotor/export.py` – Excel och PDF.
- `schemawebb/` – webbtjänst (FastAPI, SQLite) och gränssnitt i `statisk/` (vanlig JavaScript, inget byggsteg).
- `light/` – lättversion som körs helt i webbläsaren: `motor.js` (heuristisk schemaläggning, samma hårda regler), `granskning.js` (fristående översättning av validate.py, får inte dela kod med motor.js), `sida.html` (gränssnitt). `python light/bygg.py` bygger `light/schema-light.html`. Ändras en regel i Python ska den ändras här också.
- `docs/` – regler, modell och dataformat. Uppdatera dokumentationen i samma ändring som koden.
- `tests/fall/` – testfall med fältet `forvantat`. `tests/test_motor.py` kör dem.

## Regler som aldrig får försvagas

Ändra aldrig dessa utan att användaren uttryckligen ber om det:

1. Dygnsvila 11 h och veckovila 36 h (avtal) samt rast efter 5 h arbete (lag) är hårda.
2. Behovet är högsta *mjuka* nivå. Gör det aldrig hårt: en vakans är bättre än ett avtalsbrott.
3. Antal pass väger tyngre än passlängd. 4,75 pass per vecka för dag och kväll.
4. Morgonpass har fast start, kvällspass fast slut, längden anpassas i fönstret 12–18.
5. Ingen fredagskväll före ledig helg.
5b. Varannan helg är hård och låst för enheten. Undantag får bara göras per person.
6. Lokala regler (varannan helg, block 2–5 dagar, 4,75 pass) får aldrig kallas avtalsregler i text eller gränssnitt.

## Kom igång

```bash
pip install -e ".[dev]"
pytest -q
uvicorn schemawebb.app:app --port 8000      # webbtjänsten, utan lösenord lokalt
python light/bygg.py                         # bygger lättversionen
```

Kontrollera lättmotorn mot Python-granskningen (kräver Node):

```bash
node -e "const M=require('./light/motor.js');const fs=require('fs');fs.writeFileSync('/tmp/s.json',JSON.stringify(M.los(require('./tests/fall/six_week_basic.json'),{sekunder:5})))"
python -m schemamotor.validate tests/fall/six_week_basic.json /tmp/s.json
```

## Arbetssätt

- Kör `pytest -q` före och efter varje ändring. Alla tester ska passera. Testerna tar cirka en minut.
- Lägg till ett testfall i `tests/fall/` för varje ny regel: ett som ska gå att lösa och ett som ska vara olösbart, med förväntad konflikt.
- Ny regel = tre ställen: modellen (build), granskningen (validate, skriven oberoende) och förklaringen (en regelgrupp med text och nivå i explain).
- Lägg inte till beroenden utan att motivera dem i commit-meddelandet.
- Personuppgifter: använd id-koder i testdata och loggar, aldrig namn.
- Text som användare ser skrivs på svenska med å, ä och ö.
- Gör en uppgift i taget från `ROADMAP.md` och bocka av den.

## Kända begränsningar

Se `docs/optimering.md`. Öppna frågor som användaren inte har beslutat finns i `docs/regelhierarki.md`; gissa inte, lämna dem konfigurerbara.
