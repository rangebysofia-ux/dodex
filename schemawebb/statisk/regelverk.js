"use strict";
// Regelverk för en enhet (docs/regelverk.md): färdiga uppsättningar av heltid, lokala regler och undantag som
// väljs i Regler. Användarens beslut 2026-11-09. Delas av webben och lättversionen.
//
// Ett regelverk ändrar bara värden som användaren annars ställer in för hand. Det som är avtal eller lag ändras
// aldrig. Där ett regelverk låser upp en låst regel (varannan helg i 40-timmarsveckan) blir det en avvikelse i
// `avvikelser`, som syns på enheten och i schemat – samma som när regeln låses upp för hand.

const RV = (() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Värden som något regelverk sätter. Byter man regelverk återställs de först till standard.
const NYCKLAR = ["helgfrekvens", "pass_per_vecka"];

const LISTA = [
  {
    id: "dag-kvall-helg", namn: "Dag, kväll och helgrotation",
    kort: "Dag- och kvällspass alla dagar, varannan helg.",
    punkter: ["Heltid 37 timmar per vecka (lokal standard).", "Dag- och kvällspass, och natt för nattpersonalen.", "Varannan helg (lokal regel, låst).", "4,75 pass per vecka (lokal regel)."],
    kalla: "Heltiden 37 h är verksamhetens värde. AB 25 § 13 mom. 2 anger 38 timmar 15 minuter vid arbete både vardag och helg; användaren har valt 37 timmar (2026-11-09).",
    heltid: 2220, regler: {}, avvikelser: [],
  },
  {
    id: "40-timmar", namn: "40-timmarsvecka, dagtid mån–fre",
    kort: "Dagpass måndag–fredag, inga helger. Heltid 40 timmar.",
    punkter: ["Heltid 40 timmar per helgfri vecka (AB 25 § 13 mom. 2).", "Bara dagpass måndag–fredag. Medarbetarna utom nattpersonal arbetar dag.", "Ingen helgtjänstgöring: varannan helg låses upp för enheten och syns som avvikelse.", "5 pass per vecka (lokal regel)."],
    kalla: "AB 25 § 13 mom. 2: ”Den ordinarie arbetstiden för heltidsanställd ska vara i genomsnitt 40 timmar per helgfri vecka …”.",
    heltid: 2400, regler: { helgfrekvens: "ingen", pass_per_vecka: 5 }, avvikelser: ["helgfrekvens"], dagtid: true,
  },
  {
    id: "bilaga-j", namn: "Funktionsstöd med Bilaga J",
    kort: "Dag, kväll och varannan helg, med jourpass över dygnet.",
    punkter: ["Heltid 37 timmar per vecka (lokal standard), som dag/kväll/helg.", "Jourpass över dygnet, till exempel 15:00–08:00: arbete till midnatt, jour 00:00–06:00 och arbete till 08:00. Ett pass som belastar två arbetsdagar.", "Hälften av jourtiden räknas som arbetstid (verksamhetens val). Jourpasset räknas in i kvällens och morgonens bemanning.", "Högst 20 timmar, och vilan efteråt minst lika lång som passet (AB 25 § 13 mom. 5). Dygnsvilan 11 h gäller allt annat.", "Bilaga J gäller ersättning och villkor för jouren. Arbetsgivaren ska begära MBL-förhandling innan arbete och jour läggs i följd."],
    kalla: "AB 25 § 13 mom. 5 (undantag från dygnsvila vid kombination av arbete och jour, högst 20 timmar sammanlagt, efterföljande vila minst lika lång) och Bilaga J (särskilda bestämmelser för viss jourtjänstgörande personal, lydelse 2024-04-01).",
    heltid: 2220, regler: {}, avvikelser: [], jour: true, bara_lss: true,
  },
];
const hitta = id => LISTA.find(x => x.id === id) || null;

// Vad som ändras när regelverket används, som text (visas innan användaren bekräftar).
function andringar(ind, id) {
  const R = hitta(id); if (!R) return [];
  const ut = [];
  const ht = ind.heltid_minuter_per_vecka || 2220;
  if (ht !== R.heltid) ut.push(`Heltid ${(R.heltid / 60).toString().replace(".", ",")} timmar per vecka (i dag ${(ht / 60).toString().replace(".", ",")}).`);
  if (R.avvikelser.includes("helgfrekvens") && !(ind.avvikelser || []).includes("helgfrekvens")) ut.push("Varannan helg låses upp för enheten: ingen helgtjänstgöring. Det syns som en avvikelse.");
  if (!R.avvikelser.includes("helgfrekvens") && (ind.regler || {}).helgfrekvens === "ingen") ut.push("Varannan helg gäller igen.");
  if (R.regler.pass_per_vecka && (ind.regler || {}).pass_per_vecka !== R.regler.pass_per_vecka) ut.push(`${R.regler.pass_per_vecka} pass per vecka.`);
  if (!R.regler.pass_per_vecka && (ind.regler || {}).pass_per_vecka) ut.push("4,75 pass per vecka igen.");
  if (R.jour && !ind.jour) ut.push("Jourpass 15:00–08:00 med jour 00:00–06:00, ett per natt. Tider, andel arbetstid och antal ändras under Behov.");
  if (!R.jour && ind.jour) ut.push("Jouren tas bort.");
  if (R.dagtid && !ind.forskolepass) {
    const n = (ind.personal || []).filter(p => !(p.dygnsdelar || []).includes("natt") && (p.dygnsdelar || ["morgon", "kvall"]).join() !== "morgon").length;
    if (n) ut.push(`${n} medarbetare får bara dagpass.`);
    const helg = ["helg", "lör", "sön", "alla"].some(k => Object.values((ind.behov || {})[k] || {}).some(v => v > 0));
    if (helg) ut.push("Behovet på helger sätts till 0.");
  }
  return ut;
}

// Använd regelverket på indata (ändrar objektet). Värden från ett annat regelverk återställs först.
function tillampa(ind, id) {
  const R = hitta(id); if (!R) throw new Error("Okänt regelverk.");
  const regler = { ...(ind.regler || {}) };
  NYCKLAR.forEach(k => delete regler[k]);
  Object.assign(regler, R.regler);
  if (Object.keys(regler).length) ind.regler = regler; else delete ind.regler;
  // avvikelser som ett regelverk har lagt till tas bort om det nya inte har dem; andra (upplåsta för hand) ligger kvar
  const avv = new Set(ind.avvikelser || []);
  if (ind.regelverk && (hitta(ind.regelverk) || {}).avvikelser) hitta(ind.regelverk).avvikelser.forEach(a => { if (!R.avvikelser.includes(a)) avv.delete(a); });
  R.avvikelser.forEach(a => avv.add(a));
  if (avv.size) ind.avvikelser = [...avv]; else delete ind.avvikelser;
  if (R.heltid === 2220) delete ind.heltid_minuter_per_vecka; else ind.heltid_minuter_per_vecka = R.heltid;
  if (R.dagtid) {
    // förskolan (Tidig, Mellan, Sen): Sen är ett pass som slutar vid stängning och ligger kvar (docs/starttider.md)
    if (!ind.forskolepass) (ind.personal || []).forEach(p => { if (!(p.dygnsdelar || []).includes("natt")) p.dygnsdelar = ["morgon"]; });
    const b = ind.behov || (ind.behov = {});
    for (const k of Object.keys(b)) if (["helg", "lör", "sön"].includes(k)) b[k] = { morgon: 0, kvall: 0, natt: 0 };
    if (b.alla) { b.vardag = b.vardag || { ...b.alla }; delete b.alla; }
    b.helg = { morgon: 0, kvall: 0, natt: 0 };
  }
  if (R.jour && !ind.jour) ind.jour = { ...JOUR_STANDARD, behov: { alla: 1 } };
  if (!R.jour) delete ind.jour;
  ind.regelverk = R.id;
  return ind;
}

// Varningar: det som inte stämmer med regelverket, till exempel behov på kvällen i en 40-timmarsvecka.
function varningar(ind) {
  const R = hitta(ind.regelverk); if (!R) return [];
  const ut = [];
  if (R.dagtid && !ind.forskolepass) {
    const kvall = Object.values(ind.behov || {}).some(v => (v.kvall || 0) + (v.natt || 0) > 0);
    if (kvall) ut.push("Behovet har kväll eller natt, men regelverket gäller dagtid måndag–fredag.");
    const ej = (ind.personal || []).filter(p => (p.dygnsdelar || ["morgon", "kvall"]).some(d => d !== "morgon")).map(p => p.id);
    if (ej.length) ut.push(`${ej.join(", ")} arbetar inte bara dag.`);
  }
  if (ind.jour) {
    const t = x => { const [h, m] = String(x).split(":").map(Number); return h * 60 + m; };
    const span = 24 * 60 - t(ind.jour.start || "15:00") + t(ind.jour.slut || "08:00");
    if (span > 20 * 60) ut.push(`Jourpasset är ${span / 60} timmar. Arbete och jour i följd får vara högst 20 timmar (AB 25 § 13 mom. 5).`);
    if (!(ind.personal || []).some(p => !(p.dygnsdelar || []).includes("natt") && (p.dygnsdelar || ["morgon", "kvall"]).includes("kvall") && p.jour !== false))
      ut.push("Ingen medarbetare kan gå jourpass: det krävs någon som arbetar kväll.");
  }
  if ((ind.heltid_minuter_per_vecka || 2220) !== R.heltid) ut.push(`Heltiden är ändrad från regelverkets ${(R.heltid / 60).toString().replace(".", ",")} timmar.`);
  return ut;
}

// ---------------------------------------------------------------- jour (Bilaga J)
const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
function jourPerDag(spec) {
  const ut = [0, 0, 0, 0, 0, 0, 0];
  for (const [k, v] of Object.entries(spec || {})) {
    const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGAR.indexOf(k)];
    for (const i of idx) if (i >= 0) ut[i] = Number(v) || 0;
  }
  return ut;
}
const JOUR_STANDARD = { start: "15:00", jour_fran: "00:00", jour_till: "06:00", slut: "08:00", andel_arbetstid: 0.5 };
// Avsnittet under Behov: jourpassets tider, andel arbetstid och hur många jourpass per natt (natten efter respektive dag).
function jourHtml(ind) {
  if (!ind.jour) return "";
  const J = { ...JOUR_STANDARD, ...ind.jour }, per = jourPerDag(J.behov);
  const t = x => { const [h, m] = String(x).split(":").map(Number); return h * 60 + m; };
  const span = 24 * 60 - t(J.start) + t(J.slut), jlen = Math.max(0, t(J.jour_till) - t(J.jour_fran));
  const arb = span - jlen + Math.round(jlen * J.andel_arbetstid) - (24 * 60 - t(J.start) > 300 ? 30 : 0);
  const fel = span > 20 * 60 ? `<p class="liten minus">Jourpasset är ${(span / 60).toString().replace(".", ",")} timmar. Arbete och jour i följd får vara högst 20 timmar (AB 25 § 13 mom. 5).</p>` : "";
  return `<div class="jour-red"><p class="dampad liten" style="margin:0 0 8px">Ett jourpass över dygnet (Bilaga J): arbete från starten till midnatt, jour och sedan arbete till slutet dagen efter. Det är ett pass som belastar två arbetsdagar och räknas in i kvällens och morgonens bemanning. Högst 20 timmar, och vilan efteråt minst lika lång som passet (AB 25 § 13 mom. 5).</p>
    <div class="falt" style="max-width:640px">
      <div><label for="jour-start">Passet börjar</label><input type="time" id="jour-start" data-jour="start" value="${esc(J.start)}"></div>
      <div><label for="jour-fran">Jour från</label><input type="time" id="jour-fran" data-jour="jour_fran" value="${esc(J.jour_fran)}"></div>
      <div><label for="jour-till">Jour till</label><input type="time" id="jour-till" data-jour="jour_till" value="${esc(J.jour_till)}"></div>
      <div><label for="jour-slut">Passet slutar</label><input type="time" id="jour-slut" data-jour="slut" value="${esc(J.slut)}"></div>
      <div><label for="jour-andel">Av jourtiden är arbetstid, %</label><input type="number" min="0" max="100" step="5" id="jour-andel" data-jour="andel_arbetstid" value="${Math.round(J.andel_arbetstid * 100)}"></div>
    </div>
    <p class="liten" style="margin:6px 0">${(span / 60).toString().replace(".", ",")} timmar från start till slut, varav jour ${(jlen / 60).toString().replace(".", ",")} timmar. Arbetstid ungefär ${(arb / 60).toString().replace(".", ",")} timmar.</p>${fel}
    <div class="rull"><table class="form"><thead><tr><th>Jourpass som börjar</th>${DAGAR.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody><tr><th>Antal</th>
      ${DAGAR.map((d, i) => `<td><input type="number" min="0" max="10" inputmode="numeric" data-jour="${d}" value="${per[i] || ""}" placeholder="0" style="width:56px" aria-label="Jourpass som börjar ${d}"></td>`).join("")}</tr></tbody></table></div></div>`;
}
function jourAndra(ind, el) {
  const k = el.dataset.jour; if (!k || !ind.jour) return false;
  if (["start", "slut", "jour_fran", "jour_till"].includes(k)) { if (el.value) ind.jour[k] = el.value; return true; }
  if (k === "andel_arbetstid") { ind.jour.andel_arbetstid = Math.max(0, Math.min(100, Number(el.value) || 0)) / 100; return true; }
  const per = jourPerDag(ind.jour.behov);
  per[DAGAR.indexOf(k)] = Math.max(0, parseInt(el.value) || 0);
  ind.jour.behov = per.every(v => v === per[0]) ? { alla: per[0] } : Object.fromEntries(DAGAR.map((d, i) => [d, per[i]]).filter(([, v]) => v));
  return true;
}

