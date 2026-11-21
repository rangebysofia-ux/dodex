#!/usr/bin/env python3
"""Förklara varför ett schema inte går att lägga.

Användning:
    python -m schemamotor.explain indata.json [--tid 30] [--json]

Steg:
1. Aritmetiska förkontroller per person (antal pass, arbetstid och passfönster).
2. CP-SAT med en literal per hård regelgrupp och person. Är modellen olösbar krymps
   uppsättningen till en minimal konflikt: först genom att släppa hela personer, sedan
   en regel i taget. Kvar blir regler som var för sig behövs för att konflikten ska uppstå.
3. Om schemat är cykliskt prövas samma regler utan cykel, för att se om konflikten bara
   uppstår när sista veckan följs av första.

Exitkod: 0 = förklaring hittad eller reglerna är förenliga, 1 = kunde inte avgöras, 2 = fel i indata.
"""
import argparse
import json
import sys

from schemamotor.build import DAGNAMN, IndataFel, bygg_modell, cp_model, forbered, monsterproblem

BESKRIVNING = {
    "DYGNSVILA": ("avtal", "dygnsvila {v} timmar mellan pass"),
    "VECKOVILA": ("avtal", "veckovila {vv} timmar per vecka"),
    "BLOCK_MIN": ("lokal regel", "inga enstaka arbetsdagar (minst {bmin} i följd)"),
    "BLOCK_MAX": ("lokal regel", "högst {bmax} arbetsdagar i följd"),
    "NATT_I_RAD": ("lokal regel", "högst {nmax} i rad"),
    "KVALL_I_RAD": ("lokal regel", "högst {kmax} i rad"),
    "HELG": ("lokal regel", "helgregler: helgfrekvens {helg}{extra}, hel arbetshelg, ingen fredagskväll före ledig helg"),
    "ANTAL_PASS": ("kontrakt", "{antal} pass under perioden"),
    "TID": ("kontrakt", "arbetstid {tid} timmar (± {tol} min)"),
    "KRAV": ("önskemål som krav", "{krav}"),
    "AKTIVITET": ("verksamhet", "{akt}"),
}


def dagtext(d):
    return f"vecka {d // 7 + 1} {DAGNAMN[d % 7]}"


SVENSKA = {"morgon": "morgon", "kvall": "kväll", "natt": "natt"}


def beskriv_krav(o):
    dagar = o["_dagar"]
    dtext = ", ".join(dagtext(d) for d in dagar[:6]) + (" …" if len(dagar) > 6 else "")
    v = o.get("varde")
    if o["typ"] == "tidigast_start":
        typ = f"börjar tidigast {v}"
    elif o["typ"] == "senast_slut":
        typ = f"slutar senast {v}"
    elif o["typ"] == "endast_dygnsdel":
        typ = "bara " + " eller ".join(SVENSKA.get(x, x) for x in (v if isinstance(v, list) else [v]))
    else:
        typ = o["typ"]
    return f"krav {o['id']}: {typ} ({dtext})"


def text_for(namn, prob):
    regel, ref = namn.split("|", 1)
    r = prob["r"]
    if regel == "KRAV":
        o = next(o for o in prob["onskemal"] if o["id"] == ref)
        return regel, o["person"], "önskemål som krav", beskriv_krav(o)
    if regel == "AKTIVITET":
        a = next(a for a in prob["aktiviteter"] if a["id"] == ref)
        dagar = ", ".join(dagtext(d) for d in a["_dagar"][:6]) + (" …" if len(a["_dagar"]) > 6 else "")
        return regel, a.get("namn") or ref, "verksamhet", (
            f"aktiviteten {a.get('namn') or ref} {a['start']}–{a['slut']} med {a['_antal']} deltagare ({dagar}) "
            "måste genomföras, och deltagarna ska arbeta hela tiden")
    p = next(p for p in prob["personer"] if p["id"] == ref)
    niva, mall = BESKRIVNING[regel]
    text = mall.format(v=f"{r['dygnsvila_minuter'] / 60:g}", vv=f"{r['veckovila_minuter'] / 60:g}", bmin=r["block_min"],
                       bmax=r["block_max"], kmax=f"{r.get('kvall_max_i_rad')} {'kväll' if r.get('kvall_max_i_rad') == 1 else 'kvällar'}", nvila=f"{(r.get('natt_vila_mellan_block_minuter') or 0) / 60:g}", nmax=f"{r.get('natt_max_i_rad')} {'natt' if r.get('natt_max_i_rad') == 1 else 'nätter'}", helg=p["helgfrekvens"], extra=(f" och högst {p['extra_helgpass']} extra helgpass" if p.get("extra_helgpass") else ""),
                       antal="/".join(map(str, p["pass_delperioder"])),
                       tid=f"{p['mal_minuter'] / 60:.2f}", tol=p["tolerans"], krav="")
    return regel, ref, niva, text


