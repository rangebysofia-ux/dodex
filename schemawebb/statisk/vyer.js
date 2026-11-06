"use strict";
// Vyer för en körning: Schema (alla pass, morgon, kväll, natt eller klockslag), Personer och Bemanning.
// Laddas före app.js och använder dess hjälpfunktioner när vyerna ritas.

const KOD = { morgon: "M", kvall: "K", natt: "N" };
const FARG = { morgon: "var(--morgon)", kvall: "var(--kvall)", natt: "var(--natt)" };
const KPI_NAMN = [["vakanta_pass", "Vakanta pass"], ["vakanta_tidpunkter", "Vakanta tidpunkter"], ["blocklangd", "Arbetsdagar i följd över 4"],
  ["passlangd", "Passlängd, avvikelse i minuter"], ["rattvisa", "Rättvisa, spridning"], ["onskemal", "Brutna önskemål"]];
const DYGN = 1440;

// ---------------------------------------------------------------- beräkningar
function behovPerDag(indata) {
  const ut = Array.from({ length: 7 }, () => ({ morgon: 0, kvall: 0, natt: 0 }));
  for (const [k, v] of Object.entries(indata.behov || {})) {
    const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGAR.indexOf(k)];
    idx.forEach(i => { if (i >= 0) ut[i] = { morgon: v.morgon || 0, kvall: v.kvall || 0, natt: v.natt || 0 }; });
  }
  return ut;
}
function tidpunkterPerDag(indata) {
  const ut = Array.from({ length: 7 }, () => []);
  for (const [k, l] of Object.entries(indata.tidpunkter || {})) {
    const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGAR.indexOf(k)];
    idx.forEach(i => { if (i >= 0) ut[i] = l; });
  }
  return ut;
}
const minut = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const klock = m => `${String(Math.floor(((m % DYGN) + DYGN) % DYGN / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
function intervall(p, d) { const s = d * DYGN + minut(p.start); let e = d * DYGN + minut(p.slut); if (e <= s) e += DYGN; return [s, e]; }

function bemanning(res, indata) {
  const N = res.veckor * 7, behov = behovPerDag(indata);
  return Array.from({ length: N }, (_, d) => {
    const n = { morgon: 0, kvall: 0, natt: 0 };
    for (const rad of Object.values(res.schema)) { const p = rad[d]; if (p && n[p.dygnsdel] !== undefined) n[p.dygnsdel]++; }
    const b = behov[d % 7];
    const vak = { morgon: Math.max(0, b.morgon - n.morgon), kvall: Math.max(0, b.kvall - n.kvall), natt: Math.max(0, b.natt - n.natt) };
    return { d, n, b, vak };
  });
}

function heltidFor(indata, pid) {
  const p = indata.personal.find(x => x.id === pid) || {};
  return p.heltid_minuter_per_vecka || indata.heltid_minuter_per_vecka || 2220;
}

// Jämn fördelning: personer som kan ta både morgon och kväll ska ha ungefär samma andel kvällar.
function fordelning(res, indata) {
  const pers = indata.personal.reduce((m, p) => (m[p.id] = p, m), {});
  const rader = Object.entries(res.schema).map(([pid, rad]) => {
    const c = { morgon: 0, kvall: 0, natt: 0 };
    rad.forEach(p => { if (p && c[p.dygnsdel] !== undefined) c[p.dygnsdel]++; });
    const del = (pers[pid]?.dygnsdelar || ["morgon", "kvall"]).join(",");
    return { pid, c, typ: del === "morgon,kvall" || del === "kvall,morgon" ? "bada" : del };
  });
  const bada = rader.filter(r => r.typ === "bada");
  const totM = bada.reduce((s, r) => s + r.c.morgon, 0), totK = bada.reduce((s, r) => s + r.c.kvall, 0);
  const andel = totM + totK ? totK / (totM + totK) : 0.5;
  bada.forEach(r => { const n = r.c.morgon + r.c.kvall; r.mal = n * andel; r.avvikelse = r.c.kvall - r.mal; r.jamn = Math.abs(r.avvikelse) <= 1.5; });
  return { rader, andel, jamn: bada.every(r => r.jamn), storst: bada.length ? Math.max(...bada.map(r => Math.abs(r.avvikelse))) : 0, antalBada: bada.length };
}

// ---------------------------------------------------------------- körningsvy
async function visaKorningsvy(id, vyn, kid, q) {
  st.vy = vyn;
  await laddaEnhet(id);
  const k = await laddaKorning(kid);
  ritaMeny();
  const titel = { schema: "Schema", personer: "Personer", bemanning: "Bemanning" }[vyn] || "Schema";
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/indata`], [titel]]);
  if (vyn === "personer") st.sv.person = q.get("p") || st.sv.person || null;
  if (!k) {
    vy().innerHTML = `<section class="kort" style="text-align:center;padding:40px 18px"><div style="color:var(--accent)">${IKON.schema.replace("<svg", '<svg width="48" height="48"')}</div>
      <h1 style="margin-top:8px">Inget schema än</h1><p class="dampad">Lägg det första schemat för ${esc(st.enhet.namn)}. Det tar från några sekunder upp till ett par minuter.</p>
      <p><button class="primar" data-g="lagg-schema">${IKON.spela} Lägg schema</button></p></section>`;
    return;
  }
  ritaKorningsvy();
  if (k.status === "i kö" || k.status === "kör") startaPollning(async () => {
    const n = await api("GET", "korningar/" + k.id);
    st.korning = n;
    if (n.status !== "i kö" && n.status !== "kör") { st.korningar = await api("GET", `enheter/${st.enhet.id}/korningar`); ritaMeny(); }
    ritaKorningsvy();
    return n.status === "i kö" || n.status === "kör";
  });
}

