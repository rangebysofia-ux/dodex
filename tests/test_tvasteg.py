import shutil
import subprocess
from pathlib import Path

import pytest


def test_tvasteg_med_fristaende_granskning():
    if not shutil.which("node"):
        pytest.skip("Node saknas")
    subprocess.run(["node", str(Path(__file__).parent / "js/tvasteg_test.js")], check=True, timeout=20)
