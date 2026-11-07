"""Aktiviteter under arbetstid (APT, handledning, utbildning): indata, motor och fristående granskning."""
import copy
import shutil
import subprocess
import json
from pathlib import Path

import pytest

from schemamotor.build import forbered, los
from schemamotor.modell import kontrollera_indata
from schemamotor.validate import kontrollera

ROT = Path(__file__).resolve().parent.parent
FALL = ROT / "tests" / "fall" / "aktivitet_apt.json"


@pytest.fixture(scope="module")
def losning():
    indata = json.loads(FALL.read_text(encoding="utf-8"))
    return indata, los(forbered(indata), tid_per_steg=6, arbetare=4, tyst=True)


def test_deltagarna_arbetar_hela_tiden(losning):
    indata, res = losning
    assert res["status"] == "OK"
    for t in res["aktiviteter"]:
        assert t["saknas"] == 0
        for pid in t["deltagare"]:
            p = res["schema"][pid][t["dag"]]
            assert p["start"] <= "14:00" and p["slut"] >= "16:00", (pid, p)
            assert any(a["id"] == "APT" for a in p["aktiviteter"])
    # alla deltar exakt en gång (varje_person 1), ungefär hälften per tillfälle
    alla = [q for t in res["aktiviteter"] for q in t["deltagare"]]
    assert sorted(alla) == sorted(p["id"] for p in indata["personal"])
    assert kontrollera(indata, res)["giltigt"]


def test_granskningen_fangar_deltagare_som_inte_arbetar(losning):
    indata, res = losning
    fel = copy.deepcopy(res)
    t = fel["aktiviteter"][0]
    pid = t["deltagare"][0]
    p = fel["schema"][pid][t["dag"]]
    # passet slutar före aktiviteten men deltagandet ligger kvar
    p.update({"start": "07:00", "slut": "13:15", "netto": 345, "rast": 30, "dygnsdel": "morgon"})
    g = kontrollera(indata, fel)
    assert not g["giltigt"]
    assert any(b["regel"] == "AKTIVITET" and b["person"] == pid for b in g["brott"])


def test_saknade_deltagare_ar_varning_eller_brott(losning):
    indata, res = losning
    fel = copy.deepcopy(res)
    t = fel["aktiviteter"][0]
    for pid in t["deltagare"]:
        fel["schema"][pid][t["dag"]].pop("aktiviteter")
    g = kontrollera(indata, fel)
    assert g["giltigt"]
    assert any(b["regel"] == "AKTIVITET" and "behov" in b["text"] for b in g["varningar"])
    krav = copy.deepcopy(indata)
    krav["aktiviteter"][0]["krav"] = True
    assert not kontrollera(krav, fel)["giltigt"]


def test_aktivitet_tas_fran_golvet(losning):
    """Den som är på APT räknas inte som i tjänst vid en tidpunkt under aktiviteten."""
    indata, res = losning
    t = res["aktiviteter"][0]
    i_tjanst = sum(1 for rad in res["schema"].values() if rad[t["dag"]]
                   and rad[t["dag"]]["start"] <= "15:00" < rad[t["dag"]]["slut"])
    ind = copy.deepcopy(indata)
    ind["tidpunkter"] = {"tis": [{"tid": "15:00", "antal": i_tjanst}]}
    dag = f"vecka {t['vecka']} tis kl 15:00"
    g = kontrollera(ind, res)
    assert any(b["regel"] == "BEHOV" and dag in b["text"] for b in g["varningar"])
    ind["aktiviteter"][0]["fran_golvet"] = False
    assert not any(b["regel"] == "BEHOV" and dag in b["text"] for b in kontrollera(ind, res)["varningar"])


def test_indatakontroll():
    indata = json.loads(FALL.read_text(encoding="utf-8"))
    assert kontrollera_indata(indata) == []
    fel = copy.deepcopy(indata)
    fel["aktiviteter"] = [{"id": "X", "start": "16:00", "slut": "14:00", "deltagare": ["Z9"], "veckor": [9]},
                          {"id": "X", "start": "10:00", "slut": "11:00", "antal": 2, "andel": 0.5}]
    texter = " ".join(kontrollera_indata(fel))
    assert "sluta efter" in texter
    assert "Z9" in texter
    assert "flera gånger" in texter
    assert "antal eller andel" in texter
    assert "mellan 1 och 4" in texter


@pytest.mark.skipif(not shutil.which("node"), reason="kräver Node")
def test_lattmotorn_lagger_aktiviteter(tmp_path):
    """Lättmotorn ska lägga aktiviteten rättvist, och båda granskningarna ska godkänna schemat."""
    ut = tmp_path / "s.json"
    kod = (f"const M=require('./light/motor.js'),G=require('./light/granskning.js'),fs=require('fs');"
           f"const ind=require('./tests/fall/aktivitet_apt.json');const r=M.los(ind,{{sekunder:4,seed:7}});"
           f"r.js=G.kontrollera(ind,r);fs.writeFileSync({json.dumps(str(ut))},JSON.stringify(r));")
    subprocess.run(["node", "-e", kod], cwd=ROT, check=True, timeout=120)
    res = json.loads(ut.read_text(encoding="utf-8"))
    indata = json.loads(FALL.read_text(encoding="utf-8"))
    assert res["status"] == "OK" and res["kpi"]["aktivitet_saknas"] == 0
    alla = sorted(q for t in res["aktiviteter"] for q in t["deltagare"])
    assert alla == sorted(p["id"] for p in indata["personal"])
    g = kontrollera(indata, res)
    assert g["giltigt"], g["brott"]
    assert not [v for v in g["varningar"] if v["regel"] == "AKTIVITET"]
    assert res["js"]["giltigt"] and not [v for v in res["js"]["varningar"] if v["regel"] == "AKTIVITET"]


def test_justering_behaller_aktiviteter(losning):
    from schemamotor.justera import justera
    indata, res = losning
    ny = justera(indata, copy.deepcopy(res["schema"]), res)
    assert [t["deltagare"] for t in ny["aktiviteter"]] == [t["deltagare"] for t in res["aktiviteter"]]
    assert ny["kpi"]["aktivitet_saknas"] == 0
    # tar användaren bort ett deltagande syns det som en saknad deltagare
    t = res["aktiviteter"][0]
    schema = copy.deepcopy(res["schema"])
    schema[t["deltagare"][0]][t["dag"]].pop("aktiviteter")
    assert justera(indata, schema, res)["kpi"]["aktivitet_saknas"] == 1
