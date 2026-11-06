"""Frågeguiden (schemawebb/statisk/guide.js): förslagen och att enheten den skapar är giltig indata."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def ut():
    if not shutil.which("node"):
        pytest.skip("Node saknas")
    r = subprocess.run(["node", str(ROT / "tests" / "js" / "guide_test.js")], capture_output=True, text=True, timeout=60, check=True)
    return json.loads(r.stdout)


def test_minsta_antal_for_helgerna(ut):
    b = ut["berakna"]
    # helg: 2 dag + max(3 kväll helg, 2 kväll fredag) = 5 per helg, varannan helg ger 10
    assert b["perHelg"] == 5 and b["minDag"] == 10 and b["minNatt"] == 2


def test_budgeten_fordelas(ut):
    g = ut["budget"]["grader"]
    kontrakt = sum(g.values()) / 100 * 37
    assert 0 < kontrakt <= 300 + 0.01 and g["N1"] > 0
    assert kontrollera_indata(ut["budget"]["indata"]) == []


def test_undantag_och_tider_blir_indata(ut):
    ind = ut["undantag"]
    assert kontrollera_indata(ind) == []
    p = {x["id"]: x for x in ind["personal"]}
    assert p["A1"]["grad"] == 0.75
    assert p["A2"]["dygnsdelar"] == ["kvall"] and p["A3"]["helgfrekvens"] == "ingen"
    assert p["N1"]["dygnsdelar"] == ["natt"] and "helgfrekvens" not in p["A1"]
    assert ind["regler"] == {"kvall_slut": "21:30"} and ind["nattpass"][0]["start"] == "21:30"
    assert ind["startdatum"] == "2026-12-07" and all("namn" not in x for x in ind["personal"])


def test_tomt_schema_och_tom_enhet(ut):
    assert len(ut["tomt"]) == 12 and all(len(r) == 28 and not any(r) for r in ut["tomt"].values())
    assert ut["tom"]["personal"] == [] and ut["fel"] == "Startdatum ska vara en måndag."


def test_manuell_korning_via_api(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path))
    monkeypatch.setenv("SCHEMA_LOSENORD", "hemligt-test")
    from schemawebb.app import app
    ind = json.loads((ROT / "tests" / "fall" / "friday_rule_vacancy.json").read_text(encoding="utf-8"))
    ind.pop("forvantat", None)
    with TestClient(app) as k:
        k.post("/api/logga-in", json={"losenord": "hemligt-test"})
        eid = k.post("/api/enheter", json={"namn": "Manuell", "indata": ind}).json()["id"]
        kid = k.post(f"/api/enheter/{eid}/manuell").json()["id"]
        r = k.get(f"/api/korningar/{kid}").json()
        assert r["status"] == "klar" and r["resultat"]["status"] == "OK"
        assert all(not any(rad) for rad in r["resultat"]["schema"].values())
        assert r["resultat"]["kpi"]["vakanta_pass"] > 0 and r["granskning"] is not None
