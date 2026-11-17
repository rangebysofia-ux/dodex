"""Copilot-färdigheten dodex-schemamall (copilot/dodex-schemamall): skriptet ska ge en Excel-fil i DODEX
exportens layout och en enhetsfil som DODEX öppnar och granskar som ett schema från motorn."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from openpyxl import load_workbook

from schemamotor.build import forbered, los
from schemamotor.modell import kontrollera_indata
from schemamotor.validate import kontrollera

ROT = Path(__file__).resolve().parent.parent
SKILL = ROT / "copilot" / "dodex-schemamall" / "skill" / "dodex-schemamall"
sys.path.insert(0, str(SKILL / "scripts"))
from skapa_schemamall import las_cell, skapa  # noqa: E402

KOD = {"morgon": "D", "kvall": "K", "natt": "N"}


def test_skill_md_ar_giltig():
    import re
    yaml = pytest.importorskip("yaml")  # PyYAML finns inte alltid; testet hoppas då över
    s = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    fm = yaml.safe_load(re.match(r"---\n(.*?)\n---", s, re.S).group(1))
    assert fm["name"] == SKILL.name and 0 < len(fm["description"]) <= 1024


def test_celler_som_i_dodex():
    assert las_cell("D 07:00–15:15")["netto"] == 8 * 60 + 15 - 30
    assert las_cell("K 18:00–22:00")["rast"] == 0  # högst 5 timmar: ingen rast
    n = las_cell("N 21:45–06:45")
    assert n["dygnsdel"] == "natt" and n["netto"] == 9 * 60 and n["rast"] == 0
    assert las_cell("S 09:30–18:00")["dygnsdel"] == "kvall" and las_cell(None) is None


def test_rundtur_med_motorns_schema(tmp_path):
    fall = json.loads((ROT / "tests" / "fall" / "weekend_rotation.json").read_text(encoding="utf-8"))
    res = los(forbered(fall), tid_per_steg=5, arbetare=4, tyst=True)
    celler = {pid: [f"{KOD[p['dygnsdel']]} {p['start']}–{p['slut']}" if p else None for p in rad] for pid, rad in res["schema"].items()}
    u = {"enhet": "Provenhet", "veckor": fall["veckor"], "cykliskt": True,
         "behov": {"vardag": {"dag": 2, "kvall": 2}, "helg": {"dag": 2, "kvall": 1}},
         "personal": [{k: v for k, v in p.items() if k in ("id", "grad", "helgfrekvens", "helggrupp")} for p in fall["personal"]],
         "schema": celler}
    ut = skapa(u, mapp=str(tmp_path))
    fil = json.loads(Path(ut["enhetsfil"]).read_text(encoding="utf-8"))
    k = fil["korningar"][0]
    assert fil["format"] == "dodex-enhet" and kontrollera_indata(fil["enhet"]["indata"]) == []
    assert k["resultat"]["kpi"]["vakanta_pass"] == res["kpi"]["vakanta_pass"]
    assert all(k["resultat"]["personer"][p]["minuter"] == res["personer"][p]["minuter"] for p in res["personer"])
    assert kontrollera(fall, k["resultat"])["giltigt"]
    wb = load_workbook(ut["excel"])
    assert wb.sheetnames == ["Schema", "Per person", "Vakanser", "Granskning"]
    ws = wb["Schema"]
    assert ws["A1"].value == "Provenhet" and ws["B4"].value == "Vecka 1" and ws["B5"].value == "mån" and ws["A6"].value == "H1"
    if shutil.which("node"):  # DODEX enhetsfil.js öppnar filen med schemat
        kod = "const E=require('./schemawebb/statisk/enhetsfil.js');const d=E.las(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(d.korningar.length))"
        assert subprocess.run(["node", "-e", kod, ut["enhetsfil"]], capture_output=True, text=True, cwd=ROT, check=True).stdout == "1"


def test_tom_mall(tmp_path):
    ut = skapa({"enhet": "Tom mall", "veckor": 4, "personal": [{"id": "A1", "grad": 1}, {"id": "N1", "grad": 0.8, "natt": True}],
                "behov": {"vardag": {"dag": 3, "kvall": 3, "natt": 1}}}, mapp=str(tmp_path))
    fil = json.loads(Path(ut["enhetsfil"]).read_text(encoding="utf-8"))
    assert fil["korningar"] == [] and fil["enhet"]["indata"]["personal"][1]["dygnsdelar"] == ["natt"]
    assert ut["vakanta_pass"] == 20 * 7 and load_workbook(ut["excel"])["Schema"]["A2"].value.startswith("4 veckor")
    with pytest.raises(ValueError):
        las_cell("ledig hela dagen")
