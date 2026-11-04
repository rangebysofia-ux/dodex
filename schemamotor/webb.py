"""Förhandsvisning i webbläsaren: mata in behov och personal, lägg schemat och se resultatet.

Användning:
    python -m schemamotor.webb [--port 8000]

Använder bara Pythons standardbibliotek. Schemaläggningen körs i bakgrunden eftersom den
tar tid; sidan frågar efter status tills jobbet är klart. Jobben finns bara i minnet.
"""
import argparse
import copy
import json
import os
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from pathlib import Path

from schemamotor import explain, validate
from schemamotor.build import IndataFel, forbered, los

FALL = Path(__file__).resolve().parent.parent / "tests" / "fall"
JOBB = {}
LAS = threading.Lock()  # en lösning i taget, så att lösaren får alla kärnor


def exempel():
    ut = []
    for f in sorted(FALL.glob("*.json")) if FALL.is_dir() else []:
        d = json.loads(f.read_text(encoding="utf-8"))
        beskrivning = d.pop("beskrivning", "")
        d.pop("forvantat", None)
        ut.append({"namn": f.stem, "beskrivning": beskrivning, "indata": d})
    return ut


def kor_jobb(jid, indata, tid_s):
    jobb = JOBB[jid]
    with LAS:
        jobb["status"] = "kör"
        start = time.time()
        try:
            prob = forbered(copy.deepcopy(indata))
            jobb["steg"] = "Lägger schemat"
            res = los(prob, tid_s, min(8, os.cpu_count() or 1), tyst=True)
            jobb["resultat"] = res
            if res["status"] == "OK":
                jobb["steg"] = "Granskar schemat"
                jobb["granskning"] = validate.kontrollera(copy.deepcopy(indata), res)
            else:
                jobb["steg"] = "Letar efter regler som krockar"
                jobb["forklaring"], _ = explain.forklara(forbered(copy.deepcopy(indata)), tid_s)
            jobb["status"] = "klar"
        except IndataFel as e:
            jobb.update(status="fel", fel=f"Fel i indata: {e}")
        except Exception as e:  # visa felet på sidan i stället för att jobbet hänger
            jobb.update(status="fel", fel=f"{type(e).__name__}: {e}")
        jobb["sekunder"] = round(time.time() - start, 1)


class Hanterare(BaseHTTPRequestHandler):
    def svara(self, kod, kropp, typ="application/json; charset=utf-8"):
        data = kropp if isinstance(kropp, bytes) else json.dumps(kropp, ensure_ascii=False).encode()
        self.send_response(kod)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            html = resources.files("schemamotor").joinpath("webb.html").read_bytes()
            return self.svara(200, html, "text/html; charset=utf-8")
        if self.path == "/api/exempel":
            return self.svara(200, exempel())
        if self.path.startswith("/api/jobb/"):
            jobb = JOBB.get(self.path.rsplit("/", 1)[1])
            return self.svara(200, jobb) if jobb else self.svara(404, {"fel": "Okänt jobb"})
        self.svara(404, {"fel": "Finns inte"})

    def do_POST(self):
        if self.path != "/api/jobb":
            return self.svara(404, {"fel": "Finns inte"})
        try:
            kropp = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            indata = kropp["indata"]
            tid_s = float(kropp.get("tid_per_steg_s") or indata.get("losare", {}).get("tid_per_steg_s", 10))
        except (ValueError, KeyError, TypeError) as e:
            return self.svara(400, {"fel": f"Kunde inte läsa förfrågan: {e}"})
        jid = uuid.uuid4().hex[:12]
        JOBB[jid] = {"id": jid, "status": "i kö", "steg": "Väntar på tur"}
        threading.Thread(target=kor_jobb, args=(jid, indata, tid_s), daemon=True).start()
        self.svara(202, {"id": jid})

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--vard", default="127.0.0.1", help="adress att lyssna på (0.0.0.0 för alla)")
    a = ap.parse_args()
    server = ThreadingHTTPServer((a.vard, a.port), Hanterare)
    print(f"Förhandsvisning på http://{a.vard}:{server.server_port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
