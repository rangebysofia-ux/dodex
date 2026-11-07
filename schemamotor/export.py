"""Export av ett färdigt schema till Excel och PDF.

Användning:
    python -m schemamotor.export schema.json --excel schema.xlsx --pdf schema.pdf

`schema.json` är utdata från schemamotor.build. Granskningen tas med om den finns i filen
under nyckeln "granskning".
"""
import argparse
import io
import json

DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
KOD = {"morgon": "D", "kvall": "K", "natt": "N"}
DEL = {"morgon": "Dag", "kvall": "Kväll", "natt": "Natt"}
FARG = {"morgon": "FFF1C7", "kvall": "D8E6FF", "natt": "3A3366"}
TEXTFARG = {"morgon": "6B4E00", "kvall": "1F3F86", "natt": "F0EDFF"}


def _tim(m):
    return f"{m // 60}:{m % 60:02d}"


def _akt(p):
    """Aktiviteter i passet som kort text: ' · APT 14:00–16:00'."""
    return "".join(f" · {a.get('id')} {a['start']}–{a['slut']}" for a in (p or {}).get("aktiviteter") or [])


def _resurs(res, indata):
    """Resurspass: pass utöver behovet per dag och dygnsdel, fördelade rättvist (minst resurspass hittills först,
    i en ordning som roterar mellan dagarna). Samma regel som GRAF.resurs i schemawebb/statisk/grafer.js."""
    if not indata:
        return set()
    behov = [{} for _ in range(7)]
    grupper = {"vardag": range(5), "helg": range(5, 7), "alla": range(7)}
    for k, v in (indata.get("behov") or {}).items():
        for i in grupper.get(k, [DAGNAMN.index(k)] if k in DAGNAMN else []):
            behov[i] = v
    pers = list(res["schema"])
    antal, ut = {}, set()
    for d in range(res["veckor"] * 7):
        for del_ in ("morgon", "kvall", "natt"):
            har = [q for q in pers if res["schema"][q][d] and res["schema"][q][d]["dygnsdel"] == del_]
            extra = len(har) - behov[d % 7].get(del_, 0)
            if extra <= 0:
                continue
            har.sort(key=lambda q: (antal.get(q, 0), (pers.index(q) - d) % len(pers)))
            for q in har[:extra]:
                ut.add((q, d))
                antal[q] = antal.get(q, 0) + 1
    return ut


def _bemanning(res, d):
    n = {"morgon": 0, "kvall": 0, "natt": 0}
    for rad in res["schema"].values():
        p = rad[d]
        if p and p["dygnsdel"] in n:
            n[p["dygnsdel"]] += 1
    return n


def _vakanspass(res):
    """Vakanta pass per dag, med dygnsdelens vanligaste tider i schemat."""
    from collections import Counter
    tider = {}
    for rad in res["schema"].values():
        for p in rad:
            if p:
                tider.setdefault(p["dygnsdel"], Counter())[(p["start"], p["slut"])] += 1
    reserv = {"morgon": ("07:00", "15:00"), "kvall": ("14:00", "22:00"), "natt": ("21:45", "06:45")}
    ut = {}
    for v in res.get("vakanser", []):
        if v.get("dygnsdel"):
            s, e = tider[v["dygnsdel"]].most_common(1)[0][0] if v["dygnsdel"] in tider else reserv[v["dygnsdel"]]
            ut.setdefault(v["dag"], []).extend([{"dygnsdel": v["dygnsdel"], "start": s, "slut": e}] * v["antal"])
    ordning = {"morgon": 0, "kvall": 1, "natt": 2}
    for lista in ut.values():
        lista.sort(key=lambda x: ordning[x["dygnsdel"]])
    return ut


def _vakansdagar(res):
    v = {}
    for x in res.get("vakanser", []):
        v.setdefault(x["dag"], []).append(x)
    return v


# ---------------------------------------------------------------- Excel

