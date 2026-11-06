# Schemasystem för vård och omsorg

Cykliska grundscheman för dygnet runt-verksamhet enligt Kommunals avtalsområde (HÖK/AB), med optimeringslösaren Google OR-Tools CP-SAT.

Systemet har två delar:

- **schemamotor** – lägger, granskar och förklarar scheman. Kan köras från kommandoraden.
- **schemawebb** – webbtjänsten DODEX Scheduler, med inloggning, där man lägger in enheter, personal, behov, önskemål och regler, lägger schemat, ser resultatet, jämför körningar och exporterar till Excel och PDF. Fungerar i mobilen.

## Schema light

`light/` är en lättversion som körs helt i webbläsaren, utan server: `motor.js` lägger schemat med en heuristik (simulerad glödgning) i stället för OR-Tools, och `granskning.js` är en fristående översättning av `schemamotor/validate.py`. `python light/bygg.py` sätter ihop `light/schema-light.html`. Samma hårda regler gäller, men lättversionen kan inte bevisa att ett schema är olösbart och saknar behov vid klockslag och delperioder. Lättversionen har samma översikt (nyckeltal och grafer), regelkontroll och simulering som webben: graferna kommer från `schemawebb/statisk/grafer.js` och simuleringen från `light/analys.js`, en översättning av `schemamotor/analys.py`.

## Kom igång på egen dator

```bash
pip install -e ".[dev]"
pytest -q
```

Starta webbtjänsten och öppna http://127.0.0.1:8000:

```bash
uvicorn schemawebb.app:app --port 8000
```

På Windows räcker det att dubbelklicka på `starta-windows.bat` efter installationen. Webbläsaren öppnas av sig själv, och systemet stängs när fönstret stängs.

Utan miljövariabeln `SCHEMA_LOSENORD` krävs ingen inloggning. Sätt alltid ett lösenord när tjänsten nås av andra. Databasen sparas i `./data`.

## Kommandoraden

```bash
python -m schemamotor.balans tests/fall/six_week_basic.json
python -m schemamotor.build tests/fall/six_week_basic.json --ut schema.json --md schema.md
python -m schemamotor.validate tests/fall/six_week_basic.json schema.json
python -m schemamotor.explain tests/fall/wraparound_failure.json
python -m schemamotor.export schema.json --excel schema.xlsx --pdf schema.pdf
```

Efter installationen finns kommandona även som `schema-balans`, `schema-build`, `schema-validate`, `schema-explain`, `schema-compare` och `schema-export`.

## Gränssnittet: DODEX Scheduler

Webbgränssnittet har en sidomeny med:

- **Översikt** – fyra nyckeltal (bemanningsgrad, personalkostnad, obemannade pass, planerad övertid), bemanningsgrad och kostnad per vecka, behov mot planerad bemanning per dag, passfördelning och en värmekarta över under- och överbemanning.
- **Schemaplanering** – schemat med medarbetare i rader och datum i kolumner, per vecka, hela perioden eller klockslag. Behovet visas i raden längst ned. Med **Redigera schemat** kan pass dras till en annan dag eller person, ändras, läggas till och tas bort. Varje ändring räknas om och granskas direkt, och resultatet sparas som en ny körning; originalet finns kvar (`schemamotor/justera.py`, `POST /api/korningar/{id}/justera`).
- **Bemanningsbehov**, **Medarbetare** – indata, med kontroll och bemanningsbalans vid sidan.
- **Analys och nyckeltal** – graferna och fördelningen per medarbetare.
- **Simulering** – konsekvensanalysen nedan, med kostnad och nuläge mot alternativ.
- **Regelkontroll** – den fristående granskningen grupperad per regel.
- **Rapporter** – Excel, PDF, utskrift och jämförelse av körningar.
- **Inställningar** – regler, period, budget och timkostnad, samt indata som JSON.

Personalkostnaden är en uppskattning: kontrakterad eller schemalagd tid × `timkostnad_kr`, som anges under Inställningar.

## Konsekvensanalys

Sidan Simulering tar fram bemanningsförslag utifrån en budget, lägger ett schema för vart och ett och jämför vakanser, överkapacitet, helgbemanning, timmar mot budget och blandning av morgon och kväll. Se `docs/analys.md`.

## Schemaassistent

En assistent (knappen Fråga) svarar på frågor om schemat och föreslår ändringar som du godkänner. På datorn behövs en API-nyckel från Anthropic, se `docs/assistent.md`. I lättversionen fungerar den direkt via Claude-kontot.

## Driftsättning

Se `docs/drift.md` för hur tjänsten läggs på Render med lösenord och sparad databas.

## Dokumentation

- `docs/regelhierarki.md` – vilka regler som gäller och i vilken ordning de väger
- `docs/avtal-regler.md` – vila, rast och dygnsbryt
- `docs/indata-schema.md` – format för indata och schema
- `docs/optimering.md` – hur modellen fungerar
- `docs/hallbarhet.md`, `docs/ekonomi.md` – hur resultatet värderas
- `docs/drift.md` – driftsättning, lösenord, säkerhetskopior
- `ROADMAP.md` – vad som ska byggas härnäst
