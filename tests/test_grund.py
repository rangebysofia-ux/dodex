"""Grunden i verktyget: förskolorna och deras avdelningar (schemawebb/grund.py, grund_forskola.json)."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROT = Path(__file__).resolve().parent.parent
GRUND = json.loads((ROT / "schemawebb" / "grund_forskola.json").read_text(encoding="utf-8"))


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("SCHEMA_GRUND", "")  # på, som i drift
    monkeypatch.delenv("SCHEMA_LOSENORD", raising=False)
    from schemawebb.app import app
    with TestClient(app) as k:
        yield k


def test_underlaget():
    assert GRUND["verksamhet"] == "forskola"
    assert len(GRUND["enheter"]) == 29 and sum(len(e["avdelningar"]) for e in GRUND["enheter"]) == 113
    assert {e["namn"] for e in GRUND["enheter"]} >= {"Anneberg", "Kullegården", "Ugglumsleden"}


def test_forskolorna_laggs_in_en_gang(klient):
    enh = klient.get("/api/enheter").json()
    assert len(enh) == 29 and all(e["org"] == "forskola" for e in enh)
    kulle = next(e for e in enh if e["namn"] == "Kullegården")
    assert len(kulle["team"]) == 10 and kulle["team"][0]["farg"].startswith("#")
    ind = klient.get(f"/api/enheter/{kulle['id']}").json()["indata"]
    from schemamotor.modell import kontrollera_indata
    assert kontrollera_indata(ind) == ["personal: får inte vara tom"]  # bara personalen saknas, den fylls i sedan
    # en borttagen förskola kommer inte tillbaka vid omstart, men knappen lägger in den igen
    klient.delete(f"/api/enheter/{kulle['id']}")
    from schemawebb import grund
    assert grund.vid_start() is None
    assert len(klient.get("/api/enheter").json()) == 28
    r = klient.post("/api/grund").json()
    assert r == {"nya": 1, "avdelningar": 10}
    assert klient.post("/api/grund").json() == {"nya": 0, "avdelningar": 0}


def test_saknade_avdelningar_laggs_till(klient):
    e = next(x for x in klient.get("/api/enheter").json() if x["namn"] == "Anneberg")
    hel = klient.get(f"/api/enheter/{e['id']}").json()
    hel["indata"]["team"] = hel["indata"]["team"][:2]
    klient.put(f"/api/enheter/{e['id']}", json={"namn": hel["namn"], "indata": hel["indata"]})
    assert klient.post("/api/grund").json() == {"nya": 0, "avdelningar": 3}
    namn = [t["namn"] for t in klient.get(f"/api/enheter/{e['id']}").json()["indata"]["team"]]
    assert namn == ["Diamanten", "Juvelen", "Kristallen", "Pärlan", "Rubinen"]
    assert len(set(t["id"] for t in klient.get(f"/api/enheter/{e['id']}").json()["indata"]["team"])) == 5


def test_lattversionen_har_grunden():
    s = (ROT / "light" / "schema-light.html").read_text(encoding="utf-8")
    assert "const GRUND = {" in s and "Ugglumsleden" in s and "laggInGrund()" in s
