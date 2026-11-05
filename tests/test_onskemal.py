"""Varningar för önskemål som inte påverkar något eller krockar."""
import json
from pathlib import Path

from schemamotor.onskemal import beskriv, kontrollera

BAS = json.loads((Path(__file__).resolve().parent / "fall" / "six_week_basic.json").read_text(encoding="utf-8"))


def varningar(onskemal):
    return {w["id"]: w["varning"] for w in kontrollera({**BAS, "onskemal": onskemal})}


def test_paverkar_inget():
    v = varningar([{"id": "O1", "person": "A1", "typ": "tidigast_start", "varde": "06:00", "dagar": ["mån"]},
                   {"id": "O2", "person": "N1", "typ": "endast_dygnsdel", "varde": "natt"}])
    assert "påverkar inget" in v["O1"] and "07:00" in v["O1"]
    assert "påverkar inget" in v["O2"]


def test_verklig_paverkan_ger_ingen_varning():
    assert varningar([{"id": "O1", "person": "A4", "typ": "tidigast_start", "varde": "09:00", "dagar": ["tis"]}]) == {}


def test_krav_som_krockar():
    v = varningar([{"id": "O1", "person": "A3", "typ": "ledig", "dagar": ["fre"], "krav": True},
                   {"id": "O2", "person": "A3", "typ": "arbetar", "dagar": ["fre"], "veckor": [2], "krav": True}])
    assert "krockar med krav O1" in v["O2"]


def test_beskrivning():
    o = {"id": "O1", "person": "A1", "typ": "ledig", "dagar": ["fre"], "veckor": "jämna", "vikt": 3}
    assert beskriv(o) == "A1 vill vara ledig – fre, jämna veckor (vikt 3)"
