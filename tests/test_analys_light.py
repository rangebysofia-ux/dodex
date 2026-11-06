"""Lättversionens konsekvensanalys (light/analys.js) ska ge samma förslag och konsekvenser som analys.py."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from schemamotor import analys
from schemamotor.justera import justera

ROT = Path(__file__).resolve().parent.parent
FALL = ROT / "tests" / "fall"


def kor(fil, budget=None, schema=None):
    args = ["node", str(ROT / "tests" / "js" / "analys_test.js"), str(fil), str(budget or "")]
    if schema:
        args.append(str(schema))
    return json.loads(subprocess.run(args, capture_output=True, text=True, timeout=60, check=True).stdout)


@pytest.mark.parametrize("namn,budget", [("friday_rule_vacancy.json", None), ("friday_rule_vacancy.json", 300),
                                         ("budget_357.json", None), ("six_week_basic.json", 400), ("weekend_rotation.json", None)])
def test_samma_forslag(namn, budget):
    if not shutil.which("node"):
        pytest.skip("Node saknas")
    ind = json.loads((FALL / namn).read_text(encoding="utf-8"))
    py = analys.forslag(ind, budget)
    js = kor(FALL / namn, budget)
    for k, v in py["underlag"].items():
        assert js["underlag"][k] == pytest.approx(v, abs=0.11), k  # avrundning på sista decimalen kan skilja
    assert [s["id"] for s in js["scenarier"]] == [s["id"] for s in py["scenarier"]]
    for a, b in zip(js["scenarier"], py["scenarier"]):
        assert a["sammanfattning"] == b["sammanfattning"]
        assert a["kontrakt"] == pytest.approx(b["kontrakt_timmar_vecka"], abs=0.11)
        assert [(p["id"], p.get("grad"), p.get("dygnsdelar")) for p in a["personal"]] == \
               [(p["id"], p.get("grad"), p.get("dygnsdelar")) for p in b["indata"]["personal"]]


def test_samma_konsekvenser(tmp_path):
    if not shutil.which("node"):
        pytest.skip("Node saknas")
    ind = json.loads((FALL / "friday_rule_vacancy.json").read_text(encoding="utf-8"))
    # ett enkelt schema: varannan person morgon, varannan kväll, måndag–torsdag
    N = ind["veckor"] * 7
    schema = {p["id"]: [None] * N for p in ind["personal"]}
    for i, p in enumerate(ind["personal"]):
        for d in range(N):
            if d % 7 < 4:
                schema[p["id"]][d] = ({"dygnsdel": "morgon", "start": "07:00", "slut": "15:00"} if (i + d // 7) % 2
                                      else {"dygnsdel": "kvall", "start": "14:00", "slut": "22:00"})
    res = justera(ind, schema)
    fil = tmp_path / "res.json"
    fil.write_text(json.dumps(res), encoding="utf-8")
    py = analys.konsekvenser(ind, res, {"brott": []}, 300)
    js = kor(FALL / "friday_rule_vacancy.json", 300, fil)["konsekvenser"]
    for k, v in py.items():
        assert js[k] == (pytest.approx(v, abs=0.11) if isinstance(v, float) else v), k
