"""Fas 8: aktiverat schema på verkliga datum och frånvaro separat."""
from copy import deepcopy
import pytest

from schemamotor.planering import Planeringsfel, bemanning_for_datum, generera_daterade_pass, markera_franvaro


def grundschema(veckor, placerade):
    rader = {}
    for person, poster in placerade.items():
        rad = [None] * (7 * veckor)
        for dag, start, slut, dygnsdel in poster:
            rad[dag] = {"start": start, "slut": slut, "dygnsdel": dygnsdel, "rast": 30}
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


def test_nattpass_sondag_till_mandag_tillhor_schemat_det_borjade_i():
    """Ett nattpass söndag 21:45–måndag 06:45 när ett nytt schema aktiveras på måndagen (docs/planering.md).
    Passet hör till dagen det börjar, och därmed till det gamla grundschemat, hela vägen till 06:45."""
    aktiveringar = [
        {"id": 1, "enhet_id": 10, "korning_id": 201, "fran_datum": "2026-11-02"},
        {"id": 2, "enhet_id": 10, "korning_id": 202, "fran_datum": "2026-11-09"},
    ]
    korningar = {
        201: grundschema(1, {"N1": [(6, "21:45", "06:45", "natt")]}),           # söndag natt i gamla schemat
        202: grundschema(1, {"N2": [(0, "21:45", "06:45", "natt")]}),           # måndag natt i nya schemat
    }
    original = deepcopy(korningar)
    passlista = generera_daterade_pass(aktiveringar, korningar, "2026-11-08", "2026-11-09")
    sondag, mandag = passlista
    assert (sondag["person_id"], sondag["datum"], sondag["start"], sondag["slut"]) == (
        "N1", "2026-11-08", "2026-11-08T21:45", "2026-11-09T06:45")
    assert (sondag["aktivering_id"], sondag["korning_id"], sondag["grundschema_vecka"], sondag["dagindex"]) == (1, 201, 1, 6)
    assert (mandag["person_id"], mandag["aktivering_id"], mandag["korning_id"], mandag["dagindex"]) == ("N2", 2, 202, 0)
    # passet får inte dyka upp en gång till i det nya schemat på måndagen
    assert [p["person_id"] for p in passlista if p["datum"] == "2026-11-09"] == ["N2"]
    # ett intervall som bara omfattar måndagen innehåller inte söndagens nattpass (det hör till söndagen)
    assert [p["person_id"] for p in generera_daterade_pass(aktiveringar, korningar, "2026-11-09", "2026-11-09")] == ["N2"]
    med_midnattspass = deepcopy(korningar)
    med_midnattspass[201]["resultat"]["schema"]["A1"] = [None] * 6 + [{"start": "16:00", "slut": "00:00"}]
    tackning = bemanning_for_datum(aktiveringar, med_midnattspass, "2026-11-09")
    assert [(p["id"], p["tackning_start"], p["tackning_slut"]) for p in tackning] == [
        (sondag["id"], "2026-11-09T00:00", "2026-11-09T06:45"),
        (mandag["id"], "2026-11-09T21:45", "2026-11-10T00:00"),
    ]
    # frånvaro på passet pekar på det gamla schemats aktivering
    kopia = markera_franvaro(passlista, [{"pass_id": sondag["id"], "orsak": "annan"}])
    assert kopia[0]["id"].startswith("1:2026-11-08:") and kopia[0]["korning_id"] == 201
    assert kopia[0]["tackning"] == "ej_bedomd" and kopia[1]["status"] == "planerad"
    assert korningar == original
