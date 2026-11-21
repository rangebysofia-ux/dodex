"""Jourpass över dygnet (Bilaga J, AB 25 § 13 mom. 5; docs/regelverk.md): ett pass i två halvor som belastar två
arbetsdagar, räknas in som kväll och morgon, och där hälften av jourtiden är arbetstid. Motor, granskning (Python och
lättversionen), justering och regelverket."""
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


@pytest.fixture(scope="module")
def res():
    return los(forbered(FALL), tid_per_steg=20, arbetare=4, tyst=True)  # 10 s gav ibland en vakans


def jourpass(schema):
    return [(pid, d) for pid, rad in schema.items() for d, p in enumerate(rad) if p and p.get("jourdel") == 1]


def test_jourpasset_ar_ett_pass_over_dygnet(res):
    assert res["status"] == "OK" and res["kpi"]["jourpass"] >= 4 and res["kpi"]["vakanta_pass"] == 0
    N = FALL["veckor"] * 7
    for pid, d in jourpass(res["schema"]):
        a, b = res["schema"][pid][d], res["schema"][pid][(d + 1) % N]
        assert (a["start"], a["slut"]) == ("15:00", "00:00") and a["dygnsdel"] == "jour"
        assert (b["start"], b["slut"], b["jourdel"]) == ("00:00", "08:00", 2) and b["jour"] == {"start": "00:00", "slut": "06:00"}
        assert b["netto"] == 2 * 60 + 3 * 60  # 06–08 och hälften av jouren
        assert d % 7 in (0, 1, 2, 3)  # bara de nätter som har jourbehov
    # ett pass, två arbetsdagar
    pid = jourpass(res["schema"])[0][0]
    rad = res["schema"][pid]
    assert res["personer"][pid]["pass"] == sum(1 for p in rad if p and p.get("jourdel") != 2)
    assert res["personer"][pid]["minuter"] == res["personer"][pid]["mal_minuter"] or abs(res["personer"][pid]["minuter"] - res["personer"][pid]["mal_minuter"]) <= 60
    g = kontrollera(FALL, res["schema"])
    assert g["giltigt"], g["brott"][:3]


def test_jourpasset_raknas_som_kvall_och_morgon(res):
    N = FALL["veckor"] * 7
    pid, d = jourpass(res["schema"])[0]
    s = copy.deepcopy(res["schema"])
    s[pid][d] = None
    s[pid][(d + 1) % N] = None  # utan jourpasset: en kvälls- och en morgonplats mindre
    fore = [v["text"] for v in kontrollera(FALL, res["schema"])["varningar"] if v["regel"] == "BEHOV" and "vakant" in v["text"]]
    efter = [v["text"] for v in kontrollera(FALL, s)["varningar"] if v["regel"] == "BEHOV" and "vakant" in v["text"]]
    assert len(efter) > len(fore)


def test_granskningen_fangar_fel(res):
    N = FALL["veckor"] * 7
    pid, d = jourpass(res["schema"])[0]
    s = copy.deepcopy(res["schema"])
    s[pid][(d + 1) % N] = None  # andra halvan saknas
    assert any("fortsätter inte" in b["text"] for b in kontrollera(FALL, s)["brott"])
    s = copy.deepcopy(res["schema"])
    nasta = (d + 2) % N
    s[pid][nasta] = {"mall": "x", "dygnsdel": "morgon", "start": "00:30", "slut": "07:00", "rast": 30, "netto": 360}
    t = [b["text"] for b in kontrollera(FALL, s)["brott"] if b["regel"] == "JOUR"]
    assert any("vila efter jourpasset" in x for x in t)
    s = copy.deepcopy(res["schema"])
    s[pid][(d + 1) % N]["slut"] = "12:00"  # 21 timmar
    assert any("högst 20 h" in b["text"] for b in kontrollera(FALL, s)["brott"])
    utan = {k: v for k, v in FALL.items() if k != "jour"}
    assert any("ingen jour" in b["text"] for b in kontrollera(utan, res["schema"])["brott"])


