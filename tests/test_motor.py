"""Regressionstester för schemamotorn.

Varje fil i tests/fall/ har fältet "forvantat". Testerna kör motorns kommandon som
fristående program, precis som en användare skulle göra, och jämför med förväntat utfall.
Kör: pytest -q
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROT = Path(__file__).resolve().parent.parent
MOTOR = ROT / "motor"
FALL = sorted((ROT / "tests" / "fall").glob("*.json"))


def kor(skript, *args):
    return subprocess.run([sys.executable, str(MOTOR / skript), *map(str, args)],
                          capture_output=True, text=True, timeout=600)


@pytest.mark.parametrize("fall", FALL, ids=[f.stem for f in FALL])
def test_fall(fall, tmp_path):
    forv = json.loads(fall.read_text(encoding="utf-8"))["forvantat"]
    ut = tmp_path / "schema.json"
    bygg = kor("build_schedule.py", fall, "--ut", ut, "--tyst")
    if forv["status"] == "OK":
        assert bygg.returncode == 0, bygg.stdout + bygg.stderr
        granskning = kor("validate_schedule.py", fall, ut, "--json")
        res = json.loads(granskning.stdout)
        if forv.get("validering_utan_fel"):
            assert res["giltigt"], res["brott"]
    else:
        assert bygg.returncode == 1, bygg.stdout
        assert json.loads(bygg.stdout)["status"] == forv["status"]
        forklaring = json.loads(kor("explain_infeasibility.py", fall, "--json").stdout)
        grupper = {k["grupp"] for k in forklaring["konflikt"]}
        for g in forv.get("konflikt_innehaller", []):
            assert g in grupper, (g, grupper)
        if "cykelgrans" in forv:
            assert bool(forklaring["cykelgrans"]) == forv["cykelgrans"]


def test_granskning_hittar_fel(tmp_path):
    """Granskningen ska hitta en kväll följd av morgon (9 timmars vila)."""
    fall = ROT / "tests" / "fall" / "six_week_basic.json"
    ut = tmp_path / "schema.json"
    assert kor("build_schedule.py", fall, "--ut", ut, "--tyst").returncode == 0
    schema = json.loads(ut.read_text(encoding="utf-8"))
    rad = schema["schema"]["A1"]
    rad[9] = {"mall": "K", "dygnsdel": "kvall", "start": "13:45", "slut": "22:00", "rast": 30, "netto": 465}
    rad[10] = {"mall": "M", "dygnsdel": "morgon", "start": "07:00", "slut": "15:15", "rast": 30, "netto": 465}
    ut.write_text(json.dumps(schema), encoding="utf-8")
    res = json.loads(kor("validate_schedule.py", fall, ut, "--json").stdout)
    assert not res["giltigt"]
    assert any(b["regel"] == "DYGNSVILA" and b["person"] == "A1" for b in res["brott"])
