"""Jour i direkt anslutning efter kvällspasset (AB 25 § 13 mom. 5, Bilaga J; docs/regelverk.md): motor, granskning
(Python och lättversionen), justering och regelverket."""
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
FALL = json.loads((ROT / "tests" / "fall" / "jour_bilaga_j.json").read_text(encoding="utf-8"))
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def tid(s):
    h, m = map(int, s.split(":"))
    return h * 60 + m


@pytest.fixture(scope="module")
def res():
    return los(forbered(FALL), tid_per_steg=8, arbetare=4, tyst=True)


def test_jouren_foljer_reglerna(res):
    assert res["status"] == "OK" and res["kpi"]["jour_saknas"] == 0 and res["kpi"]["vakanta_pass"] == 0
    N = FALL["veckor"] * 7
    for pid, rad in res["schema"].items():
        for d, p in enumerate(rad):
            if not p or not p.get("jour"):
                continue
            assert p["dygnsdel"] == "kvall" and p["jour"] == {"start": p["slut"], "slut": "07:00"}
            tot = (tid(p["slut"]) - tid(p["start"])) + (24 * 60 - tid(p["slut"]) + 7 * 60)
            assert tot <= 20 * 60
            assert rad[(d + 1) % N] is None  # dagen efter är ledig
    natter = {d for rad in res["schema"].values() for d, p in enumerate(rad) if p and p.get("jour")}
    assert all(d % 7 in (0, 1, 2, 3, 6) for d in natter) and len(natter) == 20
    g = kontrollera(FALL, res["schema"])
    assert g["giltigt"] and not [v for v in g["varningar"] if "vakant jour" in v["text"]]


def test_granskningen_fangar_fel(res):
    s = copy.deepcopy(res["schema"])
    pid, d = next((pid, d) for pid, rad in s.items() for d, p in enumerate(rad) if p and p.get("jour"))
    s[pid][(d + 1) % len(s[pid])] = {"mall": "x", "dygnsdel": "kvall", "start": "14:00", "slut": "22:00", "rast": 30, "netto": 450}
    t = [b["text"] for b in kontrollera(FALL, s)["brott"] if b["regel"] == "JOUR"]
    assert any("vila efter jouren" in x for x in t)
    s = copy.deepcopy(res["schema"])
    s[pid][d]["jour"] = {"start": "23:00", "slut": "07:00"}
    assert any("direkt anslutning" in b["text"] for b in kontrollera(FALL, s)["brott"])
    s = copy.deepcopy(res["schema"])
    s[pid][d]["jour"] = {"start": s[pid][d]["slut"], "slut": "16:00"}
    assert any("högst 20 h" in b["text"] for b in kontrollera(FALL, s)["brott"])
    utan = {k: v for k, v in FALL.items() if k != "jour"}
    assert any("ingen jour" in b["text"] for b in kontrollera(utan, res["schema"])["brott"])


def test_justeringen_behaller_jouren(res):
    from schemamotor.justera import justera
    s = copy.deepcopy(res["schema"])
    ny = justera(FALL, s, res)
    assert ny["kpi"]["jourpass"] == res["kpi"]["jourpass"] and ny["kpi"]["jour_saknas"] == 0
    pid, d = next((pid, d) for pid, rad in s.items() for d, p in enumerate(rad) if p and p.get("jour"))
    del s[pid][d]["jour"]
    assert justera(FALL, s, res)["kpi"]["jour_saknas"] == 1


def test_modellen():
    assert kontrollera_indata(FALL) == []
    fel = copy.deepcopy(FALL)
    fel["jour"]["behov"] = {"helgdag": 1}
    assert kontrollera_indata(fel)


@nod
def test_lattversionen(tmp_path):
    ut = json.loads(subprocess.run(["node", "-e", r"""
const M = require("./light/motor.js"), G = require("./light/granskning.js");
const r = {};
for (const f of ["jour_bilaga_j", "jour_over_20_timmar"]) {
  const ind = require("./tests/fall/" + f + ".json"), res = M.los(ind, { sekunder: 4 });
  require("fs").writeFileSync(process.argv[1] + "/" + f + ".json", JSON.stringify(res));
  const g = G.kontrollera(ind, res.schema);
  r[f] = { kpi: res.kpi, brott: g.brott.length, vakant: g.varningar.filter(v => /vakant jour/.test(v.text)).length };
}
process.stdout.write(JSON.stringify(r));""", str(tmp_path)], capture_output=True, text=True, timeout=120, check=True, cwd=ROT).stdout)
    a, b = ut["jour_bilaga_j"], ut["jour_over_20_timmar"]
    assert a["brott"] == 0 and a["kpi"]["hardregelbrott"] == 0 and a["kpi"]["jour_saknas"] <= 4 and a["vakant"] == a["kpi"]["jour_saknas"]
    assert b["kpi"]["jour_saknas"] == 28 and b["kpi"]["jourpass"] == 0
    for f in ut:
        fall = json.loads((ROT / "tests" / "fall" / f"{f}.json").read_text(encoding="utf-8"))
        py = kontrollera(fall, json.loads((tmp_path / f"{f}.json").read_text(encoding="utf-8"))["schema"])
        assert py["giltigt"], py["brott"][:3]  # den oberoende Python-granskningen håller med


@nod
def test_regelverket_lagger_till_och_tar_bort_jouren():
    ut = json.loads(subprocess.run(["node", "-e", r"""
const RV = require("./schemawebb/statisk/regelverk.js"), r = {};
const ind = JSON.parse(JSON.stringify(require("./tests/fall/six_week_basic.json")));
r.andr = RV.andringar(ind, "bilaga-j"); RV.tillampa(ind, "bilaga-j"); r.jour = JSON.parse(JSON.stringify(ind.jour)); r.varn = RV.varningar(ind);
RV.jourAndra(ind, { dataset: { jour: "fre" }, value: "0" }); RV.jourAndra(ind, { dataset: { jour: "lör" }, value: "0" }); r.behov = ind.jour.behov; r.varn2 = RV.varningar(ind);
RV.jourAndra(ind, { dataset: { jour: "slut" }, value: "08:00" }); r.slut = ind.jour.slut;
r.html = RV.jourHtml(ind).length > 0;
RV.tillampa(ind, "dag-kvall-helg"); r.efter = ind.jour === undefined;
process.stdout.write(JSON.stringify(r));"""], capture_output=True, text=True, timeout=60, check=True, cwd=ROT).stdout)
    assert any("Jour efter kvällspasset" in a for a in ut["andr"])
    assert ut["jour"] == {"slut": "07:00", "behov": {"alla": 1}}
    assert any("fredag och lördag natt" in v for v in ut["varn"])
    assert ut["behov"] == {"mån": 1, "tis": 1, "ons": 1, "tor": 1, "sön": 1} and not any("fredag" in v for v in ut["varn2"])
    assert ut["slut"] == "08:00" and ut["html"] and ut["efter"]
