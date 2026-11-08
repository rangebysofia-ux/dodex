"""Webbtjänst för schemasystemet.

Starta lokalt:
    uvicorn schemawebb.app:app --port 8000

Miljövariabler:
    SCHEMA_LOSENORD   gemensamt lösenord (roll schemaläggare). Utan värde och utan konton krävs ingen
                      inloggning (bara för egen dator). Konton med roller skapas i gränssnittet; det första
                      kontot blir chef. Bara chef får godkänna och aktivera scheman (docs/godkant-schema.md).
    SCHEMA_HEMLIGHET  nyckel för att signera inloggningen. Utan värde härleds den från lösenordet.
    SCHEMA_DATA       katalog för databasen (standard ./data).
    SCHEMA_MAX_TID    högsta antal sekunder per optimeringssteg (standard 60).
    SCHEMA_EXEMPEL    katalog med exempelfall (standard tests/fall).
    ANTHROPIC_API_KEY nyckel för schemaassistenten (console.anthropic.com). Utan den är assistenten avstängd.
    SCHEMA_ASSISTENT_MODELL  Claude-modell för assistenten (standard claude-opus-5-5).
"""
import base64
import copy
import hashlib
import hmac
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import date
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from schemamotor import explain, export, validate
from schemamotor import analys as analysmotor
from schemamotor.balans import balans as rakna_balans
from schemamotor.build import IndataFel, forbered, los
from schemamotor.justera import justera
from schemamotor.modell import kontrollera_indata
from schemamotor.onskemal import beskriv, kontrollera as kontrollera_onskemal
from schemawebb import db

STATISK = Path(__file__).resolve().parent / "statisk"
FALL = next((f for f in (Path(os.environ.get("SCHEMA_EXEMPEL", "")),
                          Path(__file__).resolve().parent.parent / "tests" / "fall",
                          Path.cwd() / "tests" / "fall") if str(f) != "." and f.is_dir()), Path("tests/fall"))
KAKA = "schema_inloggning"
GILTIG_S = 30 * 24 * 3600
MAX_TID = float(os.environ.get("SCHEMA_MAX_TID", 60))

# En lösning i taget, så att lösaren får alla kärnor. Skapas när appen startar.
korare = None


# ---------------------------------------------------------------- inloggning

def _losenord():
    return os.environ.get("SCHEMA_LOSENORD", "")


def _nyckel():
    h = os.environ.get("SCHEMA_HEMLIGHET")
    if not h and _losenord():
        h = "schemasystem:" + _losenord()
    if not h:
        # konton utan gemensamt lösenord och utan SCHEMA_HEMLIGHET: en slumpad nyckel som sparas bredvid databasen
        fil = db.sokvag().parent / "hemlighet"
        fil.parent.mkdir(parents=True, exist_ok=True)
        if not fil.exists():
            fil.write_text(os.urandom(32).hex())
        h = fil.read_text().strip()
    return hashlib.sha256(h.encode()).digest()


