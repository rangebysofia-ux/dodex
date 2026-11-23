"""Extra helgpass per person (användarens beslut 2026-11-10): en lördag eller söndag en ledig helg, högst
extra_helgpass per schemaperiod. Ersätter ett vardagspass. Motor, granskning och balans i Python och lättversionen."""
import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor.balans import balans
from schemamotor.modell import kontrollera_indata
from schemamotor.validate import kontrollera as granska

ROT = Path(__file__).resolve().parent.parent
FALL = json.loads((ROT / "tests" / "fall" / "extra_helgpass.json").read_text(encoding="utf-8"))
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def kor(kod):
    return json.loads(subprocess.run(["node", "-e", kod], capture_output=True, text=True, timeout=120, check=True, cwd=ROT).stdout)


def utan_extra(ind):
    ind = copy.deepcopy(ind)
    for p in ind["personal"]:
        p.pop("extra_helgpass", None)
    return ind


@pytest.fixture(scope="module")
def light():
    return kor(r"""
const M = require("./light/motor.js"), fall = require("./tests/fall/extra_helgpass.json");
process.stdout.write(JSON.stringify(M.los(fall, { sekunder: 6 })));""")


def test_modellen():
    assert kontrollera_indata(FALL) == []
    ind = copy.deepcopy(FALL)
    ind["personal"][0]["extra_helgpass"] = 5
    assert kontrollera_indata(ind)  # högst 4


def test_balansen_raknar_med_extra_helgpass():
    assert balans(utan_extra(FALL))["forvantade_vakanser"] == 8
    b = balans(FALL)
    assert b["forvantade_vakanser"] == 0 and b["extra_helgpass"] == 8


@nod
def test_lattmotorn_anvander_extra_helgpass(light):
    assert light["status"] == "OK" and light["kpi"]["vakanta_pass"] == 0 and light["kpi"]["extra_helgpass"] == 8
    for pid, rad in light["schema"].items():
        extra = [d for d, p in enumerate(rad) if p and p.get("extra_helg")]
        assert len(extra) <= 1 and all(d % 7 in (5, 6) for d in extra)
        assert light["personer"][pid]["pass"] == 19  # ersätter vardagspass: lika många pass
    res = granska(FALL, light)
    assert res["giltigt"], res["brott"][:3]


@nod
def test_granskningen_fangar_for_manga(light):
    ind = copy.deepcopy(FALL)
    for p in ind["personal"]:
        p["extra_helgpass"] = 0
    py = granska(ind, light)
    js = kor(r"""
const G = require("./light/granskning.js"), ind = %s, s = %s;
process.stdout.write(JSON.stringify(G.kontrollera(ind, s)));""" % (json.dumps(ind), json.dumps(light)))
    assert not py["giltigt"] and not js["giltigt"]
    texter = lambda r: sorted((b["person"], b["text"]) for b in r["brott"] if b["regel"] == "HELG")  # noqa: E731
    assert texter(py) == texter(js) and any("inte både lördag och söndag" in t for _, t in texter(py))
    ind["personal"][0]["extra_helgpass"] = 1
    assert not any(b["person"] == "E1" for b in granska(ind, light)["brott"])


@nod
def test_lattbalansen_som_python():
    ut = kor(r"""
const M = require("./light/motor.js"), fall = require("./tests/fall/extra_helgpass.json");
const utan = JSON.parse(JSON.stringify(fall)); utan.personal.forEach(p => delete p.extra_helgpass);
process.stdout.write(JSON.stringify([M.balans(fall), M.balans(utan)]));""")
    assert ut[0]["forvantade_vakanser"] == 0 and ut[0]["extra_helgpass"] == 8 and ut[1]["forvantade_vakanser"] == 8


BADA = json.loads((ROT / "tests" / "fall" / "extra_helgpass_bada_dagarna.json").read_text(encoding="utf-8"))


@nod
def test_bada_dagarna_samma_lediga_helg():
    # beslut 38, ändrat 2026-11-23: lördag och söndag samma lediga helg är två extra helgpass
    from schemamotor.build import forbered, los
    res = los(forbered(copy.deepcopy(BADA)), tid_per_steg=6, arbetare=4, tyst=True)
    e1 = res["schema"]["E1"]
    assert e1[12] and e1[13] and e1[12].get("extra_helg") and e1[13].get("extra_helg")  # vecka 2 lör och sön
    assert granska(BADA, res)["giltigt"]
    ind = copy.deepcopy(BADA)
    ind["personal"][0]["extra_helgpass"] = 1
    py = granska(ind, res)
    js = kor(r"""
const G = require("./light/granskning.js"), ind = %s, s = %s;
process.stdout.write(JSON.stringify(G.kontrollera(ind, s)));""" % (json.dumps(ind), json.dumps(res)))
    texter = lambda r: sorted((b["person"], b["text"]) for b in r["brott"] if b["regel"] == "HELG")  # noqa: E731
    assert texter(py) == texter(js) == [("E1", "2 extra helgpass (veckor 2), fler än personens 1.")]
    assert kor(r"""
const G = require("./light/granskning.js"), ind = %s, s = %s;
process.stdout.write(JSON.stringify(G.kontrollera(ind, s).giltigt));""" % (json.dumps(BADA), json.dumps(res)))
