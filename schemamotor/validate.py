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
import math
import sys
from collections import Counter

DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
DYGN = 1440
STANDARD = {
    "dygnsvila_minuter": 660, "veckovila_minuter": 2160, "dygnsbryt": "auto", "dygnsbryt_natt": "auto", "veckobryt": "mån 00:00",
    "rast_grans_minuter": 300, "rast_minuter": 30, "pass_per_vecka": 4.75, "morgon_start": "07:00",
    "kvall_slut": "22:00", "kant_fran": "12:00", "kant_till": "18:00", "block_min": 2, "block_max": 5,
    "block_rekommenderat": 4, "natt_max_i_rad": 3, "natt_vila_mellan_block_minuter": 2880, "morgon_starter": [], "kvall_max_i_rad": 3, "kvall_i_rad_typ": "mjuk", "helg_start": "fre 22:00", "helg_slut": "mån 06:00", "hel_helg": True,
    "helgfrekvens": "2/4", "ingen_fredagskvall_fore_ledig_helg": True, "tolerans_minuter": 60,
    "min_passlangd_minuter": 300, "spridning_kvallar": "mjuk", "spridning_tolerans": 1, "jamn_bemanning": "mjuk",
}
DELTEXT = {"morgon": "dag", "kvall": "kväll", "natt": "natt"}
NIVA = {"DYGNSVILA": "avtal", "VECKOVILA": "avtal", "RAST": "lag", "ANTAL_PASS": "kontrakt", "TID": "kontrakt",
        "HELG": "lokal regel", "BLOCK_MIN": "lokal regel", "BLOCK_MAX": "lokal regel",
        "PASSFONSTER": "princip", "BLOCK_REKOMMENDERAT": "princip", "BEHOV": "verksamhet", "SPRIDNING": "princip",
        "JAMN_BEMANNING": "princip", "AKTIVITET": "verksamhet", "NATT_I_RAD": "lokal regel", "NATT_VILA": "lokal regel", "KVALL_I_RAD": "lokal regel",
        "TEAM": "verksamhet", "KOMPETENS": "verksamhet", "STARTTID": "verksamhet"}


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


def aktivitetsdagar(a, W, start_iso):
    """Dagindex för en aktivitet: 'dagindex', eller 'dagar' och 'veckor' (alla, jämna, udda eller en lista)."""
    if "dagindex" in a:
        return sorted({d % (W * 7) for d in a["dagindex"]})
    dagar = a.get("dagar") or DAGNAMN
    vv = a.get("veckor") or "alla"
    ut = set()
    for w in range(W):
        nr = start_iso + w if start_iso else w + 1
        if vv == "alla" or (vv == "jämna" and nr % 2 == 0) or (vv == "udda" and nr % 2 == 1) \
                or (isinstance(vv, list) and w + 1 in vv):
            ut |= {w * 7 + DAGNAMN.index(d) for d in dagar}
    return sorted(ut)


