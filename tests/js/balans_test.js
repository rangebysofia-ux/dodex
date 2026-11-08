"use strict";
// Hjälpskript för tests/test_balansmall.py: balansmallen (GRAF.balans) för ett schema som byggs för hand.
const path = require("path");
const ROT = path.resolve(__dirname, "..", "..");
const GRAF = require(path.join(ROT, "schemawebb", "statisk", "grafer.js"));
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const ut = d.lista.map(x => GRAF.balans(x));
const html = GRAF.balansKort(d.lista.map((k, i) => ({ namn: `Alt ${i + 1}`, k })));
process.stdout.write(JSON.stringify({ maatt: ut.map(b => Object.fromEntries(Object.entries(b.maatt).map(([p, l]) => [p, Object.fromEntries(l.map(m => [m.id, m.varde]))]))),
  perDagVecka: ut.map(b => b.perDagVecka), perDel: ut.map(b => b.perDel), html }));
