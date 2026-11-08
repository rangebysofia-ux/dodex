"use strict";
// Hjälpskript för tests/test_inklistring.py: tolkar inklistrad text och bygger guidens indata.
//   node inklistring_test.js <fil med {personal, behov}>  -> {personal, behov, indata, fel}
const fs = require("fs");
const path = require("path");
const ROT = path.resolve(__dirname, "..", "..");
const KLISTRA = require(path.join(ROT, "schemawebb", "statisk", "inklistring.js"));
const GUIDE = require(path.join(ROT, "schemawebb", "statisk", "guide.js"));
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const g = GUIDE.nyKlistra();
g.klistra = { personal: d.personal || "", behov: d.behov || "" };
const fel = GUIDE.anvandKlistrat(g);
const html = fel ? "" : GUIDE.html(g);
process.stdout.write(JSON.stringify({ personal: KLISTRA.personal(g.klistra.personal), behov: KLISTRA.behov(g.klistra.behov),
  indata: fel ? null : GUIDE.indata(g), fel, steg: g.steg, harHtml: html.length > 0 }));
