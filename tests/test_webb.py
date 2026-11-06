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

    # justera för hand: flytta ett pass, förhandsgranska, spara som ny körning
    original = klient.get(f"/api/korningar/{kid}").json()["resultat"]["schema"]
    utkast = json.loads(json.dumps(original))
    pid = next(p for p, rad in utkast.items() if rad[0])
    utkast[pid][0], utkast[pid][1] = None, utkast[pid][0] if not utkast[pid][1] else utkast[pid][1]
    f = klient.post(f"/api/korningar/{kid}/justera", json={"schema": utkast}).json()
    assert "granskning" in f and f["resultat"]["justerat"]
    ny = klient.post(f"/api/korningar/{kid}/justera", json={"schema": utkast, "namn": "Handjusterad", "spara": True}).json()["id"]
    nk = klient.get(f"/api/korningar/{ny}").json()
    assert nk["status"] == "klar" and nk["namn"] == "Handjusterad" and nk["granskning"] is not None
    assert klient.get(f"/api/korningar/{kid}").json()["resultat"]["schema"] == original
    utkast[pid][0] = {"dygnsdel": "morgon", "start": "fel", "slut": "15:00"}
    assert klient.post(f"/api/korningar/{kid}/justera", json={"schema": utkast}).status_code == 422

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


def test_assistent_utan_nyckel(klient, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    klient.post("/api/logga-in", json={"losenord": "hemligt-test"})
    assert klient.get("/api/assistent/status").json() == {"tillganglig": False}
    svar = klient.post("/api/assistent", json={"system": "s", "messages": [{"role": "user", "content": "hej"}], "tools": []})
    assert svar.status_code == 503 and "API-nyckel" in svar.json()["detail"]


def test_assistent_skickar_ratt_anrop(klient, monkeypatch):
    import anthropic
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    anrop = {}

    class Block:
        def __init__(self, d):
            self.d = d

        def model_dump(self, **_):
            return self.d

    class Svar:
        content = [Block({"type": "text", "text": "Hej"}),
                   Block({"type": "tool_use", "id": "t1", "name": "las_schema", "input": {}})]
        stop_reason = "tool_use"

    class Falsk:
        def __init__(self, *a, **k):
            self.beta = self
            self.messages = self

        def create(self, **kw):
            anrop.update(kw)
            return Svar()

    monkeypatch.setattr(anthropic, "Anthropic", Falsk)
    klient.post("/api/logga-in", json={"losenord": "hemligt-test"})
    svar = klient.post("/api/assistent", json={"system": "s", "messages": [{"role": "user", "content": "hej"}],
                                               "tools": [{"name": "las_schema", "description": "d", "input_schema": {"type": "object"}}]})
    assert svar.status_code == 200, svar.text
    assert svar.json()["stop_reason"] == "tool_use" and svar.json()["content"][1]["name"] == "las_schema"
    assert anrop["model"] == "claude-opus-5-5" and anrop["fallbacks"] == "default"
    assert anrop["tools"][0]["name"] == "las_schema"


def test_analys_hela_vagen(klient):
    klient.post("/api/logga-in", json={"losenord": "hemligt-test"})
    eid = klient.post("/api/enheter", json={"namn": "Fredag", "indata": lasa("friday_rule_vacancy.json")}).json()["id"]
    aid = klient.post(f"/api/enheter/{eid}/analys", json={"budget": 300, "tid_per_steg_s": 2}).json()["id"]
    slut = time.time() + 400
    while time.time() < slut:
        a = klient.get(f"/api/analys/{aid}").json()
        if a["status"] == "klar":
            break
        time.sleep(0.5)
    assert a["status"] == "klar" and len(a["ordning"]) == len(a["scenarier"]) >= 5
    assert all(s["status"] == "klar" for s in a["scenarier"])
    basta = a["scenarier"][a["ordning"][0]]
    assert basta["konsekvenser"]["vakanta_pass"] == 0
    ny = klient.post(f"/api/analys/{aid}/anvand", json={"index": a["ordning"][0]}).json()["id"]
    assert basta["namn"] in klient.get(f"/api/enheter/{ny}").json()["namn"]
    k = klient.get(f"/api/enheter/{ny}/korningar").json()
    assert k[0]["status"] == "klar" and k[0]["losning"] == "OK"
