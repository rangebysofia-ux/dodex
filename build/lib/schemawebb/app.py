"""Webbtjänst för schemasystemet.

Starta lokalt:
    uvicorn schemawebb.app:app --port 8000

Miljövariabler:
    SCHEMA_LOSENORD   lösenord för inloggning. Utan värde krävs ingen inloggning (bara för egen dator).
    SCHEMA_HEMLIGHET  nyckel för att signera inloggningen. Utan värde härleds den från lösenordet.
    SCHEMA_DATA       katalog för databasen (standard ./data).
    SCHEMA_MAX_TID    högsta antal sekunder per optimeringssteg (standard 60).
    SCHEMA_EXEMPEL    katalog med exempelfall (standard tests/fall).
"""
import base64
import copy
import hashlib
import hmac
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from schemamotor import explain, export, validate
from schemamotor.balans import balans as rakna_balans
from schemamotor.build import IndataFel, forbered, los
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
    h = os.environ.get("SCHEMA_HEMLIGHET") or ("schemasystem:" + _losenord())
    return hashlib.sha256(h.encode()).digest()


def _signera(utgang: int) -> str:
    data = str(utgang).encode()
    sig = hmac.new(_nyckel(), data, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(data + b"." + sig).decode()


def _giltig(token: Optional[str]) -> bool:
    if not token:
        return False
    try:
        ra = base64.urlsafe_b64decode(token.encode())
        data, sig = ra.split(b".", 1)
        return (hmac.compare_digest(sig, hmac.new(_nyckel(), data, hashlib.sha256).digest())
                and int(data) > time.time())
    except Exception:
        return False


def inloggad(request: Request):
    if _losenord() and not _giltig(request.cookies.get(KAKA)):
        raise HTTPException(401, "Logga in först.")


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
        db.uppdatera_korning(kid, status="klar", steg=None, sekunder=round(time.time() - start, 1), **falt)
    except IndataFel as e:
        db.uppdatera_korning(kid, status="fel", steg=None, fel=f"Fel i indata: {e}")
    except Exception as e:  # visas för användaren i stället för att körningen hänger
        db.uppdatera_korning(kid, status="fel", steg=None, fel=f"Oväntat fel: {type(e).__name__}: {e}")


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


@app.get("/api/session")
def session(request: Request):
    return {"kravs": bool(_losenord()), "inloggad": not _losenord() or _giltig(request.cookies.get(KAKA))}


@app.post("/api/logga-in")
def logga_in(data: Inloggning, request: Request, response: Response):
    if not _losenord():
        return {"ok": True}
    if not hmac.compare_digest(data.losenord.encode(), _losenord().encode()):
        time.sleep(1)
        raise HTTPException(401, "Fel lösenord.")
    response.set_cookie(KAKA, _signera(int(time.time()) + GILTIG_S), max_age=GILTIG_S, httponly=True,
                        samesite="strict", secure=request.url.scheme == "https"
                        or request.headers.get("x-forwarded-proto") == "https")
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


class KorningIn(BaseModel):
    namn: Optional[str] = None
    tid_per_steg_s: Optional[float] = None


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
    return k


@app.delete("/api/korningar/{kid}", dependencies=[Depends(inloggad)])
def radera_korning(kid: int):
    if not db.ta_bort_korning(kid):
        raise HTTPException(404, "Körningen finns inte.")
    return {"ok": True}


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


@app.get("/api/korningar/{kid}/excel", dependencies=[Depends(inloggad)])
def excel(kid: int):
    k = _klar(kid)
    return Response(export.excel(k["resultat"], k.get("granskning")),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{_filnamn(k, "xlsx")}"'})


@app.get("/api/korningar/{kid}/pdf", dependencies=[Depends(inloggad)])
def pdf(kid: int):
    k = _klar(kid)
    return Response(export.pdf(k["resultat"], k.get("granskning")), media_type="application/pdf",
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


@app.get("/halsa")
def halsa():
    return {"ok": True}


@app.get("/")
def startsida():
    return FileResponse(STATISK / "index.html")


app.mount("/statisk", StaticFiles(directory=STATISK), name="statisk")
