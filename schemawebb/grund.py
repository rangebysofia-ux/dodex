"""Grunden i verktyget: förskolorna och deras avdelningar (schemawebb/grund_forskola.json) och äldreomsorgens
områden och avdelningar (schemawebb/grund_aldreomsorg.json).

Läggs in en gång när webbtjänsten startar (flaggan `grund_forskola` i installningar), så att en förskola som
användaren tar bort inte kommer tillbaka. Knappen "Lägg in förskolorna" på sidan Organisation (POST /api/grund)
lägger in det som saknas igen. Avdelningarna blir team (områden) i förskolans gemensamma schema, som när de
läggs till på sidan Organisation (TEAM.laggTill i team.js). Bara namn, inga personuppgifter.
`SCHEMA_GRUND=av` stänger av inläggningen vid start (testerna gör det)."""
import json
import os
from pathlib import Path

from . import db

FIL = Path(__file__).resolve().parent / "grund_forskola.json"
# samma färgordning som TEAM.FARGER i team.js
FARGER = ["#c46a2b", "#2f8a6f", "#3f6bb0", "#9a4fa8", "#c0473f", "#2b8aa0", "#b08a2e", "#5f8a2f", "#b5487e", "#5b5bb8"]
NOLL = {"vardag": {"morgon": 0, "kvall": 0, "natt": 0}, "helg": {"morgon": 0, "kvall": 0, "natt": 0}}


def data():
    return json.loads(FIL.read_text(encoding="utf-8"))


def _team(namn, befintliga):
    ids = {t["id"] for t in befintliga}
    i = len(befintliga) + 1
    while f"T{i}" in ids:
        i += 1
    return {"id": f"T{i}", "namn": namn, "farg": FARGER[len(befintliga) % len(FARGER)], "behov": {}}


def lagg_in():
    """Lägger in förskolorna som saknas och avdelningar som saknas. Returnerar {nya, avdelningar}."""
    d = data()
    org = d["verksamhet"]
    finns = {(e["namn"].lower(), e["org"]): e for e in db.enheter()}
    nya = avd = 0
    for f in d["enheter"]:
        e = finns.get((f["namn"].lower(), org))
        if e is None:
            team = []
            for a in f["avdelningar"]:
                team.append(_team(a, team))
            indata = {"enhet": f["namn"], "veckor": 4, "cykliskt": True, "behov": json.loads(json.dumps(NOLL)),
                      "personal": [], "onskemal": [], "team": team, **({"regler": dict(d["regler"])} if d.get("regler") else {})}
            db.skapa_enhet(f["namn"], indata, org)
            nya += 1
            avd += len(team)
            continue
        hel = db.enhet(e["id"])
        indata = hel["indata"] if isinstance(hel["indata"], dict) else json.loads(hel["indata"])
        team = indata.get("team") or []
        har = {str(t.get("namn", "")).lower() for t in team}
        saknas = [a for a in f["avdelningar"] if a.lower() not in har]
        if saknas:
            for a in saknas:
                team.append(_team(a, team))
            indata["team"] = team
            if not indata.get("behov"):
                indata["behov"] = json.loads(json.dumps(NOLL))
            db.spara_enhet(e["id"], hel["namn"], indata)
            avd += len(saknas)
    db.satt_installning("grund_forskola", True)
    return {"nya": nya, "avdelningar": avd}


def tider():
    """Förskolornas öppettider (06:00–18:00) som grundinställning i de förskolor som redan finns och saknar egna
    tider. En tid som användaren har satt ändras inte. Returnerar antalet ändrade förskolor."""
    d = data()
    std = d.get("regler") or {}
    n = 0
    for e in db.enheter():
        if e["org"] != d["verksamhet"]:
            continue
        hel = db.enhet(e["id"])
        indata = hel["indata"] if isinstance(hel["indata"], dict) else json.loads(hel["indata"])
        regler = dict(indata.get("regler") or {})
        saknas = {k: v for k, v in std.items() if k not in regler}
        if saknas:
            indata["regler"] = {**regler, **saknas}
            db.spara_enhet(e["id"], hel["namn"], indata)
            n += 1
    db.satt_installning("grund_forskola_tider", True)
    return n


