"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root,"schemawebb/statisk/regelstod_data.js");
const uiPath = path.join(root,"schemawebb/statisk/process_regelstod.js");
const context = vm.createContext({module:{exports:{}}});
vm.runInContext(fs.readFileSync(dataPath,"utf8"),context,{filename:dataPath});
vm.runInContext(fs.readFileSync(uiPath,"utf8"),context,{filename:uiPath});
const controller = vm.runInContext("PROCESS_REGELSTOD",context);
const source = vm.runInContext("REGELSTOD_DATA",context);

test("Åtta processteg kopplas till kompetensförsörjning och ARIBUA", () => {
  assert.equal(source.steg.length,8);
  assert.ok(source.steg.every(s => s.fraga && s.underlag && s.resultat && s.aribua.length));
  assert.ok(source.aribua.includes("Introducera"));
});

test("Sökregistret filtrerar status och sökord utan att ändra data", () => {
  assert.ok(controller.sokRegler("dygnsvila").some(r => r.id === "dygnsvila"));
  assert.ok(controller.sokRegler("öS").some(r => r.id === "os"));
  assert.ok(controller.sokRegler("jour","avtalskontroll").some(r => r.id === "jour"));
  assert.ok(controller.sokRegler("jour","historisk-lokal").every(r => r.status === "historisk-lokal"));
  assert.equal(controller.sokRegler("omöjligt-nonsense").length,0);
  assert.equal(controller.sokRegler().length,source.regler.length);
});

test("Alla regler har redovisad osäkerhet eller verifieringsstatus", () => {
  const giltiga = new Set(["avtalskontroll","historisk-lokal","processforslag"]);
  assert.ok(source.regler.length >= 8);
  assert.ok(source.regler.every(r=>giltiga.has(r.status) && r.referens && r.sammanfattning));
  assert.ok(source.regler.every(r=>!r.url || /^https:\/\//.test(r.url)));
  assert.ok(!source.regler.some(r=>r.status === "automatiskt-godkand"));
});

test("Controller visar skillnader och håller källa/period åtskild", () => {
  const r = controller.controllerBas({behov:"1 200",kapacitet:"1100",budget:"1 080",utfall:"1150"});
  assert.equal(r.gapBehovKapacitet,100);
  assert.equal(r.gapBehovBudget,120);
  assert.equal(r.gapKapacitetUtfall,50);
  assert.equal(r.budget,1080);
  assert.equal(r.behov,1200);
});

test("Okänt är inte noll; noll är ett tillåtet värde", () => {
  const r = controller.controllerBas({behov:"",kapacitet:"0",budget:"",utfall:null});
  assert.equal(r.behov,null);
  assert.equal(r.kapacitet,0);
  assert.equal(r.gapBehovKapacitet,null);
  assert.equal(r.utfall,null);
});

test("Felaktiga tal stoppas, svenska decimalkomman hanteras", () => {
  assert.throws(()=>controller.controllerBas({behov:"-1"}),/giltigt antal timmar/);
  assert.throws(()=>controller.controllerBas({behov:"stort"}),/giltigt antal timmar/);
  assert.equal(controller.controllerBas({behov:"10,5",kapacitet:"10"}).gapBehovKapacitet,0.5);
});

test("Webbgränssnittet laddar modulen och har egen navigering", () => {
  const page = fs.readFileSync(path.join(root,"schemawebb/statisk/index.html"),"utf8");
  const app = fs.readFileSync(path.join(root,"schemawebb/statisk/app.js"),"utf8");
  assert.match(page,/regelstod_data\.js/);
  assert.match(page,/process_regelstod\.js/);
  assert.match(app,/Bemanningsprocess & regelstöd/);
  assert.match(app,/visaProcessRegelstod\(\)/);
});
