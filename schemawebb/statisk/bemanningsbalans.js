"use strict";
// Bemanningsbalans som i verksamhetens Excel-mall: budget, bemanningsbehov (pass och jour), personal och övrig
// arbetstid, med resultat per vecka och per period. Delas av webben (sidor.js) och lättversionen (light/sida.html).
// Samma beräkning som schemamotor/bemanningsbalans.py; tests/test_bemanningsbalans.py jämför dem.
// Påverkar inte schemaläggningen. Fristående: egna hjälpfunktioner.

const BB = (() => {
const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const DAGVAL = { "mån": "Måndag", "tis": "Tisdag", "ons": "Onsdag", "tor": "Torsdag", "fre": "Fredag", "lör": "Lördag", "sön": "Söndag",
  vardag: "Vardagar (mån–fre)", "lör-sön": "Lör–sön", "mån-sön": "Alla dagar (mån–sön)" };
const NYCKEL = { vardag: [0, 1, 2, 3, 4], helg: [5, 6], "lör-sön": [5, 6], alla: [0, 1, 2, 3, 4, 5, 6], "mån-sön": [0, 1, 2, 3, 4, 5, 6] };
const HELGANDEL = { "2/4": 0.5, "1/4": 0.25, "3/4": 0.75, alla: 1, ingen: 0 };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sv = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: d });
const min = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
// timmar som t:mm, avkortat till hela minuter som i Excel
const hm = h => { const m = Math.trunc(Math.round(h * 60 * 1000) / 1000), t = Math.floor(Math.abs(m) / 60); return `${m < 0 ? "−" : ""}${t}:${String(Math.abs(m) % 60).padStart(2, "0")}`; };
const dagarFor = k => NYCKEL[k] || [DAGAR.indexOf(k)];
const arNatt = p => !!(p.dygnsdelar && p.dygnsdelar.length === 1 && p.dygnsdelar[0] === "natt");
// heltid: personens egen, annars 34 h 20 min för nattpersonal och enhetens för övriga
const heltidFor = (p, ind) => p.heltid_minuter_per_vecka || (arNatt(p) ? ind.heltid_natt_minuter_per_vecka || 2060 : ind.heltid_minuter_per_vecka || 2220);

function passtid(p) {
  if (p.raknad_minuter != null) return p.raknad_minuter;
  const s = min(p.fran); let e = min(p.till); if (e <= s) e += 1440;
  return Math.max(0, e - s - (p.rast_minuter || 0));
}

// antal pass under perioden, som motorn räknar det
function antalPass(p, ind, W, vaxel) {
  if (p.antal_pass != null) return Array.isArray(p.antal_pass) ? p.antal_pass.reduce((a, b) => a + b, 0) : p.antal_pass;
  const r = ind.regler || {}, heltid = heltidFor(p, ind), malMin = heltid * p.grad * W;
  if (p.dygnsdelar && p.dygnsdelar.length === 1 && p.dygnsdelar[0] === "natt") {
    const np = (ind.nattpass && ind.nattpass[0]) || { start: "21:45", slut: "06:45" };
    const s = min(np.start), e = min(np.slut);
    return Math.round(malMin / (e <= s ? e + 1440 - s : e - s));
  }
  const x = (r.pass_per_vecka ?? 4.75) * W;
  let n = Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : (vaxel % 2 === 0 ? Math.floor(x) : Math.ceil(x));
  const minsta = r.min_passlangd_minuter ?? 300;
  if (minsta && malMin / n < minsta) n = Math.max(1, Math.floor(malMin / minsta));
  return n;
}

