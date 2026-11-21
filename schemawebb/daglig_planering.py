"""Daglig bemanning: avgränsad demonstrationsmodul med syntetiska uppgifter.

Bygger på daterade arbetspass i schemamotor.planering, aldrig på en kopia som
skriver över grundschemat. API:t är AVSTÄNGT som standard och är inte avsett
för skarp kommunal drift. DODEX_PLANERING_DEMO=1 krävs för att använda det.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from schemamotor.planering import Planeringsfel, generera_daterade_pass
from schemawebb import db

_SKRIVLAS = threading.RLock()
_DAGAR = ("mån", "tis", "ons", "tor", "fre", "lör", "sön")


def _demo():
    if os.environ.get("DODEX_PLANERING_DEMO") != "1":
        raise HTTPException(403, "Daglig bemanning är en avstängd pilotfunktion. Använd bara syntetiska uppgifter.")


def _init():
    """Idempotenta pilottabeller; befintliga grundscheman och tabeller ändras inte."""
    db.kor(
        "create table if not exists dodex_demo_handelser ("
        "id integer primary key autoincrement, enhet_id integer not null,"
        "pass_id text not null, typ text not null, data text not null,"
        "aktor text not null, skapad real not null)"
    )
    db.kor("create index if not exists demo_handelser_enhet on dodex_demo_handelser(enhet_id, pass_id, id)")
    db.kor(
        "create table if not exists dodex_demo_vikarier ("
        "kod text primary key, kompetenser text not null, skapad real not null)"
    )


def _enhet(eid):
    e = db.enhet(eid)
    if not e:
        raise HTTPException(404, "Enheten finns inte.")
    return e


def _passlista(eid, fran, till):
    _enhet(eid)
    akt = db.aktiveringar(eid)
    korningar = {}
    for a in akt:
        k = db.korning(a["korning_id"])
        if k:
            korningar[a["korning_id"]] = k
    try:
        return generera_daterade_pass(akt, korningar, fran, till)
    except Planeringsfel as exc:
        raise HTTPException(422, str(exc)) from exc


def _pass(eid, pid):
    delar = pid.split(":", 2)
    if len(delar) != 3 or len(pid) > 240:
        raise HTTPException(422, "Felaktigt pass-id.")
    try:
        d = date.fromisoformat(delar[1])
    except ValueError as exc:
        raise HTTPException(422, "Passet saknar giltigt datum.") from exc
    p = next((x for x in _passlista(eid, d, d) if x["id"] == pid), None)
    if not p:
        raise HTTPException(404, "Passet finns inte i det nu aktiverade grundschemat.")
    return p


def _alla_handelser(eid=None):
    if eid is None:
        rader = db.hamta("select * from dodex_demo_handelser order by id")
    else:
        rader = db.hamta("select * from dodex_demo_handelser where enhet_id = ? order by id", eid)
    for r in rader:
        r["data"] = json.loads(r["data"])
    return rader


def _tillstand(h):
    status = {"franvaro": None, "bedomning": None, "bokning": None, "utfall": None}
    for x in h:
        typ, data = x["typ"], x["data"]
        if typ == "franvaro":
            status.update(franvaro=data, bedomning=None, bokning=None)
        elif typ == "aterta_franvaro":
            status.update(franvaro=None, bedomning=None, bokning=None)
        elif typ == "bedomning":
            status["bedomning"] = data
        elif typ == "bokning":
            status["bokning"] = data
        elif typ == "avboka":
            status["bokning"] = None
        elif typ == "utfall":
            status["utfall"] = data
    return status


def _per_pass(h):
    grupper = defaultdict(list)
    for x in h:
        grupper[x["pass_id"]].append(x)
    return {pid: _tillstand(event) for pid, event in grupper.items()}


def _kompetenskrav(e, p):
    """Konservativ pilotkontroll. Uppfyllda krav av andra på plats räknas inte av."""
    ut = set()
    dag = date.fromisoformat(p["datum"]).weekday()
    nycklar = {"alla", _DAGAR[dag], "vardag" if dag < 5 else "helg"}
    for krav in e["indata"].get("kompetenskrav", []):
        behov = krav.get("behov", {})
        for nyckel, delar in behov.items():
            if nyckel in nycklar and int(delar.get(p.get("dygnsdel"), 0) or 0) > 0:
                ut.add(krav.get("kompetens"))
    return sorted(k for k in ut if k)


def _tid(p):
    return datetime.fromisoformat(p["start"]), datetime.fromisoformat(p["slut"])


def _netto(p):
    a, b = _tid(p)
    return max(0, int((b - a).total_seconds() / 60) - int(p["pass"].get("rast", 0) or 0))


def _kontrollera_vikarie(kod, p, kompetenser, eid, pid):
    row = db.hamta("select kod, kompetenser from dodex_demo_vikarier where kod = ?", kod)
    if not row:
        raise HTTPException(422, "Vikarien finns inte i testpoolen.")
    har = set(json.loads(row[0]["kompetenser"]))
    saknas = set(kompetenser) - har
    if saknas:
        raise HTTPException(422, "Kompetens saknas: " + ", ".join(sorted(saknas)))
    start, slut = _tid(p)
    # Flera enheter kan finnas. Läs aktiva bokningar och deras bevarade tider.
    grupper = defaultdict(list)
    for h in _alla_handelser():
        grupper[(h["enhet_id"], h["pass_id"])].append(h)
    for (e2, p2), h in grupper.items():
        if e2 == eid and p2 == pid:
            continue
        b = _tillstand(h)["bokning"]
        if not b or b["vikarie"] != kod:
            continue
        s2, t2 = datetime.fromisoformat(b["start"]), datetime.fromisoformat(b["slut"])
        if start < t2 and s2 < slut:
            raise HTTPException(409, "Vikarien är redan bokad på ett överlappande pass.")
        vila = (s2 - slut).total_seconds() / 3600 if slut <= s2 else (start - t2).total_seconds() / 3600
        if vila < 11:
            raise HTTPException(409, "Vikariens bokningar ger mindre än 11 timmars mellanliggande vila.")
    # OBS: övriga anställningar/pass i Heroma kontrolleras INTE i denna pilot.


def _historikpost(eid, pid, typ, data, aktor):
    db.kor(
        "insert into dodex_demo_handelser (enhet_id,pass_id,typ,data,aktor,skapad)"
        " values (?,?,?,?,?,?)", eid, pid, typ, json.dumps(data, ensure_ascii=False),
        aktor, time.time()
    )


class Testvikarie(BaseModel):
    kod: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    kompetenser: list[str] = Field(default_factory=list, max_length=30)


class Handelse(BaseModel):
    pass_id: str = Field(min_length=1, max_length=240)
    typ: Literal["franvaro", "aterta_franvaro", "bedomning", "bokning", "avboka", "utfall"]
    orsak: Literal["sjuk", "semester", "vab", "utbildning", "annan"] | None = None
    beslut: Literal["inget_vikariebehov", "intern_resurs", "vikariebehov"] | None = None
    motivering: str = Field(default="", max_length=500)
    vikarie: str | None = None
    arbetade_minuter: int | None = Field(default=None, ge=0, le=1440)
    kostnad_kr: float | None = Field(default=None, ge=0, le=100000)


def skapa_router(inloggad):
    router = APIRouter()

    @router.get("/api/enheter/{eid}/daglig-planering", dependencies=[Depends(inloggad)])
    def hamta_planering(eid: int, fran: date = Query(...), till: date = Query(...)):
        _demo()
        _init()
        if till < fran or (till - fran).days > 30:
            raise HTTPException(422, "Välj ett intervall på högst 31 dagar.")
        passlista = _passlista(eid, fran, till)
        status = _per_pass(_alla_handelser(eid))
        antal = {"pass": len(passlista), "franvaro": 0, "obedomda": 0, "vikariebehov": 0,
                 "bokade": 0, "olosta": 0, "utfall_rapporterade": 0, "arbetade_timmar": 0.0,
                 "rapporterad_kostnad_kr": 0.0}
        konflikter = []
        e = _enhet(eid)
        for p in passlista:
            s = status.get(p["id"], _tillstand([]))
            p["planerade_minuter"] = _netto(p)
            p["kravda_kompetenser"] = _kompetenskrav(e, p)
            p["daglig"] = s
            if s["franvaro"]:
                antal["franvaro"] += 1
                if not s["bedomning"]:
                    antal["obedomda"] += 1
                if s["bedomning"] and s["bedomning"]["beslut"] == "vikariebehov":
                    antal["vikariebehov"] += 1
                    if s["bokning"]:
                        antal["bokade"] += 1
                    else:
                        antal["olosta"] += 1
            if s["utfall"]:
                antal["utfall_rapporterade"] += 1
                antal["arbetade_timmar"] += s["utfall"]["arbetade_minuter"] / 60
                antal["rapporterad_kostnad_kr"] += s["utfall"].get("kostnad_kr") or 0
        if antal["obedomda"]:
            konflikter.append({"typ": "behov", "text": f"{antal['obedomda']} frånvaropass saknar täckningsbedömning."})
        if antal["olosta"]:
            konflikter.append({"typ": "bemanning", "text": f"{antal['olosta']} bedömda vikariebehov saknar bokning."})
        if antal["utfall_rapporterade"] < len(passlista):
            konflikter.append({"typ": "uppfoljning", "text": "Utfallet är ofullständigt. Ej rapporterade pass räknas inte som arbetade."})
        return {"enhet_id": eid, "fran": fran.isoformat(), "till": till.isoformat(),
                "pass": passlista, "nyckeltal": antal, "malkonflikter": konflikter,
                "demo": True, "anmarkning": "Ej kopplad till Heroma. Vila kontrolleras bara mot andra testbokningar."}

    @router.get("/api/enheter/{eid}/testvikarier", dependencies=[Depends(inloggad)])
    def vikarier(eid: int):
        _demo()
        _init()
        _enhet(eid)
        r = db.hamta("select kod, kompetenser from dodex_demo_vikarier order by kod")
        return [{"kod": x["kod"], "kompetenser": json.loads(x["kompetenser"])} for x in r]

    @router.post("/api/enheter/{eid}/testvikarier", dependencies=[Depends(inloggad)], status_code=201)
    def skapa_vikarie(eid: int, d: Testvikarie):
        _demo()
        _init()
        _enhet(eid)
        try:
            db.kor("insert into dodex_demo_vikarier(kod,kompetenser,skapad) values(?,?,?)",
                   d.kod, json.dumps(sorted(set(d.kompetenser)), ensure_ascii=False), time.time())
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(409, "Vikariekoden finns redan.") from exc
            raise
        return {"kod": d.kod, "kompetenser": d.kompetenser}

    @router.get("/api/enheter/{eid}/planeringshistorik", dependencies=[Depends(inloggad)])
    def historik(eid: int, pass_id: str):
        _demo()
        _init()
        _pass(eid, pass_id)
        return [h for h in _alla_handelser(eid) if h["pass_id"] == pass_id]

    @router.post("/api/enheter/{eid}/planeringshandelser", dependencies=[Depends(inloggad)], status_code=201)
    def registrera(eid: int, h: Handelse, s=Depends(inloggad)):
        _demo()
        with _SKRIVLAS:
            _init()
            p = _pass(eid, h.pass_id)
            tidigare = [x for x in _alla_handelser(eid) if x["pass_id"] == h.pass_id]
            status = _tillstand(tidigare)
            data = {}
            if h.typ == "franvaro":
                if status["franvaro"]:
                    raise HTTPException(409, "Frånvaro är redan registrerad för passet.")
                if not h.orsak:
                    raise HTTPException(422, "Ange frånvaroorsak.")
                data = {"orsak": h.orsak}
            elif h.typ == "aterta_franvaro":
                if not status["franvaro"] or status["bokning"]:
                    raise HTTPException(409, "Ingen frånvaro att återta, eller aktiv bokning måste avbokas först.")
            elif h.typ == "bedomning":
                if not status["franvaro"] or status["bokning"]:
                    raise HTTPException(409, "Bedöm frånvaro före bokning. Avboka först om bokning finns.")
                if not h.beslut or not h.motivering.strip():
                    raise HTTPException(422, "Ange täckningsbeslut och motivering.")
                data = {"beslut": h.beslut, "motivering": h.motivering.strip()}
            elif h.typ == "bokning":
                if not status["bedomning"] or status["bedomning"]["beslut"] != "vikariebehov":
                    raise HTTPException(409, "En bedömning om vikariebehov måste godkännas först.")
                if status["bokning"]:
                    raise HTTPException(409, "Passet är redan bokat.")
                if not h.vikarie:
                    raise HTTPException(422, "Välj en testvikarie.")
                krav = _kompetenskrav(_enhet(eid), p)
                _kontrollera_vikarie(h.vikarie, p, krav, eid, h.pass_id)
                data = {"vikarie": h.vikarie, "start": p["start"], "slut": p["slut"], "krav": krav}
            elif h.typ == "avboka":
                if not status["bokning"]:
                    raise HTTPException(409, "Ingen aktiv bokning finns att avboka.")
                data = {"tidigare_vikarie": status["bokning"]["vikarie"], "motivering": h.motivering.strip()}
            elif h.typ == "utfall":
                if h.arbetade_minuter is None:
                    raise HTTPException(422, "Ange faktiskt arbetade minuter (0 är tillåtet).")
                if h.arbetade_minuter > _netto(p):
                    raise HTTPException(422, "Denna pilot hanterar inte förlängda pass. Ange högst passets planerade tid.")
                data = {"arbetade_minuter": h.arbetade_minuter, "kostnad_kr": h.kostnad_kr,
                        "kommentar": h.motivering.strip()}
            aktor = s["anvandare"] or s["roll"] or "testanvandare"
            _historikpost(eid, h.pass_id, h.typ, data, aktor)
            return {"ok": True, "pass_id": h.pass_id, "typ": h.typ, "status": _tillstand(tidigare + [
                {"typ": h.typ, "data": data}])}

    return router
