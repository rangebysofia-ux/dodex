"""Förslagsmotorn och konsekvensanalysen (schemamotor/analys.py)."""
import copy
import json
from pathlib import Path

from schemamotor import validate
from schemamotor.analys import forslag, konsekvenser, rangordna, underlag
from schemamotor.build import forbered, los
from schemamotor.modell import kontrollera_indata

FALL = Path(__file__).resolve().parent / "fall"


def lasa(namn):
    return json.loads((FALL / namn).read_text(encoding="utf-8"))


def test_underlag_for_fredagsfallet():
    u = underlag(lasa("friday_rule_vacancy.json"), 300)
    # fredag kväll 3 + lördag morgon 2: fem varje helg, med varannan helg minst tio personer
    assert u["personer_per_helg_dag"] == 5 and u["minsta_antal_dag"] == 10
    assert u["fredagskvall_styr"] and u["natt_timmar_vecka"] == 0


def test_forslag_ar_giltig_indata_inom_budget():
    f = forslag(lasa("budget_357.json"))
    budget = f["underlag"]["budget_timmar_vecka"]
    ids = [s["id"] for s in f["scenarier"]]
    assert ids[0] == "nuvarande" and "heltid" in ids and "jamn" in ids
    for s in f["scenarier"]:
        assert kontrollera_indata(s["indata"]) == [], (s["id"], kontrollera_indata(s["indata"]))
        if s["id"] != "nuvarande":
            assert s["kontrakt_timmar_vecka"] <= budget + 0.05, s
            assert all(0.5 <= p["grad"] <= 1 for p in s["indata"]["personal"] if p.get("dygnsdelar") != ["natt"])


def test_fredagsforslag_kraver_farre_personer():
    f = forslag(lasa("friday_rule_vacancy.json"), 300)
    s = {x["id"]: x for x in f["scenarier"]}
    dag = lambda x: sum(1 for p in x["indata"]["personal"] if p.get("dygnsdelar") != ["natt"])  # noqa: E731
    assert dag(s["heltid"]) == 10 and dag(s["fredag"]) == 8 and dag(s["utan_fredagsregel"]) == 8
    assert s["fredag"]["indata"]["behov"]["fre"]["kvall"] == 1  # helgens kvällsbehov
    assert s["utan_fredagsregel"]["indata"]["regler"]["ingen_fredagskvall_fore_ledig_helg"] is False


def test_konsekvenser_och_rangordning():
    f = forslag(lasa("friday_rule_vacancy.json"), 300)
    for s in f["scenarier"]:
        if s["id"] in ("nuvarande", "utan_fredagsregel"):
            res = los(forbered(copy.deepcopy(s["indata"])), 4, 8, tyst=True)
            g = validate.kontrollera(copy.deepcopy(s["indata"]), res)
            s["konsekvenser"] = konsekvenser(s["indata"], res, g, 300)
    nu = next(s for s in f["scenarier"] if s["id"] == "nuvarande")["konsekvenser"]
    assert nu["vakanta_pass"] == 4 and nu["vakanser"]["fredagskvall"] == 4 and nu["brott"] == 0
    assert nu["budget_kvar"] > 0
    utan = next(s for s in f["scenarier"] if s["id"] == "utan_fredagsregel")["konsekvenser"]
    assert utan["vakanta_pass"] == 0 and not utan["fredagsregel"]
    lagda = [s for s in f["scenarier"] if "konsekvenser" in s]
    assert lagda[rangordna(lagda)[0]]["id"] == "utan_fredagsregel"
