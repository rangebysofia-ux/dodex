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
    const over = { morgon: Math.max(0, n.morgon - b.morgon), kvall: Math.max(0, n.kvall - b.kvall), natt: Math.max(0, n.natt - b.natt) };
    return { d, n, b, vak, over };
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
  // vecka för vecka: antal kvällar och morgnar, och veckor som bara har den ena sorten
  rader.forEach(r => {
    const rad = res.schema[r.pid];
    r.veckor = Array.from({ length: res.veckor }, (_, w) => { const v = rad.slice(w * 7, w * 7 + 7).filter(Boolean); return { k: v.filter(p => p.dygnsdel === "kvall").length, m: v.filter(p => p.dygnsdel === "morgon").length }; });
    r.ensidiga = r.typ === "bada" ? r.veckor.filter(v => v.k + v.m && (!v.k || !v.m)).length : 0;
  });
  return { rader, andel, jamn: bada.every(r => r.jamn), storst: bada.length ? Math.max(...bada.map(r => Math.abs(r.avvikelse))) : 0, antalBada: bada.length,
    ensidiga: bada.reduce((s, r) => s + r.ensidiga, 0), personveckor: bada.length * res.veckor };
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
      <p><button class="guld" data-g="lagg-schema">${IKON.spela} Lägg schema</button></p></section>`;
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
      <button class="guld liten" data-g="lagg-schema">${IKON.spela} Lägg nytt schema</button></div></div></section>`;
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
  if (st.red && st.red.kid !== k.id) st.red = null;
  h += st.red ? redigeringsrad() : sammanfattning();
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
  const res = st.red?.res || st.korning.resultat, filter = st.sv.filter || "alla";
  const F = [["alla", "Alla pass"], ["morgon", "Morgon"], ["kvall", "Kväll"], ["natt", "Natt"], ["tider", "Klockslag"]];
  let h = `<section class="kort${st.red ? " redigerar" : ""}"><div class="rubrikrad" style="margin-bottom:12px"><h2 style="margin:0">Schema</h2>
    ${st.red ? "" : `<button class="liten" data-g="redigera">${IKON.penna || "✎"} Redigera schemat</button>`}
    <div class="chips" role="group" aria-label="Visa" style="margin-left:auto">${F.map(([v, t]) => `<button class="chip" data-g="filter" data-v="${v}" aria-pressed="${filter === v}">${FARG[v] ? `<i class="prick" style="background:${FARG[v]}"></i>` : ""}${t}</button>`).join("")}</div></div>
    <div class="chips" role="group" aria-label="Vecka" style="margin-bottom:12px">${Array.from({ length: res.veckor }, (_, v) => `<button class="chip" data-g="vecka" data-v="${v}" aria-pressed="${v === st.vecka}">Vecka ${v + 1}</button>`).join("")}
      ${filter !== "tider" ? `<button class="chip" data-g="vecka" data-v="-1" aria-pressed="${st.vecka === -1}">${res.veckor === 6 ? "Sexveckorsperiod" : "Hela perioden"}</button>` : ""}</div>`;
  if (filter === "tider") h += ritaKlockslag(res);
  else {
    h += st.vecka === -1 ? schemaDagar(res, Array.from({ length: res.veckor * 7 }, (_, d) => d), filter, true) : schemaVecka(res, Math.max(0, st.vecka), filter);
    h += `<p class="info" id="info">${cellInfo(res)}</p>
      <div class="legend"><span><i style="background:var(--morgon)"></i>Morgon</span><span><i style="background:var(--kvall)"></i>Kväll</span><span><i style="background:var(--natt)"></i>Natt</span>
      <span><i style="border:2px dashed var(--svag);background:none"></i>Vakant pass</span><span class="minus">−1 vakans</span><span class="plus">+1 över behovet</span><span>Raden längst ned: i tjänst${filter !== "alla" ? (st.vecka === -1 ? "" : " / behov") : ""}${st.vecka === -1 ? ". Håll muspekaren över en ruta för detaljer" : ""}</span></div>`;
  }
  return h + `</section>`;
}

// Vakanser som pass: varje vakant pass får dygnsdelens vanligaste tider i schemat.
function vakansPass(res, indata) {
  const tider = {};
  for (const rad of Object.values(res.schema)) for (const p of rad) if (p) {
    const t = p.start + "–" + p.slut; (tider[p.dygnsdel] = tider[p.dygnsdel] || {})[t] = (tider[p.dygnsdel][t] || 0) + 1;
  }
  const r = indata.regler || {}, np = (indata.nattpass && indata.nattpass[0]) || { start: "21:45", slut: "07:15" };
  const reserv = { morgon: [r.morgon_start || "07:00", "15:00"], kvall: ["14:00", r.kvall_slut || "22:00"], natt: [np.start, np.slut] };
  const vanligast = d => tider[d] ? Object.entries(tider[d]).sort((a, b) => b[1] - a[1])[0][0].split("–") : reserv[d];
  const perDag = Array.from({ length: res.veckor * 7 }, () => []);
  for (const v of res.vakanser || []) if (v.dygnsdel) for (let i = 0; i < v.antal; i++) {
    const [start, slut] = vanligast(v.dygnsdel); perDag[v.dag].push({ dygnsdel: v.dygnsdel, start, slut, vakant: true });
  }
  const ordning = { morgon: 0, kvall: 1, natt: 2 };
  perDag.forEach(l => l.sort((a, b) => ordning[a.dygnsdel] - ordning[b.dygnsdel]));
  return perDag;
}

// Ett schema för valfria dagar: en vecka, eller hela perioden i en bred tabell.
function schemaVecka(res, v, filter) { return schemaDagar(res, Array.from({ length: 7 }, (_, i) => v * 7 + i), filter, false); }

