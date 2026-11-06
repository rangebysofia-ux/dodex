"use strict";
// Nyckeltal och grafer för ett lagt schema. Delas av webben (sidor.js) och lättversionen (light/sida.html),
// som assistent.js. Fristående: egna hjälpfunktioner, inga beroenden på resten av gränssnittet.
// Färgerna kommer från CSS-variablerna --morgon, --kvall, --natt, --over, --kritisk, --guld, --skog.

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
  return { bem, behov, tackt, vak, over, grad: behov ? tackt / behov * 100 : 100, perVecka, timmarVecka: minuter / 60 / W,
    overtid, pass, timkostnad, kostnadVecka: timkostnad ? minuter / 60 / W * timkostnad : null };
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
    const stil = diff < 0 ? `background:rgba(184,67,47,${Math.min(0.85, 0.3 + 0.25 * -diff)});color:#fff` : diff > 0 ? `background:rgba(47,111,158,${Math.min(0.75, 0.18 + 0.14 * diff)});color:${diff > 2 ? "#fff" : "var(--text)"}` : "background:var(--sand)";
    return `<td style="${stil}" data-tips="Vecka ${Math.floor(x.d / 7) + 1} ${DAGAR[x.d % 7]} ${PASSNAMN[d].toLowerCase()}\n${x.n[d]} i tjänst, behov ${x.b[d]}${diff < 0 ? ` – ${-diff} saknas` : diff > 0 ? ` – ${diff} över behovet` : ""}">${diff ? (diff > 0 ? "+" : "−") + Math.abs(diff) : ""}</td>`;
  };
  return `<div class="rull"><table class="varme"><thead><tr><th></th>${Array.from({ length: W }, (_, w) => `<th colspan="7" class="ny-vecka">V${w + 1}</th>`).join("")}</tr>
    <tr><th></th>${bem.map(x => `<th class="${x.d % 7 === 0 ? "ny-vecka" : ""}">${DAGAR[x.d % 7][0]}</th>`).join("")}</tr></thead>
    <tbody>${delar.map(d => `<tr><th>${PASSNAMN[d]}</th>${bem.map(x => cell(x, d).replace("<td ", `<td class="${x.d % 7 === 0 ? "ny-vecka" : ""}" `)).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="legend" style="margin-top:8px"><span><i style="background:rgba(184,67,47,.7)"></i>Underbemanning</span><span><i style="background:var(--sand)"></i>I balans</span><span><i style="background:rgba(47,111,158,.45)"></i>Överbemanning</span></div>`;
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
    h += `<rect x="${x0}" y="${y(t)}" width="${bred}" height="${Math.max(0, bas - y(t))}" rx="3" style="fill:${vak ? "var(--kritisk)" : t > b ? "var(--over)" : "var(--morgon)"};opacity:${vak ? .85 : .9}"/>`;
    h += `<line x1="${x0 - 2}" x2="${x0 + bred + 2}" y1="${y(b)}" y2="${y(b)}" style="stroke:var(--text);stroke-width:2"/>`;
    h += `<rect class="traff" x="${vX + i * kol}" y="${top}" width="${kol}" height="${bas - top}" data-tips="Vecka ${Math.floor(x.d / 7) + 1} ${DAGAR[x.d % 7]}\nPlanerat ${t}, behov ${b}${vak ? ` – ${vak} saknas` : t > b ? ` – ${t - b} över` : ""}"/>`;
    if (x.d % 7 === 0) h += `<text x="${vX + i * kol + 2}" y="${bas + 26}" style="font-weight:700;fill:var(--text)">v${Math.floor(x.d / 7) + 1}</text>`;
    if (N <= 42) h += `<text x="${vX + i * kol + kol / 2}" y="${bas + 13}" text-anchor="middle">${DAGAR[x.d % 7][0]}</text>`;
  });
  return `<div class="rull">${h}<line class="axel" x1="${vX}" x2="${W - hX}" y1="${bas}" y2="${bas}"/></svg></div>
    <div class="legend" style="margin-top:6px"><span><i style="background:var(--morgon)"></i>Planerat, behovet täckt</span><span><i style="background:var(--over)"></i>Över behovet</span><span><i style="background:var(--kritisk)"></i>Vakans</span><span><i style="background:var(--text);height:3px"></i>Behov</span></div>`;
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
  ["BLOCK_MAX", "Högst antal arbetsdagar i följd", "Lokal regel"], ["PASSFONSTER", "Passbyte i fönstret 12–18", "Lokal regel"],
  ["BLOCK_REKOMMENDERAT", "Rekommenderad blocklängd", "Mjuk"], ["SPRIDNING", "Morgon och kväll varje vecka", "Mjuk"], ["BEHOV", "Bemanningsbehov", "Mjuk"],
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


return { analysstaplar, nulage, DAGAR, PASSNAMN, REGELGRUPPER, bemanning, nyckeltalFor, kr, linjegraf, ringdiagram, varmekarta, behovsstaplar, passring, grafkort };
})();
if (typeof module !== "undefined") module.exports = GRAF;
