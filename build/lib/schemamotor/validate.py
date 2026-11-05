#!/usr/bin/env python3
"""Fristående kontroll av ett färdigt schema mot avtal, lag, lokala regler och principer.

Användning:
    python -m schemamotor.validate indata.json schema.json [--json]

Skriptet delar ingen kod med schemamotor.build. Det läser ett schema – oavsett varifrån
det kommer – och kontrollerar varje regel exakt på tidslinjen, inklusive dygnsvila räknad
från dygnsbrytet och veckovila räknad från veckobrytet. Schemaformatet beskrivs i
docs/indata-schema.md.

Exitkod: 0 = inga brott mot hårda regler, 1 = minst ett brott, 2 = fel i indata.
"""
import argparse
import json
import sys
from collections import Counter

DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
DYGN = 1440
STANDARD = {
    "dygnsvila_minuter": 660, "veckovila_minuter": 2160, "dygnsbryt": "auto", "veckobryt": "mån 00:00",
    "rast_grans_minuter": 300, "rast_minuter": 30, "pass_per_vecka": 4.75, "morgon_start": "07:00",
    "kvall_slut": "22:00", "kant_fran": "12:00", "kant_till": "18:00", "block_min": 2, "block_max": 5,
    "block_rekommenderat": 4, "helg_start": "fre 22:00", "helg_slut": "mån 06:00", "hel_helg": True,
    "helgfrekvens": "2/4", "ingen_fredagskvall_fore_ledig_helg": True, "tolerans_minuter": 60,
}
NIVA = {"DYGNSVILA": "avtal", "VECKOVILA": "avtal", "RAST": "lag", "ANTAL_PASS": "kontrakt", "TID": "kontrakt",
        "HELG": "lokal regel", "BLOCK_MIN": "lokal regel", "BLOCK_MAX": "lokal regel",
        "PASSFONSTER": "princip", "BLOCK_REKOMMENDERAT": "princip", "BEHOV": "verksamhet"}


def tid(s):
    h, m = s.strip().split(":")
    return int(h) * 60 + int(m)


def klocka(m):
    m = int(m) % DYGN
    return f"{m // 60:02d}:{m % 60:02d}"


def veckotid(s):
    dag, kl = s.split()
    return DAGNAMN.index(dag) * DYGN + tid(kl)


def dagindex(nyckel):
    grupper = {"vardag": range(5), "helg": range(5, 7), "alla": range(7)}
    return grupper[nyckel] if nyckel in grupper else [DAGNAMN.index(nyckel)]


def dag_text(d):
    return f"vecka {d // 7 + 1} {DAGNAMN[d % 7]}"


def lasa_pass(schema, N):
    """-> {person: [(dag, start_abs, slut_abs, pass)]}"""
    ut = {}
    for pid, dagar in schema.items():
        if len(dagar) != N:
            raise ValueError(f"{pid}: schemat har {len(dagar)} dagar, väntat {N}.")
        lista = []
        for d, p in enumerate(dagar):
            if not p:
                continue
            s, e = tid(p["start"]), tid(p["slut"])
            if e <= s:
                e += DYGN
            lista.append((d, d * DYGN + s, d * DYGN + e, p))
        ut[pid] = lista
    return ut


def foresla_dygnsbryt(alla_pass, r):
    """Dygnsbryt för dag/kväll: där flest pass börjar eller slutar inom fönstret för rörlig kant."""
    fran, till = tid(r["kant_fran"]), tid(r["kant_till"])
    granser = Counter()
    for lista in alla_pass.values():
        for _, s, e, p in lista:
            if p.get("dygnsdel") == "natt":
                continue
            for g in (s % DYGN, e % DYGN):
                if fran <= g <= till:
                    granser[g] += 1
    if not granser:
        return tid(r["morgon_start"]) + 8 * 60
    snitt = sum(g * n for g, n in granser.items()) / sum(granser.values())
    return max(range(fran, till + 1, 15),
               key=lambda t: (sum(n for g, n in granser.items() if abs(g - t) <= 30), -abs(t - snitt)))


def nattbryt(lista):
    """Dygnsbryt för nattpersonal: när nattpassen oftast slutar."""
    slut = Counter(e % DYGN for _, _, e, _ in lista)
    return slut.most_common(1)[0][0] if slut else None


