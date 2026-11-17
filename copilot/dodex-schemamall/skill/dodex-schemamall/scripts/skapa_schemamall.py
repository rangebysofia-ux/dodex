"""Skapar ett grundschema eller en tom schemamall i DODEX Schedulers struktur.

Ger två filer:
  <enhet>.xlsx        samma layout som DODEX Excel-export (flikarna Schema, Per person, Vakanser, Granskning)
  <enhet>.dodex.json  enhetsfil som öppnas i DODEX (Mina enheter -> Öppna fil); schemat granskas om där

Användning i kodtolken:
    from skapa_schemamall import skapa
    filer = skapa(underlag, mapp="/mnt/data")

`underlag` är en dict (se references/underlag.md):
    {"enhet": "Forellen 3A", "veckor": 6, "cykliskt": True,
     "behov": {"vardag": {"dag": 3, "kvall": 3, "natt": 1}, "helg": {"dag": 2, "kvall": 2, "natt": 1}},
     "personal": [{"id": "A1", "grad": 1.0}, {"id": "N1", "grad": 0.8, "natt": True}],
     "schema": {"A1": ["D 07:00–15:15", None, ...]},            # utelämnas = tom mall
     "granskning": [{"regel": "DYGNSVILA", "niva": "avtal", "person": "A1", "text": "...", "typ": "Brott"}]}

Bara openpyxl behövs. Id-koder, aldrig namn.
"""
import json
import re
from datetime import datetime, timezone

DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
DEL = {"morgon": "Dag", "kvall": "Kväll", "natt": "Natt"}
KOD = {"morgon": "D", "kvall": "K", "natt": "N"}
FARG = {"morgon": "F6EAC8", "kvall": "D9E6DF", "natt": "DDE3EC"}
TEXTFARG = {"morgon": "5E4710", "kvall": "173F30", "natt": "22344F"}
# koder i cellerna: D dag, K kväll, N natt; i förskola T tidig, M mellan (dag) och S sen (kväll)
KODER = {"D": "morgon", "T": "morgon", "M": "morgon", "K": "kvall", "S": "kvall", "N": "natt"}
CELL = re.compile(r"^\s*([DTMKSN])\w*\s+(\d{1,2})[:.](\d{2})\s*[–\-]\s*(\d{1,2})[:.](\d{2})")
DYGN = 24 * 60


def _klocka(m):
    m %= DYGN
    return f"{m // 60:02d}:{m % 60:02d}"


def _tim(m):
    return f"{m // 60}:{m % 60:02d}"


def las_cell(text, rast_grans=300, rast=30):
    """'D 07:00–15:15' -> pass som i DODEX (dygnsdel, start, slut, rast, netto). Tom cell -> None."""
    if text is None or str(text).strip() in ("", "-", "–", "L", "Ledig", "ledig"):
        return None
    m = CELL.match(str(text))
    if not m:
        raise ValueError(f"Cellen '{text}' går inte att läsa. Skriv till exempel 'D 07:00–15:15'.")
    del_ = KODER[m.group(1)]
    s, e = int(m.group(2)) * 60 + int(m.group(3)), int(m.group(4)) * 60 + int(m.group(5))
    if e <= s:
        e += DYGN
    langd = e - s
    if del_ == "natt":  # måltidsuppehåll i stället för rast
        p = {"mall": "N", "dygnsdel": "natt", "start": _klocka(s), "slut": _klocka(e), "rast": 0, "netto": langd,
             "maltidsuppehall": True}
    else:
        r = 0 if langd <= rast_grans else rast  # rast när passet är längre än 5 timmar (som DODEX)
        p = {"mall": f"{KOD[del_]}{_klocka(s)}-{_klocka(e)}", "dygnsdel": del_, "start": _klocka(s),
             "slut": _klocka(e), "rast": r, "netto": langd - r}
    return p


def _behov_per_dag(behov):
    """{'vardag': {'dag': 3, ...}, 'helg': {...}, 'fre': {...}} -> lista med 7 dagar {'morgon','kvall','natt'}."""
    ut = [{"morgon": 0, "kvall": 0, "natt": 0} for _ in range(7)]
    namn = {"dag": "morgon", "morgon": "morgon", "kvall": "kvall", "kväll": "kvall", "natt": "natt"}
    ordning = ["alla", "vardag", "helg"] + DAGNAMN
    for k in sorted(behov or {}, key=lambda x: ordning.index(x) if x in ordning else 99):
        dagar = {"alla": range(7), "vardag": range(5), "helg": range(5, 7)}.get(k, [DAGNAMN.index(k)] if k in DAGNAMN else [])
        for d in dagar:
            for del_, v in (behov[k] or {}).items():
                if del_ in namn:
                    ut[d][namn[del_]] = int(v or 0)
    return ut


def _indata_behov(per_dag):
    v, h = per_dag[0], per_dag[5]
    return {"vardag": dict(v), "helg": dict(h)}