function schemaDagar(res, dagar, filter, period) {
  const pers = Object.keys(res.schema), bem = bemanning(res, st.korning.indata), vp = vakansPass(res, st.korning.indata);
  const kl = (d, extra = "") => `class="${d % 7 > 4 ? "helg" : ""}${period && d % 7 === 0 ? " ny-vecka" : ""}${extra}"`;
  let h = `<div class="rull"><table class="schema${period ? " period" : ""}"${period ? ` style="min-width:${60 + dagar.length * 34}px"` : ""}><thead>`;
  if (period) h += `<tr><th></th>${Array.from({ length: dagar.length / 7 }, (_, w) => `<th colspan="7" class="ny-vecka" style="text-align:left">Vecka ${Math.floor(dagar[0] / 7) + w + 1}</th>`).join("")}</tr>`;
  h += `<tr><th>${period ? "" : "V" + (Math.floor(dagar[0] / 7) + 1)}</th>` + dagar.map(d => `<th ${kl(d)}>${period ? DAGAR[d % 7].slice(0, 2) : DAGAR[d % 7]}</th>`).join("") + `</tr></thead><tbody>`;
  for (const pid of pers) {
    const red = !!st.red;
    h += `<tr><td title="${esc(pid)}"${red && st.red.felpersoner?.has(pid) ? ' class="regelfel"' : ""}><a href="#/e/${st.enhet.id}/personer/${st.korning.id}?p=${encodeURIComponent(pid)}" style="color:inherit;text-decoration:none">${esc(pid)}</a></td>` + dagar.map(d => {
      const p = res.schema[pid][d], n = pid + ":" + d;
      const mal = red ? ` data-mal="${esc(n)}"` : "";
      if (!p) return `<td ${kl(d)}${mal}>${red ? `<button class="tom" data-g="ny-pass" data-c="${esc(n)}" aria-label="Lägg till pass ${esc(pid)} ${DAGAR[d % 7]}">+</button>` : ""}</td>`;
      if (filter !== "alla" && p.dygnsdel !== filter) return `<td ${kl(d)}${mal}><span class="pass dold" aria-label="${DELAR[p.dygnsdel]}">·</span></td>`;
      return `<td ${kl(d)}${mal}><button class="pass ${p.dygnsdel}${st.valdCell === n ? " vald" : ""}${p.manuell ? " manuell" : ""}" data-g="${red ? "andra-pass" : "cell"}" data-c="${esc(n)}"${red ? ' draggable="true"' : ""}${period ? ` data-tips="${esc(pid)} vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}\n${DELAR[p.dygnsdel]} ${p.start}–${p.slut}"` : ""}
        aria-label="${esc(pid)} ${DAGAR[d % 7]}: ${DELAR[p.dygnsdel]} ${p.start} till ${p.slut}"><b>${KOD[p.dygnsdel] || "?"}</b>${period ? "" : `<small>${p.start}–${p.slut}</small>`}</button></td>`;
    }).join("") + `</tr>`;
  }
  // vakanta pass som egna rader med streckad kant
  const synliga = d => vp[d].filter(x => filter === "alla" || x.dygnsdel === filter);
  const rader = Math.max(0, ...dagar.map(d => synliga(d).length));
  for (let r = 0; r < rader; r++) {
    h += `<tr class="vakantrad"><td>Vakant</td>` + dagar.map(d => {
      const x = synliga(d)[r];
      return `<td ${kl(d)}>${x ? `<span class="pass vakant ${x.dygnsdel}" data-tips="Vakant ${DELAR[x.dygnsdel].toLowerCase()}pass, vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}\n${x.start}–${x.slut} (vanligaste tiden)" aria-label="Vakant ${DELAR[x.dygnsdel].toLowerCase()}pass ${DAGAR[d % 7]}"><b>${KOD[x.dygnsdel]}</b>${period ? "" : `<small>${x.start}–${x.slut}</small>`}</span>` : ""}</td>`;
    }).join("") + `</tr>`;
  }
  h += `<tr class="bem"><td>${period ? "I tj." : "I tjänst"}</td>` + dagar.map(d => {
    const x = bem[d];
    const delar = filter === "alla" ? ["morgon", "kvall", "natt"] : [filter];
    const vak = delar.reduce((s, k) => s + x.vak[k], 0), over = delar.reduce((s, k) => s + x.over[k], 0);
    const tips = `${DAGAR[d % 7]} vecka ${Math.floor(d / 7) + 1}\n` + delar.map(k => `${DELAR[k]}: ${x.n[k]} av ${x.b[k]}${x.vak[k] ? ` (${x.vak[k]} vakant)` : x.over[k] ? ` (+${x.over[k]} över behovet)` : ""}`).join("\n");
    const marke = `${vak ? `<span class="minus">−${vak}</span>` : ""}${over ? `<span class="plus">+${over}</span>` : ""}`;
    const klass = vak ? " vakans" : over ? " over" : "";
    if (period) return `<td ${kl(d, klass)} data-tips="${tips}">${marke || "✓"}</td>`;
    const antal = filter === "alla" ? `M${x.n.morgon}<br>K${x.n.kvall}<br>N${x.n.natt}` : `${x.n[filter]} / ${x.b[filter]}`;
    return `<td ${kl(d, klass)} data-tips="${tips}">${antal}${marke ? "<br>" + marke : ""}</td>`;
  }).join("") + `</tr></tbody></table></div>`;
  return h;
}

