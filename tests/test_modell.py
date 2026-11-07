"""Kontroll av indata: typiska fel ska ge begripliga meddelanden på svenska."""
import copy
import json
from pathlib import Path

import pytest

from schemamotor.modell import IndataKontrollFel, kontrollera_indata, las_indata

FALL = Path(__file__).resolve().parent / "fall"


@pytest.fixture
def bas():
    return json.loads((FALL / "six_week_basic.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("fil", sorted(FALL.glob("*.json")), ids=lambda f: f.stem)
def test_testfallen_ar_giltiga(fil):
    assert kontrollera_indata(json.loads(fil.read_text(encoding="utf-8"))) == []


def test_okand_dag(bas):
    bas["behov"]["fredag"] = {"morgon": 2}
    fel = kontrollera_indata(bas)
    assert fel == ["behov: okänd dag: fredag (använd vardag, helg, alla eller mån, tis, ons, tor, fre, lör, sön)"]


def test_saknad_grad(bas):
    del bas["personal"][6]["grad"]
    assert kontrollera_indata(bas) == ["personal B1, sysselsättningsgrad: saknas"]


def test_periodlangd_utan_heltal(bas):
    for p in bas["personal"]:
        p.pop("antal_pass", None)
    # 6 veckor går bra: dag- och kvällspersonalen får växelvis 28 och 29 pass (docs/regelhierarki.md, punkt 5)
    assert kontrollera_indata(bas) == []
    from schemamotor.build import forbered
    pass_ = [p["pass_delperioder"][0] for p in forbered(bas)["personer"] if not p["natt"]]
    assert pass_[:4] == [28, 29, 28, 29]


def test_flera_fel_pa_en_gang(bas):
    x = copy.deepcopy(bas)
    x["personal"][0]["grad"] = 1.5
    x["personal"][1]["dygnsdelar"] = ["kväll"]
    x["onskemal"] = [{"person": "Z9", "typ": "tidigast_start", "varde": "7"}]
    with pytest.raises(IndataKontrollFel) as e:
        las_indata(x)
    texter = "\n".join(e.value.fel)
    assert "A1, sysselsättningsgrad: får vara högst 1 (100 %)" in texter
    assert "morgon, kvall eller natt" in texter
    assert "Z9, som inte finns i personalen" in texter
    assert "klockslag" in texter


def test_varannan_helg_ar_last_for_enheten(bas):
    bas["regler"] = {"helgfrekvens": "1/4"}
    assert any("Varannan helg är en hård lokal regel" in f for f in kontrollera_indata(bas))
    bas["regler"] = {"helgfrekvens": "2/4"}
    assert kontrollera_indata(bas) == []
    bas["regler"] = {}
    bas["personal"][0]["helgfrekvens"] = "ingen"  # undantag per person är tillåtet
    assert kontrollera_indata(bas) == []


def test_avtal_och_lag_kan_inte_forsvagas(bas):
    bas["regler"] = {"dygnsvila_minuter": 540, "veckovila_minuter": 2400, "rast_grans_minuter": 360, "fel_regel": 1}
    fel = kontrollera_indata(bas)
    assert any(f.startswith("Dygnsvilan kan inte vara kortare än 11 timmar (AB 25 § 13 mom. 8).") for f in fel)
    assert any(f.startswith("Rast krävs efter högst 5 timmars arbete (ATL 15 §).") for f in fel)
    assert not any("Veckovilan" in f for f in fel)  # 40 timmar är en skärpning
    assert any("Okända regler: fel_regel" in f for f in fel)


def test_avvikelse_kraver_bekraftelse(bas):
    bas["regler"] = {"veckovila_minuter": 1440, "helgfrekvens": "1/4"}
    fel = kontrollera_indata(bas)
    assert any("Veckovilan" in f for f in fel) and any("Varannan helg" in f for f in fel)
    bas["avvikelser"] = ["veckovila_minuter", "helgfrekvens"]
    assert kontrollera_indata(bas) == []
    bas["avvikelser"] = ["pass_per_vecka"]
    assert any("Avvikelser kan bara godkännas" in f for f in kontrollera_indata(bas))


def test_dygnsvila_11_timmar_kan_inte_lasas_upp(bas):
    # Verksamhetens beslut 2026-11-07 (AB 25 § 13 mom. 8): ingen upplåsning, inte heller med bekräftelse
    bas["regler"] = {"dygnsvila_minuter": 600}
    bas["avvikelser"] = ["dygnsvila_minuter"]
    assert any("kan inte låsas upp" in f for f in kontrollera_indata(bas))
    bas["regler"] = {"dygnsvila_minuter": 720}  # längre vila är en skärpning
    bas["avvikelser"] = []
    assert kontrollera_indata(bas) == []
