"""Startguiden (schemawebb/statisk/guide.js): förslagen och att enheten den skapar är giltig indata."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def ut():
    if not shutil.which("node"):
        pytest.skip("Node saknas")
    r = subprocess.run(["node", str(ROT / "tests" / "js" / "guide_test.js")], capture_output=True, text=True, timeout=60, check=True)
    return json.loads(r.stdout)


def test_minsta_antal_for_helgerna(ut):
    b = ut["berakna"]
    # helg: 2 morgon + max(3 kväll helg, 2 kväll fredag) = 5 per helg, varannan helg ger 10
    assert b["perHelg"] == 5 and b["minDag"] == 10
    assert b["minNatt"] == 2  # en natt per natt, varannan helg


def test_budgeten_fordelas(ut):
    g = ut["grader"]
    assert g["natt"] > 0 and 0.5 <= g["dag"] <= 1
    kontrakt = (10 * g["dag"] + 2 * g["natt"]) * 37
    assert kontrakt <= 300 + 0.01


def test_indata_ar_giltig(ut):
    ind = ut["indata"]
    assert kontrollera_indata(ind) == []
    assert len(ind["personal"]) == 12 and ind["startdatum"] == "2026-12-07" and ind["timkostnad_kr"] == 320
    assert all("namn" not in p for p in ind["personal"])  # id-koder, inga namn


def test_tom_enhet_och_kontroll(ut):
    assert ut["tom"]["personal"] == [] and ut["tom"]["behov"] == {}
    assert ut["fel"] == "Startdatum ska vara en måndag."