def forkontroller(prob):
    """Snabba aritmetiska kontroller som inte kräver lösaren."""
    fynd = []
    M = prob["mallar"]
    for p in prob["personer"]:
        n = sum(p["pass_delperioder"])
        netto = [M[s]["netto"] for s in p["tillatna"]]
        lo, hi = n * min(netto), n * max(netto)
        if hi < p["mal_minuter"] - p["tolerans"]:
            fynd.append(f"{p['id']}: {n} pass ger högst {hi / 60:.1f} h med tillåtna passlängder, men "
                        f"arbetstiden ska vara {p['mal_minuter'] / 60:.1f} h. Antal pass och arbetstid går inte ihop.")
        if lo > p["mal_minuter"] + p["tolerans"]:
            fynd.append(f"{p['id']}: {n} pass ger minst {lo / 60:.1f} h, men arbetstiden ska vara "
                        f"{p['mal_minuter'] / 60:.1f} h. Passen kan inte bli tillräckligt korta inom fönstret.")
        if n > prob["N"]:
            fynd.append(f"{p['id']}: {n} pass på {prob['N']} dagar.")
    return fynd


def los_med(enkel, pa, tid_s, cykliskt=None):
    """Lös mönstermodellen med regelgrupperna i `pa` påslagna och alla andra avslagna.
    Grupperna fixeras (inte som antaganden), så att förlösningen kan hitta konflikter direkt."""
    m, _, _, grupper = bygg_modell(enkel, antaganden=True, cykliskt=cykliskt, utan_tid=True)
    for namn, lit in grupper.items():
        m.add(lit == (1 if namn in pa else 0))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = tid_s
    solver.parameters.num_workers = 1
    return solver.solve(m)


def forklara(prob, tid_s=30):
    """Hitta en minimal uppsättning hårda regler som inte kan uppfyllas samtidigt.

    Kontrollerna görs på mönstermodellen (samma hårda regler, färre passlängder, utan
    exakt arbetstid). Arbetstiden kontrolleras i stället aritmetiskt i förkontrollerna."""
    res = {"forkontroller": forkontroller(prob), "konflikt": [], "cykelgrans": None}
    enkel = monsterproblem(prob)
    alla = [n for n in bygg_modell(enkel, antaganden=True, utan_tid=True)[3]]
    per_steg = max(3.0, tid_s / 6)
    status = los_med(enkel, set(alla), tid_s)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        res["slutsats"] = ("De hårda reglerna om vila, block, helger, antal pass, krav och aktiviteter är förenliga."
                           + (" Konflikten ligger i arbetstiden – se förkontrollerna." if res["forkontroller"]
                              else " Gick genereringen inte att lösa, pröva schemamotor.build med längre --tid."))
        return res, 0
    if status != cp_model.INFEASIBLE:
        res["slutsats"] = "Kunde inte avgöras inom tidsgränsen. Pröva --tid med fler sekunder."
        return res, 1
    kvar = list(alla)
    # 1. släpp hela personer i taget (personer utan krav först)
    def person(n):
        regel, ref = n.split("|", 1)
        if regel == "AKTIVITET":
            return "aktivitet " + ref
        return next(o["person"] for o in prob["onskemal"] if o["id"] == ref) if regel == "KRAV" else ref
    personer = sorted({person(n) for n in kvar}, key=lambda q: any(o["person"] == q for o in prob["onskemal"]))
    for q in personer:
        prov = [n for n in kvar if person(n) != q]
        if los_med(enkel, set(prov), per_steg) == cp_model.INFEASIBLE:
            kvar = prov
    # 2. släpp en regel i taget
    i = 0
    while i < len(kvar):
        prov = kvar[:i] + kvar[i + 1:]
        if los_med(enkel, set(prov), per_steg) == cp_model.INFEASIBLE:
            kvar = prov
        else:
            i += 1
    res["konflikt"] = [dict(zip(("regel", "person", "niva", "text"), text_for(n, prob)), grupp=n) for n in kvar]
    if prob["cykliskt"]:
        if los_med(enkel, set(kvar), per_steg, cykliskt=False) in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            res["cykelgrans"] = ("Konflikten uppstår bara för att schemat är cykliskt: sista veckan följs av "
                                 "vecka 1 igen. Utan cykel går reglerna ihop. Titta på dagarna kring periodgränsen.")
    avtal = any(k["niva"] == "avtal" for k in res["konflikt"])
    res["slutsats"] = (f"{len(kvar)} regler kan inte uppfyllas samtidigt. "
                       + ("Avtalsregler ingår och kan inte ändras – ändra någon av de andra. " if avtal else "")
                       + "Ändra eller släpp minst en av dem.")
    return res, 0


def rapport(res):
    rad = ["# Varför schemat inte går att lägga", "", f"**{res['slutsats']}**"]
    if res["forkontroller"]:
        rad += ["", "## Förkontroller"] + [f"- {f}" for f in res["forkontroller"]]
    if res["konflikt"]:
        rad += ["", "## Regler som krockar", "", "| Regel | Nivå | Gäller | Innebörd |", "|---|---|---|---|"]
        rad += [f"| {k['regel']} | {k['niva']} | {k['person']} | {k['text']} |" for k in res["konflikt"]]
    if res["cykelgrans"]:
        rad += ["", f"**Cykelgränsen:** {res['cykelgrans']}"]
    return "\n".join(rad)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("indata")
    ap.add_argument("--tid", type=float, default=30)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    with open(a.indata, encoding="utf-8") as f:
        indata = json.load(f)
    try:
        prob = forbered(indata)
        res, kod = forklara(prob, a.tid)
    except IndataFel as e:
        print(f"Fel i indata: {e}")
        sys.exit(2)
    print(json.dumps(res, ensure_ascii=False, indent=2) if a.json else rapport(res))
    sys.exit(kod)


if __name__ == "__main__":
    main()
