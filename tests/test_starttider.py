"""Olika starttider för dagpassen (docs/starttider.md): modell, motor, granskning (Python och lättversionen) och
redigeringen i guide.js."""
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
FALL = json.loads((ROT / "tests" / "fall" / "starttider_forskola.json").read_text(encoding="utf-8"))
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def starter(schema, d):
    ut = {}
    for rad in schema.values():
        p = rad[d]
        if p and p["dygnsdel"] == "morgon":
            ut[p["start"]] = ut.get(p["start"], 0) + 1
    return ut


def test_modellen():
    assert kontrollera_indata(FALL) == []
    fel = copy.deepcopy(FALL)
    fel["starttider"]["morgon"].append({"tid": "06:00", "antal": 1})
    assert any("samma starttid" in f for f in kontrollera_indata(fel))
    fel = copy.deepcopy(FALL)
    fel["starttider"]["morgon"][0]["tid"] = "25:00"
    assert kontrollera_indata(fel)


@pytest.fixture(scope="module")
def res():
    return los(forbered(FALL), tid_per_steg=8, arbetare=4, tyst=True)


def test_motorn_lagger_ratt_antal_vid_varje_tid(res):
    assert res["status"] == "OK" and res["kpi"]["starttid_saknas"] == 0 and res["kpi"]["vakanta_pass"] == 0
    for d in range(5):  # vardagar: 1 kl 06, 1 kl 07, 2 kl 08, 2 kl 09 (av ett behov på sex)
        s = starter(res["schema"], d)
        assert s.get("07:00", 0) >= 1 and s.get("08:00", 0) >= 2 and s.get("09:00", 0) >= 2 and s.get("06:00", 0) >= 1, s
    assert kontrollera(FALL, res["schema"])["giltigt"]


def test_granskningen_fangar_fel_starttid(res):
    s = copy.deepcopy(res["schema"])
    # flytta alla som börjar 09:00 en måndag till 06:00 (samma längd): två saknas kl 09:00
    for rad in s.values():
        p = rad[0]
        if p and p["start"] == "09:00":
            h, m = map(int, p["slut"].split(":"))
            p["start"], p["slut"] = "06:00", f"{h - 3:02d}:{m:02d}"
    v = [x for x in kontrollera(FALL, s)["varningar"] if x["regel"] == "STARTTID"]
    assert len(v) == 1 and "0 av 2 dagpass börjar kl 09:00" in v[0]["text"]
    # en starttid som inte finns i listan är fel fönster
    s2 = copy.deepcopy(res["schema"])
    p = next(x for x in s2["A1"] if x)
    p["start"] = "06:45"
    assert any(b["regel"] == "PASSFONSTER" for b in kontrollera(FALL, s2)["brott"])


def test_bara_sa_langt_behovet_racker():
    ind = copy.deepcopy(FALL)
    ind["behov"]["vardag"]["morgon"] = 3  # 1 + 1 + (1 av 2): kl 09:00 kommer ingen
    prob = forbered(ind)
    res = los(prob, tid_per_steg=6, arbetare=4, tyst=True)
    assert res["kpi"]["starttid_saknas"] == 0
    g = kontrollera(ind, res["schema"])
    assert not [x for x in g["varningar"] if x["regel"] == "STARTTID"]


@nod
def test_lattversionen(tmp_path):
    ut = json.loads(subprocess.run(["node", "-e", r"""
const M = require("./light/motor.js"), G = require("./light/granskning.js");
const ind = require("./tests/fall/starttider_forskola.json"), res = M.los(ind, { sekunder: 4 });
require("fs").writeFileSync(process.argv[1], JSON.stringify(res));
process.stdout.write(JSON.stringify({ kpi: res.kpi, g: G.kontrollera(ind, res.schema).varningar.filter(v => v.regel === "STARTTID").length,
  brott: G.kontrollera(ind, res.schema).brott.length }));""", str(tmp_path / "res.json")], capture_output=True, text=True, timeout=120, check=True, cwd=ROT).stdout)
    assert ut["kpi"]["hardregelbrott"] == 0 and ut["brott"] == 0
    assert ut["kpi"]["starttid_saknas"] == ut["g"] == 0
    res = json.loads((tmp_path / "res.json").read_text(encoding="utf-8"))
    py = kontrollera(FALL, res["schema"])  # den oberoende Python-granskningen håller med
    assert py["giltigt"] and not [x for x in py["varningar"] if x["regel"] == "STARTTID"]
    for d in range(5):
        s = starter(res["schema"], d)
        assert s.get("07:00", 0) >= 1 and s.get("08:00", 0) >= 2 and s.get("09:00", 0) >= 2, s


@nod
def test_redigeringen_och_guiden():
    ut = json.loads(subprocess.run(["node", "-e", r"""
const G = require("./schemawebb/statisk/guide.js"), r = {};
const el = (ds, value) => ({ dataset: ds, value });
let l = G.starttiderAndra([], el({ stNy: "1" }), { start: "06:00" });
l = G.starttiderAndra(l, el({ stNy: "1" }), { start: "06:00" });
l = G.starttiderAndra(l, el({ st: "1", sf: "antal" }, "2"));
r.lista = l;
r.bort = G.starttiderAndra(l, el({ stBort: "0" }));
const ind = {}; G.sattStarttider(ind, [{ tid: "08:00", antal: 1 }, { tid: "06:00", antal: 1 }, { tid: "08:00", antal: 1 }]); r.ind = ind;
const tom = { starttider: { morgon: [] } }; G.sattStarttider(tom, []); r.tom = tom;
r.html = G.starttiderHtml(l, { start: "06:00", behov: [{ morgon: 2 }] }).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// guiden: förskola får 06:00–18:00 i steget om tider, och starttiderna följer med till indata
const g = G.ny(); g.forskola = true; g.steg = 6; G.html(g);
r.tider = g.tider; g.starttider = [{ tid: "07:00", antal: 1 }]; r.indata = G.indata(g);
const h = G.ny(); h.steg = 6; G.html(h); r.vanlig = h.tider.morgon;
process.stdout.write(JSON.stringify(r));"""], capture_output=True, text=True, timeout=60, check=True, cwd=ROT).stdout)
    assert ut["lista"] == [{"tid": "06:00", "antal": 1}, {"tid": "07:00", "antal": 2}]
    assert ut["bort"] == [{"tid": "07:00", "antal": 2}]
    assert ut["ind"] == {"starttider": {"morgon": [{"tid": "06:00", "antal": 1}, {"tid": "08:00", "antal": 2}]}}
    assert ut["tom"] == {}
    assert "3 av dagbehovet (högst 2)" in ut["html"]
    assert ut["tider"]["morgon"] == "06:00" and ut["tider"]["kvall"] == "18:00" and ut["vanlig"] == "07:00"
    assert ut["indata"]["starttider"] == {"morgon": [{"tid": "07:00", "antal": 1}]}
    assert ut["indata"]["regler"] == {"morgon_start": "06:00", "kvall_slut": "18:00"}
