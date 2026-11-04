# Schemasystem för vård och omsorg

Cykliska grundscheman för dygnet runt-verksamhet enligt Kommunals avtalsområde (HÖK/AB), med optimeringslösaren Google OR-Tools CP-SAT.

## Kom igång

```bash
pip install -e ".[dev]"
pytest -q

python -m schemamotor.build tests/fall/six_week_basic.json --ut schema.json --md schema.md
python -m schemamotor.validate tests/fall/six_week_basic.json schema.json
python -m schemamotor.explain tests/fall/wraparound_failure.json
```

Efter `pip install -e .` finns samma kommandon även som `schema-build`, `schema-validate`, `schema-explain` och `schema-compare`.

## Förhandsvisning i webbläsaren

```bash
python -m schemamotor.webb --port 8000
```

Öppna http://127.0.0.1:8000. Välj ett testfall eller fyll i behov och personal, och klicka på *Lägg schema*. Sidan visar schemat vecka för vecka, vakanser, nyckeltal och granskningen, och förklarar varför när schemat inte går att lägga. Den använder bara Pythons standardbibliotek och är en enkel föregångare till punkt 5–7 i färdplanen.

## Dokumentation

- `docs/regelhierarki.md` – vilka regler som gäller och i vilken ordning de väger
- `docs/avtal-regler.md` – vila, rast och dygnsbryt
- `docs/indata-schema.md` – format för indata och schema
- `docs/optimering.md` – hur modellen fungerar
- `docs/hallbarhet.md`, `docs/ekonomi.md` – hur resultatet värderas
- `ROADMAP.md` – vad som ska byggas härnäst
