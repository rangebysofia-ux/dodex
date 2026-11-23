"""Olika sluttider för kvällspassen (docs/starttider.md, användarens beslut 2026-11-23): modell, motor, granskning
(Python och lättversionen) och redigeringen i guide.js."""
import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor.build import forbered, los
from schemamotor.modell import kontrollera_indata
from schemamotor.validate import kontrollera

ROT = Path(__file__).resolve().parent.parent
FALL = json.loads((ROT / "tests" / "fall" / "kvall_sluttider.json").read_text(encoding="utf-8"))
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def sluttider(schema, d):
    ut = {}
    for rad in schema.values():
        p = rad[d]
        if p and p["dygnsdel"] == "kvall":
            ut[p["slut"]] = ut.get(p["slut"], 0) + 1
    return ut


def test_modellen():
    assert kontrollera_indata(FALL) == []
    fel = copy.deepcopy(FALL)
    fel["starttider"]["kvall"].append({"tid": "21:00", "antal": 1})
    assert any("samma starttid" in f for f in kontrollera_indata(fel))
    fel = copy.deepcopy(FALL)
    fel["starttider"]["kvall"][0]["antal"] = 0
    assert kontrollera_indata(fel)


def test_passmallar_for_varje_sluttid():
    slut = {m["slut"] for m in forbered(FALL)["mallar"] if m["dygnsdel"] == "kvall"}
    assert slut == {21 * 60, 21 * 60 + 30, 22 * 60}


@pytest.fixture(scope="module")
def res():
    return los(forbered(FALL), tid_per_steg=8, arbetare=4, tyst=True)


def test_motorn_lagger_ratt_antal_vid_varje_sluttid(res):
    assert res["status"] == "OK" and res["kpi"]["sluttid_saknas"] == 0 and res["kpi"]["vakanta_pass"] == 0
    for d in range(FALL["veckor"] * 7):
        s = sluttider(res["schema"], d)
        assert s.get("21:00", 0) >= 1 and s.get("22:00", 0) >= 1, (d, s)
    g = kontrollera(FALL, res["schema"])
    assert g["giltigt"] and not [x for x in g["varningar"] if x["regel"] == "STARTTID"]


def test_granskningen_fangar_fel_sluttid(res):
    # en sluttid som inte finns i listan är fel passfönster (hårt)
    s = copy.deepcopy(res["schema"])
    pid, d = next((pid, d) for pid, rad in s.items() for d, p in enumerate(rad) if p and p["dygnsdel"] == "kvall")
    p = s[pid][d]
    p["slut"] = "21:45"
    assert any(b["regel"] == "PASSFONSTER" for b in kontrollera(FALL, s)["brott"])
    # utan sluttiderna i indata är 21:00 och 22:00 fel fönster
    utan = copy.deepcopy(FALL)
    del utan["starttider"]
    assert any(b["regel"] == "PASSFONSTER" for b in kontrollera(utan, res["schema"])["brott"])
    # flytta alla som slutar 22:00 en måndag till 21:30: varning för sluttiden
    s2 = copy.deepcopy(res["schema"])
    for rad in s2.values():
        p = rad[0]
        if p and p["dygnsdel"] == "kvall" and p["slut"] == "22:00":
            h, m = map(int, p["start"].split(":"))
            t = h * 60 + m - 30
            p["start"], p["slut"] = f"{t // 60:02d}:{t % 60:02d}", "21:30"
    v = [x for x in kontrollera(FALL, s2)["varningar"] if x["regel"] == "STARTTID"]
    assert len(v) == 1 and "kvällspass slutar kl 22:00" in v[0]["text"]


@nod
def test_lattversionen(tmp_path):
    ut = json.loads(subprocess.run(["node", "-e", r"""
const M = require("./light/motor.js"), G = require("./light/granskning.js");
const ind = require("./tests/fall/kvall_sluttider.json"), res = M.los(ind, { sekunder: 4 });
require("fs").writeFileSync(process.argv[1], JSON.stringify(res));
const g = G.kontrollera(ind, res.schema);
process.stdout.write(JSON.stringify({ kpi: res.kpi, g: g.varningar.filter(v => v.regel === "STARTTID").length, brott: g.brott.length }));""",
        str(tmp_path / "res.json")], capture_output=True, text=True, timeout=120, check=True, cwd=ROT).stdout)
    assert ut["kpi"]["hardregelbrott"] == 0 and ut["brott"] == 0
    assert ut["kpi"]["sluttid_saknas"] == ut["g"] == 0
    res = json.loads((tmp_path / "res.json").read_text(encoding="utf-8"))
    py = kontrollera(FALL, res["schema"])  # den oberoende Python-granskningen håller med
    assert py["giltigt"] and not [x for x in py["varningar"] if x["regel"] == "STARTTID"]


@nod
def test_guiden_skriver_bara_sin_lista():
    ut = json.loads(subprocess.run(["node", "-e", r"""
const G = require("./schemawebb/statisk/guide.js"), ind = { starttider: { morgon: [{ tid: "07:00", antal: 1 }] } };
G.sattStarttider(ind, [{ tid: "22:00", antal: 2 }, { tid: "21:00", antal: 1 }], "kvall");
const a = JSON.parse(JSON.stringify(ind));
G.sattStarttider(ind, [], "kvall");
process.stdout.write(JSON.stringify([a, ind, G.starttiderHtml([{ tid: "21:00", antal: 1 }], { del: "kvall", attr: "sl", knapp: "sl" })]));"""],
        capture_output=True, text=True, timeout=60, check=True, cwd=ROT).stdout)
    assert ut[0]["starttider"] == {"morgon": [{"tid": "07:00", "antal": 1}],
                                   "kvall": [{"tid": "21:00", "antal": 1}, {"tid": "22:00", "antal": 2}]}
    assert ut[1]["starttider"] == {"morgon": [{"tid": "07:00", "antal": 1}]}
    assert "+ Sluttid" in ut[2] and 'data-sl="0"' in ut[2]
