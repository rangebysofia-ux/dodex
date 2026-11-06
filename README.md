# Schemasystem för vård och omsorg

Cykliska grundscheman för dygnet runt-verksamhet enligt Kommunals avtalsområde (HÖK/AB), med optimeringslösaren Google OR-Tools CP-SAT.

Systemet har två delar:

- **schemamotor** – lägger, granskar och förklarar scheman. Kan köras från kommandoraden.
- **schemawebb** – webbtjänst med inloggning där man lägger in enheter, personal, behov, önskemål och regler, lägger schemat, ser resultatet, jämför körningar och exporterar till Excel och PDF. Fungerar i mobilen.

## Schema light

`light/` är en lättversion som körs helt i webbläsaren, utan server: `motor.js` lägger schemat med en heuristik (simulerad glödgning) i stället för OR-Tools, och `granskning.js` är en fristående översättning av `schemamotor/validate.py`. `python light/bygg.py` sätter ihop `light/schema-light.html`. Samma hårda regler gäller, men lättversionen kan inte bevisa att ett schema är olösbart och saknar behov vid klockslag och delperioder.

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
