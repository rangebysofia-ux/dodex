"""Lagring i SQLite: enheter (indata) och körningar (resultat).

Filen ligger i katalogen som anges med miljövariabeln SCHEMA_DATA (standard ./data).
"""
import json
import os
import sqlite3
import threading
import time
from pathlib import Path

_las = threading.Lock()
_conn = None

SCHEMA = """
create table if not exists enheter (
    id integer primary key autoincrement,
    namn text not null,
    indata text not null,
    skapad real not null,
    andrad real not null
);
create table if not exists korningar (
    id integer primary key autoincrement,
    enhet_id integer references enheter(id) on delete cascade,
    namn text not null,
    status text not null,
    steg text,
    indata text not null,
    resultat text,
    granskning text,
    forklaring text,
    balans text,
    fel text,
    skapad real not null,
    sekunder real
);
create index if not exists korningar_enhet on korningar(enhet_id);
-- konton med roller: chef (får godkänna och aktivera scheman, hanterar konton) eller schemaläggare
create table if not exists anvandare (
    id integer primary key autoincrement,
    namn text not null unique collate nocase,
    losenord text not null,
    roll text not null check (roll in ('chef', 'schemalaggare')),
    skapad real not null
);
-- godkända och aktiverade grundscheman: körningen är låst och gäller för enheten från datumet
create table if not exists aktiveringar (
    id integer primary key autoincrement,
    enhet_id integer not null references enheter(id) on delete cascade,
    korning_id integer not null unique references korningar(id) on delete cascade,  -- appen hindrar att ett godkänt schema tas bort
    fran_datum text not null,
    godkand_av text not null,
    godkand_tid real not null
);
create index if not exists aktiveringar_enhet on aktiveringar(enhet_id);
"""

JSONFALT = ("indata", "resultat", "granskning", "forklaring", "balans")


def sokvag():
    return Path(os.environ.get("SCHEMA_DATA", "data")) / "schemasystem.db"


