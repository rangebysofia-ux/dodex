"""Förskolans pass: Tidig, Mellan och Sen (användarens beslut 2026-11-10, docs/starttider.md). Gränssnittet
(GUIDE.forskolaTillampa i guide.js) lägger om dem till behov, starttider och tider; motorn ändras inte."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor.modell import kontrollera_indata

ROT = Path(__file__).resolve().parent.parent
nod = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")


def kor(kod):
    return json.loads(subprocess.run(["node", "-e", kod], capture_output=True, text=True, timeout=60, check=True, cwd=ROT).stdout)


@nod
def test_tidig_mellan_sen_laggs_om_till_behov():
    ind = kor(r"""
const G = require("./schemawebb/statisk/guide.js");
const ind = { enhet: "x", veckor: 4, personal: [], team: [{ id: "T1", namn: "A", behov: {} }, { id: "T2", namn: "B", behov: {} }] };
for (const [n, k, v] of [[0, "tidig", 1], [0, "mellan", 2], [0, "sen", 1], [1, "mellan", 1], [1, "sen", 2]])
  G.forskolaAndra(ind, { dataset: { fsk: k, fskTeam: String(n) }, value: String(v) });
process.stdout.write(JSON.stringify(ind));""")
    assert ind["behov"] == {"vardag": {"morgon": 4, "kvall": 3, "natt": 0}, "helg": {"morgon": 0, "kvall": 0, "natt": 0}}
    assert [t["behov"]["vardag"] for t in ind["team"]] == [{"morgon": 3, "kvall": 1, "natt": 0}, {"morgon": 1, "kvall": 2, "natt": 0}]
    assert ind["starttider"] == {"morgon": [{"tid": "06:00", "antal": 1}, {"tid": "08:00", "antal": 3}]}
    r = ind["regler"]
    assert (r["morgon_start"], r["kvall_slut"], r["kant_fran"]) == ("06:00", "18:00", "09:00")
    # inga helger: varannan helg upplåst och synlig; Sen är ingen fredagskväll (användarens beslut)
    assert r["helgfrekvens"] == "ingen" and ind["avvikelser"] == ["helgfrekvens"]
    assert r["ingen_fredagskvall_fore_ledig_helg"] is False
    # 40 timmar i veckan, fem arbetsdagar och två lediga (användarens beslut)
    assert ind["regelverk"] == "40-timmar" and ind["heltid_minuter_per_vecka"] == 2400 and r["pass_per_vecka"] == 5
    ind["personal"] = [{"id": "F1", "grad": 1.0}]
    assert kontrollera_indata(ind) == []


@nod
def test_anvandarens_val_skrivs_inte_over():
    ind = kor(r"""
const G = require("./schemawebb/statisk/guide.js");
const ind = { enhet: "x", veckor: 4, personal: [], regler: { ingen_fredagskvall_fore_ledig_helg: true, kant_fran: "08:00" } };
G.forskolaAndra(ind, { dataset: { fsk: "sen" }, value: "2" });
G.forskolaAndra(ind, { dataset: { fskTid: "sen" }, value: "17:30" });
process.stdout.write(JSON.stringify(ind));""")
    assert ind["regler"]["ingen_fredagskvall_fore_ledig_helg"] is True and ind["regler"]["kant_fran"] == "08:00"
    assert ind["regler"]["kvall_slut"] == "17:30" and ind["behov"]["vardag"]["kvall"] == 2
    assert ind["forskolepass"]["behov"] == {"sen": 2}


@nod
def test_passens_namn_i_schemat():
    ut = kor(r"""
const G = require("./schemawebb/statisk/guide.js"), ind = { forskolepass: { tider: {} } };
process.stdout.write(JSON.stringify([["morgon", "06:00"], ["morgon", "08:00"], ["kvall", "09:45"], ["natt", "21:45"]]
  .map(([dygnsdel, start]) => G.forskolaKod(ind, { dygnsdel, start })).concat([G.forskolaKod({}, { dygnsdel: "morgon", start: "06:00" })])));""")
    assert ut == ["Tidig", "Mellan", "Sen", None, None]


@nod
def test_forskolans_kompetenser_och_40_timmar_med_sen():
    ut = kor(r"""
const K = require("./schemawebb/statisk/kompetens.js"), RV = require("./schemawebb/statisk/regelverk.js");
const l = K.forskolaLista(null), html = K.flik({ personal: [{ id: "F1", grad: 1 }], kompetenskrav: [] }, l, { forskola: true });
const ind = { forskolepass: { tider: {} }, personal: [{ id: "F1", grad: 1 }], behov: { vardag: { morgon: 2, kvall: 1, natt: 0 } } };
RV.tillampa(ind, "40-timmar");
const krav = { personal: [], kompetenskrav: [] }; K.nyttKrav(krav, l);
process.stdout.write(JSON.stringify({ ids: l.map(k => k.id), lak: /Läkemedel|Insulin/.test(html), ind, varn: RV.varningar(ind), krav: krav.kompetenskrav }));""")
    assert ut["ids"] == ["fl", "ped"] and not ut["lak"]  # bara förskollärare och pedagog
    assert "dygnsdelar" not in ut["ind"]["personal"][0]  # Sen ligger kvar i 40-timmarsveckan
    assert not any("kväll" in v for v in ut["varn"])
    assert ut["krav"][0]["kompetens"] == "fl" and ut["krav"][0]["behov"] == {"vardag": {"morgon": 1}}
