"""Sidan Organisation: struktur med enheter och områden/team utan schema, organisationens aktivitetstyper och
aktivitetsfärger i schemat. Se docs/organisation.md."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from schemamotor.build import forbered, los
from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent
STATISK = ROT / "schemawebb" / "statisk"
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def kor_js(kod):
    return json.loads(subprocess.run(["node", "-e", kod, str(STATISK)], capture_output=True, text=True,
                                     timeout=60, check=True).stdout)


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.delenv("SCHEMA_LOSENORD", raising=False)
    from schemawebb import db
    db.anslut(tmp_path / "data" / "schemasystem.db")
    from schemawebb.app import app
    with TestClient(app) as k:
        yield k


def test_aktivitetstyper_sparas_och_valideras(klient):
    assert klient.get("/api/aktivitetstyper").json() == {"typer": None}  # standardtyperna ligger i organisation.js
    typer = [{"id": "apt", "namn": "APT", "typ": "apt", "farg": "#3f6bb0"},
             {"id": "brandovning", "namn": "Brandövning", "typ": "utbildning", "farg": "#c0473f"}]
    assert klient.put("/api/aktivitetstyper", json={"typer": typer}).status_code == 200
    assert klient.get("/api/aktivitetstyper").json()["typer"][1]["namn"] == "Brandövning"
    assert klient.put("/api/aktivitetstyper", json={"typer": typer[:1] * 2}).status_code == 422
    assert klient.put("/api/aktivitetstyper", json={"typer": [{**typer[0], "typ": "fest"}]}).status_code == 422
    assert klient.put("/api/aktivitetstyper", json={"typer": [{**typer[0], "farg": "blå"}]}).status_code == 422


def test_enhet_utan_schema_med_team_syns_i_listan(klient):
    ind = {"enhet": "Hemtjänst Centrum", "veckor": 4, "cykliskt": True, "behov": {}, "personal": [], "onskemal": [],
           "team": [{"id": "T1", "namn": "Öst", "farg": "#c46a2b", "behov": {}}]}
    klient.post("/api/enheter", json={"namn": "Hemtjänst Centrum", "indata": ind, "org": "hemtjanst"})
    e = klient.get("/api/enheter").json()[0]
    assert e["team"] == [{"id": "T1", "namn": "Öst", "farg": "#c46a2b"}] and e["korningar"] == 0


@nod
def test_team_laggs_till_utan_att_behovet_forsvinner():
    ut = kor_js(r"""
const T = require(process.argv[1] + "/team.js"), r = {};
const ind = { behov: { vardag: { morgon: 3, kvall: 2, natt: 1 }, helg: { morgon: 2, kvall: 2, natt: 1 } }, personal: [{ id: "A1" }] };
T.laggTill(ind, "Öst"); r.forsta = JSON.parse(JSON.stringify(ind));
T.laggTill(ind, "Väst"); r.andra = ind.team.map(t => [t.namn, t.farg]); r.behov2 = ind.behov;
ind.personal[0].team = "T1"; T.bytNamn(ind, "T2", "  Norr "); r.namn = ind.team[1].namn;
T.taBort(ind, "T1"); r.efterBort = { team: ind.team.map(t => t.id), pers: ind.personal[0].team || null, behov: ind.behov };
T.taBort(ind, "T2"); r.sista = { team: ind.team === undefined, behov: ind.behov };
process.stdout.write(JSON.stringify(r));""")
    assert ut["forsta"]["team"][0]["behov"]["vardag"]["morgon"] == 3  # första teamet tar över enhetens behov
    assert ut["forsta"]["behov"]["vardag"] == {"morgon": 3, "kvall": 2, "natt": 1}
    assert ut["behov2"]["vardag"] == {"morgon": 3, "kvall": 2, "natt": 1}  # nytt team utan behov ändrar inte summan
    assert ut["andra"][1][0] == "Väst" and ut["andra"][0][1] != ut["andra"][1][1]
    assert ut["namn"] == "Norr"
    assert ut["efterBort"]["team"] == ["T2"] and ut["efterBort"]["pers"] is None
    assert ut["sista"]["team"]


@nod
def test_aktivitetstyper_och_sidan():
    ut = kor_js(r"""
