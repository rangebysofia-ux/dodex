"use strict";
function kontrolleraNavigation() {
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const vm = require("node:vm");
  const app = fs.readFileSync("schemawebb/statisk/app.js", "utf8");
  const sidor = fs.readFileSync("schemawebb/statisk/sidor.js", "utf8");
  const a = app.indexOf("let kravsInloggning = false;");
  const b = app.indexOf("// ---------------------------------------------------------------- inloggning", a);
  assert.ok(a !== -1 && b > a, "Menyfunktionen ska gå att isolera");
  const menyKod = app.slice(a, b);
  const noder = {
    "#meny": { innerHTML: "" },
    "#mobillogga": { innerHTML: "" },
    "#enhetsval": { value: "7" },
    "#toppknappar": { innerHTML: "" },
  };
  const st = {
    enhet: { id: 7, namn: "Testenheten" },
    enhetLista: [{ id: 7, namn: "Testenheten" }],
    korning: null,
    session: { anvandare: "test", roll: "chef" },
    vy: "schema",
  };
  const ctx = {
    st,
    IKON: new Proxy({}, { get: () => '<svg aria-hidden="true"></svg>' }),
    loggaText: () => "<span>DODEX</span>",
    esc: x => String(x).replaceAll("<", "&lt;"),
    $: sel => noder[sel] || null,
    location: { hash: "" },
  };
  vm.runInNewContext(menyKod + "\nritaMeny();", ctx);
  const meny = noder["#meny"].innerHTML;
  for (const p of ["schema", "behov", "medarbetare", "aktiviteter", "regelkontroll",
    "kalender", "bemanningsbalans", "nyckeltal", "analys", "rapporter", "installningar"]) {
    assert.ok(meny.includes(`#/e/7/${p}`), `Menylänk saknas: ${p}`);
  }
  assert.ok(meny.includes('#/organisation') && meny.includes('#/konton'));
  for (const namn of ["Schema och planering", "Daglig bemanning", "Ekonomi och uppföljning", "Administration"]) {
    assert.ok(meny.includes(namn), `Arbetsområdet saknas: ${namn}`);
  }
  assert.match(meny, /<details class="meny-grupp" open><summary>Schema och planering/);
  assert.match(meny, /<div class="meny-mobil">/);
  assert.match(meny, /<details class="mobil-mer">/);
  assert.match(meny, /Frånvaro, resurser och vikariebokningar byggs i nästa etapp/);
  assert.ok(!meny.includes('href="#/e/7/vikariebokningar"'), "Ej byggd bokningsvy får inte se klickbar ut");
  assert.match(noder["#toppknappar"].innerHTML, /data-g="lagg-schema"/);

  st.enhet = null;
  st.vy = "hem";
  vm.runInNewContext(menyKod + "\nritaMeny();", ctx);
  const utan = noder["#meny"].innerHTML;
  assert.match(utan, /aria-disabled="true"/, "Enhetsbundna länkar måste vara inaktiva utan enhet");
  assert.ok(utan.includes('href="#/konton"'), "Konton ska fortfarande gå att öppna utan vald enhet");

  const f = sidor.indexOf("function oversiktsflode(");
  const slut = sidor.indexOf("async function visaOversikt(", f);
  assert.ok(f !== -1 && slut > f, "Snabbflödet finns");
  const html = vm.runInNewContext(sidor.slice(f, slut) + "\noversiktsflode(7, {resultat:{status:'OK'}})", {
    st: { enhet: { aktivt: { fran_datum: "2026-11-02" } } },
  });
  assert.match(html, /Ekonomi och behov/);
  assert.match(html, /Grundschema/);
  assert.match(html, /Kalender och drift/);
  assert.match(html, /Analys och uppföljning/);
  assert.match(html, /Ett grundschema är aktiverat/);
  assert.match(html, /#\/e\/7\/kalender/);
  assert.ok(!html.includes('href="#/e/7/vikariebokningar"'), "Framtida funktioner ska inte låtsas vara länkar");
  console.log("DODEX navigation: desktop, mobil, alla befintliga länkar och översikt OK.");
}
kontrolleraNavigation();
