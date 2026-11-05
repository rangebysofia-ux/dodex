"""Kontroll av önskemål innan schemat läggs.

Varnar för önskemål som inte påverkar något (tar bort noll passalternativ), som inte gäller
någon dag, eller som krockar med varandra som krav. Påverkar inte lösningen.
"""
from schemamotor.build import DAGNAMN, forbered, klocka, tid

TYPTEXT = {"ledig": "ledig", "arbetar": "arbetar", "tidigast_start": "börja tidigast",
           "senast_slut": "sluta senast", "endast_dygnsdel": "bara"}
DELTEXT = {"morgon": "morgon", "kvall": "kväll", "natt": "natt"}


def beskriv(o):
    """Kort text som människor förstår, till exempel 'A1 vill vara ledig fre, jämna veckor'."""
    vill = "måste" if o.get("krav") else "vill"
    if o["typ"] == "ledig":
        vad = "vara ledig"
    elif o["typ"] == "arbetar":
        vad = "arbeta"
    elif o["typ"] == "endast_dygnsdel":
        v = o["varde"] if isinstance(o["varde"], list) else [o["varde"]]
        vad = "bara arbeta " + " eller ".join(DELTEXT.get(x, x) for x in v)
    else:
        vad = f"{TYPTEXT[o['typ']]} {o.get('varde')}"
    if "dagindex" in o and o["dagindex"] is not None:
        nar = ", ".join(f"v{d // 7 + 1} {DAGNAMN[d % 7]}" for d in o["dagindex"])
    else:
        dagar = o.get("dagar") or DAGNAMN
        nar = "alla dagar" if len(dagar) == 7 else ", ".join(dagar)
        vv = o.get("veckor") or "alla"
        if vv in ("jämna", "udda"):
            nar += f", {vv} veckor"
        elif isinstance(vv, list):
            nar += ", vecka " + ", ".join(map(str, vv))
    vikt = "" if o.get("krav") or o.get("vikt", 1) == 1 else f" (vikt {o['vikt']})"
    return f"{o['person']} {vill} {vad} – {nar}{vikt}"


def kontrollera(indata):
    """Returnera en lista med {'id', 'text', 'varning'} per önskemål med problem."""
    prob = forbered(indata)
    M = prob["mallar"]
    pers = {p["id"]: p for p in prob["personer"]}
    ut = []
    krav_per_dag = {}
    for o in prob["onskemal"]:
        p = pers[o["person"]]
        T = p["tillatna"]
        dagar = o["_dagar"]
        namn = f"{o['id']} ({beskriv(o)})"
        if not dagar:
            ut.append({"id": o["id"], "varning": f"{namn} gäller ingen dag i perioden."})
            continue
        typ = o["typ"]
        if typ == "tidigast_start":
            bort = [s for s in T if M[s]["start"] < tid(o["varde"])]
            tidigast = min(M[s]["start"] for s in T)
            if not bort:
                ut.append({"id": o["id"], "varning": f"{namn} påverkar inget: {p['id']} börjar aldrig före "
                                                    f"{klocka(tidigast)} ändå."})
            elif len(bort) == len(T):
                ut.append({"id": o["id"], "varning": f"{namn} tar bort alla pass {p['id']} kan arbeta, så det "
                                                    f"blir samma sak som att vara ledig."})
        elif typ == "senast_slut":
            bort = [s for s in T if M[s]["slut"] > tid(o["varde"])]
            if not bort:
                ut.append({"id": o["id"], "varning": f"{namn} påverkar inget: {p['id']} slutar aldrig efter "
                                                    f"{o['varde']} ändå."})
            elif len(bort) == len(T):
                ut.append({"id": o["id"], "varning": f"{namn} tar bort alla pass {p['id']} kan arbeta, så det "
                                                    f"blir samma sak som att vara ledig."})
        elif typ == "endast_dygnsdel":
            ok = o["varde"] if isinstance(o["varde"], list) else [o["varde"]]
            if all(M[s]["dygnsdel"] in ok for s in T):
                ut.append({"id": o["id"], "varning": f"{namn} påverkar inget: {p['id']} arbetar bara "
                                                    f"{' och '.join(DELTEXT[d] for d in p['dygnsdelar'])} ändå."})
            elif not any(M[s]["dygnsdel"] in ok for s in T):
                ut.append({"id": o["id"], "varning": f"{namn} går inte ihop med vilka dygnsdelar {p['id']} "
                                                    f"arbetar, så det blir samma sak som att vara ledig."})
        if o.get("krav") and typ in ("ledig", "arbetar"):
            for d in dagar:
                tidigare = krav_per_dag.get((p["id"], d))
                if tidigare and tidigare[0] != typ:
                    ut.append({"id": o["id"], "varning": f"{namn} krockar med krav {tidigare[1]}: samma dag "
                                                        f"(vecka {d // 7 + 1} {DAGNAMN[d % 7]}) både ledig och "
                                                        f"i arbete. Schemat går inte att lägga."})
                    break
                krav_per_dag[(p["id"], d)] = (typ, o["id"])
    return ut