function huvud() {
  const k = st.korning, res = k.resultat;
  const val = st.korningar.map(x => `<option value="${x.id}"${x.id === k.id ? " selected" : ""}>${esc(x.namn)} · ${datum(x.skapad)}</option>`).join("");
  return `<section class="kort"><div class="rubrikrad">
    <div style="display:block;min-width:220px;flex:1"><label for="korningsval">Körning</label><select id="korningsval" style="max-width:420px">${val}</select></div>
    <div>${res?.status === "OK" ? `<a class="knapp liten" href="api/korningar/${k.id}/excel">${IKON.ladda} Excel</a><a class="knapp liten" href="api/korningar/${k.id}/pdf">${IKON.ladda} PDF</a>` : ""}
      <button class="primar liten" data-g="lagg-schema">${IKON.spela} Lägg nytt schema</button></div></div></section>`;
}

function sammanfattning() {
  const k = st.korning, res = k.resultat, g = k.granskning, ind = k.indata;
  const brott = g ? g.brott.length : 0;
  const f = fordelning(res, ind);
  const totMin = Object.values(res.personer).reduce((s, p) => s + p.minuter, 0);
  const hVecka = totMin / 60 / res.veckor, aa = Object.keys(res.personer).reduce((s, pid) => s + res.personer[pid].minuter / res.veckor / heltidFor(ind, pid), 0);
  const avv = ind.avvikelser || [];
  const andradeAvv = avv.filter(a => ind.regler && ind.regler[a] !== undefined);
  const ok = !brott && !res.kpi.vakanser;
  return `<section class="kort">
    <div class="banner ${brott ? "dalig" : res.kpi.vakanser ? "varn" : "ok"}">${brott ? IKON.stopp : res.kpi.vakanser ? IKON.varning : IKON.ok}<div><strong>${
      brott ? `${brott} brott mot hårda regler` : res.kpi.vakanser ? `Schema klart, med ${vakText(res.kpi.vakanser)}` : "Schema klart, utan vakanser och regelbrott"}</strong>
      <span class="liten">${res.veckor} veckor${res.cykliskt ? ", cykliskt" : ""} · ${Object.keys(res.schema).length} personer · beräknat på ${sv(k.sekunder || 0, 1)} s${k.balans ? ` · bemanningsbalansen förutsåg ${vakText(k.balans.forvantade_vakanser)}` : ""}</span></div></div>
    ${andradeAvv.length ? `<div class="banner varn" style="margin-top:10px">${IKON.olast}<div><strong>Schemat följer upplåsta regler</strong><span class="liten">${andradeAvv.map(a => `${esc(regelnamn(a))}: ${a.endsWith("_minuter") ? sv(ind.regler[a] / 60, 1) + " h" : esc(ind.regler[a])}`).join(" · ")} (lokalt avtal eller beslut)</span></div></div>` : ""}
    <div class="kpi" style="margin-top:12px">
      <div class="${res.kpi.vakanta_pass ? "fel" : "bra"}"><b>${res.kpi.vakanta_pass}</b><span>Vakanta pass</span></div>
      <div class="${brott ? "fel" : "bra"}"><b>${brott}</b><span>Brott mot hårda regler</span></div>
      <div><b>${sv(hVecka, 1)} h</b><span>schemalagt per vecka</span></div>
      <div><b>${sv(aa)}</b><span>årsarbetare${ind.budget_timmar_vecka ? ` · budget ${sv(ind.budget_timmar_vecka, 1)} h` : ""}</span></div>
      <div class="${f.antalBada && !f.jamn ? "fel" : "bra"}"><b>${f.antalBada ? (f.jamn ? "Jämnt" : "Ojämnt") : "–"}</b><span>morgon och kväll${f.antalBada ? `, störst skillnad ${sv(f.storst, 1)} pass` : ""}</span></div>
    </div></section>`;
}

