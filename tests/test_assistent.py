"""Schemaassistentens verktyg (schemawebb/statisk/assistent.js), körda med Node mot ett riktigt schema."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent
FALL = ROT / "tests" / "fall" / "friday_rule_vacancy.json"


@pytest.fixture(scope="module")
def ut(tmp_path_factory):
    if not shutil.which("node"):
        pytest.skip("Node saknas")
    tmp = tmp_path_factory.mktemp("assistent")
    schema = tmp / "schema.json"
    subprocess.run([sys.executable, "-m", "schemamotor.build", str(FALL), "--ut", str(schema), "--tyst"], cwd=ROT, check=True,
                   capture_output=True, timeout=600)
    svar = subprocess.run(["node", str(ROT / "tests" / "js" / "assistent_test.js"), str(FALL), str(schema)],
                          capture_output=True, text=True, timeout=60, check=True)
    return json.loads(svar.stdout)


def test_las_schema_raknar_kvallar(ut):
    rader = {r["person"]: r for r in ut["schema"]["personer"]}
    assert len(rader) == 8
    assert all(r["kvall"] + r["morgon"] == r["pass"] for r in rader.values())
    assert ut["schema"]["nyckeltal"]["vakanta_pass"] == 4


def test_fredagskvallar_visar_vakans(ut):
    assert len(ut["fredagar"]) == 4
    for dag in ut["fredagar"]:
        assert dag["dag"].endswith("fre")
        assert dag["kväll"]["behov"] == 3 and dag["kväll"]["vakanta"] == 1


def test_person_hittas_oavsett_skiftlage(ut):
    assert ut["person"]["id"] == "F1" and len(ut["person"]["veckor"]) == 4


def test_forslag_tillampas_och_ar_giltig_indata(ut):
    assert "Inget är ändrat" in ut["svar"]
    assert len(ut["forslag"]["texter"]) == 3
    ny = ut["ny_indata"]
    assert any(p["id"] == "P9" and p["grad"] == 0.75 and p["dygnsdelar"] == ["kvall"] for p in ny["personal"])
    assert ny["behov"]["fre"]["kvall"] == 2 and ny["behov"]["fre"]["morgon"] == 2
    assert kontrollera_indata(ny) == []


def test_felaktiga_forslag_stoppas(ut):
    assert "finns redan" in ut["dubblett"]
    assert "Natt kan inte kombineras" in ut["nattfel"]
