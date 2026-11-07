"use strict";
// Nyckeltal och grafer för ett lagt schema. Delas av webben (sidor.js) och lättversionen (light/sida.html),
// som assistent.js. Fristående: egna hjälpfunktioner, inga beroenden på resten av gränssnittet.
// Färgerna kommer från CSS-variablerna --morgon, --kvall, --natt, --over, --kritisk, --guld, --skog.
// Resurstid (det som ligger utöver behovet) visas svart: --resurs.

const GRAF = (() => {
const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const sv = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function behovPerDag(indata) {
  const ut = Array.from({ length: 7 }, () => ({ morgon: 0, kvall: 0, natt: 0 }));
  for (const [k, v] of Object.entries(indata.behov || {})) {
    const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGAR.indexOf(k)];
    idx.forEach(i => { if (i >= 0) ut[i] = { morgon: v.morgon || 0, kvall: v.kvall || 0, natt: v.natt || 0 }; });
  }
  return ut;
}

// Per dag: i tjänst (n), behov (b), vakanser och överbemanning per dygnsdel.
function bemanning(res, indata) {
  const N = res.veckor * 7, behov = behovPerDag(indata);
  return Array.from({ length: N }, (_, d) => {
    const n = { morgon: 0, kvall: 0, natt: 0 };
    for (const rad of Object.values(res.schema)) { const p = rad[d]; if (p && n[p.dygnsdel] !== undefined) n[p.dygnsdel]++; }
    const b = behov[d % 7], vak = {}, over = {};
    for (const k of ["morgon", "kvall", "natt"]) { vak[k] = Math.max(0, b[k] - n[k]); over[k] = Math.max(0, n[k] - b[k]); }
    return { d, n, b, vak, over };
  });
}

const PASSNAMN = { morgon: "Dag", kvall: "Kväll", natt: "Natt", jour: "Jour" };

// ---------------------------------------------------------------- nyckeltal ur en körning
function nyckeltalFor(k) {
  const res = k.resultat, ind = k.indata, W = res.veckor;
  const bem = bemanning(res, ind);
  const delar = ["morgon", "kvall", "natt"];
  let behov = 0, tackt = 0, vak = 0, over = 0;
  bem.forEach(x => delar.forEach(d => { behov += x.b[d]; tackt += Math.min(x.n[d], x.b[d]); vak += x.vak[d]; over += x.over[d]; }));
  const perVecka = Array.from({ length: W }, (_, w) => {
    const dagar = bem.slice(w * 7, w * 7 + 7);
    const b = dagar.reduce((s, x) => s + delar.reduce((a, d) => a + x.b[d], 0), 0);
    const t = dagar.reduce((s, x) => s + delar.reduce((a, d) => a + Math.min(x.n[d], x.b[d]), 0), 0);
    let min = 0;
    for (const rad of Object.values(res.schema)) rad.slice(w * 7, w * 7 + 7).forEach(p => { if (p) min += p.netto; });
    return { vecka: w + 1, grad: b ? t / b * 100 : 100, timmar: min / 60 };
  });
  const minuter = Object.values(res.personer).reduce((s, p) => s + p.minuter, 0);
  const overtid = Object.values(res.personer).reduce((s, p) => s + Math.max(0, p.minuter - p.mal_minuter), 0) / 60 / W;
  const pass = { morgon: 0, kvall: 0, natt: 0 };
  for (const rad of Object.values(res.schema)) rad.forEach(p => { if (p && pass[p.dygnsdel] !== undefined) pass[p.dygnsdel]++; });
  const timkostnad = Number(ind.timkostnad_kr) || null;
  const ob = obFor(res, ind), obVecka = ob ? Object.values(ob.per).reduce((s, x) => s + x.ar.kr, 0) / 52 : null;
  // resurspass: pass utöver behovet (se resurs nedan), antal och timmar per person och totalt
  const rs = resurs(res, ind), resursPer = {};
  let resursMin = 0;
  for (const nyckel of rs) { const i = nyckel.lastIndexOf(":"), pid = nyckel.slice(0, i), p = res.schema[pid][+nyckel.slice(i + 1)];
    resursPer[pid] = resursPer[pid] || { pass: 0, minuter: 0 }; resursPer[pid].pass++; resursPer[pid].minuter += p.netto || 0; resursMin += p.netto || 0; }
  return { bem, behov, tackt, vak, over, grad: behov ? tackt / behov * 100 : 100, perVecka, timmarVecka: minuter / 60 / W,
    resursPass: rs.size, resursTimmarVecka: resursMin / 60 / W, resursAndel: minuter ? resursMin / minuter * 100 : 0, resursPer,
    overtid, pass, timkostnad, obVecka, kostnadVecka: timkostnad ? minuter / 60 / W * timkostnad + (obVecka || 0) : null };
}

const kr = n => n >= 1e6 ? `${sv(n / 1e6, 2)} mkr` : n >= 1e4 ? `${sv(n / 1e3, 0)} tkr` : `${Math.round(n).toLocaleString("sv-SE")} kr`;

// ---------------------------------------------------------------- grafer
// Linjediagram med en serie: yta, linje, markeringar, betonad slutpunkt och verktygstips per punkt.
function linjegraf(punkter, { min = 0, max = null, format = v => sv(v, 1), enhet = "", mal = null, namn = "" } = {}) {
  if (!punkter.length) return "";
  const W = 520, H = 190, vX = 46, hX = 16, top = 14, bas = H - 30;
  const ymax = max ?? (Math.max(...punkter.map(p => p.y), mal ?? 0) * 1.12 || 1);
  const ymin = Math.min(min, ...punkter.map(p => p.y));
  const x = i => vX + (punkter.length === 1 ? (W - vX - hX) / 2 : i * (W - vX - hX) / (punkter.length - 1));
  const y = v => bas - (v - ymin) / (ymax - ymin || 1) * (bas - top);
  const steg = [ymin, (ymin + ymax) / 2, ymax];
  const linje = punkter.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.y)}`).join(" ");
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(namn)}">
    ${steg.map(v => `<line class="rutnat" x1="${vX}" x2="${W - hX}" y1="${y(v)}" y2="${y(v)}"/><text x="${vX - 8}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`).join("")}
    ${mal != null ? `<line x1="${vX}" x2="${W - hX}" y1="${y(mal)}" y2="${y(mal)}" style="stroke:var(--guld);stroke-width:1.5;stroke-dasharray:5 4"/>` : ""}
    <path d="${linje} L${x(punkter.length - 1)},${bas} L${x(0)},${bas} Z" style="fill:var(--accent-svag)"/>
    <path d="${linje}" style="fill:none;stroke:var(--skog);stroke-width:2"/>
    ${punkter.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="${i === punkter.length - 1 ? 5.5 : 4}" style="fill:${i === punkter.length - 1 ? "var(--skog)" : "var(--yta)"};stroke:var(--skog);stroke-width:2"/>
      <text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.x)}</text>
      <rect class="traff" x="${x(i) - 18}" y="${top}" width="36" height="${bas - top}" data-tips="${esc(p.x)}: ${format(p.y)}${enhet}"/>`).join("")}
  </svg>`;
}

