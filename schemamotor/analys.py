"""Förslag på bemanning utifrån budget, och konsekvensanalys av färdiga scheman.

Användning:
    python -m schemamotor.analys indata.json [--budget 357] [--tid 5] [--json]

`forslag()` räknar fram vad behovet kräver (pass per vecka, personer per helg med varannan
helg och fredagsregeln, nattimmar) och föreslår några bemanningar inom budgeten. `konsekvenser()`
sammanfattar ett lagt schema: vakanser och var de landar, överkapacitet, timmar mot budget,
helgbemanning och blandning av morgon och kväll. Förslagen är utgångspunkter; schemat läggs
av samma motor och granskas som vanligt.
"""
import argparse
import copy
import json
import math
import sys

from schemamotor.build import DAGNAMN, STANDARDREGLER, expandera_dagvarden, tid

FORSTA_HELTID = 2220


def _r(indata):
    r = dict(STANDARDREGLER)
    r.update(indata.get("regler", {}))
    return r


def underlag(indata, budget=None):
    """Vad behovet kräver, oberoende av vem som är anställd."""
    r = _r(indata)
    W = indata["veckor"]
    ppv = r["pass_per_vecka"]
    heltid = indata.get("heltid_minuter_per_vecka", FORSTA_HELTID) / 60
    behov = expandera_dagvarden(indata.get("behov"), dict)
    b = lambda d, k: behov[d].get(k, 0)  # noqa: E731
    np_ = (indata.get("nattpass") or [{"start": "21:45", "slut": "06:45", "maltidsuppehall": True}])[0]
    s, e = tid(np_["start"]), tid(np_["slut"])
    nattlangd = (e + (1440 if e <= s else 0) - s) / 60
    natt_vecka = sum(b(d, "natt") for d in range(7))
    natt_helg = max(b(4, "natt") if r["ingen_fredagskvall_fore_ledig_helg"] else 0, b(5, "natt"), b(6, "natt"))
    # två extra nätter per period som marginal: med exakt antal blir en natt ofta omöjlig att täcka
    natt_timmar = (natt_vecka * W + (2 if natt_vecka else 0)) * nattlangd / W
    dag_pass = sum(b(d, "morgon") + b(d, "kvall") for d in range(7))
    kvall_helg = max(b(5, "kvall"), b(6, "kvall"))
    fre_kvall = b(4, "kvall") if r["ingen_fredagskvall_fore_ledig_helg"] else 0
    per_helg = max(b(5, "morgon"), b(6, "morgon")) + max(kvall_helg, fre_kvall)
    andel_helg = {"2/4": 0.5, "1/4": 0.25, "3/4": 0.75, "alla": 1.0}.get(r["helgfrekvens"], 0.5)
    min_dag = max(math.ceil(dag_pass / ppv), math.ceil(per_helg / andel_helg)) if dag_pass else 0
    min_natt = max(math.ceil(natt_timmar / heltid), math.ceil(natt_helg / andel_helg)) if natt_vecka else 0
    kontrakt = sum(p.get("grad", 1) * p.get("heltid_minuter_per_vecka", heltid * 60) / 60 for p in indata.get("personal", []))
    budget = float(budget or indata.get("budget_timmar_vecka") or round(kontrakt, 1) or 0)
    return {
        "veckor": W, "heltid_timmar": heltid, "budget_timmar_vecka": budget, "arsarbetare_budget": round(budget / heltid, 2),
        "dag_pass_vecka": dag_pass, "personer_per_helg_dag": per_helg, "fredagskvall_styr": fre_kvall > kvall_helg,
        "minsta_antal_dag": min_dag, "natt_timmar_vecka": round(natt_timmar, 1), "minsta_antal_natt": min_natt,
        "dag_timmar_vecka": round(budget - natt_timmar, 1), "pass_per_vecka": ppv,
        "timmar_per_pass_heltid": round(heltid / ppv, 2),
        # ungefär så många timmar behovet motsvarar, med pass på heltidslängd och helgerna täckta
        "behov_timmar_vecka": round(max(dag_pass * heltid / ppv, min_dag * 0.5 * heltid) + natt_timmar, 1),
    }


def _grader(summa, antal, steg=0.05, golv=0.5):
    """Fördela summa årsarbetare på antal personer, avrundat nedåt till steg, högst 100 %."""
    if antal <= 0:
        return []
    g = min(1.0, math.floor(summa / antal / steg) * steg)
    return [round(g, 2)] * antal if g >= golv else []