def anslut(fil=None):
    global _conn
    with _las:
        if _conn is not None:
            _conn.close()
        fil = Path(fil) if fil else sokvag()
        fil.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(fil, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("pragma foreign_keys = on")
        _conn.execute("pragma journal_mode = wal")
        _conn.executescript(SCHEMA)
        # körningar som var igång när servern stängdes blir aldrig klara
        _conn.execute("update korningar set status = 'fel', fel = 'Avbröts när servern startades om. Kör igen.' "
                      "where status in ('i kö', 'kör')")
        _conn.commit()


def _db():
    if _conn is None:
        anslut()
    return _conn


def _rad(r, falt=JSONFALT):
    if r is None:
        return None
    d = dict(r)
    for k in falt:
        if k in d and d[k] is not None:
            d[k] = json.loads(d[k])
    return d


def kor(sql, *args):
    with _las:
        c = _db().execute(sql, args)
        _db().commit()
        return c


def hamta(sql, *args):
    with _las:
        return [_rad(r) for r in _db().execute(sql, args).fetchall()]


# ---------------------------------------------------------------- enheter

def enheter():
    with _las:
        rader = _db().execute(
            "select e.id, e.namn, e.andrad, json_array_length(json_extract(e.indata, '$.personal')) as personer, "
            "(select count(*) from korningar k where k.enhet_id = e.id) as korningar "
            "from enheter e order by e.andrad desc").fetchall()
    return [dict(r) for r in rader]


def enhet(eid):
    r = hamta("select * from enheter where id = ?", eid)
    return r[0] if r else None


def skapa_enhet(namn, indata):
    nu = time.time()
    return kor("insert into enheter (namn, indata, skapad, andrad) values (?, ?, ?, ?)",
               namn, json.dumps(indata, ensure_ascii=False), nu, nu).lastrowid


def spara_enhet(eid, namn, indata):
    return kor("update enheter set namn = ?, indata = ?, andrad = ? where id = ?",
               namn, json.dumps(indata, ensure_ascii=False), time.time(), eid).rowcount


def ta_bort_enhet(eid):
    return kor("delete from enheter where id = ?", eid).rowcount


# ---------------------------------------------------------------- körningar

def skapa_korning(enhet_id, namn, indata, balans=None):
    return kor("insert into korningar (enhet_id, namn, status, steg, indata, balans, skapad) "
               "values (?, ?, 'i kö', 'Väntar på tur', ?, ?, ?)",
               enhet_id, namn, json.dumps(indata, ensure_ascii=False),
               json.dumps(balans, ensure_ascii=False) if balans is not None else None, time.time()).lastrowid


def uppdatera_korning(kid, **falt):
    if not falt:
        return
    satt = ", ".join(f"{k} = ?" for k in falt)
    varden = [json.dumps(v, ensure_ascii=False) if k in JSONFALT and v is not None else v for k, v in falt.items()]
    kor(f"update korningar set {satt} where id = ?", *varden, kid)


def korning(kid):
    r = hamta("select * from korningar where id = ?", kid)
    return r[0] if r else None


def korningar(enhet_id):
    """Lista utan de stora fälten, men med nyckeltal."""
    with _las:
        rader = _db().execute(
            "select id, enhet_id, namn, status, steg, fel, skapad, sekunder, "
            "json_extract(resultat, '$.status') as losning, json_extract(resultat, '$.kpi') as kpi, "
            "json_array_length(json_extract(granskning, '$.brott')) as brott, "
            "(select a.fran_datum from aktiveringar a where a.korning_id = korningar.id) as godkand_fran "
            "from korningar where enhet_id = ? order by id desc", (enhet_id,)).fetchall()
    ut = []
    for r in rader:
        d = dict(r)
        d["kpi"] = json.loads(d["kpi"]) if d["kpi"] else None
        ut.append(d)
    return ut


def ta_bort_korning(kid):
    return kor("delete from korningar where id = ?", kid).rowcount


# ---------------------------------------------------------------- konton

def anvandare_lista():
    with _las:
        return [dict(r) for r in _db().execute("select id, namn, roll, skapad from anvandare order by namn").fetchall()]


def anvandare(namn):
    with _las:
        r = _db().execute("select * from anvandare where namn = ?", (namn,)).fetchone()
    return dict(r) if r else None


def antal_anvandare(roll=None):
    with _las:
        if roll:
            return _db().execute("select count(*) from anvandare where roll = ?", (roll,)).fetchone()[0]
        return _db().execute("select count(*) from anvandare").fetchone()[0]


def skapa_anvandare(namn, losenord_hash, roll):
    return kor("insert into anvandare (namn, losenord, roll, skapad) values (?, ?, ?, ?)",
               namn, losenord_hash, roll, time.time()).lastrowid


def byt_losenord(namn, losenord_hash):
    return kor("update anvandare set losenord = ? where namn = ?", losenord_hash, namn).rowcount


def ta_bort_anvandare(namn):
    return kor("delete from anvandare where namn = ?", namn).rowcount


# ---------------------------------------------------------------- godkända scheman

def aktivera(enhet_id, korning_id, fran_datum, godkand_av):
    return kor("insert into aktiveringar (enhet_id, korning_id, fran_datum, godkand_av, godkand_tid) values (?, ?, ?, ?, ?)",
               enhet_id, korning_id, fran_datum, godkand_av, time.time()).lastrowid


def aktiveringar(enhet_id):
    """Alla godkända scheman för enheten, nyast först (efter datum de gäller från)."""
    with _las:
        rader = _db().execute(
            "select a.*, k.namn as korning_namn, json_extract(k.resultat, '$.veckor') as veckor "
            "from aktiveringar a join korningar k on k.id = a.korning_id "
            "where a.enhet_id = ? order by a.fran_datum desc, a.id desc", (enhet_id,)).fetchall()
    return [dict(r) for r in rader]


def aktivering_for(korning_id):
    with _las:
        r = _db().execute("select * from aktiveringar where korning_id = ?", (korning_id,)).fetchone()
    return dict(r) if r else None

