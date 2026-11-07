"""Enhetsfilen (docs/enhetsfil.md): samma fil i webben och lättversionen, och ingen inställning försvinner."""
import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from schemamotor import validate
from schemamotor.build import STANDARDREGLER, forbered, los

ROT = Path(__file__).resolve().parent.parent
FALL = ROT / "tests" / "fall"
JS = ROT / "tests" / "js" / "enhetsfil_test.js"

behover_node = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def node(*args):
    ut = subprocess.run(["node", str(JS), *map(str, args)], capture_output=True, text=True, timeout=120, check=True).stdout
    return ut


def json_av(x):
    return json.loads(json.dumps(x))


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("SCHEMA_LOSENORD", "hemligt-test")
    from schemawebb.app import app
    with TestClient(app) as k:
        k.post("/api/logga-in", json={"losenord": "hemligt-test"})
        yield k


@behover_node
def test_alla_installningar_foljer_med(tmp_path):
    """Varje testfall – med alla sorters regler, aktiviteter, avvikelser och bemanningsbalans – kommer tillbaka exakt."""
    fall = [(f.stem, json.loads(f.read_text(encoding="utf-8"))) for f in sorted(FALL.glob("*.json"))]
    assert len(fall) >= 15
    # en enhet där varje regel och varje fält är ändrat, även fält som en senare version kan lägga till
    alla = json.loads((FALL / "aktivitet_apt.json").read_text(encoding="utf-8"))
    alla["regler"] = {k: ["ändrad", v] for k, v in STANDARDREGLER.items()}
    alla.update(startdatum="2026-11-09", budget_timmar_vecka=300.5, timkostnad_kr=245, ob_prognos_procent=2.5,
                heltid_natt_minuter_per_vecka=2060, avvikelser=["dygnsvila_minuter"], losare={"profil": "ekonomi"},
                delperioder=[2, 2], tidpunkter={"vardag": [{"tid": "06:45", "antal": 1}]},
                bemanningsbalans={"buffert_procent": 5, "pass": [], "ovrig_tid": []}, framtida_falt={"å": [1, None, "ö"]})
    fall.append(("Allt ändrat – ÅÄÖ", alla))
    for namn, indata in fall:
        (tmp_path / "e.json").write_text(json.dumps({"namn": namn, "indata": indata}), encoding="utf-8")
        (tmp_path / "k.json").write_text("[]", encoding="utf-8")
        (tmp_path / "fil.json").write_text(node("skriv", tmp_path / "e.json", tmp_path / "k.json", "webb"), encoding="utf-8")
        d = json.loads(node("las", tmp_path / "fil.json"))
        assert d["indata"] == indata, namn
        assert d["namn"] == namn


@behover_node
def test_las_avvisar_fel_fil_med_begriplig_text(tmp_path):
    f = tmp_path / "x.json"
    f.write_text("inte json", encoding="utf-8")
    assert "inte en DODEX-fil" in json.loads(node("las", f))["fel"]
    f.write_text(json.dumps({"format": "dodex-enhet", "version": 99, "enhet": {"indata": {}}}), encoding="utf-8")
    assert "nyare version" in json.loads(node("las", f))["fel"]
    # ren indata (som testfallen) går att öppna direkt
    f.write_text((FALL / "six_week_basic.json").read_text(encoding="utf-8"), encoding="utf-8")
    d = json.loads(node("las", f))
    assert d["indata"]["personal"] and d["korningar"] == []


