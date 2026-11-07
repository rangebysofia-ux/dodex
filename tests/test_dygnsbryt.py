"""Eget dygnsbryt i regelprofilen (färdplan 4): förslag från passen, eget för nattpersonal och fast värde."""
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


@pytest.fixture(scope="module")
def schema():
    ind = json.loads((ROT / "tests" / "fall" / "six_week_basic.json").read_text(encoding="utf-8"))
    return ind, los(forbered(ind), tid_per_steg=6, arbetare=4, tyst=True)


def test_automatiskt_och_fast(schema):
    ind, res = schema
    auto = kontrollera(ind, res)
    assert auto["giltigt"]
    natt = [p["id"] for p in ind["personal"] if p.get("dygnsdelar") == ["natt"]]
    assert all(auto["dygnsbryt_per_person"][n] == "06:45" for n in natt)  # där nattpassen slutar
    fast = copy.deepcopy(ind)
    fast["regler"] = {"dygnsbryt": "15:30", "dygnsbryt_natt": "08:00"}
    assert kontrollera_indata(fast) == []
    g = kontrollera(fast, res)
    assert g["dygnsbryt"] == "15:30"
    assert all(g["dygnsbryt_per_person"][n] == "08:00" for n in natt)
    assert all(v == "15:30" for p, v in g["dygnsbryt_per_person"].items() if p not in natt)


def test_felaktigt_varde():
    ind = {"veckor": 4, "personal": [{"id": "A1", "grad": 1}], "regler": {"dygnsbryt": "kväll"}}
    assert any("Dygnsbryt ska vara auto" in f for f in kontrollera_indata(ind))


@pytest.mark.skipif(not shutil.which("node"), reason="kräver Node")
def test_lattversionen_foljer_fast_dygnsbryt(schema, tmp_path):
    ind, res = schema
    fast = copy.deepcopy(ind)
    fast["regler"] = {"dygnsbryt": "15:30", "dygnsbryt_natt": "08:00"}
    fil = tmp_path / "d.json"
    fil.write_text(json.dumps({"ind": fast, "res": res}), encoding="utf-8")
    kod = (f"const M=require('./light/motor.js'),G=require('./light/granskning.js');const d=require({json.dumps(str(fil))});"
           "const pr=M.forbered(d.ind);console.log(JSON.stringify({db:pr.db,natt:pr.nattDb,g:G.kontrollera(d.ind,d.res).dygnsbryt}))")
    ut = json.loads(subprocess.run(["node", "-e", kod], cwd=ROT, capture_output=True, text=True, check=True).stdout)
    assert ut == {"db": 15 * 60 + 30, "natt": 8 * 60, "g": "15:30"}