function cellInfo(res) {
  if (!st.valdCell) return `<span class="dampad">Tryck på ett pass för tider, rast och arbetstid. Tryck på ett namn för personens schema.</span>`;
  const i = st.valdCell.lastIndexOf(":"), pid = st.valdCell.slice(0, i), d = +st.valdCell.slice(i + 1), p = res.schema[pid]?.[d];
  if (!p) return "";
  return `<b>${esc(pid)}</b>, vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}: ${DELAR[p.dygnsdel]?.toLowerCase() || ""}pass <span class="mono">${p.start}–${p.slut}</span>, rast ${p.rast} min, arbetstid ${timmar(p.netto)}.${GRAF.obPassText(pid, d, res, st.korning.indata).replace("\n", " ")}`;
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
  const vakanta = [];
  for (const x of vakansPass(res, st.korning.indata)[d]) { const [s, e] = intervall(x, d); vakanta.push({ pid: "Vakant", p: x, s: s - a, e: Math.min(e, b) - a, vakant: true }); }
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
  const alla = rader.concat(vakanta);
  const radH = 24, H2 = alla.length * radH + 26;
  let gantt = `<svg class="graf" viewBox="0 0 ${W} ${H2}" role="img" aria-label="Vem som arbetar när">
    ${ticks.map(t => `<line class="rutnat" x1="${x(t * 60)}" x2="${x(t * 60)}" y1="0" y2="${H2 - 20}"/><text x="${x(t * 60)}" y="${H2 - 6}" text-anchor="middle">${String(t).padStart(2, "0")}</text>`).join("")}
    ${alla.map((r, i) => `<text x="${vX - 8}" y="${i * radH + 16}" text-anchor="end" style="font-weight:700;fill:${r.vakant ? "var(--kritisk)" : "var(--text)"}">${esc(r.pid)}</text>
      <rect x="${x(r.s)}" y="${i * radH + 4}" width="${Math.max(2, x(r.e) - x(r.s))}" height="${radH - 8}" rx="5" style="${r.vakant ? `fill:none;stroke:${FARG[r.p.dygnsdel]};stroke-width:2;stroke-dasharray:6 4` : `fill:${FARG[r.p.dygnsdel]}`}"
        data-tips="${r.vakant ? `Vakant ${DELAR[r.p.dygnsdel].toLowerCase()}pass ${r.p.start}–${r.p.slut}` : `${esc(r.pid)}: ${DELAR[r.p.dygnsdel]} ${r.p.start}–${r.p.slut}\nArbetstid ${timmar(r.p.netto)}, rast ${r.p.rast} min`}"/>`).join("")}
  </svg>`;
  return `<div class="chips" role="group" aria-label="Dag" style="margin-bottom:12px">${DAGAR.map((n, i) => `<button class="chip" data-g="dag" data-v="${i}" aria-pressed="${i === dagIdx}">${n}</button>`).join("")}</div>
    <h3>I tjänst under dygnet, vecka ${v + 1} ${DAGAR[dagIdx]}</h3>${svg}
    ${tp.length ? `<p class="dampad liten">Punkterna visar behov vid klockslag. Röd punkt betyder att för få är i tjänst.</p>` : ""}
    <h3>Vem arbetar när</h3>${alla.length ? gantt : `<p class="tom">Ingen arbetar den här dagen.</p>`}
    <div class="legend"><span><i style="background:var(--morgon)"></i>Morgon</span><span><i style="background:var(--kvall)"></i>Kväll</span><span><i style="background:var(--natt)"></i>Natt</span>${vakanta.length ? `<span><i style="border:2px dashed var(--svag);background:none"></i>Vakant pass</span>` : ""}</div>`;
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
  const ob = GRAF.obFor(res, ind);
  const rader = Object.entries(res.personer).map(([pid, x]) => {
    const ht = heltidFor(ind, pid), aa = x.minuter / W / ht, p = ind.personal.find(q => q.id === pid) || {};
    sumMin += x.minuter; sumAA += aa; sumKontr += (p.grad ?? 1) * ht / 60;
    const r = f.rader.find(q => q.pid === pid);
    return `<tr><td><a href="#/e/${st.enhet.id}/personer/${k.id}?p=${encodeURIComponent(pid)}"><b>${esc(pid)}</b></a></td><td class="tal">${Math.round((p.grad ?? 1) * 100)} %</td><td class="tal">${x.pass}</td>
      <td class="tal nw">${timmar(x.minuter)}</td><td class="tal nw">${sv(x.minuter / 60 / W, 1)} h</td><td class="tal">${sv(aa)}</td>
      <td class="tal">${r.c.morgon}</td><td class="tal">${r.c.kvall}</td><td class="tal">${r.c.natt}</td><td>${x.helggrupp || (p.helgfrekvens ? HELGER[p.helgfrekvens] : "–")}</td><td class="tal nw">${ob ? kr(ob.per[pid].ar.kr) : "–"}</td></tr>`;
  }).join("");
  const bud = ind.budget_timmar_vecka;
  let h = `<section class="kort"><h2>Timmar och årsarbetare</h2>
    <div class="kpi" style="margin-bottom:12px"><div><b>${sv(sumMin / 60 / W, 1)} h</b><span>schemalagt per vecka</span></div><div><b>${sv(sumAA)}</b><span>årsarbetare (schemalagt)</span></div>
      <div><b>${sv(sumKontr, 1)} h</b><span>kontrakterat per vecka</span></div>${bud ? `<div class="${sumMin / 60 / W > bud + 0.05 ? "fel" : "bra"}"><b>${sv(bud - sumMin / 60 / W, 1)} h</b><span>${sumMin / 60 / W > bud + 0.05 ? "över" : "kvar av"} budget ${sv(bud, 1)} h</span></div>` : ""}</div>
    <div class="rull"><table><thead><tr><th>Person</th><th class="tal">Grad</th><th class="tal">Pass</th><th class="tal">Tid totalt</th><th class="tal">Per vecka</th><th class="tal">Årsarbetare</th><th class="tal">Morgon</th><th class="tal">Kväll</th><th class="tal">Natt</th><th>Helg</th><th class="tal">OB per år</th></tr></thead>
    <tbody>${rader}<tr><td><b>Totalt</b></td><td></td><td class="tal"><b>${Object.values(res.personer).reduce((s, x) => s + x.pass, 0)}</b></td><td class="tal nw"><b>${timmar(sumMin)}</b></td><td class="tal nw"><b>${sv(sumMin / 60 / W, 1)} h</b></td><td class="tal"><b>${sv(sumAA)}</b></td><td colspan="4"></td><td class="tal nw"><b>${ob ? kr(Object.values(ob.per).reduce((s, x) => s + x.ar.kr, 0)) : "–"}</b></td></tr></tbody></table></div>
    <p class="dampad liten" style="margin-top:8px">Tryck på en person för hela schemat med timmar, OB och kostnad. OB per år räknas enligt AB 25 § 21 från ${esc(ob?.start || "")}${ob?.antaget ? " (antaget startdatum)" : ""}. En årsarbetare är en heltid (${sv(heltidFor(ind, "") / 60, 2)} h per vecka). Schemalagd tid kan skilja några minuter från kontraktet inom toleransen.</p></section>`;
  return h + fordelningKort(f);
}

