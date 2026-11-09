#!/usr/bin/env python3
"""Bygg ett cykliskt grundschema för vård och omsorg med OR-Tools CP-SAT.

Användning:
    python -m schemamotor.build indata.json [--ut schema.json] [--md schema.md] [--tid 20] [--tyst]

Indata beskrivs i docs/indata-schema.md. Modellen beskrivs i docs/optimering.md.
Hårda regler gäller alltid; målen optimeras lexikografiskt i ordningen
vakanser → blocklängd → passlängd → rättvisa → önskemål.

Exitkod: 0 = schema hittat, 1 = olösbart (kör schemamotor.explain), 2 = fel i indata.
"""
import argparse
import json
import math
import sys

try:
    from ortools.sat.python import cp_model
except ImportError:  # pragma: no cover
    sys.exit("OR-Tools saknas. Installera med: pip install ortools --break-system-packages")

DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
DYGN = 24 * 60
JOUR_MAX = 20 * 60  # AB 25 § 13 mom. 5: arbetspass och jour i följd högst 20 timmar sammanlagt

STANDARDREGLER = {
    "dygnsvila_minuter": 660,
    "veckovila_minuter": 2160,
    "dygnsbryt": "auto",
    # dygnsbryt för nattpersonal: "auto" (där nattpassen oftast slutar) eller ett klockslag
    "dygnsbryt_natt": "auto",
    "veckobryt": "mån 00:00",
    "rast_grans_minuter": 300,
    "rast_minuter": 30,
    "pass_per_vecka": 4.75,
    "morgon_start": "07:00",
    # tillåtna starttider för dagpass (rörlig start efter behovet vid klockslag); tom = bara morgon_start.
    # Användarens beslut 2026-11-07. Motorn väljer en annan start än morgon_start bara när täckningen kräver det.
    "morgon_starter": [],
    # högst så många kvällar i rad (mjuk regel för alla som arbetar kväll; 0 stänger av). Användarens beslut 2026-11-07.
    "kvall_max_i_rad": 3,
    # "mjuk" (eftersträvas) eller "hard" (aldrig fler kvällar i rad). Användarens beslut 2026-11-07.
    "kvall_i_rad_typ": "mjuk",
    "kvall_slut": "22:00",
    "kant_fran": "12:00",
    "kant_till": "18:00",
    "steg_minuter": 15,
    "block_min": 2,
    "block_max": 5,
    "block_rekommenderat": 4,
    # nattpersonal: högst så många nätter i rad (lokal regel, hård; verksamhetens beslut 2026-11-07)
    "natt_max_i_rad": 3,
    # nattpersonal: minst så lång vila mellan två nattblock (lokal regel, mjuk: bryts bara när schemat annars inte går ihop;
    # verksamhetens beslut 2026-11-07; 0 stänger av)
    "natt_vila_mellan_block_minuter": 2880,
    "helg_start": "fre 22:00",
    "helg_slut": "mån 06:00",
    "hel_helg": True,
    "helgfrekvens": "2/4",
    "ingen_fredagskvall_fore_ledig_helg": True,
    "tolerans_minuter": 60,
    "langd_band_minuter": 120,
    "min_passlangd_minuter": 300,
    # Spridning av morgnar och kvällar över perioden för den som arbetar båda: "av", "mjuk" eller "stark".
    "spridning_kvallar": "mjuk",
    "spridning_tolerans": 1,
    # Jämn bemanning: över- och underbemanning sprids jämnt mellan dag och kväll och över dagarna. "av" eller "mjuk".
    "jamn_bemanning": "mjuk",
}
# Rättvisa mellan personer och jämn bemanning mellan dag och kväll vägs ihop i ett mål (rättvisan dubbelt),
# så att lösaren kan väga dem mot varandra. Nyckeltalen redovisas var för sig (KPI_MAL).
MALORDNING = ["vakanser", "kompetens", "aktiviteter", "natt_vila", "hemteam", "blocklangd", "passlangd", "rattvisa_jamn", "spridning", "onskemal"]
KPI_MAL = ["vakanser", "kompetens", "aktiviteter", "natt_vila", "hemteam", "blocklangd", "passlangd", "rattvisa", "jamn_bemanning", "spridning", "onskemal"]


def malordning(r, mal):
    """Ordningen för målen. Spridningen väger tyngre med inställningen "stark", men aldrig före vakanser."""
    ordning = [m for m in mal if m != "spridning"]
    if r.get("spridning_kvallar") == "stark":
        ordning.insert(1, "spridning")
    elif r.get("spridning_kvallar") != "av":
        bas = "rattvisa_jamn" if "rattvisa_jamn" in ordning else "rattvisa"
        ordning.insert(ordning.index(bas) + 1 if bas in ordning else len(ordning) - 1, "spridning")
    return ordning


# Profiler för tre schemaalternativ. Behovet (vakanser) ligger alltid först: det är högsta mjuka nivå. Direkt efter
# kommer kompetenskraven (docs/kompetens.md): rätt kompetens på plats, men aldrig på bekostnad av behovet.
#   standard     – som tidigare
#   medarbetare  – rättvist: alla så lika som möjligt (kvällar, helger, blandning) och önskemål före block och passlängd
#   verksamhet   – verksamhetens behov först: det som blir över eller saknas sprids jämnt över dagar och dygnsdelar
#   ekonomi      – lägsta uppskattade OB-kostnad (AB 25 § 21, utan helgdagar): extra pass där OB är lägst
PROFILER = {
    "standard": None,
    "medarbetare": ["vakanser", "kompetens", "aktiviteter", "natt_vila", "hemteam", "rattvisa", "spridning", "onskemal", "jamn_bemanning",
                    "blocklangd", "passlangd"],
    "verksamhet": ["vakanser", "kompetens", "aktiviteter", "natt_vila", "hemteam", "jamn_bemanning", "blocklangd", "passlangd", "rattvisa",
                   "spridning", "onskemal"],
    "ekonomi": ["vakanser", "kompetens", "aktiviteter", "natt_vila", "hemteam", "ekonomi", "passlangd", "blocklangd", "rattvisa_jamn",
                "spridning", "onskemal"],
}


def profilordning(prob, fas):
    """Målordningen för profilen. fas: "monster" (fas 1), "langder" (fas 2) eller "hela"."""
    profil = prob.get("profil") or "standard"
    if PROFILER.get(profil) is None:
        if fas == "monster":
            return malordning(prob["r"], ["vakanser", "kompetens", "aktiviteter", "natt_vila", "hemteam", "blocklangd", "rattvisa_jamn", "spridning", "onskemal"])
        if fas == "langder":
            return ["vakanser", "kompetens", "aktiviteter", "passlangd", "onskemal"]
        return malordning(prob["r"], MALORDNING)
    ordning = [m for m in PROFILER[profil] if not (m == "spridning" and prob["r"].get("spridning_kvallar") == "av")]
    if fas == "monster":
        return [m for m in ordning if m != "passlangd"]
    if fas == "langder":
        return [m for m in ordning if m in ("vakanser", "kompetens", "aktiviteter", "ekonomi", "passlangd", "onskemal")]
    return ordning


OB_KR = {"B": 68.10, "B_natt": 78.30, "C": 58.40, "D": 26.40}  # kr per timme, AB 25 § 21, nivå från 2025-04-01