const O = require(process.argv[1] + "/organisation.js"), r = {};
let l = O.aktKopia(); r.antal = l.length;
l = O.aktLagg(l, "Brandövning", "utbildning"); r.ny = l.at(-1);
try { O.aktLagg(l, "brandövning"); } catch (e) { r.dubblett = e.message; }
try { O.aktAndra(l, "apt", "typ", "fest"); } catch (e) { r.kategori = e.message; }
l = O.aktAndra(l, "apt", "farg", "#000000"); r.aptFarg = O.aktFarg(l, { typ: "apt" });
r.egen = O.aktFarg(l, { typ: "apt", farg: "#111111" });
r.falt = O.aktFalt(O.aktTyp(l, "brandovning"));
r.valt = O.aktAlternativ(l, { typ: "utbildning", farg: r.ny.farg }).match(/value="([^"]+)" selected/)[1];
r.namn1 = O.aktNamnEfterTyp(l, "", O.aktTyp(l, "apt")); r.namn2 = O.aktNamnEfterTyp(l, "Eget namn", O.aktTyp(l, "apt"));
r.namn3 = O.aktNamnEfterTyp(l, "APT", O.aktTyp(l, "annat"));
const h = O.stod(O.kopia(), [{ id: 1, namn: "Hemtjänst Centrum", org: "hemtjanst", team: [{ id: "T1", namn: "Öst" }] }, { id: 2, namn: "Lös", org: null, team: [] }], l);
r.html = h; r.sidan = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
process.stdout.write(JSON.stringify(r));""")
    assert ut["antal"] == 7
    assert ut["ny"]["id"] == "brandovning" and ut["ny"]["typ"] == "utbildning"
    assert "redan" in ut["dubblett"] and "kategori" in ut["kategori"].lower()
    assert ut["aptFarg"] == "#000000" and ut["egen"] == "#111111"
    assert ut["falt"] == {"typ": "utbildning", "farg": ut["ny"]["farg"]}
    assert ut["valt"] == "brandovning"
    assert ut["namn1"] == "APT" and ut["namn2"] == "Eget namn" and ut["namn3"] == ""
    s = ut["sidan"]
    assert "Hemtjänst Centrum" in s and "Öst" in s and "Utan placering" in s
    assert 'value="Brandövning"' in ut["html"]  # typens namn går att ändra direkt


def test_aktivitetens_farg_foljer_med_i_passen():
    indata = json.loads((ROT / "tests" / "fall" / "aktivitet_apt.json").read_text(encoding="utf-8"))
    for a in indata["aktiviteter"]:
        a["typ"], a["farg"] = "apt", "#3f6bb0"
    assert kontrollera_indata(indata) == []
    res = los(forbered(indata), tid_per_steg=4, arbetare=4, tyst=True)
    akt = [a for rad in res["schema"].values() for p in rad if p for a in p.get("aktiviteter", [])]
    assert akt and all(a["farg"] == "#3f6bb0" and a["typ"] == "apt" for a in akt)


def test_symbolerna_och_fargerna_anvands_i_telefonen():
    s = (ROT / "light" / "sida.html").read_text(encoding="utf-8")
    assert "ORG.stod(" in s and "lager.akttyper()" in s and "ORG.aktAlternativ(" in s


IMPORT = r"""
const O = require(process.argv[1] + "/organisation.js");
const par = [{ namn: "Avdelningar", rader: [["Förskola", "Avdelning"], ["Ekbacken", "Röd"], ["Ekbacken", "Blå"], ["Lunden", "Sol"]] }];
const lista = [{ namn: "Sammanställning", rader: [["Förskola", "Antal", "Avdelningar"], ["Ekbacken", 2, "Röd, Blå"], ["Lunden", 1, "Sol"]] }];
const hier = [{ namn: "Områden", rader: [["Område", "Typ", "Under", "Antal", "Avdelningar"],
  ["Norr", "Område", "Hemvård", 2, "Lag A, Lag B"], ["Hemvård", "Område", "", 0, ""], ["SÄBO", "Division", "", 0, ""],
  ["Tallen", "Område", "SÄBO / Skogen", 2, "1A, 1B"], ["Skogen", "Område", "SÄBO", 0, ""], ["Skogen natt", "Område", "SÄBO / Skogen", 0, ""],
  ["Väntar", "Område", "Hemvård", 1, "Lag C"]] }];
"""


@nod
def test_import_fran_excel_tre_format():
    ut = kor_js(IMPORT + r"""