function fordelningKort(f) {
  const rader = f.rader;
  let h = `<section class="kort"><div class="rubrikrad"><h2 style="margin:0">Fördelning morgon och kväll</h2>
    <span class="status ${f.jamn ? "ok" : "dalig"}">${f.jamn ? "Jämnt fördelat" : "Ojämnt fördelat"}</span></div>
    <p class="dampad liten" style="margin:6px 0 10px">Alla som arbetar både dag och kväll ska ha ungefär samma andel kvällar: ${Math.round(f.andel * 100)} % i den här körningen. Strecket visar var varje person borde ligga. Jämnt betyder högst 1,5 pass ifrån. Under varje stapel: kvällar/morgnar vecka för vecka, rött betyder en vecka med bara den ena sorten.</p>
    ${f.antalBada ? `<div class="banner ${f.ensidiga ? "varn" : "ok"}" style="margin-bottom:10px">${f.ensidiga ? IKON.varning : IKON.ok}<div><strong>${f.ensidiga ? `${f.ensidiga} av ${f.personveckor} veckor utan blandning` : "Blandat varje vecka"}</strong><span class="liten">${f.ensidiga ? "Inställningen Blandning av morgon och kväll finns under Regler. Fredagsregeln (kväll hela helgen efter fredag kväll) gör ofta att helgveckor blir ensidiga." : "Alla som arbetar både morgon och kväll har båda sorterna varje vecka."}</span></div></div>` : ""}`;
  for (const r of rader) {
    const tot = r.c.morgon + r.c.kvall + r.c.natt || 1;
    const seg = ["morgon", "kvall", "natt"].filter(d => r.c[d]).map(d => `<i style="width:${r.c[d] / tot * 100}%;background:${FARG[d]}" data-tips="${esc(r.pid)}: ${r.c[d]} ${DELAR[d].toLowerCase()}pass"></i>`).join("");
    const etikett = r.typ === "bada" ? (r.jamn ? `<span class="status ok">Jämnt</span> <span class="dampad">${r.c.kvall} kvällar</span>` : `<span class="status dalig">${r.avvikelse > 0 ? "+" : ""}${sv(r.avvikelse, 1)} kvällar</span>`)
      : `<span class="niva avviker">Undantag: ${r.typ === "natt" ? "natt" : "bara " + DELAR[r.typ].toLowerCase()}</span>`;
    const mal = r.typ === "bada" ? `style="--mal:${(r.c.morgon + r.c.kvall - r.mal) / tot * 100}%"` : "";
    const veckor = r.typ === "bada" ? `<div class="veckomix">${r.veckor.map((v, w) => `<span class="${v.k + v.m && (!v.k || !v.m) ? "ensidig" : ""}" data-tips="Vecka ${w + 1}: ${v.k} kvällar, ${v.m} morgnar">${v.k}/${v.m}</span>`).join("")}</div>` : "";
    h += `<div class="fordelningsrad"><span class="namn">${esc(r.pid)}</span><div><div class="${r.typ === "bada" ? "mal" : ""}" ${mal}><div class="fordelning">${seg}</div></div>${veckor}</div><span class="etikett liten">${etikett}</span></div>`;
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
  ${GRAF.vilaKort(pid, res, ind)}
  ${GRAF.obKort(pid, res, ind, { installningar: "Inställningar → Period" })}
  <section class="kort"><h2>${esc(pid)}s schema</h2><div class="rull"><table class="schema"><thead><tr><th></th>${DAGAR.map((d, i) => `<th class="${i > 4 ? "helg" : ""}">${d}</th>`).join("")}<th class="tal">Tid</th></tr></thead><tbody>`;
  for (let v = 0; v < W; v++) {
    const veckMin = rad.slice(v * 7, v * 7 + 7).reduce((s, q) => s + (q ? q.netto : 0), 0);
    h += `<tr><td>V${v + 1}</td>${DAGAR.map((_, i) => { const q = rad[v * 7 + i]; return `<td class="${i > 4 ? "helg" : ""}">${q ? `<span class="pass ${q.dygnsdel}" data-tips="${DELAR[q.dygnsdel]} ${q.start}–${q.slut}\nArbetstid ${timmar(q.netto)}, rast ${q.rast} min${GRAF.obPassText(pid, v * 7 + i, res, ind)}"><b>${KOD[q.dygnsdel]}</b><small>${q.start}–${q.slut}</small></span>` : ""}</td>`; }).join("")}
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
  const passTid = {};
  for (const rad of Object.values(res.schema)) for (const q of rad) if (q) (passTid[q.dygnsdel] = passTid[q.dygnsdel] || []).push(q.netto);
  const snitt = d => passTid[d] && passTid[d].length ? passTid[d].reduce((a, b) => a + b, 0) / passTid[d].length : 480;
  bem.forEach(x => delar.forEach(d => { behovSum += x.b[d]; tackt += Math.min(x.n[d], x.b[d]); vakSum += x.vak[d]; over += Math.max(0, x.n[d] - x.b[d]); }));
  const F = [["alla", "Alla"], ["morgon", "Morgon"], ["kvall", "Kväll"], ["natt", "Natt"]];
  let h = `<section class="kort"><div class="rubrikrad" style="margin-bottom:12px"><h2 style="margin:0">Bemanning och vakanser</h2>
    <div class="chips" role="group" aria-label="Dygnsdel">${F.map(([v, t]) => `<button class="chip" data-g="bfilter" data-v="${v}" aria-pressed="${filter === v}">${FARG[v] ? `<i class="prick" style="background:${FARG[v]}"></i>` : ""}${t}</button>`).join("")}</div></div>
    <div class="kpi" style="margin-bottom:14px">
      <div><b>${behovSum}</b><span>pass enligt behovet</span></div>
      <div class="${vakSum ? "fel" : "bra"}"><b>${vakSum}</b><span>vakanta pass</span></div>
      <div><b>${behovSum ? sv(tackt / behovSum * 100, 1) : 100} %</b><span>av behovet täckt</span></div>
      <div class="${over ? "over" : ""}"><b>${over}</b><span>pass över behovet (överkapacitet)</span></div>
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
      const fast = Math.min(x.n[d], x.b[d]);
      if (fast) seg += `<rect class="stapel" x="${x0}" y="${y(acc + fast)}" width="${bred}" height="${Math.max(0, y(acc) - y(acc + fast) - 2)}" rx="3" style="fill:${FARG[d]}"/>`;
      acc += fast;
    });
    delar.forEach(d => {
      if (!x.over[d]) return;
      seg += `<rect x="${x0 + 1}" y="${y(acc + x.over[d]) + 1}" width="${bred - 2}" height="${Math.max(0, y(acc) - y(acc + x.over[d]) - 4)}" rx="3" style="fill:${FARG[d]};fill-opacity:.3;stroke:var(--accent);stroke-width:1.5;stroke-dasharray:3 2"/>`;
      acc += x.over[d];
    });
    const vak = delar.reduce((s, d) => s + x.vak[d], 0);
    if (vak) seg += `<rect x="${x0}" y="${y(acc + vak)}" width="${bred}" height="${Math.max(0, y(acc) - y(acc + vak) - 2)}" rx="3" style="fill:url(#rand)"/>`;
    const beh = delar.reduce((s, d) => s + x.b[d], 0);
    seg += `<line class="behov" x1="${x0 - 2}" x2="${x0 + bred + 2}" y1="${y(beh)}" y2="${y(beh)}"/>`;
    const tips = `Vecka ${Math.floor(x.d / 7) + 1} ${DAGAR[x.d % 7]}\n` + delar.map(d => `${DELAR[d]}: ${x.n[d]} av ${x.b[d]}${x.vak[d] ? ` – ${x.vak[d]} vakant` : x.over[d] ? ` – ${x.over[d]} över behovet` : ""}`).join("\n");
    svg += seg + `<rect class="traff" x="${vX + i * kol}" y="${top}" width="${kol}" height="${bas - top}" data-tips="${tips}"/>`;
    if (x.d % 7 === 0) svg += `<text x="${vX + i * kol + 2}" y="${bas + 30}" style="font-weight:700;fill:var(--text)">v${Math.floor(x.d / 7) + 1}</text>`;
    if (N <= 56) svg += `<text x="${vX + i * kol + kol / 2}" y="${bas + 14}" text-anchor="middle">${DAGAR[x.d % 7][0]}</text>`;
  });
  svg += `<line class="axel" x1="${vX}" x2="${W - hX}" y1="${bas}" y2="${bas}"/></svg>`;
  h += `<div class="rull">${svg}</div>
    <div class="legend" style="margin-top:8px">${delar.map(d => `<span><i style="background:${FARG[d]}"></i>${DELAR[d]}</span>`).join("")}
      <span><i style="background:url(#rand);background:repeating-linear-gradient(45deg,var(--kritisk) 0 2px,var(--kritisk-bg) 2px 5px)"></i>Vakans</span>
      <span><i style="background:var(--accent-svag);outline:1.5px dashed var(--accent)"></i>Över behovet</span>
      <span><i style="background:var(--text);height:3px"></i>Behov</span><span><i style="background:var(--helg)"></i>Helg</span></div>`;
  // resursbalans per vecka: vakanser och överkapacitet i pass och timmar
  const veckor = Array.from({ length: res.veckor }, (_, w) => bem.slice(w * 7, w * 7 + 7));
  const synligaDelar = delar.filter(d => bem.some(x => x.b[d] || x.n[d]));
  const cell = (n, klass, d) => n ? `<span class="${klass}">${klass === "minus" ? "−" : "+"}${n}</span> <span class="dampad liten">${sv(n * snitt(d) / 60, 1)} h</span>` : `<span class="dampad">0</span>`;
  h += `<h3>Resursbalans per vecka</h3><p class="dampad liten">Vakanser är pass som saknar personal. Överkapacitet är pass utöver behovet, alltså tid som kan flyttas dit det saknas folk. Timmarna räknas med passens genomsnittliga längd.</p>
    <div class="rull"><table><thead><tr><th>Vecka</th>${synligaDelar.map(d => `<th>${DELAR[d]}: vakant</th><th>${DELAR[d]}: över</th>`).join("")}<th class="tal">Netto</th></tr></thead><tbody>
    ${veckor.map((dagar, w) => { const v = d => dagar.reduce((s, x) => s + x.vak[d], 0), o = d => dagar.reduce((s, x) => s + x.over[d], 0);
      const netto = synligaDelar.reduce((s, d) => s + o(d) - v(d), 0);
      return `<tr><td>Vecka ${w + 1}</td>${synligaDelar.map(d => `<td>${cell(v(d), "minus", d)}</td><td>${cell(o(d), "plus", d)}</td>`).join("")}<td class="tal"><b class="${netto < 0 ? "minus" : netto > 0 ? "plus" : ""}">${netto > 0 ? "+" : ""}${netto}</b></td></tr>`; }).join("")}
    </tbody></table></div>`;
  if (over && vakSum) h += `<div class="banner info" style="margin-top:12px">${IKON.varning}<div><strong>Både vakanser och överkapacitet</strong>Det finns ${over} pass över behovet samtidigt som ${vakSum} saknas. Pröva att ändra behovet, helggrupper eller önskemål så att överskottet hamnar där det fattas folk.</div></div>`;
  else if (over) h += `<div class="banner info" style="margin-top:12px">${IKON.ok}<div><strong>${over} pass över behovet</strong>Cirka ${sv(delar.reduce((s, d) => s + bem.reduce((a, x) => a + x.over[d], 0) * snitt(d), 0) / 60 / res.veckor, 1)} timmar per vecka som kan användas där behovet är störst, eller sparas i budgeten.</div></div>`;
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

// ---------------------------------------------------------------- redigera schemat
// Ett utkast av schemat som användaren ändrar för hand. Varje ändring räknas om och granskas på servern;
// inget sparas förrän användaren väljer Spara som ny körning.
function startaRedigering() {
  const res = st.korning.resultat;
  st.red = { kid: st.korning.id, schema: structuredClone(res.schema), res: null, g: st.korning.granskning, andringar: 0, historik: [], panel: null };
  st.red.res = { ...res, schema: st.red.schema };
  if (st.vecka === undefined) st.vecka = 0;
  ritaKorningsvy();
}

function redigeringsrad() {
  const r = st.red, g = r.g, res = r.res, brott = g ? g.brott.length : 0;
  const ursprung = st.korning.granskning?.brott.length || 0, vak0 = st.korning.resultat.kpi.vakanta_pass;
  const pil = (nu, fore) => nu === fore ? "" : `<small class="${nu < fore ? "upp" : "ned"}">${nu > fore ? "+" : "−"}${Math.abs(nu - fore)}</small>`;
  return `<section class="kort redrad"><div class="rubrikrad"><div style="display:block"><h2 style="margin:0">Du redigerar schemat</h2>
      <p class="dampad liten" style="margin:4px 0 0">Dra ett pass till en annan dag eller person, eller tryck på ett pass för att ändra tider. Tryck på + för att lägga till. Varje ändring granskas direkt. Originalet finns kvar.</p></div>
      <div class="chips"><button class="liten" data-g="angra" ${r.historik.length ? "" : "disabled"}>Ångra</button><button class="liten" data-g="avsluta-red">Avbryt</button>
        <button class="guld" data-g="spara-red" ${r.andringar ? "" : "disabled"}>Spara som ny körning</button></div></div>
    <div class="kpi" style="margin-top:12px">
      <div><b>${r.andringar}</b><span>ändringar</span></div>
      <div class="${brott ? "fel" : "bra"}"><b>${brott}</b><span>brott mot hårda regler ${pil(brott, ursprung)}</span></div>
      <div class="${res.kpi.vakanta_pass ? "fel" : "bra"}"><b>${res.kpi.vakanta_pass}</b><span>vakanta pass ${pil(res.kpi.vakanta_pass, vak0)}</span></div>
      <div><b>${sv(Object.values(res.personer).reduce((a, p) => a + p.minuter, 0) / 60 / res.veckor, 1)} h</b><span>schemalagt per vecka</span></div>
    </div>
    ${brott ? `<details style="margin-top:10px"><summary>Visa brotten</summary><ul class="punkter liten" style="margin-top:6px">${g.brott.slice(0, 30).map(x => `<li><span class="niva ${nk(x.niva)}">${esc(x.niva)}</span> <b>${esc(x.person || "")}</b> ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}
    ${r.panel ? redigeringspanel() : ""}</section>`;
}

function vanligTid(del_) {
  const tider = {};
  for (const rad of Object.values(st.red.schema)) for (const p of rad) if (p && p.dygnsdel === del_) { const t = p.start + "–" + p.slut; tider[t] = (tider[t] || 0) + 1; }
  const b = Object.entries(tider).sort((a, b) => b[1] - a[1])[0];
  if (b) return b[0].split("–");
  const r = st.korning.indata.regler || {}, np = st.korning.indata.nattpass?.[0];
  return { morgon: [r.morgon_start || "07:00", "15:00"], kvall: ["14:00", r.kvall_slut || "22:00"], natt: [np?.start || "21:45", np?.slut || "07:15"] }[del_];
}

function redigeringspanel() {
  const P = st.red.panel, [pid, d] = delaCell(P.c), p = st.red.schema[pid][d], ny = !p;
  const v = P.utkast || (p ? { dygnsdel: p.dygnsdel, start: p.start, slut: p.slut } : (() => { const [a, b] = vanligTid("morgon"); return { dygnsdel: "morgon", start: a, slut: b }; })());
  P.utkast = v;
  const pers = Object.keys(st.red.schema), N = st.red.res.veckor * 7;
  return `<div class="redpanel" role="dialog" aria-label="${ny ? "Nytt pass" : "Ändra pass"}">
    <div class="rubrikrad"><h3 style="margin:0">${ny ? "Nytt pass" : "Ändra pass"} – ${esc(pid)}, vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}</h3><button class="liten" data-g="stang-panel" aria-label="Stäng">×</button></div>
    <div class="falt">
      <div><label for="rp-del">Pass</label><select id="rp-del">${Object.entries(DELAR).map(([k, t]) => `<option value="${k}"${v.dygnsdel === k ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      <div><label for="rp-start">Start</label><input id="rp-start" type="time" value="${esc(v.start)}"></div>
      <div><label for="rp-slut">Slut</label><input id="rp-slut" type="time" value="${esc(v.slut)}"></div>
      ${ny ? "" : `<div><label for="rp-person">Flytta till person</label><select id="rp-person">${pers.map(x => `<option${x === pid ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
      <div><label for="rp-dag">Flytta till dag</label><select id="rp-dag">${Array.from({ length: N }, (_, i) => `<option value="${i}"${i === d ? " selected" : ""}>V${Math.floor(i / 7) + 1} ${DAGAR[i % 7]}</option>`).join("")}</select></div>`}
    </div>
    <div class="chips" style="margin-top:12px"><button class="primar" data-g="spara-pass">${ny ? "Lägg till" : "Spara"}</button>${ny ? "" : `<button class="fara" data-g="ta-bort-pass">Ta bort passet</button>`}</div>
    <p class="dampad liten" style="margin:8px 0 0">Rast och arbetstid räknas ut efter passets längd. Finns det redan ett pass där du flyttar till byter passen plats.</p></div>`;
}

function delaCell(c) { const i = c.lastIndexOf(":"); return [c.slice(0, i), +c.slice(i + 1)]; }

// Gör en ändring i utkastet, räkna om och granska.
async function andraUtkast(fn) {
  const r = st.red;
  r.historik.push(structuredClone(r.schema));
  if (r.historik.length > 50) r.historik.shift();
  fn(r.schema);
  r.andringar++;
  await raknaOm();
}

async function raknaOm() {
  const r = st.red;
  r.res = { ...r.res, schema: r.schema };
  ritaKorningsvy();
  try {
    const svar = await api("POST", `korningar/${r.kid}/justera`, { schema: r.schema });
    if (st.red !== r) return;
    r.res = svar.resultat; r.g = svar.granskning;
    r.felpersoner = new Set(svar.granskning.brott.map(b => b.person).filter(Boolean));
  } catch (e) { meddela(e.message); }
  if (st.red === r) ritaKorningsvy();
}

function flyttaPass(fran, till) {
  if (fran === till) return;
  const [p1, d1] = delaCell(fran), [p2, d2] = delaCell(till);
  return andraUtkast(s => {
    const a = s[p1][d1], b = s[p2][d2];
    s[p2][d2] = a ? { ...a, manuell: true } : null;
    s[p1][d1] = b ? { ...b, manuell: true } : null;
  });
}

// dra och släpp mellan rutor i schemat
document.addEventListener("dragstart", e => {
  const b = e.target.closest?.("button.pass[draggable]"); if (!b) return;
  e.dataTransfer.setData("text/plain", b.dataset.c); e.dataTransfer.effectAllowed = "move"; b.classList.add("drar");
});
document.addEventListener("dragend", e => e.target.classList?.remove("drar"));
document.addEventListener("dragover", e => {
  const td = e.target.closest?.("td[data-mal]"); if (!td || !st.red) return;
  e.preventDefault(); document.querySelectorAll("td.slapp").forEach(x => x !== td && x.classList.remove("slapp")); td.classList.add("slapp");
});
document.addEventListener("dragleave", e => { const td = e.target.closest?.("td[data-mal]"); if (td && !td.contains(e.relatedTarget)) td.classList.remove("slapp"); });
document.addEventListener("drop", e => {
  const td = e.target.closest?.("td[data-mal]"); if (!td || !st.red) return;
  e.preventDefault(); td.classList.remove("slapp");
  const fran = e.dataTransfer.getData("text/plain"); if (fran) { st.red.panel = null; flyttaPass(fran, td.dataset.mal); }
});

async function redigeringsKlick(g, el) {
  const r = st.red;
  switch (g) {
    case "redigera": st.sv.filter = st.sv.filter === "tider" ? "alla" : st.sv.filter; return startaRedigering();
    case "avsluta-red":
      if (r.andringar && !confirm("Avbryta utan att spara ändringarna?")) return;
      st.red = null; return ritaKorningsvy();
    case "angra": if (r.historik.length) { r.schema = r.historik.pop(); r.andringar = Math.max(0, r.andringar - 1); r.panel = null; await raknaOm(); } return;
    case "andra-pass": case "ny-pass": r.panel = { c: el.dataset.c }; ritaKorningsvy(); $(".redpanel select, .redpanel input")?.focus(); return;
    case "stang-panel": r.panel = null; return ritaKorningsvy();
    case "ta-bort-pass": { const [pid, d] = delaCell(r.panel.c); r.panel = null; return andraUtkast(s => { s[pid][d] = null; }); }
    case "spara-pass": {
      const [pid, d] = delaCell(r.panel.c);
      const v = { dygnsdel: $("#rp-del").value, start: $("#rp-start").value, slut: $("#rp-slut").value };
      if (!v.start || !v.slut) { meddela("Ange start och slut."); return; }
      const till = $("#rp-person") ? `${$("#rp-person").value}:${$("#rp-dag").value}` : r.panel.c;
      r.panel = null;
      return andraUtkast(s => {
        const gammal = s[pid][d], nytt = { ...(gammal || {}), ...v, mall: "manuell", manuell: true };
        if (till === `${pid}:${d}`) { s[pid][d] = nytt; return; }
        const [p2, d2] = delaCell(till), b = s[p2][d2];
        s[p2][d2] = nytt; s[pid][d] = b ? { ...b, manuell: true } : null;
      });
    }
    case "spara-red": {
      const namn = prompt("Namn på den nya körningen", `${st.korning.namn} (justerad)`); if (namn === null) return;
      const { id } = await api("POST", `korningar/${r.kid}/justera`, { schema: r.schema, namn, spara: true });
      st.red = null; st.korning = null; meddela("Det justerade schemat är sparat som en ny körning.");
      location.hash = `#/e/${st.enhet.id}/schema/${id}`; return;
    }
  }
}

document.addEventListener("change", e => {
  if (e.target.id === "rp-del" && st.red?.panel) {
    const [a, b] = vanligTid(e.target.value); $("#rp-start").value = a; $("#rp-slut").value = b;
  }
});

// ---------------------------------------------------------------- klick i vyerna
async function vyKlick(g, el) {
  if (["redigera", "avsluta-red", "angra", "andra-pass", "ny-pass", "stang-panel", "ta-bort-pass", "spara-pass", "spara-red"].includes(g)) return redigeringsKlick(g, el);
  switch (g) {
    case "anvand-forslag": {
      const { id } = await api("POST", `analys/${st.analys.id}/anvand`, { index: +el.dataset.n });
      meddela("Förslaget är sparat som en ny enhet."); st.enhet = null; location.hash = `#/e/${id}/schema`; return;
    }
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

// ---------------------------------------------------------------- konsekvensanalys
async function visaAnalys(id) {
  st.vy = "analys";
  await laddaEnhet(id);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Simulering"]]);
  if (st.analys && st.analys.enhet_id !== id) st.analys = null;
  ritaAnalys();
  if (st.analys && st.analys.status === "kör") pollaAnalys();
}

function pollaAnalys() {
  startaPollning(async () => {
    st.analys = await api("GET", "analys/" + st.analys.id);
    if (st.vy === "analys") ritaAnalys();
    return st.analys.status === "kör";
  });
}

function ritaAnalys() {
  const i = st.indata, a = st.analys;
  const kt = kontrakteradTid(i);
  const tk = st.timkostnad ?? i.timkostnad_kr ?? null;
  let h = `<section class="kort"><h1>Simulering</h1>
    <p class="dampad" style="margin:6px 0 12px">En planeringsstudio för att pröva alternativ innan något ändras: annan bemanningsnivå, fler heltider, jämnare helger eller färre fredagskvällar. Systemet lägger ett schema för varje alternativ och visar konsekvenserna för vakanser, kostnad, arbetstid och kvällsfördelning jämfört med nuläget. Behov och regler hämtas från enheten.</p>
    <form id="analysform" class="falt" style="align-items:end">
      <div><label for="a-budget">Budget, timmar per vecka</label><input id="a-budget" type="number" step="0.5" min="1" value="${a ? a.underlag.budget_timmar_vecka : (i.budget_timmar_vecka ?? Math.round(kt * 10) / 10)}"></div>
      <div><label for="a-tk">Timkostnad, kr</label><input id="a-tk" type="number" step="1" min="1" placeholder="valfri" value="${tk ?? ""}"></div>
      <div><label for="a-tid">Noggrannhet</label><select id="a-tid"><option value="3">Snabb</option><option value="6" selected>Normal</option><option value="15">Noggrann</option></select></div>
      <div><button class="guld" type="submit"${a && a.status === "kör" ? " disabled" : ""}>${IKON.spela} Simulera alternativ</button></div>
    </form></section>`;
  if (!a) {
    vy().innerHTML = h + `<section class="kort tom">Inga alternativ än. Varje alternativ tar några sekunder till en minut att lägga, beroende på noggrannhet.</section>`;
    kopplaAnalysform(); return;
  }
  const u = a.underlag, diff = Math.round((u.budget_timmar_vecka - u.behov_timmar_vecka) * 10) / 10;
  h += `<section class="kort"><h2>Underlag</h2><div class="kpi">
      <div><b>${sv(u.budget_timmar_vecka, 1)} h</b><span>budget per vecka = ${sv(u.arsarbetare_budget)} årsarbetare</span></div>
      <div class="${diff < 0 ? "fel" : ""}"><b>${sv(u.behov_timmar_vecka, 1)} h</b><span>behovet motsvarar ungefär, per vecka</span></div>
      <div><b>${u.dag_pass_vecka}</b><span>dag- och kvällspass per vecka</span></div>
      <div><b>${u.personer_per_helg_dag}</b><span>personer med dag/kväll varje helg</span></div>
      <div><b>${u.minsta_antal_dag}</b><span>minsta antal med dag/kväll (varannan helg)</span></div>
      ${u.natt_timmar_vecka ? `<div><b>${sv(u.natt_timmar_vecka, 1)} h</b><span>natt per vecka, med marginal</span></div>` : ""}
    </div>
    <p style="margin-top:12px">${diff >= 0 ? `Budgeten är <b>${sv(diff, 1)} h större</b> än behovet kräver. Det som blir över syns som överkapacitet.` : `Budgeten är <b>${sv(-diff, 1)} h mindre</b> än behovet kräver. Räkna med vakanser.`}
    ${u.fredagskvall_styr ? ` <b>Fredagskvällen styr helgbemanningen:</b> den som arbetar fredag kväll arbetar hela helgen, så fler behövs varje helg än lördag och söndag kräver.` : ""}</p></section>`;
  const S = a.scenarier, klar = a.status === "klar", ordning = klar && a.ordning ? a.ordning : S.map((_, n) => n);
  const kons = n => S[n].konsekvenser || {};
  const basta = (f, lagst = true) => { const v = ordning.map(n => f(n)).filter(x => typeof x === "number"); return v.length ? (lagst ? Math.min(...v) : Math.max(...v)) : null; };
  const rad = (namn, f, fmt = x => x, lagst = true, tips = "") => {
    const b = lagst === null ? null : basta(f, lagst);
    return `<tr><td${tips ? ` data-tips="${tips}"` : ""}>${namn}</td>${ordning.map(n => { const v = f(n); const ok = typeof v === "number" && v === b && ordning.filter(m => f(m) === b).length < ordning.length;
      return `<td class="nw${ok ? " bast" : ""}">${S[n].status === "klar" || typeof v === "number" ? (v == null ? "–" : fmt(v, n)) : `<span class="spinner"></span>`}</td>`; }).join("")}</tr>`;
  };
  h += `<section class="kort"><div class="rubrikrad"><h2 style="margin:0">Förslag</h2>${klar ? `<span class="dampad liten">Bäst först. Grönt = bästa värdet på raden.</span>` : `<span class="status kor"><span class="spinner"></span>Lägger scheman (${S.filter(x => x.status === "klar").length} av ${S.length})</span>`}</div>
    <div class="rull" style="margin-top:12px"><table class="analys"><thead><tr><th></th>${ordning.map((n, plats) => `<th><div class="forslagsrubrik">${klar && plats === 0 ? `<span class="status ok">Rekommenderas</span>` : ""}<b>${esc(S[n].namn)}</b><span class="dampad liten">${esc(S[n].sammanfattning)}</span></div></th>`).join("")}</tr></thead><tbody>
    <tr><td></td>${ordning.map(n => `<td class="liten dampad" style="min-width:200px;white-space:normal">${esc(S[n].beskrivning)}</td>`).join("")}</tr>
    ${rad("Vakanta pass", n => kons(n).vakanta_pass, (v, n) => `<b class="${v ? "minus" : ""}">${v}</b>${v ? `<div class="liten dampad">${Object.entries(kons(n).vakanser).filter(([, x]) => x).map(([k, x]) => `${x} ${{ vardag: "vardag", fredagskvall: "fre kväll", helg: "helg", natt: "natt" }[k]}`).join(", ")}</div>` : ""}`)}
    ${rad("Överkapacitet per vecka", n => kons(n).overkapacitet_timmar_vecka, v => `<span class="${v ? "plus" : ""}">${sv(v, 1)} h</span>`, true, "Timmar i tjänst utöver behovet")}
    ${rad("Kontrakterad tid per vecka", n => S[n].kontrakt_timmar_vecka, v => `${sv(v, 1)} h`, null)}
    ${tk ? rad("Personalkostnad per månad", n => S[n].kontrakt_timmar_vecka * tk * 52 / 12, v => kr(v), true, "Kontrakterad tid × timkostnad × 52 / 12") : ""}
    ${rad("Mot budget", n => kons(n).budget_kvar ?? (u.budget_timmar_vecka - S[n].kontrakt_timmar_vecka), v => `<span class="${v < -0.05 ? "minus" : ""}">${v < -0.05 ? sv(-v, 1) + " h över" : sv(v, 1) + " h kvar"}</span>`, false)}
    ${rad("Årsarbetare", n => kons(n).arsarbetare, v => sv(v), null)}
    ${rad("Personer (heltider)", n => kons(n).personer, (v, n) => `${v} (${kons(n).heltider})`, null)}
    ${rad("Personer per helg", n => kons(n).helg_personer_min, (v, n) => `${v}${kons(n).helg_personer_max !== v ? "–" + kons(n).helg_personer_max : ""}`, null)}
    ${rad("Veckor utan blandning", n => kons(n).veckor_utan_blandning, (v, n) => `${v} av ${kons(n).personveckor}`, true, "Personveckor med bara morgnar eller bara kvällar")}
    ${rad("Skillnad i antal kvällar", n => kons(n).kvallar_skillnad, v => `${v}`)}
    ${rad("Passlängd", n => kons(n).kortaste_pass, (v, n) => `${timmar(v)}–${timmar(kons(n).langsta_pass)}`, null, "Kortaste och längsta dag- eller kvällspass (arbetstid)")}
    ${rad("Brott mot hårda regler", n => kons(n).brott, v => `<b class="${v ? "minus" : ""}">${v}</b>`)}
    <tr><td></td>${ordning.map(n => `<td>${S[n].status === "klar" && S[n].resultat?.status === "OK" ? `<button class="liten primar" data-g="anvand-forslag" data-n="${n}">Använd som ny enhet</button>` : S[n].status === "fel" ? `<span class="minus liten">${esc(S[n].fel)}</span>` : S[n].status === "klar" ? `<span class="minus liten">Går inte att lägga</span>` : ""}</td>`).join("")}</tr>
    </tbody></table></div>
    ${klar ? GRAF.analysstaplar(S, ordning, tk) : ""}</section>
    ${klar ? GRAF.nulage(S, ordning, tk, IKON.varning) : ""}`;
  vy().innerHTML = h;
  kopplaAnalysform();
}

function kopplaAnalysform() {
  const f = $("#analysform");
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    if (!(await spara())) return;
    try {
      st.timkostnad = parseFloat($("#a-tk").value.replace(",", ".")) || null;
      const { id } = await api("POST", `enheter/${st.enhet.id}/analys`, { budget: parseFloat($("#a-budget").value.replace(",", ".")) || null, tid_per_steg_s: +$("#a-tid").value });
      st.analys = await api("GET", "analys/" + id);
      ritaAnalys(); pollaAnalys();
    } catch (err) { meddela(err.data?.fel ? err.data.fel.join(" ") : err.message); }
  };
}
