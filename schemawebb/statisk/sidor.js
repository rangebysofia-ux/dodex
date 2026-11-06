"use strict";
// Sidor i DODEX Scheduler: Översikt, Bemanningsbehov, Medarbetare, Rapporter, samt grafer och nyckeltal
// som delas med Analys och nyckeltal. Laddas efter vyer.js och före app.js.

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

function nyckeltalskort(k, foregaende) {
  if (!k || k.status !== "klar" || k.resultat?.status !== "OK") {
    const kort = (ikon, klass, namn) => `<div class="nyckel"><div class="ikon ${klass}">${IKON[ikon]}</div><div><span>${namn}</span><b>–</b><small>Lägg ett schema</small></div></div>`;
    return `<div class="nyckeltal">${kort("behov", "", "Bemanningsgrad")}${kort("kostnad", "sand", "Personalkostnad")}${kort("lucka", "bla", "Obemannade pass")}${kort("klocka", "guld", "Planerad övertid")}</div>`;
  }
  const n = nyckeltalFor(k), fv = foregaende?.kpi?.vakanta_pass;
  const diff = fv != null ? n.vak - fv : null;
  return `<div class="nyckeltal">
    <div class="nyckel"><div class="ikon">${IKON.behov}</div><div><span>Bemanningsgrad</span><b>${sv(n.grad, 1)} %</b><small class="${n.grad >= 99.95 ? "upp" : "ned"}">${n.tackt} av ${n.behov} pass täckta</small></div></div>
    <div class="nyckel"><div class="ikon sand">${IKON.kostnad}</div><div><span>Personalkostnad (uppskattad)</span>${n.kostnadVecka != null
      ? `<b>${kr(n.kostnadVecka * 52 / 12)}</b><small>per månad · ${kr(n.kostnadVecka)} per vecka</small>`
      : `<b>${sv(n.timmarVecka, 1)} h</b><a href="#/e/${st.enhet.id}/installningar">Ange timkostnad för kronor</a>`}</div></div>
    <div class="nyckel"><div class="ikon bla">${IKON.lucka}</div><div><span>Obemannade pass</span><b class="${n.vak ? "minus" : ""}">${n.vak}</b><small class="${diff == null ? "" : diff <= 0 ? "upp" : "ned"}">${diff == null ? `${n.over} pass över behovet` : diff === 0 ? "samma som förra körningen" : `${diff > 0 ? "+" : ""}${diff} mot förra körningen`}</small></div></div>
    <div class="nyckel"><div class="ikon guld">${IKON.klocka}</div><div><span>Planerad övertid</span><b>${sv(n.overtid, 1)} h</b><small>per vecka, utöver kontrakterad tid</small></div></div>
  </div>`;
}

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
    <ul class="ringlegend">${delar.map(d => `<li><i style="background:${d.farg}"></i>${d.namn}<b>${Math.round(d.varde / tot * 100)} %</b></li>`).join("")}</ul></div>`;
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
    <section class="kort"><h2>${n.timkostnad ? "Personalkostnad per vecka" : "Schemalagda timmar per vecka"}</h2><p class="dampad liten">${n.timkostnad ? `Med timkostnaden ${n.timkostnad} kr.` : `Ange timkostnad under Inställningar för att se kronor.`}${k.indata.budget_timmar_vecka ? " Guldlinjen är budgeten." : ""}</p>${kostnad}</section>
  </div>
  <div class="tva">
    <section class="kort"><h2>Behov och planerad bemanning per dag</h2>${behovsstaplar(n.bem)}</section>
    <section class="kort"><h2>Passfördelning</h2>${passring(n)}</section>
  </div>
  <section class="kort"><h2>Värmekarta: under- och överbemanning</h2><p class="dampad liten">Varje ruta är en dygnsdel en dag i perioden. Siffran visar hur många som saknas (−) eller är över behovet (+).</p>${varmekarta(n.bem, W)}</section>`;
}