def _signera(utgang: int, namn: str = "", roll: str = "") -> str:
    data = (f"{utgang}|{namn}|{roll}" if namn else str(utgang)).encode()
    sig = hmac.new(_nyckel(), data, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(data + b"." + sig).decode()


def _token(token: Optional[str]):
    """(namn eller None) för en giltig inloggning, annars False."""
    if not token:
        return False
    try:
        ra = base64.urlsafe_b64decode(token.encode())
        data, punkt, sig = ra[:-33], ra[-33:-32], ra[-32:]  # signaturen är 32 byte
        if punkt != b".":
            return False
        if not hmac.compare_digest(sig, hmac.new(_nyckel(), data, hashlib.sha256).digest()):
            return False
        delar = data.decode().split("|")
        if int(delar[0]) <= time.time():
            return False
        return delar[1] if len(delar) > 1 and delar[1] else None
    except Exception:
        return False


def _giltig(token: Optional[str]) -> bool:
    return _token(token) is not False


# Lösenord för konton: PBKDF2-SHA256 med salt (standardbiblioteket, inget nytt beroende).
def _hasha(losenord: str, salt: Optional[bytes] = None, varv: int = 200_000) -> str:
    salt = salt or os.urandom(16)
    return f"pbkdf2${varv}${salt.hex()}${hashlib.pbkdf2_hmac('sha256', losenord.encode(), salt, varv).hex()}"


def _stammer(losenord: str, lagrat: str) -> bool:
    try:
        _, varv, salt, h = lagrat.split("$")
        return hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", losenord.encode(), bytes.fromhex(salt), int(varv)).hex(), h)
    except Exception:
        return False


def _kravs() -> bool:
    return bool(_losenord()) or db.antal_anvandare() > 0


def _session(request: Request):
    """Vem som är inloggad: {"anvandare", "roll"} eller None."""
    if not _kravs():
        return {"anvandare": None, "roll": "chef"}  # egen dator utan lösenord och utan konton
    t = _token(request.cookies.get(KAKA))
    if t is False:
        return None
    if t is None:  # gemensamt lösenord
        return {"anvandare": None, "roll": "schemalaggare"} if _losenord() else None
    u = db.anvandare(t)
    return {"anvandare": u["namn"], "roll": u["roll"]} if u else None


def inloggad(request: Request):
    s = _session(request)
    if s is None:
        raise HTTPException(401, "Logga in först.")
    return s


def chef(request: Request):
    s = inloggad(request)
    if s["roll"] != "chef":
        raise HTTPException(403, "Bara en chef kan göra det här. Logga in med ett chefskonto.")
    return s


# ---------------------------------------------------------------- körning

def _kor(kid: int, tid_s: float):
    k = db.korning(kid)
    if k is None:
        return
    indata = k["indata"]
    start = time.time()
    db.uppdatera_korning(kid, status="kör", steg="Lägger schemat")
    try:
        res = los(forbered(copy.deepcopy(indata)), tid_s, min(8, os.cpu_count() or 1), tyst=True)
        falt = {"resultat": res}
        if res["status"] == "OK":
            db.uppdatera_korning(kid, steg="Granskar schemat")
            falt["granskning"] = validate.kontrollera(copy.deepcopy(indata), res)
        else:
            db.uppdatera_korning(kid, steg="Letar efter regler som krockar")
            falt["forklaring"], _ = explain.forklara(forbered(copy.deepcopy(indata)), tid_s)
            # Krockar ett krav (önskemål eller aktivitet som måste genomföras) läggs schemat ändå, med kraven som
            # starka önskemål, så att det finns ett schema att öppna. Avtal och lag ändras aldrig.
            krockar = [k for k in falt["forklaring"].get("konflikt", []) if k["regel"] in ("KRAV", "AKTIVITET")]
            if krockar:
                db.uppdatera_korning(kid, steg="Lägger schemat med kraven som önskemål")
                mjuk = avslappna_krav(indata)
                res2 = los(forbered(copy.deepcopy(mjuk)), tid_s, min(8, os.cpu_count() or 1), tyst=True)
                if res2["status"] == "OK":
                    res2["avslappnade_krav"] = [{"grupp": k["grupp"], "regel": k["regel"], "person": k["person"], "text": k["text"]}
                                                for k in krockar]
                    falt.update(resultat=res2, granskning=validate.kontrollera(copy.deepcopy(mjuk), res2), indata=mjuk)
        db.uppdatera_korning(kid, status="klar", steg=None, sekunder=round(time.time() - start, 1), **falt)
    except IndataFel as e:
        db.uppdatera_korning(kid, status="fel", steg=None, fel=f"Fel i indata: {e}")
    except Exception as e:  # visas för användaren i stället för att körningen hänger
        db.uppdatera_korning(kid, status="fel", steg=None, fel=f"Oväntat fel: {type(e).__name__}: {e}")


def avslappna_krav(indata):
    """Kopia av indata där alla krav (önskemål och aktiviteter) blir starka önskemål. Avtal och lag rörs inte."""
    mjuk = copy.deepcopy(indata)
    for o in mjuk.get("onskemal") or []:
        if o.get("krav"):
            o["krav"] = False
            o["vikt"] = 10
            o["kommentar"] = ((o.get("kommentar") or "") + " (krav som krockade, lagt som starkt önskemål)").strip()
    for a in mjuk.get("aktiviteter") or []:
        if a.get("krav"):
            a["krav"] = False
    return mjuk


def _forhandskontroll(indata):
    """Fel, balans och varningar för önskemål – allt som går att räkna utan lösaren."""
    fel = kontrollera_indata(indata)
    if fel:
        return {"fel": fel, "balans": None, "onskemal": []}
    try:
        bal = rakna_balans(copy.deepcopy(indata))
        onsk = kontrollera_onskemal(copy.deepcopy(indata))
    except IndataFel as e:
        return {"fel": [str(e)], "balans": None, "onskemal": []}
    beskrivningar = {o.get("id") or f"O{i + 1}": beskriv({**o, "id": o.get("id") or f"O{i + 1}"})
                     for i, o in enumerate(indata.get("onskemal", []))}
    return {"fel": [], "balans": bal, "onskemal": onsk, "onskemal_text": beskrivningar}


# ---------------------------------------------------------------- app

@asynccontextmanager
async def livstid(app):
    global korare
    db.anslut()
    korare = ThreadPoolExecutor(max_workers=1, thread_name_prefix="losare")
    yield
    korare.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="Schemasystem", lifespan=livstid, docs_url=None, redoc_url=None)