def excel(res, granskning=None, indata=None):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Schema"
    tunn = Side(style="thin", color="D0D5DD")
    ram = Border(left=tunn, right=tunn, top=tunn, bottom=tunn)
    mitt = Alignment(horizontal="center", vertical="center", wrap_text=True)
    fet = Font(bold=True)
    helgfarg = PatternFill("solid", fgColor="EEF1F5")
    N = res["veckor"] * 7
    pers = list(res["schema"])

    ws["A1"] = res.get("enhet") or "Schema"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = (f"{res['veckor']} veckor{', cykliskt' if res.get('cykliskt') else ''} · "
                f"vakanta pass {res['kpi']['vakanta_pass']} · vakanta tidpunkter {res['kpi']['vakanta_tidpunkter']}")
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
    resurs = _resurs(res, indata)
    for i, pid in enumerate(pers):
        r = 6 + i
        ws.cell(row=r, column=1, value=pid).font = fet
        for d in range(N):
            p = res["schema"][pid][d]
            c = ws.cell(row=r, column=d + 2)
            c.border, c.alignment = ram, mitt
            if p:
                c.value = f"{KOD.get(p['dygnsdel'], p.get('mall', '?'))} {p['start']}–{p['slut']}{_akt(p)}"
                if p["dygnsdel"] in FARG:
                    c.fill = PatternFill("solid", fgColor=FARG[p["dygnsdel"]])
                    c.font = Font(color=TEXTFARG[p["dygnsdel"]], size=9)
                if (pid, d) in resurs:
                    # resurspass, utöver behovet: svart
                    c.value += " ◼R"
                    c.fill = PatternFill("solid", fgColor="141414")
                    c.font = Font(color="FFFFFF", size=9, bold=True)
            elif d % 7 >= 5:
                c.fill = helgfarg
        ws.row_dimensions[r].height = 30
    vp = _vakanspass(res)
    streck = Side(style="dashed", color="D03B3B")
    rader_vak = max((len(x) for x in vp.values()), default=0)
    for k in range(rader_vak):
        r = 6 + len(pers) + k
        ws.cell(row=r, column=1, value="Vakant").font = Font(bold=True, color="D03B3B")
        for d in range(N):
            c = ws.cell(row=r, column=d + 2)
            c.alignment = mitt
            lista = vp.get(d, [])
            if k < len(lista):
                x = lista[k]
                c.value = f"{KOD[x['dygnsdel']]} {x['start']}–{x['slut']}"
                c.font = Font(color=TEXTFARG[x["dygnsdel"]], size=9, italic=True)
                c.border = Border(left=streck, right=streck, top=streck, bottom=streck)
        ws.row_dimensions[r].height = 30
    vak = _vakansdagar(res)
    rod = Font(color="B92A2A", bold=True)
    for j, del_ in enumerate(("morgon", "kvall", "natt")):
        r = 6 + len(pers) + rader_vak + 1 + j
        ws.cell(row=r, column=1, value=f"I tjänst {DEL[del_].lower()}").font = fet
        for d in range(N):
            c = ws.cell(row=r, column=d + 2, value=_bemanning(res, d)[del_])
            c.alignment, c.border = mitt, ram
            if any(x["dygnsdel"] == del_ for x in vak.get(d, [])):
                c.font = rod
    ws.freeze_panes = "B6"

    wp = wb.create_sheet("Per person")
    rubriker = ["Person", "Pass", "Arbetstid (h:mm)", "Mål (h:mm)", "Kvällspass", "Helggrupp"]
    wp.append(rubriker)
    for c in wp[1]:
        c.font = fet
    for pid, k in res["personer"].items():
        wp.append([pid, k["pass"], _tim(k["minuter"]), _tim(k["mal_minuter"]), k["kvallspass"], k["helggrupp"] or "–"])
    for i, w in enumerate((10, 8, 16, 12, 12, 11), 1):
        wp.column_dimensions[get_column_letter(i)].width = w

    wv = wb.create_sheet("Vakanser")
    wv.append(["Vecka", "Dag", "Dygnsdel / klockslag", "Antal"])
    for c in wv[1]:
        c.font = fet
    for x in res.get("vakanser", []):
        wv.append([x["vecka"], x["veckodag"], DEL.get(x["dygnsdel"], f"kl {x['tid']}"), x["antal"]])
    if not res.get("vakanser"):
        wv.append(["Inga vakanser"])

    if res.get("aktiviteter"):
        wa = wb.create_sheet("Aktiviteter")
        wa.append(["Aktivitet", "Vecka", "Dag", "Tid", "Deltagare", "Antal", "Behov", "Saknas"])
        for c in wa[1]:
            c.font = fet
        for t in res["aktiviteter"]:
            wa.append([t["namn"], t["vecka"], t["veckodag"], f"{t['start']}–{t['slut']}", ", ".join(t["deltagare"]),
                       len(t["deltagare"]), t["behov"], t["saknas"]])
        wa.column_dimensions["A"].width = 22
        wa.column_dimensions["E"].width = 40

    if granskning:
        wg = wb.create_sheet("Granskning")
        wg.append(["Regel", "Nivå", "Person", "Beskrivning", "Typ"])
        for c in wg[1]:
            c.font = fet
        for b in granskning.get("brott", []):
            wg.append([b["regel"], b["niva"], b["person"] or "–", b["text"], "Brott"])
        for b in granskning.get("varningar", []):
            wg.append([b["regel"], b["niva"], b["person"] or "–", b["text"], "Att notera"])
        if not granskning.get("brott"):
            wg.append(["", "", "", "Inga brott mot hårda regler.", ""])
        wg.column_dimensions["D"].width = 80

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- PDF

