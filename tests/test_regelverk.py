"""Styrdokumentet (docs/styrning) ska stämma med motorns regler. Kör python -m schemamotor.regelverk efter en regeländring."""
import json
from pathlib import Path

from schemamotor import regelverk
from schemamotor.build import STANDARDREGLER

ROT = Path(__file__).resolve().parent.parent


def test_incheckat_regelverk_ar_aktuellt():
    d = regelverk.regelverk()
    assert json.loads((ROT / "docs" / "styrning" / "dodex-regelverk.json").read_text(encoding="utf-8")) == d
    assert (ROT / "docs" / "styrning" / "dodex-regelverk.md").read_text(encoding="utf-8") == regelverk.markdown(d)


def test_alla_regler_finns_med():
    d = regelverk.regelverk()
    nycklar = {r["nyckel"] for r in d["harda_regler"]} | {x["nyckel"] for x in d["installningar_for_mjuka_mal"]}
    assert set(STANDARDREGLER) <= nycklar, set(STANDARDREGLER) - nycklar
    assert [m["id"] for m in d["mjuka_mal"]][0] == "vakanser"
    assert all(r["niva"] != "avtal" for r in d["harda_regler"] if r["id"] in ("HELGFREKVENS", "BLOCK_MAX", "PASS_PER_VECKA"))
