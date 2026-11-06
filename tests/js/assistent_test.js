// Kör assistentens verktyg mot ett schema. Anropas av tests/test_assistent.py med indata och schema.
const A = require("../../schemawebb/statisk/assistent.js");
const fs = require("fs");
const indata = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const resultat = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
let forslag = null;
const ctx = { indata, resultat, granskning: null, onForslag: f => { forslag = f; } };
const kor = (namn, inp = {}) => A.verktyg.find(v => v.name === namn).kor(ctx, inp);
const ut = {};
ut.schema = kor("las_schema");
ut.fredagar = kor("las_dagar", { veckodag: "fre", dygnsdel: "kvall" });
ut.person = kor("las_person", { id: "f1" });
ut.enhet = kor("las_enhet");
ut.svar = kor("foresla_andringar", { sammanfattning: "Ny kvällsperson och mer folk fredag kväll", andringar: [
  { typ: "lagg_till_person", id: "P9", grad_procent: 75, dygnsdelar: ["kvall"] },
  { typ: "satt_behov", dagar: "fre", kvall: 2 },
  { typ: "lagg_till_onskemal", person: "F1", onskemalstyp: "ledig", veckodagar: ["fre"], veckor: "jämna", krav: false, vikt: 3 },
] });
ut.forslag = forslag;
ut.ny_indata = A.tillampa(structuredClone(indata), forslag.andringar);
try { kor("foresla_andringar", { sammanfattning: "x", andringar: [{ typ: "lagg_till_person", id: "F1", grad_procent: 50 }] }); ut.dubblett = "inget fel"; }
catch (e) { ut.dubblett = e.message; }
try { A.tillampa(structuredClone(indata), [{ typ: "lagg_till_person", id: "N9", grad_procent: 80, dygnsdelar: ["natt", "morgon"] }]); ut.nattfel = "inget fel"; }
catch (e) { ut.nattfel = e.message; }
console.log(JSON.stringify(ut));