def _heltidsnorm(summa, minst, steg=0.05, golv=0.5):
    """Så många heltider som möjligt; resten delas lika (minst golv) och antal personer >= minst."""
    for heltider in range(min(int(summa), 60), -1, -1):
        rest_antal = max(minst - heltider, 1 if summa - heltider >= golv else 0)
        rest = summa - heltider
        if rest_antal == 0:
            return [1.0] * heltider
        g = min(1.0, math.floor(rest / rest_antal / steg) * steg)
        if g >= golv:
            return [1.0] * heltider + [round(g, 2)] * rest_antal
    return []


def _personal(dag, natt):
    ut = [{"id": f"A{i + 1}", "grad": g} for i, g in enumerate(dag)]
    ut += [{"id": f"N{i + 1}", "grad": g, "dygnsdelar": ["natt"]} for i, g in enumerate(natt)]
    return ut


def forslag(indata, budget=None):
    """Bemanningsförslag inom budgeten. Returnerar underlaget och en lista med scenarier."""
    u = underlag(indata, budget)
    ht = u["heltid_timmar"]
    bas = {k: copy.deepcopy(v) for k, v in indata.items() if k not in ("personal", "onskemal", "beskrivning", "forvantat")}
    bas["veckor"] = u["veckor"]
    bas["budget_timmar_vecka"] = u["budget_timmar_vecka"]
    bas["onskemal"] = []

    natt_summa = u["natt_timmar_vecka"] / ht
    natt = []
    if u["minsta_antal_natt"]:
        natt = _heltidsnorm(natt_summa, u["minsta_antal_natt"], golv=0.4) or _grader(natt_summa, u["minsta_antal_natt"], golv=0.3)
        natt = [min(1.0, math.ceil(g * 20) / 20) for g in natt]  # natt avrundas uppåt: nätterna ska räcka
    natt_timmar = sum(natt) * ht
    dag_summa = max(0.0, (u["budget_timmar_vecka"] - natt_timmar) / ht)
    n = max(u["minsta_antal_dag"], 1)

    kandidater = []
    if indata.get("personal"):
        kandidater.append(("nuvarande", "Nuvarande bemanning", "Personalen som finns i enheten i dag, för jämförelse.",
                           copy.deepcopy(indata["personal"]), copy.deepcopy(indata.get("onskemal", [])), {}))
    kandidater.append(("heltid", "Heltid som norm", f"Så många heltider som budgeten räcker till, resten deltider. Minst {n} med dag och kväll för att täcka helgerna.",
                       _personal(_heltidsnorm(dag_summa, n), natt), [], {}))
    kandidater.append(("jamn", "Lika deltider", f"{n} personer med samma sysselsättningsgrad. Ger jämn arbetsbörda men kortare pass.",
                       _personal(_grader(dag_summa, n), natt), [], {}))
    kandidater.append(("fler", "Fler personer, lägre grad", f"{n + 2} personer med dag och kväll. Fler som kan arbeta varje helg och mer flexibilitet, men fler deltider.",
                       _personal(_grader(dag_summa, n + 2), natt), [], {}))
    behov_dag = max(0.0, (u["behov_timmar_vecka"] - natt_timmar) / ht)
    if behov_dag < dag_summa - 0.25:
        kandidater.append(("behovet", "Bara behovet", f"Den minsta bemanning som täcker behovet: {n} personer med dag och kväll. Visar hur mycket av budgeten som inte behövs ({round((dag_summa - behov_dag) * ht, 1)} h per vecka).",
                           _personal(_heltidsnorm(behov_dag, n) or _grader(behov_dag, n), natt), [], {}))
    if u["fredagskvall_styr"]:
        def utan_fredag(ind2):
            u2 = underlag(ind2, u["budget_timmar_vecka"])
            return max(u2["minsta_antal_dag"], 1)
        behov = copy.deepcopy(indata.get("behov", {}))
        helg = behov.get("helg", {})
        fre = dict(behov.get("fre", behov.get("vardag", {})))
        fre["kvall"] = helg.get("kvall", fre.get("kvall", 0))
        behov["fre"] = fre
        n_fre = utan_fredag({**indata, "behov": behov})
        kandidater.append(("fredag", "Fredagskväll som helgkväll", f"Behovet fredag kväll sänks till helgens nivå ({fre['kvall']}). Då krävs minst {n_fre} personer med dag och kväll för helgerna i stället för {n}. Budgeten fördelas med heltid som norm.",
                           _personal(_heltidsnorm(dag_summa, n_fre), natt), [], {"behov": behov}))
        regler = dict(indata.get("regler", {}), ingen_fredagskvall_fore_ledig_helg=False)
        n_regel = utan_fredag({**indata, "regler": regler})
        kandidater.append(("utan_fredagsregel", "Utan fredagsregeln", f"Den lokala regeln om ingen fredagskväll före ledig helg stängs av, så fredagskvällen kan tas av den som är ledig helgen. Då krävs minst {n_regel} personer för helgerna. Kräver ett beslut i verksamheten, eftersom det är en lokal regel.",
                           _personal(_heltidsnorm(dag_summa, n_regel), natt), [], {"regler": regler}))

    scenarier = []
    for nyckel, namn, beskr, personal, onsk, extra in kandidater:
        if not any("dygnsdelar" not in p for p in personal) and u["dag_pass_vecka"]:
            continue  # budgeten räcker inte till förslaget
        ind = copy.deepcopy(bas)
        ind.update(copy.deepcopy(extra))
        ind["personal"], ind["onskemal"] = personal, onsk
        if nyckel == "nuvarande":
            ind["veckor"] = indata["veckor"]
            ind.pop("budget_timmar_vecka", None)
            if indata.get("budget_timmar_vecka"):
                ind["budget_timmar_vecka"] = indata["budget_timmar_vecka"]
        kontrakt = sum(p.get("grad", 1) for p in personal) * ht
        dag = [p for p in personal if p.get("dygnsdelar") != ["natt"]]
        nat = [p for p in personal if p.get("dygnsdelar") == ["natt"]]
        sammanfattning = (f"{len(dag)} dag/kväll ({', '.join(_grader_text(dag))})"
                          + (f" och {len(nat)} natt ({', '.join(_grader_text(nat))})" if nat else ""))
        scenarier.append({"id": nyckel, "namn": namn, "beskrivning": beskr, "sammanfattning": sammanfattning,
                          "kontrakt_timmar_vecka": round(kontrakt, 1), "indata": ind})
    return {"underlag": u, "scenarier": scenarier}


