"""Bemanningsbalans som i verksamhetens Excel-mall.

Testfilen byggs här med samma uppställning som mallen (påhittade namn). Siffrorna ska bli desamma som i
mallen: bemanning 305,38 h per vecka, budget − bemanning −3,46 h, bemanning − personal −16,52 h och så vidare.
"""
import base64
import datetime as dt
import io
import json
import shutil
import subprocess

import pytest

from schemamotor.bemanningsbalans import berakna, fran_excel
from schemamotor.modell import kontrollera_indata

NAMN = ["Anna Testsson", "Bo Prov", "Cia Exempel", "Dan Påhitt", "Eva Fiktiv", "Fia Låtsas", "Gun Test", "Hans Prov",
        "Vakant - Test", "Helg"]


def mall():
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "1.Budget + 2. Bemanningsbehov"
    for cell, v in {"S3": "Antal veckor", "S4": 4, "T3": "Dag/ kväll", "T4": 37, "S6": "ÅA totalt", "T6": 8.16,
                    "T8": "Buffert %", "T9": 0}.items():
        ws[cell] = v
    t = dt.time
    vardag = [(t(6), t(11), t(0)), (t(7, 30), t(20, 30), t(1)), (t(7, 30), t(19), t(1)), (t(14), t(21), t(0, 30)),
              (t(19), dt.datetime(1900, 1, 1), t(0))]
    helg = [(t(6), t(13), t(0, 30)), (t(8), t(21), t(1)), (t(7, 30), t(19), t(1)), (t(13, 30), t(20, 30), t(0, 30)),
            (t(19), dt.datetime(1900, 1, 1), t(0))]
    rad = 4
    for i, dag in enumerate(["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"]):
        ws.cell(rad, 2, dag)
        ws.cell(rad, 3, "Från")
        for j, (a, b, r) in enumerate(vardag if i < 5 else helg):
            ws.cell(rad + 1 + j, 3, a)
            ws.cell(rad + 1 + j, 5, b)
            ws.cell(rad + 1 + j, 7, r)
            # som i mallen: antal är en formel (1 när passet har arbetstid), utom på andra raden
            ws.cell(rad + 1 + j, 9, 1 if j == 1 else '=COUNTIFS(Tabell14[[#This Row],[Arbetstid]],">0")')
        for j in range(5, 8):  # tomma rader med 00:00
            ws.cell(rad + 1 + j, 3, t(0))
            ws.cell(rad + 1 + j, 5, t(0))
        rad += 15
    ws.cell(rad, 2, "JOUR")
    ws.cell(rad + 1, 2, "Mån-sön")
    ws.cell(rad + 2, 3, t(0))
    ws.cell(rad + 2, 5, t(6))
    ws.cell(rad + 2, 7, t(0))
    ws.cell(rad + 2, 8, t(3))
    ws.cell(rad + 2, 9, 7)
    wp = wb.create_sheet("3. Personalresurs")
    for k, v in enumerate(["Namn", "Helg 1= ja", "SSG", "Arbetsdagar", "Möjliga Arb. Tf/ period"], start=3):
        wp.cell(3, k, v)
    ssg = [0.85, 0.85, 1, 0.85, 1, 0.75, 1, 1, 1, 0.4]
    dagar = [17, 17, 16, 17, 17, 17, 17, 17, 17, 8]
    for i, (n, s, d) in enumerate(zip(NAMN, ssg, dagar)):
        wp.cell(4 + i, 3, n)
        wp.cell(4 + i, 4, 1)
        wp.cell(4 + i, 5, s)
        wp.cell(4 + i, 6, d)
    wp.cell(14, 4, '=COUNTIFS(F14,">0")')
    wp.cell(14, 5, 0)
    wp.cell(16, 3, "Summa")
    wo = wb.create_sheet("4. Övrig arbetstid")
    for k, v in enumerate(["Aktivitet", "Antal tillfällen/ år", "Tidsåtgång tim/ tillfälle", "Antal pers"], start=2):
        wo.cell(4, k, v)
    for i, rad_ in enumerate([("APT", 10, 22, 1), ("Utbildning", 2, 8, 9), ("Schemaombud", 12, 6, 1), ("Övertid", None, None, None)]):
        for k, v in enumerate(rad_, start=2):
            wo.cell(5 + i, k, v)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture(scope="module")
