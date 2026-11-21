"""Integrationstester för den avstängda piloten för daglig bemanning.

Använder bara fiktiva identiteter och temporär SQLite-databas.
Inga externa anrop eller registreringar i Heroma.
"""
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def arbetsyta(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("SCHEMA_LOSENORD", "enbart-testlosenord")
    monkeypatch.setenv("DODEX_PLANERING_DEMO", "1")
    from schemawebb import db
    from schemawebb.app import app
    with TestClient(app) as client:
        assert client.post("/api/logga-in", json={"losenord": "enbart-testlosenord"}).status_code == 200
        indata = {
            "enhet": "Fiktiva enheten",
            "personal": [{"id": "A1"}, {"id": "B1"}],
            "kompetenskrav": [{"id": "K1", "kompetens": "del",
                                "behov": {"alla": {"morgon": 1}}}]
        }
        eid = db.skapa_enhet("Fiktiva enheten", indata)
        schema = {
            "A1": [{"start": "07:00", "slut": "15:00", "rast": 30, "dygnsdel": "morgon"}]
                   + [None] * 6,
            "B1": [{"start": "07:00", "slut": "15:00", "rast": 30, "dygnsdel": "morgon"}]
                   + [None] * 6,
        }
        resultat = {"status": "OK", "veckor": 1, "schema": schema}
        kid = db.skapa_korning(eid, "Testgrundschema", deepcopy(indata))
        db.uppdatera_korning(kid, status="klar", resultat=resultat, granskning={"brott": []})
        db.aktivera(eid, kid, "2026-11-23", "testchef")
        yield client, eid, kid, deepcopy(resultat)


def lista(client, eid):
    response = client.get(f"/api/enheter/{eid}/daglig-planering",
                          params={"fran": "2026-11-23", "till": "2026-11-23"})
    assert response.status_code == 200, response.text
    return response.json()


def skicka(client, eid, pid, typ, **data):
    return client.post(f"/api/enheter/{eid}/planeringshandelser",
                       json={"pass_id": pid, "typ": typ, **data})


def test_komplett_flode_med_spardata_och_uppfoljning(arbetsyta):
    c, eid, kid, grundschema = arbetsyta
    before = lista(c, eid)
    assert before["nyckeltal"]["pass"] == 2
    p = before["pass"][0]
    pid = p["id"]
    assert p["kravda_kompetenser"] == ["del"]
    assert skicka(c, eid, pid, "bokning", vikarie="V1").status_code == 409

    r = skicka(c, eid, pid, "franvaro", orsak="sjuk")
    assert r.status_code == 201, r.text
    step1 = lista(c, eid)
    assert step1["nyckeltal"]["obedomda"] == 1
    assert step1["nyckeltal"]["vikariebehov"] == 0
    assert step1["nyckeltal"]["bokade"] == 0
    assert skicka(c, eid, pid, "franvaro", orsak="sjuk").status_code == 409

    assert skicka(c, eid, pid, "bedomning", beslut="vikariebehov",
                  motivering="Resurstid och kompetens kontrollerade i exemplet").status_code == 201
    assert lista(c, eid)["nyckeltal"]["olosta"] == 1

    assert c.post(f"/api/enheter/{eid}/testvikarier",
                  json={"kod": "V1", "kompetenser": []}).status_code == 201
    assert skicka(c, eid, pid, "bokning", vikarie="V1").status_code == 422
    assert c.post(f"/api/enheter/{eid}/testvikarier",
                  json={"kod": "V2", "kompetenser": ["del"]}).status_code == 201
    assert skicka(c, eid, pid, "bokning", vikarie="V2").status_code == 201
    assert skicka(c, eid, pid, "bokning", vikarie="V2").status_code == 409

    step2 = lista(c, eid)
    assert step2["nyckeltal"]["bokade"] == 1
    assert step2["nyckeltal"]["olosta"] == 0
    assert skicka(c, eid, pid, "utfall", arbetade_minuter=450, kostnad_kr=1200).status_code == 201
    after = lista(c, eid)
    assert after["nyckeltal"]["utfall_rapporterade"] == 1
    assert after["nyckeltal"]["arbetade_timmar"] == 7.5
    assert after["nyckeltal"]["rapporterad_kostnad_kr"] == 1200
    historik = c.get(f"/api/enheter/{eid}/planeringshistorik", params={"pass_id": pid}).json()
    assert [x["typ"] for x in historik] == ["franvaro", "bedomning", "bokning", "utfall"]
    from schemawebb import db
    assert db.korning(kid)["resultat"] == grundschema


def test_overlapp_och_avbokning(arbetsyta):
    c, eid, _, _ = arbetsyta
    ids = [p["id"] for p in lista(c, eid)["pass"]]
    assert c.post(f"/api/enheter/{eid}/testvikarier",
                  json={"kod": "V3", "kompetenser": ["del"]}).status_code == 201
    for pid in ids:
        assert skicka(c, eid, pid, "franvaro", orsak="annan").status_code == 201
        assert skicka(c, eid, pid, "bedomning", beslut="vikariebehov",
                      motivering="Verifierat i fiktiv enhet").status_code == 201
    assert skicka(c, eid, ids[0], "bokning", vikarie="V3").status_code == 201
    assert skicka(c, eid, ids[1], "bokning", vikarie="V3").status_code == 409
    assert skicka(c, eid, ids[0], "avboka", motivering="Testar ombokning").status_code == 201
    assert skicka(c, eid, ids[1], "bokning", vikarie="V3").status_code == 201


def test_aterkallad_franvaro_och_intern_tackning(arbetsyta):
    c, eid, _, _ = arbetsyta
    pid = lista(c, eid)["pass"][0]["id"]
    assert skicka(c, eid, pid, "franvaro", orsak="semester").status_code == 201
    assert skicka(c, eid, pid, "bedomning", beslut="intern_resurs",
                  motivering="Täckning genom fiktiv resursperson").status_code == 201
    assert lista(c, eid)["nyckeltal"]["vikariebehov"] == 0
    assert skicka(c, eid, pid, "aterta_franvaro").status_code == 201
    assert lista(c, eid)["nyckeltal"]["franvaro"] == 0


def test_avstangt_utan_miljovariabel(arbetsyta, monkeypatch):
    c, eid, _, _ = arbetsyta
    monkeypatch.delenv("DODEX_PLANERING_DEMO")
    r = c.get(f"/api/enheter/{eid}/daglig-planering",
              params={"fran": "2026-11-23", "till": "2026-11-23"})
    assert r.status_code == 403
