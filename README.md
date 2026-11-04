# Schemasystem för vård och omsorg

Cykliska grundscheman för dygnet runt-verksamhet enligt Kommunals avtalsområde (HÖK/AB), med optimeringslösaren Google OR-Tools CP-SAT.

## Kom igång

```bash
pip install -e ".[dev]"
pytest -q

python motor/build_schedule.py tests/fall/six_week_basic.json --ut schema.json --md schema.md
python motor/validate_schedule.py tests/fall/six_week_basic.json schema.json
python motor/explain_infeasibility.py tests/fall/wraparound_failure.json
```

## Dokumentation

- `docs/regelhierarki.md` – vilka regler som gäller och i vilken ordning de väger
- `docs/avtal-regler.md` – vila, rast och dygnsbryt
- `docs/indata-schema.md` – format för indata och schema
- `docs/optimering.md` – hur modellen fungerar
- `docs/hallbarhet.md`, `docs/ekonomi.md` – hur resultatet värderas
- `ROADMAP.md` – vad som ska byggas härnäst
