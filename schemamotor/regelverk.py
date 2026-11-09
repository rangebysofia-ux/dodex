"""Exportera regelverket som styrdokument: maskinläsbar JSON och läsbar Markdown.

Användning:
    python -m schemamotor.regelverk [--ut docs/styrning]

Värdena hämtas från motorn (STANDARDREGLER, MALORDNING), granskningens regelkoder och
lättmotorns vikter, så dokumentet stämmer med det motorn faktiskt använder. Kör om när en
regel ändras; tests/test_regelverk.py kontrollerar att de incheckade filerna är aktuella.
"""
import argparse
import json
import re
from pathlib import Path

from schemamotor.build import MALORDNING, STANDARDREGLER, malordning

ROT = Path(__file__).resolve().parent.parent
VERSION = "2026-11-07"

NIVAER = {
    "lag": "Arbetstidslagen. Får aldrig brytas.",
    "avtal": "Centralt kollektivavtal (HÖK/AB, Kommunal). Får aldrig brytas; avvikelse kräver lokalt kollektivavtal.",
    "kontrakt": "Löften till medarbetaren: sysselsättningsgrad, arbetstid och antal pass.",
    "verksamhet": "Bemanningsbehovet. Högsta mjuka nivå: hellre en synlig vakans än ett regelbrott.",
    "lokal regel": "Verksamhetens egna beslut. Kallas aldrig avtal.",
    "princip": "Planeringsprinciper för hur schemat ska se ut.",
    "önskemål": "Enskilda medarbetares önskemål. Mjuka, eller hårda om de markeras som krav.",
}

