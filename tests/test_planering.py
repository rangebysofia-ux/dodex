"""Fas 8: aktiverat schema på verkliga datum och frånvaro separat."""
from copy import deepcopy
import pytest

from schemamotor.planering import Planeringsfel, generera_daterade_pass, markera_franvaro


def grundschema(veckor, placerade):
    rader = {}
    for person, poster in placerade.items():
        rad = [None] * (7 * veckor)
        for dag, start, slut, del in poster:
            rad[dag] = {"start": start, "slut": slut, "dygnsdel": del, "rast": 30}
        rader[person] = rad
    return {"resultat": {"status": "OK", "veckor": veckor, "schema": rader}}


AKTIVERINGAR = [
    {"id": 1, "enhet_id": 10, "korning_id": 101, "fran_datum": "2026-11-02"},
    {"id": 2, "enhet_id": 10, "korning_id": 102, "fran_datum": "2026-11-16"},
]
KORNINGAR = {
    101: grundschema(2, {"A1": [(0, "07:00", "15:30", "morgon"), (7, "14:00", "22:00", "kvall")]}),
    102: grundschema(1, {"N1": [(0, "21:45", "06:45", "natt")]}),
}


def test_viker_ut_period_och_vaxlar_vid_ny_aktivering():
    passlista = generera_daterade_pass(AKTIVERINGAR, KORNINGAR, "2026-11-01", "2026-11-23")
    assert [(p["datum"], p["person_id"], p["grundschema_vecka"]) for p in passlista] == [
        ("2026-11-02", "A1", 1),
        ("2026-11-09", "A1", 2),
        ("2026-11-16", "N1", 1),
        ("2026-11-23", "N1", 1),
    ]
    assert passlista[2]["start"] == "2026-11-16T21:45"
    assert passlista[2]["slut"] == "2026-11-17T06:45"
    assert passlista[2]["korning_id"] == 102


def test_franvaro_ar_inte_automatisk_bokning_och_andrar_inte_grundschema():
    original = deepcopy(KORNINGAR)
    passlista = generera_daterade_pass(AKTIVERINGAR[:1], KORNINGAR, "2026-11-02", "2026-11-02")
    kopia = markera_franvaro(passlista, [{"pass_id": passlista[0]["id"], "orsak": "sjuk"}])
    assert passlista[0]["status"] == "planerad"
    assert kopia[0]["status"] == "franvaro_registrerad"
    assert kopia[0]["tackning"] == "ej_bedomd"
    assert "bokning" not in kopia[0]
    assert original == KORNINGAR


def test_saknade_och_dubbla_pass_avvisas():
    passlista = generera_daterade_pass(AKTIVERINGAR[:1], KORNINGAR, "2026-11-02", "2026-11-02")
    h = {"pass_id": passlista[0]["id"], "orsak": "semester"}
    with pytest.raises(Planeringsfel, match="redan"):
        markera_franvaro(passlista, [h, h])
    with pytest.raises(Planeringsfel, match="okänt"):
        markera_franvaro(passlista, [{"pass_id": "okänd"}])


def test_ogiltigt_intervall_och_schemadata_avvisas():
    with pytest.raises(Planeringsfel):
        generera_daterade_pass(AKTIVERINGAR, KORNINGAR, "2026-11-10", "2026-11-09")
    with pytest.raises(Planeringsfel):
        generera_daterade_pass(AKTIVERINGAR, {101: {"resultat": {"veckor": 2, "schema": {"A1": []}}}},
                               "2026-11-02", "2026-11-02")
    with pytest.raises(Planeringsfel, match="olika enheter"):
        generera_daterade_pass([*AKTIVERINGAR, {**AKTIVERINGAR[0], "enhet_id": 20}],
                               KORNINGAR, "2026-11-02", "2026-11-02")
