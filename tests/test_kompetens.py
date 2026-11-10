"""Kompetensbaserade behov och planering (docs/kompetens.md): modell, motor, granskning (Python och lättversionen),
justering, organisationens lista och planeringsstödet i kompetens.js."""
import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from schemamotor.build import forbered, los
from schemamotor.modell import kontrollera_indata
from schemamotor.validate import kontrollera

ROT = Path(__file__).resolve().parent.parent
FALL = ROT / "tests" / "fall"
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def fall(namn):
    return json.loads((FALL / f"{namn}.json").read_text(encoding="utf-8"))


def kor_js(kod, *arg):
    return json.loads(subprocess.run(["node", "-e", kod, *map(str, arg)], capture_output=True, text=True,
                                     timeout=120, check=True, cwd=ROT).stdout)


def test_modellen_kontrollerar_kompetenserna():
    ind = fall("kompetens_delegering")
    assert kontrollera_indata(ind) == []
    fel = copy.deepcopy(ind)
    fel["personal"][0]["kompetenser"] = ["okand"]
    fel["kompetenskrav"][0]["kompetens"] = "saknas"
    fel["kompetenser"].append(dict(fel["kompetenser"][0]))
    t = " ".join(kontrollera_indata(fel))
    assert "okand" in t and "saknas" in t and "Samma kompetens" in t
    fel = copy.deepcopy(ind)
    fel["kompetenskrav"][0]["behov"] = {"alla": {"kvall": -1}}
    assert kontrollera_indata(fel)


@pytest.fixture(scope="module")
def brist():
    ind = fall("kompetens_brist")
    return ind, los(forbered(ind), tid_per_steg=8, arbetare=4, tyst=True)


def test_kravet_ar_mjukt_och_redovisas(brist):
    ind, res = brist
    assert res["status"] == "OK" and res["kpi"]["vakanta_pass"] == 0  # kompetensen gör aldrig behovet sämre
    t = res["kompetens_tackning"]
    assert len(t) == 28 and res["kpi"]["kompetensvakanser"] == sum(x["saknas"] for x in t) > 0
    # den enda med delegering arbetar kvällar: varje kväll hen arbetar är täckt
    a1 = [d for d, p in enumerate(res["schema"]["A1"]) if p and p["dygnsdel"] == "kvall"]
    assert a1 and all(next(x for x in t if x["dag"] == d)["saknas"] == 0 for d in a1)
    assert len(t) - res["kpi"]["kompetensvakanser"] == len(a1)  # varje täckt kväll är en kväll A1 arbetar
    g = kontrollera(ind, res["schema"])
    assert g["giltigt"] and sum(v["regel"] == "KOMPETENS" for v in g["varningar"]) == res["kpi"]["kompetensvakanser"]


def test_granskningen_ar_fristaende_och_fangar_fel(brist):
    ind, res = brist
    # flytta den med delegering från en kväll till ledigt: granskningen ser en kompetensvakans till
    s = copy.deepcopy(res["schema"])
    d = next(d for d, p in enumerate(s["A1"]) if p and p["dygnsdel"] == "kvall")
    s["A1"][d] = None
    fore = sum(v["regel"] == "KOMPETENS" for v in kontrollera(ind, res["schema"])["varningar"])
    efter = sum(v["regel"] == "KOMPETENS" for v in kontrollera(ind, s)["varningar"])
    assert efter == fore + 1


def test_justeringen_raknar_om_kompetensen(brist):
    from schemamotor.justera import justera
    ind, res = brist
    s = copy.deepcopy(res["schema"])
    d = next(d for d, p in enumerate(s["A1"]) if p and p["dygnsdel"] == "kvall")
    s["A1"][d] = None
    ny = justera(ind, s, res)
    assert ny["kpi"]["kompetensvakanser"] == res["kpi"]["kompetensvakanser"] + 1


@nod
def test_lattversionen_lagger_och_granskar_lika(tmp_path):
    ut = kor_js(r"""
const M = require("./light/motor.js"), G = require("./light/granskning.js"), r = {};
for (const f of ["kompetens_delegering", "kompetens_brist"]) {
  const ind = require("./tests/fall/" + f + ".json"), res = M.los(ind, { sekunder: 4 });
  require("fs").writeFileSync(process.argv[1] + "/" + f + ".json", JSON.stringify(res));
  r[f] = { kpi: res.kpi.kompetensvakanser, rader: res.kompetens_tackning.length, brott: res.kpi.hardregelbrott,
           g: G.kontrollera(ind, res.schema).varningar.filter(v => v.regel === "KOMPETENS").length };
}
process.stdout.write(JSON.stringify(r));""", tmp_path)
    assert ut["kompetens_delegering"]["kpi"] <= 2 and ut["kompetens_brist"]["kpi"] >= 8
    for f, x in ut.items():
        assert x["brott"] == 0 and x["rader"] == 28 and x["g"] == x["kpi"]
        res = json.loads((tmp_path / f"{f}.json").read_text(encoding="utf-8"))
        py = kontrollera(fall(f), res["schema"])  # Python-granskningen är oberoende och ska hålla med
        assert sum(v["regel"] == "KOMPETENS" for v in py["varningar"]) == x["kpi"]