# id, nyckel, namn, nivå, enhet, låst, beskrivning, granskningskod
HARDA = [
    ("DYGNSVILA", "dygnsvila_minuter", "Dygnsvila", "avtal", "minuter (minst 660, kan inte låsas upp)", True,
     "Minst så lång sammanhängande vila per 24-timmarsperiod, räknat från dygnsbrytet. Kontrolleras även över skarven mellan sista och första veckan.", "DYGNSVILA"),
    ("DYGNSBRYT", "dygnsbryt", "Dygnsbryt", "avtal", "klockslag eller auto", False,
     "Var 24-timmarsperioden börjar för dag- och kvällspersonal. 'auto' = där flest pass slutar och börjar; ett klockslag när verksamheten har bestämt sig.", "DYGNSVILA"),
    ("DYGNSBRYT_NATT", "dygnsbryt_natt", "Dygnsbryt för nattpersonal", "avtal", "klockslag eller auto", False,
     "'auto' = där nattpassen oftast slutar; ett klockslag när verksamheten har bestämt sig. En person kan också ha eget dygnsbryt.", "DYGNSVILA"),
    ("VECKOVILA", "veckovila_minuter", "Veckovila", "avtal", "minuter", True,
     "Minst så lång sammanhängande vila per sjudagarsperiod, räknat från veckobrytet.", "VECKOVILA"),
    ("VECKOBRYT", "veckobryt", "Veckobryt", "avtal", "veckodag och klockslag", False,
     "Var sjudagarsperioden för veckovila börjar.", "VECKOVILA"),
    ("RAST_GRANS", "rast_grans_minuter", "Rast efter högst", "lag", "minuter", True,
     "Längsta arbetstid utan rast.", "RAST"),
    ("RAST_LANGD", "rast_minuter", "Rastens längd", "lag", "minuter", True,
     "Rast i pass över gränsen. Nattpass med måltidsuppehåll har ingen rast.", "RAST"),
    ("HELGFREKVENS", "helgfrekvens", "Helgfrekvens för enheten", "lokal regel", "andel helger", True,
     "Varannan helg i fasta grupper A och B. Låst för enheten; undantag bara per person (1/4, 3/4, alla, ingen).", "HELG"),
    ("HEL_HELG", "hel_helg", "Arbetshelg är både lördag och söndag", "lokal regel", "på/av", False, "", "HELG"),
    ("HELG_START", "helg_start", "Helgen börjar", "lokal regel", "veckodag och klockslag", False, "", "HELG"),
    ("HELG_SLUT", "helg_slut", "Helgen slutar", "lokal regel", "veckodag och klockslag", False, "", "HELG"),
    ("FREDAGSKVALL", "ingen_fredagskvall_fore_ledig_helg", "Ingen fredagskväll före ledig helg", "lokal regel", "på/av", False,
     "Den som är ledig helgen arbetar inte kväll eller natt fredagen innan.", "HELG"),
    ("PASS_PER_VECKA", "pass_per_vecka", "Pass per vecka, dag och kväll", "lokal regel", "pass per vecka", False,
     "Antal pass = värdet × veckor. Blir det inte ett heltal (28,5 på 6 veckor) får dag- och kvällspersonal utan angivet antal växelvis avrundat nedåt och uppåt i den ordning de står (28, 29, 28 …). Antal pass kan anges per person.", "ANTAL_PASS"),
    ("MIN_PASSLANGD", "min_passlangd_minuter", "Minsta passlängd", "lokal regel", "minuter", False,
     "Blir passen kortare än så vid låg sysselsättningsgrad tas pass bort i stället: antal pass = arbetstid ÷ minsta längd, avrundat nedåt. 0 stänger av.", "ANTAL_PASS"),
    ("BLOCK_MIN", "block_min", "Minst arbetsdagar i följd", "lokal regel", "dagar", False, "Inga enstaka arbetsdagar.", "BLOCK_MIN"),
    ("BLOCK_MAX", "block_max", "Högst arbetsdagar i följd", "lokal regel", "dagar", False, "", "BLOCK_MAX"),
    ("NATT_I_RAD", "natt_max_i_rad", "Nattpersonal: högst nätter i rad", "lokal regel", "nätter", False,
     "Gäller personal som bara arbetar natt. 0 stänger av.", "NATT_I_RAD"),
    ("TOLERANS", "tolerans_minuter", "Tolerans för arbetstid mot kontrakt", "kontrakt", "minuter per period", False,
     "Nattpersonal: minst ett halvt nattpass.", "TID"),
    ("MORGON_START", "morgon_start", "Dagpass börjar", "princip", "klockslag", False, "Fast start; slutet anpassas.", "PASSFONSTER"),
    ("MORGON_STARTER", "morgon_starter", "Dagpass får också börja", "princip", "klockslag", False,
     "Rörlig start efter täckningen vid klockslag. Motorn väljer en annan start än den vanliga bara när behovet kräver det. Tom lista = fast start.", "PASSFONSTER"),
    ("KVALL_SLUT", "kvall_slut", "Kvällspass slutar", "princip", "klockslag", False, "Fast slut; starten anpassas.", "PASSFONSTER"),
    ("PASSBYTE_FRAN", "kant_fran", "Passbyte tidigast", "princip", "klockslag", False, "Dagpassets slut och kvällspassets start ligger i fönstret.", "PASSFONSTER"),
    ("PASSBYTE_TILL", "kant_till", "Passbyte senast", "princip", "klockslag", False, "", "PASSFONSTER"),
    ("STEG", "steg_minuter", "Steg för passlängder", "princip", "minuter", False, "", None),
    ("LANGD_BAND", "langd_band_minuter", "Största avvikelse från personens snittlängd", "princip", "minuter", False, "", None),
]