def skapa(u, mapp=".", filnamn=None):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    enhet, W = u.get("enhet") or "Schema", int(u.get("veckor") or 4)
    cyk, N = bool(u.get("cykliskt", True)), int(u.get("veckor") or 4) * 7
    pers = u.get("personal") or []
    if not pers:
        raise ValueError("Lägg till minst en person (id-kod och sysselsättningsgrad).")
    rad_in = u.get("schema") or {}
    schema = {}
    for p in pers:
        celler = list(rad_in.get(p["id"], []))[:N]
        celler += [None] * (N - len(celler))
        schema[p["id"]] = [las_cell(c) for c in celler]
    behov = _behov_per_dag(u.get("behov") or {})
    heltid = u.get("heltid_minuter_per_vecka") or 2220
    heltid_natt = u.get("heltid_natt_minuter_per_vecka") or 2060

    # bemanning, vakanser och nyckeltal
    i_tjanst = [{k: sum(1 for r in schema.values() if r[d] and r[d]["dygnsdel"] == k) for k in DEL} for d in range(N)]
    vakanser = []
    for d in range(N):
        for k in DEL:
            saknas = behov[d % 7][k] - i_tjanst[d][k]
            if saknas > 0:
                vakanser.append({"dag": d, "vecka": d // 7 + 1, "veckodag": DAGNAMN[d % 7], "dygnsdel": k, "tid": None, "antal": saknas})
    personer = {}
    for p in pers:
        rad = [x for x in schema[p["id"]] if x]
        natt = bool(p.get("natt")) or (p.get("dygnsdelar") == ["natt"])
        helger = ["J" if (schema[p["id"]][w * 7 + 5] or schema[p["id"]][w * 7 + 6]) else "L" for w in range(W)]
        grupp = "A" if helger[0::2] and all(h == "J" for h in helger[0::2]) and all(h == "L" for h in helger[1::2]) else \
                "B" if helger[1::2] and all(h == "J" for h in helger[1::2]) and all(h == "L" for h in helger[0::2]) else None
        personer[p["id"]] = {"pass": len(rad), "minuter": sum(x["netto"] for x in rad),
                             "mal_minuter": round((p.get("heltid_minuter_per_vecka") or (heltid_natt if natt else heltid)) * float(p.get("grad", 1)) * W),
                             "kvallspass": sum(1 for x in rad if x["dygnsdel"] == "kvall"), "helggrupp": grupp}
    vak = sum(v["antal"] for v in vakanser)
    resultat = {"status": "OK", "enhet": enhet, "veckor": W, "cykliskt": cyk, "profil": "standard", "steg": [],
                "kpi": {"vakanser": vak, "vakanta_pass": vak, "vakanta_tidpunkter": 0}, "personer": personer,
                "vakanser": vakanser, "aktiviteter": [], "schema": schema}

    # --- Excel, som DODEX export
    wb = Workbook()
    ws = wb.active
    ws.title = "Schema"
    tunn = Side(style="thin", color="D0D5DD")
    ram = Border(left=tunn, right=tunn, top=tunn, bottom=tunn)
    mitt = Alignment(horizontal="center", vertical="center", wrap_text=True)
    fet = Font(bold=True)
    helgfarg = PatternFill("solid", fgColor="EEF1F5")
    ws["A1"] = enhet
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"{W} veckor{', cykliskt' if cyk else ''} · vakanta pass {vak} · vakanta tidpunkter 0"
    ws.cell(row=4, column=1, value="Vecka").font = fet
    ws.cell(row=5, column=1, value="Person").font = fet
    for d in range(N):
        c = d + 2
        if d % 7 == 0:
            ws.cell(row=4, column=c, value=f"Vecka {d // 7 + 1}").font = fet
            ws.merge_cells(start_row=4, start_column=c, end_row=4, end_column=c + 6)
        h = ws.cell(row=5, column=c, value=DAGNAMN[d % 7])
        h.font, h.alignment, h.border = fet, mitt, ram
        if d % 7 >= 5:
            h.fill = helgfarg
        ws.column_dimensions[get_column_letter(c)].width = 11
    ws.column_dimensions["A"].width = 12
    for i, p in enumerate(pers):
        r = 6 + i
        ws.cell(row=r, column=1, value=p["id"]).font = fet
        for d in range(N):
            x, c = schema[p["id"]][d], ws.cell(row=r, column=d + 2)
            c.border, c.alignment = ram, mitt
            if x:
                c.value = f"{KOD[x['dygnsdel']]} {x['start']}–{x['slut']}"
                c.fill = PatternFill("solid", fgColor=FARG[x["dygnsdel"]])
                c.font = Font(color=TEXTFARG[x["dygnsdel"]], size=9)
            elif d % 7 >= 5:
                c.fill = helgfarg
        ws.row_dimensions[r].height = 30
    per_dag_vak = {}
    for v in vakanser:
        per_dag_vak.setdefault(v["dag"], []).extend([v["dygnsdel"]] * v["antal"])
    rader_vak = max((len(x) for x in per_dag_vak.values()), default=0)
    streck = Side(style="dashed", color="D03B3B")
    for k in range(rader_vak):
        r = 6 + len(pers) + k
        ws.cell(row=r, column=1, value="Vakant").font = Font(bold=True, color="D03B3B")
        for d in range(N):
            lista = per_dag_vak.get(d, [])
            if k < len(lista):
                c = ws.cell(row=r, column=d + 2, value=f"{KOD[lista[k]]} vakant")
                c.alignment = mitt
                c.font = Font(color=TEXTFARG[lista[k]], size=9, italic=True)
                c.border = Border(left=streck, right=streck, top=streck, bottom=streck)
    for j, del_ in enumerate(DEL):
        r = 6 + len(pers) + rader_vak + 1 + j
        ws.cell(row=r, column=1, value=f"I tjänst {DEL[del_].lower()}").font = fet
        for d in range(N):
            c = ws.cell(row=r, column=d + 2, value=i_tjanst[d][del_])
            c.alignment, c.border = mitt, ram
            if behov[d % 7][del_] > i_tjanst[d][del_]:
                c.font = Font(color="B92A2A", bold=True)
    ws.freeze_panes = "B6"

    wp = wb.create_sheet("Per person")
    wp.append(["Person", "Pass", "Arbetstid (h:mm)", "Mål (h:mm)", "Kvällspass", "Helggrupp"])
    for c in wp[1]:
        c.font = fet
    for pid, k in personer.items():
        wp.append([pid, k["pass"], _tim(k["minuter"]), _tim(k["mal_minuter"]), k["kvallspass"], k["helggrupp"] or "–"])
    for i, w in enumerate((10, 8, 16, 12, 12, 11), 1):
        wp.column_dimensions[get_column_letter(i)].width = w

    wv = wb.create_sheet("Vakanser")
    wv.append(["Vecka", "Dag", "Dygnsdel / klockslag", "Antal"])
    for c in wv[1]:
        c.font = fet
    for x in vakanser:
        wv.append([x["vecka"], x["veckodag"], DEL[x["dygnsdel"]], x["antal"]])
    if not vakanser:
        wv.append(["Inga vakanser"])

    wg = wb.create_sheet("Granskning")
    wg.append(["Regel", "Nivå", "Person", "Beskrivning", "Typ"])
    for c in wg[1]:
        c.font = fet
    for b in u.get("granskning") or []:
        wg.append([b.get("regel", ""), b.get("niva", ""), b.get("person") or "–", b.get("text", ""), b.get("typ", "Brott")])
    if not u.get("granskning"):
        wg.append(["", "", "", "Inte granskat. Öppna enhetsfilen i DODEX och titta under Regelkontroll.", ""])
    for i, w in enumerate((16, 12, 10, 70, 12), 1):
        wg.column_dimensions[get_column_letter(i)].width = w

    # --- enhetsfil för DODEX
    indata = {"enhet": enhet, "veckor": W, "cykliskt": cyk, "behov": _indata_behov(behov),
              "personal": [{k: v for k, v in {"id": p["id"], "grad": float(p.get("grad", 1)),
                                              "dygnsdelar": ["natt"] if p.get("natt") else p.get("dygnsdelar"),
                                              **{x: p.get(x) for x in ("antal_pass", "helgfrekvens", "helggrupp", "extra_helgpass",
                                                                       "team", "kompetenser", "heltid_minuter_per_vecka")}}.items() if v is not None}
                           for p in pers], "onskemal": []}
    for k in ("heltid_minuter_per_vecka", "heltid_natt_minuter_per_vecka", "regler", "avvikelser", "regelverk"):
        if u.get(k) is not None:
            indata[k] = u[k]
    nu = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    fil = {"format": "dodex-enhet", "version": 1, "kalla": "copilot", "sparad": nu,
           "enhet": {"namn": enhet, "indata": indata},
           "korningar": [{"namn": u.get("schemanamn") or "Schema från Copilot", "skapad": nu, "indata": indata,
                          "resultat": resultat, "forvantade_vakanser": None}] if rad_in else []}
    bas = filnamn or (re.sub(r"[^\wåäöÅÄÖ -]", "", enhet).strip() or "schema")
    xlsx, js = f"{mapp}/{bas}.xlsx", f"{mapp}/{bas}.dodex.json"
    wb.save(xlsx)
    with open(js, "w", encoding="utf-8") as f:
        json.dump(fil, f, ensure_ascii=False, indent=1)
    return {"excel": xlsx, "enhetsfil": js, "vakanta_pass": vak, "personer": personer}


if __name__ == "__main__":
    import sys
    with open(sys.argv[1], encoding="utf-8") as f:
        print(json.dumps(skapa(json.load(f), mapp=sys.argv[2] if len(sys.argv) > 2 else "."), ensure_ascii=False, indent=1))