// ---------------------------------------------------------------- Översikt
async function visaOversikt(id) {
  st.vy = "oversikt";
  await laddaEnhet(id);
  const k = await laddaKorning(null);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn]]);
  const okLista = st.korningar.filter(x => x.status === "klar" && x.losning === "OK");
  const foregaende = k ? okLista.find(x => x.id !== k.id && x.id < k.id) : null;
  const ind = st.indata, kt = kontrakteradTid(ind);
  let h = `<section class="kort"><div class="rubrikrad"><div style="display:block"><h1>${esc(st.enhet.namn)}</h1>
      <p class="dampad" style="margin:4px 0 0">${ind.personal.length} medarbetare · ${ind.veckor} veckor${ind.cykliskt !== false ? ", cykliskt" : ""} · ${sv(kt, 1)} h kontrakterat per vecka${ind.budget_timmar_vecka ? ` av budget ${sv(ind.budget_timmar_vecka, 1)} h` : ""}${k ? ` · senaste schema ${datum(k.skapad)}` : ""}</p></div>
      <div>${k ? `<a class="knapp liten" href="#/e/${id}/schema/${k.id}">${IKON.schema} Öppna schemat</a>` : ""}</div></div></section>
    ${nyckeltalskort(k, foregaende)}`;
  if (k && k.status === "klar" && k.resultat?.status === "OK") {
    h += grafkort(k);
    const g = k.granskning;
    h += `<div class="tva"><section class="kort"><h2>Regelkontroll</h2>${regellista(k)}<p style="margin-top:10px"><a href="#/e/${id}/regelkontroll/${k.id}">Visa detaljer</a></p></section>
      <section class="kort"><h2>Förslag</h2><p class="dampad">Jämför bemanningsalternativ inom budget och se konsekvenser för vakanser, kostnad, helger och kvällsfördelning.</p>
      <p><a class="knapp guld" href="#/e/${id}/analys">${IKON.simulering} Öppna simulering</a></p>
      ${k.balans?.atgarder?.length ? `<h3>Från bemanningsbalansen</h3><ul class="punkter liten">${k.balans.atgarder.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}</section></div>`;
  } else if (k && (k.status === "i kö" || k.status === "kör")) {
    h += `<section class="kort"><div class="banner info"><span class="spinner"></span><div><strong>Schemat läggs …</strong>Översikten uppdateras när det är klart.</div></div></section>`;
    startaPollning(async () => { const n = await api("GET", "korningar/" + k.id); if (n.status === "klar" || n.status === "fel") { st.korning = null; st.korningar = await api("GET", `enheter/${id}/korningar`); visaOversikt(id); return false; } return true; });
  } else {
    h += `<section class="kort" style="text-align:center;padding:36px 18px"><h2>Inget schema än</h2><p class="dampad">Lägg in medarbetare och bemanningsbehov, och tryck sedan på Lägg schema.</p>
      <p class="chips" style="justify-content:center"><a class="knapp" href="#/e/${id}/medarbetare">${IKON.grupp} Medarbetare</a><a class="knapp" href="#/e/${id}/behov">${IKON.behov} Bemanningsbehov</a><button class="guld" data-g="lagg-schema">${IKON.spela} Lägg schema</button></p></section>`;
  }
  vy().innerHTML = h;
}

// Regler som granskas, med bock eller varning.
function regellista(k) {
  const g = k.granskning; if (!g) return `<p class="dampad">Ingen granskning.</p>`;
  const r = { ...(k.indata.regler || {}) }, avv = new Set(k.indata.avvikelser || []);
  const grupper = [["DYGNSVILA", `Dygnsvila (minst ${sv((r.dygnsvila_minuter ?? 660) / 60, 1)} h)`, "dygnsvila_minuter"], ["VECKOVILA", `Veckovila (minst ${sv((r.veckovila_minuter ?? 2160) / 60, 1)} h)`, "veckovila_minuter"],
    ["RAST", "Rast efter högst 5 h arbete", "rast_grans_minuter"], ["ANTAL_PASS", "Antal pass enligt kontrakt"], ["TID", "Arbetstid enligt kontrakt"],
    ["HELG", "Helger och fredagskvällar", "helgfrekvens"], ["BLOCK_MIN", "Inga enstaka arbetsdagar"], ["BLOCK_MAX", "Högst 5 arbetsdagar i följd"], ["PASSFONSTER", "Passbyte i fönstret 12–18"]];
  return `<ul class="regellista">${grupper.map(([kod, text, nyckel]) => { const n = g.brott.filter(b => b.regel === kod).length;
    return `<li class="${n ? "brott" : "ok"}">${n ? IKON.varning : IKON.ok}<span>${text}${nyckel && avv.has(nyckel) && r[nyckel] !== undefined ? ` <span class="niva avviker">upplåst</span>` : ""}</span><b>${n ? n + " brott" : ""}</b></li>`; }).join("")}
    <li class="${g.varningar.length ? "info" : "ok"}">${g.varningar.length ? IKON.varning : IKON.ok}<span>Mjuka regler och behov</span><b>${g.varningar.length ? g.varningar.length + " att notera" : ""}</b></li></ul>`;
}

// ---------------------------------------------------------------- Bemanningsbehov
async function visaBehov(id) {
  st.vy = "behov";
  await laddaEnhet(id);
  const k = await laddaKorning(null);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Bemanningsbehov"]]);
  st.flik = "behov"; st.redigeraOnsk = null;
  let h = `<section class="kort"><h1>Bemanningsbehov</h1><p class="dampad" style="margin:6px 0 0">Hur många som behövs per dygnsdel och dag, och vid särskilda klockslag. Ändringar sparas automatiskt; tryck på Lägg schema för ett nytt schema.</p></section>
    <div class="redigera"><section class="kort"><div id="flik">${ritaFlik()}</div></section><aside><section class="kort" id="kontroll">${ritaKontroll()}</section></aside></div>`;
  if (k && k.status === "klar" && k.resultat?.status === "OK") {
    const n = nyckeltalFor(k);
    h += `<section class="kort"><div class="rubrikrad"><h2 style="margin:0">Behov mot senaste schemat</h2><a href="#/e/${id}/nyckeltal/${k.id}">Fler grafer</a></div>${behovsstaplar(n.bem)}</section>
      <section class="kort"><h2>Värmekarta</h2>${varmekarta(n.bem, k.resultat.veckor)}</section>`;
  }
  vy().innerHTML = h;
  kontrollera();
}

// ---------------------------------------------------------------- Medarbetare
async function visaMedarbetare(id, kid, q) {
  st.vy = "medarbetare";
  await laddaEnhet(id);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Medarbetare"]]);
  const flik = q.get("flik") === "onskemal" ? "onskemal" : "personal";
  st.flik = flik; st.redigeraOnsk = null;
  vy().innerHTML = `<section class="kort"><div class="rubrikrad"><div style="display:block"><h1>Medarbetare</h1>
      <p class="dampad" style="margin:6px 0 0">Sysselsättningsgrad, vilka pass var och en arbetar, helgundantag och önskemål. Använd id-koder i stället för namn.</p></div>
      <div><a class="knapp" href="#/e/${id}/personer">${IKON.person} Schema per person</a></div></div></section>
    <div class="redigera"><section class="kort">
      <div class="flikar" role="tablist"><button role="tab" data-g="mflik" data-f="personal" aria-selected="${flik === "personal"}">Medarbetare (${st.indata.personal.length})</button>
        <button role="tab" data-g="mflik" data-f="onskemal" aria-selected="${flik === "onskemal"}">Önskemål (${(st.indata.onskemal || []).length})</button></div>
      <div id="flik">${ritaFlik()}</div></section>
      <aside><section class="kort" id="kontroll">${ritaKontroll()}</section></aside></div>`;
  kopplaOnskForm();
  kontrollera();
}

// ---------------------------------------------------------------- Rapporter
async function visaRapporter(id) {
  st.vy = "rapporter";
  await laddaEnhet(id);
  const k = await laddaKorning(null);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Rapporter"]]);
  const ok = st.korningar.filter(x => x.status === "klar" && x.losning === "OK");
  vy().innerHTML = `<section class="kort"><h1>Rapporter</h1><p class="dampad" style="margin:6px 0 0">Ladda ner schemat som Excel eller PDF, skriv ut en sammanfattning eller jämför körningar.</p></section>
    ${k && k.resultat?.status === "OK" ? `<section class="kort utskrift"><div class="rubrikrad"><h2 style="margin:0">Sammanfattning – ${esc(k.namn)}</h2>
      <div class="ej-utskrift"><a class="knapp liten" href="api/korningar/${k.id}/excel">${IKON.ladda} Excel</a><a class="knapp liten" href="api/korningar/${k.id}/pdf">${IKON.ladda} PDF</a><button class="liten" onclick="window.print()">Skriv ut</button></div></div>
      <p class="dampad liten">${esc(st.enhet.namn)} · ${datum(k.skapad)}</p>${nyckeltalskort(k)}<div style="margin-top:16px">${regellista(k)}</div></section>` : ""}
    <section class="kort"><div id="korningar">${ritaKorningar()}</div><p class="dampad liten" style="margin:10px 0 0">Kryssa i två eller fler körningar för att jämföra dem.</p></section>
    ${ok.length ? `<section class="kort"><h2>Exportera en tidigare körning</h2><div class="rull"><table><tbody>${ok.map(x => `<tr><td>${esc(x.namn)}</td><td class="dampad liten">${datum(x.skapad)}</td><td class="nw"><a class="knapp liten" href="api/korningar/${x.id}/excel">Excel</a> <a class="knapp liten" href="api/korningar/${x.id}/pdf">PDF</a></td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
}

// ---------------------------------------------------------------- Analys och nyckeltal
async function valdKorning(id, kid) {
  await laddaEnhet(id);
  return laddaKorning(kid ? Number(kid) : null);
}

function korningsval(id, vyn, k) {
  const ok = st.korningar.filter(x => x.status === "klar" && x.losning === "OK");
  if (ok.length < 2) return "";
  return `<label class="liten" style="display:flex;gap:8px;align-items:center">Körning
    <select data-g="byt-korning" data-vy="${vyn}" style="width:auto">${ok.map(x => `<option value="${x.id}"${x.id === k?.id ? " selected" : ""}>${esc(x.namn)} · ${datum(x.skapad)}</option>`).join("")}</select></label>`;
}

async function visaNyckeltal(id, kid) {
  st.vy = "nyckeltal";
  const k = await valdKorning(id, kid);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Analys och nyckeltal"]]);
  const ok = k && k.status === "klar" && k.resultat?.status === "OK";
  let h = `<section class="kort"><div class="rubrikrad"><div style="display:block"><h1>Analys och nyckeltal</h1>
    <p class="dampad" style="margin:6px 0 0">Bemanningsgrad, kostnad, passfördelning och var schemat är under- eller överbemannat.</p></div>${ok ? korningsval(id, "nyckeltal", k) : ""}</div></section>`;
  if (!ok) { vy().innerHTML = h + `<section class="kort tom">Det finns inget färdigt schema att analysera. Lägg ett schema först.</section>`; return; }
  const n = nyckeltalFor(k), res = k.resultat;
  h += nyckeltalskort(k) + grafkort(k);
  // Per person: dag/kväll/natt, timmar och avvikelse från kontrakt.
  const rader = Object.entries(res.personer).map(([pid, p]) => {
    const c = { morgon: 0, kvall: 0, natt: 0 };
    (res.schema[pid] || []).forEach(x => { if (x && c[x.dygnsdel] !== undefined) c[x.dygnsdel]++; });
    const diff = (p.minuter - p.mal_minuter) / 60;
    return `<tr><td><a href="#/e/${id}/personer/${k.id}?p=${encodeURIComponent(pid)}">${esc(pid)}</a></td><td class="tal">${c.morgon}</td><td class="tal">${c.kvall}</td><td class="tal">${c.natt}</td>
      <td class="tal">${sv(p.minuter / 60 / res.veckor, 1)}</td><td class="tal ${Math.abs(diff) > 0.5 ? (diff > 0 ? "minus" : "") : ""}">${diff > 0 ? "+" : ""}${sv(diff, 1)}</td></tr>`;
  }).join("");
  h += `<section class="kort"><h2>Per medarbetare</h2><div class="rull"><table><thead><tr><th>Id</th><th class="tal">Dag</th><th class="tal">Kväll</th><th class="tal">Natt</th><th class="tal">h/vecka</th><th class="tal">Mot kontrakt (h)</th></tr></thead><tbody>${rader}</tbody></table></div></section>`;
  vy().innerHTML = h;
}

// ---------------------------------------------------------------- Regelkontroll
const REGELGRUPPER = [
  ["DYGNSVILA", "Dygnsvila", "Avtal"], ["VECKOVILA", "Veckovila", "Avtal"], ["RAST", "Rast efter högst 5 h arbete", "Lag"],
  ["ANTAL_PASS", "Antal pass enligt kontrakt", "Lokal regel"], ["TID", "Arbetstid enligt kontrakt", "Kontrakt"],
  ["HELG", "Helger och fredagskvällar", "Lokal regel"], ["BLOCK_MIN", "Inga enstaka arbetsdagar", "Lokal regel"],
  ["BLOCK_MAX", "Högst antal arbetsdagar i följd", "Lokal regel"], ["PASSFONSTER", "Passbyte i fönstret 12–18", "Lokal regel"],
  ["BLOCK_REKOMMENDERAT", "Rekommenderad blocklängd", "Mjuk"], ["SPRIDNING", "Morgon och kväll varje vecka", "Mjuk"], ["BEHOV", "Bemanningsbehov", "Mjuk"],
];

async function visaRegelkontroll(id, kid) {
  st.vy = "regelkontroll";
  const k = await valdKorning(id, kid);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Regelkontroll"]]);
  const ok = k && k.status === "klar" && k.resultat?.status === "OK" && k.granskning;
  let h = `<section class="kort"><div class="rubrikrad"><div style="display:block"><h1>Regelkontroll</h1>
    <p class="dampad" style="margin:6px 0 0">Schemat granskas av en fristående kontroll som inte delar kod med motorn. Hårda regler ska vara uppfyllda; mjuka regler och behov visas som saker att notera.</p></div>${ok ? korningsval(id, "regelkontroll", k) : ""}</div></section>`;
  if (!ok) { vy().innerHTML = h + `<section class="kort tom">Det finns inget granskat schema. Lägg ett schema först.</section>`; return; }
  const g = k.granskning, avv = k.indata.avvikelser || [];
  h += `<section class="kort"><div class="banner ${g.giltigt ? "bra" : "dalig"}">${g.giltigt ? IKON.ok : IKON.varning}<div><strong>${g.giltigt ? "Alla hårda regler är uppfyllda" : `${g.brott.length} brott mot hårda regler`}</strong>
    ${g.varningar.length} saker att notera bland mjuka regler och behov.${avv.length ? ` Upplåsta regler för enheten: ${avv.map(esc).join(", ")}.` : ""}</div></div></section>`;
  const alla = [...g.brott.map(b => ({ ...b, hard: true })), ...g.varningar.map(b => ({ ...b, hard: false }))];
  h += `<section class="kort"><ul class="regellista stor">${REGELGRUPPER.map(([kod, namn, niva]) => {
    const l = alla.filter(b => b.regel === kod), hard = l.some(b => b.hard);
    const klass = !l.length ? "ok" : hard ? "brott" : "info";
    return `<li class="${klass}">${l.length ? IKON.varning : IKON.ok}<span>${namn} <span class="niva">${niva}</span></span><b>${l.length ? `${l.length} ${hard ? "brott" : "att notera"}` : "Uppfylld"}</b>
      ${l.length ? `<details><summary>Visa</summary><ul class="punkter liten">${l.slice(0, 60).map(b => `<li>${b.person ? `<b>${esc(b.person)}</b>: ` : ""}${esc(b.text)}</li>`).join("")}${l.length > 60 ? `<li>… och ${l.length - 60} till</li>` : ""}</ul></details>` : ""}</li>`;
  }).join("")}</ul></section>`;
  vy().innerHTML = h;
}
