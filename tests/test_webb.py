"""Integrationstest för webbtjänsten: logga in, skapa enhet, kör, vänta, granska, exportera."""
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FALL = Path(__file__).resolve().parent / "fall"


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path))
    monkeypatch.setenv("SCHEMA_LOSENORD", "hemligt-test")
    from schemawebb.app import app
    with TestClient(app) as k:
        yield k


def lasa(namn):
    d = json.loads((FALL / namn).read_text(encoding="utf-8"))
    d.pop("beskrivning", None)
    d.pop("forvantat", None)
    return d


def vanta(klient, kid, max_s=300):
    slut = time.time() + max_s
    while time.time() < slut:
        k = klient.get(f"/api/korningar/{kid}").json()
        if k["status"] in ("klar", "fel"):
            return k
        time.sleep(0.5)
    raise AssertionError("körningen blev inte klar")


def test_inloggning_kravs(klient):
    assert klient.get("/api/enheter").status_code == 401
    assert klient.post("/api/logga-in", json={"losenord": "fel"}).status_code == 401
    assert klient.post("/api/logga-in", json={"losenord": "hemligt-test"}).status_code == 200
    assert klient.get("/api/enheter").status_code == 200
    klient.post("/api/logga-ut")
    assert klient.get("/api/enheter").status_code == 401


def test_korning_hela_vagen(klient):
    klient.post("/api/logga-in", json={"losenord": "hemligt-test"})
    indata = lasa("friday_rule_vacancy.json")
    eid = klient.post("/api/enheter", json={"namn": "Testenhet", "indata": indata}).json()["id"]

    kontroll = klient.post("/api/kontrollera", json={"indata": indata}).json()
    assert kontroll["fel"] == [] and kontroll["balans"]["forvantade_vakanser"] == 4

    kid = klient.post(f"/api/enheter/{eid}/korningar", json={"tid_per_steg_s": 10}).json()["id"]
    k = vanta(klient, kid)
    assert k["status"] == "klar", k
    assert k["resultat"]["status"] == "OK"
    assert k["granskning"]["giltigt"], k["granskning"]["brott"]
    assert k["resultat"]["kpi"]["vakanta_pass"] == k["balans"]["forvantade_vakanser"]

    lista = klient.get(f"/api/enheter/{eid}/korningar").json()
    assert lista[0]["id"] == kid and lista[0]["kpi"]["vakanta_pass"] == 4

    # granska samma schema via API:t, och ett ändrat schema med för kort dygnsvila
    schema = k["resultat"]
    assert klient.post("/api/granska", json={"indata": indata, "schema": schema}).json()["giltigt"]
    rad = schema["schema"]["F1"]
    rad[0] = {"mall": "K", "dygnsdel": "kvall", "start": "13:45", "slut": "22:00", "rast": 30, "netto": 465}
    rad[1] = {"mall": "M", "dygnsdel": "morgon", "start": "07:00", "slut": "15:15", "rast": 30, "netto": 465}
    g = klient.post("/api/granska", json={"indata": indata, "schema": schema}).json()
    assert not g["giltigt"] and any(b["regel"] == "DYGNSVILA" for b in g["brott"])

    x = klient.get(f"/api/korningar/{kid}/excel")
    assert x.status_code == 200 and x.content[:2] == b"PK"
    p = klient.get(f"/api/korningar/{kid}/pdf")
    assert p.status_code == 200 and p.content[:4] == b"%PDF"


def test_olosbart_far_forklaring(klient):
    klient.post("/api/logga-in", json={"losenord": "hemligt-test"})
    eid = klient.post("/api/enheter", json={"namn": "Dygnsvila", "indata": lasa("daily_rest_failure.json")}).json()["id"]
    k = vanta(klient, klient.post(f"/api/enheter/{eid}/korningar", json={}).json()["id"])
    assert k["resultat"]["status"] == "INFEASIBLE"
    assert any(r["grupp"].startswith("DYGNSVILA") for r in k["forklaring"]["konflikt"])


def test_felaktig_indata_stoppas(klient):
    klient.post("/api/logga-in", json={"losenord": "hemligt-test"})
    indata = lasa("six_week_basic.json")
    del indata["personal"][0]["grad"]
    eid = klient.post("/api/enheter", json={"namn": "Fel", "indata": indata}).json()["id"]
    svar = klient.post(f"/api/enheter/{eid}/korningar", json={})
    assert svar.status_code == 422
    assert "personal A1, sysselsättningsgrad: saknas" in svar.json()["fel"]
