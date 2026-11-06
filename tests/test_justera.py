"""Omräkning av handjusterade scheman (schemamotor/justera.py)."""
import json
from pathlib import Path

import pytest

from schemamotor.build import IndataFel
from schemamotor.justera import justera

FALL = Path(__file__).resolve().parent / "fall"


def indata():
    d = json.loads((FALL / "friday_rule_vacancy.json").read_text(encoding="utf-8"))
    d.pop("forvantat", None)
    return d


def tomt(ind):
    N = ind["veckor"] * 7
    return {p["id"]: [None] * N for p in ind["personal"]}


def test_tomt_schema_ger_bara_vakanser():
    ind = indata()
    res = justera(ind, tomt(ind))
    behov = sum(sum(v.values()) for v in [ind["behov"].get("vardag", {})] * 5 * ind["veckor"])
    assert res["kpi"]["vakanta_pass"] >= behov > 0
    assert all(p["minuter"] == 0 and p["pass"] == 0 for p in res["personer"].values())


def test_rast_och_arbetstid_raknas_ut():
    ind = indata()
    s = tomt(ind)
    pid = ind["personal"][0]["id"]
    s[pid][0] = {"dygnsdel": "morgon", "start": "07:00", "slut": "15:30"}
    s[pid][1] = {"dygnsdel": "morgon", "start": "07:00", "slut": "11:00"}
    s[pid][2] = {"dygnsdel": "natt", "start": "21:45", "slut": "07:15"}
    res = justera(ind, s)
    a, b, c = res["schema"][pid][:3]
    assert (a["rast"], a["netto"]) == (30, 480)
    assert (b["rast"], b["netto"]) == (0, 240)
    assert c["rast"] == 0 and c["netto"] == 570  # måltidsuppehåll på natten
    assert res["personer"][pid]["minuter"] == 480 + 240 + 570
    assert res["kpi"]["manuella_pass"] == 3


def test_felaktigt_schema_stoppas():
    ind = indata()
    s = tomt(ind)
    with pytest.raises(IndataFel):
        justera(ind, {**s, "OKAND": s[ind["personal"][0]["id"]]})
    with pytest.raises(IndataFel):
        justera(ind, {ind["personal"][0]["id"]: [None] * 3})
    s[ind["personal"][0]["id"]][0] = {"dygnsdel": "morgon", "start": "7", "slut": "15:00"}
    with pytest.raises(IndataFel):
        justera(ind, s)
