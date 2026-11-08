"""Organisationsstruktur (schemawebb/statisk/organisation.js och /api/organisation). Se docs/organisation.md."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROT = Path(__file__).resolve().parent.parent


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.delenv("SCHEMA_LOSENORD", raising=False)
    from schemawebb import db
    db.anslut(tmp_path / "data" / "schemasystem.db")
    from schemawebb.app import app
    with TestClient(app) as k:
        yield k


INDATA = {"veckor": 4, "behov": {}, "personal": [{"id": "A1", "grad": 1}]}


def test_enheter_placeras_och_flyttas(klient):
    assert klient.get("/api/organisation").json() == {"noder": None}  # startstrukturen ligger i organisation.js
    a = klient.post("/api/enheter", json={"namn": "E1", "indata": INDATA, "org": "sabo"}).json()["id"]
    b = klient.post("/api/enheter", json={"namn": "E2", "indata": INDATA}).json()["id"]
    assert {e["namn"]: e["org"] for e in klient.get("/api/enheter").json()} == {"E1": "sabo", "E2": None}
    # att spara enheten utan org behåller platsen
    klient.put(f"/api/enheter/{a}", json={"namn": "E1", "indata": INDATA})
    assert klient.get(f"/api/enheter/{a}").json()["org"] == "sabo"
    assert klient.post(f"/api/enheter/{b}/flytta", json={"org": "lss"}).status_code == 200
    assert klient.get(f"/api/enheter/{b}").json()["org"] == "lss"


def test_struktur_sparas_och_borttagen_grupp_flyttar_upp(klient):
    noder = [{"id": "aldreomsorg", "namn": "Äldreomsorg", "forelder": None},
             {"id": "sabo", "namn": "SÄBO", "forelder": "aldreomsorg"},
             {"id": "omrade-norr", "namn": "Område norr", "forelder": "sabo"}]
    assert klient.put("/api/organisation", json={"noder": noder}).status_code == 200
    e = klient.post("/api/enheter", json={"namn": "E", "indata": INDATA, "org": "omrade-norr"}).json()["id"]
    assert klient.put("/api/organisation", json={"noder": noder[:2]}).status_code == 200
    assert klient.get(f"/api/enheter/{e}").json()["org"] == "sabo"  # flyttad upp ett steg
    # fel struktur avvisas
    assert klient.put("/api/organisation", json={"noder": noder[:1] + [{"id": "x", "namn": "X", "forelder": "finns-inte"}]}).status_code == 422
    cirkel = [{"id": "a", "namn": "A", "forelder": "b"}, {"id": "b", "namn": "B", "forelder": "a"}]
    assert klient.put("/api/organisation", json={"noder": cirkel}).status_code == 422
    assert klient.put("/api/organisation", json={"noder": noder[:1] * 2}).status_code == 422


@pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")
def test_organisation_js():
    kod = r"""
const O = require(process.argv[1]); let n = O.kopia(); const ut = {};
ut.start = n.map(x => x.namn);
n = O.lagg(n, "Område norr", "sabo"); ut.sokvag = O.sokvag(n, "omrade-norr");
try { O.lagg(n, "säbo", "aldreomsorg"); } catch (e) { ut.dubblett = e.message; }
try { O.taBort(n, "sabo"); } catch (e) { ut.undergrupp = e.message; }
ut.flytta = O.taBort(n, "omrade-norr").flyttaTill;
const h = O.trad(n, [{ id: 1, namn: "E1", org: "omrade-norr" }, { id: 2, namn: "E2", org: "okand" }], { ritaEnhet: e => `[${e.namn}]` });
ut.trad = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
process.stdout.write(JSON.stringify(ut));"""
    ut = json.loads(subprocess.run(["node", "-e", kod, str(ROT / "schemawebb" / "statisk" / "organisation.js")],
                                   capture_output=True, text=True, timeout=60, check=True).stdout)
    assert ut["start"] == ["Äldreomsorg", "SÄBO", "Hemtjänst", "LSS", "Förskola"]
    assert ut["sokvag"] == "Äldreomsorg › SÄBO › Område norr"
    assert "redan" in ut["dubblett"] and "undergrupperna" in ut["undergrupp"]
    assert ut["flytta"] == "sabo"
    assert ut["trad"].startswith("Äldreomsorg 1 enhet SÄBO 1 enhet Område norr 1 enhet [E1]")
    assert ut["trad"].endswith("Utan placering 1 enhet [E2]")  # okänd plats visas utan placering