def _grader_text(personal):
    from collections import Counter
    c = Counter(round(p.get("grad", 1) * 100) for p in personal)
    return [f"{n} × {g} %" for g, n in sorted(c.items(), reverse=True)]


def konsekvenser(indata, res, granskning=None, budget=None):
    """Sammanfatta ett lagt schema som underlag för beslut."""
    W = res["veckor"]
    N = W * 7
    r = _r(indata)
    ht = indata.get("heltid_minuter_per_vecka", FORSTA_HELTID) / 60
    ut = {"status": res["status"]}
    kontrakt = sum(p.get("grad", 1) * p.get("heltid_minuter_per_vecka", ht * 60) / 60 for p in indata["personal"])
    budget = budget or indata.get("budget_timmar_vecka")
    ut.update({"personer": len(indata["personal"]), "heltider": sum(1 for p in indata["personal"] if p.get("grad", 1) >= 0.999),
               "kontrakt_timmar_vecka": round(kontrakt, 1), "arsarbetare": round(kontrakt / ht, 2),
               "budget_timmar_vecka": budget, "budget_kvar": round(budget - kontrakt, 1) if budget else None})
    if res["status"] != "OK":
        return ut
    behov = expandera_dagvarden(indata.get("behov"), dict)
    vak = {"vardag": 0, "fredagskvall": 0, "helg": 0, "natt": 0}
    over, over_tim = 0, 0.0
    langd = {}
    for rad in res["schema"].values():
        for p in rad:
            if p:
                langd.setdefault(p["dygnsdel"], []).append(p["netto"])
    snitt = {k: sum(v) / len(v) for k, v in langd.items()}
    for d in range(N):
        for del_ in ("morgon", "kvall", "natt"):
            n = sum(1 for rad in res["schema"].values() if rad[d] and rad[d]["dygnsdel"] == del_)
            b = behov[d % 7].get(del_, 0)
            if n < b:
                nyckel = "natt" if del_ == "natt" else "helg" if d % 7 >= 5 else "fredagskvall" if d % 7 == 4 and del_ == "kvall" else "vardag"
                vak[nyckel] += b - n
            elif n > b:
                over += n - b
                over_tim += (n - b) * snitt.get(del_, 0) / 60
    helg = [sum(1 for rad in res["schema"].values() if rad[w * 7 + 5] or rad[w * 7 + 6]) for w in range(W)]
    ensidiga, kvallar = 0, []
    for pid, rad in res["schema"].items():
        p = next((q for q in indata["personal"] if q["id"] == pid), {})
        delar = p.get("dygnsdelar", ["morgon", "kvall"])
        if "morgon" in delar and "kvall" in delar:
            kvallar.append(sum(1 for x in rad if x and x["dygnsdel"] == "kvall"))
            for w in range(W):
                typer = [x["dygnsdel"] for x in rad[w * 7:w * 7 + 7] if x]
                if typer and (typer.count("kvall") == 0 or typer.count("morgon") == 0):
                    ensidiga += 1
    alla_langder = [x for v in langd.values() for x in v if True]
    dag_langder = langd.get("morgon", []) + langd.get("kvall", [])
    ut.update({
        "vakanta_pass": res["kpi"]["vakanta_pass"], "vakanser": vak, "overkapacitet_pass": over,
        "overkapacitet_timmar_vecka": round(over_tim / W, 1),
        "helg_personer_min": min(helg) if helg else 0, "helg_personer_max": max(helg) if helg else 0,
        "kvallar_skillnad": (max(kvallar) - min(kvallar)) if kvallar else 0,
        "veckor_utan_blandning": ensidiga, "personveckor": len(kvallar) * W,
        "kortaste_pass": min(dag_langder) if dag_langder else (min(alla_langder) if alla_langder else 0),
        "langsta_pass": max(dag_langder) if dag_langder else 0,
        "brott": len(granskning["brott"]) if granskning else None,
        "upplasta_regler": list(indata.get("avvikelser", [])),
        "fredagsregel": r["ingen_fredagskvall_fore_ledig_helg"],
    })
    return ut


