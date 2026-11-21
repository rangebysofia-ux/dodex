"""Fas 8: från ett godkänt och aktiverat grundschema till daterade pass med frånvaro (docs/planering.md).

Kedjan går genom webbtjänsten som i drift: schemat läggs av motorn, granskas, importeras som körning och
godkänns och aktiveras från en måndag. Sedan rullas det ut på datum och ett pass markeras med frånvaro.
Bara syntetiska id-koder (A1 …, N1 …) från tests/fall/six_week_basic.json.
"""
import copy
import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from schemamotor import validate
from schemamotor.build import forbered, los
from schemamotor.planering import generera_daterade_pass, markera_franvaro

FALL = Path(__file__).resolve().parent / "fall"
FRAN = "2026-11-23"  # en måndag


@pytest.fixture(scope="module")
def schema():
    indata = json.loads((FALL / "six_week_basic.json").read_text(encoding="utf-8"))
    for n in ("beskrivning", "forvantat"):
        indata.pop(n, None)
    res = los(forbered(copy.deepcopy(indata)), 10, tyst=True)
    assert res["status"] == "OK" and not validate.kontrollera(copy.deepcopy(indata), res)["brott"]
    return indata, res


@pytest.fixture
def aktiverad(tmp_path, monkeypatch, schema):
    """En enhet med ett godkänt och aktiverat grundschema. Ger (db, enhet_id, korning_id, databasfil)."""
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("SCHEMA_LOSENORD", "enbart-testlosenord")
    monkeypatch.delenv("SCHEMA_HEMLIGHET", raising=False)
    from schemawebb import db
    fil = tmp_path / "data" / "schemasystem.db"
    db.anslut(fil)
    from schemawebb.app import app
    indata, res = schema
    with TestClient(app) as k:
        assert k.post("/api/logga-in", json={"losenord": "enbart-testlosenord"}).status_code == 200
        eid = k.post("/api/enheter", json={"namn": "Syntetisk enhet", "indata": indata}).json()["id"]
        kid = k.post(f"/api/enheter/{eid}/importerad-korning",
                     json={"namn": "Grundschema", "indata": indata, "resultat": res}).json()["id"]
        r = k.post(f"/api/korningar/{kid}/aktivera", json={"fran_datum": FRAN})
        assert r.status_code == 201, r.text
        yield db, eid, kid, fil


def _tabeller(fil):
    with sqlite3.connect(fil) as c:
        return {r[0] for r in c.execute("select name from sqlite_master where type = 'table'")}


def test_aktiverat_grundschema_till_daterat_pass_med_franvaro(aktiverad):
    db, eid, kid, fil = aktiverad
    fore = copy.deepcopy(db.korning(kid))
    tabeller_fore = _tabeller(fil)
    aktiveringar = db.aktiveringar(eid)
    assert [(a["korning_id"], a["fran_datum"]) for a in aktiveringar] == [(kid, FRAN)]

    passlista = generera_daterade_pass(aktiveringar, {kid: db.korning(kid)}, FRAN, "2026-11-29")
    # första veckan av det godkända schemat, på riktiga datum
    vecka1 = [(pid, rad[d]) for pid, rad in fore["resultat"]["schema"].items() for d in range(7) if rad[d]]
    assert len(passlista) == len(vecka1) > 0
    assert all(p["korning_id"] == kid and p["aktivering_id"] == aktiveringar[0]["id"] for p in passlista)
    assert all(p["grundschema_vecka"] == 1 and p["status"] == "planerad" for p in passlista)

    valt = passlista[0]
    resultat = markera_franvaro(passlista, [{"pass_id": valt["id"], "orsak": "annan"}])
    markerat = next(p for p in resultat if p["id"] == valt["id"])
    assert markerat["status"] == "franvaro_registrerad" and markerat["tackning"] == "ej_bedomd"
    assert markerat["franvaro"] == {"orsak": "annan"}
    # frånvaro skapar inget vikariebehov, ingen beställning och ingen bokning
    for p in resultat:
        assert not {"vikariebehov", "bestallning", "bokning"} & set(p), p
    assert all(p["status"] == "planerad" for p in resultat if p["id"] != valt["id"])
    # det godkända grundschemat och databasen är oförändrade
    assert db.korning(kid) == fore
    assert passlista[0]["status"] == "planerad"  # indata till markera_franvaro ändras inte heller
    assert _tabeller(fil) == tabeller_fore
    assert not any(t for t in _tabeller(fil) if "vikarie" in t or "bestall" in t or "bokning" in t)
