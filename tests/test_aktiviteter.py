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


def test_minst_pa_golvet_under_aktiviteten():
    """När hälften är på APT förlängs andras pass så att minst tre är kvar på golvet varje kvart."""
    fall = ROT / "tests" / "fall" / "aktivitet_minst_pa_golvet.json"
    indata = json.loads(fall.read_text(encoding="utf-8"))
    res = los(forbered(indata), tid_per_steg=6, arbetare=4, tyst=True)
    assert res["status"] == "OK" and res["kpi"]["vakanser"] == 0
    for t in res["aktiviteter"]:
        for kvart in range(14 * 60, 16 * 60, 15):
            kl = f"{kvart // 60:02d}:{kvart % 60:02d}"
            pa_golvet = [pid for pid, rad in res["schema"].items() if rad[t["dag"]] and pid not in t["deltagare"]
                         and rad[t["dag"]]["start"] <= kl < rad[t["dag"]]["slut"]]
            assert len(pa_golvet) >= 3, (t, kl, pa_golvet)
    g = kontrollera(indata, res)
    assert g["giltigt"] and not [v for v in g["varningar"] if v["regel"] == "BEHOV"]
    # tar man bort förlängningarna syns bristen i granskningen
    fel = copy.deepcopy(res)
    t = fel["aktiviteter"][0]
    for pid, rad in fel["schema"].items():
        p = rad[t["dag"]]
        if p and pid not in t["deltagare"] and p["dygnsdel"] == "morgon":
            p.update({"slut": "13:30", "netto": 360, "rast": 30})
    assert any("under Arbetsplatsträff" in v["text"] for v in kontrollera(indata, fel)["varningar"])


@pytest.mark.skipif(not shutil.which("node"), reason="kräver Node")
def test_resurspass_samma_i_webben_och_exporten(losning, tmp_path):
    """Resurspass (utöver behovet) räknas likadant i gränssnittet (grafer.js) och i exporten."""
    from schemamotor.export import _resurs
    indata, res = losning
    fil = tmp_path / "r.json"
    fil.write_text(json.dumps({"res": res, "ind": indata}), encoding="utf-8")
    kod = (f"global.window=undefined;const G=require('./schemawebb/statisk/grafer.js');const d=require({json.dumps(str(fil))});"
           "console.log(JSON.stringify([...G.resurs(d.res,d.ind)]))")
    js = json.loads(subprocess.run(["node", "-e", kod], cwd=ROT, capture_output=True, text=True, check=True).stdout)
    py = _resurs(res, indata)
    assert {tuple(x.rsplit(":", 1)) for x in js} == {(q, str(d)) for q, d in py}
    # lika många resurspass som pass över behovet
    from schemamotor.build import expandera_dagvarden
    beh = expandera_dagvarden(indata["behov"], dict)
    over = sum(max(0, sum(1 for rad in res["schema"].values() if rad[d] and rad[d]["dygnsdel"] == k) - beh[d % 7].get(k, 0))
               for d in range(indata["veckor"] * 7) for k in ("morgon", "kvall", "natt"))
    assert len(py) == over


@pytest.mark.skipif(not shutil.which("node"), reason="kräver Node")
def test_sammanstallning_per_rad(losning, tmp_path):
    """Sammanställningen per rad i schemat stämmer med schemat och med granskningens vila."""
    indata, res = losning
    fil = tmp_path / "r.json"
    fil.write_text(json.dumps({"res": res, "ind": indata}), encoding="utf-8")
    kod = (f"const G=require('./schemawebb/statisk/grafer.js');const d=require({json.dumps(str(fil))});"
           "const rs=G.resurs(d.res,d.ind),ut={};for(const p of Object.keys(d.res.schema)){"
           "ut[p]={v1:G.radSumma(d.res,d.ind,p,[0,1,2,3,4,5,6],rs),alla:G.radSumma(d.res,d.ind,p,[...Array(28).keys()],rs)}}"
           "console.log(JSON.stringify(ut))")
    ut = json.loads(subprocess.run(["node", "-e", kod], cwd=ROT, capture_output=True, text=True, check=True).stdout)
    for pid, s in ut.items():
        rad = res["schema"][pid]
        assert s["alla"]["pass"] == res["personer"][pid]["pass"]
        assert s["alla"]["minuter"] == res["personer"][pid]["minuter"]
        assert s["v1"]["pass"] == sum(1 for p in rad[:7] if p)
        assert s["alla"]["kvall"] == res["personer"][pid]["kvallspass"]
        assert s["alla"]["morgon"] + s["alla"]["kvall"] + s["alla"]["natt"] == s["alla"]["pass"]
        # inga brott i granskningen betyder att vilan i sammanställningen håller gränserna
        assert s["alla"]["dygnsvila"] >= 660 and s["alla"]["veckovila"] >= 2160