def rangordna(rader):
    """Bäst först: inga regelbrott, få vakanser, inom budget, blandade veckor, lite outnyttjat."""
    def nyckel(x):
        k = x.get("konsekvenser") or {}
        if k.get("status") != "OK":
            return (1, 10 ** 6, 0, 0, 0, 0)
        over_budget = max(0.0, -(k.get("budget_kvar") or 0))
        return (0 if not k.get("brott") else 1, k.get("vakanta_pass", 0), over_budget,
                round(k.get("overkapacitet_timmar_vecka", 0) / 10), k.get("veckor_utan_blandning", 0),
                k.get("overkapacitet_timmar_vecka", 0))
    return sorted(range(len(rader)), key=lambda i: nyckel(rader[i]))


def main():
    from schemamotor import validate
    from schemamotor.build import forbered, los
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("indata")
    ap.add_argument("--budget", type=float)
    ap.add_argument("--tid", type=float, default=5)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    with open(a.indata, encoding="utf-8") as f:
        indata = json.load(f)
    f = forslag(indata, a.budget)
    for s in f["scenarier"]:
        res = los(forbered(copy.deepcopy(s["indata"])), a.tid, 8, tyst=True)
        g = validate.kontrollera(copy.deepcopy(s["indata"]), res) if res["status"] == "OK" else None
        s["konsekvenser"] = konsekvenser(s["indata"], res, g, f["underlag"]["budget_timmar_vecka"])
    ordning = rangordna(f["scenarier"])
    if a.json:
        print(json.dumps({"underlag": f["underlag"], "ordning": ordning,
                          "scenarier": [{k: v for k, v in s.items() if k != "indata"} for s in f["scenarier"]]},
                         ensure_ascii=False, indent=2))
        return
    u = f["underlag"]
    print(f"Budget {u['budget_timmar_vecka']} h/vecka = {u['arsarbetare_budget']} årsarbetare. "
          f"Behovet: {u['dag_pass_vecka']} dag/kvällspass per vecka, {u['personer_per_helg_dag']} per helg, "
          f"natt {u['natt_timmar_vecka']} h/vecka.")
    for i in ordning:
        s = f["scenarier"][i]
        k = s["konsekvenser"]
        print(f"- {s['namn']}: {s['sammanfattning']}, {k['kontrakt_timmar_vecka']} h. "
              f"Vakanser {k.get('vakanta_pass', '–')}, överkapacitet {k.get('overkapacitet_timmar_vecka', '–')} h/v, "
              f"veckor utan blandning {k.get('veckor_utan_blandning', '–')}, brott {k.get('brott', '–')}.")


if __name__ == "__main__":
    sys.exit(main())
