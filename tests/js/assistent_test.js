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
// passändringar: exakt som användaren säger, i en kopia av schemat
forslag = null;
ut.pass_svar = kor("foresla_andringar", { sammanfattning: "F1 kväll tisdag v2, ledig onsdag v1", andringar: [
  { typ: "satt_pass", person: "F1", vecka: 2, veckodag: "tis", dygnsdel: "kvall", start: "14:00", slut: "21:30" },
  { typ: "ta_bort_pass", person: "F2", vecka: 1, veckodag: resultat.schema.F2.findIndex(Boolean) >= 0 ? ["mån", "tis", "ons", "tor", "fre", "lör", "sön"][resultat.schema.F2.findIndex(Boolean) % 7] : "mån" },
] });
ut.pass_forslag = forslag;
const ny = A.tillampaSchema(resultat.schema, forslag.andringar, resultat.veckor);
ut.pass_ny = { f1: ny.F1[8], f2: ny.F2[resultat.schema.F2.findIndex(Boolean)], orort: resultat.schema.F1[8] };
const forsta = resultat.schema.F3.findIndex(Boolean);
ut.flytta = A.tillampaSchema(resultat.schema, [{ typ: "flytta_pass", person: "F3", vecka: Math.floor(forsta / 7) + 1, veckodag: ["mån", "tis", "ons", "tor", "fre", "lör", "sön"][forsta % 7], till_person: "F4" }], resultat.veckor);
ut.flytta_res = { f3: ut.flytta.F3[forsta], f4: ut.flytta.F4[forsta], var: resultat.schema.F3[forsta] };
delete ut.flytta;
try { kor("foresla_andringar", { sammanfattning: "x", andringar: [{ typ: "satt_pass", person: "F1", vecka: 2, veckodag: "tis", dygnsdel: "kvall" }, { typ: "satt_behov", dagar: "fre", kvall: 2 }] }); ut.blandat = "inget fel"; }
catch (e) { ut.blandat = e.message; }
try { kor("foresla_andringar", { sammanfattning: "x", andringar: [{ typ: "satt_pass", person: "F1", vecka: 99, veckodag: "tis", dygnsdel: "kvall" }] }); ut.felvecka = "inget fel"; }
catch (e) { ut.felvecka = e.message; }
console.log(JSON.stringify(ut));