# Källa och möjlig avvikelse per hård regel. Kontrollerat mot AB 25 i lydelse 2025-04-01 (SKR) och ATL.
LOKAL = ("Lokalt beslut i verksamheten, inte AB.", "Verksamheten kan ändra regeln för enheten.")
KALLOR = {
    "DYGNSVILA": ("AB 25 § 13 mom. 8 (minst 11 timmars sammanhängande ledighet per 24 timmar) och mom. 5 (arbete och dygnsvila alternerande); ATL 13 §.",
                  "Ingen. 11 timmar är hård i schemaplaneringen och kan inte låsas upp (verksamhetens beslut 2026-11-07). Lokalt kollektivavtal om kortare "
                  "dygnsvila är inte möjligt (AB 25 § 13 mom. 10). AB:s undantag till lägst 9 timmar vid särskilda skäl (mom. 8 a) används inte i planeringen."),
    "DYGNSBRYT_NATT": ("AB 25 § 13 mom. 5: klockslaget när 24-timmarsperioden inleds ska framgå av schemat; nattpersonal kan ha ett eget.", "–"),
    "DYGNSBRYT": ("AB 25 § 13 mom. 5: klockslaget när 24-timmarsperioden för dygnsberäkning inleds ska framgå av schemat.", "–"),
    "VECKOVILA": ("ATL 14 § (36 timmars sammanhängande ledighet per sjudagarsperiod); AB 25 § 13 mom. 7 h.",
                  "Lokalt kollektivavtal om avvikelse (AB 25 § 13 mom. 10 e). Vid tillfällig avvikelse minst 24 timmar (mom. 7 h)."),
    "VECKOBRYT": ("ATL 14 § (sjudagarsperiod).", "–"),
    "RAST_GRANS": ("ATL 15 § (rast senast efter fem timmars arbete); AB 25 § 13 mom. 7 a.",
                   "Kollektivavtal om förläggning av raster (AB 25 § 13 mom. 10 f). Vid nattarbete får rast bytas mot måltidsuppehåll (mom. 7 a)."),
    "RAST_LANGD": ("ATL 15 §.", "Kollektivavtal."),
    "HELGFREKVENS": ("Lokalt beslut i verksamheten, inte AB (beslutat 2026-11-05).",
                     "Låst för enheten. Undantag bara per person (helgfrekvens 1/4, 3/4, alla eller ingen), synligt som undantag."),
    "HEL_HELG": LOKAL, "HELG_START": LOKAL, "HELG_SLUT": LOKAL, "FREDAGSKVALL": LOKAL,
    "PASS_PER_VECKA": LOKAL, "MIN_PASSLANGD": LOKAL, "BLOCK_MIN": LOKAL, "BLOCK_MAX": LOKAL, "NATT_I_RAD": ("Verksamhetens beslut 2026-11-07 (lokal regel, inte avtal).", "Verksamheten kan ändra."),
    "TOLERANS": ("Kontrakt: arbetstiden ska motsvara anställningens omfattning.", "Per person (tolerans_minuter)."),
    "MORGON_STARTER": ("Planeringsprincip; användarens beslut 2026-11-07 (rörlig start efter täckningen).", "Verksamheten kan ändra."),
    "MORGON_START": ("Planeringsprincip.", "Verksamheten kan ändra."), "KVALL_SLUT": ("Planeringsprincip.", "Verksamheten kan ändra."),
    "PASSBYTE_FRAN": ("Planeringsprincip.", "Verksamheten kan ändra."), "PASSBYTE_TILL": ("Planeringsprincip.", "Verksamheten kan ändra."),
    "STEG": ("Planeringsprincip.", "Verksamheten kan ändra."), "LANGD_BAND": ("Planeringsprincip.", "Verksamheten kan ändra."),
    "HELTID": ("Kontrakt eller lokalt beslut. Centralt i AB 25 § 13 mom. 2: 40 timmar per helgfri vecka; 38 timmar 15 minuter när arbetstiden "
               "är förlagd både vardag och sön- eller helgdag; 34 timmar 20 minuter vid kontinuerligt treskift; 36 timmar 20 minuter vid intermittent treskift. "
               "Standardvärdet 37 timmar är inte AB:s centrala nivå.", "Anges per enhet eller person."),
    "HELTID_NATT": ("AB 25 § 13 mom. 2: 34 timmar 20 minuter per vecka vid kontinuerligt treskiftsarbete. Används för nattpersonal "
                    "(verksamhetens beslut 2026-11-07).", "Annan heltid anges för enheten eller per person."),
    "NATTPASS": ("AB 25 § 13 mom. 7 a (rast får bytas mot måltidsuppehåll vid nattarbete) och mom. 7 j (nattpass = minst 3 timmar ordinarie arbetstid mellan kl. 22 och 06).",
                 "Verksamheten bestämmer tiderna."),
    "BERAKNINGSPERIOD": ("AB 25 § 13 mom. 7 g: en beräkningsperiod kan omfatta högst 16 veckor.", "Lokalt kollektivavtal om längre period, högst ett år (mom. 10)."),
    "ARBETSTID_48": ("Anmärkning till AB 25 § 13 mom. 7 g: ordinarie arbetstid högst 48 timmar per vecka i genomsnitt under 4 veckor.", "Lokalt kollektivavtal (mom. 10)."),
    "SCHEMA_14_DAGAR": ("AB 25 § 13 mom. 5: schemat ska meddelas arbetstagaren senast 14 dagar innan det börjar gälla.", "–"),
    "KRAV": ("Medarbetarens önskemål som verksamheten har gjort till krav.", "–"),
    "AKTIVITET": ("Verksamhetens beslut (till exempel APT enligt lokal samverkan). Aktiviteten är arbetstid.", "–"),
    "KOMPETENS": ("Verksamhetens beslut om kompetens i tjänst (till exempel delegering enligt verksamhetens rutin).", "–"),
}