@behover_node
def test_fran_webben_till_light_och_tillbaka(klient, tmp_path):
    indata = json.loads((FALL / "aktivitet_apt.json").read_text(encoding="utf-8"))
    indata["regler"] = {**indata.get("regler", {}), "dygnsbryt": "15:15", "kvall_max_i_rad": 4, "kvall_i_rad_typ": "hard"}
    indata["avvikelser"] = []
    eid = klient.post("/api/enheter", json={"namn": "Avd 3", "indata": indata}).json()["id"]
    res = los(forbered(copy.deepcopy(indata)), 10, tyst=True)
    assert res["status"] == "OK"
    svar = klient.post(f"/api/enheter/{eid}/importerad-korning",
                       json={"namn": "Schema 1", "indata": indata, "resultat": res, "forvantade_vakanser": 1.0})
    assert svar.status_code == 201

    # webben sparar filen så som app.js gör: enheten och de färdiga körningarna
    e = klient.get(f"/api/enheter/{eid}").json()
    korningar = [klient.get(f"/api/korningar/{k['id']}").json() for k in klient.get(f"/api/enheter/{eid}/korningar").json()]
    (tmp_path / "e.json").write_text(json.dumps(e), encoding="utf-8")
    (tmp_path / "k.json").write_text(json.dumps(korningar), encoding="utf-8")
    (tmp_path / "fil.json").write_text(node("skriv", tmp_path / "e.json", tmp_path / "k.json", "webb"), encoding="utf-8")

    # lättversionen läser den: samma inställningar, samma schema, och dess granskning godkänner schemat
    d = json.loads(node("las", tmp_path / "fil.json"))
    assert d["indata"] == json_av(indata)
    assert d["namn"] == "Avd 3"
    assert len(d["korningar"]) == 1
    assert d["korningar"][0]["resultat"]["schema"] == json_av(res)["schema"]
    assert d["korningar"][0]["forvantade_vakanser"] == 1.0
    assert json.loads(node("granska", tmp_path / "fil.json")) == [0]


@behover_node
def test_fran_light_till_webben(klient, tmp_path):
    (tmp_path / "fil.json").write_text(node("light", FALL / "six_week_basic.json"), encoding="utf-8")
    d = json.loads(node("las", tmp_path / "fil.json"))
    assert d["indata"] == json.loads((FALL / "six_week_basic.json").read_text(encoding="utf-8"))
    eid = klient.post("/api/enheter", json={"namn": d["namn"], "indata": d["indata"]}).json()["id"]
    k = d["korningar"][0]
    svar = klient.post(f"/api/enheter/{eid}/importerad-korning",
                       json={"namn": k["namn"], "indata": k["indata"], "resultat": k["resultat"],
                             "forvantade_vakanser": k["forvantade_vakanser"]})
    assert svar.status_code == 201
    sparad = klient.get(f"/api/korningar/{svar.json()['id']}").json()
    assert sparad["status"] == "klar"
    assert sparad["resultat"]["schema"] == k["resultat"]["schema"]
    assert sparad["balans"] == {"forvantade_vakanser": 3}
    # webben granskar om med validate.py, oberoende av lättversionens granskning
    assert sparad["granskning"] == json_av(validate.kontrollera(copy.deepcopy(k["indata"]), copy.deepcopy(k["resultat"])))
    assert klient.get(f"/api/enheter/{eid}").json()["indata"] == d["indata"]


def test_importerat_schema_granskas_om(klient):
    """Filens egen granskning används inte: ett schema som bryter mot enhetens regler syns som brott."""
    indata = json.loads((FALL / "six_week_basic.json").read_text(encoding="utf-8"))
    for nyckel in ("beskrivning", "forvantat"):
        indata.pop(nyckel, None)
    eid = klient.post("/api/enheter", json={"namn": "E", "indata": indata}).json()["id"]
    res = los(forbered(copy.deepcopy(indata)), 10, tyst=True)
    tomt = {**res, "schema": {p: [None] * len(rad) for p, rad in res["schema"].items()}}
    svar = klient.post(f"/api/enheter/{eid}/importerad-korning",
                       json={"namn": "Tomt", "indata": indata, "resultat": tomt, "granskning": {"brott": []}})
    assert svar.status_code == 201
    assert svar.json()["brott"] > 0
    assert klient.post(f"/api/enheter/{eid}/importerad-korning",
                       json={"indata": indata, "resultat": {"status": "INFEASIBLE"}}).status_code == 422
