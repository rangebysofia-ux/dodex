import sys

sys.exit(
    "Ange en modul, till exempel:\n"
    "  python -m schemamotor.build indata.json --ut schema.json\n"
    "  python -m schemamotor.validate indata.json schema.json\n"
    "  python -m schemamotor.explain indata.json\n"
    "  python -m schemamotor.compare scenarier.json"
)
