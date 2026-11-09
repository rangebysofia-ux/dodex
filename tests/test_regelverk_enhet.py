"""Regelverk för en enhet (schemawebb/statisk/regelverk.js, docs/regelverk.md): 40-timmarsvecka, dag/kväll/helg och
funktionsstöd med Bilaga J."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def kor(kod):
    return json.loads(subprocess.run(["node", "-e", kod], capture_output=True, text=True, timeout=60, check=True, cwd=ROT).stdout)


@nod
def test_byta_regelverk_och_tillbaka():
    ut = kor(r"""
const RV = require("./schemawebb/statisk/regelverk.js"), r = {};
const ind = JSON.parse(JSON.stringify(require("./tests/fall/six_week_basic.json")));
ind.avvikelser = ["dygnsvila_minuter"];  // upplåst för hand: ska ligga kvar
r.andr = RV.andringar(ind, "40-timmar");
RV.tillampa(ind, "40-timmar"); r.fyrtio = JSON.parse(JSON.stringify(ind)); r.varn = RV.varningar(ind);
RV.tillampa(ind, "dag-kvall-helg"); r.tillbaka = JSON.parse(JSON.stringify(ind));
r.j = RV.andringar(ind, "bilaga-j");
r.kort = RV.kort(ind, "40-timmar").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
process.stdout.write(JSON.stringify(r));""")
    f = ut["fyrtio"]
    assert f["regelverk"] == "40-timmar" and f["heltid_minuter_per_vecka"] == 2400
    assert f["regler"]["helgfrekvens"] == "ingen" and f["regler"]["pass_per_vecka"] == 5
    assert set(f["avvikelser"]) == {"helgfrekvens", "dygnsvila_minuter"}  # varannan helg syns som avvikelse
    assert f["behov"]["helg"] == {"morgon": 0, "kvall": 0, "natt": 0}
    assert all(p["dygnsdelar"] == (["natt"] if p["id"].startswith("N") else ["morgon"]) for p in f["personal"])
    assert any("Varannan helg låses upp" in a for a in ut["andr"]) and any("40 timmar" in a for a in ut["andr"])
    assert any("kväll eller natt" in v for v in ut["varn"])  # behovet har kväll: varnas, ändras inte tyst
    t = ut["tillbaka"]
    assert t["regelverk"] == "dag-kvall-helg" and "heltid_minuter_per_vecka" not in t
    assert t["avvikelser"] == ["dygnsvila_minuter"] and "regler" not in t
    assert len(ut["j"]) == 1 and "Jourpass 15:00–08:00" in ut["j"][0]  # samma värden som dag/kväll/helg, plus jouren
    assert "40 timmar per helgfri vecka" in ut["kort"] and "Det här ändras" in ut["kort"]


def test_modellen_godtar_regelverket():
    ind = json.loads((ROT / "tests" / "fall" / "regelverk_40_timmar.json").read_text(encoding="utf-8"))
    assert kontrollera_indata(ind) == []
    ind["avvikelser"] = []
    assert kontrollera_indata(ind)  # ingen helgtjänstgöring utan att varannan helg är upplåst går inte
    ind["avvikelser"] = ["helgfrekvens"]
    ind["regelverk"] = "okänt"
    assert kontrollera_indata(ind)


def test_lattversionen_har_regelverken():
    s = (ROT / "light" / "schema-light.html").read_text(encoding="utf-8")
    assert "const RV = (" in s and "RV.kort(" in s


@nod
def test_bilaga_j_bara_for_lss_enheter():
    ut = kor(r"""
const RV = require("./schemawebb/statisk/regelverk.js"), ORG = require("./schemawebb/statisk/organisation.js");
const n = ORG.kopia().concat([{ id: "gb", namn: "Gruppbostäder", forelder: "lss" }, { id: "fs", namn: "Funktionsstöd", forelder: null }]);
const ind = JSON.parse(JSON.stringify(require("./tests/fall/six_week_basic.json")));
const val = h => (h.match(/<option value="([^"]+)"/g) || []).map(x => x.slice(15, -1));
const r = { lss: ["lss", "gb", "fs", "sabo", "forskola", null].map(id => ORG.arLss(n, id)) };
r.ja = val(RV.kort(ind, null, { lss: true })); r.nej = val(RV.kort(ind, "bilaga-j", { lss: false }));
r.nejText = RV.kort(ind, "bilaga-j", { lss: false });
RV.tillampa(ind, "bilaga-j"); r.redan = RV.kort(ind, null, { lss: false });
process.stdout.write(JSON.stringify(r));""")
    assert ut["lss"] == [True, True, True, False, False, False]  # under LSS, eller en grupp som heter funktionsstöd
    assert "bilaga-j" in ut["ja"] and "bilaga-j" not in ut["nej"]
    assert "Använd funktionsstöd" not in ut["nejText"] and "kan väljas för enheter som ligger under LSS" in ut["nejText"]
    assert "Enheten ligger inte under LSS" in ut["redan"]  # redan valt: syns som varning, tas inte bort tyst