function berakna(ind) {
  const bb = ind.bemanningsbalans || {}, W = ind.veckor, heltid = (ind.heltid_minuter_per_vecka || 2220) / 60;
  const brutto = ind.budget_timmar_vecka, buf = bb.buffert_procent || 0;
  const budget = brutto ? { brutto, aa: brutto / heltid, buffert_procent: buf, buffert: brutto * buf / 100, timmar: brutto * (1 - buf / 100) } : null;
  const dagar = DAGAR.map(d => ({ dag: d, timmar: 0, pass: 0, jour: 0 }));
  for (const p of bb.pass || []) {
    const t = passtid(p) / 60, n = p.antal ?? 1;
    for (const i of dagarFor(p.dagar || "alla")) { dagar[i].timmar += t * n; if (p.typ === "jour") dagar[i].jour += t * n; else dagar[i].pass += n; }
  }
  const brukarnara = dagar.reduce((s, d) => s + d.timmar, 0), passVecka = dagar.reduce((s, d) => s + d.pass, 0);
  const helgbehov = (dagar[5].pass + dagar[6].pass) / 2;
  const ovrig = (bb.ovrig_tid || []).map(o => { const ar = (o.tillfallen_ar || 0) * (o.timmar || 0) * (o.personer || 0); return { namn: o.namn || "", timmar_ar: ar, timmar_vecka: ar / 52, timmar_period: ar / 52 * W }; });
  const ovrigVecka = ovrig.reduce((s, o) => s + o.timmar_vecka, 0);
  let vaxel = 0;
  const personal = (ind.personal || []).map(p => {
    const natt = !!(p.dygnsdelar && p.dygnsdelar.length === 1 && p.dygnsdelar[0] === "natt");
    const h = heltidFor(p, ind) / 60, n = antalPass(p, ind, W, vaxel);
    if (!natt && p.antal_pass == null) vaxel++;
    const frek = p.helgfrekvens || (ind.regler || {}).helgfrekvens || "2/4";
    return { id: p.id, grad: p.grad, natt, helg: HELGANDEL[frek] ?? 0.5, helgfrekvens: frek, pass: n, timmar_vecka: p.grad * h, timmar_period: p.grad * h * W };
  });
  const persVecka = personal.reduce((s, p) => s + p.timmar_vecka, 0), persPass = personal.reduce((s, p) => s + p.pass, 0), persHelg = personal.reduce((s, p) => s + p.helg, 0);
  const bemVecka = brukarnara + ovrigVecka, persAa = personal.reduce((s, p) => s + p.grad, 0);
  const vecka = { budget, bemanning: { timmar: bemVecka, brukarnara, ovrig: ovrigVecka, aa: bemVecka / heltid }, personal: { timmar: persVecka, aa: persAa } };
  vecka.diff_budget = budget ? { timmar: budget.timmar - bemVecka, aa: budget.timmar / heltid - bemVecka / heltid } : null;
  const diffP = bemVecka - persVecka;
  vecka.diff_personal = { timmar: diffP, aa: persAa - vecka.bemanning.aa, procent: bemVecka ? (persAa - vecka.bemanning.aa) / vecka.bemanning.aa * 100 : 0 };
  const krav = passVecka * W;
  const period = {
    bemanning: { timmar: bemVecka * W, pass: krav, snitt_pass_timmar: krav ? bemVecka * W / krav : 0, helg: helgbehov },
    personal: { timmar: persVecka * W, pass: persPass, snitt_pass_timmar: persPass ? persVecka * W / persPass : 0, helg: persHelg },
  };
  period.diff_budget_timmar = budget ? vecka.diff_budget.timmar * W : null;
  period.diff_personal = { timmar: diffP * W, pass: persPass - krav, snitt_pass_timmar: period.personal.snitt_pass_timmar - period.bemanning.snitt_pass_timmar, helg: persHelg - helgbehov };
  return { veckor: W, heltid_timmar: heltid, dagar, ovrig, personal, vecka, period,
    overkapacitet: { vecka: Math.max(0, -diffP), period: Math.max(0, -diffP) * W }, vakanta_timmar: { vecka: Math.max(0, diffP), period: Math.max(0, diffP) * W } };
}