function ritaKorningsvy() {
  const k = st.korning;
  let h = huvud();
  if (k.status === "i kö" || k.status === "kör") {
    vy().innerHTML = h + `<section class="kort"><div class="banner info"><span class="spinner"></span><div><strong>${esc(k.steg || "Väntar")} …</strong>
      Lösaren optimerar i ordning: vakanser, arbetsdagar i följd, passlängd, rättvisa, önskemål. Det tar från några sekunder till ett par minuter. Du kan lämna sidan.</div></div>
      ${k.balans ? `<p class="dampad" style="margin-top:10px">Bemanningsbalansen förutser ${vakText(k.balans.forvantade_vakanser)}.</p>` : ""}</section>`;
    kopplaKorningsval(); return;
  }
  if (k.status === "fel") { vy().innerHTML = h + `<section class="kort"><div class="banner dalig">${IKON.stopp}<div><strong>Schemat kunde inte läggas</strong>${esc(k.fel)}</div></div></section>`; kopplaKorningsval(); return; }
  const res = k.resultat;
  if (res.status !== "OK") {
    const f = k.forklaring;
    h += `<section class="kort"><div class="banner dalig">${IKON.stopp}<div><strong>${res.status === "INFEASIBLE" ? "Schemat går inte att lägga" : "Inget schema hittades inom tidsgränsen"}</strong>${f ? esc(f.slutsats) : esc(res.orsak)}</div></div>`;
    if (f) {
      if (f.forkontroller?.length) h += `<h3>Förkontroller</h3><ul class="punkter">${f.forkontroller.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
      if (f.konflikt?.length) h += `<h3>Regler som krockar</h3><ul class="punkter">${f.konflikt.map(x => `<li><b>${esc(x.person)}</b> <span class="niva ${nk(x.niva)}">${esc(x.niva)}</span> ${esc(x.text)}</li>`).join("")}</ul>`;
      if (f.cykelgrans) h += `<h3>Cykelgränsen</h3><p>${esc(f.cykelgrans)}</p>`;
    }
    h += `<p style="margin-top:10px" class="chips"><a class="knapp" href="#/e/${k.enhet_id}/indata">Ändra indata</a><a class="knapp" href="#/e/${k.enhet_id}/installningar">Ändra regler</a></p></section>`;
    vy().innerHTML = h; kopplaKorningsval(); return;
  }
  h += sammanfattning();
  if (st.vy === "personer") h += ritaPersoner();
  else if (st.vy === "bemanning") h += ritaBemanning();
  else h += ritaSchemavy();
  vy().innerHTML = h;
  kopplaKorningsval();
}

function kopplaKorningsval() {
  const s = $("#korningsval");
  if (s) s.onchange = () => { location.hash = `#/e/${st.enhet.id}/${st.vy}/${s.value}`; };
}

// ---------------------------------------------------------------- schema
function ritaSchemavy() {
  const res = st.korning.resultat, filter = st.sv.filter || "alla";
  const F = [["alla", "Alla pass"], ["morgon", "Morgon"], ["kvall", "Kväll"], ["natt", "Natt"], ["tider", "Klockslag"]];
  let h = `<section class="kort"><div class="rubrikrad" style="margin-bottom:12px"><h2 style="margin:0">Schema</h2>
    <div class="chips" role="group" aria-label="Visa">${F.map(([v, t]) => `<button class="chip" data-g="filter" data-v="${v}" aria-pressed="${filter === v}">${FARG[v] ? `<i class="prick" style="background:${FARG[v]}"></i>` : ""}${t}</button>`).join("")}</div></div>
    <div class="chips" role="group" aria-label="Vecka" style="margin-bottom:12px">${Array.from({ length: res.veckor }, (_, v) => `<button class="chip" data-g="vecka" data-v="${v}" aria-pressed="${v === st.vecka}">Vecka ${v + 1}</button>`).join("")}
      ${filter !== "tider" ? `<button class="chip" data-g="vecka" data-v="-1" aria-pressed="${st.vecka === -1}">Alla veckor</button>` : ""}</div>`;
  if (filter === "tider") h += ritaKlockslag(res);
  else {
    h += st.vecka === -1 ? Array.from({ length: res.veckor }, (_, v) => `<h3>Vecka ${v + 1}</h3>` + schemaVecka(res, v, filter)).join("") : schemaVecka(res, Math.max(0, st.vecka), filter);
    h += `<p class="info" id="info">${cellInfo(res)}</p>
      <div class="legend"><span><i style="background:var(--morgon)"></i>Morgon</span><span><i style="background:var(--kvall)"></i>Kväll</span><span><i style="background:var(--natt)"></i>Natt</span>
      <span><i style="background:var(--kritisk-bg);outline:1px solid var(--kritisk)"></i>Vakans</span><span>Raden längst ned: i tjänst${filter !== "alla" ? " / behov" : ""}</span></div>`;
  }
  return h + `</section>`;
}

function schemaVecka(res, v, filter) {
  const pers = Object.keys(res.schema), bem = bemanning(res, st.korning.indata);
  let h = `<div class="rull"><table class="schema"><thead><tr><th>V${v + 1}</th>` +
    DAGAR.map((d, i) => `<th class="${i > 4 ? "helg" : ""}">${d}</th>`).join("") + `</tr></thead><tbody>`;
  for (const pid of pers) {
    h += `<tr><td title="${esc(pid)}"><a href="#/e/${st.enhet.id}/personer/${st.korning.id}?p=${encodeURIComponent(pid)}" style="color:inherit;text-decoration:none">${esc(pid)}</a></td>` + DAGAR.map((_, i) => {
      const d = v * 7 + i, p = res.schema[pid][d];
      if (!p) return `<td class="${i > 4 ? "helg" : ""}"></td>`;
      if (filter !== "alla" && p.dygnsdel !== filter) return `<td class="${i > 4 ? "helg" : ""}"><span class="pass dold" aria-label="${DELAR[p.dygnsdel]}">·</span></td>`;
      const n = pid + ":" + d;
      return `<td class="${i > 4 ? "helg" : ""}"><button class="pass ${p.dygnsdel}${st.valdCell === n ? " vald" : ""}" data-g="cell" data-c="${esc(n)}"
        aria-label="${esc(pid)} ${DAGAR[i]}: ${DELAR[p.dygnsdel]} ${p.start} till ${p.slut}"><b>${KOD[p.dygnsdel] || "?"}</b><small>${p.start}–${p.slut}</small></button></td>`;
    }).join("") + `</tr>`;
  }
  h += `<tr class="bem"><td>I tjänst</td>` + DAGAR.map((_, i) => {
    const x = bem[v * 7 + i];
    if (filter === "alla") {
      const vak = x.vak.morgon + x.vak.kvall + x.vak.natt;
      return `<td class="${vak ? "vakans" : ""}" data-tips="${DAGAR[i]} vecka ${v + 1}\nMorgon ${x.n.morgon} av ${x.b.morgon}\nKväll ${x.n.kvall} av ${x.b.kvall}\nNatt ${x.n.natt} av ${x.b.natt}">M${x.n.morgon}<br>K${x.n.kvall}<br>N${x.n.natt}${vak ? "<br>−" + vak : ""}</td>`;
    }
    return `<td class="${x.vak[filter] ? "vakans" : ""}">${x.n[filter]} / ${x.b[filter]}${x.vak[filter] ? "<br>vakans" : ""}</td>`;
  }).join("") + `</tr></tbody></table></div>`;
  return h;
}

function cellInfo(res) {
  if (!st.valdCell) return `<span class="dampad">Tryck på ett pass för tider, rast och arbetstid. Tryck på ett namn för personens schema.</span>`;
  const i = st.valdCell.lastIndexOf(":"), pid = st.valdCell.slice(0, i), d = +st.valdCell.slice(i + 1), p = res.schema[pid]?.[d];
  if (!p) return "";
  return `<b>${esc(pid)}</b>, vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}: ${DELAR[p.dygnsdel]?.toLowerCase() || ""}pass <span class="mono">${p.start}–${p.slut}</span>, rast ${p.rast} min, arbetstid ${timmar(p.netto)}.`;
}

// Klockslag: hur många som är i tjänst under dygnet, och vem som arbetar när.
function ritaKlockslag(res) {
  const v = Math.max(0, st.vecka), dagIdx = st.sv.dag ?? 0, d = v * 7 + dagIdx, N = res.veckor * 7;
  const a = d * DYGN, b = a + DYGN, L = N * DYGN;
  const rader = [];
  for (const [pid, rad] of Object.entries(res.schema)) {
    for (const dd of [d - 1, d]) {
      const idx = ((dd % N) + N) % N, p = rad[idx]; if (!p) continue;
      let [s, e] = intervall(p, idx); const skift = (dd - idx) * DYGN; s += skift; e += skift;
      if (dd < 0 && !res.cykliskt) continue;
      if (e > a && s < b) rader.push({ pid, p, s: Math.max(s, a) - a, e: Math.min(e, b) - a, helS: s, helE: e });
    }
  }
  rader.sort((x, y) => x.s - y.s || x.pid.localeCompare(y.pid));
  // antal i tjänst per kvart
  const steg = [];
  for (let t = 0; t < DYGN; t += 15) steg.push(rader.filter(r => r.s <= t && r.e > t).length);
  const tp = tidpunkterPerDag(st.korning.indata)[d % 7];
  const maxN = Math.max(1, ...steg, ...tp.map(x => x.antal));
  const W = 760, vX = 44, hX = 12, x = t => vX + (t / DYGN) * (W - vX - hX);
  const H1 = 150, y = n => 14 + (1 - n / maxN) * (H1 - 40);
  let path = `M${x(0)},${y(steg[0])}`;
  steg.forEach((n, i) => { path += ` H${x(i * 15)} V${y(n)}`; });
  path += ` H${x(DYGN)}`;
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const yt = [...new Set([0, Math.ceil(maxN / 2), maxN])];
  let svg = `<svg class="graf" viewBox="0 0 ${W} ${H1}" role="img" aria-label="Antal i tjänst under dygnet">
    ${yt.map(n => `<line class="rutnat" x1="${vX}" x2="${W - hX}" y1="${y(n)}" y2="${y(n)}"/><text x="${vX - 8}" y="${y(n) + 4}" text-anchor="end">${n}</text>`).join("")}
    <line class="axel" x1="${vX}" x2="${W - hX}" y1="${y(0)}" y2="${y(0)}"/>
    ${ticks.map(t => `<text x="${x(t * 60)}" y="${H1 - 8}" text-anchor="middle">${String(t).padStart(2, "0")}</text>`).join("")}
    <path d="${path} V${y(0)} H${x(0)} Z" style="fill:var(--accent-svag)"/>
    <path d="${path}" style="fill:none;stroke:var(--accent);stroke-width:2"/>
    ${steg.map((n, i) => `<rect class="traff" x="${x(i * 15)}" y="14" width="${x(15) - x(0)}" height="${H1 - 40}" data-tips="${klock(i * 15)}–${klock(i * 15 + 15)}\n${n} i tjänst"/>`).join("")}
    ${tp.map(t => { const n = steg[Math.floor(minut(t.tid) / 15)], brist = n < t.antal;
      return `<circle cx="${x(minut(t.tid))}" cy="${y(t.antal)}" r="5" style="fill:${brist ? "var(--kritisk)" : "var(--yta)"};stroke:${brist ? "var(--yta)" : "var(--text)"};stroke-width:2" data-tips="Kl ${t.tid}: behov ${t.antal}, i tjänst ${n}${brist ? " – vakans" : ""}"/>`; }).join("")}
  </svg>`;
  const radH = 24, H2 = rader.length * radH + 26;
  let gantt = `<svg class="graf" viewBox="0 0 ${W} ${H2}" role="img" aria-label="Vem som arbetar när">
    ${ticks.map(t => `<line class="rutnat" x1="${x(t * 60)}" x2="${x(t * 60)}" y1="0" y2="${H2 - 20}"/><text x="${x(t * 60)}" y="${H2 - 6}" text-anchor="middle">${String(t).padStart(2, "0")}</text>`).join("")}
    ${rader.map((r, i) => `<text x="${vX - 8}" y="${i * radH + 16}" text-anchor="end" style="font-weight:700;fill:var(--text)">${esc(r.pid)}</text>
      <rect x="${x(r.s)}" y="${i * radH + 4}" width="${Math.max(2, x(r.e) - x(r.s))}" height="${radH - 8}" rx="5" style="fill:${FARG[r.p.dygnsdel]}"
        data-tips="${esc(r.pid)}: ${DELAR[r.p.dygnsdel]} ${r.p.start}–${r.p.slut}\nArbetstid ${timmar(r.p.netto)}, rast ${r.p.rast} min"/>`).join("")}
  </svg>`;
  return `<div class="chips" role="group" aria-label="Dag" style="margin-bottom:12px">${DAGAR.map((n, i) => `<button class="chip" data-g="dag" data-v="${i}" aria-pressed="${i === dagIdx}">${n}</button>`).join("")}</div>
    <h3>I tjänst under dygnet, vecka ${v + 1} ${DAGAR[dagIdx]}</h3>${svg}
    ${tp.length ? `<p class="dampad liten">Punkterna visar behov vid klockslag. Röd punkt betyder att för få är i tjänst.</p>` : ""}
    <h3>Vem arbetar när</h3>${rader.length ? gantt : `<p class="tom">Ingen arbetar den här dagen.</p>`}
    <div class="legend"><span><i style="background:var(--morgon)"></i>Morgon</span><span><i style="background:var(--kvall)"></i>Kväll</span><span><i style="background:var(--natt)"></i>Natt</span></div>`;
}

// ---------------------------------------------------------------- personer
function ritaPersoner() {
  const k = st.korning, res = k.resultat, ind = k.indata, f = fordelning(res, ind);
  const valt = st.sv.person && res.schema[st.sv.person] ? st.sv.person : null;
  let h = `<section class="kort"><div class="personval" role="group" aria-label="Välj person">
    <button class="chip" data-g="person" data-v="" aria-pressed="${!valt}">Alla</button>
    ${Object.keys(res.schema).map(pid => { const r = f.rader.find(x => x.pid === pid); const farg = r.typ === "natt" ? FARG.natt : r.typ === "morgon" ? FARG.morgon : r.typ === "kvall" ? FARG.kvall : "var(--accent)";
      return `<button class="chip" data-g="person" data-v="${esc(pid)}" aria-pressed="${valt === pid}"><i class="prick" style="background:${farg}"></i>${esc(pid)}</button>`; }).join("")}
  </div></section>`;
  return h + (valt ? personkort(valt) : allaPersoner());
}

function allaPersoner() {
  const k = st.korning, res = k.resultat, ind = k.indata, f = fordelning(res, ind);
  const W = res.veckor;
  let sumMin = 0, sumAA = 0, sumKontr = 0;
  const rader = Object.entries(res.personer).map(([pid, x]) => {
    const ht = heltidFor(ind, pid), aa = x.minuter / W / ht, p = ind.personal.find(q => q.id === pid) || {};
    sumMin += x.minuter; sumAA += aa; sumKontr += (p.grad ?? 1) * ht / 60;
    const r = f.rader.find(q => q.pid === pid);
    return `<tr><td><a href="#/e/${st.enhet.id}/personer/${k.id}?p=${encodeURIComponent(pid)}"><b>${esc(pid)}</b></a></td><td class="tal">${Math.round((p.grad ?? 1) * 100)} %</td><td class="tal">${x.pass}</td>
      <td class="tal nw">${timmar(x.minuter)}</td><td class="tal nw">${sv(x.minuter / 60 / W, 1)} h</td><td class="tal">${sv(aa)}</td>
      <td class="tal">${r.c.morgon}</td><td class="tal">${r.c.kvall}</td><td class="tal">${r.c.natt}</td><td>${x.helggrupp || (p.helgfrekvens ? HELGER[p.helgfrekvens] : "–")}</td></tr>`;
  }).join("");
  const bud = ind.budget_timmar_vecka;
  let h = `<section class="kort"><h2>Timmar och årsarbetare</h2>
    <div class="kpi" style="margin-bottom:12px"><div><b>${sv(sumMin / 60 / W, 1)} h</b><span>schemalagt per vecka</span></div><div><b>${sv(sumAA)}</b><span>årsarbetare (schemalagt)</span></div>
      <div><b>${sv(sumKontr, 1)} h</b><span>kontrakterat per vecka</span></div>${bud ? `<div class="${sumMin / 60 / W > bud + 0.05 ? "fel" : "bra"}"><b>${sv(bud - sumMin / 60 / W, 1)} h</b><span>${sumMin / 60 / W > bud + 0.05 ? "över" : "kvar av"} budget ${sv(bud, 1)} h</span></div>` : ""}</div>
    <div class="rull"><table><thead><tr><th>Person</th><th class="tal">Grad</th><th class="tal">Pass</th><th class="tal">Tid totalt</th><th class="tal">Per vecka</th><th class="tal">Årsarbetare</th><th class="tal">Morgon</th><th class="tal">Kväll</th><th class="tal">Natt</th><th>Helg</th></tr></thead>
    <tbody>${rader}<tr><td><b>Totalt</b></td><td></td><td class="tal"><b>${Object.values(res.personer).reduce((s, x) => s + x.pass, 0)}</b></td><td class="tal nw"><b>${timmar(sumMin)}</b></td><td class="tal nw"><b>${sv(sumMin / 60 / W, 1)} h</b></td><td class="tal"><b>${sv(sumAA)}</b></td><td colspan="4"></td></tr></tbody></table></div>
    <p class="dampad liten" style="margin-top:8px">En årsarbetare är en heltid (${sv(heltidFor(ind, "") / 60, 2)} h per vecka). Schemalagd tid kan skilja några minuter från kontraktet inom toleransen.</p></section>`;
  return h + fordelningKort(f);
}

function fordelningKort(f) {
  const rader = f.rader;
  let h = `<section class="kort"><div class="rubrikrad"><h2 style="margin:0">Fördelning morgon och kväll</h2>
    <span class="status ${f.jamn ? "ok" : "dalig"}">${f.jamn ? "Jämnt fördelat" : "Ojämnt fördelat"}</span></div>
    <p class="dampad liten" style="margin:6px 0 10px">Alla som arbetar både dag och kväll ska ha ungefär samma andel kvällar: ${Math.round(f.andel * 100)} % i den här körningen. Strecket visar var varje person borde ligga. Jämnt betyder högst 1,5 pass ifrån.</p>`;
  for (const r of rader) {
    const tot = r.c.morgon + r.c.kvall + r.c.natt || 1;
    const seg = ["morgon", "kvall", "natt"].filter(d => r.c[d]).map(d => `<i style="width:${r.c[d] / tot * 100}%;background:${FARG[d]}" data-tips="${esc(r.pid)}: ${r.c[d]} ${DELAR[d].toLowerCase()}pass"></i>`).join("");
    const etikett = r.typ === "bada" ? (r.jamn ? `<span class="status ok">Jämnt</span> <span class="dampad">${r.c.kvall} kvällar</span>` : `<span class="status dalig">${r.avvikelse > 0 ? "+" : ""}${sv(r.avvikelse, 1)} kvällar</span>`)
      : `<span class="niva avviker">Undantag: ${r.typ === "natt" ? "natt" : "bara " + DELAR[r.typ].toLowerCase()}</span>`;
    const mal = r.typ === "bada" ? `style="--mal:${(r.c.morgon + r.c.kvall - r.mal) / tot * 100}%"` : "";
    h += `<div class="fordelningsrad"><span class="namn">${esc(r.pid)}</span><div class="${r.typ === "bada" ? "mal" : ""}" ${mal}><div class="fordelning">${seg}</div></div><span class="etikett liten">${etikett}</span></div>`;
  }
  return h + `<div class="legend" style="margin-top:10px"><span><i style="background:var(--morgon)"></i>Morgon</span><span><i style="background:var(--kvall)"></i>Kväll</span><span><i style="background:var(--natt)"></i>Natt</span><span><i style="background:var(--text);width:3px"></i>Jämn andel</span></div></section>`;
}

function personkort(pid) {
  const k = st.korning, res = k.resultat, ind = k.indata, x = res.personer[pid], rad = res.schema[pid];
  const p = ind.personal.find(q => q.id === pid) || {}, ht = heltidFor(ind, pid), W = res.veckor;
  const f = fordelning(res, ind), r = f.rader.find(q => q.pid === pid);
  const onsk = (ind.onskemal || []).filter(o => o.person === pid);
  const del = (p.dygnsdelar || ["morgon", "kvall"]).map(d => DELAR[d].toLowerCase()).join(" och ");
  let h = `<section class="kort"><div class="personkort"><div class="avatar">${esc(pid.slice(0, 3))}</div>
    <div><h1>${esc(pid)}</h1><p class="dampad" style="margin:2px 0 0">${Math.round((p.grad ?? 1) * 100)} % · arbetar ${del} · ${p.helgfrekvens && p.helgfrekvens !== "2/4" ? `<span class="niva avviker">helger: ${HELGER[p.helgfrekvens].toLowerCase()}</span>` : `varannan helg${x.helggrupp ? `, grupp ${x.helggrupp}` : ""}`}</p></div></div>
    <div class="kpi" style="margin-top:14px">
      <div><b>${x.pass}</b><span>pass på ${W} veckor</span></div>
      <div><b>${timmar(x.minuter)}</b><span>arbetstid totalt (mål ${timmar(x.mal_minuter)})</span></div>
      <div><b>${sv(x.minuter / 60 / W, 1)} h</b><span>per vecka</span></div>
      <div><b>${sv(x.minuter / W / ht)}</b><span>årsarbetare</span></div>
    </div>
    <h3>Morgon, kväll och natt</h3>
    <div class="fordelningsrad" style="border:0"><span class="namn"></span><div class="${r.typ === "bada" ? "mal" : ""}" ${r.typ === "bada" ? `style="--mal:${(r.c.morgon + r.c.kvall - r.mal) / (r.c.morgon + r.c.kvall + r.c.natt || 1) * 100}%"` : ""}><div class="fordelning" style="height:16px">
      ${["morgon", "kvall", "natt"].filter(d => r.c[d]).map(d => `<i style="width:${r.c[d] / (x.pass || 1) * 100}%;background:${FARG[d]}"></i>`).join("")}</div></div>
      <span class="liten">${r.typ === "bada" ? (r.jamn ? `<span class="status ok">Jämnt</span>` : `<span class="status dalig">${r.avvikelse > 0 ? "+" : ""}${sv(r.avvikelse, 1)} kvällar</span>`) : `<span class="niva avviker">Undantag</span>`}</span></div>
    <div class="legend">${["morgon", "kvall", "natt"].filter(d => r.c[d]).map(d => `<span><i style="background:${FARG[d]}"></i>${r.c[d]} ${DELAR[d].toLowerCase()}</span>`).join("")}${r.typ === "bada" ? `<span>Jämn andel: ${sv(r.mal, 1)} kvällar</span>` : ""}</div>
    ${onsk.length ? `<h3>Önskemål</h3><ul class="punkter liten">${onsk.map(o => `<li>${o.krav ? "Krav" : "Önskemål"}: ${esc(ONSKTYP[o.typ])}${o.varde ? " " + esc(o.varde) : ""}${o.dagar ? " · " + o.dagar.join(", ") : ""}${o.veckor && o.veckor !== "alla" ? " · " + (Array.isArray(o.veckor) ? "vecka " + o.veckor.join(", ") : o.veckor + " veckor") : ""}</li>`).join("")}</ul>` : ""}
  </section>
  <section class="kort"><h2>${esc(pid)}s schema</h2><div class="rull"><table class="schema"><thead><tr><th></th>${DAGAR.map((d, i) => `<th class="${i > 4 ? "helg" : ""}">${d}</th>`).join("")}<th class="tal">Tid</th></tr></thead><tbody>`;
  for (let v = 0; v < W; v++) {
    const veckMin = rad.slice(v * 7, v * 7 + 7).reduce((s, q) => s + (q ? q.netto : 0), 0);
    h += `<tr><td>V${v + 1}</td>${DAGAR.map((_, i) => { const q = rad[v * 7 + i]; return `<td class="${i > 4 ? "helg" : ""}">${q ? `<span class="pass ${q.dygnsdel}" data-tips="${DELAR[q.dygnsdel]} ${q.start}–${q.slut}\nArbetstid ${timmar(q.netto)}, rast ${q.rast} min"><b>${KOD[q.dygnsdel]}</b><small>${q.start}–${q.slut}</small></span>` : ""}</td>`; }).join("")}
      <td class="tal nw liten">${sv(veckMin / 60, 1)} h</td></tr>`;
  }
  return h + `</tbody></table></div></section>`;
}

// ---------------------------------------------------------------- bemanning
function ritaBemanning() {
  const k = st.korning, res = k.resultat, ind = k.indata, filter = st.sv.bfilter || "alla";
  const bem = bemanning(res, ind), N = bem.length;
  const delar = filter === "alla" ? ["morgon", "kvall", "natt"] : [filter];
  let behovSum = 0, tackt = 0, vakSum = 0, over = 0;
  bem.forEach(x => delar.forEach(d => { behovSum += x.b[d]; tackt += Math.min(x.n[d], x.b[d]); vakSum += x.vak[d]; over += Math.max(0, x.n[d] - x.b[d]); }));
  const F = [["alla", "Alla"], ["morgon", "Morgon"], ["kvall", "Kväll"], ["natt", "Natt"]];
  let h = `<section class="kort"><div class="rubrikrad" style="margin-bottom:12px"><h2 style="margin:0">Bemanning och vakanser</h2>
    <div class="chips" role="group" aria-label="Dygnsdel">${F.map(([v, t]) => `<button class="chip" data-g="bfilter" data-v="${v}" aria-pressed="${filter === v}">${FARG[v] ? `<i class="prick" style="background:${FARG[v]}"></i>` : ""}${t}</button>`).join("")}</div></div>
    <div class="kpi" style="margin-bottom:14px">
      <div><b>${behovSum}</b><span>pass enligt behovet</span></div>
      <div class="${vakSum ? "fel" : "bra"}"><b>${vakSum}</b><span>vakanta pass</span></div>
      <div><b>${behovSum ? Math.round(tackt / behovSum * 1000) / 10 : 100} %</b><span>av behovet täckt</span></div>
      <div><b>${over}</b><span>pass utöver behovet</span></div>
    </div>`;
  // stapeldiagram: en stapel per dag
  const maxV = Math.max(1, ...bem.map(x => Math.max(delar.reduce((s, d) => s + x.n[d] + x.vak[d], 0), delar.reduce((s, d) => s + x.b[d], 0))));
  const W = Math.max(640, N * 22 + 60), H = 240, vX = 34, hX = 8, top = 12, bas = H - 44;
  const kol = (W - vX - hX) / N, bred = Math.max(6, kol - 4);
  const y = n => bas - (n / maxV) * (bas - top);
  const yt = [...new Set([0, Math.round(maxV / 2), maxV])];
  let svg = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bemanning per dag mot behovet">
    <defs><pattern id="rand" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--kritisk-bg)"/><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--kritisk);stroke-width:2.5"/></pattern></defs>
    ${yt.map(n => `<line class="rutnat" x1="${vX}" x2="${W - hX}" y1="${y(n)}" y2="${y(n)}"/><text x="${vX - 6}" y="${y(n) + 4}" text-anchor="end">${n}</text>`).join("")}`;
  bem.forEach((x, i) => {
    const x0 = vX + i * kol + (kol - bred) / 2, helg = x.d % 7 > 4;
    if (helg) svg += `<rect x="${vX + i * kol}" y="${top}" width="${kol}" height="${bas - top}" style="fill:var(--helg)"/>`;
    let acc = 0, seg = "";
    delar.forEach(d => {
      if (!x.n[d]) return;
      seg += `<rect class="stapel" x="${x0}" y="${y(acc + x.n[d])}" width="${bred}" height="${Math.max(0, y(acc) - y(acc + x.n[d]) - 2)}" rx="3" style="fill:${FARG[d]}"/>`;
      acc += x.n[d];
    });
    const vak = delar.reduce((s, d) => s + x.vak[d], 0);
    if (vak) seg += `<rect x="${x0}" y="${y(acc + vak)}" width="${bred}" height="${Math.max(0, y(acc) - y(acc + vak) - 2)}" rx="3" style="fill:url(#rand)"/>`;
    const beh = delar.reduce((s, d) => s + x.b[d], 0);
    seg += `<line class="behov" x1="${x0 - 2}" x2="${x0 + bred + 2}" y1="${y(beh)}" y2="${y(beh)}"/>`;
    const tips = `Vecka ${Math.floor(x.d / 7) + 1} ${DAGAR[x.d % 7]}\n` + delar.map(d => `${DELAR[d]}: ${x.n[d]} av ${x.b[d]}${x.vak[d] ? ` – ${x.vak[d]} vakant` : ""}`).join("\n");
    svg += seg + `<rect class="traff" x="${vX + i * kol}" y="${top}" width="${kol}" height="${bas - top}" data-tips="${tips}"/>`;
    if (x.d % 7 === 0) svg += `<text x="${vX + i * kol + 2}" y="${bas + 30}" style="font-weight:700;fill:var(--text)">v${Math.floor(x.d / 7) + 1}</text>`;
    if (N <= 56) svg += `<text x="${vX + i * kol + kol / 2}" y="${bas + 14}" text-anchor="middle">${DAGAR[x.d % 7][0]}</text>`;
  });
  svg += `<line class="axel" x1="${vX}" x2="${W - hX}" y1="${bas}" y2="${bas}"/></svg>`;
  h += `<div class="rull">${svg}</div>
    <div class="legend" style="margin-top:8px">${delar.map(d => `<span><i style="background:${FARG[d]}"></i>${DELAR[d]}</span>`).join("")}
      <span><i style="background:url(#rand);background:repeating-linear-gradient(45deg,var(--kritisk) 0 2px,var(--kritisk-bg) 2px 5px)"></i>Vakans</span>
      <span><i style="background:var(--text);height:3px"></i>Behov</span><span><i style="background:var(--helg)"></i>Helg</span></div>`;
  // vakanslista och tabell
  const vlista = res.vakanser.filter(v => !v.dygnsdel || delar.includes(v.dygnsdel));
  h += vlista.length ? `<h3>Vakanser</h3><ul class="punkter">${vlista.map(v => `<li>Vecka ${v.vecka} ${v.veckodag}: ${v.antal} ${v.dygnsdel ? DELAR[v.dygnsdel].toLowerCase() + "pass" : "för få i tjänst kl " + v.tid}</li>`).join("")}</ul>
      ${k.balans?.atgarder?.length ? `<h3>Förslag</h3><ul class="punkter">${k.balans.atgarder.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}`
    : `<div class="banner ok" style="margin-top:12px">${IKON.ok}<div><strong>Inga vakanser${filter !== "alla" ? " för " + DELAR[filter].toLowerCase() : ""}</strong>Hela behovet är täckt.</div></div>`;
  h += `<details style="margin-top:12px"><summary>Visa som tabell</summary><div class="rull" style="margin-top:8px"><table><thead><tr><th>Dag</th>${delar.map(d => `<th class="tal">${DELAR[d]}</th>`).join("")}<th class="tal">Vakant</th></tr></thead><tbody>
    ${bem.map(x => `<tr><td class="nw">V${Math.floor(x.d / 7) + 1} ${DAGAR[x.d % 7]}</td>${delar.map(d => `<td class="tal">${x.n[d]} / ${x.b[d]}</td>`).join("")}<td class="tal">${delar.reduce((s, d) => s + x.vak[d], 0) || ""}</td></tr>`).join("")}</tbody></table></div></details></section>`;
  return h + granskningKort();
}

function granskningKort() {
  const g = st.korning.granskning; if (!g) return "";
  return `<section class="kort"><h2>Granskning</h2><p class="dampad liten">Fristående kontroll av det färdiga schemat mot reglerna som gäller för enheten. Dygnsvila räknad från dygnsbryt ${esc(g.dygnsbryt)}, veckovila från ${esc(g.veckobryt)}.</p>
    ${g.brott.length ? `<ul class="punkter">${g.brott.map(x => `<li><span class="niva ${nk(x.niva)}">${esc(x.niva)}</span> <b>${esc(x.person || "")}</b> ${esc(x.text)}</li>`).join("")}</ul>` : `<div class="banner ok">${IKON.ok}<div><strong>Inga brott mot hårda regler</strong></div></div>`}
    ${g.varningar.length ? `<details style="margin-top:10px"><summary>${g.varningar.length} saker att notera</summary><ul class="punkter liten" style="margin-top:8px">${g.varningar.map(x => `<li><span class="niva">${esc(x.niva)}</span> ${esc(x.person || "")} ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}</section>`;
}

// ---------------------------------------------------------------- klick i vyerna
async function vyKlick(g, el) {
  switch (g) {
    case "filter": st.sv.filter = el.dataset.v; if (st.sv.filter === "tider" && st.vecka < 0) st.vecka = 0; st.valdCell = null; return ritaKorningsvy();
    case "bfilter": st.sv.bfilter = el.dataset.v; return ritaKorningsvy();
    case "vecka": st.vecka = +el.dataset.v; st.valdCell = null; return ritaKorningsvy();
    case "dag": st.sv.dag = +el.dataset.v; return ritaKorningsvy();
    case "person": st.sv.person = el.dataset.v || null;
      history.replaceState(null, "", `#/e/${st.enhet.id}/personer/${st.korning.id}${st.sv.person ? "?p=" + encodeURIComponent(st.sv.person) : ""}`);
      return ritaKorningsvy();
    case "cell":
      st.valdCell = st.valdCell === el.dataset.c ? null : el.dataset.c;
      document.querySelectorAll(".pass.vald").forEach(b => b.classList.remove("vald"));
      if (st.valdCell) el.classList.add("vald");
      $("#info").innerHTML = cellInfo(st.korning.resultat); return;
  }
}

// ---------------------------------------------------------------- jämför
async function visaJamfor(ids) {
  const k = await Promise.all(ids.map(id => api("GET", "korningar/" + id)));
  if (!st.enhet || st.enhet.id !== k[0].enhet_id) await laddaEnhet(k[0].enhet_id);
  st.vy = "schema"; ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${k[0].enhet_id}/indata`], ["Jämför"]]);
  const sum = x => {
    const r = x.resultat, p = x.indata.personal;
    const f = r && r.status === "OK" ? fordelning(r, x.indata) : null;
    return {
      "Status": r ? (r.status === "OK" ? "Schema" : r.status === "INFEASIBLE" ? "Går inte att lägga" : "Inget schema") : x.status,
      ...Object.fromEntries(KPI_NAMN.map(([n, t]) => [t, r?.kpi?.[n] ?? "–"])),
      "Brott i granskningen": x.granskning ? x.granskning.brott.length : "–",
      "Morgon och kväll": f ? (f.jamn ? "Jämnt" : "Ojämnt") : "–",
      "Förutsagda vakanser": x.balans?.forvantade_vakanser ?? "–",
      "Personer": p.length,
      "Årsarbetare (kontrakt)": sv(p.reduce((s, q) => s + (q.grad ?? 1), 0)),
      "Önskemål": (x.indata.onskemal || []).length,
      "Upplåsta regler": (x.indata.avvikelser || []).length,
      "Sekunder": x.sekunder != null ? sv(x.sekunder, 1) : "–",
    };
  };
  const rader = k.map(sum), nycklar = Object.keys(rader[0]);
  const battre = new Set(["Vakanta pass", "Vakanta tidpunkter", "Arbetsdagar i följd över 4", "Passlängd, avvikelse i minuter", "Rättvisa, spridning", "Brutna önskemål", "Brott i granskningen"]);
  const lagst = n => { const v = rader.map(r => r[n]).filter(x => typeof x === "number"); return v.length === rader.length ? Math.min(...v) : null; };
  vy().innerHTML = `<section class="kort"><h1>Jämför körningar</h1><p class="dampad liten" style="margin-top:6px">Lägst värde är markerat för mål där lägre är bättre. Målen gäller i ordning uppifrån: färre vakanser väger alltid tyngre än allt under.</p>
    <div class="rull"><table><thead><tr><th></th>${k.map(x => `<th><a href="#/e/${x.enhet_id}/schema/${x.id}">${esc(x.namn)}</a><div class="dampad liten" style="font-weight:400">${datum(x.skapad)}</div></th>`).join("")}</tr></thead><tbody>
    ${nycklar.map(n => { const l = battre.has(n) ? lagst(n) : null; return `<tr><td>${n}</td>${rader.map(r => `<td class="nw"${l !== null && r[n] === l && rader.some(q => q[n] !== l) ? ` style="color:var(--bra);font-weight:800"` : ""}>${esc(r[n])}</td>`).join("")}</tr>`; }).join("")}
    </tbody></table></div></section>`;
}
