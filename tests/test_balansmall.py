"""Balansmallen (GRAF.balans i schemawebb/statisk/grafer.js): ett schema i fyra perspektiv, räknat ur schemat."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROT = Path(__file__).resolve().parent.parent
pytestmark = pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")

D = {"dygnsdel": "morgon", "start": "07:00", "slut": "15:30", "rast": 30, "netto": 480}
K = {"dygnsdel": "kvall", "start": "13:30", "slut": "22:00", "rast": 30, "netto": 480}


def schema_for(rader):
    """rader: {pid: "DDK..KK.."} för en vecka (D dag, K kväll, . ledig)."""
    return {pid: [D if c == "D" else K if c == "K" else None for c in s] for pid, s in rader.items()}


def korning(rader, behov, **extra):
    schema = schema_for(rader)
    personer = {pid: {"pass": sum(1 for p in r if p), "minuter": sum(p["netto"] for p in r if p),
                      "mal_minuter": sum(p["netto"] for p in r if p), "kvallspass": sum(1 for p in r if p and p["dygnsdel"] == "kvall")}
                for pid, r in schema.items()}
    indata = {"veckor": 1, "cykliskt": False, "behov": behov, "personal": [{"id": p, "grad": 1} for p in rader], **extra}
    return {"resultat": {"status": "OK", "veckor": 1, "cykliskt": False, "schema": schema, "personer": personer, "kpi": {}},
            "indata": indata, "granskning": {"brott": [{"regel": "X"}], "varningar": []}}


def kor(tmp_path, lista):
    f = tmp_path / "in.json"
    f.write_text(json.dumps({"lista": lista}), encoding="utf-8")
    return json.loads(subprocess.run(["node", str(ROT / "tests" / "js" / "balans_test.js"), str(f)],
                                     capture_output=True, text=True, timeout=60, check=True).stdout)


def test_matt_raknas_ur_schemat(tmp_path):
    # behov 1 dag och 1 kväll alla dagar; P1 arbetar 6 dagar i följd, P2 tre kvällar i rad
    k = korning({"P1": "DDDDDD.", "P2": "KKK.DD."}, {"alla": {"morgon": 1, "kvall": 1}}, budget_timmar_vecka=80)
    m = kor(tmp_path, [k])["maatt"][0]
    assert m["behov"]["vakanser"] == 5          # kväll tor–sön och dag sön saknas
    assert m["arbetsmiljo"]["brott"] == 1       # från granskningen, inte räknat om
    assert m["arbetsmiljo"]["block"] == 6
    assert m["arbetsmiljo"]["over_rek"] == 2    # 6 dagar i följd = 2 över rekommenderade 4
    assert m["arbetsmiljo"]["kvallar"] == 3
    assert m["budget"]["timmar"] == pytest.approx(88)
    assert m["budget"]["over_budget"] == pytest.approx(8)
    # P2 dag fre och lör ligger utöver behovet (P1 har redan dagen): två resurspass på dag
    assert m["kvalitet"]["resurs_kvall"] == 0
    assert m["kvalitet"]["resurs_dagar"] == pytest.approx(1)


def test_utan_budget_visas_ingen_budgetrad(tmp_path):
    m = kor(tmp_path, [korning({"P1": "DD.DD.."}, {"vardag": {"morgon": 1}})])["maatt"][0]
    assert "over_budget" not in m["budget"]
    assert "onskemal" not in m["arbetsmiljo"] and "aktiviteter" not in m["kvalitet"]


def test_jamforelse_visar_vilket_schema_som_gor_vad(tmp_path):
    a = korning({"P1": "DDDDD..", "P2": "KKKKK.."}, {"vardag": {"morgon": 1, "kvall": 1}})
    b = korning({"P1": "DDDDDD.", "P2": "KKKK..."}, {"vardag": {"morgon": 1, "kvall": 1}})
    ut = kor(tmp_path, [a, b])
    assert ut["maatt"][0]["behov"]["vakanser"] == 0 and ut["maatt"][1]["behov"]["vakanser"] == 1
    html = ut["html"]
    assert "Balansmall" in html and "Alt 1" in html and "Alt 2" in html
    assert 'class="tal nw bast"' in html          # bäst på raden markeras
    assert "balans-vem" in html                    # vilket schema som gör vad


def kalender(tmp_path, perioder, idag, start, manader=3):
    f = tmp_path / "k.json"
    f.write_text(json.dumps({"perioder": perioder, "idag": idag, "start": start, "manader": manader}), encoding="utf-8")
    kod = ("const G=require(process.argv[1]);const d=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
           "const k=G.kalender(d.perioder,{idag:d.idag,start:d.start,manader:d.manader});"
           "process.stdout.write(JSON.stringify({html:k.html,nu:k.nu&&k.nu.id,kommande:k.kommande.map(p=>p.id)}))")
    return json.loads(subprocess.run(["node", "-e", kod, str(ROT / "schemawebb" / "statisk" / "grafer.js"), str(f)],
                                     capture_output=True, text=True, timeout=60, check=True).stdout)


def test_kalender_visar_godkanda_perioder(tmp_path):
    """Kalendern: ett godkänt schema gäller från sin måndag tills nästa börjar och rullar runt (V1 efter sista veckan)."""
    p = [{"id": 1, "namn": "S1", "fran_datum": "2026-11-09", "veckor": 4},
         {"id": 2, "namn": "S2", "fran_datum": "2027-01-04", "veckor": 6}]
    k = kalender(tmp_path, p, "2026-12-15", "2026-11-01")
    assert k["nu"] == 1 and k["kommande"] == [2]
    rader = re.findall(r'<td class="kal-vecka">v\.(\d+)</td>\s*<td class="kal-schema">(.*?)</td>', k["html"], re.S)
    vecka = {int(v): re.sub(r"<[^>]+>", "", s).replace("▶", "").split() for v, s in rader}
    assert vecka[45] == ["Inget", "godkänt", "schema–"]
    assert vecka[46] == ["S1", "V1/4"] and vecka[49] == ["S1", "V4/4"] and vecka[50] == ["S1", "V1/4"]
    assert vecka[53] == ["S1", "V4/4"]                   # 2026 har vecka 53
    assert vecka[1] == ["S2", "V1/6"]                     # nästa godkända schema tar över från sin måndag
    assert 'class="kal-dag idag"' in k["html"] or 'class="kal-dag idag ' in k["html"] or "idag" in k["html"]
    assert kalender(tmp_path, [], "2026-12-15", "2026-11-01")["nu"] is None