// Övrig arbetstid från aktiviteterna i schemat (APT, utbildning …): tillfällen per år, timmar och antal personer.
function franAktiviteter(ind) {
  const W = ind.veckor, G = (ind.personal || []).filter(p => !(p.dygnsdelar && p.dygnsdelar[0] === "natt" && p.dygnsdelar.length === 1)).length;
  return (ind.aktiviteter || []).map(a => {
    const dagar = (a.dagar && a.dagar.length ? a.dagar : DAGAR).length;
    const veckor = Array.isArray(a.veckor) ? a.veckor.length : a.veckor === "jämna" || a.veckor === "udda" ? Math.ceil(W / 2) : W;
    const grupp = a.deltagare && a.deltagare.length ? a.deltagare.length : G;
    const personer = a.antal || (a.andel ? Math.ceil(a.andel * grupp) : a.varje_person ? Math.ceil(grupp * a.varje_person / (dagar * veckor)) : grupp);
    return { namn: a.namn || a.id, tillfallen_ar: Math.round(dagar * veckor * 52 / W * 10) / 10, timmar: (min(a.slut) - min(a.start)) / 60, personer };
  });
}

// Behovet per dygnsdel som pass i bemanningsbalansen: enhetens vanliga tider, ett pass per dygnsdel och dag.
function behovSomPass(ind) {
  const r = ind.regler || {}, dagar = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
  const per = dagar.map(() => ({ morgon: 0, kvall: 0, natt: 0 }));
  for (const [k, v] of Object.entries(ind.behov || {})) {
    const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [dagar.indexOf(k)];
    idx.forEach(i => { if (i >= 0) per[i] = { morgon: v.morgon || 0, kvall: v.kvall || 0, natt: v.natt || 0 }; });
  }
  const np = (ind.nattpass && ind.nattpass[0]) || { start: "21:45", slut: "06:45" };
  const ms = r.morgon_start || "07:00", ks = r.kvall_slut || "22:00", plus = (t, m) => { const x = ((+t.slice(0, 2) * 60 + +t.slice(3)) + m + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
  const tider = { morgon: [ms, plus(ms, 495), 30], kvall: [plus(ks, -495), ks, 30], natt: [np.start, np.slut, 0] };
  const ut = [];
  for (const del of ["morgon", "kvall", "natt"]) {
    const grupper = {};
    per.forEach((x, i) => { if (x[del]) (grupper[x[del]] = grupper[x[del]] || []).push(i); });
    for (const [antal, idx] of Object.entries(grupper)) {
      const nyckel = idx.join() === "0,1,2,3,4,5,6" ? ["mån-sön"] : idx.join() === "0,1,2,3,4" ? ["vardag"] : idx.join() === "5,6" ? ["lör-sön"] : idx.map(i => dagar[i]);
      for (const k of nyckel) ut.push({ dagar: k, fran: tider[del][0], till: tider[del][1], rast_minuter: tider[del][2], antal: +antal });
    }
  }
  return ut;
}

// ---------------------------------------------------------------- gränssnitt
// rita(ind, opt): hela sidan som HTML. opt.personalLank(pid) ger länk till medarbetaren; opt.import = true visar import.
function rita(ind, opt = {}) {
  const bb = ind.bemanningsbalans || {}, r = berakna(ind), v = r.vecka, p = r.period, H = r.heltid_timmar;
  const pass = bb.pass || [], ovrig = bb.ovrig_tid || [];
  const tal = (f, varde, steg, bredd = 90, attr = "") => `<input type="number" inputmode="decimal" step="${steg}" data-bb="${f}" value="${varde ?? ""}" style="width:${bredd}px"${attr}>`;
  const diffKlass = x => x < -0.005 ? "plus" : x > 0.005 ? "minus" : "";
  let h = `<section class="kort bb"><h2>1. Budget</h2>
    <div class="falt"><div><label>Årsarbetare (ÅA) i budget</label>${tal("budget_aa", ind.budget_timmar_vecka ? Math.round(ind.budget_timmar_vecka / H * 1000) / 1000 : "", "0.01", 120, ' placeholder="ingen"')}</div>
      <div><label>Buffert, %</label>${tal("buffert_procent", bb.buffert_procent ?? "", "0.5", 120, ' placeholder="0"')}</div>
      <div><label>Heltid per vecka</label><div class="mono" style="padding:8px 0">${sv(H)} h</div></div><div><label>Veckor i perioden</label><div class="mono" style="padding:8px 0">${r.veckor}</div></div></div>
    ${v.budget ? `<p class="dampad liten">Budget ${sv(v.budget.brutto)} h per vecka${v.budget.buffert ? `, buffert ${sv(v.budget.buffert)} h, kvar ${sv(v.budget.timmar)} h` : ""}.</p>` : ""}</section>`;

  h += `<section class="kort bb"><h2>2. Bemanningsbehov</h2>
    <p class="dampad liten">Pass som behövs, med tider, rast och antal personer per dag. Jour räknas med den arbetstid ni anger (till exempel 3 h av 6).</p>
    <div class="rull"><table class="form bbtabell"><thead><tr><th>Dagar</th><th>Från</th><th>Till</th><th>Rast, min</th><th>Antal</th><th>Typ</th><th>Räknad tid</th><th class="tal">Arbetstid</th><th></th></tr></thead><tbody>
    ${pass.map((x, i) => `<tr>
      <td><select data-bb="pass.${i}.dagar">${Object.entries(DAGVAL).map(([k, t]) => `<option value="${k}"${k === (x.dagar || "mån-sön") ? " selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><input type="time" data-bb="pass.${i}.fran" value="${esc(x.fran)}"></td><td><input type="time" data-bb="pass.${i}.till" value="${esc(x.till)}"></td>
      <td>${tal(`pass.${i}.rast_minuter`, x.rast_minuter ?? 0, "5", 74)}</td><td>${tal(`pass.${i}.antal`, x.antal ?? 1, "1", 64)}</td>
      <td><select data-bb="pass.${i}.typ"><option value="pass"${x.typ !== "jour" ? " selected" : ""}>Pass</option><option value="jour"${x.typ === "jour" ? " selected" : ""}>Jour</option></select></td>
      <td>${x.typ === "jour" ? `<input type="time" data-bb="pass.${i}.raknad" value="${x.raknad_minuter != null ? String(Math.floor(x.raknad_minuter / 60)).padStart(2, "0") + ":" + String(x.raknad_minuter % 60).padStart(2, "0") : ""}" title="Arbetstid som räknas">` : ""}</td>
      <td class="tal mono">${hm(passtid(x) / 60)}</td><td><button class="liten fara" data-bbg="ta-bort-pass" data-n="${i}" aria-label="Ta bort">×</button></td></tr>`).join("")}
    </tbody></table></div>
    <p class="chips" style="margin-top:8px"><button data-bbg="nytt-pass">+ Pass</button><button data-bbg="nytt-jour">+ Jour</button>${opt.franBehov ? `<button data-bbg="fran-behov" title="Ett pass per dygnsdel och antal enligt behovet, med enhetens vanliga tider">Fyll i från behovet</button>` : ""}</p>
    <div class="rull"><table class="lista"><thead><tr><th></th>${DAGAR.map(d => `<th class="tal">${d}</th>`).join("")}<th class="tal">Vecka</th></tr></thead><tbody>
      <tr><td>Timmar</td>${r.dagar.map(d => `<td class="tal mono">${hm(d.timmar)}</td>`).join("")}<td class="tal mono"><b>${hm(v.bemanning.brukarnara)}</b></td></tr>
      <tr><td>Pass</td>${r.dagar.map(d => `<td class="tal">${sv(d.pass)}</td>`).join("")}<td class="tal"><b>${sv(r.dagar.reduce((s, d) => s + d.pass, 0))}</b></td></tr></tbody></table></div></section>`;

  h += `<section class="kort bb"><h2>3. Personal</h2>
    <p class="dampad liten">Hämtas från enhetens medarbetare. Antal pass är det motorn räknar med (eller det ni har angett).</p>
    <div class="rull"><table class="lista"><thead><tr><th>Id</th><th class="tal">SSG</th><th>Arbetar</th><th class="tal">Helger</th><th class="tal">Pass/period</th><th class="tal">Tim/vecka</th><th class="tal">Tim/period</th></tr></thead><tbody>
    ${r.personal.map(x => `<tr><td>${opt.personalLank ? opt.personalLank(x.id) : esc(x.id)}</td><td class="tal">${sv(x.grad * 100, 0)} %</td><td>${x.natt ? "Natt" : "Dag/kväll"}</td><td class="tal">${esc(x.helgfrekvens)}</td><td class="tal">${x.pass}</td><td class="tal">${sv(x.timmar_vecka)}</td><td class="tal">${sv(x.timmar_period)}</td></tr>`).join("")}
    <tr class="summa"><td><b>Summa</b></td><td class="tal"><b>${sv(v.personal.aa)} ÅA</b></td><td></td><td class="tal"><b>${sv(p.personal.helg)}</b></td><td class="tal"><b>${p.personal.pass}</b></td><td class="tal"><b>${sv(v.personal.timmar)}</b></td><td class="tal"><b>${sv(p.personal.timmar)}</b></td></tr></tbody></table></div></section>`;

  h += `<section class="kort bb"><h2>4. Övrig arbetstid</h2>
    <p class="dampad liten">Arbetstid som inte ingår i bemanningskravet, till exempel APT, utbildning och schemaombud.</p>
    <div class="rull"><table class="form bbtabell"><thead><tr><th>Aktivitet</th><th>Tillfällen/år</th><th>Tim/tillfälle</th><th>Antal pers</th><th class="tal">H/vecka</th><th class="tal">H/period</th><th class="tal">H/år</th><th></th></tr></thead><tbody>
    ${ovrig.map((o, i) => `<tr><td><input data-bb="ovrig.${i}.namn" value="${esc(o.namn)}" style="width:170px"></td><td>${tal(`ovrig.${i}.tillfallen_ar`, o.tillfallen_ar, "1", 80)}</td><td>${tal(`ovrig.${i}.timmar`, o.timmar, "0.5", 80)}</td><td>${tal(`ovrig.${i}.personer`, o.personer, "1", 70)}</td>
      <td class="tal">${sv(r.ovrig[i].timmar_vecka)}</td><td class="tal">${sv(r.ovrig[i].timmar_period)}</td><td class="tal">${sv(r.ovrig[i].timmar_ar, 1)}</td><td><button class="liten fara" data-bbg="ta-bort-ovrig" data-n="${i}" aria-label="Ta bort">×</button></td></tr>`).join("")}
    ${ovrig.length ? `<tr class="summa"><td><b>Summa</b></td><td></td><td></td><td></td><td class="tal"><b>${sv(v.bemanning.ovrig)}</b></td><td class="tal"><b>${sv(v.bemanning.ovrig * r.veckor)}</b></td><td class="tal"><b>${sv(r.ovrig.reduce((s, o) => s + o.timmar_ar, 0), 1)}</b></td><td></td></tr>` : ""}
    </tbody></table></div>
    <p class="chips" style="margin-top:8px"><button data-bbg="ny-ovrig">+ Rad</button>${(ind.aktiviteter || []).length ? `<button data-bbg="fran-aktiviteter">Hämta från aktiviteterna i schemat</button>` : ""}</p></section>`;

  const rad = (namn, tim, aa, klass = "") => `<tr class="${klass}"><td>${namn}</td><td class="tal mono">${tim}</td><td class="tal mono">${aa}</td></tr>`;
  h += `<section class="kort bb"><h2>5. Resultat</h2>
    <div class="banner ${r.vakanta_timmar.vecka > 0.005 ? "dalig" : r.overkapacitet.vecka > 0.005 ? "varn" : "ok"}"><strong>${r.vakanta_timmar.vecka > 0.005 ? `Personalen räcker inte: ${sv(r.vakanta_timmar.vecka)} vakanta timmar per vecka` : r.overkapacitet.vecka > 0.005 ? `Överkapacitet: ${sv(r.overkapacitet.vecka)} h per vecka (${sv(r.overkapacitet.period)} h per period)` : "Personalen motsvarar bemanningen"}</strong>
      <span class="liten">${v.budget ? `Bemanningen är ${sv(Math.abs(v.diff_budget.timmar))} h per vecka ${v.diff_budget.timmar < 0 ? "över" : "under"} budget.` : "Ange årsarbetare i budget för att jämföra med budgeten."}</span></div>
    <div class="tva" style="margin-top:12px"><div><h3>Vecka</h3><table class="lista"><thead><tr><th></th><th class="tal">Timmar</th><th class="tal">ÅA</th></tr></thead><tbody>
      ${v.budget ? rad("Budget, inklusive buffert", sv(v.budget.timmar), sv(v.budget.timmar / H, 3)) : ""}
      ${rad("Bemanning", sv(v.bemanning.timmar), sv(v.bemanning.aa, 3))}
      ${rad("<span class=\"dampad\">varav brukarnära</span>", sv(v.bemanning.brukarnara), "")}${rad("<span class=\"dampad\">varav övrig arbetstid</span>", sv(v.bemanning.ovrig), "")}
      ${rad("Personalresurser", sv(v.personal.timmar), sv(v.personal.aa, 3))}
      ${v.budget ? rad("Budget − bemanning", `<span class="${diffKlass(v.diff_budget.timmar) === "plus" ? "minus" : ""}">${sv(v.diff_budget.timmar)}</span>`, sv(v.diff_budget.aa, 3), "summa") : ""}
      ${rad("Bemanning − personal", `<span class="${diffKlass(v.diff_personal.timmar)}">${sv(v.diff_personal.timmar)}</span>`, `${sv(-v.diff_personal.aa, 3)}`, "summa")}
      </tbody></table><p class="dampad liten">Negativt för bemanning − personal betyder överkapacitet (${sv(v.diff_personal.procent, 1)} % mer personal än bemanning).</p></div>
    <div><h3>Period (${r.veckor} veckor)</h3><table class="lista"><thead><tr><th></th><th class="tal">Timmar</th><th class="tal">Pass</th><th class="tal">Snitt/pass</th><th class="tal">Helg</th></tr></thead><tbody>
      <tr><td>Bemanningskrav</td><td class="tal mono">${sv(p.bemanning.timmar)}</td><td class="tal">${sv(p.bemanning.pass)}</td><td class="tal mono">${hm(p.bemanning.snitt_pass_timmar)}</td><td class="tal">${sv(p.bemanning.helg)}</td></tr>
      <tr><td>Personalresurser</td><td class="tal mono">${sv(p.personal.timmar)}</td><td class="tal">${p.personal.pass}</td><td class="tal mono">${hm(p.personal.snitt_pass_timmar)}</td><td class="tal">${sv(p.personal.helg)}</td></tr>
      ${p.diff_budget_timmar != null ? `<tr class="summa"><td>Budget − bemanning</td><td class="tal mono">${sv(p.diff_budget_timmar)}</td><td></td><td></td><td></td></tr>` : ""}
      <tr class="summa"><td>Personal − krav</td><td class="tal mono">${sv(-p.diff_personal.timmar)}</td><td class="tal">${sv(p.diff_personal.pass)}</td><td class="tal mono">${hm(p.diff_personal.snitt_pass_timmar)}</td><td class="tal">${sv(p.diff_personal.helg)}</td></tr>
      </tbody></table><p class="dampad liten">Helg: personer per helgdag som behövs, mot personal som arbetar helg (varannan helg räknas som en halv). Snitt/pass i timmar:minuter.</p></div></div>
    <p class="dampad liten" style="margin-top:8px">Bemanningsbalansen påverkar inte schemaläggningen. Den räknar som verksamhetens Excel-mall: budget i årsarbetare, bemanningsbehov per dag, personal och övrig arbetstid.</p></section>`;
  if (opt.import) h += `<section class="kort bb"><h2>Importera från Excel</h2>
    <p class="dampad liten">Läs in en ifylld bemanningsbalans (Excel-mallen). Budget, buffert, pass, jour och övrig arbetstid ersätter det som står här. Medarbetarna kan också läsas in; namnen ersätts då med id-koder och sparas inte.</p>
    <p class="chips"><input type="file" id="bb-fil" accept=".xlsx"><label class="check"><input type="checkbox" id="bb-personal"> Ersätt medarbetarna med Excel-filens</label><button data-bbg="importera">Importera</button></p></section>`;
  return h;
}

// koppla(rot, ind, andrad, opt): kopplar fälten. andrad(rita) anropas efter varje ändring; opt.importera(fil, personal) för import.
function koppla(rot, ind, andrad, opt = {}) {
  const bb = () => (ind.bemanningsbalans = ind.bemanningsbalans || { pass: [], ovrig_tid: [] });
  rot.querySelectorAll("[data-bb]").forEach(el => el.onchange = () => {
    const f = el.dataset.bb.split("."), v = el.value, b = bb();
    if (f[0] === "budget_aa") { const x = parseFloat(v.replace(",", ".")); if (x > 0) ind.budget_timmar_vecka = Math.round(x * (ind.heltid_minuter_per_vecka || 2220) / 60 * 100) / 100; else delete ind.budget_timmar_vecka; }
    else if (f[0] === "buffert_procent") { const x = parseFloat(v.replace(",", ".")); if (x > 0) b.buffert_procent = x; else delete b.buffert_procent; }
    else if (f[0] === "pass") {
      const p = b.pass[+f[1]], k = f[2];
      if (k === "rast_minuter" || k === "antal") p[k] = Math.max(0, parseFloat(v.replace(",", ".")) || 0);
      else if (k === "typ") { if (v === "jour") { p.typ = "jour"; if (p.raknad_minuter == null) p.raknad_minuter = Math.round(passtid({ ...p, raknad_minuter: null }) / 2); } else { delete p.typ; delete p.raknad_minuter; } }
      else if (k === "raknad") { if (v) p.raknad_minuter = min(v); else delete p.raknad_minuter; }
      else if (v) p[k] = v;
    } else if (f[0] === "ovrig") {
      const o = b.ovrig_tid[+f[1]], k = f[2];
      o[k] = k === "namn" ? v : Math.max(0, parseFloat(v.replace(",", ".")) || 0);
    }
    andrad(true);
  });
  rot.querySelectorAll("[data-bbg]").forEach(el => el.onclick = async ev => {
    ev.preventDefault();
    const b = bb(), n = +el.dataset.n;
    switch (el.dataset.bbg) {
      case "nytt-pass": (b.pass = b.pass || []).push({ dagar: "vardag", fran: "07:00", till: "16:00", rast_minuter: 30, antal: 1 }); break;
      case "nytt-jour": (b.pass = b.pass || []).push({ dagar: "mån-sön", fran: "00:00", till: "06:00", rast_minuter: 0, antal: 1, typ: "jour", raknad_minuter: 180 }); break;
      case "ta-bort-pass": b.pass.splice(n, 1); break;
      case "ny-ovrig": (b.ovrig_tid = b.ovrig_tid || []).push({ namn: "", tillfallen_ar: 10, timmar: 2, personer: 1 }); break;
      case "ta-bort-ovrig": b.ovrig_tid.splice(n, 1); break;
      case "fran-aktiviteter": {
        const nya = franAktiviteter(ind), namn = new Set((b.ovrig_tid || []).map(o => o.namn));
        b.ovrig_tid = (b.ovrig_tid || []).concat(nya.filter(o => !namn.has(o.namn))); break;
      }
      case "fran-behov": if (opt.franBehov) b.pass = opt.franBehov(); break;
      case "importera": {
        const fil = rot.querySelector("#bb-fil")?.files?.[0];
        if (!fil || !opt.importera) return;
        await opt.importera(fil, rot.querySelector("#bb-personal")?.checked);
        return;
      }
      default: return;
    }
    andrad(true);
  });
}

return { berakna, rita, koppla, franAktiviteter, behovSomPass, passtid };
})();
if (typeof module !== "undefined") module.exports = BB;
