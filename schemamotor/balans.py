"""Bemanningsbalans: räkna före schemaläggningen om personalen räcker till behovet.

Användning:
    python -m schemamotor.balans indata.json [--json]

Balansen är en snabb uppskattning utan lösare. Den räknar
- pass för dag/kväll och natt mot behovet över hela perioden,
- morgon- och kvällskapacitet för den som bara arbetar en dygnsdel,
- helger: hur många som arbetar varje helg enligt helgfrekvensen, mot behovet lördag och söndag,
- extra helgpass: den som har extra helgpass kan fylla en lördag eller söndag en ledig helg, i stället för ett
  vardagspass,
- fredagskvällar: den som är ledig helgen får inte arbeta fredag kväll eller natt, så fredagens
  kvällsbehov måste täckas av dem som arbetar helgen. Kväll följd av morgon ger bara 9 timmars
  dygnsvila, så den som arbetar fredag kväll arbetar kväll även lördag och söndag.
Den ger förväntat antal vakanta pass och föreslår åtgärder. Vakanser vid klockslag (tidpunkter)
uppskattas inte.
"""
import argparse
import json
import sys

from schemamotor.build import IndataFel, forbered

HELGANDEL = {"alla": 1.0, "3/4": 0.75, "2/4": 0.5, "1/4": 0.25, "ingen": 0.0}


def _sprid(totalt, veckor, forskjut=0):
    """Fördela ett antal personhelger så jämnt som möjligt över veckorna."""
    bas, extra = divmod(round(totalt), veckor)
    return [bas + (1 if (w + forskjut) % veckor < extra else 0) for w in range(veckor)]


