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
    assert "schemat läggs om automatiskt" in ut["svar"] and ut["forslag"]["pass"] is False
    assert len(ut["forslag"]["texter"]) == 3
    ny = ut["ny_indata"]
    assert any(p["id"] == "P9" and p["grad"] == 0.75 and p["dygnsdelar"] == ["kvall"] for p in ny["personal"])
    assert ny["behov"]["fre"]["kvall"] == 2 and ny["behov"]["fre"]["morgon"] == 2
    assert kontrollera_indata(ny) == []


def test_felaktiga_forslag_stoppas(ut):
    assert "finns redan" in ut["dubblett"]
    assert "Natt kan inte kombineras" in ut["nattfel"]


def test_passandring_blir_exakt_som_sagt(ut):
    assert ut["pass_forslag"]["pass"] is True
    f1 = ut["pass_ny"]["f1"]
    assert f1["dygnsdel"] == "kvall" and f1["start"] == "14:00" and f1["slut"] == "21:30" and f1["manuell"]
    assert ut["pass_ny"]["f2"] is None
    assert ut["pass_ny"]["orort"] != f1  # originalet ändras inte


def test_flytta_pass_till_annan_person(ut):
    r = ut["flytta_res"]
    assert r["f4"]["start"] == r["var"]["start"] and r["f4"]["dygnsdel"] == r["var"]["dygnsdel"]


def test_blanda_inte_och_fel_vecka(ut):
    assert "Blanda inte" in ut["blandat"]
    assert "Vecka 99 finns inte" in ut["felvecka"]


def test_aktivitet_via_assistenten(ut):
    """'Lägg APT tisdag 14–16 för halva gruppen' blir en aktivitet i indata som går igenom kontrollen."""
    from schemamotor.modell import kontrollera_indata
    a = ut["akt"]
    assert a == [{"id": "APT", "namn": "APT", "start": "14:00", "slut": "16:00", "dagar": ["tis"], "veckor": [2, 4], "andel": 0.5}]
    assert "sluta efter" in ut["aktfel"]
    ind = json.loads((ROT / "tests" / "fall" / "friday_rule_vacancy.json").read_text(encoding="utf-8"))
    ind["aktiviteter"] = a
    assert kontrollera_indata(ind) == []
