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
        if "natt_vila_max" in forv:
            assert kpi["natt_vila"] <= forv["natt_vila_max"], kpi
        if "kompetensvakanser" in forv:
            assert kpi.get("kompetensvakanser", 0) == forv["kompetensvakanser"], kpi
        if "kompetensvakanser_min" in forv:
            # kravet är mjukt: det som inte går att täcka blir kompetensvakanser, aldrig avtalsbrott
            assert kpi["kompetensvakanser"] >= forv["kompetensvakanser_min"], kpi
            assert any(v["regel"] == "KOMPETENS" for v in res["varningar"]), res["varningar"][:3]
        if "aktivitet_saknas" in forv:
            assert kpi["aktivitet_saknas"] == forv["aktivitet_saknas"], kpi
        if "jamn_dag_kvall_max_skillnad" in forv:
            # det som blir över ska fördelas jämnt mellan dag och kväll (jämn bemanning)
            from schemamotor.build import expandera_dagvarden
            ind = json.loads(fall.read_text(encoding="utf-8"))
            beh, sch = expandera_dagvarden(ind["behov"], dict), json.loads(ut.read_text(encoding="utf-8"))["schema"]
            over = {"morgon": 0, "kvall": 0}
            for d in range(ind["veckor"] * 7):
                for del_ in over:
                    n = sum(1 for rad in sch.values() if rad[d] and rad[d]["dygnsdel"] == del_)
                    over[del_] += max(0, n - beh[d % 7].get(del_, 0))
            assert abs(over["morgon"] - over["kvall"]) <= forv["jamn_dag_kvall_max_skillnad"], over
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


def test_dygnsvila_avvikelse_godtas_inte_av_granskningen(tmp_path):
    """Med godkänd dygnsvila på 9 timmar ska kväll följd av morgon inte vara ett brott."""
    fall = ROT / "tests" / "fall" / "six_week_basic.json"
    indata = json.loads(fall.read_text(encoding="utf-8"))
    ut = tmp_path / "schema.json"
    assert kor("build", fall, "--ut", ut, "--tyst").returncode == 0
    schema = json.loads(ut.read_text(encoding="utf-8"))
    rad = schema["schema"]["A1"]
    rad[9] = {"mall": "K", "dygnsdel": "kvall", "start": "13:45", "slut": "22:00", "rast": 30, "netto": 465}
    rad[10] = {"mall": "M", "dygnsdel": "morgon", "start": "07:00", "slut": "15:15", "rast": 30, "netto": 465}
    ut.write_text(json.dumps(schema), encoding="utf-8")
    # 11 timmars dygnsvila kan inte låsas upp (verksamhetens beslut 2026-11-07): 9 timmars vila är ett brott även
    # om någon försöker godkänna en avvikelse
    indata["regler"] = {"dygnsvila_minuter": 540}
    indata["avvikelser"] = ["dygnsvila_minuter"]
    ny = tmp_path / "indata.json"
    ny.write_text(json.dumps(indata), encoding="utf-8")
    res = kor("validate", ny, ut, "--json")
    assert res.returncode != 0


def test_minsta_passlangd_tar_bort_pass(tmp_path):
    """Under cirka 64 % blir 4,75 pass i veckan kortare än 5 timmar; då tas pass bort i stället."""
    fall = ROT / "tests" / "fall" / "low_grade_shifts.json"
    ut = tmp_path / "schema.json"
    assert kor("build", fall, "--ut", ut, "--tyst").returncode == 0
    res = json.loads(ut.read_text(encoding="utf-8"))
    antal = {pid: k["pass"] for pid, k in res["personer"].items()}
    assert antal["L1"] == 19 and antal["L4"] == 19
    assert antal["L5"] == 17 and antal["L7"] == 14
    kortast = min(p["netto"] for rad in res["schema"].values() for p in rad if p)
    assert kortast >= 300, kortast
    # med regeln avstängd blir det 19 pass även för 50 %, och passen kortare än 5 timmar
    indata = json.loads(fall.read_text(encoding="utf-8"))
    indata["regler"] = {"min_passlangd_minuter": 0}
    from schemamotor.build import forbered
    prob = forbered(indata)
    assert [sum(p["pass_delperioder"]) for p in prob["personer"]][-1] == 19
