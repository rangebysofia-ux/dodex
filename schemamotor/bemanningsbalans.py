"""Bemanningsbalans som i verksamhetens Excel-mall: budget, bemanningsbehov, personal och övrig arbetstid.

Användning:
    python -m schemamotor.bemanningsbalans indata.json            # räkna på enhetens indata
    python -m schemamotor.bemanningsbalans mall.xlsx [--json]     # läs en ifylld Excel-mall och räkna

Steg som i mallen:
1. Budget: årsarbetare (ÅA) × heltid per vecka, minus buffert i procent.
2. Bemanning: pass per veckodag (från, till, rast, antal) plus jour med räknad arbetstid. Brukarnära tid.
3. Personal: sysselsättningsgrad × heltid för varje medarbetare, antal pass per period och helger.
4. Övrig arbetstid: arbetstid som inte ingår i bemanningskravet, till exempel APT och utbildning
   (tillfällen per år × timmar per tillfälle × antal personer ÷ 52).
5. Resultat per vecka och per period: bemanning mot budget och bemanning mot personal.

Beräkningen påverkar inte schemaläggningen. Samma beräkning finns i schemawebb/statisk/bemanningsbalans.js
(gränssnittet); tests/test_bemanningsbalans.py jämför dem med varandra och med mallens siffror.

Personuppgifter: vid import ersätts namnen i mallen med id-koder (P1, P2 …, N1 … för natt). Namnen sparas aldrig.
"""
import argparse
import datetime as dt
import json
import math
import sys

DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
DAGNYCKEL = {"vardag": range(5), "helg": range(5, 7), "lör-sön": range(5, 7), "alla": range(7), "mån-sön": range(7)}
HELGANDEL = {"2/4": 0.5, "1/4": 0.25, "3/4": 0.75, "alla": 1.0, "ingen": 0.0}
STANDARD_PASS_PER_VECKA = 4.75


def _min(s):
    h, m = str(s).split(":")[:2]
    return int(h) * 60 + int(m)


def dagar_for(nyckel):
    if nyckel in DAGNYCKEL:
        return list(DAGNYCKEL[nyckel])
    return [DAGNAMN.index(nyckel)]


def passtid(p):
    """Arbetstid i minuter för ett pass i behovet: till − från (över midnatt) − rast; jour med räknad tid."""
    if p.get("raknad_minuter") is not None:
        return p["raknad_minuter"]
    s, e = _min(p["fran"]), _min(p["till"])
    if e <= s:
        e += 1440
    return max(0, e - s - (p.get("rast_minuter") or 0))


def heltid_for(p, indata):
    """Heltid i minuter per vecka: personens egen, annars 34 h 20 min för nattpersonal och enhetens för övriga."""
    if p.get("heltid_minuter_per_vecka"):
        return p["heltid_minuter_per_vecka"]
    if p.get("dygnsdelar") == ["natt"]:
        return indata.get("heltid_natt_minuter_per_vecka", 2060)
    return indata.get("heltid_minuter_per_vecka", 2220)


def antal_pass(person, indata, W, vaxel):
    """Antal pass under perioden som motorn räknar det (4,75 per vecka för dag och kväll, natt efter passlängd)."""
    ap = person.get("antal_pass")
    if ap is not None:
        return sum(ap) if isinstance(ap, list) else ap
    r = indata.get("regler") or {}
    heltid = heltid_for(person, indata)
    mal_min = heltid * person["grad"] * W
    if person.get("dygnsdelar") == ["natt"]:
        np_ = (indata.get("nattpass") or [{"start": "21:45", "slut": "06:45", "maltidsuppehall": True}])[0]
        s, e = _min(np_["start"]), _min(np_["slut"])
        langd = (e + 1440 - s) if e <= s else e - s
        return round(mal_min / langd)
    x = r.get("pass_per_vecka", STANDARD_PASS_PER_VECKA) * W
    n = round(x) if abs(x - round(x)) < 1e-9 else (math.floor(x) if vaxel % 2 == 0 else math.ceil(x))
    minsta = r.get("min_passlangd_minuter", 300)
    if minsta and mal_min / n < minsta:
        n = max(1, math.floor(mal_min / minsta))
    return n