def langsta_lucka(intervall, a, b):
    """Längsta sammanhängande lediga tid inom [a, b) givet upptagna intervall."""
    klippta = sorted((max(s, a), min(e, b)) for s, e in intervall if e > a and s < b)
    langst, pos = 0, a
    for s, e in klippta:
        langst = max(langst, s - pos)
        pos = max(pos, e)
    return max(langst, b - pos)


def kontrollera(indata, schema_dok):
    r = dict(STANDARD)
    r.update(indata.get("regler", {}))
    W = indata["veckor"]
    N = W * 7
    L = N * DYGN
    cyk = indata.get("cykliskt", True)
    schema = schema_dok.get("schema", schema_dok)
    alla = lasa_pass(schema, N)
    fel, varn = [], []

    def brott(regel, pid, text, hard=True):
        (fel if hard else varn).append({"regel": regel, "niva": NIVA.get(regel, ""), "person": pid, "text": text})

    def upptaget(lista):
        iv = [(s, e) for _, s, e, _ in lista]
        if cyk:
            iv += [(s - L, e - L) for s, e in iv] + [(s + L, e + L) for s, e in iv]
        return iv

    dygnsbryt = r["dygnsbryt"]
    db_dag = foresla_dygnsbryt(alla, r) if dygnsbryt == "auto" else tid(dygnsbryt)
    brytpunkter = {}
    vb = veckotid(r["veckobryt"])
    personer = {p["id"]: p for p in indata["personal"]}

    for pid, lista in alla.items():
        iv = upptaget(lista)
        egen = personer.get(pid, {}).get("dygnsbryt")
        if egen:
            db = tid(egen)
        elif personer.get(pid, {}).get("dygnsdelar") == ["natt"] and lista:
            db = nattbryt(lista)
        else:
            db = db_dag
        brytpunkter[pid] = klocka(db)
        # vila mellan pass
        sorterade = sorted(lista, key=lambda t: t[1])
        par = list(zip(sorterade, sorterade[1:]))
        if cyk and len(sorterade) > 1:
            par.append((sorterade[-1], (sorterade[0][0] + N, sorterade[0][1] + L, sorterade[0][2] + L, None)))
        for (d1, s1, e1, _), (d2, s2, e2, _) in par:
            if s2 < e1:
                brott("DYGNSVILA", pid, f"Pass överlappar ({dag_text(d1)} och {dag_text(d2 % N)}).")
            elif s2 - e1 < r["dygnsvila_minuter"]:
                brott("DYGNSVILA", pid, f"Bara {(s2 - e1) / 60:.1f} h vila mellan passet {dag_text(d1)} "
                                        f"och passet {dag_text(d2 % N)} (minst {r['dygnsvila_minuter'] / 60:g} h).")
        # dygnsvila per 24-timmarsperiod från dygnsbrytet
        for d in range(N if cyk else N - 1):
            a = d * DYGN + db
            if langsta_lucka(iv, a, a + DYGN) < r["dygnsvila_minuter"]:
                brott("DYGNSVILA", pid, f"Ingen sammanhängande dygnsvila på {r['dygnsvila_minuter'] / 60:g} h i "
                                        f"perioden från {dag_text(d)} kl {klocka(db)}.")
        # veckovila per sjudagarsperiod från veckobrytet
        for w in range(W if cyk else W - 1):
            a = w * 7 * DYGN + vb
            lucka = langsta_lucka(iv, a, a + 7 * DYGN)
            if lucka < r["veckovila_minuter"]:
                brott("VECKOVILA", pid, f"Längsta vila i sjudagarsperioden från {dag_text(w * 7 + vb // DYGN)} "
                                        f"kl {klocka(vb)} är {lucka / 60:.1f} h (minst {r['veckovila_minuter'] / 60:g} h).")
        # rast och passfönster
        for d, s, e, p in lista:
            pa_plats = e - s
            rast = p.get("rast", 0) or 0
            arbetstid = pa_plats if p.get("maltidsuppehall") else pa_plats - rast
            if not p.get("maltidsuppehall") and pa_plats - rast > r["rast_grans_minuter"]:
                if rast < r["rast_minuter"]:
                    brott("RAST", pid, f"{dag_text(d)} {p['start']}–{p['slut']}: över {r['rast_grans_minuter'] / 60:g} h "
                                       f"arbete utan rast.")
                elif pa_plats - rast > 2 * r["rast_grans_minuter"]:
                    brott("RAST", pid, f"{dag_text(d)} {p['start']}–{p['slut']}: rasten kan inte placeras så att "
                                       f"ingen del blir längre än {r['rast_grans_minuter'] / 60:g} h.")
            del_ = p.get("dygnsdel")
            if del_ == "morgon" and (s % DYGN != tid(r["morgon_start"]) or not
                                     tid(r["kant_fran"]) <= e % DYGN <= tid(r["kant_till"])):
                brott("PASSFONSTER", pid, f"{dag_text(d)}: morgonpass {p['start']}–{p['slut']} följer inte fönstret.")
            if del_ == "kvall" and (e % DYGN != tid(r["kvall_slut"]) or not
                                    tid(r["kant_fran"]) <= s % DYGN <= tid(r["kant_till"])):
                brott("PASSFONSTER", pid, f"{dag_text(d)}: kvällspass {p['start']}–{p['slut']} följer inte fönstret.")
            p["_arbetstid"] = arbetstid
        # block
        work = [0] * N
        for d, *_ in lista:
            work[d] = 1
        idx = range(N) if cyk else range(1, N - 1)
        for d in idx:
            if work[d] and not work[(d - 1) % N] and not work[(d + 1) % N]:
                brott("BLOCK_MIN", pid, f"Enstaka arbetsdag {dag_text(d)}.")
        for regel, grans, hard in (("BLOCK_MAX", r["block_max"], True),
                                   ("BLOCK_REKOMMENDERAT", r["block_rekommenderat"], False)):
            for d in range(N if cyk else N - grans):
                if all(work[(d + k) % N] for k in range(grans + 1)):
                    if not work[(d - 1) % N] or (not cyk and d == 0):
                        langd = grans + 1
                        while langd < N and work[(d + langd) % N]:
                            langd += 1
                        brott(regel, pid, f"{langd} arbetsdagar i följd från {dag_text(d)} (gräns {grans}).", hard)
        # helger
        hs, he = veckotid(r["helg_start"]), veckotid(r["helg_slut"])
        helger = []
        for w in range(W):
            a, b = w * 7 * DYGN + hs, (w + 1) * 7 * DYGN + he
            jobbar = any(e > a and s < b for s, e in iv)
            helger.append(jobbar)
            if jobbar and r["hel_helg"] and not (work[w * 7 + 5] and work[w * 7 + 6]):
                brott("HELG", pid, f"Arbetar helgen vecka {w + 1} men inte både lördag och söndag.")
            if not jobbar and r["ingen_fredagskvall_fore_ledig_helg"]:
                for d, _, _, p in lista:
                    if d == w * 7 + 4 and p.get("dygnsdel") in ("kvall", "natt"):
                        brott("HELG", pid, f"Kvällspass fredag vecka {w + 1} före ledig helg.")
        pers = personer.get(pid, {})
        frek = pers.get("helgfrekvens", r["helgfrekvens"])
        antal = sum(helger)
        if frek == "2/4":
            if any(helger[w] == helger[(w + 1) % W] for w in range(W if cyk else W - 1)):
                brott("HELG", pid, "Helgerna växlar inte varannan: " + "".join("J" if h else "L" for h in helger) + ".")
        elif frek in ("alla", "4/4") and antal != W:
            brott("HELG", pid, f"Ska arbeta alla helger, arbetar {antal} av {W}.")
        elif frek in ("ingen", "0/4") and antal:
            brott("HELG", pid, f"Ska inte arbeta helg, arbetar {antal}.")
        elif "/" in frek and frek not in ("2/4", "4/4", "0/4"):
            t, n = map(int, frek.split("/"))
            if antal != round(W * t / n):
                brott("HELG", pid, f"Helgfrekvens {frek} ger {W * t / n:g} helger, arbetar {antal}.")
        # antal pass och tid
        delp = indata.get("delperioder") or [W]
        heltid = pers.get("heltid_minuter_per_vecka", indata.get("heltid_minuter_per_vecka", 2220))
        natt = pers.get("dygnsdelar") == ["natt"]
        mal_min = round(heltid * pers.get("grad", 1) * W)
        mal = pers.get("antal_pass")
        if mal is None and not natt:
            mal = round(r["pass_per_vecka"] * W)
        if mal is not None:
            mal_lista = mal if isinstance(mal, list) else [mal]
            if len(mal_lista) == len(delp):
                start = 0
                for v, m_ in zip(delp, mal_lista):
                    faktiskt = sum(work[start * 7:(start + v) * 7])
                    if faktiskt != m_:
                        brott("ANTAL_PASS", pid, f"{faktiskt} pass veckorna {start + 1}–{start + v}, ska vara {m_}.")
                    start += v
            elif sum(work) != sum(mal_lista):
                brott("ANTAL_PASS", pid, f"{sum(work)} pass, ska vara {sum(mal_lista)}.")
        tol = pers.get("tolerans_minuter")
        if tol is None:
            tol = r["tolerans_minuter"]
            if natt and lista:
                tol = max(tol, -(-min(p["_arbetstid"] for *_, p in lista) // 2))
        arb = sum(p["_arbetstid"] for *_, p in lista)
        if abs(arb - mal_min) > tol:
            brott("TID", pid, f"Arbetstid {arb / 60:.2f} h, kontrakterat {mal_min / 60:.2f} h (tolerans {tol} min).")

    # behov
    behov = [{} for _ in range(7)]
    tidp = [[] for _ in range(7)]
    for nyckel, v in (indata.get("behov") or {}).items():
        for i in dagindex(nyckel):
            behov[i] = v
    for nyckel, v in (indata.get("tidpunkter") or {}).items():
        for i in dagindex(nyckel):
            tidp[i] = v
    vakanser = 0
    for d in range(N):
        for del_, antal in behov[d % 7].items():
            n = sum(1 for lista in alla.values() for dd, _, _, p in lista if dd == d and p.get("dygnsdel") == del_)
            if n < antal:
                vakanser += antal - n
                brott("BEHOV", None, f"{dag_text(d)}: {antal - n} vakant {del_}pass.", hard=False)
        for tp in tidp[d % 7]:
            t = d * DYGN + tid(tp["tid"])
            n = sum(1 for lista in alla.values() for _, s, e, _ in lista
                    if s <= t < e or (cyk and s <= t + L < e) or (cyk and s <= t - L < e))
            if n < tp["antal"]:
                vakanser += tp["antal"] - n
                brott("BEHOV", None, f"{dag_text(d)} kl {tp['tid']}: {n} i tjänst, behov {tp['antal']}.", hard=False)
    return {"giltigt": not fel, "dygnsbryt": klocka(db_dag), "dygnsbryt_per_person": brytpunkter,
            "veckobryt": r["veckobryt"],
            "brott": fel, "varningar": varn, "vakanser": vakanser}


def rapport(res):
    rad = ["# Schemagranskning", "",
           f"**{'Inga brott mot hårda regler.' if res['giltigt'] else str(len(res['brott'])) + ' brott mot hårda regler.'}**",
           "", f"Dygnsvila räknad från dygnsbryt {res['dygnsbryt']} för dag och kväll"
           + "".join(f", {k} {v}" for k, v in res["dygnsbryt_per_person"].items() if v != res["dygnsbryt"])
           + f". Veckovila räknad från veckobryt {res['veckobryt']}."]
    if res["brott"]:
        rad += ["", "## Brott", "", "| Regel | Nivå | Person | Beskrivning |", "|---|---|---|---|"]
        rad += [f"| {b['regel']} | {b['niva']} | {b['person'] or '–'} | {b['text']} |" for b in res["brott"]]
    if res["varningar"]:
        rad += ["", "## Att notera (mjuka regler och behov)"]
        rad += [f"- {b['regel']}" + (f" {b['person']}" if b["person"] else "") + f": {b['text']}"
                for b in res["varningar"][:60]]
        if len(res["varningar"]) > 60:
            rad.append(f"- … och {len(res['varningar']) - 60} till.")
    return "\n".join(rad)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("indata")
    ap.add_argument("schema")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    try:
        with open(a.indata, encoding="utf-8") as f:
            indata = json.load(f)
        with open(a.schema, encoding="utf-8") as f:
            schema = json.load(f)
        res = kontrollera(indata, schema)
    except (ValueError, KeyError) as e:
        print(f"Fel i indata: {e}")
        sys.exit(2)
    print(json.dumps(res, ensure_ascii=False, indent=2) if a.json else rapport(res))
    sys.exit(0 if res["giltigt"] else 1)


if __name__ == "__main__":
    main()