# ---------------------------------------------------------------- äldreomsorgen (grund_aldreomsorg.json)
# Användarens beslut 2026-11-10: områdena blir enheter under sina grupper (SÄBO, ORDBO, Furulund, Sävedalen …),
# avdelningarna team i områdets gemensamma schema. Flaggan `grund_aldreomsorg` gör att det läggs in en gång.
FIL_ALDRE = Path(__file__).resolve().parent / "grund_aldreomsorg.json"
# samma startstruktur som STANDARD i statisk/organisation.js (används när ingen struktur är sparad)
ORG_STANDARD = [
    {"id": "aldreomsorg", "namn": "Äldreomsorg", "forelder": None, "farg": "#b08a2e"},
    {"id": "sabo", "namn": "SÄBO", "forelder": "aldreomsorg", "farg": "#c46a2b"},
    {"id": "hemtjanst", "namn": "ORDBO", "forelder": "aldreomsorg", "farg": "#2f8a6f"},
    {"id": "lss", "namn": "LSS", "forelder": None, "farg": "#3f6bb0"},
    {"id": "forskola", "namn": "Förskola", "forelder": None, "farg": "#9a4fa8"},
]
SAMMA = {"ordbo": "hemtjänst", "hemtjänst": "ordbo"}  # gruppen bytte namn till ORDBO (användarens önskemål)


def _slug(namn):
    import re
    s = str(namn).lower().replace("å", "a").replace("ä", "a").replace("ö", "o")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "grupp"


def _grupp(noder, namn, forelder):
    """Gruppen med namnet under forelder (som ORG.grupp i organisation.js); skapas om den saknas."""
    namn_l = namn.lower()
    for n in noder:
        if (n.get("forelder") or None) == forelder and str(n.get("namn", "")).lower() in (namn_l, SAMMA.get(namn_l)):
            return n["id"]
    ids, bas = {n["id"] for n in noder}, _slug(namn)
    nid, i = bas, 2
    while nid in ids:
        nid, i = f"{bas}-{i}", i + 1
    noder.append({"id": nid, "namn": namn, "forelder": forelder})
    return nid


def lagg_in_aldre():
    """Lägger in äldreomsorgens områden och avdelningar som saknas. Returnerar {nya, avdelningar}."""
    d = json.loads(FIL_ALDRE.read_text(encoding="utf-8"))
    noder = [dict(n) for n in (db.installning("organisation") or ORG_STANDARD)]
    fore = json.dumps(noder, sort_keys=True)
    alla = db.enheter()
    nya = avd = 0
    for f in d["enheter"]:
        org = None
        for namn in f["vag"]:
            org = _grupp(noder, namn, org)
        e = next((x for x in alla if x["namn"].lower() == f["namn"].lower() and x["org"] == org), None)
        if e is None:
            team = []
            for a in f["avdelningar"]:
                team.append(_team(a, team))
            indata = {"enhet": f["namn"], "veckor": 4, "cykliskt": True, "behov": json.loads(json.dumps(NOLL)),
                      "personal": [], "onskemal": [], **({"team": team} if team else {})}
            db.skapa_enhet(f["namn"], indata, org)
            nya += 1
            avd += len(team)
            continue
        hel = db.enhet(e["id"])
        indata = hel["indata"] if isinstance(hel["indata"], dict) else json.loads(hel["indata"])
        team = indata.get("team") or []
        har = {str(t.get("namn", "")).lower() for t in team}
        saknas = [a for a in f["avdelningar"] if a.lower() not in har]
        if saknas:
            for a in saknas:
                team.append(_team(a, team))
            indata["team"] = team
            db.spara_enhet(e["id"], hel["namn"], indata)
            avd += len(saknas)
    if json.dumps(noder, sort_keys=True) != fore:
        db.satt_installning("organisation", noder)
    db.satt_installning("grund_aldreomsorg", True)
    return {"nya": nya, "avdelningar": avd}


def vid_start():
    if os.environ.get("SCHEMA_GRUND", "").lower() in ("av", "0", "nej"):
        return None
    ut = None
    if not db.installning("grund_forskola"):
        ut = lagg_in()
    if not db.installning("grund_forskola_tider"):
        tider()
    if not db.installning("grund_aldreomsorg"):
        lagg_in_aldre()
    return ut