// Ringdiagram med 2 px mellanrum mellan delarna och summan i mitten.
function ringdiagram(delar, mitt) {
  const tot = delar.reduce((s, d) => s + d.varde, 0) || 1, R = 70, r = 46, C = 90;
  let vinkel = -Math.PI / 2, h = "";
  for (const d of delar.filter(d => d.varde)) {
    const v = d.varde / tot * Math.PI * 2, gap = delar.filter(x => x.varde).length > 1 ? 0.02 : 0;
    const a0 = vinkel + gap, a1 = vinkel + v - gap, stor = v > Math.PI ? 1 : 0;
    const p = (rad, a) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    h += `<path d="M${p(R, a0)} A${R},${R} 0 ${stor} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${stor} 0 ${p(r, a0)} Z" style="fill:${d.farg}" data-tips="${d.namn}: ${d.varde} pass (${Math.round(d.varde / tot * 100)} %)"/>`;
    vinkel += v;
  }
  return `<div class="ring"><svg viewBox="0 0 180 180" role="img" aria-label="Passfördelning">${h}<text x="90" y="88" text-anchor="middle" class="ringtal">${mitt}</text><text x="90" y="108" text-anchor="middle" class="ringtext">pass</text></svg>
    <ul class="ringlegend">${delar.filter(d => d.varde).map(d => `<li><i style="background:${d.farg}"></i>${d.namn}<b>${Math.round(d.varde / tot * 100)} %</b></li>`).join("")}</ul></div>`;
}

