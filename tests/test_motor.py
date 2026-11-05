"""Regressionstester för schemamotorn.

Varje fil i tests/fall/ har fältet "forvantat". Testerna kör motorns kommandon som
fristående program (python -m schemamotor.…), precis som en användare skulle göra, och jämför med förväntat utfall.
Kör: pytest -q
"""
import ast
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROT = Path(__file__).resolve().parent.parent
PAKET = ROT / "schemamotor"
FALL = sorted((ROT / "tests" / "fall").glob("*.json"))


def kor(modul, *args):
    return subprocess.run([sys.executable, "-m", f"schemamotor.{modul}", *map(str, args)],
                          capture_output=True, text=True, timeout=600, cwd=ROT)


@pytest.mark.parametrize("fall", FALL, ids=[f.stem for f in FALL])
def test_fall(fall, tmp_path):
    forv = json.loads(fall.read_text(encoding="utf-8"))["forvantat"]
    ut = tmp_path / "schema.json"
    bygg = kor("build", fall, "--ut", ut, "--tyst")
    if forv["status"] == "OK":
        assert bygg.returncode == 0, bygg.stdout + bygg.stderr
        granskning = kor("validate", fall, ut, "--json")
        res = json.loads(granskning.stdout)
        if forv.get("validering_utan_fel"):
            assert res["giltigt"], res["brott"]
        kpi = json.loads(ut.read_text(encoding="utf-8"))["kpi"]
        if "vakanta_pass" in forv:
            assert kpi["vakanta_pass"] == forv["vakanta_pass"], kpi
        # bemanningsbalansen ska förutsäga lösarens vakanta pass
        balans = json.loads(kor("balans", fall, "--json").stdout)
        assert balans["forvantade_vakanser"] == kpi["vakanta_pass"], (balans, kpi)
    else:
        assert bygg.returncode == 1, bygg.stdout
        assert json.loads(bygg.stdout)["status"] == forv["status"]
        forklaring = json.loads(kor("explain", fall, "--json").stdout)
        grupper = {k["grupp"] for k in forklaring["konflikt"]}
        for g in forv.get("konflikt_innehaller", []):
            assert g in grupper, (g, grupper)
        if "cykelgrans" in forv:
            assert bool(forklaring["cykelgrans"]) == forv["cykelgrans"]


def test_granskning_hittar_fel(tmp_path):
    """Granskningen ska hitta en kväll följd av morgon (9 timmars vila)."""
    fall = ROT / "tests" / "fall" / "six_week_basic.json"
    ut = tmp_path / "schema.json"
    assert kor("build", fall, "--ut", ut, "--tyst").returncode == 0
    schema = json.loads(ut.read_text(encoding="utf-8"))
    rad = schema["schema"]["A1"]
    rad[9] = {"mall": "K", "dygnsdel": "kvall", "start": "13:45", "slut": "22:00", "rast": 30, "netto": 465}
    rad[10] = {"mall": "M", "dygnsdel": "morgon", "start": "07:00", "slut": "15:15", "rast": 30, "netto": 465}
    ut.write_text(json.dumps(schema), encoding="utf-8")
    res = json.loads(kor("validate", fall, ut, "--json").stdout)
    assert not res["giltigt"]
    assert any(b["regel"] == "DYGNSVILA" and b["person"] == "A1" for b in res["brott"])


def test_granskningen_ar_fristaende():
    """validate får aldrig importera från build, annars kan den inte fånga fel i motorn."""
    trad = ast.parse((PAKET / "validate.py").read_text(encoding="utf-8"))
    for nod in ast.walk(trad):
        if isinstance(nod, ast.Import):
            namn = [a.name for a in nod.names]
        elif isinstance(nod, ast.ImportFrom):
            namn = [nod.module or ""] + [a.name for a in nod.names]
        else:
            continue
        assert not any("build" in n or n.startswith("schemamotor") for n in namn), namn


def test_balans_utan_fredagsregel():
    """Utan fredagsregeln ska fredagsfallet inte ge några vakanser."""
    from schemamotor.balans import balans
    indata = json.loads((ROT / "tests" / "fall" / "friday_rule_vacancy.json").read_text(encoding="utf-8"))
    assert balans(indata)["forvantade_vakanser"] == 4
    indata["regler"] = {"ingen_fredagskvall_fore_ledig_helg": False}
    res = balans(indata)
    assert res["forvantade_vakanser"] == 0
    assert not any("Fredagskvällarna" in a for a in res["atgarder"])