@nod
def test_planeringsstodet():
    ut = kor_js(r"""
const K = require("./schemawebb/statisk/kompetens.js"), r = {};
const ind = JSON.parse(JSON.stringify(require("./tests/fall/kompetens_brist.json")));
r.balans = K.balans(ind, null);
ind.personal[1].kompetenser = ["del"]; ind.personal[2].kompetenser = ["del"]; ind.personal[3].kompetenser = ["del"];
r.balans4 = K.balans(ind, null)[0];
// fliken: krav och personer ändras via hantera, enhetens lista synkas med organisationens
const i2 = { personal: [{ id: "A1", grad: 1 }, { id: "A2", grad: 1 }] };
K.hantera(i2, null, { dataset: { kp: "A1" }, value: "ssk", checked: true });
K.hantera(i2, null, { dataset: { kkNy: "1" } });
K.hantera(i2, null, { dataset: { kk: "0", kf: "kompetens" }, value: "ssk" });
K.hantera(i2, null, { dataset: { kk: "0", kf: "helg.natt" }, value: "2" });
r.i2 = JSON.parse(JSON.stringify(i2));
K.hantera(i2, null, { dataset: { kp: "A1" }, value: "ssk", checked: false });
K.hantera(i2, null, { dataset: { kkBort: "0" } });
r.tom = i2;
// organisationens lista
let l = K.kopia(); r.antal = l.length; r.insulin = l.find(k => k.id === "insulin"); l = K.lagg(l, "Insulin för diabetes"); r.ny = l.at(-1);
try { K.lagg(l, "insulindelegering"); } catch (e) { r.dubblett = e.message; }
r.kort = K.andra(l, "insulin-for-diabetes", "kort", "ifd2").at(-1).kort;
// efter schemat: utbildningsförslag och kort
const res = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
r.utb = K.utbildning(res, require("./tests/fall/kompetens_brist.json"));
r.kortHtml = K.tackningKort(res, require("./tests/fall/kompetens_brist.json")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
r.marke = K.marke({ personal: [{ id: "A1", kompetenser: ["del"] }], kompetenser: [{ id: "del", namn: "Delegering", kort: "DEL" }] }, "A1");
process.stdout.write(JSON.stringify(r));""", ROT / "tests" / "data" / "kompetens_resultat.json")
    b = ut["balans"][0]
    assert b["kravVecka"] == 7 and b["kan"] == ["A1"] and b["fler"] >= 1  # en person räcker inte till sju kvällar
    assert ut["balans4"]["fler"] == 0  # fyra med delegering räcker
    assert ut["i2"]["personal"][0]["kompetenser"] == ["ssk"]
    assert ut["i2"]["kompetenser"] == [{"id": "ssk", "namn": "Sjuksköterska", "kort": "SSK", "farg": "#3f6bb0"}]
    assert ut["i2"]["kompetenskrav"][0]["kompetens"] == "ssk"
    assert ut["i2"]["kompetenskrav"][0]["behov"] == {"vardag": {"kvall": 1}, "helg": {"kvall": 1, "natt": 2}}
    assert "kompetenser" not in ut["tom"] and "kompetenskrav" not in ut["tom"]
    assert ut["antal"] == 9 and ut["ny"]["id"] == "insulin-for-diabetes" and ut["ny"]["kort"] == "IFD"
    assert ut["insulin"] == {"id": "insulin", "namn": "Insulindelegering", "kort": "INS", "farg": "#b5487e"}
    assert "redan" in ut["dubblett"] and ut["kort"] == "IFD2"
    assert ut["utb"][0]["kompetens"] == "del" and ut["utb"][0]["forslag"]
    assert "Förslag på utbildning" in ut["kortHtml"] and "Läkemedelsdelegering" in ut["kortHtml"]
    assert ">DEL<" in ut["marke"]


@pytest.fixture
def klient(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DATA", str(tmp_path / "data"))
    monkeypatch.delenv("SCHEMA_LOSENORD", raising=False)
    from schemawebb.app import app
    with TestClient(app) as k:
        yield k


def test_organisationens_kompetenser_i_webben(klient):
    assert klient.get("/api/kompetenser").json() == {"kompetenser": None}  # startlistan ligger i kompetens.js
    lista = [{"id": "del", "namn": "Läkemedelsdelegering", "kort": "DEL", "farg": "#c0473f"}]
    assert klient.put("/api/kompetenser", json={"kompetenser": lista}).status_code == 200
    assert klient.get("/api/kompetenser").json()["kompetenser"] == lista
    assert klient.put("/api/kompetenser", json={"kompetenser": lista * 2}).status_code == 422
    assert klient.put("/api/kompetenser", json={"kompetenser": [{**lista[0], "farg": "röd"}]}).status_code == 422


def test_lattversionen_har_kompetens():
    s = (ROT / "light" / "schema-light.html").read_text(encoding="utf-8")
    assert "const KOMP = (" in s and "KOMP.flik(" in s and "KOMP.tackningKort(" in s and "lager.kompetenser()" in s