@app.middleware("http")
async def sakerhet(request: Request, call_next):
    svar = await call_next(request)
    svar.headers["X-Content-Type-Options"] = "nosniff"
    svar.headers["X-Frame-Options"] = "DENY"
    svar.headers["Referrer-Policy"] = "same-origin"
    svar.headers["Cache-Control"] = "no-store"
    return svar


class Inloggning(BaseModel):
    losenord: str
    anvandare: Optional[str] = None


@app.get("/api/session")
def session(request: Request):
    s = _session(request)
    return {"kravs": _kravs(), "inloggad": s is not None, "anvandare": s and s["anvandare"], "roll": s and s["roll"],
            "konton": db.antal_anvandare() > 0, "gemensamt": bool(_losenord())}


@app.post("/api/logga-in")
def logga_in(data: Inloggning, request: Request, response: Response):
    namn = (data.anvandare or "").strip()
    if namn:
        u = db.anvandare(namn)
        if not u or not _stammer(data.losenord, u["losenord"]):
            time.sleep(1)
            raise HTTPException(401, "Fel användarnamn eller lösenord.")
        token = _signera(int(time.time()) + GILTIG_S, u["namn"], u["roll"])
    else:
        if not _kravs():
            return {"ok": True}
        if not _losenord():
            raise HTTPException(401, "Ange ditt användarnamn.")
        if not hmac.compare_digest(data.losenord.encode(), _losenord().encode()):
            time.sleep(1)
            raise HTTPException(401, "Fel lösenord.")
        token = _signera(int(time.time()) + GILTIG_S)
    response.set_cookie(KAKA, token, max_age=GILTIG_S, httponly=True,
                        samesite="strict", secure=request.url.scheme == "https"
                        or request.headers.get("x-forwarded-proto") == "https")
    return {"ok": True}


# ---------------------------------------------------------------- konton och roller

class KontoIn(BaseModel):
    namn: str = Field(min_length=2, max_length=40, pattern=r"^[\w.@-]+$")
    losenord: str = Field(min_length=10, max_length=200)
    roll: Literal["chef", "schemalaggare"] = "schemalaggare"


@app.get("/api/anvandare")
def lista_anvandare(request: Request):
    s = inloggad(request)
    if db.antal_anvandare() and s["roll"] != "chef":
        raise HTTPException(403, "Bara en chef kan se kontona.")
    return db.anvandare_lista()


@app.post("/api/anvandare", status_code=201)
def skapa_anvandare(k: KontoIn, request: Request):
    s = inloggad(request)
    forsta = db.antal_anvandare() == 0
    if not forsta and s["roll"] != "chef":
        raise HTTPException(403, "Bara en chef kan skapa konton.")
    if db.anvandare(k.namn):
        raise HTTPException(409, "Det finns redan ett konto med det namnet.")
    db.skapa_anvandare(k.namn, _hasha(k.losenord), "chef" if forsta else k.roll)  # det första kontot blir chef
    return {"ok": True, "roll": "chef" if forsta else k.roll}


