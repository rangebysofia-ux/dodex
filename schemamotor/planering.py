"""Datumlagda pass från aktiverade grundscheman.

En ren beräkningsmodul: ändrar inte grundschema eller databas.
Nästa steg är att spara frånvaro, täckningsbeslut och bokningar som separata händelser.
Alla datum och klockslag är lokala verksamhetstider utan tidszonskonvertering.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, time, timedelta
from typing import Any, Mapping


class Planeringsfel(ValueError):
    """Felaktiga eller ofullständiga planeringsuppgifter."""


def _datum(v: str | date) -> date:
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    try:
        return date.fromisoformat(str(v))
    except (ValueError, TypeError) as exc:
        raise Planeringsfel(f"Ogiltigt datum: {v!r}. Använd ÅÅÅÅ-MM-DD.") from exc


def _tid(v: str) -> time:
    try:
        return time.fromisoformat(str(v))
    except (ValueError, TypeError) as exc:
        raise Planeringsfel(f"Ogiltigt klockslag: {v!r}.") from exc


def _resultat(korningar: Mapping[Any, dict], korning_id: Any) -> dict:
    k = korningar.get(korning_id)
    if k is None:
        k = korningar.get(str(korning_id))
    if not isinstance(k, dict):
        raise Planeringsfel(f"Saknar körning {korning_id}.")
    resultat = k.get("resultat", k)
    if not isinstance(resultat, dict):
        raise Planeringsfel(f"Körning {korning_id} saknar resultat.")
    veckor = resultat.get("veckor")
    if not isinstance(veckor, int) or veckor < 1:
        raise Planeringsfel(f"Körning {korning_id} har ogiltig periodlängd.")
    schema = resultat.get("schema")
    if not isinstance(schema, dict):
        raise Planeringsfel(f"Körning {korning_id} saknar schema.")
    for person, rad in schema.items():
        if not isinstance(rad, list) or len(rad) != veckor * 7:
            raise Planeringsfel(f"Fel antal schemadagar för {person} i körning {korning_id}.")
    return resultat


def generera_daterade_pass(
    aktiveringar: list[dict],
    korningar: Mapping[Any, dict],
    fran_datum: str | date,
    till_datum: str | date,
) -> list[dict]:
    """Vik ut godkända scheman till faktiska pass, inklusive natt över midnatt.

    aktiveringar: poster från db.aktiveringar(enhet_id), med id, enhet_id,
    korning_id och fran_datum. korningar: id -> db.korning(id) eller resultat.
    En ny aktivering ersätter den gamla från och med sitt startdatum.
    Pass innan första aktiveringen lämnas tomma. Intervallgränserna är inklusiva.
    """
    start, slut = _datum(fran_datum), _datum(till_datum)
    if slut < start:
        raise Planeringsfel("Slutdatum får inte vara före startdatum.")
    if (slut - start).days > 366:
        raise Planeringsfel("Välj högst 367 kalenderdagar per anrop.")

    enheter = {str(a.get("enhet_id")) for a in aktiveringar}
    if len(enheter) > 1:
        raise Planeringsfel("Blanda inte aktiveringar från olika enheter.")
    sorterade = []
    for a in aktiveringar:
        if not all(k in a for k in ("id", "enhet_id", "korning_id", "fran_datum")):
            raise Planeringsfel("Aktivering saknar obligatoriskt fält.")
        d = _datum(a["fran_datum"])
        if d.weekday() != 0:
            raise Planeringsfel("Aktiveringsdatum ska vara en måndag.")
        sorterade.append((d, int(a["id"]), a))
    sorterade.sort()

    ut: list[dict] = []
    for offset in range((slut - start).days + 1):
        d = start + timedelta(days=offset)
        matchande = next(((borjan, a) for borjan, _, a in reversed(sorterade) if borjan <= d), None)
        if matchande is None:
            continue
        borjan, aktiv = matchande
        kid = aktiv["korning_id"]
        resultat = _resultat(korningar, kid)
        veckor = resultat["veckor"]
        dagindex = (d - borjan).days % (veckor * 7)
        for person, rad in resultat["schema"].items():
            passet = rad[dagindex]
            if passet is None:
                continue
            if not isinstance(passet, dict):
                raise Planeringsfel(f"Felaktigt pass för {person} {d}.")
            try:
                pstart = datetime.combine(d, _tid(passet["start"]))
                pslut = datetime.combine(d, _tid(passet["slut"]))
            except KeyError as exc:
                raise Planeringsfel(f"Pass för {person} {d} saknar tid.") from exc
            if pslut <= pstart:
                pslut += timedelta(days=1)
            ut.append({
                "id": f"{aktiv['id']}:{d.isoformat()}:{person}",
                "enhet_id": aktiv["enhet_id"],
                "aktivering_id": aktiv["id"],
                "korning_id": kid,
                "person_id": person,
                "datum": d.isoformat(),
                "start": pstart.isoformat(timespec="minutes"),
                "slut": pslut.isoformat(timespec="minutes"),
                "grundschema_vecka": dagindex // 7 + 1,
                "dagindex": dagindex,
                "dygnsdel": passet.get("dygnsdel"),
                "pass": deepcopy(passet),
                "status": "planerad",
            })
    return ut


def markera_franvaro(passlista: list[dict], franvarohandelser: list[dict]) -> list[dict]:
    """Koppla heldags-/helpassfrånvaro till pass utan att ändra originalet.

    Frånvaro är inte automatiskt en vakans eller en vikariebeställning.
    Behovet måste bedömas mot resurstid, verksamhetskrav och kompetens innan bokning.
    Händelserna ska innehålla pass_id och orsak. Dubbla/okända pass avvisas.
    """
    ut = deepcopy(passlista)
    per_id = {p["id"]: p for p in ut}
    sedda: set[str] = set()
    for h in franvarohandelser:
        pid = h.get("pass_id")
        if pid not in per_id:
            raise Planeringsfel(f"Frånvaro pekar på ett okänt pass: {pid!r}.")
        if pid in sedda:
            raise Planeringsfel(f"Frånvaro finns redan för pass {pid}.")
        sedda.add(pid)
        per_id[pid]["status"] = "franvaro_registrerad"
        per_id[pid]["franvaro"] = {"orsak": h.get("orsak", "annan")}
        per_id[pid]["tackning"] = "ej_bedomd"
    return ut
