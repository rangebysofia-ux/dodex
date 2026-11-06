// Kör light/analys.js på ett indata och skriver förslag och konsekvenser som JSON (jämförs med analys.py).
const fs = require("fs");
const A = require("../../light/analys.js");
const [, , indataFil, budget, schemaFil] = process.argv;
const ind = JSON.parse(fs.readFileSync(indataFil, "utf8"));
const f = A.forslag(ind, budget ? Number(budget) : null);
const ut = { underlag: f.underlag, scenarier: f.scenarier.map(s => ({ id: s.id, sammanfattning: s.sammanfattning, kontrakt: s.kontrakt_timmar_vecka, personal: s.indata.personal, behov: s.indata.behov, regler: s.indata.regler || {} })) };
if (schemaFil) ut.konsekvenser = A.konsekvenser(ind, JSON.parse(fs.readFileSync(schemaFil, "utf8")), { brott: [] }, budget ? Number(budget) : null);
console.log(JSON.stringify(ut));