// Värmekarta: dygnsdel × dag. Rött = underbemanning, sand = i balans, blått = överbemanning.
function varmekarta(bem, W) {
  const delar = ["morgon", "kvall", "natt"].filter(d => bem.some(x => x.b[d] || x.n[d]));
  const cell = (x, d) => {
    const diff = x.n[d] - x.b[d];
    const stil = diff < 0 ? `background:rgba(184,67,47,${Math.min(0.85, 0.3 + 0.25 * -diff)});color:#fff` : diff > 0 ? `background:rgba(20,20,20,${Math.min(0.9, 0.3 + 0.2 * diff)});color:#fff` : "background:var(--sand)";
    return `<td style="${stil}" data-tips="Vecka ${Math.floor(x.d / 7) + 1} ${DAGAR[x.d % 7]} ${PASSNAMN[d].toLowerCase()}\n${x.n[d]} i tjänst, behov ${x.b[d]}${diff < 0 ? ` – ${-diff} saknas` : diff > 0 ? ` – ${diff} resurspass utöver behovet` : ""}">${diff ? (diff > 0 ? "+" : "−") + Math.abs(diff) : ""}</td>`;
  };
  return `<div class="rull"><table class="varme"><thead><tr><th></th>${Array.from({ length: W }, (_, w) => `<th colspan="7" class="ny-vecka">V${w + 1}</th>`).join("")}</tr>
    <tr><th></th>${bem.map(x => `<th class="${x.d % 7 === 0 ? "ny-vecka" : ""}">${DAGAR[x.d % 7][0]}</th>`).join("")}</tr></thead>
    <tbody>${delar.map(d => `<tr><th>${PASSNAMN[d]}</th>${bem.map(x => cell(x, d).replace("<td ", `<td class="${x.d % 7 === 0 ? "ny-vecka" : ""}" `)).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="legend" style="margin-top:8px"><span><i style="background:rgba(184,67,47,.7)"></i>Underbemanning</span><span><i style="background:var(--sand)"></i>I balans</span><span><i style="background:var(--resurs)"></i>Resurstid, utöver behovet</span></div>`;
}

// Staplar: planerad bemanning mot behov per dag (alla dygnsdelar).
function behovsstaplar(bem) {
  const N = bem.length, W = Math.max(520, N * 16 + 50), H = 200, vX = 30, hX = 6, top = 10, bas = H - 34;
  const delar = ["morgon", "kvall", "natt"];
  const tot = x => delar.reduce((s, d) => s + x.n[d], 0), beh = x => delar.reduce((s, d) => s + x.b[d], 0);
  const maxV = Math.max(1, ...bem.map(x => Math.max(tot(x), beh(x))));
  const kol = (W - vX - hX) / N, bred = Math.max(5, kol - 4), y = v => bas - v / maxV * (bas - top);
  let h = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Planerad bemanning mot behov per dag">
    ${[0, Math.round(maxV / 2), maxV].map(v => `<line class="rutnat" x1="${vX}" x2="${W - hX}" y1="${y(v)}" y2="${y(v)}"/><text x="${vX - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}`;
  bem.forEach((x, i) => {
    const x0 = vX + i * kol + (kol - bred) / 2, t = tot(x), b = beh(x), vak = delar.reduce((s, d) => s + x.vak[d], 0);
    if (x.d % 7 > 4) h += `<rect x="${vX + i * kol}" y="${top}" width="${kol}" height="${bas - top}" style="fill:var(--helg)"/>`;
    // upp till behovet i grönt (rött vid vakans), resurstid utöver behovet i svart ovanpå
    const inom = Math.min(t, b);
    h += `<rect x="${x0}" y="${y(inom)}" width="${bred}" height="${Math.max(0, bas - y(inom))}" rx="3" style="fill:${vak ? "var(--kritisk)" : "var(--morgon)"};opacity:${vak ? .85 : .9}"/>`;
    if (t > b) h += `<rect x="${x0}" y="${y(t)}" width="${bred}" height="${Math.max(0, y(b) - y(t))}" rx="3" style="fill:var(--resurs);stroke:var(--text);stroke-width:.8"/>`;
    h += `<line x1="${x0 - 2}" x2="${x0 + bred + 2}" y1="${y(b)}" y2="${y(b)}" style="stroke:var(--text);stroke-width:2"/>`;
    h += `<rect class="traff" x="${vX + i * kol}" y="${top}" width="${kol}" height="${bas - top}" data-tips="Vecka ${Math.floor(x.d / 7) + 1} ${DAGAR[x.d % 7]}\nPlanerat ${t}, behov ${b}${vak ? ` – ${vak} saknas` : t > b ? ` – ${t - b} resurspass utöver behovet` : ""}"/>`;
    if (x.d % 7 === 0) h += `<text x="${vX + i * kol + 2}" y="${bas + 26}" style="font-weight:700;fill:var(--text)">v${Math.floor(x.d / 7) + 1}</text>`;
    if (N <= 42) h += `<text x="${vX + i * kol + kol / 2}" y="${bas + 13}" text-anchor="middle">${DAGAR[x.d % 7][0]}</text>`;
  });
  return `<div class="rull">${h}<line class="axel" x1="${vX}" x2="${W - hX}" y1="${bas}" y2="${bas}"/></svg></div>
    <div class="legend" style="margin-top:6px"><span><i style="background:var(--morgon)"></i>Planerat, behovet täckt</span><span><i style="background:var(--resurs)"></i>Resurstid, utöver behovet</span><span><i style="background:var(--kritisk)"></i>Vakans</span><span><i style="background:var(--text);height:3px"></i>Behov</span></div>`;
}

function passring(n) {
  return ringdiagram([{ namn: "Dag", varde: n.pass.morgon, farg: "var(--morgon)" }, { namn: "Kväll", varde: n.pass.kvall, farg: "var(--kvall)" },
    { namn: "Natt", varde: n.pass.natt, farg: "var(--natt)" }], n.pass.morgon + n.pass.kvall + n.pass.natt);
}

function grafkort(k) {
  const n = nyckeltalFor(k), W = k.resultat.veckor;
  const kostnad = n.timkostnad ? linjegraf(n.perVecka.map(v => ({ x: "V" + v.vecka, y: v.timmar * n.timkostnad })), { format: v => kr(v), namn: "Personalkostnad per vecka",
    mal: k.indata.budget_timmar_vecka ? k.indata.budget_timmar_vecka * n.timkostnad : null })
    : linjegraf(n.perVecka.map(v => ({ x: "V" + v.vecka, y: v.timmar })), { format: v => sv(v, 0) + " h", namn: "Timmar per vecka", mal: k.indata.budget_timmar_vecka || null });
  return `<div class="tva">
    <section class="kort"><h2>Bemanningsgrad per vecka</h2><p class="dampad liten">Andel av behovet som är täckt. Guldlinjen är 100 %.</p>
      ${linjegraf(n.perVecka.map(v => ({ x: "V" + v.vecka, y: v.grad })), { min: Math.min(80, ...n.perVecka.map(v => v.grad)), max: 105, format: v => sv(v, 0) + " %", mal: 100, namn: "Bemanningsgrad per vecka" })}</section>
    <section class="kort"><h2>${n.timkostnad ? "Personalkostnad per vecka" : "Schemalagda timmar per vecka"}</h2><p class="dampad liten">${n.timkostnad ? `Med timkostnaden ${n.timkostnad} kr.` : `Ange en timkostnad för att se kronor.`}${k.indata.budget_timmar_vecka ? " Guldlinjen är budgeten." : ""}</p>${kostnad}</section>
  </div>
  <div class="tva">
    <section class="kort"><h2>Behov och planerad bemanning per dag</h2>${behovsstaplar(n.bem)}</section>
    <section class="kort"><h2>Passfördelning</h2>${passring(n)}</section>
  </div>
  <section class="kort"><h2>Värmekarta: under- och överbemanning</h2><p class="dampad liten">Varje ruta är en dygnsdel en dag i perioden. Siffran visar hur många som saknas (−) eller är över behovet (+).</p>${varmekarta(n.bem, W)}</section>`;
}

const REGELGRUPPER = [
  ["DYGNSVILA", "Dygnsvila", "Avtal"], ["VECKOVILA", "Veckovila", "Avtal"], ["RAST", "Rast efter högst 5 h arbete", "Lag"],
  ["ANTAL_PASS", "Antal pass enligt kontrakt", "Lokal regel"], ["TID", "Arbetstid enligt kontrakt", "Kontrakt"],
  ["HELG", "Helger och fredagskvällar", "Lokal regel"], ["BLOCK_MIN", "Inga enstaka arbetsdagar", "Lokal regel"],
  ["BLOCK_MAX", "Högst antal arbetsdagar i följd", "Lokal regel"], ["NATT_I_RAD", "Nattpersonal: högst nätter i rad", "Lokal regel"], ["PASSFONSTER", "Passbyte i fönstret 12–18", "Lokal regel"],
  ["BLOCK_REKOMMENDERAT", "Rekommenderad blocklängd", "Mjuk"], ["SPRIDNING", "Dag och kväll varje vecka", "Mjuk"], ["JAMN_BEMANNING", "Jämn bemanning mellan dag och kväll", "Mjuk"], ["BEHOV", "Bemanningsbehov", "Mjuk"],
];

// ---------------------------------------------------------------- simulering
function analysstaplar(S, ordning, tk) {
  const stapel = (rubrik, f, enhet, klass) => {
    const max = Math.max(1, ...ordning.filter(n => S[n].konsekvenser?.status === "OK").map(n => f(n) || 0));
    return `<div><h3>${rubrik}</h3>${ordning.map(n => { const v = f(n) || 0, ok = S[n].konsekvenser?.status === "OK";
      return `<div class="hstapel"><span class="liten">${esc(S[n].namn)}</span>${ok ? `<div><i class="${klass}" style="width:${Math.max(v ? 2 : 0, v / max * 100)}%"></i></div><b class="liten">${sv(v, 1)}${enhet}</b>` : `<span class="liten minus" style="grid-column:span 2">Inget schema</span>`}</div>`; }).join("")}</div>`;
  };
  const k = n => S[n].konsekvenser || {};
  return `<div class="tva" style="margin-top:14px">${stapel("Vakanta pass", n => k(n).vakanta_pass, "", "vak")}${stapel("Överkapacitet, timmar per vecka", n => k(n).overkapacitet_timmar_vecka, " h", "over")}</div>
    <div style="margin-top:14px">${tk ? stapel("Personalkostnad per månad, tkr", n => S[n].kontrakt_timmar_vecka * tk * 52 / 12 / 1000, " tkr", "kost") : stapel("Kontrakterad tid, timmar per vecka", n => S[n].kontrakt_timmar_vecka, " h", "kost")}</div>`;
}

// Nuläge mot alternativ: skillnaden mot nuvarande bemanning, och förslag till förbättringar.
function nulage(S, ordning, tk, ikon = "") {
  const nu = S.findIndex(x => x.id === "nuvarande");
  if (nu < 0) return "";
  const k = n => S[n].konsekvenser || {}, alt = ordning.filter(n => n !== nu && k(n).status === "OK");
  if (k(nu).status !== "OK") {
    const ok = alt.length ? alt.slice().sort((a, b) => S[a].kontrakt_timmar_vecka - S[b].kontrakt_timmar_vecka)[0] : null;
    return `<section class="kort"><h2>Nuläge mot alternativ</h2><div class="banner varn">${ikon}<div><strong>Nuvarande bemanning går inte att lägga utan regelbrott</strong>
      ${ok != null ? `Det billigaste alternativet som går att lägga är <b>${esc(S[ok].namn)}</b> med ${sv(S[ok].kontrakt_timmar_vecka, 1)} h per vecka (nu ${sv(S[nu].kontrakt_timmar_vecka, 1)} h${tk ? `, ${S[ok].kontrakt_timmar_vecka >= S[nu].kontrakt_timmar_vecka ? "+" : "−"}${kr(Math.abs(S[ok].kontrakt_timmar_vecka - S[nu].kontrakt_timmar_vecka) * tk * 52 / 12)} per månad` : ""}).` : "Inget av alternativen gick heller att lägga."}</div></div></section>`;
  }
  if (!alt.length) return "";
  const matt = [
    ["Vakanta pass", n => k(n).vakanta_pass, v => `${v > 0 ? "+" : ""}${v}`, true],
    [tk ? "Kostnad per månad" : "Kontrakterad tid per vecka", n => tk ? S[n].kontrakt_timmar_vecka * tk * 52 / 12 : S[n].kontrakt_timmar_vecka, v => tk ? `${v > 0 ? "+" : "−"}${kr(Math.abs(v))}` : `${v > 0 ? "+" : ""}${sv(v, 1)} h`, true],
    ["Överkapacitet per vecka", n => k(n).overkapacitet_timmar_vecka, v => `${v > 0 ? "+" : ""}${sv(v, 1)} h`, true],
    ["Veckor utan blandning", n => k(n).veckor_utan_blandning, v => `${v > 0 ? "+" : ""}${v}`, true],
  ];
  const cell = (f, fmt, n) => {
    const d = f(n) - f(nu), max = Math.max(1e-9, ...alt.map(m => Math.abs(f(m) - f(nu))));
    const b = Math.abs(d) / max * 50, klass = Math.abs(d) < 1e-6 ? "" : d < 0 ? "battre" : "samre";
    return `<td><div class="divbar"><i class="${klass}" style="${d < 0 ? `right:50%;width:${b}%` : `left:50%;width:${b}%`}"></i></div><span class="liten ${klass}">${Math.abs(d) < 1e-6 ? "som nu" : fmt(d)}</span></td>`;
  };
  // förbättringsförslag
  const tips = [];
  const vakNu = k(nu).vakanta_pass;
  const farre = alt.filter(n => k(n).vakanta_pass < vakNu).sort((a, b) => k(a).vakanta_pass - k(b).vakanta_pass || S[a].kontrakt_timmar_vecka - S[b].kontrakt_timmar_vecka);
  if (farre.length) { const n = farre[0], dk = S[n].kontrakt_timmar_vecka - S[nu].kontrakt_timmar_vecka;
    tips.push(`<b>${esc(S[n].namn)}</b> minskar vakanserna från ${vakNu} till ${k(n).vakanta_pass}${Math.abs(dk) > 0.05 ? ` och ${dk > 0 ? "kostar" : "sparar"} ${tk ? kr(Math.abs(dk) * tk * 52 / 12) + " per månad" : sv(Math.abs(dk), 1) + " h per vecka"}` : " utan mer tid"}.`); }
  const billigare = alt.filter(n => k(n).vakanta_pass <= vakNu && S[n].kontrakt_timmar_vecka < S[nu].kontrakt_timmar_vecka - 0.05);
  if (billigare.length) { const n = billigare.sort((a, b) => S[a].kontrakt_timmar_vecka - S[b].kontrakt_timmar_vecka)[0];
    tips.push(`<b>${esc(S[n].namn)}</b> klarar behovet lika bra med ${sv(S[nu].kontrakt_timmar_vecka - S[n].kontrakt_timmar_vecka, 1)} h mindre per vecka.`); }
  if (k(nu).overkapacitet_timmar_vecka > 4) tips.push(`I nuläget är det ${sv(k(nu).overkapacitet_timmar_vecka, 1)} h per vecka mer i tjänst än behovet. Tiden kan läggas där behovet är störst, eller behovet höjas där det gör mest nytta.`);
  const vak = k(nu).vakanser || {};
  if (vak.fredagskvall) tips.push(`${vak.fredagskvall} vakanser i nuläget ligger på fredagskvällar. Fredagsregeln gör att den som arbetar fredag kväll också arbetar helgen; jämför alternativen som rör fredagen.`);
  if (vak.helg && !vak.fredagskvall) tips.push(`Vakanserna i nuläget ligger på helger. Fler personer per helg kräver fler som arbetar varannan helg.`);
  if (k(nu).veckor_utan_blandning > k(nu).personveckor * 0.3) tips.push(`Många veckor har bara morgnar eller bara kvällar. Inställningen ”Fördela morgon och kväll” under Inställningar kan sättas till stark.`);
  return `<section class="kort"><h2>Nuläge mot alternativ</h2><p class="dampad liten">Skillnad mot nuvarande bemanning. Grönt är bättre än i dag, rött sämre.</p>
    <div class="rull"><table class="nulage"><thead><tr><th></th>${matt.map(m => `<th>${m[0]}</th>`).join("")}</tr></thead><tbody>
    <tr class="nu"><td><b>Nuläge</b><div class="liten dampad">${esc(S[nu].sammanfattning)}</div></td>${matt.map(([, f], j) => `<td class="liten"><b>${j === 1 && tk ? kr(f(nu)) : sv(f(nu), 1) + (j === 2 || (j === 1 && !tk) ? " h" : "")}</b></td>`).join("")}</tr>
    ${alt.map(n => `<tr><td><b>${esc(S[n].namn)}</b></td>${matt.map(([, f, fmt]) => cell(f, fmt, n)).join("")}</tr>`).join("")}</tbody></table></div>
    ${tips.length ? `<h3>Förslag till förbättringar</h3><ul class="punkter">${tips.map(t => `<li>${t}</li>`).join("")}</ul>` : ""}</section>`;
}


// ---------------------------------------------------------------- OB och kostnad (kräver ob.js)
const obCache = new WeakMap();
// OB för alla i ett lagt schema: en period från startdatum och ett år (52 veckor). Null om ob.js saknas.
function obFor(res, indata) {
  if (typeof OB === "undefined") return null;
  let c = obCache.get(res);
  const prognos = OB.prognosFor(indata), start = indata.startdatum || OB.antagetStart(prognos);
  if (!c || c.start !== start || c.prognos !== prognos) { c = { start, prognos, antaget: !indata.startdatum, per: OB.forSchema(res.schema, start, { prognos }) }; obCache.set(res, c); }
  return c;
}

const KAT_TEXT = { A: "A – storhelg", B: "B – helg, fredag kväll, natt mot måndag", C: "C – vardagsnatt", D: "D – vardagskväll 19–22" };
const tim = min => sv(min / 60, 1) + " h";

// Kort för en person: timmar, OB per kategori, kostnad per period och år.
function obKort(pid, res, indata, { installningar = "Period" } = {}) {
  const ob = obFor(res, indata); if (!ob) return "";
  const x = ob.per[pid], p = res.personer[pid], W = res.veckor, tk = Number(indata.timkostnad_kr) || null;
  const lonPeriod = tk ? p.minuter / 60 * tk : null, lonAr = tk ? p.minuter / 60 / W * 52 * tk : null;
  const saknas = x.ar.saknarNiva > 0;
  const rad = k => { const a = x.period.kategorier[k], b = x.ar.kategorier[k];
    return a.min || b.min ? `<tr><td>${KAT_TEXT[k]}</td><td class="tal nw">${tim(a.min)}</td><td class="tal nw">${kr(a.kr)}</td><td class="tal nw">${tim(b.min)}</td><td class="tal nw">${kr(b.kr)}</td></tr>` : ""; };
  return `<section class="kort"><h2>Timmar, OB och kostnad</h2>
    <p class="dampad liten">OB enligt AB 25 § 21, räknat på verkliga datum från ${esc(ob.start)}${ob.antaget ? ` (antaget – ange enhetens startdatum under ${installningar})` : ""}. Året är 52 veckor där schemat upprepas, med helgdagar och storhelger. Årets OB följer avtalets avrundning per kategori och månad.</p>
    <div class="kpi" style="margin-top:10px">
      <div><b>${tim(p.minuter)}</b><span>arbetstid på ${W} veckor</span></div>
      <div><b>${tim(p.minuter / W * 52)}</b><span>arbetstid per år</span></div>
      <div><b>${kr(x.ar.kr)}</b><span>OB per år${saknas ? " (delvis utan belopp)" : x.ar.prognosMin ? " (delvis prognos)" : ""}</span></div>
      ${tk ? `<div><b>${kr(lonAr + x.ar.kr)}</b><span>kostnad per år: ${kr(lonAr)} tid + ${kr(x.ar.kr)} OB</span></div>` : `<div><b>–</b><span>kostnad: ange timkostnad under ${installningar}</span></div>`}
    </div>
    <div class="rull" style="margin-top:12px"><table><thead><tr><th>OB-kategori</th><th class="tal">Tid, period</th><th class="tal">Kr, period</th><th class="tal">Tid, år</th><th class="tal">Kr, år</th></tr></thead><tbody>
      ${["A", "B", "C", "D"].map(rad).join("") || `<tr><td colspan="5" class="dampad">Ingen OB-tid.</td></tr>`}
      <tr><td><b>Totalt OB</b></td><td class="tal nw"><b>${tim(x.period.min)}</b></td><td class="tal nw"><b>${kr(x.period.kr)}</b></td><td class="tal nw"><b>${tim(x.ar.min)}</b></td><td class="tal nw"><b>${kr(x.ar.kr)}</b></td></tr>
      ${tk ? `<tr><td>Arbetstid × ${sv(tk, 0)} kr</td><td></td><td class="tal nw">${kr(lonPeriod)}</td><td></td><td class="tal nw">${kr(lonAr)}</td></tr>
      <tr><td><b>Kostnad totalt</b></td><td></td><td class="tal nw"><b>${kr(lonPeriod + x.period.kr)}</b></td><td></td><td class="tal nw"><b>${kr(lonAr + x.ar.kr)}</b></td></tr>` : ""}
    </tbody></table></div>
    ${x.ar.prognosMin ? `<p class="liten" style="color:var(--varn)">${tim(x.ar.prognosMin)} OB-tid ligger efter 2027-03-31 och räknas med en <b>prognos</b>: avtalsnivån från 2026-04-01 uppräknad med ${sv(ob.prognos, 1)} % per år. Det är inte avtalsbelopp. Prognosen ändras under ${installningar}.</p>` : ""}
    ${saknas ? `<p class="liten" style="color:var(--varn)">${tim(x.ar.saknarNiva)} OB-tid ligger efter 2027-03-31, där det inte finns något kontrollerat avtalsbelopp. Den tiden räknas utan kronor.</p>` : ""}
    <p class="dampad liten">Belopp: ${OB.NIVAER.map(n => `${n.kalla}`).join("; ")}${ob.prognos > 0 ? `; därefter prognos +${sv(ob.prognos, 1)} % per år` : ""}. Uppskattning för planering; utbetalningen följer lönesystemet och eventuella lokala avtal.</p></section>`;
}

// OB för ett pass i schemat, som text till verktygstips.
function obPassText(pid, d, res, indata) {
  const ob = obFor(res, indata); if (!ob) return "";
  const pp = ob.per[pid]?.perPass.find(x => x.dag === d); if (!pp || !pp.seg.length) return pp ? `\n${pp.datum}: ingen OB` : "";
  const sum = {}; pp.seg.forEach(s => (sum[s.kat] = (sum[s.kat] || 0) + s.min));
  return `\n${pp.datum}: OB ` + Object.entries(sum).map(([k, m]) => `${k.replace("_natt", " natt")} ${sv(m / 60, 2)} h`).join(", ");
}

// ---------------------------------------------------------------- dygnsvila och veckovila (visning)
// Visar vilan i ett lagt schema: tid mellan passen och längsta lediga tid per vecka från veckobrytet.
// Om reglerna följs avgör den fristående granskningen; det här är en överblick för användaren.
const DYGN_MIN = 1440, DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const klockMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function veckobrytMin(txt) {
  const m = /^(mån|tis|ons|tor|fre|lör|sön)\s+(\d{1,2}:\d{2})$/.exec(String(txt || "mån 00:00").trim());
  return m ? DAGNAMN.indexOf(m[1]) * DYGN_MIN + klockMin(m[2]) : 0;
}
function vila(rad, W, cykliskt = true, veckobryt = "mån 00:00") {
  const N = W * 7, L = N * DYGN_MIN, iv = [];
  rad.forEach((p, d) => { if (!p) return; const s = d * DYGN_MIN + klockMin(p.start); let e = d * DYGN_MIN + klockMin(p.slut); if (e <= s) e += DYGN_MIN; iv.push({ d, s, e, p }); });
  // tid mellan varje pass och nästa (över schemaskarven om schemat är cykliskt)
  const mellan = iv.map((x, i) => {
    const n = iv[i + 1] || (cykliskt && iv.length ? { ...iv[0], s: iv[0].s + L } : null);
    return n ? { dag: x.d, slut: x.p.slut, nastaDag: n.d, start: n.p.start, min: n.s - x.e } : null;
  }).filter(Boolean);
  // längsta lediga tid inom varje sjudagarsperiod från veckobrytet
  const alla = cykliskt ? [...iv.map(x => [x.s - L, x.e - L]), ...iv.map(x => [x.s, x.e]), ...iv.map(x => [x.s + L, x.e + L])] : iv.map(x => [x.s, x.e]);
  alla.sort((a, b) => a[0] - b[0]);
  const vb = veckobrytMin(veckobryt);
  const veckor = Array.from({ length: W }, (_, w) => {
    const a = w * 7 * DYGN_MIN + vb, b = a + 7 * DYGN_MIN;
    let langst = 0, fran = a, pos = a;
    for (const [s, e] of alla) { if (e <= a || s >= b) continue; const s2 = Math.max(s, a); if (s2 - pos > langst) { langst = s2 - pos; fran = pos; } pos = Math.max(pos, Math.min(e, b)); }
    if (b - pos > langst) { langst = b - pos; fran = pos; }
    return { vecka: w + 1, min: langst, fran };
  });
  return { mellan, veckor };
}
const tidText = t => { const d = ((Math.floor(t / DYGN_MIN) % 7) + 7) % 7, m = ((t % DYGN_MIN) + DYGN_MIN) % DYGN_MIN; return `${DAGNAMN[d]} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const regelVarde = (indata, k, std) => indata.regler?.[k] ?? std;

// ---------------------------------------------------------------- sammanställning per rad i schemat
// Räknas för de dagar som visas (en vecka eller hela perioden): pass, dag/kväll/natt, helgdagar, resurspass,
// aktiviteter, arbetstid, kortaste vila mellan pass och kortaste veckovila.
function radSumma(res, indata, pid, dagar, rs) {
  const rad = res.schema[pid], i = new Set(dagar), l = dagar.map(d => rad[d]).filter(Boolean);
  const v = vila(rad, res.veckor, res.cykliskt !== false, regelVarde(indata, "veckobryt", "mån 00:00"));
  const mel = v.mellan.filter(x => i.has(x.dag)), veckor = new Set(dagar.map(d => Math.floor(d / 7)));
  const vv = v.veckor.filter(x => veckor.has(x.vecka - 1));
  return { pass: l.length, morgon: l.filter(p => p.dygnsdel === "morgon").length, kvall: l.filter(p => p.dygnsdel === "kvall").length,
    natt: l.filter(p => p.dygnsdel === "natt").length, helg: dagar.filter(d => rad[d] && d % 7 > 4).length,
    resurs: dagar.filter(d => rad[d] && rs.has(pid + ":" + d)).length, akt: l.reduce((s, p) => s + (p.aktiviteter || []).length, 0),
    minuter: l.reduce((s, p) => s + (p.netto || 0), 0), dygnsvila: mel.length ? Math.min(...mel.map(x => x.min)) : null,
    veckovila: vv.length ? Math.min(...vv.map(x => x.min)) : null };
}
const SUMMAKOL = [["pass", "Pass", "Antal pass"], ["morgon", "D", "Dagpass (morgon)"], ["kvall", "K", "Kvällspass"], ["natt", "N", "Nattpass"],
  ["helg", "Hlg", "Arbetade helgdagar (lör och sön)"], ["resurs", "◼R", "Resurspass, utöver behovet"], ["akt", "★", "Aktiviteter (APT, utbildning …)"],
  ["minuter", "Tid", "Arbetstid"], ["dygnsvila", "Vila", "Kortaste vila mellan två pass"], ["veckovila", "V-vila", "Kortaste veckovila (sammanhängande ledighet per vecka)"]];
// vilka kolumner som behövs: natt och aktiviteter bara när de finns
function summaKol(res) {
  const rader = Object.values(res.schema);
  const natt = rader.some(r => r.some(p => p && p.dygnsdel === "natt")), akt = rader.some(r => r.some(p => p && p.aktiviteter));
  return SUMMAKOL.filter(([k]) => (k !== "natt" || natt) && (k !== "akt" || akt));
}
function summaHuvud(kol) { return kol.map(([k, t, tips], i) => `<th class="summa${i ? "" : " forsta"}" title="${tips}">${t}</th>`).join(""); }
function summaCeller(s, kol, indata) {
  const dv = regelVarde(indata, "dygnsvila_minuter", 660), wv = regelVarde(indata, "veckovila_minuter", 2160);
  const h = m => sv(m / 60, 1);
  return kol.map(([k], i) => {
    const v = s[k], f = i ? "" : " forsta";
    if (k === "minuter") return `<td class="summa nw${f}">${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}</td>`;
    if (k === "dygnsvila" || k === "veckovila") {
      if (v == null) return `<td class="summa${f}">–</td>`;
      const fel = v < (k === "dygnsvila" ? dv : wv);
      return `<td class="summa nw${f}${fel ? " fel" : ""}" title="${fel ? "Under gränsen" : "Inom gränsen"} (${h(k === "dygnsvila" ? dv : wv)} h)">${h(v)} h</td>`;
    }
    return `<td class="summa${f}${k === "resurs" && v ? " res" : ""}">${k === "resurs" && v ? "◼ " : ""}${v || (k === "pass" ? 0 : "")}</td>`;
  }).join("");
}
// summa för raden "I tjänst": totalt för alla personer
function summaTotal(res, indata, dagar, rs, kol) {
  const t = {}; Object.keys(res.schema).forEach(pid => { const s = radSumma(res, indata, pid, dagar, rs); for (const [k] of kol) if (typeof s[k] === "number" && !k.includes("vila")) t[k] = (t[k] || 0) + s[k]; });
  return kol.map(([k], i) => `<td class="summa${i ? "" : " forsta"}">${k.includes("vila") ? "" : k === "minuter" ? Math.round((t[k] || 0) / 60) + " h" : t[k] || 0}</td>`).join("");
}

// Sammanställningen som egen tabell (för smala skärmar): en rad per person.
function summaTabell(res, indata, dagar, rs, rubrik) {
  const kol = summaKol(res), pers = Object.keys(res.schema);
  return `<div class="rull"><table class="schema summatabell"><thead><tr><th>${rubrik || ""}</th>${summaHuvud(kol).replace(/ forsta/g, "")}</tr></thead><tbody>
    ${pers.map(pid => `<tr><td>${esc(pid)}</td>${summaCeller(radSumma(res, indata, pid, dagar, rs), kol, indata).replace(/ forsta/g, "")}</tr>`).join("")}
    <tr class="bem"><td>Alla</td>${summaTotal(res, indata, dagar, rs, kol).replace(/ forsta/g, "")}</tr></tbody></table></div>
    <p class="dampad liten" style="margin-top:4px">D dag, K kväll, N natt, Hlg helgdagar, ◼R resurspass, ★ aktiviteter. Vila = kortaste vila mellan två pass, V-vila = kortaste veckovila. Rött = under gränsen.</p>`;
}

// Kort i översikten: resurspass (utöver behovet) per person.
function resursKort(k, lank) {
  const n = nyckeltalFor(k), W = k.resultat.veckor, pers = Object.keys(k.resultat.schema);
  const max = Math.max(1, ...pers.map(p => (n.resursPer[p] || {}).pass || 0));
  return `<section class="kort"><h2>◼ Resurspass</h2>
    <p class="dampad liten">Pass utöver behovet, fördelade rättvist. ${n.resursPass} pass under perioden, ${sv(n.resursTimmarVecka, 1)} h per vecka (${sv(n.resursAndel, 1)} % av den schemalagda tiden). Kan användas för vikariat, aktiviteter eller utveckling.</p>
    ${n.resursPass ? `<div class="staplar">${pers.map(p => { const x = n.resursPer[p] || { pass: 0, minuter: 0 };
      return `<div class="hstapel"><span class="liten">${lank ? lank(p) : esc(p)}</span><div><i class="res" style="width:${x.pass / max * 100}%;background:var(--resurs)"></i></div><b class="liten" data-tips="${sv(x.minuter / 60, 1)} h under perioden">${x.pass} pass</b></div>`; }).join("")}</div>` : `<p class="tom">Inga pass utöver behovet.</p>`}
  </section>`;
}

// Var veckovilan ligger i schemat: lediga dagar som ingår i veckans längsta sammanhängande vila.
// Returnerar Map dag -> { vecka, timmar, forsta, text }.
function veckovilaDagar(res, indata, pid) {
  const rad = res.schema[pid], ut = new Map(); if (!rad) return ut;
  const N = res.veckor * 7, L = N * DYGN_MIN, wv = regelVarde(indata, "veckovila_minuter", 2160);
  const v = vila(rad, res.veckor, res.cykliskt !== false, regelVarde(indata, "veckobryt", "mån 00:00"));
  for (const x of v.veckor) {
    const a = x.fran, b = x.fran + x.min;
    let forsta = true;
    for (let dd = Math.floor(a / DYGN_MIN); dd * DYGN_MIN < b; dd++) {
      const d = ((dd % N) + N) % N;
      if (rad[d] || ut.has(d)) continue;
      const slut = tidText(b);
      ut.set(d, { vecka: x.vecka, timmar: x.min / 60, under: x.min < wv, forsta,
        text: `Veckovila vecka ${x.vecka}: ${sv(x.min / 60, 1)} h, från ${tidText(((a % L) + L) % L)} till ${slut}${x.min < wv ? ` (under ${sv(wv / 60, 0)} h)` : ""}` });
      forsta = false;
    }
  }
  return ut;
}
const vvMarke = (x, kort) => `<span class="vv${x.under ? " fel" : ""}" data-tips="${esc(x.text)}" aria-label="${esc(x.text)}">${kort ? "" : x.forsta ? `VV<small>${sv(x.timmar, 0)} h</small>` : "VV"}</span>`;

// Kort för en person: veckovila per vecka och vila mellan passen.
function vilaKort(pid, res, indata) {
  const rad = res.schema[pid]; if (!rad) return "";
  const dv = regelVarde(indata, "dygnsvila_minuter", 660), wv = regelVarde(indata, "veckovila_minuter", 2160);
  const v = vila(rad, res.veckor, res.cykliskt !== false, regelVarde(indata, "veckobryt", "mån 00:00"));
  const kortast = v.mellan.length ? Math.min(...v.mellan.map(x => x.min)) : null;
  const max = Math.max(wv * 1.6, ...v.veckor.map(x => x.min));
  const vecka = d => `V${Math.floor(d / 7) % res.veckor + 1} ${DAGNAMN[d % 7]}`;
  const tata = v.mellan.filter(x => x.min < dv + 120).sort((a, b) => a.min - b.min);
  return `<section class="kort"><h2>Dygnsvila och veckovila</h2>
    <p class="dampad liten">Avtalet kräver minst ${sv(dv / 60, 1)} h dygnsvila och ${sv(wv / 60, 1)} h sammanhängande veckovila. Veckan räknas från ${esc(regelVarde(indata, "veckobryt", "mån 00:00"))}${res.cykliskt !== false ? ", och vilan räknas även över skarven mellan sista och första veckan" : ""}.</p>
    <div class="kpi" style="margin-top:10px">
      <div class="${kortast != null && kortast < dv ? "fel" : ""}"><b>${kortast == null ? "–" : sv(kortast / 60, 1) + " h"}</b><span>kortaste vila mellan två pass</span></div>
      <div class="${Math.min(...v.veckor.map(x => x.min)) < wv ? "fel" : ""}"><b>${sv(Math.min(...v.veckor.map(x => x.min)) / 60, 1)} h</b><span>kortaste veckovila</span></div></div>
    <h3>Veckovila, längsta lediga tid per vecka</h3>
    ${v.veckor.map(x => `<div class="hstapel"><span class="liten">Vecka ${x.vecka}</span><div style="position:relative"><i class="${x.min < wv ? "vak" : "vila"}" style="width:${Math.min(100, x.min / max * 100)}%"></i><s style="position:absolute;left:${wv / max * 100}%;top:-3px;bottom:-3px;width:2px;background:var(--text)"></s></div><b class="liten" data-tips="Från ${tidText(x.fran)}">${sv(x.min / 60, 1)} h</b></div>`).join("")}
    <div class="legend" style="margin-top:6px"><span><i style="background:var(--morgon)"></i>Minst ${sv(wv / 60, 0)} h</span><span><i style="background:var(--kritisk)"></i>Kortare</span><span><i style="background:var(--text);width:3px"></i>Gränsen ${sv(wv / 60, 0)} h</span></div>
    <h3>Vila mellan passen</h3>
    ${tata.length ? `<p class="liten dampad">Kortaste vilorna (under ${sv((dv + 120) / 60, 0)} h):</p><ul class="punkter liten">${tata.slice(0, 8).map(x => `<li class="${x.min < dv ? "minus" : ""}">${vecka(x.dag)} slut ${x.slut} → ${vecka(x.nastaDag)} start ${x.start}: <b>${sv(x.min / 60, 1)} h</b>${x.min < dv ? " – under " + sv(dv / 60, 0) + " h" : ""}</li>`).join("")}</ul>`
      : `<p class="liten">All vila mellan passen är minst ${sv((dv + 120) / 60, 0)} h.</p>`}
  </section>`;
}

// Tabell för alla: kortaste vila mellan pass och kortaste veckovila per person.
function vilaTabell(res, indata, lank = null) {
  const dv = regelVarde(indata, "dygnsvila_minuter", 660), wv = regelVarde(indata, "veckovila_minuter", 2160);
  const rader = Object.keys(res.schema).map(pid => {
    const v = vila(res.schema[pid], res.veckor, res.cykliskt !== false, regelVarde(indata, "veckobryt", "mån 00:00"));
    const k = v.mellan.length ? Math.min(...v.mellan.map(x => x.min)) : null, w = Math.min(...v.veckor.map(x => x.min));
    return `<tr><td>${lank ? lank(pid) : `<b>${esc(pid)}</b>`}</td><td class="tal nw ${k != null && k < dv ? "minus" : ""}">${k == null ? "–" : sv(k / 60, 1) + " h"}</td><td class="tal nw ${w < wv ? "minus" : ""}">${sv(w / 60, 1)} h</td><td>${(k == null || k >= dv) && w >= wv ? "✓" : "!"}</td></tr>`;
  }).join("");
  return `<section class="kort"><h2>Dygnsvila och veckovila per person</h2><p class="dampad liten">Kortaste vila mellan två pass (minst ${sv(dv / 60, 0)} h) och kortaste sammanhängande veckovila (minst ${sv(wv / 60, 0)} h) i perioden.</p>
    <div class="rull"><table><thead><tr><th>Person</th><th class="tal">Kortaste dygnsvila</th><th class="tal">Kortaste veckovila</th><th></th></tr></thead><tbody>${rader}</tbody></table></div></section>`;
}

// ---------------------------------------------------------------- resurstid
// Pass utöver behovet (resurspass). Per dag och dygnsdel blir så många pass som ligger över behovet resurspass,
// fördelade rättvist: den som har haft minst resurspass hittills först. Returnerar en mängd med "person:dag".
function resurs(res, indata) {
  const ut = new Set(), behov = behovPerDag(indata), pers = Object.keys(res.schema), antal = {};
  const N = res.veckor * 7;
  for (let d = 0; d < N; d++) for (const del of ["morgon", "kvall", "natt"]) {
    const har = pers.filter(p => res.schema[p][d] && res.schema[p][d].dygnsdel === del);
    const extra = har.length - (behov[d % 7][del] || 0);
    if (extra <= 0) continue;
    const tur = p => (((pers.indexOf(p) - d) % pers.length) + pers.length) % pers.length;  // roterar mellan dagarna
    har.sort((a, b) => (antal[a] || 0) - (antal[b] || 0) || tur(a) - tur(b));
    har.slice(0, extra).forEach(p => { ut.add(p + ":" + d); antal[p] = (antal[p] || 0) + 1; });
  }
  return ut;
}
const resursMarke = `<i class="res" aria-label="Resurspass, utöver behovet">◼ R</i>`;

// ---------------------------------------------------------------- aktiviteter
// Liten markering i passet (stjärna och kod) och text för verktygstips.
function aktMarke(p) {
  const l = (p && p.aktiviteter) || [];
  return l.length ? `<i class="akt" aria-label="${esc(l.map(a => `${a.namn || a.id} ${a.start}–${a.slut}`).join(", "))}">★${esc(l.map(a => a.id).join(" "))}</i>` : "";
}
function aktText(p) {
  const l = (p && p.aktiviteter) || [];
  return l.length ? "\n" + l.map(a => `★ ${a.namn || a.id} ${a.start}–${a.slut}`).join("\n") : "";
}
// Kort med alla tillfällen: vem som deltar och om någon saknas.
function aktivitetKort(res) {
  const l = res.aktiviteter || [];
  if (!l.length) return "";
  const saknas = l.reduce((s, t) => s + t.saknas, 0);
  return `<section class="kort"><h2>Aktiviteter</h2>
    <p class="dampad liten">Den som deltar arbetar hela aktivitetstiden. Tiden räknas som arbetstid och ingår i passet, så den påverkar passlängd, vila, OB och bemanning.${saknas ? "" : " Alla tillfällen har så många deltagare som behövs."}</p>
    <div class="rull"><table class="lista"><thead><tr><th>Aktivitet</th><th>När</th><th>Deltar</th><th class="tal">Antal</th></tr></thead><tbody>
    ${l.map(t => `<tr><td><b>★ ${esc(t.namn)}</b></td><td class="nw">V${t.vecka} ${esc(t.veckodag)} <span class="mono">${esc(t.start)}–${esc(t.slut)}</span></td>
      <td>${esc(t.deltagare.join(", ")) || "–"}</td><td class="tal nw${t.saknas ? " fel" : ""}">${t.deltagare.length} av ${t.behov}${t.saknas ? ` · ${t.saknas} saknas` : ""}</td></tr>`).join("")}
    </tbody></table></div></section>`;
}

return { veckovilaDagar, vvMarke, resursKort, summaTabell, radSumma, summaKol, summaHuvud, summaCeller, summaTotal, resurs, resursMarke, aktMarke, aktText, aktivitetKort, vila, vilaKort, vilaTabell, obFor, obKort, obPassText, analysstaplar, nulage, DAGAR, PASSNAMN, REGELGRUPPER, bemanning, nyckeltalFor, kr, linjegraf, ringdiagram, varmekarta, behovsstaplar, passring, grafkort };
})();
if (typeof module !== "undefined") module.exports = GRAF;