// Kortet i Regler: vilket regelverk som gäller, och val av ett annat.
// lss: ligger enheten under LSS/funktionsstöd i organisationen? Annars visas inte Bilaga J som val.
function kort(ind, valt, { lss = true } = {}) {
  const nu = hitta(ind.regelverk), tillatet = x => x && (!x.bara_lss || lss || x === nu);
  const lista = LISTA.filter(tillatet), v = (tillatet(hitta(valt)) && hitta(valt)) || nu || LISTA[0];
  const A = valt && valt !== ind.regelverk ? andringar(ind, valt) : [];
  const V = varningar(ind);
  return `<div class="regelverk-kort">
    <div class="rubrikrad"><div><b>Regelverk:</b> ${nu ? esc(nu.namn) : "inget valt (standardregler)"}</div></div>
    <div class="falt" style="margin-top:8px"><div><label for="rv-val">Välj regelverk</label><select id="rv-val" data-rv="1">${lista.map(x => `<option value="${x.id}"${x.id === v.id ? " selected" : ""}>${esc(x.namn)}</option>`).join("")}</select></div></div>
    ${lss ? "" : nu && nu.bara_lss ? `<div class="banner varn"><div><strong>Enheten ligger inte under LSS</strong><span class="liten">Bilaga J och jourpass gäller funktionsstöd. Flytta enheten till LSS i Organisation, eller välj ett annat regelverk.</span></div></div>` : `<p class="dampad liten" style="margin:6px 0 0">Funktionsstöd med Bilaga J (jourpass) kan väljas för enheter som ligger under LSS i Organisation.</p>`}
    <p class="liten" style="margin:8px 0 4px">${esc(v.kort)}</p>
    <ul class="punkter liten">${v.punkter.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
    <p class="dampad liten" style="margin:4px 0">${esc(v.kalla)}</p>
    ${v.id !== (nu && nu.id) ? `<div class="banner info"><div><strong>Det här ändras</strong>${A.length ? `<ul class="punkter liten">${A.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : `<span class="liten">Inga värden ändras, bara regelverkets namn.</span>`}</div></div>
      <p class="chips"><button class="primar" data-rv-anvand="${v.id}">Använd ${esc(v.namn.toLowerCase())}</button></p>` : ""}
    ${V.length ? `<div class="banner varn"><div><strong>Stämmer inte med regelverket</strong><ul class="punkter liten">${V.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>` : ""}
  </div>`;
}

return { LISTA, hitta, andringar, tillampa, varningar, kort, NYCKLAR, jourHtml, jourAndra, jourPerDag };
})();
if (typeof module !== "undefined") module.exports = RV;