MJUKA = {
    "vakanser": ("Vakanser", "verksamhet", None, "Antal pass och klockslag där behovet inte täcks. Högsta mjuka nivå: behovet görs aldrig hårt.", "BEHOV"),
    "kompetens": ("Kompetens i tjänst", "verksamhet", None,
                  "Antal gånger det saknas någon med en kompetens som krävs, till exempel läkemedelsdelegering på kvällen. "
                  "Direkt efter behovet: motorn väljer vilka som arbetar så att kraven täcks, men lägger aldrig ett extra pass "
                  "för det och gör aldrig en vakans för det. Det som fattas syns som kompetensvakans. Verksamhetens beslut 2026-11-09.", "KOMPETENS"),
    "aktiviteter": ("Aktiviteter under arbetstid", "verksamhet", None,
                    "Saknade deltagare i aktiviteter som APT, därefter ojämn fördelning mellan personerna. Deltagarna arbetar hela "
                    "aktivitetstiden. Aktiviteter markerade som krav är hårda.", "AKTIVITET"),
    "natt_vila": ("Nattpersonal: vila mellan nattblock", "lokal regel", "natt_vila_mellan_block_minuter",
                  "Antal gånger vilan mellan två nattblock är kortare än gränsen (2880 = 48 h, minst två lediga nätter). Mjuk: "
                  "bryts bara när schemat annars inte går ihop. Verksamhetens beslut 2026-11-07.", "NATT_VILA"),
    "hemteam": ("Team: täckning med egen personal", "verksamhet", None,
                "När arbetsgruppen har team med eget behov: antal pass där ett team inte täcks av sin egen personal, så att "
                "någon måste lånas in från ett annat team. Lån är tillåtet; behovet går före. Verksamhetens beslut 2026-11-08.", "TEAM"),
    "blocklangd": ("Dagar i följd över rekommenderat", "princip", "block_rekommenderat", "Antal tillfällen med fler arbetsdagar i följd än rekommenderat.", "BLOCK_REKOMMENDERAT"),
    "passlangd": ("Passlängd", "princip", None, "Minuter från personens snittlängd per pass och från kontrakterad tid.", "TID"),
    "rattvisa_jamn": ("Rättvisa och jämn bemanning", "princip", "jamn_bemanning",
                      "2 × rättvisa (skillnad i antal kvälls- och morgonpass mellan personer som arbetar båda) + jämn bemanning "
                      "(över- och underbemanning lika mellan dag och kväll per vecka och för perioden, och ett växande straff "
                      "för överskott på ett enskilt pass, ungefär kvadratiskt).", "JAMN_BEMANNING"),
    "spridning": ("Blandning av morgon och kväll varje vecka", "princip", "spridning_kvallar",
                  "Veckor med bara morgnar eller bara kvällar för den som arbetar båda. 'stark' flyttar målet direkt efter vakanserna; "
                  "spridning_tolerans 0 = dessutom högst en kvälls skillnad mot morgnarna.", "SPRIDNING"),
    "onskemal": ("Önskemål", "önskemål", None, "Viktade brutna önskemål (vikt 1–10). Önskemål markerade som krav är hårda.", None),
}