@app.delete("/api/anvandare/{namn}")
def ta_bort_anvandare(namn: str, request: Request):
    chef(request)
    u = db.anvandare(namn)
    if not u:
        raise HTTPException(404, "Kontot finns inte.")
    if u["roll"] == "chef" and db.antal_anvandare("chef") == 1:
        raise HTTPException(409, "Det sista chefskontot kan inte tas bort.")
    db.ta_bort_anvandare(namn)
    return {"ok": True}


class BytLosenord(BaseModel):
    gammalt: str
    nytt: str = Field(min_length=10, max_length=200)


@app.post("/api/anvandare/losenord")
def byt_losenord(b: BytLosenord, request: Request):
    s = inloggad(request)
    u = s["anvandare"] and db.anvandare(s["anvandare"])
    if not u:
        raise HTTPException(409, "Logga in med ditt eget konto för att byta lösenord.")
    if not _stammer(b.gammalt, u["losenord"]):
        time.sleep(1)
        raise HTTPException(401, "Det nuvarande lösenordet stämmer inte.")
    db.byt_losenord(u["namn"], _hasha(b.nytt))
    return {"ok": True}


@app.post("/api/logga-ut")
def logga_ut(response: Response):
    response.delete_cookie(KAKA)
    return {"ok": True}


class EnhetIn(BaseModel):
    namn: str
    indata: dict


@app.get("/api/enheter", dependencies=[Depends(inloggad)])
def lista_enheter():
    return db.enheter()


@app.post("/api/enheter", dependencies=[Depends(inloggad)], status_code=201)
def ny_enhet(e: EnhetIn):
    return {"id": db.skapa_enhet(e.namn.strip() or "Ny enhet", e.indata)}


@app.get("/api/enheter/{eid}", dependencies=[Depends(inloggad)])
def hamta_enhet(eid: int):
    e = db.enhet(eid)
    if not e:
        raise HTTPException(404, "Enheten finns inte.")
    # det godkända schema som gäller i dag, och ett som börjar gälla senare
    idag = date.today().isoformat()
    akt = db.aktiveringar(eid)
    e["aktivt"] = next((a for a in akt if a["fran_datum"] <= idag), None)
    e["kommande"] = next((a for a in reversed(akt) if a["fran_datum"] > idag), None)
    return e


@app.put("/api/enheter/{eid}", dependencies=[Depends(inloggad)])
def spara_enhet(eid: int, e: EnhetIn):
    if not db.spara_enhet(eid, e.namn.strip() or "Namnlös enhet", e.indata):
        raise HTTPException(404, "Enheten finns inte.")
    return {"ok": True}


@app.delete("/api/enheter/{eid}", dependencies=[Depends(inloggad)])
def radera_enhet(eid: int):
    if not db.ta_bort_enhet(eid):
        raise HTTPException(404, "Enheten finns inte.")
    return {"ok": True}


class IndataIn(BaseModel):
    indata: dict


@app.post("/api/kontrollera", dependencies=[Depends(inloggad)])
def kontrollera(d: IndataIn):
    return _forhandskontroll(d.indata)


class ExcelIn(BaseModel):
    fil_base64: str = Field(max_length=20_000_000)


@app.post("/api/bemanningsbalans/las", dependencies=[Depends(inloggad)])
def las_bemanningsbalans(d: ExcelIn):
    """Läs en ifylld bemanningsbalans (Excel-mallen). Filen sparas inte; namn ersätts med id-koder."""
    import io
    from schemamotor.bemanningsbalans import fran_excel
    try:
        delar, personal, meddelanden = fran_excel(io.BytesIO(base64.b64decode(d.fil_base64)))
    except Exception as e:  # noqa: BLE001 – felaktig fil ska ge ett begripligt svar
        raise HTTPException(400, f"Kunde inte läsa filen som en bemanningsbalans: {e}")
    return {"delar": delar, "personal": personal, "meddelanden": meddelanden}


