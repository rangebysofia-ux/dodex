"""Konton med roller och godkänt, aktiverat schema (docs/godkant-schema.md)."""
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from schemamotor import validate
from schemamotor.build import forbered, los

FALL = Path(__file__).resolve().parent / "fall"


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("SCHEMA_LOSENORD", "gemensamt-test")
    monkeypatch.delenv("SCHEMA_HEMLIGHET", raising=False)
    from schemawebb import db
    db.anslut(tmp_path / "data" / "schemasystem.db")
    from schemawebb.app import app
    with TestClient(app) as k:
        yield k


@pytest.fixture(scope="module")
def schema():
    indata = json.loads((FALL / "six_week_basic.json").read_text(encoding="utf-8"))
    for n in ("beskrivning", "forvantat"):
        indata.pop(n, None)
    res = los(forbered(copy.deepcopy(indata)), 10, tyst=True)
    assert res["status"] == "OK" and not validate.kontrollera(copy.deepcopy(indata), res)["brott"]
    return indata, res


def enhet_med_schema(k, schema):
    indata, res = schema
    eid = k.post("/api/enheter", json={"namn": "E", "indata": indata}).json()["id"]
    kid = k.post(f"/api/enheter/{eid}/importerad-korning", json={"namn": "S1", "indata": indata, "resultat": res}).json()["id"]
    return eid, kid


def logga_in(k, namn=None, losenord="gemensamt-test"):
    k.post("/api/logga-ut")
    r = k.post("/api/logga-in", json={"losenord": losenord, **({"anvandare": namn} if namn else {})})
    assert r.status_code == 200, r.text
    return k.get("/api/session").json()


def test_forsta_kontot_blir_chef_och_roller_galler(klient):
    s = logga_in(klient)
    assert s["roll"] == "schemalaggare" and not s["konton"]
    # det första kontot blir chef, oavsett vilken roll som begärs
    assert klient.post("/api/anvandare", json={"namn": "chef1", "losenord": "langt-losenord-1", "roll": "schemalaggare"}).json()["roll"] == "chef"
    # därefter får bara chef skapa konton
    assert klient.post("/api/anvandare", json={"namn": "plan2", "losenord": "langt-losenord-2"}).status_code == 403
    s = logga_in(klient, "chef1", "langt-losenord-1")
    assert s == {**s, "anvandare": "chef1", "roll": "chef", "konton": True}
    assert klient.post("/api/anvandare", json={"namn": "plan1", "losenord": "langt-losenord-3", "roll": "schemalaggare"}).status_code == 201
    assert klient.post("/api/anvandare", json={"namn": "plan1", "losenord": "langt-losenord-3"}).status_code == 409
    assert klient.post("/api/anvandare", json={"namn": "kort", "losenord": "kort"}).status_code == 422
    assert [u["namn"] for u in klient.get("/api/anvandare").json()] == ["chef1", "plan1"]
    assert "losenord" not in klient.get("/api/anvandare").json()[0]
    assert klient.delete("/api/anvandare/chef1").status_code == 409  # sista chefen
    # fel lösenord
    klient.post("/api/logga-ut")
    assert klient.post("/api/logga-in", json={"anvandare": "chef1", "losenord": "fel-losenord"}).status_code == 401
    s = logga_in(klient, "plan1", "langt-losenord-3")
    assert s["roll"] == "schemalaggare"
    assert klient.get("/api/anvandare").status_code == 403
    # byta eget lösenord
    assert klient.post("/api/anvandare/losenord", json={"gammalt": "fel", "nytt": "nytt-losenord-1"}).status_code == 401
    assert klient.post("/api/anvandare/losenord", json={"gammalt": "langt-losenord-3", "nytt": "nytt-losenord-1"}).status_code == 200
    assert logga_in(klient, "plan1", "nytt-losenord-1")["anvandare"] == "plan1"