INSTALLNINGAR_MJUKA = {
    "kvall_max_i_rad": ("Högst antal kvällar i rad (mjukt räknas med blocklängden)", "kvällar; 0 stänger av"),
    "kvall_i_rad_typ": ("Kvällar i rad: mjuk eller hård", "'mjuk' (eftersträvas) eller 'hard' (lokal regel, regelgrupp KVALL_I_RAD)"),
    "natt_vila_mellan_block_minuter": ("Nattpersonal: vila mellan nattblock", "minuter (2880 = 48 h); 0 stänger av"),
    "block_rekommenderat": ("Helst högst antal dagar i följd", "dagar"),
    "jamn_bemanning": ("Jämn bemanning mellan dag och kväll", "'mjuk' (på) eller 'av'"),
    "spridning_kvallar": ("Blandning av morgon och kväll", "'av', 'mjuk' eller 'stark'"),
    "spridning_tolerans": ("Hur jämn blandningen ska vara", "1 = båda sorterna varje vecka, 0 = nästan lika många"),
}


def _lattvikter():
    """Vikterna i lättmotorn (light/motor.js), lästa ur koden."""
    text = (ROT / "light" / "motor.js").read_text(encoding="utf-8")
    vikt = lambda namn: float(re.search(rf"const {namn} = ([\d.e]+);", text).group(1))  # noqa: E731
    stark, mjuk = map(int, re.search(r'spridning_kvallar === "stark" \? (\d+) : (\d+)', text).groups())
    return [
        {"mal": "Brott mot hård regel", "vikt": vikt("HW"), "per": "brott"},
        {"mal": "Vakant pass", "vikt": vikt("WV"), "per": "pass"},
        {"mal": "Kort vila mellan nattblock", "vikt": vikt("WNV"), "per": "tillfälle"},
        {"mal": "Saknad deltagare i aktivitet", "vikt": vikt("WA"), "per": "deltagare"},
        {"mal": "Blandning morgon och kväll (stark)", "vikt": stark, "per": "vecka utan blandning"},
        {"mal": "Dagar i följd över rekommenderat", "vikt": vikt("WB"), "per": "tillfälle"},
        {"mal": "Jämn bemanning", "vikt": vikt("WJ"), "per": "kvadraten på överskottet per pass, plus skillnaden dag/kväll"},
        {"mal": "Blandning morgon och kväll (mjuk)", "vikt": mjuk, "per": "vecka utan blandning"},
        {"mal": "Rättvisa", "vikt": vikt("WF"), "per": "kvadraten på avvikelsen i antal kvällar"},
        {"mal": "Brutet önskemål", "vikt": vikt("WO"), "per": "viktsteg"},
    ]