class KorningIn(BaseModel):
    namn: Optional[str] = None
    tid_per_steg_s: Optional[float] = None
    # schemaalternativ: medarbetarstyrt, verksamhetsstyrt eller ekonomistyrt (se PROFILER i build.py)
    profil: Optional[Literal["standard", "medarbetare", "verksamhet", "ekonomi"]] = None


PROFILNAMN = {"medarbetare": "Medarbetarstyrt", "verksamhet": "Verksamhetsstyrt", "ekonomi": "Ekonomistyrt"}


@app.post("/api/enheter/{eid}/korningar", dependencies=[Depends(inloggad)], status_code=202)
def ny_korning(eid: int, k: KorningIn):
    e = db.enhet(eid)
    if not e:
        raise HTTPException(404, "Enheten finns inte.")
    indata = e["indata"]
    kontroll = _forhandskontroll(indata)
    if kontroll["fel"]:
        return JSONResponse({"fel": kontroll["fel"]}, status_code=422)
    tid_s = k.tid_per_steg_s or indata.get("losare", {}).get("tid_per_steg_s", 15)
    tid_s = max(1.0, min(MAX_TID, float(tid_s)))
    namn = (k.namn or "").strip() or f"Körning {len(db.korningar(eid)) + 1}"
    if k.profil and k.profil != "standard":
        indata = copy.deepcopy(indata)
        indata["losare"] = {**(indata.get("losare") or {}), "profil": k.profil}
        if not (k.namn or "").strip():
            namn = f"{PROFILNAMN[k.profil]} ({len(db.korningar(eid)) + 1})"
    kid = db.skapa_korning(eid, namn, indata, kontroll["balans"])
    korare.submit(_kor, kid, tid_s)
    return {"id": kid}


@app.get("/api/enheter/{eid}/korningar", dependencies=[Depends(inloggad)])
def lista_korningar(eid: int):
    return db.korningar(eid)


@app.get("/api/korningar/{kid}", dependencies=[Depends(inloggad)])
def hamta_korning(kid: int):
    k = db.korning(kid)
    if not k:
        raise HTTPException(404, "Körningen finns inte.")
    k["godkand"] = db.aktivering_for(kid)
    return k


@app.delete("/api/korningar/{kid}", dependencies=[Depends(inloggad)])
def radera_korning(kid: int):
    if db.aktivering_for(kid):
        raise HTTPException(409, "Ett godkänt schema är låst och kan inte tas bort.")
    if not db.ta_bort_korning(kid):
        raise HTTPException(404, "Körningen finns inte.")
    return {"ok": True}


# ---------------------------------------------------------------- godkänt och aktiverat schema

class AktiveraIn(BaseModel):
    fran_datum: date


@app.post("/api/korningar/{kid}/aktivera", status_code=201)
def aktivera_korning(kid: int, a: AktiveraIn, request: Request):
    """Chefen godkänner ett schema och aktiverar det från en måndag. Schemat låses (docs/godkant-schema.md)."""
    s = chef(request)
    k = db.korning(kid)
    if not k:
        raise HTTPException(404, "Körningen finns inte.")
    if k["status"] != "klar" or (k.get("resultat") or {}).get("status") != "OK":
        raise HTTPException(409, "Bara ett färdigt schema kan godkännas.")
    brott = len((k.get("granskning") or {}).get("brott", []))
    if brott:
        raise HTTPException(409, f"Schemat har {brott} brott mot hårda regler och kan inte godkännas. Rätta dem först.")
    if db.aktivering_for(kid):
        raise HTTPException(409, "Schemat är redan godkänt.")
    if a.fran_datum.weekday() != 0:
        raise HTTPException(422, "Schemat aktiveras från en måndag.")
    db.aktivera(k["enhet_id"], kid, a.fran_datum.isoformat(), s["anvandare"] or "lokalt")
    return db.aktivering_for(kid)


@app.get("/api/enheter/{eid}/aktiveringar", dependencies=[Depends(inloggad)])
def lista_aktiveringar(eid: int):
    return db.aktiveringar(eid)


