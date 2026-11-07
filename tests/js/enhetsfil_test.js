"use strict";
// Hjälpskript för tests/test_enhetsfil.py: skriver och läser enhetsfiler som lättversionen gör.
//   node enhetsfil_test.js skriv <enhet.json> <korningar.json> <källa>   -> filens text
//   node enhetsfil_test.js las <fil>                                       -> {namn, indata, korningar, varningar} eller {fel}
//   node enhetsfil_test.js light <indata.json>                             -> fil med en körning lagd av lättmotorn
//   node enhetsfil_test.js granska <fil>                                   -> antal brott per körning enligt granskning.js
const fs = require("fs");
const path = require("path");
const ROT = path.resolve(__dirname, "..", "..");
const ENHETSFIL = require(path.join(ROT, "schemawebb", "statisk", "enhetsfil.js"));
const [, , lage, a, b, c] = process.argv;
const json = f => JSON.parse(fs.readFileSync(f, "utf-8"));

if (lage === "skriv") {
  process.stdout.write(ENHETSFIL.text(json(a), json(b), c));
} else if (lage === "las") {
  try { process.stdout.write(JSON.stringify(ENHETSFIL.las(fs.readFileSync(a, "utf-8")))); }
  catch (e) { process.stdout.write(JSON.stringify({ fel: e.message })); }
} else if (lage === "light") {
  const M = require(path.join(ROT, "light", "motor.js"));
  const G = require(path.join(ROT, "light", "granskning.js"));
  const indata = json(a);
  const res = M.los(indata, { sekunder: 2, seed: 1 });
  const g = G.kontrollera(indata, res);
  // samma form som lättversionen sparar i lager.sparaKorning
  const k = { id: "x1", enhet: "e1", namn: "Lättschema", skapad: Date.UTC(2026, 10, 7), status: g.giltigt ? "OK" : "BROTT",
    vakanta: res.kpi.vakanta_pass, data: JSON.stringify({ resultat: res, granskning: g, balans: 3, indata }) };
  process.stdout.write(ENHETSFIL.text({ id: "e1", namn: "Lättenhet", indata }, [k], "light"));
} else if (lage === "granska") {
  const G = require(path.join(ROT, "light", "granskning.js"));
  const d = ENHETSFIL.las(fs.readFileSync(a, "utf-8"));
  process.stdout.write(JSON.stringify(d.korningar.map(k => G.kontrollera(k.indata, k.resultat).brott.length)));
}