def ob_kategori(wd, minut):
    """OB-kategori för en minut på veckodag wd (0 = måndag), utan helgdagar. Förenkling av schemawebb/statisk/ob.js."""
    m = minut % DYGN
    wd = (wd + minut // DYGN) % 7
    if wd in (5, 6) or (wd == 4 and m >= 17 * 60) or (wd == 0 and m < 7 * 60):
        natt = (m >= 22 * 60 and (wd + 1) % 7 in (5, 6)) or (m < 6 * 60 and wd in (5, 6))
        return "B_natt" if natt else "B"
    if (m >= 22 * 60 and wd <= 3) or (m < 6 * 60 and 1 <= wd <= 4):
        return "C"
    if 19 * 60 <= m < 22 * 60 and wd <= 4:
        return "D"
    return None


def ob_kronor(mall, wd):
    """Uppskattad OB i kronor för ett pass (passmall) som börjar veckodag wd."""
    kr = 0.0
    for t in range(mall["start"], mall["slut"], 15):
        k = ob_kategori(wd, t)
        if k:
            kr += OB_KR[k] / 4
    return kr


class IndataFel(Exception):
    pass


# ---------------------------------------------------------------- hjälpfunktioner

def tid(s):
    h, m = s.strip().split(":")
    return int(h) * 60 + int(m)


def klocka(m):
    m = int(m) % DYGN
    return f"{m // 60:02d}:{m % 60:02d}"


def veckotid(s):
    """'fre 22:00' -> minuter från måndag 00:00."""
    dag, kl = s.split()
    return DAGNAMN.index(dag) * DYGN + tid(kl)


def netto_for(pa_plats, rg, rl):
    """Arbetstid för ett pass med given tid på plats; None om passet inte kan förekomma."""
    if pa_plats <= rg:
        return pa_plats
    if pa_plats - rl <= rg:
        return None  # glappet: rast krävs men passet blir då kortare än gränsen
    return pa_plats - rl


def dagar_for_val(val, veckor, start_iso):
    """Dagindex för ett önskemål: 'dagindex' eller 'dagar' + 'veckor'."""
    if "dagindex" in val:
        return [d % (veckor * 7) for d in val["dagindex"]]
    dagar = val.get("dagar", DAGNAMN)
    vv = val.get("veckor", "alla")
    res = []
    for w in range(veckor):
        nummer = (start_iso + w) if start_iso else (w + 1)
        if vv == "alla" or (vv == "jämna" and nummer % 2 == 0) or (vv == "udda" and nummer % 2 == 1) \
                or (isinstance(vv, list) and (w + 1) in vv):
            res += [w * 7 + DAGNAMN.index(d) for d in dagar]
    return res


def expandera_dagvarden(spec, standard):
    """{'vardag': X, 'helg': Y, 'fre': Z} -> lista med 7 värden (mån..sön)."""
    ut = [standard() for _ in range(7)]
    for nyckel, varde in (spec or {}).items():
        idx = {"vardag": range(5), "helg": range(5, 7), "alla": range(7)}.get(nyckel)
        if idx is None:
            if nyckel not in DAGNAMN:
                raise IndataFel(f"Okänd dag: {nyckel}")
            idx = [DAGNAMN.index(nyckel)]
        for i in idx:
            ut[i] = varde
    return ut


# ---------------------------------------------------------------- förberedelse

def forbered(indata):
    """Validera indata och räkna fram passmallar, mål och dagval. Returnerar ett 'problem'."""
    r = dict(STANDARDREGLER)
    r.update(indata.get("regler", {}))
    # starttider för dagpassen (docs/starttider.md): av dagbehovet börjar så många vid varje tid. Tiderna blir tillåtna
    # starter (som morgon_starter, beslut 24), och motorn ser till att så många börjar då (mjukt, som behovet).
    starttider = sorted((tid(x["tid"]), int(x.get("antal") or 0)) for x in ((indata.get("starttider") or {}).get("morgon") or []))
    if starttider:
        r["morgon_starter"] = sorted(set(r.get("morgon_starter") or []) | {klocka(t) for t, _ in starttider})
    W = indata["veckor"]
    N = W * 7
    cykliskt = indata.get("cykliskt", True)
    heltid_std = indata.get("heltid_minuter_per_vecka", 2220)
    rg, rl, steg = r["rast_grans_minuter"], r["rast_minuter"], r["steg_minuter"]

    # passmallar
    mallar = []
    ms, ks = tid(r["morgon_start"]), tid(r["kvall_slut"])
    kf, kt = tid(r["kant_fran"]), tid(r["kant_till"])
    starter = sorted({tid(t) for t in (r.get("morgon_starter") or [])} | {ms})
    for m_start in starter:
        for slut in range(kf, kt + 1, steg):
            n = netto_for(slut - m_start, rg, rl)
            if n:
                mallar.append({"id": f"M{klocka(m_start)}-{klocka(slut)}", "dygnsdel": "morgon", "start": m_start, "slut": slut,
                               "netto": n, "rast": (slut - m_start) - n, "annan_start": m_start != ms})
    for start in range(kf, kt + 1, steg):
        n = netto_for(ks - start, rg, rl)
        if n:
            mallar.append({"id": f"K{klocka(start)}-{klocka(ks)}", "dygnsdel": "kvall", "start": start, "slut": ks,
                           "netto": n, "rast": (ks - start) - n})
    for np_ in indata.get("nattpass", [{"id": "N", "start": "21:45", "slut": "06:45", "maltidsuppehall": True}]):
        s, e = tid(np_["start"]), tid(np_["slut"])
        if e <= s:
            e += DYGN
        rast = 0 if np_.get("maltidsuppehall", True) else (rl if e - s > rg else 0)
        mallar.append({"id": np_.get("id", "N"), "dygnsdel": "natt", "start": s, "slut": e,
                       "netto": e - s - rast, "rast": rast, "maltidsuppehall": np_.get("maltidsuppehall", True)})
    for em in indata.get("extra_passmallar", []):
        s, e = tid(em["start"]), tid(em["slut"])
        if e <= s:
            e += DYGN
        rast = em.get("rast", rl if e - s > rg else 0)
        mallar.append({"id": em["id"], "dygnsdel": em["dygnsdel"], "start": s, "slut": e,
                       "netto": e - s - rast, "rast": rast})

    # behov
    behov = expandera_dagvarden(indata.get("behov"), dict)
    tidpunkter = expandera_dagvarden(indata.get("tidpunkter"), list)

    # delperioder
    delp = indata.get("delperioder") or [W]
    if sum(delp) != W:
        raise IndataFel(f"Delperioderna ({delp}) summerar inte till {W} veckor.")

    # personal
    personer = []
    sedda = set()
    vaxel = 0  # för perioder där antal pass inte går jämnt ut
    for p in indata["personal"]:
        pid = p["id"]
        if pid in sedda:
            raise IndataFel(f"Personen {pid} finns två gånger.")
        sedda.add(pid)
        delar = p.get("dygnsdelar", ["morgon", "kvall"])
        natt = delar == ["natt"]
        # nattpersonal: heltid 34 h 20 min (AB 25 § 13 mom. 2, kontinuerligt treskift; verksamhetens beslut 2026-11-07)
        heltid = p.get("heltid_minuter_per_vecka") or (indata.get("heltid_natt_minuter_per_vecka", 2060) if natt else heltid_std)
        minuter_vecka = heltid * p["grad"]
        tillatna = [i for i, m in enumerate(mallar) if m["dygnsdel"] in delar]
        if natt:
            nnet = min(mallar[i]["netto"] for i in tillatna)
            mal_pass = p.get("antal_pass") or round(minuter_vecka * W / nnet)
            tol = p.get("tolerans_minuter", max(r["tolerans_minuter"], math.ceil(nnet / 2)))
        else:
            mal_pass = p.get("antal_pass")
            if mal_pass is None:
                # Går 4,75 × veckor inte jämnt ut (till exempel 28,5 på 6 veckor) får dag- och kvällspersonalen
                # växelvis avrundat nedåt och uppåt, i den ordning de står: 28, 29, 28, 29 …
                x = r["pass_per_vecka"] * W
                mal_pass = round(x) if abs(x - round(x)) < 1e-9 else (math.floor(x) if vaxel % 2 == 0 else math.ceil(x))
                vaxel += 1
                # Lokal regel: blir passen kortare än minsta passlängd tas pass bort i stället.
                minsta = r["min_passlangd_minuter"]
                if minsta and minuter_vecka * W / mal_pass < minsta:
                    mal_pass = max(1, math.floor(minuter_vecka * W / minsta))
            tol = p.get("tolerans_minuter", r["tolerans_minuter"])
        pass_lista = mal_pass if isinstance(mal_pass, list) else (
            [mal_pass] if len(delp) == 1 else None)
        if pass_lista is None:
            # fördela totalen på delperioderna proportionellt
            andelar = [mal_pass * v / W for v in delp]
            pass_lista = [math.floor(a) for a in andelar]
            for i in sorted(range(len(delp)), key=lambda i: -(andelar[i] - pass_lista[i]))[:mal_pass - sum(pass_lista)]:
                pass_lista[i] += 1
        if len(pass_lista) != len(delp):
            raise IndataFel(f"{pid}: antal_pass har {len(pass_lista)} värden men det finns {len(delp)} delperioder.")
        total_pass = sum(pass_lista)
        mal_min = round(minuter_vecka * W)
        mal_langd = mal_min / total_pass if total_pass else 0
        if not natt:
            band = r["langd_band_minuter"]
            tillatna = [i for i in tillatna if abs(mallar[i]["netto"] - mal_langd) <= band]
        if not tillatna:
            raise IndataFel(f"{pid}: inga passmallar passar (dygnsdelar {delar}, mållängd {mal_langd:.0f} min).")
        personer.append({
            "id": pid, "grad": p["grad"], "dygnsdelar": delar, "natt": natt, "tillatna": tillatna, "band": set(tillatna),
            "pass_delperioder": pass_lista, "mal_minuter": mal_min, "tolerans": tol, "mal_langd": mal_langd,
            "helgfrekvens": p.get("helgfrekvens", r["helgfrekvens"]), "helggrupp": p.get("helggrupp"),
            "team": p.get("team"), "kompetenser": set(p.get("kompetenser") or []), "jour_ok": p.get("jour") is not False,
        })

    onskemal = []
    for i, o in enumerate(indata.get("onskemal", [])):
        o = dict(o)
        o.setdefault("id", f"O{i + 1}")
        if o["person"] not in sedda:
            raise IndataFel(f"Önskemål {o['id']} gäller okänd person {o['person']}.")
        o["_dagar"] = dagar_for_val(o, W, indata.get("start_iso_vecka"))
        onskemal.append(o)

    # aktiviteter (verksamhetens beslut): den som deltar arbetar hela aktivitetstiden
    aktiviteter = []
    for i, a in enumerate(indata.get("aktiviteter", [])):
        a = dict(a)
        a.setdefault("id", f"A{i + 1}")
        a["_start"], a["_slut"] = tid(a["start"]), tid(a["slut"])
        if a["_slut"] <= a["_start"]:
            raise IndataFel(f"Aktiviteten {a['id']} måste sluta efter att den börjar.")
        a["_dagar"] = sorted(set(dagar_for_val(a, W, indata.get("start_iso_vecka"))))
        okanda = [q for q in a.get("deltagare") or [] if q not in sedda]
        if okanda:
            raise IndataFel(f"Aktiviteten {a['id']} har okända deltagare: {', '.join(okanda)}.")
        # Den som deltar arbetar hela aktivitetstiden, så passet läggs om för att täcka den (beslut 15).
        # Har personen inget pass i sitt vanliga längdband som täcker aktiviteten (till exempel kortare pass
        # vid lägre sysselsättning) får hon det kortaste pass som täcker, men bara på aktivitetens dagar.
        # Arbetstiden i perioden ligger kvar inom toleransen, så andra pass blir kortare.
        valda = a.get("deltagare")
        for p in personer:
            if p["natt"] or (valda and p["id"] not in valda):
                continue
            if any(tacker(mallar[s], a["_start"], a["_slut"]) == 0 for s in p["tillatna"]):
                continue
            kort = {}
            for i, mall in enumerate(mallar):
                if mall["dygnsdel"] in p["dygnsdelar"] and tacker(mall, a["_start"], a["_slut"]) == 0:
                    k = (mall["dygnsdel"], mall["start"])
                    if k not in kort or mall["netto"] < mallar[kort[k]]["netto"]:
                        kort[k] = i
            for i in kort.values():
                if i not in p["tillatna"]:
                    p["tillatna"].append(i)
                p.setdefault("aktivitetspass", {}).setdefault(i, set()).update(a["_dagar"])
        # deltagargruppen: angivna personer, annars alla som har ett pass som kan täcka aktivitetstiden
        def kan(p):
            return any(tacker(mallar[s], a["_start"], a["_slut"]) is not None for s in p["tillatna"])
        a["_grupp"] = [pi for pi, p in enumerate(personer) if (p["id"] in valda if valda else kan(p))]
        # dag- och kvällspersonal som inte kommer med för att inget av deras pass täcker aktivitetstiden
        # (till exempel kortare pass vid lägre sysselsättning); visas i resultatet så att det inte sker tyst
        a["_utanfor"] = [] if valda else [p["id"] for p in personer if not p["natt"] and not kan(p)]
        G, T = len(a["_grupp"]), len(a["_dagar"])
        if a.get("antal"):
            antal = a["antal"]
        elif a.get("andel"):
            antal = math.ceil(a["andel"] * G - 1e-9)
        elif a.get("varje_person") and T:
            antal = math.ceil(G * a["varje_person"] / T)
        else:
            antal = G
        a["_antal"] = min(antal, G)
        a["_onskat"] = antal
        # behov per tillfälle. Med varje_person fördelas G × varje_person platser så jämnt som möjligt:
        # de första tillfällena får en plats extra när det inte går jämnt ut (13 personer, 2 tillfällen: 7 och 6).
        if a.get("varje_person") and T and not a.get("antal") and not a.get("andel"):
            tot = G * a["varje_person"]
            a["_mal"] = {d: tot // T + (1 if i < tot % T else 0) for i, d in enumerate(a["_dagar"])}
        else:
            a["_mal"] = {d: a["_antal"] for d in a["_dagar"]}
        # det som visas som behov per tillfälle (för antal och andel kan det vara fler än gruppen)
        a["_behov"] = dict(a["_mal"]) if a.get("varje_person") and not a.get("antal") and not a.get("andel") else {d: antal for d in a["_dagar"]}
        if a.get("varje_person"):
            a["_per_person"] = (a["varje_person"], a["varje_person"])
        else:
            snitt = a["_antal"] * T / G if G else 0
            a["_per_person"] = (math.floor(snitt + 1e-9), math.ceil(snitt - 1e-9))
        a["krav"] = bool(a.get("krav", False))
        a["fran_golvet"] = a.get("fran_golvet", True)
        aktiviteter.append(a)

    # team med eget behov (docs/team.md): personalen är gemensam men har ett hemteam
    team = [{"id": t["id"], "namn": t.get("namn") or t["id"], "behov": expandera_dagvarden(t.get("behov"), dict)}
            for t in indata.get("team") or []]
    tids = {t["id"] for t in team}
    for p in personer:
        if p["team"] and p["team"] not in tids:
            raise IndataFel(f"{p['id']} har teamet {p['team']}, som inte finns.")

    # kompetenskrav (docs/kompetens.md): minst så många med kompetensen i tjänst per dag och dygnsdel
    knamn = {k["id"]: k.get("namn") or k["id"] for k in indata.get("kompetenser") or []}
    kompetenskrav = [{"id": k.get("id") or f"K{i + 1}", "kompetens": k["kompetens"], "namn": knamn.get(k["kompetens"], k["kompetens"]),
                      "behov": expandera_dagvarden(k.get("behov"), dict)}
                     for i, k in enumerate(indata.get("kompetenskrav") or [])]

    # jour efter kvällspasset (AB 25 § 13 mom. 5, Bilaga J): börjar när kvällspasset slutar, behov per natt
    jour = None
    if indata.get("jour"):
        js, je = ks, tid(indata["jour"]["slut"])
        if je <= js:
            je += DYGN
        jour = {"start": js, "slut": je, "len": je - js, "behov": [int(v or 0) for v in expandera_dagvarden(indata["jour"].get("behov"), int)]}

    return {"r": r, "W": W, "N": N, "cykliskt": cykliskt, "mallar": mallar, "behov": behov, "team": team, "starttider": starttider, "jour": jour,
            "kompetenskrav": kompetenskrav, "kompetensnamn": knamn,
            "tidpunkter": tidpunkter, "delperioder": delp, "personer": personer, "onskemal": onskemal,
            "aktiviteter": aktiviteter, "enhet": indata.get("enhet", ""),
            "profil": (indata.get("losare") or {}).get("profil") or "standard"}


def tacker(mall, start, slut):
    """Täcker passmallen aktiviteten start–slut (minuter efter midnatt)? 0 = samma dag,
    1 = passet började dagen före (nattpass), None = nej."""
    if mall["start"] <= start and slut <= mall["slut"]:
        return 0
    if mall["start"] <= start + DYGN and slut + DYGN <= mall["slut"]:
        return 1
    return None


# ---------------------------------------------------------------- modell

def bygg_modell(prob, antaganden=False, cykliskt=None, utan_tid=False):
    """Bygg CP-SAT-modellen. Med antaganden=True får varje hård regelgrupp en egen
    literal (för explain_infeasibility). Returnerar (modell, variabler, mål, grupper)."""
    r, W, N, M = prob["r"], prob["W"], prob["N"], prob["mallar"]
    cyk = prob["cykliskt"] if cykliskt is None else cykliskt
    m = cp_model.CpModel()
    grupper = {}  # namn -> literal

    def lit(namn):
        if not antaganden:
            return []
        if namn not in grupper:
            grupper[namn] = m.new_bool_var(namn)
        return [grupper[namn]]

    def nasta(d, k=1):
        return (d + k) % N if cyk else (d + k if d + k < N else None)

    x, work = {}, {}
    natt_vila = []  # brott mot vilan mellan nattblock (mjukt)
    for pi, p in enumerate(prob["personer"]):
        for d in range(N):
            vs = []
            for s in p["tillatna"]:
                x[pi, d, s] = m.new_bool_var(f"x_{p['id']}_{d}_{s}")
                vs.append(x[pi, d, s])
            work[pi, d] = m.new_bool_var(f"w_{p['id']}_{d}")
            m.add(sum(vs) == work[pi, d])  # högst ett pass per dag
        # längre pass som bara finns för att täcka en aktivitet får bara användas på aktivitetens dagar
        for s, dagar in p.get("aktivitetspass", {}).items():
            if s in p["band"]:
                continue
            for d in range(N):
                if d not in dagar and (pi, d, s) in x:
                    m.add(x[pi, d, s] == 0)

    # --- jour i direkt anslutning efter kvällspasset (AB 25 § 13 mom. 5, Bilaga J; docs/regelverk.md). Undantaget från
    # dygnsvilan gäller bara kombinationen arbete + jour: sammanlagt högst 20 timmar, och vilan efteråt minst lika lång.
    # Dagen efter jouren är därför ledig, och nästa pass börjar tidigast när vilan räcker.
    J, j = prob.get("jour"), {}
    if J:
        for pi, p in enumerate(prob["personer"]):
            if not p.get("jour_ok") or p["natt"]:
                continue
            kv = [s for s in p["tillatna"] if M[s]["dygnsdel"] == "kvall" and (M[s]["slut"] - M[s]["start"]) + J["len"] <= JOUR_MAX]
            if not kv:
                continue
            for d in range(N):
                d1, d2 = nasta(d), nasta(d, 2)
                if d1 is None or not J["behov"][d % 7]:
                    continue
                v = m.new_bool_var(f"j_{p['id']}_{d}")
                m.add(v <= sum(x[pi, d, s] for s in kv))
                m.add(work[pi, d1] == 0).only_enforce_if(v)
                if d2 is not None:
                    tidiga = [x[pi, d2, t] for t in p["tillatna"] if 2 * DYGN + M[t]["start"] - J["slut"] < JOUR_MAX]
                    if tidiga:
                        m.add(sum(tidiga) == 0).only_enforce_if(v)
                j[pi, d] = v
        for d in range(N):
            m.add(sum(v for (pi, dd), v in j.items() if dd == d) <= J["behov"][d % 7])

    hs = veckotid(r["helg_start"]) - 4 * DYGN   # minuter efter fredag 00:00
    he = veckotid(r["helg_slut"])                # minuter efter måndag 00:00

    for pi, p in enumerate(prob["personer"]):
        pid = p["id"]
        T = p["tillatna"]
        # --- dygnsvila mellan pass (avtal): ett pass får inte följas av ett pass som börjar för tidigt
        L = lit(f"DYGNSVILA|{pid}")
        for d in range(N):
            d2 = nasta(d)
            if d2 is None:
                continue
            for slut in sorted({M[s]["slut"] for s in T}):
                tidiga = [x[pi, d2, t] for t in T if M[t]["start"] + DYGN - slut < r["dygnsvila_minuter"]]
                if tidiga:
                    sena = [x[pi, d, s] for s in T if M[s]["slut"] >= slut]
                    m.add(sum(sena) + sum(tidiga) <= 1).only_enforce_if(L)
        # --- veckovila per kalendervecka (avtal; tillräckligt villkor, exakt kontroll i validate)
        L = lit(f"VECKOVILA|{pid}")
        grans = 2 * DYGN - r["veckovila_minuter"]
        for w in range(W):
            alt = []
            dagar = list(range(w * 7, w * 7 + 7))
            for k in range(6):  # två lediga dagar i följd
                a = m.new_bool_var("")
                m.add(work[pi, dagar[k]] == 0).only_enforce_if(a)
                m.add(work[pi, dagar[k + 1]] == 0).only_enforce_if(a)
                alt.append(a)
            for k in range(1, 6):  # en ledig dag med tillräckligt tidigt slut före och sen start efter
                b = m.new_bool_var("")
                m.add(work[pi, dagar[k]] == 0).only_enforce_if(b)
                if (pi, dagar[k - 1]) in j:  # jour natten före tar vilan från den lediga dagen
                    m.add(j[pi, dagar[k - 1]] == 0).only_enforce_if(b)
                for slut in sorted({M[s]["slut"] for s in T}):
                    tidiga = [x[pi, dagar[k + 1], t] for t in T if slut - M[t]["start"] > grans]
                    if tidiga:
                        sena = [x[pi, dagar[k - 1], s] for s in T if M[s]["slut"] >= slut]
                        m.add(sum(sena) + sum(tidiga) <= 1).only_enforce_if(b)
                alt.append(b)
            m.add_bool_or(alt).only_enforce_if(L)
        # --- block (lokal regel)
        L = lit(f"BLOCK_MIN|{pid}")
        for d in range(N):
            if not cyk and d in (0, N - 1):
                continue
            m.add(work[pi, d] <= work[pi, (d - 1) % N] + work[pi, (d + 1) % N]).only_enforce_if(L)
        if p["natt"] and r.get("natt_max_i_rad"):
            L = lit(f"NATT_I_RAD|{pid}")
            nm = r["natt_max_i_rad"]
            for d in range(N if cyk else N - nm):
                m.add(sum(work[pi, (d + k) % N] for k in range(nm + 1)) <= nm).only_enforce_if(L)
        if p["natt"] and r.get("natt_vila_mellan_block_minuter"):
            # mellan två block (arbete dag d, ledigt dag d+1) ska nästa pass börja tidigast efter vilan (mjukt mål)
            krav = r["natt_vila_mellan_block_minuter"]
            sist = max(M[s]["slut"] for s in T)
            for d in range(N):
                for k in range(2, 8):
                    d2 = (d + k) % N if cyk else d + k
                    if not cyk and d + k >= N:
                        break
                    for t in T:
                        if k * DYGN + M[t]["start"] - sist < krav:
                            b = m.new_bool_var("")
                            m.add(work[pi, d] + (1 - work[pi, (d + 1) % N]) + x[pi, d2, t] <= 2 + b)
                            natt_vila.append(b)
        L = lit(f"BLOCK_MAX|{pid}")
        bm = r["block_max"]
        for d in range(N if cyk else N - bm):
            fonster = [work[pi, (d + k) % N] for k in range(bm + 1)]
            m.add(sum(fonster) <= bm).only_enforce_if(L)
        # --- helger (lokal regel)
        L = lit(f"HELG|{pid}")
        jobbar = []
        for w in range(W):
            fre, lor, son = w * 7 + 4, w * 7 + 5, w * 7 + 6
            man = nasta(w * 7 + 6)
            hw = m.new_bool_var(f"helg_{pid}_{w}")
            jobbar.append(hw)
            # ledig helg: inget pass som går in i helgfönstret
            in_fre = [x[pi, fre, s] for s in T if M[s]["slut"] > hs
                      or (r["ingen_fredagskvall_fore_ledig_helg"] and M[s]["dygnsdel"] in ("kvall", "natt"))]
            in_man = [x[pi, man, s] for s in T if man is not None and M[s]["start"] < he]
            for v in in_fre + in_man + [work[pi, lor], work[pi, son]]:
                m.add(v == 0).only_enforce_if([hw.Not()] + L)
            if r["hel_helg"]:
                m.add(work[pi, lor] == 1).only_enforce_if([hw] + L)
                m.add(work[pi, son] == 1).only_enforce_if([hw] + L)
            else:
                m.add(work[pi, lor] + work[pi, son] >= 1).only_enforce_if([hw] + L)
        f = p["helgfrekvens"]
        if f == "2/4":
            if cyk and W % 2:
                raise IndataFel(f"Varannan helg kräver ett jämnt antal veckor i ett cykliskt schema ({W}).")
            p["_grupp"] = m.new_bool_var(f"grupp_{pid}")  # sann = grupp A (vecka 1, 3, 5 …)
            if p.get("helggrupp") in ("A", "B"):
                m.add(p["_grupp"] == (1 if p["helggrupp"] == "A" else 0))
            for w, hw in enumerate(jobbar):
                if w % 2 == 0:
                    m.add(hw == p["_grupp"]).only_enforce_if(L)
                else:
                    m.add(hw == p["_grupp"].Not()).only_enforce_if(L)
        elif f in ("alla", "4/4"):
            for hw in jobbar:
                m.add(hw == 1).only_enforce_if(L)
        elif f in ("ingen", "0/4"):
            for hw in jobbar:
                m.add(hw == 0).only_enforce_if(L)
        else:
            t, n = map(int, f.split("/"))
            antal = W * t / n
            if abs(antal - round(antal)) > 1e-9:
                raise IndataFel(f"{pid}: helgfrekvens {f} ger {antal:g} helger på {W} veckor.")
            m.add(sum(jobbar) == round(antal)).only_enforce_if(L)
        p["_helg"] = jobbar
        # --- antal pass per delperiod (kontrakt)
        L = lit(f"ANTAL_PASS|{pid}")
        start = 0
        for v, antal in zip(prob["delperioder"], p["pass_delperioder"]):
            dagar = range(start * 7, (start + v) * 7)
            uttr = sum(work[pi, d] for d in dagar)
            m.add(uttr == antal).only_enforce_if(L)
            start += v
        # --- kontrakterad tid (kontrakt)
        if utan_tid:
            p["_avv"] = None
            continue
        L = lit(f"TID|{pid}")
        tot = sum(x[pi, d, s] * M[s]["netto"] for d in range(N) for s in T)
        avv = m.new_int_var(0, 100000, f"tidavvikelse_{pid}")
        m.add(avv >= tot - p["mal_minuter"])
        m.add(avv >= p["mal_minuter"] - tot)
        p["_avv"] = avv
        for c in (tot >= p["mal_minuter"] - p["tolerans"], tot <= p["mal_minuter"] + p["tolerans"]):
            m.add(c).only_enforce_if(L)

    # balanserade helggrupper (bryter symmetri)
    for natt in (False, True):
        fria = [p for p in prob["personer"] if p["natt"] == natt and p["helgfrekvens"] == "2/4"]
        if len(fria) >= 2:
            n = len(fria)
            m.add(sum(p["_grupp"] for p in fria) >= n // 2)
            m.add(sum(p["_grupp"] for p in fria) <= (n + 1) // 2)
            # lås en person utan önskemål i grupp A, så att lösaren inte behöver pröva spegelvända lösningar
            med_onskemal = {o["person"] for o in prob["onskemal"]}
            utan = [p for p in fria if p["id"] not in med_onskemal]
            if utan and not any(p.get("helggrupp") for p in fria):
                m.add(utan[0]["_grupp"] == 1)

    # --- önskemål
    pidx = {p["id"]: i for i, p in enumerate(prob["personer"])}
    onsk_straff = []
    for o in prob["onskemal"]:
        pi = pidx[o["person"]]
        T = prob["personer"][pi]["tillatna"]
        krav = o.get("krav", False)
        L = lit(f"KRAV|{o['id']}") if krav else []
        vikt = int(o.get("vikt", 1))
        for d in o["_dagar"]:
            typ = o["typ"]
            if typ == "ledig":
                brott = [work[pi, d]]
            elif typ == "arbetar":
                brott = [work[pi, d].Not()]
            elif typ == "tidigast_start":
                brott = [x[pi, d, s] for s in T if M[s]["start"] < tid(o["varde"])]
            elif typ == "senast_slut":
                brott = [x[pi, d, s] for s in T if M[s]["slut"] > tid(o["varde"])]
            elif typ == "endast_dygnsdel":
                ok = o["varde"] if isinstance(o["varde"], list) else [o["varde"]]
                brott = [x[pi, d, s] for s in T if M[s]["dygnsdel"] not in ok]
            else:
                raise IndataFel(f"Okänd önskemålstyp: {typ}")
            for b in brott:
                if krav:
                    m.add(b == 0).only_enforce_if(L)
                else:
                    onsk_straff.append(vikt * b)

    # --- aktiviteter (verksamhet): den som deltar har ett pass som täcker hela aktivitetstiden
    y = {}  # (aktivitet, dag, person) -> deltar
    akt_brist, akt_jamn = [], []
    for ai, a in enumerate(prob.get("aktiviteter", [])):
        L = lit(f"AKTIVITET|{a['id']}") if a["krav"] else []
        G = len(a["_grupp"])
        for d in a["_dagar"]:
            delt = []
            for pi in a["_grupp"]:
                tack = []
                for s in prob["personer"][pi]["tillatna"]:
                    k = tacker(M[s], a["_start"], a["_slut"])
                    dd = d if k == 0 else (((d - 1) % N if cyk else d - 1) if k == 1 else None)
                    if dd is not None and dd >= 0:
                        tack.append(x[pi, dd, s])
                if not tack:
                    continue
                v = m.new_bool_var(f"akt_{a['id']}_{d}_{pi}")
                m.add(v <= sum(tack))
                y[ai, d, pi] = v
                delt.append(v)
            brist = m.new_int_var(0, a["_mal"][d], "")
            m.add(sum(delt) + brist == a["_mal"][d])
            if a["krav"]:
                m.add(brist == 0).only_enforce_if(L)
            akt_brist.append(brist)
        # rättvis fördelning: alla i gruppen deltar ungefär lika många gånger
        lo, hi = a["_per_person"]
        for pi in a["_grupp"]:
            antal = sum(y[ai, d, pi] for d in a["_dagar"] if (ai, d, pi) in y)
            over, under = m.new_int_var(0, N, ""), m.new_int_var(0, N, "")
            m.add(over >= antal - hi)
            m.add(under >= lo - antal)
            akt_jamn += [over, under]

    # --- mål
    mal = {}
    vak = []
    for d in range(N):
        wd = d % 7
        for del_, antal in prob["behov"][wd].items():
            if not antal:
                continue
            tack = [x[pi, d, s] for pi, p in enumerate(prob["personer"]) for s in p["tillatna"]
                    if M[s]["dygnsdel"] == del_]
            v = m.new_int_var(0, antal, f"vak_{d}_{del_}")
            m.add(sum(tack) + v >= antal)
            vak.append((v, d, del_, None))
        # jour: så många jourer per natt (behov, samma nivå som vakanserna)
        if J and J["behov"][wd]:
            v = m.new_int_var(0, J["behov"][wd], f"vakj_{d}")
            m.add(sum(vv for (pi, dd), vv in j.items() if dd == d) + v >= J["behov"][wd])
            vak.append((v, d, "jour", None))
        # starttider: så många av dagpassen börjar vid varje tid, i tidsordning och högst dagens dagbehov
        kvar = prob["behov"][wd].get("morgon", 0) or 0
        for t, antal in prob.get("starttider") or []:
            a = min(antal, kvar)
            kvar -= a
            if a <= 0:
                continue
            tack = [x[pi, d, s] for pi, p in enumerate(prob["personer"]) for s in p["tillatna"]
                    if M[s]["dygnsdel"] == "morgon" and M[s]["start"] == t and (pi, d, s) in x]
            v = m.new_int_var(0, a, f"vaks_{d}_{t}")
            m.add(sum(tack) + v >= a)
            vak.append((v, d, None, "start " + klocka(t)))
        for tp in prob["tidpunkter"][wd]:
            t = tid(tp["tid"])
            tack = []
            for pi, p in enumerate(prob["personer"]):
                for s in p["tillatna"]:
                    if M[s]["start"] <= t < M[s]["slut"]:
                        tack.append(x[pi, d, s])
                    dp = (d - 1) % N if cyk else d - 1
                    if dp >= 0 and M[s]["start"] <= t + DYGN < M[s]["slut"]:
                        tack.append(x[pi, dp, s])
            # den som är på en aktivitet med fran_golvet räknas inte som i tjänst på golvet
            borta = [v for (ai, dd, pi), v in y.items() if dd == d and prob["aktiviteter"][ai]["fran_golvet"]
                     and prob["aktiviteter"][ai]["_start"] <= t < prob["aktiviteter"][ai]["_slut"]]
            v = m.new_int_var(0, tp["antal"], f"vakt_{d}_{tp['tid']}")
            m.add(sum(tack) - sum(borta) + v >= tp["antal"])
            vak.append((v, d, None, tp["tid"]))
    # minsta bemanning på golvet under en aktivitet (behov, samma nivå som vakanser): när en del av gruppen är
    # på till exempel APT förlängs andras pass så att minst så många är kvar i tjänst varje kvart
    for ai, a in enumerate(prob.get("aktiviteter", [])):
        minst = a.get("minst_pa_golvet") or 0
        if not minst:
            continue
        for d in a["_dagar"]:
            for t in range(a["_start"], a["_slut"], 15):
                tack = []
                for pi, p in enumerate(prob["personer"]):
                    for s in p["tillatna"]:
                        if M[s]["start"] <= t < M[s]["slut"]:
                            tack.append(x[pi, d, s])
                        dp = (d - 1) % N if cyk else d - 1
                        if dp >= 0 and M[s]["start"] <= t + DYGN < M[s]["slut"]:
                            tack.append(x[pi, dp, s])
                borta = [v for (aj, dd, pi), v in y.items() if dd == d and prob["aktiviteter"][aj]["fran_golvet"]
                         and prob["aktiviteter"][aj]["_start"] <= t < prob["aktiviteter"][aj]["_slut"]]
                v = m.new_int_var(0, minst, f"vakg_{d}_{t}")
                m.add(sum(tack) - sum(borta) + v >= minst)
                vak.append((v, d, None, klocka(t)))
    mal["vakanser"] = sum(v for v, *_ in vak)
    # hemteam (mjukt, direkt efter vakanserna och nattvilan): varje team täcks helst av sin egen personal. Det som
    # fattas räknas som pass där någon måste lånas in från ett annat team.
    hem_brist = []
    for t in prob.get("team") or []:
        for d in range(N):
            for del_, behov_t in t["behov"][d % 7].items():
                if not behov_t:
                    continue
                egna = [x[pi, d, s] for pi, p in enumerate(prob["personer"]) if p.get("team") == t["id"]
                        for s in p["tillatna"] if M[s]["dygnsdel"] == del_ and (pi, d, s) in x]
                b = m.new_int_var(0, behov_t, f"hem_{t['id']}_{d}_{del_}")
                m.add(sum(egna) + b >= behov_t)
                hem_brist.append(b)
    mal["hemteam"] = sum(hem_brist) if hem_brist else 0
    # kompetens (mjukt, direkt efter vakanserna): minst så många med kompetensen bland dem som arbetar dygnsdelen.
    # Inga extra pass för kompetensens skull: det som fattas syns som kompetensvakanser (användarens beslut 2026-11-09).
    komp_brist = []
    for k in prob.get("kompetenskrav") or []:
        for d in range(N):
            for del_, antal in k["behov"][d % 7].items():
                if not antal:
                    continue
                har = [x[pi, d, s] for pi, p in enumerate(prob["personer"]) if k["kompetens"] in p.get("kompetenser", ())
                       for s in p["tillatna"] if M[s]["dygnsdel"] == del_ and (pi, d, s) in x]
                b = m.new_int_var(0, antal, f"komp_{k['id']}_{d}_{del_}")
                m.add(sum(har) + b >= antal)
                komp_brist.append(b)
    mal["kompetens"] = sum(komp_brist) if komp_brist else 0
    # aktiviteter: saknade deltagare väger alltid tyngre än ojämn fördelning mellan personerna
    vikt = 1 + len(akt_jamn) * N
    mal["aktiviteter"] = (vikt * sum(akt_brist) + sum(akt_jamn)) if akt_brist else 0

    # jämn bemanning (princip, mjuk): det som blir över eller saknas på dag- och kvällspassen sprids jämnt.
    # Ingen enskild dag och dygnsdel ska få mycket mer än andra, och dag och kväll ska få lika mycket varje vecka.
    jamn = []
    if r.get("jamn_bemanning", "mjuk") != "av":
        vak_slot = {(d, del_): v for v, d, del_, t in vak if del_ in ("morgon", "kvall")}
        over_slot = {}
        for d in range(N):
            for del_ in ("morgon", "kvall"):
                antal = prob["behov"][d % 7].get(del_, 0)
                tack = [x[pi, d, s] for pi, p in enumerate(prob["personer"]) for s in p["tillatna"] if M[s]["dygnsdel"] == del_]
                if not tack:
                    continue
                # överskottet exakt: i tjänst − behov + vakans (vakansen är redan exakt när vakanserna är låsta)
                o = m.new_int_var(0, len(tack), "")
                m.add(o == sum(tack) - antal + vak_slot.get((d, del_), 0))
                over_slot[d, del_] = o
                # växande straff (styckvis kvadratiskt): +6 på ett pass och +2 på ett annat kostar mer än +4 och +4
                for steg in range(1, min(len(tack), 8)):
                    extra = m.new_int_var(0, len(tack), "")
                    m.add(extra >= o - steg)
                    jamn.append(2 * extra)
        for slot in (over_slot, vak_slot):
            # per vecka och för hela perioden: dag och kväll ska få lika mycket
            for dagar in [range(w * 7, w * 7 + 7) for w in range(N // 7)] + [range(N)]:
                mo = sum(slot.get((d, "morgon"), 0) for d in dagar)
                kv = sum(slot.get((d, "kvall"), 0) for d in dagar)
                skillnad = m.new_int_var(0, 1000, "")
                m.add(skillnad >= mo - kv)
                m.add(skillnad >= kv - mo)
                jamn.append(2 * skillnad if len(dagar) == N else skillnad)
    mal["jamn_bemanning"] = sum(jamn) if jamn else 0

    rek = r["block_rekommenderat"]
    over = []
    for pi in range(len(prob["personer"])):
        for d in range(N if cyk else N - rek):
            fonster = [work[pi, (d + k) % N] for k in range(rek + 1)]
            b = m.new_bool_var("")
            m.add(sum(fonster) <= rek).only_enforce_if(b.Not())
            over.append(b)
    # högst kvall_max_i_rad kvällar i rad: mjukt (räknas med blocklängden) eller hårt (lokal regel)
    km = r.get("kvall_max_i_rad") or 0
    hard_kv = r.get("kvall_i_rad_typ") == "hard"
    if km:
        for pi, p in enumerate(prob["personer"]):
            kv = [s for s in p["tillatna"] if M[s]["dygnsdel"] == "kvall"]
            if not kv:
                continue
            L = lit(f"KVALL_I_RAD|{p['id']}") if hard_kv else None
            for d in range(N if cyk else N - km):
                summa = sum(x[pi, (d + k) % N, s] for k in range(km + 1) for s in kv)
                if hard_kv:
                    m.add(summa <= km).only_enforce_if(L)
                else:
                    b = m.new_bool_var("")
                    m.add(summa <= km + b)
                    over.append(b)
    mal["blocklangd"] = sum(over)

    # passlängd: avvikelse från mållängd per pass plus avvikelse från kontrakterad tid, i minuter
    mal["passlangd"] = sum(x[pi, d, s] * int(round(abs(M[s]["netto"] - p["mal_langd"])))
                           for pi, p in enumerate(prob["personer"]) for d in range(N) for s in p["tillatna"]) \
        + sum(p["_avv"] for p in prob["personer"] if p.get("_avv") is not None) \
        + sum(x[pi, d, s] * 30 for pi, p in enumerate(prob["personer"]) for d in range(N) for s in p["tillatna"]
              if M[s].get("annan_start"))  # annan starttid än morgon_start bara när täckningen kräver det

    rattvisa = []
    for del_ in ("kvall", "morgon"):
        grupp = [pi for pi, p in enumerate(prob["personer"]) if "morgon" in p["dygnsdelar"] and "kvall" in p["dygnsdelar"]]
        if len(grupp) >= 2:
            antal = []
            for pi in grupp:
                a = m.new_int_var(0, N, "")
                m.add(a == sum(x[pi, d, s] for d in range(N) for s in prob["personer"][pi]["tillatna"]
                               if M[s]["dygnsdel"] == del_))
                antal.append(a)
            hi, lo = m.new_int_var(0, N, ""), m.new_int_var(0, N, "")
            m.add_max_equality(hi, antal)
            m.add_min_equality(lo, antal)
            rattvisa.append(hi - lo)
    mal["rattvisa"] = sum(rattvisa) if rattvisa else 0
    mal["rattvisa_jamn"] = 2 * mal["rattvisa"] + mal["jamn_bemanning"]

    # spridning: den som arbetar både morgon och kväll ska ha båda i varje vecka (och, med toleransen 0,
    # högst en kvälls skillnad mot halva veckans pass). Målet räknar veckor som bara har den ena sorten.
    spridning = []
    W = prob["W"]
    if r.get("spridning_kvallar", "mjuk") != "av" and W >= 2:
        strikt = float(r.get("spridning_tolerans", 1)) < 1
        for pi, p in enumerate(prob["personer"]):
            if not ("morgon" in p["dygnsdelar"] and "kvall" in p["dygnsdelar"]):
                continue
            for w in range(W):
                dagar = range(w * 7, w * 7 + 7)
                kv = sum(x[pi, d, s] for d in dagar for s in p["tillatna"] if M[s]["dygnsdel"] == "kvall")
                mo = sum(x[pi, d, s] for d in dagar for s in p["tillatna"] if M[s]["dygnsdel"] == "morgon")
                for antal in (kv, mo):
                    saknas = m.new_bool_var("")
                    m.add(antal + saknas >= 1)
                    spridning.append(saknas)
                if strikt:
                    avv = m.new_int_var(0, 7, "")
                    m.add(avv >= kv - mo - 1)
                    m.add(avv >= mo - kv - 1)
                    spridning.append(avv)
    mal["spridning"] = sum(spridning) if spridning else 0
    mal["onskemal"] = sum(onsk_straff) if onsk_straff else 0
    mal["natt_vila"] = sum(natt_vila) if natt_vila else 0
    # ekonomi: uppskattad OB-kostnad i kronor (bara med profilen ekonomi, för att inte göra modellen tyngre i onödan)
    if prob.get("profil") == "ekonomi":
        mal["ekonomi"] = sum(x[pi, d, s] * int(round(ob_kronor(M[s], d % 7)))
                             for pi, p in enumerate(prob["personer"]) for d in range(N) for s in p["tillatna"])
    else:
        mal["ekonomi"] = 0

    var = {"x": x, "work": work, "vak": vak, "y": y, "akt_brist": akt_brist, "j": j}
    return m, var, mal, grupper


# ---------------------------------------------------------------- lösning

def monsterproblem(prob):
    """Förenklad kopia för fas 1: per person och dygnsdel bara kortaste, längsta och
    mållängdens passmall. Med fasta morgonstarter och kvällsslut avgör dygnsdelen nästan
    helt vilken vila som går, så ett mönster härifrån kan fyllas med rätt längder i fas 2."""
    import copy
    enkel = copy.deepcopy(prob)
    M = prob["mallar"]
    for p in enkel["personer"]:
        val = set()
        for del_ in p["dygnsdelar"]:
            kand = [s for s in p["tillatna"] if M[s]["dygnsdel"] == del_ and s in p.get("band", p["tillatna"])]
            if kand:
                val.add(min(kand, key=lambda s: M[s]["netto"]))
                val.add(max(kand, key=lambda s: M[s]["netto"]))
                val.add(min(kand, key=lambda s: abs(M[s]["netto"] - p["mal_langd"])))
                if del_ == "morgon":  # en passmall per starttid, så att mönstret kan fyllas med rätt starter
                    for t, _ in enkel.get("starttider") or []:
                        egna = [s for s in kand if M[s]["start"] == t]
                        if egna:
                            val.add(min(egna, key=lambda s: abs(M[s]["netto"] - p["mal_langd"])))
        val.update(p.get("aktivitetspass", {}))  # pass som täcker en aktivitet (bara på dess dagar)
        p["tillatna"] = sorted(val)
    return enkel


def lexikografiskt(m, var, mal, ordning, tid_s, arbetare, tyst, etikett=""):
    """Optimera målen i tur och ordning och lås varje nivå innan nästa."""
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = tid_s
    solver.parameters.num_workers = arbetare
    steg, senast = [], None
    for namn in ordning:
        uttr = mal[namn]
        if isinstance(uttr, int):
            continue
        m.clear_objective()
        m.minimize(uttr)
        status = solver.solve(m)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if senast is None:
                return None, status
            break
        varde = int(round(solver.objective_value))
        steg.append({"fas": etikett.rstrip(" –") or "hela", "mal": namn, "varde": varde, "status": solver.status_name(status),
                     "grans": int(round(solver.best_objective_bound))})
        if not tyst:
            print(f"  {etikett}{namn}: {varde} ({solver.status_name(status).lower()})", file=sys.stderr)
        m.add(uttr <= varde)
        m.clear_hints()
        for v in list(var["x"].values()) + list(var["work"].values()):
            m.add_hint(v, solver.value(v))
        senast = {k: solver.value(v) for k, v in var["x"].items()}
    return (steg, senast), status


def los(prob, tid_per_steg=20, arbetare=1, tyst=False):
    M, N = prob["mallar"], prob["N"]
    # Fas 1: arbetsmönster (vilka dagar och vilken dygnsdel) med alla hårda regler utom exakt arbetstid.
    enkel = monsterproblem(prob)
    m1, var1, mal1, _ = bygg_modell(enkel, utan_tid=True)
    r1, status1 = lexikografiskt(m1, var1, mal1, profilordning(prob, "monster"),
                                 tid_per_steg, arbetare, tyst, "mönster – ")
    if r1 is None and status1 == cp_model.INFEASIBLE:
        # Mönstermodellen har färre passlängder. Kontrollera med alla längder (utan exakt arbetstid)
        # innan schemat förklaras olösbart.
        mk, _, _, _ = bygg_modell(prob, utan_tid=True)
        kontroll = cp_model.CpSolver()
        kontroll.parameters.max_time_in_seconds = tid_per_steg
        kontroll.parameters.num_workers = arbetare
        if kontroll.solve(mk) == cp_model.INFEASIBLE:
            return {"status": "INFEASIBLE", "steg": [], "orsak":
                    "De hårda reglerna kan inte uppfyllas samtidigt. Kör schemamotor.explain "
                    "för att se vilka regler som krockar."}
    m2, var2, mal2, _ = bygg_modell(prob)
    if r1:
        monster = {(pi, d): M[s]["dygnsdel"] for (pi, d, s), v in r1[1].items() if v}
        # Fas 2: lås mönstret och välj passlängder som ger rätt arbetstid.
        for pi, p in enumerate(prob["personer"]):
            for d in range(N):
                del_ = monster.get((pi, d))
                m2.add(var2["work"][pi, d] == (1 if del_ else 0))
                if del_:
                    m2.add(sum(var2["x"][pi, d, s] for s in p["tillatna"] if M[s]["dygnsdel"] == del_) == 1)
        r2, status2 = lexikografiskt(m2, var2, mal2, profilordning(prob, "langder"),
                                     tid_per_steg, arbetare, tyst, "längder – ")
        if r2:
            return slutresultat(prob, var2, mal2, r2[1], r1[0] + r2[0])
        m2, var2, mal2, _ = bygg_modell(prob)  # mönstret gick inte att fylla: lös fritt nedan
    # Reserv: hela modellen på en gång.
    r3, status3 = lexikografiskt(m2, var2, mal2, profilordning(prob, "hela"), tid_per_steg * 2, arbetare, tyst, "hela – ")
    if r3:
        return slutresultat(prob, var2, mal2, r3[1], r3[0])
    namn = "INFEASIBLE" if status3 == cp_model.INFEASIBLE else "UNKNOWN"
    return {"status": namn, "steg": [], "orsak":
            "Inget schema uppfyller de hårda reglerna. Kör schemamotor.explain." if namn == "INFEASIBLE"
            else "Inget schema hittades inom tidsgränsen. Öka --tid, eller kör schemamotor.explain "
                 "för att se om reglerna krockar."}


def slutresultat(prob, var, mal, xvarden, steg):
    """Räkna om alla mål på den slutliga lösningen så att KPI:erna stämmer."""
    # utvärdera målen genom att fixera x och lösa en trivial modell
    mm, v2, mal2, _ = bygg_modell(prob)
    for k, v in v2["x"].items():
        mm.add(v == xvarden[k])
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    kpi = {}
    for namn in malordning(prob["r"], KPI_MAL):
        if isinstance(mal2[namn], int):
            kpi[namn] = 0
            continue
        mm.clear_objective()
        mm.minimize(mal2[namn])
        solver.solve(mm)
        kpi[namn] = int(round(solver.objective_value))
        mm.add(mal2[namn] <= kpi[namn])
    kpi.setdefault("spridning", 0)
    return tolka(prob, solver, v2, steg, kpi)


def fordela_team(schema, team, hem, N):
    """Vilket team varje pass arbetar i. Var och en arbetar i sitt hemteam; där ett team har färre än sitt behov
    lånas personal in, först de utan hemteam, sedan från team som har fler än sitt behov – den som har lånats ut
    minst först. Sätter "team" på passen och returnerar täckningen per dag, dygnsdel och team."""
    tids = [t["id"] for t in team]
    lan = {pid: 0 for pid in schema}
    rader = []
    for d in range(N):
        for del_ in ("morgon", "kvall", "natt"):
            arbetar = [pid for pid, rad in schema.items() if rad[d] and rad[d]["dygnsdel"] == del_]
            behov = {t["id"]: t["behov"][d % 7].get(del_, 0) or 0 for t in team}
            if not arbetar and not any(behov.values()):
                continue
            plats = {t: [pid for pid in arbetar if hem.get(pid) == t] for t in tids}
            fria = [pid for pid in arbetar if hem.get(pid) not in tids]
            inlanade = {t: 0 for t in tids}
            for t in tids:
                while len(plats[t]) < behov[t]:
                    givare = None
                    if fria:
                        givare = min(fria, key=lambda q: lan[q]); fria.remove(givare)
                    else:
                        over = [u for u in tids if len(plats[u]) > behov[u]]
                        if over:
                            u = max(over, key=lambda u: len(plats[u]) - behov[u])
                            kand = [q for q in plats[u] if hem.get(q) == u] or plats[u]
                            givare = min(kand, key=lambda q: lan[q]); plats[u].remove(givare)
                    if givare is None:
                        break
                    plats[t].append(givare); lan[givare] += 1; inlanade[t] += 1
            for t in tids:
                for pid in plats[t]:
                    schema[pid][d]["team"] = t
            for pid in fria:  # utan hemteam och inte inlånade: arbetar i enheten utan team
                schema[pid][d].pop("team", None)
            for t in tids:
                if behov[t] or plats[t]:
                    rader.append({"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "dygnsdel": del_, "team": t,
                                  "behov": behov[t], "i_tjanst": len(plats[t]), "inlanade": inlanade[t],
                                  "saknas": max(0, behov[t] - len(plats[t]))})
    return rader


def kompetens_tackning(schema, krav, komp, N):
    """Hur många med kompetensen som arbetar varje dag och dygnsdel där det finns ett krav, och hur många som
    saknas. krav = prob["kompetenskrav"] (behov per veckodag), komp = {person: set(kompetenser)}."""
    rader = []
    for k in krav:
        for d in range(N):
            for del_, antal in k["behov"][d % 7].items():
                if not antal:
                    continue
                med = [pid for pid, rad in schema.items() if d < len(rad) and rad[d] and rad[d]["dygnsdel"] == del_
                       and k["kompetens"] in komp.get(pid, ())]
                rader.append({"krav": k["id"], "kompetens": k["kompetens"], "namn": k["namn"], "dag": d, "vecka": d // 7 + 1,
                              "veckodag": DAGNAMN[d % 7], "dygnsdel": del_, "behov": antal, "i_tjanst": len(med),
                              "med": med, "saknas": max(0, antal - len(med))})
    return rader


def tolka(prob, solver, var, steg, kpi_mal):
    M, N = prob["mallar"], prob["N"]
    schema = {}
    for pi, p in enumerate(prob["personer"]):
        rad = []
        for d in range(N):
            pass_ = None
            for s in p["tillatna"]:
                if solver.value(var["x"][pi, d, s]):
                    mm = M[s]
                    pass_ = {"mall": mm["id"], "dygnsdel": mm["dygnsdel"], "start": klocka(mm["start"]),
                             "slut": klocka(mm["slut"]), "rast": mm["rast"], "netto": mm["netto"]}
                    if mm.get("maltidsuppehall"):
                        pass_["maltidsuppehall"] = True
            rad.append(pass_)
        schema[p["id"]] = rad
    # aktiviteter: läggs på passet som täcker dem och redovisas per tillfälle
    tillfallen = []
    for ai, a in enumerate(prob.get("aktiviteter", [])):
        for d in a["_dagar"]:
            delt = []
            for pi in a["_grupp"]:
                v = var["y"].get((ai, d, pi))
                if v is None or not solver.value(v):
                    continue
                p = prob["personer"][pi]
                rad = schema[p["id"]]
                dd = d
                if not (rad[d] and tacker(M[next(s for s in p["tillatna"] if M[s]["id"] == rad[d]["mall"])],
                                          a["_start"], a["_slut"]) == 0):
                    dd = (d - 1) % N
                rad[dd].setdefault("aktiviteter", []).append(
                    {"id": a["id"], "namn": a.get("namn") or a["id"], "start": a["start"], "slut": a["slut"],
                     **{k: a[k] for k in ("typ", "farg") if a.get(k)}})  # typ och färg för visningen
                delt.append(p["id"])
            tillfallen.append({"aktivitet": a["id"], "namn": a.get("namn") or a["id"], "dag": d, "vecka": d // 7 + 1,
                               "veckodag": DAGNAMN[d % 7], "start": a["start"], "slut": a["slut"],
                               "deltagare": delt, "behov": a["_behov"][d], "saknas": a["_behov"][d] - len(delt),
                               "utanfor": a["_utanfor"]})
    vakanser = [{"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "dygnsdel": del_, "tid": t,
                 "antal": solver.value(v)} for v, d, del_, t in var["vak"]
                if solver.value(v) and not str(t).startswith("start ") and del_ != "jour"]
    # jour efter kvällspasset (docs/regelverk.md): på passet, och nätter som saknar jour
    J = prob.get("jour")
    jourvak = []
    if J:
        for (pi, d), v in var.get("j", {}).items():
            if solver.value(v):
                pass_ = schema[prob["personer"][pi]["id"]][d]
                pass_["jour"] = {"start": klocka(J["start"]), "slut": klocka(J["slut"])}
        jourvak = [{"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "antal": solver.value(v)}
                   for v, d, del_, _ in var["vak"] if del_ == "jour" and solver.value(v)]
    # starttider som inte fick så många som skulle börja då (docs/starttider.md)
    startvak = [{"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "start": t[6:], "antal": solver.value(v)}
                for v, d, _, t in var["vak"] if str(t).startswith("start ") and solver.value(v)]
    kpi = dict(kpi_mal)
    if J:
        kpi["jour_saknas"] = sum(v["antal"] for v in jourvak)
        kpi["jourpass"] = sum(1 for rad in schema.values() for p in rad if p and p.get("jour"))
    if prob.get("starttider"):
        kpi["starttid_saknas"] = sum(v["antal"] for v in startvak)
    kpi["vakanta_pass"] = sum(v["antal"] for v in vakanser if v["dygnsdel"])
    kpi["vakanta_tidpunkter"] = sum(v["antal"] for v in vakanser if v["tid"])
    kpi["aktivitet_saknas"] = sum(t["saknas"] for t in tillfallen)
    team_tackning = []
    if prob.get("team"):
        team_tackning = fordela_team(schema, prob["team"], {p["id"]: p.get("team") for p in prob["personer"]}, N)
        kpi["team_lan"] = sum(x["inlanade"] for x in team_tackning)
        kpi["team_saknas"] = sum(x["saknas"] for x in team_tackning)
    komp_tackning = []
    if prob.get("kompetenskrav"):
        komp_tackning = kompetens_tackning(schema, prob["kompetenskrav"], {p["id"]: p.get("kompetenser", set()) for p in prob["personer"]}, N)
        kpi["kompetensvakanser"] = sum(x["saknas"] for x in komp_tackning)
    # uppskattad OB per vecka (AB 25 § 21, utan helgdagar), för att jämföra alternativ
    kpi["ob_kr_vecka"] = round(sum(ob_kronor({"start": tid(p["start"]), "slut": tid(p["slut"]) + (DYGN if tid(p["slut"]) <= tid(p["start"]) else 0)}, d % 7)
                                   for rad in schema.values() for d, p in enumerate(rad) if p) / prob["W"])
    personer = {}
    for p in prob["personer"]:
        rad = [x for x in schema[p["id"]] if x]
        personer[p["id"]] = {"pass": len(rad), "minuter": sum(x["netto"] for x in rad),
                             "mal_minuter": p["mal_minuter"], "kvallspass": sum(x["dygnsdel"] == "kvall" for x in rad),
                             "helggrupp": ("A" if solver.value(p["_grupp"]) else "B") if "_grupp" in p else None,
                             "aktiviteter": sum(len(x.get("aktiviteter", [])) for x in rad),
                             **({"jour": sum(1 for x in rad if x.get("jour"))} if J else {}),
                             **({"team": p.get("team"), "utlanad": sum(1 for x in rad if p.get("team") and x.get("team") not in (None, p["team"]))}
                                if prob.get("team") else {})}
    return {"status": "OK", "enhet": prob["enhet"], "veckor": prob["W"], "cykliskt": prob["cykliskt"], "profil": prob.get("profil", "standard"),
            "steg": steg, "kpi": kpi, "personer": personer, "vakanser": vakanser, "aktiviteter": tillfallen,
            **({"startvakanser": startvak} if prob.get("starttider") else {}),
            **({"jourvakanser": jourvak} if J else {}),
            "schema": schema, **({"team": [{"id": t["id"], "namn": t["namn"]} for t in prob["team"]], "team_tackning": team_tackning}
                                 if prob.get("team") else {}),
            **({"kompetenskrav": [{"id": k["id"], "kompetens": k["kompetens"], "namn": k["namn"]} for k in prob["kompetenskrav"]],
                "kompetens_tackning": komp_tackning} if prob.get("kompetenskrav") else {})}


def markdown(res):
    rad = [f"# Grundschema {res.get('enhet', '')} – {res['veckor']} veckor", ""]
    rad += ["| Mål | Värde |", "|---|---|"]
    rad += [f"| {k} | {v} |" for k, v in res["kpi"].items()]
    for w in range(res["veckor"]):
        rad += ["", f"## Vecka {w + 1}", "", "| Person | " + " | ".join(DAGNAMN) + " |", "|---|" + "---|" * 7]
        for pid, dagar in res["schema"].items():
            celler = []
            for p in dagar[w * 7:w * 7 + 7]:
                celler.append("" if not p else ("N" if p["dygnsdel"] == "natt" else f"{p['start']}–{p['slut']}")
                              + "".join(f" ({a['id']})" for a in p.get("aktiviteter") or []))
            rad.append(f"| {pid} | " + " | ".join(celler) + " |")
    if res["vakanser"]:
        rad += ["", "## Vakanser"] + [f"- Vecka {v['vecka']} {v['veckodag']}: {v['antal']} "
                                     + (v["dygnsdel"] or f"kl {v['tid']}") for v in res["vakanser"]]
    if res.get("aktiviteter"):
        rad += ["", "## Aktiviteter"] + [f"- Vecka {t['vecka']} {t['veckodag']} {t['start']}–{t['slut']} {t['namn']}: "
                                         + (", ".join(t["deltagare"]) or "inga")
                                         + (f" (saknas {t['saknas']})" if t["saknas"] else "") for t in res["aktiviteter"]]
    rad += ["", "## Per person", "", "| Person | Pass | Arbetstid | Mål | Kvällspass | Helggrupp |",
            "|---|---|---|---|---|---|"]
    for pid, k in res["personer"].items():
        rad.append(f"| {pid} | {k['pass']} | {k['minuter'] // 60} h {k['minuter'] % 60:02d} | "
                   f"{k['mal_minuter'] // 60} h {k['mal_minuter'] % 60:02d} | {k['kvallspass']} | {k['helggrupp'] or '–'} |")
    return "\n".join(rad)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("indata")
    ap.add_argument("--ut", help="spara resultatet som JSON")
    ap.add_argument("--md", help="spara schemat som markdown")
    ap.add_argument("--tid", type=float, help="sekunder per optimeringssteg (standard 20)")
    ap.add_argument("--tyst", action="store_true")
    a = ap.parse_args()
    with open(a.indata, encoding="utf-8") as f:
        indata = json.load(f)
    from schemamotor.modell import kontrollera_indata
    fel = kontrollera_indata(indata)
    if fel:
        print(json.dumps({"status": "INDATAFEL", "orsak": " ".join(fel), "fel": fel}, ensure_ascii=False, indent=2))
        sys.exit(2)
    try:
        prob = forbered(indata)
        cfg = indata.get("losare", {})
        import os
        res = los(prob, a.tid or cfg.get("tid_per_steg_s", 20), cfg.get("arbetare", min(8, os.cpu_count() or 1)), a.tyst)
    except IndataFel as e:
        print(json.dumps({"status": "INDATAFEL", "orsak": str(e)}, ensure_ascii=False, indent=2))
        sys.exit(2)
    if a.ut:
        with open(a.ut, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
    if a.md and res["status"] == "OK":
        with open(a.md, "w", encoding="utf-8") as f:
            f.write(markdown(res))
    sammandrag = {k: res[k] for k in ("status", "steg", "kpi") if k in res}
    if res["status"] != "OK":
        sammandrag["orsak"] = res.get("orsak")
    print(json.dumps(sammandrag, ensure_ascii=False, indent=2))
    sys.exit(0 if res["status"] == "OK" else 1)


if __name__ == "__main__":
    main()