def _filnamn(k, slut):
    bas = "".join(c if c.isalnum() or c in "-_" else "_" for c in (k["resultat"].get("enhet") or "schema"))
    return f"{bas}_{k['id']}.{slut}"


def _klar(kid):
    k = db.korning(kid)
    if not k:
        raise HTTPException(404, "Körningen finns inte.")
    if not k.get("resultat") or k["resultat"].get("status") != "OK":
        raise HTTPException(409, "Det finns inget färdigt schema att exportera.")
    return k


@app.post("/api/enheter/{eid}/manuell", dependencies=[Depends(inloggad)], status_code=201)
def manuell_korning(eid: int):
    """Ett tomt schema som användaren lägger själv. Passen räknas om och granskas när de läggs till."""
    e = db.enhet(eid)
    if not e:
        raise HTTPException(404, "Enheten finns inte.")
    indata = e["indata"]
    fel = kontrollera_indata(indata)
    if fel:
        return JSONResponse({"fel": fel}, status_code=422)
    N = indata["veckor"] * 7
    try:
        res = justera(copy.deepcopy(indata), {p["id"]: [None] * N for p in indata["personal"]})
    except IndataFel as err:
        return JSONResponse({"fel": [str(err)]}, status_code=422)
    g = validate.kontrollera(copy.deepcopy(indata), res)
    kid = db.skapa_korning(eid, f"Körning {len(db.korningar(eid)) + 1} (manuell)", indata, None)
    db.uppdatera_korning(kid, status="klar", steg=None, sekunder=0, resultat=res, granskning=g)
    return {"id": kid}


class ImporteradKorningIn(BaseModel):
    namn: str = Field(default="Importerat schema", max_length=200)
    indata: dict
    resultat: dict
    forvantade_vakanser: Optional[float] = None


@app.post("/api/enheter/{eid}/importerad-korning", dependencies=[Depends(inloggad)], status_code=201)
def importerad_korning(eid: int, k: ImporteradKorningIn):
    """Ett schema från en enhetsfil (docs/enhetsfil.md). Det granskas om här; filens egen granskning används inte."""
    if not db.enhet(eid):
        raise HTTPException(404, "Enheten finns inte.")
    if k.resultat.get("status") != "OK" or not isinstance(k.resultat.get("schema"), dict):
        return JSONResponse({"fel": ["Schemat i filen är inte färdigt och kan inte importeras."]}, status_code=422)
    try:
        g = validate.kontrollera(copy.deepcopy(k.indata), copy.deepcopy(k.resultat))
    except Exception:  # noqa: BLE001 – en trasig fil ska ge ett begripligt svar
        return JSONResponse({"fel": ["Schemat i filen gick inte att granska och importerades inte."]}, status_code=422)
    balans = {"forvantade_vakanser": k.forvantade_vakanser} if k.forvantade_vakanser is not None else None
    kid = db.skapa_korning(eid, k.namn.strip() or "Importerat schema", k.indata, balans)
    db.uppdatera_korning(kid, status="klar", steg=None, sekunder=0, resultat=k.resultat, granskning=g)
    return {"id": kid, "brott": len(g.get("brott", []))}


class JusteraIn(BaseModel):
    schemadata: dict = Field(alias="schema")
    namn: Optional[str] = None
    spara: bool = False


@app.post("/api/korningar/{kid}/justera", dependencies=[Depends(inloggad)])
def justera_korning(kid: int, j: JusteraIn):
    """Räkna om ett handjusterat schema. Med spara=true blir det en ny körning; den gamla finns kvar."""
    k = db.korning(kid)
    if not k or k["status"] != "klar" or (k.get("resultat") or {}).get("status") != "OK":
        raise HTTPException(404, "Körningen finns inte eller har inget schema.")
    indata = k["indata"]
    try:
        res = justera(copy.deepcopy(indata), j.schemadata, k["resultat"])
    except IndataFel as e:
        return JSONResponse({"fel": [str(e)]}, status_code=422)
    g = validate.kontrollera(copy.deepcopy(indata), res)
    if not j.spara:
        return {"resultat": res, "granskning": g}
    namn = (j.namn or "").strip() or f"{k['namn']} (justerad)"
    ny = db.skapa_korning(k["enhet_id"], namn, indata, k.get("balans"))
    db.uppdatera_korning(ny, status="klar", steg=None, sekunder=0, resultat=res, granskning=g)
    return {"id": ny}