def test_bara_chef_godkanner_och_godkant_ar_last(klient, schema):
    logga_in(klient)
    klient.post("/api/anvandare", json={"namn": "chef1", "losenord": "langt-losenord-1"})
    eid, kid = enhet_med_schema(klient, schema)
    # gemensamt lösenord = schemaläggare: får inte godkänna
    assert klient.post(f"/api/korningar/{kid}/aktivera", json={"fran_datum": "2026-12-07"}).status_code == 403
    logga_in(klient, "chef1", "langt-losenord-1")
    assert klient.post(f"/api/korningar/{kid}/aktivera", json={"fran_datum": "2026-12-08"}).status_code == 422  # tisdag
    a = klient.post(f"/api/korningar/{kid}/aktivera", json={"fran_datum": "2026-12-07"})
    assert a.status_code == 201 and a.json()["godkand_av"] == "chef1" and a.json()["fran_datum"] == "2026-12-07"
    assert klient.post(f"/api/korningar/{kid}/aktivera", json={"fran_datum": "2026-12-14"}).status_code == 409  # redan godkänt
    assert klient.get(f"/api/korningar/{kid}").json()["godkand"]["fran_datum"] == "2026-12-07"
    assert klient.get(f"/api/enheter/{eid}/korningar").json()[0]["godkand_fran"] == "2026-12-07"
    assert klient.delete(f"/api/korningar/{kid}").status_code == 409  # låst
    e = klient.get(f"/api/enheter/{eid}").json()
    assert e["kommande"]["korning_id"] == kid or e["aktivt"]["korning_id"] == kid
    # en ändring blir en ny version, som inte är godkänd
    k = klient.get(f"/api/korningar/{kid}").json()
    ny = klient.post(f"/api/korningar/{kid}/justera", json={"schema": k["resultat"]["schema"], "spara": True}).json()["id"]
    assert klient.get(f"/api/korningar/{ny}").json()["godkand"] is None
    assert klient.delete(f"/api/korningar/{ny}").status_code == 200


def test_schema_med_brott_kan_inte_godkannas(klient, schema):
    indata, res = schema
    logga_in(klient)
    klient.post("/api/anvandare", json={"namn": "chef1", "losenord": "langt-losenord-1"})
    logga_in(klient, "chef1", "langt-losenord-1")
    eid = klient.post("/api/enheter", json={"namn": "E", "indata": indata}).json()["id"]
    tomt = {**res, "schema": {p: [None] * len(r) for p, r in res["schema"].items()}}
    kid = klient.post(f"/api/enheter/{eid}/importerad-korning", json={"indata": indata, "resultat": tomt}).json()["id"]
    r = klient.post(f"/api/korningar/{kid}/aktivera", json={"fran_datum": "2026-12-07"})
    assert r.status_code == 409 and "brott" in r.json()["detail"]


def test_lokalt_utan_losenord_och_konton_ar_man_chef(tmp_path, monkeypatch, schema):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "d2"))
    monkeypatch.delenv("SCHEMA_LOSENORD", raising=False)
    from schemawebb import db
    db.anslut(tmp_path / "d2" / "schemasystem.db")
    from schemawebb.app import app
    with TestClient(app) as k:
        s = k.get("/api/session").json()
        assert s["kravs"] is False and s["roll"] == "chef"
        eid, kid = enhet_med_schema(k, schema)
        assert k.post(f"/api/korningar/{kid}/aktivera", json={"fran_datum": "2026-12-07"}).json()["godkand_av"] == "lokalt"
        # när ett konto skapas krävs inloggning
        k.post("/api/anvandare", json={"namn": "chef1", "losenord": "langt-losenord-1"})
        assert k.get("/api/enheter").status_code == 401
        assert k.post("/api/logga-in", json={"losenord": "x"}).status_code == 401
        assert k.post("/api/logga-in", json={"anvandare": "chef1", "losenord": "langt-losenord-1"}).status_code == 200
        assert k.get("/api/enheter").status_code == 200