def berakna(indata):
    """Bemanningsbalansen för en enhet. Returnerar vecka, period, rader och texter."""
    bb = indata.get("bemanningsbalans") or {}
    W = indata["veckor"]
    heltid = (indata.get("heltid_minuter_per_vecka") or 2220) / 60

    # 1. budget
    budget_brutto = indata.get("budget_timmar_vecka")
    buffert_pct = bb.get("buffert_procent") or 0
    budget = None
    if budget_brutto:
        budget = {"brutto": budget_brutto, "aa": budget_brutto / heltid, "buffert_procent": buffert_pct,
                  "buffert": budget_brutto * buffert_pct / 100, "timmar": budget_brutto * (1 - buffert_pct / 100)}

    # 2. bemanning: brukarnära tid per veckodag
    dagar = [{"dag": DAGNAMN[i], "timmar": 0.0, "pass": 0, "jour": 0.0} for i in range(7)]
    for p in bb.get("pass") or []:
        t = passtid(p) / 60
        for i in dagar_for(p.get("dagar", "alla")):
            n = p.get("antal", 1) or 0
            dagar[i]["timmar"] += t * n
            if p.get("typ") == "jour":
                dagar[i]["jour"] += t * n
            else:
                dagar[i]["pass"] += n
    brukarnara = sum(d["timmar"] for d in dagar)
    pass_vecka = sum(d["pass"] for d in dagar)
    helgbehov = (dagar[5]["pass"] + dagar[6]["pass"]) / 2

    # 4. övrig arbetstid
    ovrig = []
    for o in bb.get("ovrig_tid") or []:
        ar = (o.get("tillfallen_ar") or 0) * (o.get("timmar") or 0) * (o.get("personer") or 0)
        ovrig.append({"namn": o.get("namn", ""), "timmar_ar": ar, "timmar_vecka": ar / 52, "timmar_period": ar / 52 * W})
    ovrig_vecka = sum(o["timmar_vecka"] for o in ovrig)

    # 3. personal
    personal = []
    vaxel = 0
    for p in indata.get("personal") or []:
        natt = p.get("dygnsdelar") == ["natt"]
        h = heltid_for(p, indata) / 60
        n = antal_pass(p, indata, W, vaxel)
        if not natt and p.get("antal_pass") is None:
            vaxel += 1
        frek = p.get("helgfrekvens") or (indata.get("regler") or {}).get("helgfrekvens", "2/4")
        personal.append({"id": p["id"], "grad": p["grad"], "natt": natt, "helg": HELGANDEL.get(frek, 0.5), "helgfrekvens": frek,
                         "pass": n, "timmar_vecka": p["grad"] * h, "timmar_period": p["grad"] * h * W})
    personal_vecka = sum(p["timmar_vecka"] for p in personal)
    personal_pass = sum(p["pass"] for p in personal)
    personal_helg = sum(p["helg"] for p in personal)

    # 5. resultat
    bemanning_vecka = brukarnara + ovrig_vecka
    vecka = {
        "budget": budget,
        "bemanning": {"timmar": bemanning_vecka, "brukarnara": brukarnara, "ovrig": ovrig_vecka, "aa": bemanning_vecka / heltid},
        "personal": {"timmar": personal_vecka, "aa": sum(p["grad"] for p in personal)},
    }
    # skillnad som i mallen: budget − bemanning och bemanning − personal (negativt = överkapacitet)
    vecka["diff_budget"] = None if not budget else {"timmar": budget["timmar"] - bemanning_vecka,
                                                    "aa": budget["timmar"] / heltid - bemanning_vecka / heltid}
    diff_p = bemanning_vecka - personal_vecka
    vecka["diff_personal"] = {"timmar": diff_p, "aa": vecka["personal"]["aa"] - vecka["bemanning"]["aa"],
                              "procent": (vecka["personal"]["aa"] - vecka["bemanning"]["aa"]) / vecka["bemanning"]["aa"] * 100
                              if bemanning_vecka else 0}
    krav_pass = pass_vecka * W
    period = {
        "bemanning": {"timmar": bemanning_vecka * W, "pass": krav_pass,
                      "snitt_pass_timmar": bemanning_vecka * W / krav_pass if krav_pass else 0, "helg": helgbehov},
        "personal": {"timmar": personal_vecka * W, "pass": personal_pass,
                     "snitt_pass_timmar": personal_vecka * W / personal_pass if personal_pass else 0, "helg": personal_helg},
    }
    period["diff_budget_timmar"] = None if not budget else vecka["diff_budget"]["timmar"] * W
    period["diff_personal"] = {"timmar": diff_p * W, "pass": personal_pass - krav_pass,
                               "snitt_pass_timmar": period["personal"]["snitt_pass_timmar"] - period["bemanning"]["snitt_pass_timmar"],
                               "helg": personal_helg - helgbehov}
    return {
        "veckor": W, "heltid_timmar": heltid, "dagar": dagar, "ovrig": ovrig, "personal": personal,
        "vecka": vecka, "period": period,
        "overkapacitet": {"vecka": max(0, -diff_p), "period": max(0, -diff_p) * W},
        "vakanta_timmar": {"vecka": max(0, diff_p), "period": max(0, diff_p) * W},
    }