def test_justeringen_behaller_jourpasset(res):
    from schemamotor.justera import justera
    ny = justera(FALL, copy.deepcopy(res["schema"]), res)
    assert ny["kpi"]["jourpass"] == res["kpi"]["jourpass"]
    pid = jourpass(res["schema"])[0][0]
    assert ny["personer"][pid]["minuter"] == res["personer"][pid]["minuter"]


def test_modellen():
    assert kontrollera_indata(FALL) == []
    for andring in ({"slut": "12:00"}, {"jour_fran": "07:00"}, {"start": "09:00"}, {"behov": {"helgdag": 1}}):
        fel = copy.deepcopy(FALL)
        fel["jour"].update(andring)
        assert kontrollera_indata(fel), andring


@nod
def test_lattversionen(tmp_path):
    ut = json.loads(subprocess.run(["node", "-e", r"""
const M = require("./light/motor.js"), G = require("./light/granskning.js"), r = {};
for (const f of ["jour_bilaga_j", "jour_ingen_kan"]) {
  const ind = require("./tests/fall/" + f + ".json"), res = M.los(ind, { sekunder: 5, seed: 7 });
  require("fs").writeFileSync(process.argv[1] + "/" + f + ".json", JSON.stringify(res));
  const g = G.kontrollera(ind, res.schema);
  r[f] = { kpi: res.kpi, brott: g.brott.length, vakant: g.varningar.filter(v => /vakant jourpass/.test(v.text)).length };
}
process.stdout.write(JSON.stringify(r));""", str(tmp_path)], capture_output=True, text=True, timeout=120, check=True, cwd=ROT).stdout)
    a, b = ut["jour_bilaga_j"], ut["jour_ingen_kan"]
    assert a["kpi"]["jourpass"] >= 4 and a["brott"] == a["kpi"]["hardregelbrott"] and a["vakant"] == a["kpi"]["jour_saknas"]
    assert b["kpi"]["jour_saknas"] == 16 and b["kpi"]["jourpass"] == 0 and b["brott"] == 0
    for f in ut:
        fall = json.loads((ROT / "tests" / "fall" / f"{f}.json").read_text(encoding="utf-8"))
        py = kontrollera(fall, json.loads((tmp_path / f"{f}.json").read_text(encoding="utf-8"))["schema"])
        assert len(py["brott"]) == ut[f]["brott"], py["brott"][:3]  # den oberoende Python-granskningen håller med


@nod
def test_regelverket_och_installningarna():
    ut = json.loads(subprocess.run(["node", "-e", r"""
const RV = require("./schemawebb/statisk/regelverk.js"), r = {};
const ind = JSON.parse(JSON.stringify(require("./tests/fall/six_week_basic.json")));
r.andr = RV.andringar(ind, "bilaga-j"); RV.tillampa(ind, "bilaga-j"); r.jour = JSON.parse(JSON.stringify(ind.jour));
const el = (k, v) => ({ dataset: { jour: k }, value: v });
RV.jourAndra(ind, el("andel_arbetstid", "25")); RV.jourAndra(ind, el("slut", "09:00")); RV.jourAndra(ind, el("fre", "0")); RV.jourAndra(ind, el("lör", "0"));
r.efter = JSON.parse(JSON.stringify(ind.jour));
r.html = RV.jourHtml(ind).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
RV.jourAndra(ind, el("slut", "12:00")); r.varn = RV.varningar(ind);
RV.tillampa(ind, "dag-kvall-helg"); r.borta = ind.jour === undefined;
process.stdout.write(JSON.stringify(r));"""], capture_output=True, text=True, timeout=60, check=True, cwd=ROT).stdout)
    assert any("Jourpass 15:00–08:00" in a for a in ut["andr"])
    assert ut["jour"] == {"start": "15:00", "jour_fran": "00:00", "jour_till": "06:00", "slut": "08:00", "andel_arbetstid": 0.5, "behov": {"alla": 1}}
    e = ut["efter"]
    assert e["andel_arbetstid"] == 0.25 and e["slut"] == "09:00" and e["behov"] == {"mån": 1, "tis": 1, "ons": 1, "tor": 1, "sön": 1}
    assert "18 timmar från start till slut" in ut["html"]
    assert any("högst 20 timmar" in v for v in ut["varn"]) and ut["borta"]
