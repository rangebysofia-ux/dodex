"""Webbtjänst för schemasystemet.

Starta lokalt:
    uvicorn schemawebb.app:app --port 8000

Miljövariabler:
    SCHEMA_LOSENORD   lösenord för inloggning. Utan värde krävs ingen inloggning (bara för egen dator).
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
from typing import Optional

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
