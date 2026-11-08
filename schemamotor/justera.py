"""Räkna om ett schema som användaren har justerat för hand.

Användaren kan flytta, ändra och ta bort pass i gränssnittet. Det här räknar om arbetstid, rast,
vakanser och nyckeltal för det ändrade schemat så att det kan sparas som en ny körning. Om
schemat följer reglerna avgör den fristående granskningen (validate.py), inte den här modulen.
"""
import re

from .build import DAGNAMN, DYGN, IndataFel, forbered, fordela_team, klocka, netto_for, tid

KLOCKA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DELAR = ("morgon", "kvall", "natt")


def _pass(p, prob, natt):
    """Ett pass med uträknad rast och arbetstid."""
    if not isinstance(p, dict):
        raise IndataFel("Ett pass måste ha start, slut och dygnsdel.")
    start, slut, del_ = p.get("start", ""), p.get("slut", ""), p.get("dygnsdel")
    if not KLOCKA.match(str(start)) or not KLOCKA.match(str(slut)):
        raise IndataFel(f"Ogiltig tid {start}–{slut}. Skriv tiderna som tt:mm.")
    if del_ not in DELAR:
        raise IndataFel(f"Okänd dygnsdel: {del_}.")
    s, e = tid(start), tid(slut)
    if e <= s:
        e += DYGN
    langd = e - s
    if langd > 16 * 60:
        raise IndataFel(f"Passet {start}–{slut} är längre än 16 timmar.")
    r = prob["r"]
    rg, rl = r["rast_grans_minuter"], r["rast_minuter"]
    ut = {"mall": p.get("mall") or "manuell", "dygnsdel": del_, "start": klocka(s), "slut": klocka(e)}
    if del_ == "natt" and natt.get("maltidsuppehall", True):
        ut.update(rast=0, netto=langd, maltidsuppehall=True)
    else:
        n = netto_for(langd, rg, rl)
        if n is None:  # rast krävs men passet blir då kortare än gränsen; granskningen visar det
            n = langd - rl
        ut.update(rast=langd - n, netto=n)
    if p.get("manuell") or ut["mall"] == "manuell":
        ut["manuell"] = True
    # aktiviteter följer med passet; täcker passet inte längre tiden visar granskningen det
    kanda = {a["id"]: a for a in prob.get("aktiviteter", [])}
    akt = [{"id": a["id"], "namn": kanda[a["id"]].get("namn") or a["id"], "start": kanda[a["id"]]["start"],
            "slut": kanda[a["id"]]["slut"], **{k: kanda[a["id"]][k] for k in ("typ", "farg") if kanda[a["id"]].get(k)}}
           for a in p.get("aktiviteter") or [] if isinstance(a, dict) and a.get("id") in kanda]
    if akt:
        ut["aktiviteter"] = akt
    return ut


