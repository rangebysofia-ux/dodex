"""Team i en arbetsgrupp (docs/team.md): eget behov per team, hemteam, lån mellan team."""
import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor import validate
from schemamotor.build import forbered, fordela_team, los
from schemamotor.justera import justera
from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent
FALL = ROT / "tests" / "fall" / "team_behov.json"


def indata():
    d = json.loads(FALL.read_text(encoding="utf-8"))
    d.pop("beskrivning"); d.pop("forvantat")
    return d


@pytest.fixture(scope="module")
def losning():
    ind = indata()
    return ind, los(forbered(copy.deepcopy(ind)), 15, tyst=True)


def test_varje_pass_far_ett_team_och_teamen_tacks(losning):
    ind, res = losning
    assert res["status"] == "OK" and res["kpi"]["vakanta_pass"] == 0
    assert res["kpi"]["team_saknas"] == 0
    tids = {t["id"] for t in ind["team"]}
    for rad in res["schema"].values():
        for p in rad:
            if p:
                assert p["team"] in tids
    # lån bara där det behövs: team 3 har fyra medarbetare för sitt behov
    assert res["kpi"]["team_lan"] == res["kpi"]["hemteam"] <= 8
    g = validate.kontrollera(copy.deepcopy(ind), res)
    assert not g["brott"] and not [v for v in g["varningar"] if v["regel"] == "TEAM"]


def test_granskningen_hittar_fel_fordelning(losning):
    ind, res = losning
    res = copy.deepcopy(res)
    for rad in res["schema"].values():
        if rad[0] and rad[0]["dygnsdel"] == "morgon" and rad[0]["team"] == "T1":
            rad[0]["team"] = "T2"
            break
    g = validate.kontrollera(copy.deepcopy(ind), res)
    assert any("Team 1 har 1 av 2, fast Team 2 har fler" in v["text"] for v in g["varningar"])
    for rad in res["schema"].values():
        if rad[0]:
            rad[0]["team"] = "X"
            break
    assert any(b["regel"] == "TEAM" for b in validate.kontrollera(copy.deepcopy(ind), res)["brott"])


def test_fordelning_lanar_minsta_mojliga():
    team = [{"id": "A", "behov": [{"morgon": 2}] * 7}, {"id": "B", "behov": [{"morgon": 2}] * 7}]
    p = {"dygnsdel": "morgon"}
    schema = {f"a{i}": [dict(p)] for i in range(3)} | {"b1": [dict(p)], "fri": [dict(p)]}
    hem = {"a0": "A", "a1": "A", "a2": "A", "b1": "B", "fri": None}
    rader = fordela_team(schema, team, hem, 1)
    b = next(x for x in rader if x["team"] == "B")
    assert b["i_tjanst"] == 2 and b["inlanade"] == 1 and schema["fri"][0]["team"] == "B"  # den utan hemteam först
    assert [schema[f"a{i}"][0]["team"] for i in range(3)] == ["A"] * 3


def test_justering_raknar_om_team(losning):
    ind, res = losning
    ny = justera(copy.deepcopy(ind), copy.deepcopy(res["schema"]), res)
    assert ny["kpi"]["team_lan"] == res["kpi"]["team_lan"] and len(ny["team_tackning"]) == len(res["team_tackning"])


def test_indatakontroll():
    ind = indata()
    assert kontrollera_indata(ind) == []
    fel = copy.deepcopy(ind); fel["personal"][0]["team"] = "T9"
    assert any("T9" in f for f in kontrollera_indata(fel))
    fel = copy.deepcopy(ind); fel["team"][0]["behov"]["vardag"]["morgon"] = 9
    assert any("större än enhetens behov" in f for f in kontrollera_indata(fel))


@pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")
def test_lattmotorn_och_granskning_js():
    kod = ("const M=require(process.argv[1]),G=require(process.argv[2]);const f=JSON.parse(require('fs').readFileSync(process.argv[3],'utf8'));"
           "const r=M.los(f,{sekunder:4,seed:1});const g=G.kontrollera(f,r);"
           "process.stdout.write(JSON.stringify({status:r.status,vak:r.kpi.vakanta_pass,saknas:r.kpi.team_saknas,brott:g.brott.length,"
           "utan:Object.values(r.schema).flat().filter(p=>p&&!p.team).length}))")
    ut = json.loads(subprocess.run(["node", "-e", kod, str(ROT / "light" / "motor.js"), str(ROT / "light" / "granskning.js"), str(FALL)],
                                   capture_output=True, text=True, timeout=120, check=True).stdout)
    assert ut == {"status": "OK", "vak": 0, "saknas": 0, "brott": 0, "utan": 0}


@pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")
def test_inklistring_av_team(tmp_path):
    lista = "SSG\nteam 1\n100%\n100%\n50%\n\nteam 2\n100%\n80%\nTeam 5\n100%\n50%"
    f = tmp_path / "p.txt"
    f.write_text(lista, encoding="utf-8")
    kod = ("const K=require(process.argv[1]);const p=K.personal(require('fs').readFileSync(process.argv[2],'utf8'));"
           "process.stdout.write(JSON.stringify({team:p.team,pers:p.personer.map(x=>[x.grad,x.team||null]),varn:p.varningar}))")
    ut = json.loads(subprocess.run(["node", "-e", kod, str(ROT / "schemawebb" / "statisk" / "inklistring.js"), str(f)],
                                   capture_output=True, text=True, timeout=60, check=True).stdout)
    assert ut["team"] == ["Team 1", "Team 2", "Team 5"]
    assert ut["pers"] == [[100, "Team 1"], [100, "Team 1"], [50, "Team 1"], [100, "Team 2"], [80, "Team 2"], [100, "Team 5"], [50, "Team 5"]]
    assert ut["varn"] == []