def _ob_nivaer():
    text = (ROT / "schemawebb" / "statisk" / "ob.js").read_text(encoding="utf-8")
    ut = []
    for rad in re.findall(r"\{ fran: \"([\d-]+)\", till: \"([\d-]+)\", (A: [^}]+), kalla: \"([^\"]+)\" \}", text):
        fran, till, belopp, kalla = rad
        ut.append({"fran": fran, "till": till, "kalla": kalla, "kr_per_timme": {k: float(v) for k, v in re.findall(r"(\w+): ([\d.]+)", belopp)}})
    prognos = float(re.search(r"const STANDARD_PROGNOS = ([\d.]+);", text).group(1))
    return ut, prognos


def regelverk():
    r = STANDARDREGLER
    harda = [{"id": i, "nyckel": k, "namn": n, "niva": niv, "typ": "hård", "standard": r[k], "enhet": enh, "last": last,
              "beskrivning": b, "granskningskod": kod} for i, k, n, niv, enh, last, b, kod in HARDA]
    harda.append({"id": "HELTID", "nyckel": "heltid_minuter_per_vecka", "namn": "Heltid", "niva": "kontrakt", "typ": "hård",
                  "standard": 2220, "enhet": "minuter per vecka", "last": False, "beskrivning": "", "granskningskod": "TID"})
    harda.append({"id": "HELTID_NATT", "nyckel": "heltid_natt_minuter_per_vecka", "namn": "Heltid för nattpersonal", "niva": "kontrakt",
                  "typ": "hård", "standard": 2060, "enhet": "minuter per vecka (34:20)", "last": False,
                  "beskrivning": "Gäller personal som bara arbetar natt och inte har egen heltid angiven.", "granskningskod": "TID"})
    harda.append({"id": "NATTPASS", "nyckel": "nattpass", "namn": "Nattpass", "niva": "princip", "typ": "hård",
                  "standard": {"start": "21:45", "slut": "06:45", "maltidsuppehall": True}, "enhet": "klockslag", "last": False,
                  "beskrivning": "Med måltidsuppehåll är hela passet arbetstid (ingen rast).", "granskningskod": "RAST"})
    harda.append({"id": "BERAKNINGSPERIOD", "nyckel": "veckor", "namn": "Schemaperiod (beräkningsperiod)", "niva": "avtal", "typ": "hård",
                  "standard": 4, "enhet": "veckor, högst 16", "last": False,
                  "beskrivning": "Kontrolleras i indata: 1–16 veckor.", "granskningskod": None})
    harda.append({"id": "ARBETSTID_48", "nyckel": None, "namn": "Högst 48 timmar per vecka i snitt under 4 veckor", "niva": "avtal", "typ": "hård",
                  "standard": 2880, "enhet": "minuter per vecka i snitt", "last": True,
                  "beskrivning": "Kontrolleras inte separat. Uppfylls när arbetstiden följer kontraktet (högst heltid) och högst 5 arbetsdagar i följd.", "granskningskod": None})
    harda.append({"id": "SCHEMA_14_DAGAR", "nyckel": None, "namn": "Schemat meddelas 14 dagar innan", "niva": "avtal", "typ": "hård",
                  "standard": 14, "enhet": "dagar", "last": True,
                  "beskrivning": "Utanför schemamotorn: verksamhetens ansvar när schemat publiceras.", "granskningskod": None})
    harda.append({"id": "KRAV", "nyckel": "onskemal[].krav", "namn": "Önskemål markerade som krav", "niva": "önskemål", "typ": "hård",
                  "standard": False, "enhet": "per önskemål", "last": False, "beskrivning": "Kan göra schemat olösbart; förklaringen pekar då ut kravet.", "granskningskod": None})
    harda.append({"id": "AKTIVITET", "nyckel": "aktiviteter[].krav", "namn": "Aktiviteter markerade som krav", "niva": "verksamhet", "typ": "hård",
                  "standard": False, "enhet": "per aktivitet", "last": False,
                  "beskrivning": "Den som deltar arbetar hela aktivitetstiden. Kan göra schemat olösbart; förklaringen pekar då ut aktiviteten.",
                  "granskningskod": "AKTIVITET"})
    for h in harda:
        h["kalla"], h["avvikelse"] = KALLOR[h["id"]]
    ordning = malordning(r, MALORDNING)
    mjuka = []
    for plats, mal in enumerate(ordning, 1):
        namn, niva, nyckel, beskr, kod = MJUKA[mal]
        mjuka.append({"ordning": plats, "id": mal, "namn": namn, "niva": niva, "typ": "mjuk", "styrs_av": nyckel,
                      "standard": r.get(nyckel) if nyckel else None, "beskrivning": beskr, "granskningskod": kod})
    ob, prognos = _ob_nivaer()
    return {
        "namn": "DODEX Scheduler – regelverk för schemamotorn",
        "version": VERSION,
        "kalla": "Genererat från schemamotor/build.py (STANDARDREGLER, MALORDNING), light/motor.js och schemawebb/statisk/ob.js med python -m schemamotor.regelverk.",
        "omfattning": "Cykliska grundscheman i dygnet runt-verksamhet inom äldreomsorg och funktionsstöd, Kommunal (HÖK/AB).",
        "principer": [
            "Hårda regler får aldrig brytas. Behovet är högsta mjuka nivå: en vakans är bättre än ett avtalsbrott.",
            "Mjuka mål optimeras i strikt ordning (lexikografiskt); ett lägre mål kan aldrig försämra ett högre.",
            "Låsta regler (dygnsvila, veckovila, rast, varannan helg) kan bara ändras när användaren bekräftar att villkoren i källan är uppfyllda. Bekräftelsen sparas i 'avvikelser' och visas på alla scheman. 11 timmars dygnsvila är hård och kan inte låsas upp alls (AB 25 § 13 mom. 8; verksamhetens beslut 2026-11-07).",
            "Varje hård regel anger sin källa (AB 25, ATL, kontrakt eller lokalt beslut) och vilken avvikelse källan tillåter.",
            "Lokala regler (varannan helg, block 2–5 dagar, 4,75 pass per vecka) kallas aldrig avtalsregler.",
            "Ett färdigt schema granskas av en fristående kontroll som inte delar kod med motorn.",
            "Personal anges med id-koder, aldrig namn.",
        ],
        "nivaer": NIVAER,
        "harda_regler": harda,
        "mjuka_mal": mjuka,
        "installningar_for_mjuka_mal": [{"nyckel": k, "namn": n, "varden": v, "standard": r[k]} for k, (n, v) in INSTALLNINGAR_MJUKA.items()],
        "vikter_lattmotor": _lattvikter(),
        "utanfor_schemalaggningen": {
            "ob": {"kalla": "AB 25 § 21, kalenderstyrt (A storhelg, B helg, C vardagsnatt, D vardagskväll, nattförhöjning för A och B)",
                   "nivaer": ob, "prognos_procent_per_ar_efter_avtalet": prognos,
                   "avrundning": "Per kategori och kalendermånad uppåt till hel- eller halvtimme; under en timme ger inget."},
            "timkostnad_kr": "Valfri; lön och PO utan OB.",
            "startdatum": "Valfri måndag; kopplar grundschemat till verkliga datum.",
            "budget_timmar_vecka": "Valfri; jämförs med kontrakterad tid.",
        },
    }


