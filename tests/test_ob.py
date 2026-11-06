"""OB enligt AB 25 § 21 (schemawebb/statisk/ob.js), typfall från arbetstid-ob-mallar."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def ut():
    if not shutil.which("node"):
        pytest.skip("Node saknas")
    r = subprocess.run(["node", str(ROT / "tests" / "js" / "ob_test.js")], capture_output=True, text=True, timeout=60, check=True)
    return json.loads(r.stdout)


def test_fredagskvall_ar_b_inte_d(ut):  # T5
    assert ut["fredag"] == {"B": 300}


def test_vardagskvall_och_natt(ut):  # T6
    assert ut["tisdag"] == {"D": 180, "C": 60}
    assert ut["vardagsnatt"] == {"D": 15, "C": 480}


def test_nattforhojning_mot_lordag_men_inte_mot_mandag(ut):
    assert ut["fredagsnatt"] == {"B": 90, "B_natt": 480}
    assert ut["sondagsnatt"] == {"B": 555}


def test_storhelger(ut):
    assert ut["julafton"] == {"A": 480}
    assert ut["dagForeJul"] == {"A": 240}  # A från kl. 18 dagen före julafton
    assert ut["julnatt"] == {"A": 90, "A_natt": 480}
    assert ut["langfredag"] == {"A": 480}
    assert ut["midsommar"] == {"A": 240}
    assert ut["paskdagen2029"] == "Påskdagen"


def test_helganslutning(ut):
    assert ut["foreKristi"] == {"B": 360}  # kl. 16–24 vardag närmast före Kristi himmelsfärdsdag
    assert ut["klamfredag"] == {}
    assert ut["kategoriLordag"] == "B"


def test_rast_raknas_inte(ut):
    assert ut["medRast"] == {"D": 180, "C": 30}


def test_niva_efter_datum(ut):  # T4, T12
    assert ut["nivaMars"] == 66.1 and ut["nivaApril"] == 68.1
    assert ut["overGrans"] == {"min": 360, "kr": 156}  # 3 h × 25,60 + 3 h × 26,40
    assert ut["nivaSaknas"] is None  # efter 2027-03-31 gissas inga belopp


def test_manadsavrundning(ut):  # T7
    assert ut["avrundning"] == {"t40": 60, "t70": 90, "t70kr": 38.4}


def test_ett_ar_gar_fort(ut):
    assert ut["arsSchema"]["ms"] < 1500
    assert ut["arsSchema"]["saknar"] == 0 and ut["arsSchema"]["A"] > 0


def test_antaget_startdatum_ger_helt_ar_med_belopp(ut):
    assert ut["antaget"]["mandag"] and ut["antaget"]["saknar"] == 0


def test_prognos_efter_avtalet(ut):
    p = ut["prognos"]
    assert p["avtal2026"] == 68.1  # kontrollerade belopp ändras inte
    assert p["b2027"] == 70.14 and p["b2028"] == 72.25  # 68,10 × 1,03 och × 1,03²
    assert p["utan"] is None and p["markt"] is True
    assert p["standard"] == 3 and p["av"] == 0
    assert p["ar"] == {"saknar": 0, "prognosMin": True}
