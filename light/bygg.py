"""Bygger light/schema-light.html av sida.html, motor.js, granskning.js och tre testfall.

Kör: python light/bygg.py
"""
import json
from pathlib import Path

HAR = Path(__file__).resolve().parent
FALL = HAR.parent / "tests" / "fall"
NAMN = {"six_week_basic": "Grundfall, sex veckor", "weekend_rotation": "Helgrotation med undantag",
        "friday_rule_vacancy": "Fredagsregeln ger vakanser"}


def skydda(text):
    return text.replace("</script", "<\\/script")


def main():
    exempel = []
    for stam, namn in NAMN.items():
        d = json.loads((FALL / f"{stam}.json").read_text(encoding="utf-8"))
        beskr = d.pop("beskrivning", "")
        for k in ("forvantat", "losare", "tidpunkter", "delperioder"):
            d.pop(k, None)
        exempel.append({"namn": namn, "beskrivning": beskr, "indata": d})
    motor = (HAR / "motor.js").read_text(encoding="utf-8")
    sida = (HAR / "sida.html").read_text(encoding="utf-8")
    sida = (sida.replace("__MOTOR__", skydda(motor))
                .replace("__GRANSKNING__", skydda((HAR / "granskning.js").read_text(encoding="utf-8")))
                .replace("__MOTOR_HUVUDTRAD__", skydda(motor) + "\nconst MOTOR_HUVUD = MOTOR;")
                .replace("__ASSISTENT__", skydda((HAR.parent / "schemawebb" / "statisk" / "assistent.js").read_text(encoding="utf-8")))
                .replace("__EXEMPEL__", json.dumps(exempel, ensure_ascii=False).replace("</", "<\\/")))
    ut = HAR / "schema-light.html"
    ut.write_text(sida, encoding="utf-8")
    print(f"{ut} ({len(sida) // 1024} kB)")


if __name__ == "__main__":
    main()
