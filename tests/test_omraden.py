"""Områden, avdelningar eller team direkt i guiden för en ny enhet (guide.js), färg per team (team.js)
och färg per enhet (organisation.js, /api/enheter/{id}/farg). Se docs/team.md och docs/organisation.md."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent
STATISK = ROT / "schemawebb" / "statisk"
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def kor_js(kod):
    return json.loads(subprocess.run(["node", "-e", kod, str(STATISK)], capture_output=True, text=True,
                                     timeout=60, check=True).stdout)


GUIDE = r"""
const S = process.argv[1], G = require(S + "/guide.js");
function guide(lage) {
  const g = G.ny(); g.namn = "Hemtjänst Centrum"; G.satt(g, "omraden", lage);
  G.laggOmrade(g); ["Öst", "Väst", "Norr"].forEach((n, i) => (g.omradesLista[i].namn = n));
  g.antalDag = 7; g.antalNatt = 2; g.grad = 100;
  g.behov.vardag = { morgon: 5, kvall: 4, natt: 1 }; g.behov.helg = { morgon: 4, kvall: 4, natt: 1 };
  return g;
}
"""


@nod
def test_gemensamt_schema_ger_team_med_farg_och_delat_behov():
    ut = kor_js(GUIDE + r"""
const g = guide("team"), ind = G.indata(g);
process.stdout.write(JSON.stringify({ team: ind.team, personal: ind.personal, behov: ind.behov }));""")
    team = ut["team"]
    assert [t["namn"] for t in team] == ["Öst", "Väst", "Norr"]
    assert len({t["farg"] for t in team}) == 3
    # behovet delas jämnt, och summan blir enhetens behov
    for d in ("vardag", "helg"):
        for k in ("morgon", "kvall", "natt"):
            assert sum(t["behov"][d][k] for t in team) == ut["behov"][d][k]
    assert team[0]["behov"]["vardag"] == {"morgon": 2, "kvall": 2, "natt": 1}
    # alla får ett hemteam; nattpersonalen bara i team med nattbehov
    hem = {p["id"]: p["team"] for p in ut["personal"]}
    assert set(hem.values()) == {"T1", "T2", "T3"}
    assert hem["N1"] == hem["N2"] == "T1"
    assert kontrollera_indata({**ut, "veckor": 4}) == []  # modellen godtar teamen med färgerna


@nod
def test_eget_schema_per_omrade_ger_en_enhet_per_omrade():
    ut = kor_js(GUIDE + r"""
const g = guide("egna"), E = G.omradesEnheter(g);
process.stdout.write(JSON.stringify(E));""")
    assert [e["namn"] for e in ut] == ["Öst", "Väst", "Norr"]
    personer = [p["id"] for e in ut for p in e["indata"]["personal"]]
    assert sorted(personer) == sorted([f"A{i}" for i in range(1, 8)] + ["N1", "N2"])  # alla, en gång var
    assert sum(e["indata"]["behov"]["vardag"]["morgon"] for e in ut) == 5
    for e in ut:
        assert "team" not in e["indata"]
        assert kontrollera_indata(e["indata"]) == []


@nod
def test_kontroll_och_borttagning():
    ut = kor_js(GUIDE + r"""
const r = {};
let g = G.ny(); G.satt(g, "omraden", "team"); r.tva = g.omradesLista.length;
r.tomma = G.kontrollera(g);
g.omradesLista[0].namn = "Öst"; g.omradesLista[1].namn = "öst"; r.lika = G.kontrollera(g);
g.omradesLista[1].namn = "Väst"; r.ok = G.kontrollera(g);
g = guide("egna"); g.namn = ""; r.utanNamn = G.kontrollera(g);
g = guide("team"); g.personer = [{ id: "A1", omrade: 0 }, { id: "A2", omrade: 2 }]; G.taBortOmrade(g, 0);
r.efter = g.personer; r.kvar = g.omradesLista.map(o => o.namn);
g = guide("team"); g.omraden = "nej"; r.nej = G.indata(g).team === undefined && G.indata(g).personal.every(p => !p.team);
process.stdout.write(JSON.stringify(r));""")
    assert ut["tva"] == 2
    assert "minst två" in ut["tomma"] and "samma namn" in ut["lika"] and ut["ok"] is None
    assert "gruppens namn" in ut["utanNamn"]
    assert ut["efter"] == [{"id": "A1"}, {"id": "A2", "omrade": 1}] and ut["kvar"] == ["Väst", "Norr"]
    assert ut["nej"]


@nod
def test_team_farg_och_organisationsgrupp():
    ut = kor_js(r"""
