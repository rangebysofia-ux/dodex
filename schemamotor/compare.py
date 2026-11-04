#!/usr/bin/env python3
"""Jämför scenarier: samma verksamhet med olika ändringar, lösta och granskade var för sig.

Användning:
    python -m schemamotor.compare scenarier.json [--json] [--spara-scheman katalog]

Scenariofilen:
{
  "bas": "indata.json",                 # sökväg relativt scenariofilen (eller "bas_indata": {...})
  "tid_per_steg_s": 10,
  "scenarier": [
    {"namn": "Nuläge"},
    {"namn": "Två går till 3/4 helg",
     "personal_andringar": {"A1": {"helgfrekvens": "3/4"}, "A2": {"helgfrekvens": "3/4"}}},
    {"namn": "En 75 % till", "lagg_till_personal": [{"id": "X1", "grad": 0.75}]},
    {"namn": "Utan C2", "ta_bort_personal": ["C2"]},
    {"namn": "Lägre helgbehov", "andringar": {"behov": {"helg": {"morgon": 2, "kvall": 1, "natt": 1}}}}
  ]
}
"andringar" slås ihop med basens indata nyckel för nyckel (ordböcker slås ihop rekursivt).
Första scenariot är jämförelsepunkten.
"""
import argparse
import copy
import json
import os
import sys
import time

from schemamotor import validate
from schemamotor.build import IndataFel, forbered, los

KOLUMNER = [
    ("status", "Status"), ("vakanta_pass", "Vakanta pass"), ("vakanta_tidpunkter", "Vakanta tidpunkter"),
    ("blocklangd", "Block över 4"), ("passlangd", "Passlängd, avvikelse min"), ("rattvisa", "Rättvisa (spridning)"),
    ("onskemal", "Brutna önskemål"), ("hardregelbrott", "Brott i granskningen"), ("personer", "Personer"),
    ("timmar_per_vecka", "Kontrakterade h/vecka"), ("sekunder", "Sekunder"),
]


def sla_ihop(bas, andring):
    ut = copy.deepcopy(bas)
    for k, v in andring.items():
        if isinstance(v, dict) and isinstance(ut.get(k), dict):
            ut[k] = sla_ihop(ut[k], v)
        else:
            ut[k] = copy.deepcopy(v)
    return ut


def bygg_scenario(bas, sc):
    d = sla_ihop(bas, sc.get("andringar", {}))
    bort = set(sc.get("ta_bort_personal", []))
    d["personal"] = [dict(p) for p in d["personal"] if p["id"] not in bort]
    for p in d["personal"]:
        p.update(sc.get("personal_andringar", {}).get(p["id"], {}))
    d["personal"] += copy.deepcopy(sc.get("lagg_till_personal", []))
    d["onskemal"] = [o for o in d.get("onskemal", []) if o["person"] not in bort]
    return d


def kor(indata, tid_s):
    start = time.time()
    rad = {"personer": len(indata["personal"]),
           "timmar_per_vecka": round(sum(p["grad"] * p.get("heltid_minuter_per_vecka",
                                                           indata.get("heltid_minuter_per_vecka", 2220))
                                         for p in indata["personal"]) / 60, 1)}
    try:
        res = los(forbered(indata), tid_s, min(8, os.cpu_count() or 1), tyst=True)
    except IndataFel as e:
        rad.update(status="INDATAFEL", orsak=str(e), sekunder=round(time.time() - start))
        return rad, None
    rad["status"] = res["status"]
    rad["sekunder"] = round(time.time() - start)
    if res["status"] != "OK":
        rad["orsak"] = res.get("orsak", "")
        return rad, res
    rad.update({k: res["kpi"].get(k) for k in ("vakanta_pass", "vakanta_tidpunkter", "blocklangd",
                                               "passlangd", "rattvisa", "onskemal")})
    granskning = validate.kontrollera(indata, res)
    rad["hardregelbrott"] = len(granskning["brott"])
    return rad, res


def tabell(rader):
    out = ["| Scenario | " + " | ".join(t for _, t in KOLUMNER) + " |", "|---|" + "---|" * len(KOLUMNER)]
    bas = rader[0]
    for r in rader:
        celler = []
        for k, _ in KOLUMNER:
            v = r.get(k, "–")
            if r is not bas and isinstance(v, (int, float)) and isinstance(bas.get(k), (int, float)) \
                    and k not in ("sekunder",) and v != bas[k]:
                diff = v - bas[k]
                v = f"{v:g} ({'+' if diff > 0 else ''}{diff:g})"
            celler.append(str(v if v is not None else "–"))
        out.append(f"| {r['namn']} | " + " | ".join(celler) + " |")
    noter = [f"- **{r['namn']}:** {r['orsak']}" for r in rader if r.get("orsak")]
    return "\n".join(out + ([""] + noter if noter else []))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenarier")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--spara-scheman", help="katalog där varje scenarios schema sparas som JSON")
    a = ap.parse_args()
    with open(a.scenarier, encoding="utf-8") as f:
        sc = json.load(f)
    if "bas_indata" in sc:
        bas = sc["bas_indata"]
    else:
        with open(os.path.join(os.path.dirname(os.path.abspath(a.scenarier)), sc["bas"]), encoding="utf-8") as f:
            bas = json.load(f)
    rader = []
    for s in sc["scenarier"]:
        indata = bygg_scenario(bas, s)
        rad, res = kor(indata, sc.get("tid_per_steg_s", 10))
        rad["namn"] = s["namn"]
        rader.append(rad)
        print(f"  {s['namn']}: {rad['status']}", file=sys.stderr)
        if a.spara_scheman and res:
            os.makedirs(a.spara_scheman, exist_ok=True)
            with open(os.path.join(a.spara_scheman, f"{len(rader):02d}.json"), "w", encoding="utf-8") as f:
                json.dump({"scenario": s["namn"], "indata": indata, "resultat": res}, f, ensure_ascii=False, indent=2)
    print(json.dumps(rader, ensure_ascii=False, indent=2) if a.json else tabell(rader))


if __name__ == "__main__":
    main()