@app.get("/api/korningar/{kid}/excel", dependencies=[Depends(inloggad)])
def excel(kid: int):
    k = _klar(kid)
    return Response(export.excel(k["resultat"], k.get("granskning"), k.get("indata")),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{_filnamn(k, "xlsx")}"'})


@app.get("/api/korningar/{kid}/pdf", dependencies=[Depends(inloggad)])
def pdf(kid: int):
    k = _klar(kid)
    return Response(export.pdf(k["resultat"], k.get("granskning"), k.get("indata")), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{_filnamn(k, "pdf")}"'})


class GranskaIn(BaseModel):
    indata: dict
    schemadata: dict = Field(alias="schema")


@app.post("/api/granska", dependencies=[Depends(inloggad)])
def granska(g: GranskaIn):
    """Granska ett schema från ett annat system mot reglerna."""
    fel = kontrollera_indata(g.indata)
    if fel:
        return JSONResponse({"fel": fel}, status_code=422)
    return validate.kontrollera(g.indata, g.schemadata)


@app.get("/api/exempel", dependencies=[Depends(inloggad)])
def exempel():
    ut = []
    for f in sorted(FALL.glob("*.json")) if FALL.is_dir() else []:
        d = json.loads(f.read_text(encoding="utf-8"))
        beskr = d.pop("beskrivning", "")
        d.pop("forvantat", None)
        ut.append({"namn": d.get("enhet") or f.stem, "beskrivning": beskr, "indata": d})
    return ut


# ---------------------------------------------------------------- konsekvensanalys
# Analyser finns bara i minnet: de är underlag för ett beslut, inte något som ska sparas.
ANALYSER = {}


class AnalysIn(BaseModel):
    budget: Optional[float] = None
    tid_per_steg_s: Optional[float] = None


def _kor_scenario(aid: str, i: int, tid_s: float):
    a = ANALYSER.get(aid)
    if not a:
        return
    s = a["scenarier"][i]
    s["status"] = "kör"
    try:
        res = los(forbered(copy.deepcopy(s["indata"])), tid_s, min(8, os.cpu_count() or 1), tyst=True)
        g = validate.kontrollera(copy.deepcopy(s["indata"]), res) if res["status"] == "OK" else None
        s.update(resultat=res, granskning=g, status="klar",
                 konsekvenser=analysmotor.konsekvenser(s["indata"], res, g, a["underlag"]["budget_timmar_vecka"]))
    except Exception as e:  # visas för användaren
        s.update(status="fel", fel=f"{type(e).__name__}: {e}")
    if all(x["status"] in ("klar", "fel") for x in a["scenarier"]):
        a["status"] = "klar"
        a["ordning"] = analysmotor.rangordna(a["scenarier"])


@app.post("/api/enheter/{eid}/analys", dependencies=[Depends(inloggad)], status_code=202)
def ny_analys(eid: int, inn: AnalysIn):
    e = db.enhet(eid)
    if not e:
        raise HTTPException(404, "Enheten finns inte.")
    indata = e["indata"]
    fel = kontrollera_indata(indata)
    if fel:
        return JSONResponse({"fel": fel}, status_code=422)
    try:
        f = analysmotor.forslag(indata, inn.budget)
    except IndataFel as ex:
        return JSONResponse({"fel": [str(ex)]}, status_code=422)
    aid = uuid.uuid4().hex[:10]
    for s in f["scenarier"]:
        s["status"] = "i kö"
        try:
            s["balans"] = rakna_balans(copy.deepcopy(s["indata"]))["forvantade_vakanser"]
        except Exception:
            s["balans"] = None
    ANALYSER[aid] = {"id": aid, "enhet_id": eid, "status": "kör", "underlag": f["underlag"], "scenarier": f["scenarier"],
                     "skapad": time.time()}
    while len(ANALYSER) > 20:  # håll minnet litet
        ANALYSER.pop(min(ANALYSER, key=lambda k: ANALYSER[k]["skapad"]))
    tid_s = max(2.0, min(MAX_TID, float(inn.tid_per_steg_s or 5)))
    for i in range(len(f["scenarier"])):
        korare.submit(_kor_scenario, aid, i, tid_s)
    return {"id": aid}


@app.get("/api/analys/{aid}", dependencies=[Depends(inloggad)])
def hamta_analys(aid: str):
    a = ANALYSER.get(aid)
    if not a:
        raise HTTPException(404, "Analysen finns inte längre. Gör en ny.")
    return a


class AnvandIn(BaseModel):
    index: int


@app.post("/api/analys/{aid}/anvand", dependencies=[Depends(inloggad)], status_code=201)
def anvand_forslag(aid: str, inn: AnvandIn):
    """Spara ett förslag som en ny enhet, med det lagda schemat som första körning."""
    a = ANALYSER.get(aid)
    if not a or not 0 <= inn.index < len(a["scenarier"]):
        raise HTTPException(404, "Förslaget finns inte längre.")
    s, e = a["scenarier"][inn.index], db.enhet(a["enhet_id"])
    namn = f"{e['namn'] if e else 'Enhet'} – {s['namn']}"
    indata = copy.deepcopy(s["indata"])
    indata["enhet"] = namn
    eid = db.skapa_enhet(namn, indata)
    if s.get("status") == "klar" and s.get("resultat"):
        kid = db.skapa_korning(eid, "Körning 1 (från analysen)", indata, None)
        db.uppdatera_korning(kid, status="klar", steg=None, resultat=s["resultat"], granskning=s.get("granskning"))
    return {"id": eid}


# ---------------------------------------------------------------- schemaassistent
# Webbläsaren kör verktygen (statisk/assistent.js) och skickar hela samtalet hit; servern lägger
# till nyckeln och anropar Claude. Ändringar som assistenten föreslår godkänns i gränssnittet.

class AssistentIn(BaseModel):
    system: str
    messages: list
    tools: list


@app.get("/api/assistent/status", dependencies=[Depends(inloggad)])
def assistent_status():
    return {"tillganglig": bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))}