def markdown(d):
    v = lambda x: ("på" if x else "av") if isinstance(x, bool) else (  # noqa: E731
        f"{x['start']}–{x['slut']}" if isinstance(x, dict) else str(x).replace(".", ","))
    rader = [f"# {d['namn']}", "", f"Version {d['version']}. {d['kalla']}", "", d["omfattning"], "", "## Principer", ""]
    rader += [f"- {p}" for p in d["principer"]]
    rader += ["", "## Nivåer", "", "| Nivå | Innebörd |", "|---|---|"] + [f"| {k} | {t} |" for k, t in d["nivaer"].items()]
    rader += ["", "## Hårda regler", "", "Måste alltid uppfyllas.", "",
              "| Id | Regel | Nyckel | Standard | Enhet | Nivå | Låst | Beskrivning |", "|---|---|---|---|---|---|---|---|"]
    rader += [f"| {x['id']} | {x['namn']} | {('`' + x['nyckel'] + '`') if x['nyckel'] else '–'} | {v(x['standard'])} | {x['enhet']} | {x['niva']} | {'ja' if x['last'] else 'nej'} | {x['beskrivning']} |"
              for x in d["harda_regler"]]
    rader += ["", "### Koppling till AB 25 och ATL", "", "Källa och tillåten avvikelse för varje hård regel. Kontrollerat mot AB 25 i lydelse 2025-04-01 (SKR).", "",
              "| Id | Källa | Avvikelse |", "|---|---|---|"]
    rader += [f"| {x['id']} | {x['kalla']} | {x['avvikelse']} |" for x in d["harda_regler"]]
    rader += ["", "## Mjuka mål", "", "Optimeras i den här ordningen. Ett lägre mål kan aldrig försämra ett högre.", "",
              "| Ordning | Mål | Nivå | Styrs av | Standard | Hur det räknas |", "|---|---|---|---|---|---|"]
    rader += [f"| {x['ordning']} | {x['namn']} | {x['niva']} | {('`' + x['styrs_av'] + '`') if x['styrs_av'] else '–'} | {v(x['standard']) if x['standard'] is not None else '–'} | {x['beskrivning']} |"
              for x in d["mjuka_mal"]]
    rader += ["", "### Inställningar för de mjuka målen", "", "| Nyckel | Namn | Värden | Standard |", "|---|---|---|---|"]
    rader += [f"| `{x['nyckel']}` | {x['namn']} | {x['varden']} | {v(x['standard'])} |" for x in d["installningar_for_mjuka_mal"]]
    rader += ["", "## Vikter i lättmotorn", "", "Lättmotorn (webbläsare och mobil) söker heuristiskt och väger målen med fasta vikter i stället för strikt ordning.", "",
              "| Mål | Vikt | Per |", "|---|---:|---|"]
    rader += [f"| {x['mal']} | {x['vikt']:,.0f} | {x['per']} |".replace(",", " ") for x in d["vikter_lattmotor"]]
    ob = d["utanfor_schemalaggningen"]["ob"]
    rader += ["", "## Utanför schemaläggningen", "", "Påverkar inte hur schemat läggs, bara beräkningar efteråt.", "",
              f"**OB:** {ob['kalla']}. {ob['avrundning']}", "",
              "| Gäller | A | A natt | B | B natt | C | D | Källa |", "|---|---:|---:|---:|---:|---:|---:|---|"]
    rader += [f"| {n['fran']} – {n['till']} | " + " | ".join(v(n["kr_per_timme"][k]) for k in ("A", "A_natt", "B", "B_natt", "C", "D")) + f" | {n['kalla']} |" for n in ob["nivaer"]]
    rader += ["", f"Efter sista kontrollerade nivån: prognos {v(ob['prognos_procent_per_ar_efter_avtalet'])} % per år (inte avtal).", ""]
    rader += [f"- `{k}`: {t}" for k, t in d["utanfor_schemalaggningen"].items() if k != "ob"]
    return "\n".join(rader) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ut", default=str(ROT / "docs" / "styrning"))
    a = ap.parse_args()
    ut = Path(a.ut)
    ut.mkdir(parents=True, exist_ok=True)
    d = regelverk()
    (ut / "dodex-regelverk.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ut / "dodex-regelverk.md").write_text(markdown(d), encoding="utf-8")
    print(f"Skrev {ut / 'dodex-regelverk.json'} och {ut / 'dodex-regelverk.md'}")


if __name__ == "__main__":
    main()