const S = process.argv[1], T = require(S + "/team.js"), O = require(S + "/organisation.js"), r = {};
const team = [{ id: "T1", namn: "Öst", farg: "#123456" }, { id: "T2", namn: "Väst" }];
r.egen = T.farg(team, "T1"); r.palett = T.farg(team, "T2"); r.okand = T.farg(team, "X");
r.hem = T.hemMarke(team, "T1"); r.lan = T.lanMarke(team, "T2");
let n = O.kopia(); const a = O.grupp(n, "Hemtjänst Centrum", "hemtjanst"); const b = O.grupp(a.noder, "hemtjänst centrum", "hemtjanst");
r.ny = a.id; r.samma = b.id === a.id && b.noder === a.noder; r.sokvag = O.sokvag(a.noder, a.id);
r.enhet = O.enhetsfarg(a.noder, { org: a.id }); r.egenEnhet = O.enhetsfarg(a.noder, { org: a.id, farg: "#abcdef" });
process.stdout.write(JSON.stringify(r));""")
    assert ut["egen"] == "#123456" and ut["palett"].startswith("#") and ut["okand"] == "#8b8f8a"
    assert "--tf:#123456" in ut["hem"] and "→" in ut["lan"]
    assert ut["ny"] == "hemtjanst-centrum" and ut["samma"]
    assert ut["sokvag"] == "Äldreomsorg › ORDBO › Hemtjänst Centrum"
    assert ut["enhet"] == "#2f8a6f"  # ärver Hemtjänsts färg
    assert ut["egenEnhet"] == "#abcdef"


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.delenv("SCHEMA_LOSENORD", raising=False)
    from schemawebb import db
    db.anslut(tmp_path / "data" / "schemasystem.db")
    from schemawebb.app import app
    with TestClient(app) as k:
        yield k


def test_enhetens_farg_i_webben(klient):
    ind = {"veckor": 4, "behov": {}, "personal": [{"id": "A1", "grad": 1}]}
    eid = klient.post("/api/enheter", json={"namn": "Öst", "indata": ind, "org": "hemtjanst", "farg": "#c46a2b"}).json()["id"]
    assert klient.get(f"/api/enheter/{eid}").json()["farg"] == "#c46a2b"
    assert [e["farg"] for e in klient.get("/api/enheter").json()] == ["#c46a2b"]
    assert klient.post(f"/api/enheter/{eid}/farg", json={"farg": None}).status_code == 200
    assert klient.get(f"/api/enheter/{eid}").json()["farg"] is None
    assert klient.post(f"/api/enheter/{eid}/farg", json={"farg": "röd"}).status_code == 422
    assert klient.post("/api/enheter/999/farg", json={"farg": "#000000"}).status_code == 404


@nod
def test_inklistrade_team_blir_omraden_med_hemteam():
    ut = kor_js(r"""
const S = process.argv[1], G = require(S + "/guide.js");
const g = G.nyKlistra();
g.klistra = { personal: "Team 1\nPerson 1\t100%\nPerson 2\t75%\nTeam 2\nPerson 3\t100%\nPerson 4\t90%", behov: "\tDag\tKväll\tNatt\nVardag\t3\t2\t0\nHelg\t2\t2\t0" };
G.anvandKlistrat(g);
const ind = G.indata(g);
process.stdout.write(JSON.stringify({ omraden: g.omraden, team: ind.team, hem: ind.personal.map(p => p.team) }));""")
    assert ut["omraden"] == "team"
    assert [t["namn"] for t in ut["team"]] == ["Team 1", "Team 2"]
    assert ut["hem"] == ["T1", "T1", "T2", "T2"]  # rubrikraderna avgör hemteamet
    assert ut["team"][0]["behov"]["vardag"]["morgon"] + ut["team"][1]["behov"]["vardag"]["morgon"] == 3