@app.post("/api/assistent", dependencies=[Depends(inloggad)])
def assistent(a: AssistentIn):
    if not assistent_status()["tillganglig"]:
        raise HTTPException(503, "Assistenten behöver en API-nyckel från Anthropic. Se docs/assistent.md.")
    import anthropic
    klient = anthropic.Anthropic()
    try:
        svar = klient.beta.messages.create(
            model=os.environ.get("SCHEMA_ASSISTENT_MODELL", "claude-opus-5-5"),
            max_tokens=16000,
            system=a.system,
            messages=a.messages,
            tools=a.tools,
            output_config={"effort": "medium"},
            cache_control={"type": "ephemeral"},
            # om en fråga nekas av säkerhetsfiltren tar en annan modell över i samma anrop
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise HTTPException(502, "API-nyckeln godkändes inte. Kontrollera ANTHROPIC_API_KEY.")
    except anthropic.PermissionDeniedError:
        raise HTTPException(502, "API-nyckeln saknar behörighet till modellen.")
    except anthropic.RateLimitError:
        raise HTTPException(429, "För många frågor just nu. Vänta en stund och försök igen.")
    except anthropic.BadRequestError as e:
        raise HTTPException(502, f"Claude kunde inte läsa frågan: {e.message}")
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"Claude svarade med fel {e.status_code}. Försök igen om en stund.")
    except anthropic.APIConnectionError:
        raise HTTPException(502, "Kunde inte nå Claude. Kontrollera internetanslutningen.")
    return {"content": [b.model_dump(mode="json", exclude_none=True) for b in svar.content],
            "stop_reason": svar.stop_reason}


@app.get("/halsa")
def halsa():
    return {"ok": True}


@app.get("/")
def startsida():
    return FileResponse(STATISK / "index.html")


app.mount("/statisk", StaticFiles(directory=STATISK), name="statisk")
