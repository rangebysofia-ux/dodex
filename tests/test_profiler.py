"""Tre schemaalternativ: medarbetarstyrt (rättvist), verksamhetsstyrt (jämn täckning) och ekonomistyrt (lägst OB).

Alla håller de hårda reglerna och har lika få vakanser. Varje profil ska vara minst lika bra som de andra på
sitt eget mål.
"""
import copy
import json
from pathlib import Path

import pytest

from schemamotor.build import forbered, los, ob_kategori
from schemamotor.validate import kontrollera

FALL = Path(__file__).resolve().parent / "fall" / "aktivitet_apt.json"


@pytest.fixture(scope="module")
def alternativ():
    bas = json.loads(FALL.read_text(encoding="utf-8"))
    ut = {}
    for profil in ("medarbetare", "verksamhet", "ekonomi"):
        ind = copy.deepcopy(bas)
        ind["losare"] = {"profil": profil}
        ut[profil] = (ind, los(forbered(ind), tid_per_steg=8, arbetare=4, tyst=True))
    return ut


def test_alla_haller_reglerna(alternativ):
    vak = set()
    for profil, (ind, res) in alternativ.items():
        assert res["status"] == "OK" and res["profil"] == profil
        assert kontrollera(ind, res)["giltigt"]
        vak.add(res["kpi"]["vakanser"])
    assert len(vak) == 1  # behovet kommer först i alla profiler


def test_varje_profil_bast_pa_sitt_mal(alternativ):
    k = {p: res["kpi"] for p, (_, res) in alternativ.items()}
    assert k["ekonomi"]["ob_kr_vecka"] <= min(k["medarbetare"]["ob_kr_vecka"], k["verksamhet"]["ob_kr_vecka"])
    assert k["medarbetare"]["rattvisa"] <= min(k["verksamhet"]["rattvisa"], k["ekonomi"]["rattvisa"])
    assert k["verksamhet"]["jamn_bemanning"] <= k["ekonomi"]["jamn_bemanning"]


def test_ob_kategorier():
    assert ob_kategori(0, 20 * 60) == "D"            # måndag kväll
    assert ob_kategori(1, 23 * 60) == "C"            # tisdag natt
    assert ob_kategori(4, 18 * 60) == "B"            # fredag efter 17
    assert ob_kategori(4, 23 * 60) == "B_natt"       # natt mot lördag
    assert ob_kategori(5, 12 * 60) == "B"            # lördag
    assert ob_kategori(0, 10 * 60) is None           # måndag dag
