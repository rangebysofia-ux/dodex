"""Klistra in personal och behov (schemawebb/statisk/inklistring.js) och bygg en enhet i guiden. Se docs/inklistring.md."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent
NAMN = ["Anna Andersson", "Bo Berg", "Cia Ceder", "Dan Dahl", "Gun Gran", "Hans Holm"]

pytestmark = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def tolka(tmp_path, personal="", behov=""):
    f = tmp_path / "in.json"
    f.write_text(json.dumps({"personal": personal, "behov": behov}), encoding="utf-8")
    ut = subprocess.run(["node", str(ROT / "tests" / "js" / "inklistring_test.js"), str(f)],
                        capture_output=True, text=True, timeout=60, check=True).stdout
    return json.loads(ut)


EXCEL_PERSONAL = ("Namn\tGrad\tArbetar\tHelger\n"
                  "Anna Andersson\t100%\tDag/kväll\tvarannan\n"
                  "Bo Berg\t75%\tbara kväll\t\n"
                  "Cia Ceder\t0,9\tdag/kväll\t\n"
                  "Dan Dahl\t80\tD/K\tvar fjärde\n"
                  "Gun Gran\t90%\tNatt\t\n"
                  "Hans Holm\t30:54 tim\tNatt\t")


def test_personal_fran_excel(tmp_path):
    d = tolka(tmp_path, personal=EXCEL_PERSONAL)
    p = {x["id"]: x for x in d["personal"]["personer"]}
    assert list(p) == ["A1", "A2", "A3", "A4", "N1", "N2"]
    assert [p[i]["grad"] for i in p] == [100, 75, 90, 80, 90, 90]  # 30:54 h av 34:20 natt = 90 %
    assert p["A2"]["arbetar"] == "kvall" and p["A4"]["helg"] == "1/4" and p["N1"]["arbetar"] == "natt"
    ind = d["indata"]
    assert kontrollera_indata(ind) == []
    assert {x["id"]: x.get("dygnsdelar") for x in ind["personal"]}["A2"] == ["kvall"]
    assert {x["id"]: x.get("helgfrekvens") for x in ind["personal"]}["A4"] == "1/4"


def test_inga_namn_i_indata(tmp_path):
    d = tolka(tmp_path, personal=EXCEL_PERSONAL, behov="Vardag 3 2 1\nHelg 2 2 1")
    text = json.dumps(d["indata"], ensure_ascii=False)
    for namn in NAMN:
        for del_ in namn.split():
            assert del_ not in text


@pytest.mark.parametrize("behov", [
    "\tDag\tKväll\tNatt\nVardag\t3\t2\t1\nHelg\t2\t2\t1",
    "Vardag 3 2 1\nHelg 2 2 1",
    "mån-fre 3 2 1\nlör-sön 2 2 1",
    "Vardagar: 3 på dag, 2 på kväll och 1 natt\nHelger: 2 dag, 2 kväll, 1 natt",
    "Dag;Kväll;Natt\nvardagar;3;2;1\nhelger;2;2;1",
])
def test_behov_vardag_och_helg(tmp_path, behov):
    d = tolka(tmp_path, personal="A 100%\nB 100%\nC 100%\nD 100%\nE 100%\nF 100%\nN natt 100%\nM natt 100%", behov=behov)
    assert d["behov"]["varningar"] == []
    assert d["indata"]["behov"] == {"vardag": {"morgon": 3, "kvall": 2, "natt": 1}, "helg": {"morgon": 2, "kvall": 2, "natt": 1}}
    assert kontrollera_indata(d["indata"]) == []


def test_behov_per_veckodag_med_passtider(tmp_path):
    behov = ("\tMån\tTis\tOns\tTor\tFre\tLör\tSön\n"
             "07:00-15:30\t2\t2\t2\t2\t2\t2\t2\n"
             "06:45-12:00\t1\t1\t1\t1\t1\t0\t0\n"
             "14:00-21:30\t2\t2\t2\t2\t3\t2\t2\n"
             "21:15-07:00\t1\t1\t1\t1\t1\t1\t1")
    d = tolka(tmp_path, personal=EXCEL_PERSONAL, behov=behov)
    ind = d["indata"]
    assert ind["behov"]["mån"] == {"morgon": 3, "kvall": 2, "natt": 1}
    assert ind["behov"]["fre"] == {"morgon": 3, "kvall": 3, "natt": 1}
    assert ind["behov"]["lör"] == {"morgon": 2, "kvall": 2, "natt": 1}
    # enhetens tider är de som flest pass har; 06:45 nämns som en extra starttid
    assert ind["regler"] == {"kvall_slut": "21:30"}
    assert any("06:45" in v for v in d["behov"]["varningar"])
    assert ind["nattpass"][0]["start"] == "21:15" and ind["nattpass"][0]["slut"] == "07:00"
    assert kontrollera_indata(ind) == []


def test_grad_som_timmar_och_andelar(tmp_path):
    d = tolka(tmp_path, personal="Namn\tTimmar/vecka\nP1\t37\nP2\t27,75\nP3 natt\t34,33")
    assert [x["grad"] for x in d["personal"]["personer"]] == [100, 75, 100]
    d = tolka(tmp_path, personal="1\tP1\t0,75\n2\tP2\t0,5")  # radnummer först
    assert [x["grad"] for x in d["personal"]["personer"]] == [75, 50]


def test_otydligt_ger_varning_inte_gissning(tmp_path):
    d = tolka(tmp_path, personal="P1\nP2 75%", behov="hej hopp")
    assert d["personal"]["personer"][0]["grad"] == 100
    assert any("100 %" in v for v in d["personal"]["varningar"])
    assert d["behov"]["behov"] is None and d["behov"]["varningar"]
    d = tolka(tmp_path, behov="Vardag 3 2 1")
    assert any("lör, sön" in v for v in d["behov"]["varningar"])
    assert tolka(tmp_path)["fel"]


def test_bemanningsmall_med_block_per_veckodag(tmp_path):
    """Verksamhetens mall: ett block per veckodag med Från, Till, Rast, Arbetstid och antal per pass,
    tomma rader (00:00) och summarader. Grupper som Avdelningar och Löpare räknas ihop."""
    mall = (ROT / "tests" / "data" / "bemanningsmall_veckodagar.txt").read_text(encoding="utf-8")
    d = tolka(tmp_path, personal="P1 100%\nP2 75%", behov=mall)
    b = d["behov"]
    assert b["behov"]["mån"] == {"morgon": 14, "kvall": 12, "natt": 0}
    assert b["behov"]["fre"] == {"morgon": 14, "kvall": 12, "natt": 0}
    assert b["behov"]["lör"] == {"morgon": 12, "kvall": 6, "natt": 0}
    assert b["tider"] == {"morgon": "07:00", "kvall": "21:00"}
    assert b["grupper"] == ["Avdelningar", "Löpare"]  # förstärkning med 0 personer räknas inte
    assert not any("tolka" in v or "saknar" in v for v in b["varningar"])  # tomma rader och summor hoppas över tyst
    assert any("06:30" in v for v in b["varningar"]) and any("07:00–20:00" in v for v in b["varningar"])
    ind = d["indata"]
    assert ind["behov"] == {"vardag": {"morgon": 14, "kvall": 12, "natt": 0}, "helg": {"morgon": 12, "kvall": 6, "natt": 0}}
    assert ind["regler"] == {"kvall_slut": "21:00"}
    # passen följer med till bemanningsbalansen, med mallens rast och utan gruppnamn
    pass_ = ind["bemanningsbalans"]["pass"]
    assert {"dagar": "mån-sön", "fran": "12:00", "till": "21:00", "rast_minuter": 30, "antal": 6} in pass_
    assert {"dagar": "lör-sön", "fran": "07:00", "till": "20:00", "rast_minuter": 180, "antal": 6} in pass_
    assert {"dagar": "vardag", "fran": "06:30", "till": "15:00", "rast_minuter": 30, "antal": 2} in pass_
    assert len(pass_) == 6
    assert kontrollera_indata(ind) == []


def test_bemanningskurva(tmp_path):
    """Kurvan: antal i tjänst varje kvart. Vardag 26 när dag- och kvällspass överlappar, helg 18."""
    mall = (ROT / "tests" / "data" / "bemanningsmall_veckodagar.txt").read_text(encoding="utf-8")
    f = tmp_path / "m.txt"
    f.write_text(mall, encoding="utf-8")
    kod = ("const K=require(process.argv[1]);const b=K.behov(require('fs').readFileSync(process.argv[2],'utf8'));"
           "process.stdout.write(JSON.stringify([K.kurva(b.passDag,0),K.kurva(b.passDag,5)]))")
    vardag, helg = json.loads(subprocess.run(["node", "-e", kod, str(ROT / "schemawebb" / "statisk" / "inklistring.js"), str(f)],
                                             capture_output=True, text=True, timeout=60, check=True).stdout)
    kl = lambda h, m=0: (h * 60 + m) // 15
    assert vardag[kl(6)] == 0 and vardag[kl(6, 30)] == 2 and vardag[kl(7)] == 14 and vardag[kl(12)] == 26
    assert vardag[kl(15)] == 12 and vardag[kl(20)] == 6 and vardag[kl(21)] == 0
    assert helg[kl(7)] == 12 and helg[kl(12)] == 18 and helg[kl(16)] == 12 and helg[kl(20)] == 6