def pdf(res, granskning=None, indata=None):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm, title=res.get("enhet") or "Schema")
    st = getSampleStyleSheet()
    liten = st["BodyText"].clone("liten", fontSize=8, leading=10)
    hex_ = lambda h: colors.HexColor("#" + h)  # noqa: E731
    delar = []
    pers = list(res["schema"])
    vak = _vakansdagar(res)
    vp = _vakanspass(res)
    kpi = res["kpi"]
    rubrik = (f"{res['veckor']} veckor{', cykliskt' if res.get('cykliskt') else ''} · vakanta pass "
              f"{kpi['vakanta_pass']} · vakanta tidpunkter {kpi['vakanta_tidpunkter']}"
              + (f" · brott i granskningen {len(granskning['brott'])}" if granskning else ""))

    for v in range(res["veckor"]):
        delar.append(Paragraph(f"{res.get('enhet') or 'Schema'} – vecka {v + 1}", st["Heading2"]))
        delar.append(Paragraph(rubrik, liten))
        delar.append(Spacer(1, 4 * mm))
        data = [["Person"] + DAGNAMN]
        stil = [("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D5DD")),
                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9), ("FONT", (0, 1), (0, -1), "Helvetica-Bold", 9),
                ("FONT", (1, 1), (-1, -1), "Helvetica", 8.5), ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (6, 0), (7, 0), hex_("EEF1F5"))]
        resurs = _resurs(res, indata)
        for i, pid in enumerate(pers):
            rad = [pid]
            for j in range(7):
                p = res["schema"][pid][v * 7 + j]
                rad.append(f"{KOD.get(p['dygnsdel'], '?')} {p['start']}–{p['slut']}" + _akt(p).replace(" · ", "\n") if p else "")
                if p and p["dygnsdel"] in FARG:
                    stil += [("BACKGROUND", (j + 1, i + 1), (j + 1, i + 1), hex_(FARG[p["dygnsdel"]])),
                             ("TEXTCOLOR", (j + 1, i + 1), (j + 1, i + 1), hex_(TEXTFARG[p["dygnsdel"]]))]
                if p and (pid, v * 7 + j) in resurs:
                    rad[-1] += " R"
                    stil += [("BACKGROUND", (j + 1, i + 1), (j + 1, i + 1), hex_("141414")),
                             ("TEXTCOLOR", (j + 1, i + 1), (j + 1, i + 1), hex_("FFFFFF"))]
            data.append(rad)
        vecka_vak = [vp.get(v * 7 + j, []) for j in range(7)]
        for k in range(max((len(x) for x in vecka_vak), default=0)):
            rad = ["Vakant"]
            for j in range(7):
                if k < len(vecka_vak[j]):
                    x = vecka_vak[j][k]
                    rad.append(f"{KOD[x['dygnsdel']]} {x['start']}–{x['slut']}")
                    stil += [("BOX", (j + 1, len(data)), (j + 1, len(data)), 1.2, hex_("D03B3B"), None, (3, 2)),
                             ("TEXTCOLOR", (j + 1, len(data)), (j + 1, len(data)), hex_(TEXTFARG[x["dygnsdel"]]))]
                else:
                    rad.append("")
            stil.append(("TEXTCOLOR", (0, len(data)), (0, len(data)), hex_("D03B3B")))
            data.append(rad)
        rad = ["I tjänst"]
        for j in range(7):
            d = v * 7 + j
            n = _bemanning(res, d)
            rad.append(f"M{n['morgon']} K{n['kvall']} N{n['natt']}" + (" – vakans" if d in vak else ""))
            if d in vak:
                stil.append(("TEXTCOLOR", (j + 1, len(data)), (j + 1, len(data)), hex_("B92A2A")))
        data.append(rad)
        stil.append(("FONT", (0, len(data) - 1), (-1, len(data) - 1), "Helvetica-Bold", 8))
        t = Table(data, colWidths=[24 * mm] + [34 * mm] * 7, repeatRows=1)
        t.setStyle(TableStyle(stil))
        delar += [t, Spacer(1, 3 * mm), Paragraph("D dag, K kväll, N natt. Vakant = pass som saknar personal (streckad ram). "
                                                           "Svart med R = resurspass, utöver behovet.", liten), PageBreak()]

    delar.append(Paragraph("Per person", st["Heading2"]))
    data = [["Person", "Pass", "Arbetstid", "Mål", "Kvällspass", "Helggrupp"]]
    data += [[pid, k["pass"], _tim(k["minuter"]), _tim(k["mal_minuter"]), k["kvallspass"], k["helggrupp"] or "–"]
             for pid, k in res["personer"].items()]
    t = Table(data, colWidths=[30 * mm, 20 * mm, 30 * mm, 30 * mm, 25 * mm, 25 * mm], repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D5DD")),
                           ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9), ("FONT", (0, 1), (-1, -1), "Helvetica", 9)]))
    delar.append(t)
    if res.get("vakanser"):
        delar.append(Paragraph("Vakanser", st["Heading2"]))
        for x in res["vakanser"]:
            delar.append(Paragraph(f"Vecka {x['vecka']} {x['veckodag']}: {x['antal']} "
                                   f"{DEL[x['dygnsdel']].lower() + 'pass' if x['dygnsdel'] else 'för få kl ' + x['tid']}",
                                   liten))
    if res.get("aktiviteter"):
        delar.append(Paragraph("Aktiviteter", st["Heading2"]))
        for t in res["aktiviteter"]:
            delar.append(Paragraph(f"Vecka {t['vecka']} {t['veckodag']} {t['start']}–{t['slut']} {t['namn']}: "
                                   f"{', '.join(t['deltagare']) or 'inga'}" + (f" (saknas {t['saknas']})" if t["saknas"] else ""),
                                   liten))
    if granskning:
        delar.append(Paragraph("Granskning", st["Heading2"]))
        if granskning["brott"]:
            for b in granskning["brott"]:
                delar.append(Paragraph(f"<b>{b['niva']}</b> {b['person'] or ''} {b['text']}", liten))
        else:
            delar.append(Paragraph("Inga brott mot hårda regler.", liten))
    doc.build(delar)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("schema")
    ap.add_argument("--excel")
    ap.add_argument("--pdf")
    a = ap.parse_args()
    with open(a.schema, encoding="utf-8") as f:
        res = json.load(f)
    if a.excel:
        with open(a.excel, "wb") as f:
            f.write(excel(res, res.get("granskning")))
    if a.pdf:
        with open(a.pdf, "wb") as f:
            f.write(pdf(res, res.get("granskning")))


if __name__ == "__main__":
    main()