def importerad():
    delar, personal, medd = fran_excel(io.BytesIO(mall()))
    return {"veckor": 4, **delar, "personal": personal}, medd


def test_som_mallen(importerad):
    indata, _ = importerad
    r = berakna(indata)
    v, p = r["vecka"], r["period"]
    assert v["bemanning"]["brukarnara"] == pytest.approx(297)
    assert v["bemanning"]["ovrig"] == pytest.approx(436 / 52)
    assert v["bemanning"]["timmar"] == pytest.approx(305.3846, abs=1e-3)
    assert v["bemanning"]["aa"] == pytest.approx(8.253638, abs=1e-5)
    assert v["budget"]["timmar"] == pytest.approx(301.92)
    assert v["diff_budget"]["timmar"] == pytest.approx(-3.464615, abs=1e-5)
    assert v["personal"]["timmar"] == pytest.approx(321.9)
    assert v["personal"]["aa"] == pytest.approx(8.7)
    assert v["diff_personal"]["timmar"] == pytest.approx(-16.515385, abs=1e-5)
    assert v["diff_personal"]["procent"] == pytest.approx(5.40806, abs=1e-4)
    assert p["bemanning"]["pass"] == 140 and p["personal"]["pass"] == 160
    assert p["bemanning"]["helg"] == 5 and p["personal"]["helg"] == 5
    assert p["diff_personal"]["timmar"] == pytest.approx(-66.0615, abs=1e-3)
    assert r["overkapacitet"]["vecka"] == pytest.approx(16.515385, abs=1e-5)


def test_namn_sparas_inte(importerad):
    indata, medd = importerad
    text = json.dumps(indata, ensure_ascii=False)
    for n in NAMN:
        assert n not in text
    assert [p["id"] for p in indata["personal"]] == [f"P{i}" for i in range(1, 11)]
    assert "id-koder" in medd[0]
    # vardagar med samma pass slås ihop
    assert len(indata["bemanningsbalans"]["pass"]) < 15
    assert kontrollera_indata(indata) == []


@pytest.mark.skipif(not shutil.which("node"), reason="kräver Node")
def test_gransnittet_raknar_likadant(importerad, tmp_path):
    indata, _ = importerad
    fil = tmp_path / "i.json"
    fil.write_text(json.dumps(indata), encoding="utf-8")
    kod = f"const B=require('./schemawebb/statisk/bemanningsbalans.js');console.log(JSON.stringify(B.berakna(require({json.dumps(str(fil))}))))"
    from pathlib import Path
    js = json.loads(subprocess.run(["node", "-e", kod], cwd=Path(__file__).resolve().parent.parent,
                                   capture_output=True, text=True, check=True).stdout)
    py = berakna(indata)

    def jamfor(a, b, vag=""):
        if isinstance(b, dict):
            for k in b:
                jamfor(a[k], b[k], f"{vag}.{k}")
        elif isinstance(b, list):
            assert len(a) == len(b), vag
            for i, (x, y) in enumerate(zip(a, b)):
                jamfor(x, y, f"{vag}[{i}]")
        elif isinstance(b, float) or isinstance(a, float):
            assert a == pytest.approx(b, abs=1e-9), vag
        else:
            assert a == b, vag
    jamfor(js, py)


def test_import_via_webben(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path))
    monkeypatch.setenv("SCHEMA_LOSENORD", "hemligt-test")
    from fastapi.testclient import TestClient
    from schemawebb.app import app
    with TestClient(app) as k:
        k.post("/api/logga-in", json={"losenord": "hemligt-test"})
        svar = k.post("/api/bemanningsbalans/las", json={"fil_base64": base64.b64encode(mall()).decode()})
        assert svar.status_code == 200, svar.text
        d = svar.json()
        assert d["delar"]["budget_timmar_vecka"] == pytest.approx(301.92)
        assert len(d["personal"]) == 10
        fel = k.post("/api/bemanningsbalans/las", json={"fil_base64": base64.b64encode(b"inte excel").decode()})
        assert fel.status_code == 400 and "bemanningsbalans" in fel.json()["detail"]
