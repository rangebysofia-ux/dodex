"""Symboler för passen i schemat: sol för dag, måne för kväll, natthimmel för natt (grafer.js)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROT = Path(__file__).resolve().parent.parent


@pytest.mark.skipif(not shutil.which("node"), reason="Node saknas")
def test_passikon():
    kod = r"""const G = require(process.argv[1]);
process.stdout.write(JSON.stringify({ m: G.passIkon("morgon"), k: G.passIkon("kvall"), n: G.passIkon("natt"), x: G.passIkon("jour") }));"""
    ut = json.loads(subprocess.run(["node", "-e", kod, str(ROT / "schemawebb" / "statisk" / "grafer.js")],
                                   capture_output=True, text=True, timeout=60, check=True).stdout)
    assert "☀️" in ut["m"] and "🌙" in ut["k"] and "🌃" in ut["n"]
    assert 'aria-hidden="true"' in ut["m"]  # bokstaven D/K/N står kvar för skärmläsare och utskrift
    assert ut["x"] == ""


def test_symbolerna_anvands_i_webb_och_telefon():
    for fil in ["schemawebb/statisk/vyer.js", "light/sida.html"]:
        assert (ROT / fil).read_text(encoding="utf-8").count("GRAF.passIkon(") >= 3, fil