def justera(indata, schema, grund=None):
    """Nytt resultat för `schema` ({person: [pass eller None per dag]}).

    `grund` är det tidigare resultatet; helggrupper och målvärden hämtas därifrån.
    """
    prob = forbered(indata)
    N, W = prob["N"], prob["W"]
    natt = (indata.get("nattpass") or [{"maltidsuppehall": True}])[0]
    kanda = {p["id"]: p for p in prob["personer"]}
    okanda = [pid for pid in schema if pid not in kanda]
    if okanda:
        raise IndataFel(f"Okända personer i schemat: {', '.join(okanda)}.")
    nytt = {}
    for pid in kanda:
        rad = schema.get(pid) or [None] * N
        if len(rad) != N:
            raise IndataFel(f"{pid}: schemat ska ha {N} dagar, har {len(rad)}.")
        nytt[pid] = [_pass(p, prob, natt) if p else None for p in rad]

    # vakanser per dygnsdel och tidpunkt
    vakanser = []
    for d in range(N):
        for del_, antal in (prob["behov"][d % 7] or {}).items():
            n = sum(1 for rad in nytt.values() if rad[d] and rad[d]["dygnsdel"] == del_)
            if n < antal:
                vakanser.append({"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "dygnsdel": del_,
                                 "tid": None, "antal": antal - n})
    # aktivitetstillfällen: vem som deltar (på passet som täcker tiden) och hur många som saknas
    tillfallen, borta = [], []
    for a in prob.get("aktiviteter", []):
        for d in a["_dagar"]:
            delt = []
            for pid, rad in nytt.items():
                for dd in (d, (d - 1) % N):
                    q = rad[dd]
                    if not q or not any(x["id"] == a["id"] for x in q.get("aktiviteter", [])):
                        continue
                    s0 = dd * DYGN + tid(q["start"])
                    a0 = d * DYGN + a["_start"]
                    if dd != d and a0 < s0:
                        continue
                    if dd == d and a0 < s0 and q["dygnsdel"] == "natt":
                        continue
                    delt.append(pid)
                    if a.get("fran_golvet", True):
                        borta.append((a0, d * DYGN + a["_slut"]))
                    break
            tillfallen.append({"aktivitet": a["id"], "namn": a.get("namn") or a["id"], "dag": d, "vecka": d // 7 + 1,
                               "veckodag": DAGNAMN[d % 7], "start": a["start"], "slut": a["slut"], "deltagare": delt,
                               "behov": a["_behov"][d], "saknas": max(0, a["_behov"][d] - len(delt))})
    L = N * DYGN
    intervall = []
    for rad in nytt.values():
        for d, p in enumerate(rad):
            if p:
                s = d * DYGN + tid(p["start"])
                e = d * DYGN + tid(p["slut"])
                intervall.append((s, e if e > s else e + DYGN))
    for d in range(N):
        for tp in prob["tidpunkter"][d % 7] or []:
            t = d * DYGN + tid(tp["tid"])
            def inne(s, e):
                return s <= t < e or (prob["cykliskt"] and (s <= t + L < e or s <= t - L < e))
            n = sum(1 for s, e in intervall if inne(s, e)) - sum(1 for s, e in borta if inne(s, e))
            if n < tp["antal"]:
                vakanser.append({"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "dygnsdel": None,
                                 "tid": tp["tid"], "antal": tp["antal"] - n})

    # minsta bemanning på golvet under aktiviteter
    for a in prob.get("aktiviteter", []):
        minst = a.get("minst_pa_golvet") or 0
        for d in a["_dagar"] if minst else []:
            for t0 in range(a["_start"], a["_slut"], 15):
                t = d * DYGN + t0
                def inne(s, e):
                    return s <= t < e or (prob["cykliskt"] and (s <= t + L < e or s <= t - L < e))
                n = sum(1 for s, e in intervall if inne(s, e)) - sum(1 for s, e in borta if inne(s, e))
                if n < minst:
                    vakanser.append({"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "dygnsdel": None,
                                     "tid": klocka(t0), "antal": minst - n})
    gamla = (grund or {}).get("personer", {})
    personer = {}
    for pid, p in kanda.items():
        rad = [x for x in nytt[pid] if x]
        personer[pid] = {"pass": len(rad), "minuter": sum(x["netto"] for x in rad), "mal_minuter": p["mal_minuter"],
                         "kvallspass": sum(x["dygnsdel"] == "kvall" for x in rad),
                         "helggrupp": gamla.get(pid, {}).get("helggrupp"),
                         "aktiviteter": sum(len(x.get("aktiviteter", [])) for x in rad)}
    kpi = {"vakanta_pass": sum(v["antal"] for v in vakanser if v["dygnsdel"]),
           "vakanta_tidpunkter": sum(v["antal"] for v in vakanser if v["tid"]),
           "manuella_pass": sum(1 for rad in nytt.values() for p in rad if p and p.get("manuell"))}
    kpi["vakanser"] = kpi["vakanta_pass"] + kpi["vakanta_tidpunkter"]
    kpi["aktivitet_saknas"] = sum(t["saknas"] for t in tillfallen)
    # team: vem som arbetar i vilket team räknas om efter justeringen (samma fördelning som motorn)
    extra = {}
    if prob.get("team"):
        hem = {p["id"]: p.get("team") for p in prob["personer"]}
        tack = fordela_team(nytt, prob["team"], hem, W * 7)
        kpi["team_lan"] = sum(x["inlanade"] for x in tack)
        kpi["team_saknas"] = sum(x["saknas"] for x in tack)
        for pid, k in personer.items():
            k["team"] = hem.get(pid)
            k["utlanad"] = sum(1 for x in nytt[pid] if x and hem.get(pid) and x.get("team") not in (None, hem[pid]))
        extra = {"team": [{"id": t["id"], "namn": t["namn"]} for t in prob["team"]], "team_tackning": tack}
    return {"status": "OK", "enhet": prob["enhet"], "veckor": W, "cykliskt": prob["cykliskt"],
            "steg": (grund or {}).get("steg", []), "kpi": kpi, "personer": personer, "vakanser": vakanser,
            "aktiviteter": tillfallen, "schema": nytt, "justerat": True, **extra}