const r = {};
for (const [k, b] of Object.entries({ par, lista, hier })) {
  const p = O.importPlan(b);
  r[k] = { forslag: p.forslag, poster: p.poster.map(x => [x.nyckel, x.typ, x.team.join("|")]) };
}
process.stdout.write(JSON.stringify(r));""")
    assert ut["par"]["forslag"] == "forskola" and ut["par"]["poster"] == ut["lista"]["poster"] == [
        ["Ekbacken", "enhet", "Röd|Blå"], ["Lunden", "enhet", "Sol"]]
    h = {n: (t, a) for n, t, a in ut["hier"]["poster"]}
    assert ut["hier"]["forslag"] == "aldreomsorg"
    assert h["SÄBO"][0] == h["SÄBO / Skogen"][0] == h["Hemvård"][0] == "grupp"
    assert h["SÄBO / Skogen / Tallen"] == ("enhet", "1A|1B")
    assert h["SÄBO / Skogen / Skogen natt"] == ("enhet", "")  # utan avdelningar och utan undergrupper: en enhet
    nycklar = [n for n, _, _ in ut["hier"]["poster"]]
    assert nycklar.index("SÄBO / Skogen") < nycklar.index("SÄBO / Skogen / Tallen")  # överordnade först


@nod
def test_import_val_och_omkorning():
    ut = kor_js(IMPORT + r"""
const p = O.importPlan(hier), r = {};
let v = new Set(p.poster.map(x => x.nyckel));
v = O.importVal(p, v, "Hemvård / Väntar", false); r.utan = [...v].includes("Hemvård / Väntar");
v = O.importVal(p, v, "SÄBO / Skogen", false); r.skogen = [...v].filter(k => k.startsWith("SÄBO / Skogen")).length;
v = O.importVal(p, v, "SÄBO / Skogen / Tallen", true); r.tillbaka = ["SÄBO / Skogen", "SÄBO / Skogen / Tallen"].every(k => v.has(k));
const a = O.importera(O.kopia(), p, v, "aldreomsorg", []);
r.grupper = a.noder.filter(n => !O.STANDARD.some(s => s.id === n.id)).map(n => [n.namn, n.forelder]);
r.sabo = a.noder.filter(n => n.namn === "SÄBO").length;
r.nya = a.nya.map(x => [x.namn, x.org, x.team.join("|")]);
// omkörning: allt finns, en avdelning saknas i en enhet
const fanns = a.nya.map((x, i) => ({ id: i, namn: x.namn, org: x.org, team: x.team.slice(1).map(n => ({ namn: n })) }));
const b = O.importera(a.noder, p, v, "aldreomsorg", fanns);
r.om = { nya: b.nya.length, andrade: b.andrade, samma: b.noder.length === a.noder.length };
r.html = O.importForhand(p, v).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
process.stdout.write(JSON.stringify(r));""")
    assert ut["utan"] is False and ut["skogen"] == 0 and ut["tillbaka"]
    assert ut["sabo"] == 1  # SÄBO finns redan under Äldreomsorg och återanvänds
    assert ["Hemvård", "aldreomsorg"] in ut["grupper"] and ["Skogen", "sabo"] in ut["grupper"]
    assert ["Tallen", "skogen", "1A|1B"] in ut["nya"] and ["Norr", "hemvard", "Lag A|Lag B"] in ut["nya"]
    assert not any(n == "Väntar" for n, _, _ in ut["nya"])
    assert ut["om"]["nya"] == 0 and ut["om"]["samma"]
    assert sorted(x["team"][0] for x in ut["om"]["andrade"]) == ["1A", "Lag A"]
    assert "Valt:" in ut["html"]


@nod
def test_import_enskilda_avdelningar_kan_valjas_bort():
    ut = kor_js(IMPORT + r"""
const p = O.importPlan(hier), v = new Set(p.poster.map(x => x.nyckel));
const bort = new Set(["SÄBO / Skogen / Tallen ¦ 1A"]);
const a = O.importera(O.kopia(), p, v, "aldreomsorg", [], bort);
const h = O.importForhand(p, v, bort);
process.stdout.write(JSON.stringify({ tallen: a.nya.find(x => x.namn === "Tallen").team, valt: h.match(/och (\d+) avdelningar/)[1],
  kryss: (h.match(/data-imp-avd="SÄBO \/ Skogen \/ Tallen ¦ 1A"[^>]*>/) || [""])[0].includes("checked") }));""")
    assert ut["tallen"] == ["1B"]
    assert ut["valt"] == "4"  # Lag A, Lag B, Lag C och 1B
    assert ut["kryss"] is False