def kontrollera(indata, schema_dok):
    r = dict(STANDARD)
    r.update(indata.get("regler", {}))
    # 11 timmars dygnsvila kan inte låsas upp (AB 25 § 13 mom. 8; verksamhetens beslut 2026-11-07)
    r["dygnsvila_minuter"] = max(660, r["dygnsvila_minuter"])
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
    # ordningen bland dag- och kvällspersonal utan angivet antal pass (för perioder som inte går jämnt ut)
    utan_antal = [p["id"] for p in indata["personal"] if p.get("antal_pass") is None and p.get("dygnsdelar") != ["natt"]]
    vaxel = {pid: i for i, pid in enumerate(utan_antal)}

    for pid, lista in alla.items():
        iv = upptaget(lista)
        egen = personer.get(pid, {}).get("dygnsbryt")
        if egen:
            db = tid(egen)
        elif personer.get(pid, {}).get("dygnsdelar") == ["natt"] and r.get("dygnsbryt_natt", "auto") != "auto":
            db = tid(r["dygnsbryt_natt"])
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
        # nattpersonal: vila mellan två nattblock (lokal regel, mjuk). Ett nytt block = nästa pass inte nästa dag.
        nvila = r.get("natt_vila_mellan_block_minuter") or 0
        if nvila and personer.get(pid, {}).get("dygnsdelar") == ["natt"]:
            for (d1, s1, e1, _), (d2, s2, e2, _) in par:
                if d2 - d1 >= 2 and s2 - e1 < nvila:
                    brott("NATT_VILA", pid, f"Bara {(s2 - e1) / 60:.1f} h vila mellan nattblocken ({dag_text(d1)} och "
                                            f"{dag_text(d2 % N)}); minst {nvila / 60:g} h eftersträvas.", hard=False)
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
            starter = ({tid(r["morgon_start"])} | {tid(t) for t in r.get("morgon_starter") or []}
                       | {tid(x["tid"]) for x in ((indata.get("starttider") or {}).get("morgon") or [])})  # docs/starttider.md
            if del_ == "morgon" and (s % DYGN not in starter or not
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
        grupper_ = [("BLOCK_MAX", r["block_max"], True)]
        if personer.get(pid, {}).get("dygnsdelar") == ["natt"] and r.get("natt_max_i_rad"):
            grupper_.append(("NATT_I_RAD", r["natt_max_i_rad"], True))
        for regel, grans, hard in grupper_ + [("BLOCK_REKOMMENDERAT", r["block_rekommenderat"], False)]:
            for d in range(N if cyk else N - grans):
                if all(work[(d + k) % N] for k in range(grans + 1)):
                    if not work[(d - 1) % N] or (not cyk and d == 0):
                        langd = grans + 1
                        while langd < N and work[(d + langd) % N]:
                            langd += 1
                        sort_ = "nätter i rad" if regel == "NATT_I_RAD" else "arbetsdagar i följd"
                        brott(regel, pid, f"{langd} {sort_} från {dag_text(d)} (gräns {grans}).", hard)
        # högst kvall_max_i_rad kvällar i rad (lokal regel, mjuk eller hård)
        km = r.get("kvall_max_i_rad") or 0
        if km:
            kvall = [0] * N
            for d, _, _, p in lista:
                if p.get("dygnsdel") == "kvall":
                    kvall[d] = 1
            for d in range(N if cyk else N - km):
                if all(kvall[(d + k) % N] for k in range(km + 1)) and (not kvall[(d - 1) % N] or (not cyk and d == 0)):
                    langd = km + 1
                    while langd < N and kvall[(d + langd) % N]:
                        langd += 1
                    hard_kv = r.get("kvall_i_rad_typ") == "hard"
                    brott("KVALL_I_RAD", pid, f"{langd} kvällar i rad från {dag_text(d)} ({'högst' if hard_kv else 'helst högst'} {km}).",
                          hard=hard_kv)
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
        natt = pers.get("dygnsdelar") == ["natt"]
        # nattpersonal: heltid 34 h 20 min om inget annat anges
        heltid = pers.get("heltid_minuter_per_vecka") or (indata.get("heltid_natt_minuter_per_vecka", 2060) if natt
                                                          else indata.get("heltid_minuter_per_vecka", 2220))
        mal_min = round(heltid * pers.get("grad", 1) * W)
        mal = pers.get("antal_pass")
        if mal is None and not natt:
            x = r["pass_per_vecka"] * W  # växelvis nedåt och uppåt när det inte går jämnt ut
            mal = round(x) if abs(x - round(x)) < 1e-9 else (math.floor(x) if vaxel[pid] % 2 == 0 else math.ceil(x))
            if r["min_passlangd_minuter"] and mal_min / mal < r["min_passlangd_minuter"]:
                mal = max(1, mal_min // r["min_passlangd_minuter"])
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
        # spridning: veckor med bara morgnar eller bara kvällar för den som arbetar båda
        delar = pers.get("dygnsdelar", ["morgon", "kvall"])
        if r["spridning_kvallar"] != "av" and "morgon" in delar and "kvall" in delar and W >= 2:
            ensidiga = []
            for w in range(W):
                typer = [p.get("dygnsdel") for d, _, _, p in lista if w * 7 <= d < w * 7 + 7]
                if typer and (typer.count("kvall") == 0 or typer.count("morgon") == 0):
                    ensidiga.append(f"v{w + 1} ({'bara kväll' if typer.count('morgon') == 0 else 'bara morgon'})")
            if ensidiga:
                brott("SPRIDNING", pid, f"Veckor utan blandning av morgon och kväll: {', '.join(ensidiga)}.", False)
        tol = pers.get("tolerans_minuter")
        if tol is None:
            tol = r["tolerans_minuter"]
            if natt and lista:
                tol = max(tol, -(-min(p["_arbetstid"] for *_, p in lista) // 2))
        arb = sum(p["_arbetstid"] for *_, p in lista)
        if abs(arb - mal_min) > tol:
            brott("TID", pid, f"Arbetstid {arb / 60:.2f} h, kontrakterat {mal_min / 60:.2f} h (tolerans {tol} min).")

    # aktiviteter (verksamhet): den som deltar ska arbeta hela aktivitetstiden
    akt = {a["id"]: a for a in indata.get("aktiviteter") or []}
    deltar = {}  # (id, dag) -> [person]
    borta = []   # (start_abs, slut_abs) för deltagare som är borta från golvet
    for pid, lista in alla.items():
        for d, s, e, p in lista:
            for x in p.get("aktiviteter") or []:
                a = akt.get(x.get("id"))
                if not a:
                    brott("AKTIVITET", pid, f"{dag_text(d)}: aktiviteten {x.get('id')} finns inte i indata.")
                    continue
                a0 = d * DYGN + tid(a["start"])
                if a0 < s:
                    a0 += DYGN  # nattpass: aktiviteten ligger efter midnatt
                a1 = a0 - tid(a["start"]) + tid(a["slut"])
                dag = (a0 // DYGN) % N
                if not (s <= a0 and a1 <= e):
                    brott("AKTIVITET", pid, f"{dag_text(dag)}: deltar i {a.get('namn') or a['id']} {a['start']}–{a['slut']} "
                                            f"men passet är {p['start']}–{p['slut']}. Den som deltar ska arbeta hela tiden.")
                    continue
                if dag not in aktivitetsdagar(a, W, indata.get("start_iso_vecka")):
                    brott("AKTIVITET", pid, f"{dag_text(dag)}: {a.get('namn') or a['id']} ligger inte på den dagen.")
                    continue
                if pid in deltar.setdefault((a["id"], dag), []):
                    brott("AKTIVITET", pid, f"{dag_text(dag)}: deltar två gånger i {a.get('namn') or a['id']}.")
                    continue
                deltar[a["id"], dag].append(pid)
                if a.get("fran_golvet", True):
                    borta.append((a0, a1))
    for a in akt.values():
        namn = a.get("namn") or a["id"]
        dagar = aktivitetsdagar(a, W, indata.get("start_iso_vecka"))
        if a.get("deltagare"):
            grupp = list(a["deltagare"])
        else:
            # alla vars dygnsdelar kan rymma aktiviteten
            fonster = {"morgon": (tid(r["morgon_start"]), tid(r["kant_till"])),
                       "kvall": (tid(r["kant_fran"]), tid(r["kvall_slut"]))}
            for np_ in indata.get("nattpass") or [{"start": "21:45", "slut": "06:45"}]:
                ns, ne = tid(np_["start"]), tid(np_["slut"])
                fonster["natt"] = (ns, ne + DYGN if ne <= ns else ne)
            a0, a1 = tid(a["start"]), tid(a["slut"])
            def ryms(del_):
                f0, f1 = fonster[del_]
                return (f0 <= a0 and a1 <= f1) or (f0 <= a0 + DYGN and a1 + DYGN <= f1)
            grupp = [q["id"] for q in indata["personal"] if any(ryms(x) for x in q.get("dygnsdelar", ["morgon", "kvall"]))]
        G = len(grupp)
        if a.get("antal"):
            behovet = a["antal"]
        elif a.get("andel"):
            behovet = math.ceil(a["andel"] * G - 1e-9)
        elif a.get("varje_person") and dagar:
            behovet = None  # per tillfälle nedan
        else:
            behovet = G
        tot = G * (a.get("varje_person") or 0)
        for i, d in enumerate(sorted(dagar)):
            # varje_person: platserna fördelas jämnt, de första tillfällena får en extra när det inte går jämnt ut
            beh = behovet if behovet is not None else tot // len(dagar) + (1 if i < tot % len(dagar) else 0)
            n = len(deltar.get((a["id"], d), []))
            if n < beh:
                brott("AKTIVITET", None, f"{dag_text(d)} {a['start']}–{a['slut']}: {n} deltar i {namn}, behov {beh}.",
                      hard=bool(a.get("krav")))
        utanfor = sorted({q for (i, _), lista in deltar.items() if i == a["id"] for q in lista} - set(grupp))
        if a.get("deltagare") and utanfor:
            brott("AKTIVITET", None, f"{namn}: {', '.join(utanfor)} deltar men är inte med i deltagarlistan.")
        if a.get("varje_person"):
            for q in grupp:
                n = sum(q in lista for (i, _), lista in deltar.items() if i == a["id"])
                if n != a["varje_person"]:
                    brott("AKTIVITET", q, f"Deltar {n} gånger i {namn}, ska vara {a['varje_person']}.", hard=False)

    # team (docs/team.md): varje pass hör till ett team som finns, och teamens behov täcks. Lån mellan team är
    # tillåtet; ett team som saknar personal när ett annat har fler än sitt behov samma pass noteras.
    team = indata.get("team") or []
    if team:
        tids = [t["id"] for t in team]
        namn_t = {t["id"]: t.get("namn") or t["id"] for t in team}

        def tbehov(t, wd, del_):
            v = 0
            for k, x in (t.get("behov") or {}).items():
                if k == "alla" or (k == "vardag" and wd < 5) or (k == "helg" and wd >= 5) or k == DAGNAMN[wd]:
                    if k in DAGNAMN:
                        return int(x.get(del_, 0) or 0)
                    v = int(x.get(del_, 0) or 0)
            return v
        for pid, rad in schema.items():
            for d, x in enumerate(rad[:N]):
                if x and x.get("team") is not None and x["team"] not in tids:
                    brott("TEAM", pid, f"{dag_text(d)}: passet hör till teamet {x['team']}, som inte finns.")
        for d in range(N):
            for del_ in ("morgon", "kvall", "natt"):
                antal = Counter(x.get("team") for rad in schema.values() if d < len(rad) and (x := rad[d]) and x["dygnsdel"] == del_)
                brist = {t: tbehov(tt, d % 7, del_) - antal.get(t, 0) for tt in team for t in [tt["id"]]}
                for t, b in brist.items():
                    if b > 0:
                        over = [u for u, bu in brist.items() if bu < 0]
                        brott("TEAM", None, f"{dag_text(d)} {DELTEXT.get(del_, del_)}: {namn_t[t]} har {antal.get(t, 0)} av {b + antal.get(t, 0)}"
                              + (f", fast {', '.join(namn_t[u] for u in over)} har fler än sitt behov." if over else "."), hard=False)

    # kompetens (docs/kompetens.md): minst så många med kompetensen i tjänst per dag och dygnsdel. Mjukt: det som
    # fattas är en varning (kompetensvakans), aldrig ett brott. En medarbetare med en okänd kompetens är ett indatafel.
    krav = indata.get("kompetenskrav") or []
    if krav:
        knamn = {k.get("id"): k.get("namn") or k.get("id") for k in indata.get("kompetenser") or []}
        har = {p["id"]: set(p.get("kompetenser") or []) for p in indata.get("personal", [])}

        def kbehov(k, wd, del_):
            v = 0
            for nyckel, x in (k.get("behov") or {}).items():
                if nyckel == "alla" or (nyckel == "vardag" and wd < 5) or (nyckel == "helg" and wd >= 5) or nyckel == DAGNAMN[wd]:
                    if nyckel in DAGNAMN:
                        return int(x.get(del_, 0) or 0)
                    v = int(x.get(del_, 0) or 0)
            return v
        for k in krav:
            namn_k = knamn.get(k.get("kompetens"), k.get("kompetens"))
            for d in range(N):
                for del_ in ("morgon", "kvall", "natt"):
                    b = kbehov(k, d % 7, del_)
                    if not b:
                        continue
                    n = sum(1 for pid, rad in schema.items() if d < len(rad) and (x := rad[d]) and x.get("dygnsdel") == del_
                            and k.get("kompetens") in har.get(pid, ()))
                    if n < b:
                        brott("KOMPETENS", None, f"{dag_text(d)} {DELTEXT.get(del_, del_)}: {n} av {b} med {namn_k} i tjänst.", hard=False)

    # behov
    behov = [{} for _ in range(7)]
    tidp = [[] for _ in range(7)]
    for nyckel, v in (indata.get("behov") or {}).items():
        for i in dagindex(nyckel):
            behov[i] = v
    for nyckel, v in (indata.get("tidpunkter") or {}).items():
        for i in dagindex(nyckel):
            tidp[i] = v
    # jämn bemanning (princip, mjuk): över- och underbemanning ska fördelas jämnt mellan dag och kväll
    if r.get("jamn_bemanning", "mjuk") != "av":
        for w in range(N // 7):
            summa = {("over", "morgon"): 0, ("over", "kvall"): 0, ("under", "morgon"): 0, ("under", "kvall"): 0}
            for d in range(w * 7, w * 7 + 7):
                for del_ in ("morgon", "kvall"):
                    antal = behov[d % 7].get(del_, 0)
                    n = sum(1 for lista in alla.values() for dd, _, _, p in lista if dd == d and p.get("dygnsdel") == del_)
                    summa["over", del_] += max(0, n - antal)
                    summa["under", del_] += max(0, antal - n)
            for sort, text in (("over", "över behovet"), ("under", "vakanta")):
                mo, kv = summa[sort, "morgon"], summa[sort, "kvall"]
                if abs(mo - kv) >= 3:
                    brott("JAMN_BEMANNING", None, f"Vecka {w + 1}: {mo} pass {text} på dagen men {kv} på kvällen; "
                          "fördelningen mellan dag och kväll är ojämn.", hard=False)

    vakanser = 0
    for d in range(N):
        for del_, antal in behov[d % 7].items():
            n = sum(1 for lista in alla.values() for dd, _, _, p in lista if dd == d and p.get("dygnsdel") == del_)
            if n < antal:
                vakanser += antal - n
                brott("BEHOV", None, f"{dag_text(d)}: {antal - n} vakant {del_}pass.", hard=False)
        for tp in tidp[d % 7]:
            t = d * DYGN + tid(tp["tid"])
            def inne(s, e):
                return s <= t < e or (cyk and s <= t + L < e) or (cyk and s <= t - L < e)
            n = sum(1 for lista in alla.values() for _, s, e, _ in lista if inne(s, e))
            n -= sum(1 for s, e in borta if inne(s, e))  # på aktivitet, inte på golvet
            if n < tp["antal"]:
                vakanser += tp["antal"] - n
                brott("BEHOV", None, f"{dag_text(d)} kl {tp['tid']}: {n} i tjänst, behov {tp['antal']}.", hard=False)
    # starttider (docs/starttider.md): av dagbehovet ska så många börja vid varje tid, i tidsordning och högst dagens
    # dagbehov. Mjukt: det som saknas är en varning.
    st_lista = sorted(((tid(x["tid"]), int(x.get("antal") or 0)) for x in ((indata.get("starttider") or {}).get("morgon") or [])))
    if st_lista:
        for d in range(N):
            kvar = int(behov[d % 7].get("morgon", 0) or 0)
            for t, antal in st_lista:
                a = min(antal, kvar)
                kvar -= a
                if a <= 0:
                    continue
                n = sum(1 for rad in schema.values() if d < len(rad) and (x := rad[d]) and x.get("dygnsdel") == "morgon" and tid(x["start"]) == t)
                if n < a:
                    brott("STARTTID", None, f"{dag_text(d)}: {n} av {a} dagpass börjar kl {klocka(t)}.", hard=False)
    # minsta bemanning på golvet under aktiviteter (behov, mjukt)
    for a in akt.values():
        minst = a.get("minst_pa_golvet") or 0
        if not minst:
            continue
        for d in aktivitetsdagar(a, W, indata.get("start_iso_vecka")):
            for t0 in range(tid(a["start"]), tid(a["slut"]), 15):
                t = d * DYGN + t0
                def inne(s, e):
                    return s <= t < e or (cyk and s <= t + L < e) or (cyk and s <= t - L < e)
                n = sum(1 for lista in alla.values() for _, s, e, _ in lista if inne(s, e)) - sum(1 for s, e in borta if inne(s, e))
                if n < minst:
                    vakanser += minst - n
                    brott("BEHOV", None, f"{dag_text(d)} kl {klocka(t0)} under {a.get('namn') or a['id']}: {n} på golvet, "
                                         f"minst {minst}.", hard=False)
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