def balans(indata):
    prob = forbered(indata)
    r, W, N = prob["r"], prob["W"], prob["N"]
    behov = prob["behov"]
    pers = prob["personer"]
    b = lambda d, del_: behov[d % 7].get(del_, 0)  # noqa: E731

    rader, atgarder, helger = [], [], []

    # --- totalt antal pass
    dag = [p for p in pers if not p["natt"]]
    natt = [p for p in pers if p["natt"]]
    pass_ = lambda p: sum(p["pass_delperioder"])  # noqa: E731
    behov_dk = sum(b(d, "morgon") + b(d, "kvall") for d in range(N))
    behov_n = sum(b(d, "natt") for d in range(N))
    till_dk = sum(pass_(p) for p in dag)
    till_n = sum(pass_(p) for p in natt)
    rader.append({"namn": "Dag- och kvällspass", "behov": behov_dk, "tillgang": till_dk})
    rader.append({"namn": "Nattpass", "behov": behov_n, "tillgang": till_n})
    for del_, namn in (("morgon", "Morgonpass"), ("kvall", "Kvällspass")):
        kan = sum(pass_(p) for p in dag if del_ in p["dygnsdelar"])
        rader.append({"namn": f"{namn} (bara de som kan ta dem)", "behov": sum(b(d, del_) for d in range(N)),
                      "tillgang": kan})

    # --- helger
    helgdag = lambda p: HELGANDEL.get(p["helgfrekvens"], 0.5)  # noqa: E731
    grupper = {"bada": [p for p in dag if set(p["dygnsdelar"]) >= {"morgon", "kvall"}],
               "morgon": [p for p in dag if p["dygnsdelar"] == ["morgon"]],
               "kvall": [p for p in dag if p["dygnsdelar"] == ["kvall"]]}
    per_helg, forskj = {}, 0
    for g, lista in grupper.items():
        per_helg[g] = _sprid(sum(helgdag(p) * W for p in lista), W, forskj)
        forskj += round(sum(helgdag(p) * W for p in lista)) % W
    natt_helg = _sprid(sum(helgdag(p) * W for p in natt), W)
    fre_regel = r["ingen_fredagskvall_fore_ledig_helg"]

    vak_helg = 0
    helgpass_dk = helgpass_n = 0
    fredag_orsak = 0
    # extra helgpass (en lördag eller söndag en ledig helg, per person): fyller helgdagar som annars blir vakanta
    med_extra = [p for p in dag if p.get("extra_helgpass") and p["helgfrekvens"] not in ("alla", "4/4")]
    extra_kvar = sum(min(p["extra_helgpass"], round(W * (1 - helgdag(p)))) for p in med_extra)
    extra_lediga = round(sum(1 - helgdag(p) for p in med_extra))  # lediga den helgen, ungefär
    extra_anvanda = 0
    for w in range(W):
        fre, lor, son = w * 7 + 4, w * 7 + 5, w * 7 + 6
        bada, mo, kv = per_helg["bada"][w], per_helg["morgon"][w], per_helg["kvall"][w]
        arbetar = bada + mo + kv
        m_behov = max(b(lor, "morgon"), b(son, "morgon"))
        k_behov = max(b(lor, "kvall"), b(son, "kvall"))
        k_med_fre = max(k_behov, b(fre, "kvall")) if fre_regel else k_behov
        brist = lambda kb: max(0, max(0, kb - kv) + max(0, m_behov - mo) - bada)  # noqa: E731
        fre_del = brist(k_med_fre) - brist(k_behov)
        fredag_orsak += fre_del
        # helgdagarna var för sig: den som saknas en helg saknas både lördag och söndag
        dagbrist = lambda d: max(0, max(0, b(d, "kvall") - kv) + max(0, b(d, "morgon") - mo) - bada)  # noqa: E731
        helgdagar = dagbrist(lor) + dagbrist(son)
        extra = min(helgdagar, extra_lediga, extra_kvar)
        extra_kvar -= extra
        extra_anvanda += extra
        brist_dk = fre_del + helgdagar - extra
        nb = max(b(fre, "natt") if fre_regel else 0, b(lor, "natt"), b(son, "natt"))
        brist_n = max(0, nb - natt_helg[w])
        vak_helg += brist_dk + brist_n
        helgpass_dk += 2 * arbetar + extra  # extra helgpass ersätter vardagspass
        helgpass_n += 2 * natt_helg[w]
        helger.append({"vecka": w + 1, "arbetar_dag_kvall": arbetar, "behov_dag_kvall": m_behov + k_med_fre,
                       "arbetar_natt": natt_helg[w], "behov_natt": nb, "vakanser": brist_dk + brist_n})

    # --- vardagar: det som är kvar efter helgerna
    vardag_behov_dk = sum(b(d, "morgon") + b(d, "kvall") for d in range(N) if d % 7 < 5)
    vardag_behov_n = sum(b(d, "natt") for d in range(N) if d % 7 < 5)
    vak_vardag_dk = max(0, vardag_behov_dk - (till_dk - helgpass_dk))
    vak_vardag_n = max(0, vardag_behov_n - (till_n - helgpass_n))
    forvantat = vak_helg + vak_vardag_dk + vak_vardag_n

    # --- åtgärder
    pass_per_person = r["pass_per_vecka"] * W
    if vak_vardag_dk:
        atgarder.append(f"Det saknas cirka {vak_vardag_dk} dag- och kvällspass på vardagar. En person till med "
                        f"dag/kväll ger {pass_per_person:g} pass, oavsett sysselsättningsgrad.")
    if vak_vardag_n:
        atgarder.append(f"Det saknas cirka {vak_vardag_n} nattpass på vardagar. Utöka nattpersonalens "
                        f"sysselsättningsgrad eller lägg till en nattperson.")
    if fredag_orsak:
        atgarder.append(
            f"Fredagskvällarna ger {fredag_orsak} {'vakant pass' if fredag_orsak == 1 else 'vakanta pass'}: den som är ledig helgen arbetar inte fredag "
            f"kväll, och den som arbetar fredag kväll kan inte ta morgonpass på lördagen (9 timmars vila). "
            f"Sänk behovet fredag kväll, låt fler arbeta helg, eller stäng av den lokala regeln "
            f"\"ingen fredagskväll före ledig helg\".")
    if vak_helg - fredag_orsak > 0:
        tunna = [h["vecka"] for h in helger if h["vakanser"]]
        atgarder.append(
            f"Helgerna räcker inte till (vecka {', '.join(map(str, tunna))}). Låt någon arbeta 3/4 helger, "
            f"ändra helgfrekvensen för den som har \"ingen\", ge någon extra helgpass, sänk helgbehovet eller utöka personalen.")
    if extra_anvanda:
        atgarder.append(f"Cirka {extra_anvanda} extra helgpass behövs för att täcka helgerna. De ersätter pass på vardagar.")
    over = (till_dk - helgpass_dk) - vardag_behov_dk
    if over > 0 and not vak_vardag_dk:
        atgarder.append(f"Det finns cirka {over} fler dag- och kvällspass än behovet på vardagar. De läggs som "
                        f"överbemanning; behovet kan höjas där det gör mest nytta.")
    varningar = []
    if any(prob["tidpunkter"][i] for i in range(7)):
        varningar.append("Behov vid klockslag (tidpunkter) ingår inte i uppskattningen.")

    for rad in rader:
        rad["skillnad"] = rad["tillgang"] - rad["behov"]
    return {"forvantade_vakanser": forvantat, "rader": rader, "helger": helger, "atgarder": atgarder,
            "varningar": varningar, "fredagsregel": fre_regel, "extra_helgpass": extra_anvanda}


def rapport(res):
    rad = ["# Bemanningsbalans", "",
           f"**Förväntade vakanta pass: {res['forvantade_vakanser']}**", "",
           "| | Behov | Tillgång | Skillnad |", "|---|---|---|---|"]
    rad += [f"| {x['namn']} | {x['behov']} | {x['tillgang']} | {x['skillnad']:+d} |" for x in res["rader"]]
    rad += ["", "## Helger", "", "| Vecka | Arbetar dag/kväll | Behov | Arbetar natt | Behov | Vakanser |",
            "|---|---|---|---|---|---|"]
    rad += [f"| {h['vecka']} | {h['arbetar_dag_kvall']} | {h['behov_dag_kvall']} | {h['arbetar_natt']} | "
            f"{h['behov_natt']} | {h['vakanser']} |" for h in res["helger"]]
    if res["atgarder"]:
        rad += ["", "## Förslag"] + [f"- {a}" for a in res["atgarder"]]
    if res["varningar"]:
        rad += [""] + [f"*{v}*" for v in res["varningar"]]
    return "\n".join(rad)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("indata")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    with open(a.indata, encoding="utf-8") as f:
        indata = json.load(f)
    try:
        res = balans(indata)
    except IndataFel as e:
        print(json.dumps({"status": "INDATAFEL", "orsak": str(e)}, ensure_ascii=False))
        sys.exit(2)
    print(json.dumps(res, ensure_ascii=False, indent=2) if a.json else rapport(res))


if __name__ == "__main__":
    main()