# ---------------------------------------------------------------- import från Excel-mallen

def _tid(v):
    """Excel-tid (time, datetime eller timedelta) -> 'tt:mm'. 1900-01-01 00:00 är 24:00 (midnatt)."""
    if isinstance(v, dt.datetime):
        return "00:00" if v.time() == dt.time(0) else f"{v.hour:02d}:{v.minute:02d}"
    if isinstance(v, dt.time):
        return f"{v.hour:02d}:{v.minute:02d}"
    if isinstance(v, dt.timedelta):
        m = round(v.total_seconds() / 60) % 1440
        return f"{m // 60:02d}:{m % 60:02d}"
    if isinstance(v, (int, float)):
        m = round(v * 1440) % 1440
        return f"{m // 60:02d}:{m % 60:02d}"
    return None


def _minuter(v):
    t = _tid(v)
    return _min(t) if t else 0


def _tal(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def fran_excel(fil):
    """Läs en ifylld bemanningsbalans (Excel-mallen) -> (indata-del, personal, meddelanden).

    Läser bara ifyllda värden, inte formler, och räknar själv. Namn ersätts med id-koder."""
    import openpyxl
    wb = openpyxl.load_workbook(fil, data_only=False)
    meddelanden = []
    blad = {ws.title.strip().lower(): ws for ws in wb.worksheets}

    def hitta(nyckel):
        return next((ws for namn, ws in blad.items() if nyckel in namn), None)

    def cell_efter(ws, text, dx=0, dy=1):
        for rad in ws.iter_rows():
            for c in rad:
                if isinstance(c.value, str) and c.value.strip().lower() == text:
                    return ws.cell(c.row + dy, c.column + dx).value
        return None

    ut = {"bemanningsbalans": {"pass": [], "ovrig_tid": []}}
    bb = ut["bemanningsbalans"]
    ws = hitta("bemanningsbehov") or hitta("budget")
    if ws is None:
        raise ValueError("Hittar inte bladet med budget och bemanningsbehov.")
    veckor = _tal(cell_efter(ws, "antal veckor"))
    heltid = _tal(cell_efter(ws, "dag/ kväll")) or _tal(cell_efter(ws, "dag/kväll"))
    aa = _tal(cell_efter(ws, "åa totalt", dx=1, dy=0))
    buffert = _tal(cell_efter(ws, "buffert %"))
    if veckor:
        ut["veckor"] = int(veckor)
    if heltid:
        ut["heltid_minuter_per_vecka"] = round(heltid * 60)
    if aa:
        ut["budget_timmar_vecka"] = round(aa * (heltid or 37), 2)
    if buffert:
        bb["buffert_procent"] = round(buffert * 100 if buffert <= 1 else buffert, 2)

    # pass: rubriker i kolumn B (Måndag … Söndag, Mån-sön, Lör-sön, JOUR), tider i C (från), E (till), G (rast), I (antal)
    namn_dag = {"måndag": "mån", "tisdag": "tis", "onsdag": "ons", "torsdag": "tor", "fredag": "fre", "lördag": "lör",
                "söndag": "sön", "mån-sön": "mån-sön", "lör-sön": "lör-sön"}
    dag, jour = None, False
    for r in range(1, ws.max_row + 1):
        b = ws.cell(r, 2).value
        if isinstance(b, str) and b.strip():
            t = b.strip().lower()
            if t == "jour":
                jour = True
                continue
            if t in namn_dag:
                dag = namn_dag[t]
                continue
        if dag is None:
            continue
        fran, till, rast, tf = (ws.cell(r, k).value for k in (3, 5, 7, 9))
        if _tid(fran) is None or _tid(till) is None:
            continue
        s, e = _minuter(fran), _minuter(till)
        langd = (e - s) % 1440
        if langd == 0:
            continue
        rast_min = _minuter(rast) if rast is not None else 0
        antal = _tal(tf)
        if antal is None:  # formel i mallen: 1 när passet har arbetstid
            antal = 1 if langd - rast_min > 0 else 0
        if not antal:
            continue
        p = {"dagar": dag, "fran": _tid(fran), "till": _tid(till), "rast_minuter": rast_min}
        if dag in ("mån-sön", "lör-sön"):
            # i mallen är antalet per vecka för de här raderna; här per dag
            per_dag = antal / (7 if dag == "mån-sön" else 2)
            p["antal"] = int(per_dag) if float(per_dag).is_integer() else round(per_dag, 3)
        else:
            p["antal"] = int(antal) if float(antal).is_integer() else antal
        if jour:
            p["typ"] = "jour"
            h = ws.cell(r, 8).value
            if not (isinstance(h, str) and h.startswith("=")) and _tid(h):
                p["raknad_minuter"] = _minuter(h)
        elif 0 < e < s:
            p["typ"] = "natt"  # över midnatt (till 24:00 räknas som kväll)
        bb["pass"].append(p)

    bb["pass"] = slå_ihop(bb["pass"])

    # personal: rader med SSG under rubriken; namn ersätts med id-koder
    personal = []
    ws = hitta("personal")
    if ws is not None:
        natt_avsnitt = False
        kol = None
        dagnr = natnr = 0
        for r in range(1, ws.max_row + 1):
            rad = [ws.cell(r, k).value for k in range(1, ws.max_column + 1)]
            texter = [str(v).strip().lower() if isinstance(v, str) else "" for v in rad]
            if any(t.startswith("nattpersonal") for t in texter):
                natt_avsnitt, kol = True, None
                continue
            if "ssg" in texter:
                kol = {"namn": texter.index("namn") if "namn" in texter else None, "ssg": texter.index("ssg"),
                       "helg": next((i for i, t in enumerate(texter) if t.startswith("helg")), None),
                       "dagar": next((i for i, t in enumerate(texter) if t.startswith("arbetsdagar")), None)}
                continue
            if kol is None:
                continue
            namn = rad[kol["namn"]] if kol["namn"] is not None else None
            ssg = _tal(rad[kol["ssg"]])
            if isinstance(namn, str) and namn.strip().lower().startswith("summa"):
                kol = None
                continue
            if not ssg:
                continue
            if natt_avsnitt:
                natnr += 1
                p = {"id": f"N{natnr}", "grad": round(ssg, 4), "dygnsdelar": ["natt"]}
            else:
                dagnr += 1
                p = {"id": f"P{dagnr}", "grad": round(ssg, 4)}
            helg = _tal(rad[kol["helg"]]) if kol["helg"] is not None else None
            if helg == 0:
                p["helgfrekvens"] = "ingen"
            dagar_ = _tal(rad[kol["dagar"]]) if kol["dagar"] is not None else None
            if dagar_:
                p["antal_pass"] = int(dagar_)
            personal.append(p)
        if personal:
            meddelanden.append(f"{len(personal)} medarbetare lästes in. Namnen ersattes med id-koder ({personal[0]['id']} …) och sparas inte.")

    ws = hitta("övrig")
    if ws is not None:
        start = None
        for r in range(1, ws.max_row + 1):
            b = ws.cell(r, 2).value
            if isinstance(b, str) and b.strip().lower() == "aktivitet":
                start = r
                continue
            if start and isinstance(b, str) and b.strip():
                c, d, e = (_tal(ws.cell(r, k).value) for k in (3, 4, 5))
                if c and d and e:
                    bb["ovrig_tid"].append({"namn": b.strip(), "tillfallen_ar": c, "timmar": d, "personer": e})
    return ut, personal, meddelanden


def slå_ihop(lista):
    """Pass som är likadana alla vardagar blir ett pass för vardagar, lördag och söndag blir lör–sön,
    och alla sju dagar blir mån–sön. Ordningen behålls."""
    nyckel = lambda p: (p["fran"], p["till"], p.get("rast_minuter", 0), p.get("typ"), p.get("raknad_minuter"))  # noqa: E731
    per_dag = {}
    for p in lista:
        if p["dagar"] in DAGNAMN:
            per_dag.setdefault(nyckel(p), {}).setdefault(p["dagar"], []).append(p["antal"])
    ut, gjorda = [], set()
    for p in lista:
        if p["dagar"] not in DAGNAMN:
            ut.append(p)
            continue
        k = nyckel(p)
        if k in gjorda:
            continue
        gjorda.add(k)
        dagar = per_dag[k]
        rest = {d: list(v) for d, v in dagar.items()}

        def ta(namn, ingar):
            if all(d in rest and rest[d] for d in ingar) and len({rest[d][0] for d in ingar}) == 1:
                antal = rest[ingar[0]][0]
                for d in ingar:
                    rest[d].pop(0)
                ut.append({**p, "dagar": namn, "antal": antal})
                return True
            return False
        while ta("mån-sön", DAGNAMN):
            pass
        while ta("vardag", DAGNAMN[:5]):
            pass
        while ta("lör-sön", DAGNAMN[5:]):
            pass
        for d in DAGNAMN:
            for antal in rest.get(d, []):
                ut.append({**p, "dagar": d, "antal": antal})
    return ut


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fil", help="indata.json eller en ifylld Excel-mall (.xlsx)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.fil.lower().endswith(".xlsx"):
        delar, personal, medd = fran_excel(a.fil)
        indata = {"veckor": 4, **delar, "personal": personal}
        for m in medd:
            print(m, file=sys.stderr)
    else:
        with open(a.fil, encoding="utf-8") as f:
            indata = json.load(f)
    res = berakna(indata)
    if a.json:
        print(json.dumps({"indata": indata, "resultat": res}, ensure_ascii=False, indent=2))
        return
    v, p = res["vecka"], res["period"]
    h = lambda x: f"{x:.2f}".replace(".", ",")  # noqa: E731
    print(f"Vecka: bemanning {h(v['bemanning']['timmar'])} h ({h(v['bemanning']['aa'])} ÅA), varav brukarnära "
          f"{h(v['bemanning']['brukarnara'])} h och övrig {h(v['bemanning']['ovrig'])} h")
    if v["budget"]:
        print(f"Budget {h(v['budget']['timmar'])} h ({h(v['budget']['aa'])} ÅA). Budget − bemanning {h(v['diff_budget']['timmar'])} h")
    print(f"Personal {h(v['personal']['timmar'])} h ({h(v['personal']['aa'])} ÅA). Bemanning − personal {h(v['diff_personal']['timmar'])} h")
    print(f"Period ({res['veckor']} v): krav {p['bemanning']['pass']} pass, personal {p['personal']['pass']} pass, "
          f"helgbehov {h(p['bemanning']['helg'])}, helgpersonal {h(p['personal']['helg'])}")


if __name__ == "__main__":
    main()
