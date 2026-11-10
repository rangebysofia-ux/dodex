"use strict";
// Kompetensbaserade behov och planering (docs/kompetens.md). Delas av webben och lättversionen.
//  - organisationens kompetenslista (sidan Organisation), med namn, kort märkning och färg
//  - fliken Kompetens i en enhet: medarbetarnas kompetenser och kraven (minst så många med kompetensen per pass)
//  - kompetensbalans före schemat: kraven mot vad de med kompetensen hinner arbeta
//  - täckningskort och utbildningsförslag efter schemat
// Fristående: inga regler. Motorn (build.py, motor.js) lägger schemat efter kraven och granskningen kontrollerar dem.

const KOMP = (() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const DELAR = [["morgon", "Dag"], ["kvall", "Kväll"], ["natt", "Natt"]], DELAR_STD = DELAR;
const giltig = f => typeof f === "string" && /^#[0-9a-f]{6}$/i.test(f);
const PASS_PER_VECKA = 4.75;

// Startlistan (användarens önskemål 2026-11-09). Ändras på sidan Organisation.
const STANDARD = [
  { id: "usk", namn: "Undersköterska", kort: "USK", farg: "#2f8a6f" },
  { id: "vb", namn: "Vårdbiträde", kort: "VB", farg: "#7a6a55" },
  { id: "ssk", namn: "Sjuksköterska", kort: "SSK", farg: "#3f6bb0" },
  { id: "del", namn: "Läkemedelsdelegering", kort: "DEL", farg: "#c0473f" },
  { id: "insulin", namn: "Insulindelegering", kort: "INS", farg: "#b5487e" },  // användarens önskemål 2026-11-09
  { id: "korkort", namn: "Körkort", kort: "KK", farg: "#b08a2e" },
  { id: "fl", namn: "Förskollärare", kort: "FL", farg: "#9a4fa8" },
  { id: "bsk", namn: "Barnskötare", kort: "BSK", farg: "#2b8aa0" },
  { id: "ped", namn: "Pedagog", kort: "PED", farg: "#5b5bb8" },  // förskola, användarens önskemål 2026-11-10
];
// Förskolans kompetenser: bara förskollärare och pedagog, inte läkemedel med mera (användarens beslut 2026-11-10).
const FORSKOLA = ["fl", "ped"];
const PALETT = ["#2f8a6f", "#3f6bb0", "#c0473f", "#b08a2e", "#9a4fa8", "#2b8aa0", "#c46a2b", "#5f8a2f", "#b5487e", "#5b5bb8"];
const kopia = l => (l && l.length ? l : STANDARD).map(x => ({ ...x }));
// Organisationens lista för en förskola: förskollärare och pedagog (med organisationens namn och färg om de finns).
const forskolaLista = org => FORSKOLA.map(id => ({ ...(kopia(org).find(k => k.id === id) || STANDARD.find(k => k.id === id)) }));

function nyttId(l, namn) {
  const bas = String(namn || "k").toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "k";
  let id = bas, i = 2;
  while (l.some(x => x.id === id)) id = `${bas}-${i++}`;
  return id;
}
const kortFor = namn => String(namn || "").split(/[\s-]+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 4) || "K";

// ---------------------------------------------------------------- organisationens lista
function lagg(l, namn) {
  namn = String(namn || "").trim();
  if (!namn) throw new Error("Skriv ett namn på kompetensen.");
  if (l.some(x => x.namn.toLowerCase() === namn.toLowerCase())) throw new Error(`Det finns redan en kompetens som heter ${namn}.`);
  return [...l, { id: nyttId(l, namn), namn, kort: kortFor(namn), farg: PALETT[l.length % PALETT.length] }];
}
function andra(l, id, falt, varde) {
  if (falt === "farg" && !giltig(varde)) throw new Error("Ogiltig färg.");
  if (falt === "namn" && !String(varde || "").trim()) throw new Error("Skriv ett namn.");
  if (falt === "kort") varde = String(varde || "").trim().toUpperCase().slice(0, 6);
  return l.map(x => x.id === id ? { ...x, [falt]: falt === "namn" ? String(varde).trim() : varde } : x);
}
const taBort = (l, id) => l.filter(x => x.id !== id);

// Kortet på sidan Organisation.
function orgKort(l) {
  const rad = k => `<div class="os-typ"><input type="color" class="org-farg" data-kom="${esc(k.id)}" data-falt="farg" value="${giltig(k.farg) ? k.farg : "#7a6a55"}" aria-label="Färg för ${esc(k.namn)}" title="Färg">
      <input data-kom="${esc(k.id)}" data-falt="namn" value="${esc(k.namn)}" aria-label="Namn"><input data-kom="${esc(k.id)}" data-falt="kort" value="${esc(k.kort || "")}" maxlength="6" style="width:76px" aria-label="Kort märkning för ${esc(k.namn)}" title="Kort märkning i schemat">
      <button class="liten fara" data-os="kom-bort" data-id="${esc(k.id)}" aria-label="Ta bort ${esc(k.namn)}">×</button></div>`;
  return `<section class="kort"><h2>Kompetenser</h2>
      <p class="dampad liten">Kompetenser som medarbetarna kan ha och som kan krävas på ett pass, till exempel läkemedelsdelegering på kvällen. Namn, kort märkning i schemat och färg. Vilka som har vad och vad som krävs anges i varje enhet, under fliken Kompetens.</p>
      <div class="os-typer os-komp">${l.map(rad).join("")}</div>
      <form class="chips" id="kom-ny" style="margin-top:10px"><input id="kom-ny-namn" placeholder="Ny kompetens, till exempel Insulindelegering" style="max-width:280px"><button type="submit" class="liten">+ Lägg till kompetens</button></form></section>`;
}

// ---------------------------------------------------------------- en enhets kompetenser
// Enhetens lista: de kompetenser som används (av någon medarbetare eller ett krav), med namn från organisationen.
function enhetsLista(ind, org) {
  const anv = new Set([...(ind.personal || []).flatMap(p => p.kompetenser || []), ...(ind.kompetenskrav || []).map(k => k.kompetens)]);
  const kanda = new Map([...kopia(org), ...(ind.kompetenser || [])].map(k => [k.id, k]));
  return [...anv].filter(id => kanda.has(id)).map(id => { const k = kanda.get(id); return { id, namn: k.namn || id, ...(k.kort ? { kort: k.kort } : {}), ...(giltig(k.farg) ? { farg: k.farg } : {}) }; });
}
// Skriv enhetens lista efter en ändring (eller ta bort den när inget används).
function synka(ind, org) {
  const l = enhetsLista(ind, org);
  if (l.length) ind.kompetenser = l; else delete ind.kompetenser;
  if (ind.kompetenskrav && !ind.kompetenskrav.length) delete ind.kompetenskrav;
}
function sattPerson(ind, org, pid, id, pa) {
  const p = (ind.personal || []).find(x => x.id === pid); if (!p) return;
  const s = new Set(p.kompetenser || []);
  if (pa) s.add(id); else s.delete(id);
  if (s.size) p.kompetenser = [...s]; else delete p.kompetenser;
  synka(ind, org);
}
function nyttKrav(ind, org) {
  const l = ind.kompetenskrav || (ind.kompetenskrav = []);
  const forsta = (ind.kompetenser && ind.kompetenser[0]) || kopia(org).find(k => k.id === "del") || kopia(org)[0];
  let i = l.length + 1; while (l.some(k => k.id === `K${i}`)) i++;
  l.push({ id: `K${i}`, kompetens: forsta.id, behov: FORSKOLA.includes(forsta.id) ? { vardag: { morgon: 1 } } : { alla: { kvall: 1 } } });
  synka(ind, org);
}
function taBortKrav(ind, org, n) { (ind.kompetenskrav || []).splice(n, 1); synka(ind, org); }
// falt: "kompetens", eller "vardag.kvall" osv. (antal per pass)
function andraKrav(ind, org, n, falt, varde) {
  const k = (ind.kompetenskrav || [])[n]; if (!k) return;
  if (falt === "kompetens") k.kompetens = varde;
  else {
    const [dag, del] = falt.split(".");
    const per = perDag(k.behov);
    const idx = dag === "vardag" ? [0, 1, 2, 3, 4] : [5, 6];
    idx.forEach(i => (per[i][del] = Math.max(0, parseInt(varde) || 0)));
    k.behov = komprimera(per);
  }
  synka(ind, org);
}
function perDag(spec) {
  const ut = Array.from({ length: 7 }, () => ({ morgon: 0, kvall: 0, natt: 0 }));
  for (const [k, v] of Object.entries(spec || {})) {
    const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGAR.indexOf(k)];
    for (const i of idx) if (i >= 0) ut[i] = { morgon: +v.morgon || 0, kvall: +v.kvall || 0, natt: +v.natt || 0 };
  }
  return ut;
}
function komprimera(per) {
  const lika = (a, b) => DELAR.every(([x]) => a[x] === b[x]), utan0 = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  if (per.every(d => lika(d, per[0]))) return { alla: utan0(per[0]) };
  const ut = { vardag: utan0(per[0]), helg: utan0(per[5]) };
  per.forEach((d, i) => { if (!lika(d, i < 5 ? per[0] : per[5])) ut[DAGAR[i]] = utan0(d); });
  return ut;
}
const namnFor = (l, id) => (l.find(k => k.id === id) || {}).namn || id;
const kortNamn = (l, id) => { const k = l.find(x => x.id === id) || {}; return k.kort || kortFor(k.namn || id); };
const fargFor = (l, id) => { const k = l.find(x => x.id === id) || {}; return giltig(k.farg) ? k.farg : "#7a6a55"; };

// ---------------------------------------------------------------- kompetensbalans (före schemat)
// Per krav: hur många pass per vecka som kräver kompetensen, och hur många pass de med kompetensen hinner arbeta
// i de dygnsdelar kravet gäller. Helgerna räknas för sig: med varannan helg behövs minst dubbelt så många med
// kompetensen som helgkravet. En uppskattning, inte en garanti: motorn avgör.
function balans(ind, org) {
  const l = [...kopia(org), ...(ind.kompetenser || [])];
  const P = p => (p.grad || 1) * PASS_PER_VECKA;
  return (ind.kompetenskrav || []).map(k => {
    const per = perDag(k.behov), delar = DELAR.map(([d]) => d).filter(d => per.some(x => x[d]));
    const kravVecka = per.reduce((s, x) => s + delar.reduce((t, d) => t + x[d], 0), 0);
    const med = (ind.personal || []).filter(p => (p.kompetenser || []).includes(k.kompetens));
    const kan = med.filter(p => (p.dygnsdelar || ["morgon", "kvall"]).some(d => delar.includes(d)));
    const passVecka = kan.reduce((s, p) => s + P(p), 0);
    const helgKrav = Math.max(0, ...[5, 6].map(i => delar.reduce((t, d) => t + per[i][d], 0)));
    const helgBehovsPersoner = helgKrav * 2;  // varannan helg (hård lokal regel)
    const bristPass = Math.max(0, kravVecka - passVecka);
    const fler = Math.max(bristPass ? Math.ceil(bristPass / PASS_PER_VECKA) : 0, Math.max(0, helgBehovsPersoner - kan.length));
    // knappt: de med kompetensen arbetar också pass där den inte krävs, så under 1,5 gånger kravet blir det ofta luckor
    const knappt = !fler && passVecka < kravVecka * 1.5;
    return { krav: k.id, kompetens: k.kompetens, namn: namnFor(l, k.kompetens), delar, kravVecka, med: med.map(p => p.id), kan: kan.map(p => p.id),
      passVecka: Math.round(passVecka * 10) / 10, helgKrav, helgBehovsPersoner, bristPass: Math.round(bristPass * 10) / 10, fler, knappt };
  });
}
const sv = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
const DELTEXT = { morgon: "dag", kvall: "kväll", natt: "natt" };
function balansKort(ind, org) {
  const B = balans(ind, org);
  if (!B.length) return "";
  return `<div class="komp-balans">${B.map(b => {
    const ok = !b.fler && !b.knappt;
    return `<div class="komp-rad ${ok ? "ok" : b.fler ? "brist" : "knappt"}"><b>${esc(b.namn)}</b> <span class="dampad liten">(${b.delar.map(d => DELTEXT[d]).join(", ") || "inga pass"})</span><br>
      <span class="liten">Krävs <b>${sv(b.kravVecka)}</b> pass per vecka. ${b.kan.length} med kompetensen hinner ungefär <b>${sv(b.passVecka)}</b> pass per vecka${b.helgKrav ? `, och helgerna kräver minst ${b.helgBehovsPersoner} med kompetensen (varannan helg)` : ""}.</span>
      <br><span class="liten ${ok ? "plus" : "minus"}">${ok ? "✓ Räcker med marginal." : b.knappt ? "⚠ Knappt: de med kompetensen arbetar också andra pass, så räkna med några kompetensvakanser. En till med kompetensen ger marginal." : `⚠ Räcker inte: ungefär ${b.fler} till behöver kompetensen${b.bristPass ? ` (${sv(b.bristPass)} pass per vecka saknas)` : ""}.`}</span></div>`;
  }).join("")}<p class="dampad liten" style="margin:6px 0 0">En uppskattning före schemat. De med kompetensen arbetar också pass där den inte krävs, så marginal behövs. Motorn lägger schemat och visar det som fattas som kompetensvakanser.</p></div>`;
}

// ---------------------------------------------------------------- fliken Kompetens i en enhet
// forskola: kraven gäller vardagar, Tidig och Mellan (dag) och Sen (kväll); listan är förskolans (forskolaLista).
function flik(ind, org, { forskola = false } = {}) {
  const l = [...new Map([...kopia(org), ...(ind.kompetenser || []).filter(k => !forskola || FORSKOLA.includes(k.id))].map(k => [k.id, k])).values()];
  const DELAR = forskola ? [["morgon", "Tidig och Mellan"], ["kvall", "Sen"]] : DELAR_STD, DAGTYPER = forskola ? ["vardag"] : ["vardag", "helg"];
  const pers = ind.personal || [], krav = ind.kompetenskrav || [];
  const kravRad = (k, n) => {
    const per = perDag(k.behov);
    return `<tr><td><select data-kk="${n}" data-kf="kompetens" aria-label="Kompetens">${l.map(x => `<option value="${esc(x.id)}"${x.id === k.kompetens ? " selected" : ""}>${esc(x.namn)}</option>`).join("")}</select></td>
      ${DAGTYPER.map(dag => DELAR.map(([d]) => `<td><input type="number" min="0" max="20" inputmode="numeric" data-kk="${n}" data-kf="${dag}.${d}" value="${per[dag === "vardag" ? 0 : 5][d] || ""}" placeholder="0" style="width:56px" aria-label="${dag} ${DELTEXT[d]}"></td>`).join("")).join("")}
      <td><button class="liten fara" data-kk-bort="${n}" aria-label="Ta bort kravet">×</button></td></tr>`;
  };
  const avvikande = krav.some(k => Object.keys(k.behov || {}).some(x => DAGAR.includes(x)));
  return `<p class="dampad liten">Vilka kompetenser medarbetarna har, och hur många med en kompetens som behövs på passen. Kraven väger direkt efter behovet: motorn väljer vilka som arbetar så att kraven täcks, men lägger aldrig ett extra pass för det. Det som inte går syns som kompetensvakanser. Listan med kompetenser ändras på sidan Organisation.</p>
    <h3>Kompetenskrav</h3>
    ${krav.length ? `<div class="rull"><table class="form komp-krav"><thead><tr><th rowspan="2">Kompetens</th>${DAGTYPER.map(d => `<th colspan="${DELAR.length}">${d === "vardag" ? "Vardag" : "Helg"}, minst</th>`).join("")}<th rowspan="2"></th></tr>
      <tr>${DAGTYPER.map(() => DELAR.map(([, t]) => `<th>${t}</th>`).join("")).join("")}</tr></thead><tbody>${krav.map(kravRad).join("")}</tbody></table></div>
      ${avvikande ? `<p class="dampad liten">Något krav har egna värden för en enskild veckodag. De ligger kvar; tabellen visar vardag och helg.</p>` : ""}` : `<p class="dampad liten">Inga krav än.</p>`}
    <p class="chips"><button data-kk-ny="1">+ Kompetenskrav</button></p>
    ${krav.length ? `<h3>Kompetensbalans</h3>${balansKort(ind, org)}` : ""}
    <h3>Medarbetarnas kompetenser</h3>
    ${pers.length ? `<div class="rull"><table class="komp-matris"><thead><tr><th>Medarbetare</th>${l.map(k => `<th title="${esc(k.namn)}"><span class="komp-chip" style="--kf:${fargFor(l, k.id)}">${esc(kortNamn(l, k.id))}</span></th>`).join("")}</tr></thead><tbody>
      ${pers.map(p => `<tr><th>${esc(p.id)}</th>${l.map(k => `<td><input type="checkbox" data-kp="${esc(p.id)}" value="${esc(k.id)}"${(p.kompetenser || []).includes(k.id) ? " checked" : ""} aria-label="${esc(p.id)}: ${esc(k.namn)}"></td>`).join("")}</tr>`).join("")}
      <tr class="summa"><th>Antal</th>${l.map(k => `<td>${pers.filter(p => (p.kompetenser || []).includes(k.id)).length}</td>`).join("")}</tr></tbody></table></div>`
      : `<p class="dampad liten">Lägg till medarbetare först.</p>`}
    <p class="dampad liten">${l.map(k => `<span class="komp-chip" style="--kf:${fargFor(l, k.id)}">${esc(kortNamn(l, k.id))}</span> ${esc(k.namn)}`).join(" · ")}</p>`;
}
// Händelser i fliken: ändrar indata och returnerar true om något ändrades. el = elementet som ändrades eller klickades.
function hantera(ind, org, el) {
  if (el.dataset.kp) { sattPerson(ind, org, el.dataset.kp, el.value, el.checked); return true; }
  if (el.dataset.kk !== undefined && el.dataset.kf) { andraKrav(ind, org, +el.dataset.kk, el.dataset.kf, el.value); return true; }
  if (el.dataset.kkNy) { nyttKrav(ind, org); return true; }
  if (el.dataset.kkBort !== undefined) { taBortKrav(ind, org, +el.dataset.kkBort); return true; }
  return false;
}

// ---------------------------------------------------------------- efter schemat
// Märkning efter personens id i schemat: korta namn på kompetenserna.
function marke(ind, pid) {
  const p = (ind.personal || []).find(x => x.id === pid);
  if (!p || !(p.kompetenser || []).length) return "";
  const l = ind.kompetenser || [];
  return `<small class="komp-marke">${p.kompetenser.map(id => `<span class="komp-chip" style="--kf:${fargFor(l, id)}" title="${esc(namnFor(l, id))}">${esc(kortNamn(l, id))}</span>`).join("")}</small>`;
}

// Förslag på vem som bör utbildas: de utan kompetensen som oftast arbetar de pass där den saknas.
function utbildning(res, ind) {
  const rader = res.kompetens_tackning || [], ut = {};
  for (const r of rader) {
    if (!r.saknas) continue;
    const pa = Object.entries(res.schema).filter(([pid, rad]) => rad[r.dag] && rad[r.dag].dygnsdel === r.dygnsdel && !r.med.includes(pid)).map(([pid]) => pid);
    const o = ut[r.kompetens] || (ut[r.kompetens] = { kompetens: r.kompetens, namn: r.namn, saknas: 0, per: {} });
    o.saknas += r.saknas;
    pa.forEach(pid => (o.per[pid] = (o.per[pid] || 0) + 1));
  }
  return Object.values(ut).map(o => ({ ...o, forslag: Object.entries(o.per).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pid, n]) => ({ pid, pass: n })) }));
}

// Kortet under schemat: täckning per krav, de första tillfällena som saknar kompetens, och utbildningsförslag.
function tackningKort(res, ind) {
  if (!res || !(res.kompetenskrav || []).length) return "";
  const rader = res.kompetens_tackning || [];
  const per = res.kompetenskrav.map(k => {
    const l = rader.filter(x => x.krav === k.id);
    return { k, behov: l.reduce((s, x) => s + x.behov, 0), saknas: l.reduce((s, x) => s + x.saknas, 0), brist: l.filter(x => x.saknas) };
  });
  const U = utbildning(res, ind);
  const summa = per.reduce((s, x) => s + x.saknas, 0);
  return `<section class="kort komp-kort"><h2>Kompetens</h2>
    <p class="dampad liten">${summa ? `${summa} gånger saknas någon med en kompetens som krävs (kompetensvakanser). Motorn har valt vilka som arbetar så att så många krav som möjligt täcks, utan extra pass och utan att behovet blir sämre.` : "Alla kompetenskrav är täckta."}</p>
    <div class="rull"><table class="jamfor"><thead><tr><th>Krav</th><th class="tal">Pass med krav</th><th class="tal">Täckta</th><th class="tal">Saknas</th></tr></thead><tbody>
    ${per.map(x => `<tr><td><b>${esc(x.k.namn)}</b></td><td class="tal">${x.behov}</td><td class="tal">${x.behov - x.saknas}</td><td class="tal${x.saknas ? " minus" : ""}">${x.saknas || "–"}</td></tr>`).join("")}</tbody></table></div>
    ${per.filter(x => x.brist.length).map(x => `<p class="liten" style="margin:8px 0 0"><b>${esc(x.k.namn)} saknas:</b> ${x.brist.slice(0, 8).map(r => `v${r.vecka} ${r.veckodag} ${DELTEXT[r.dygnsdel]}`).join(", ")}${x.brist.length > 8 ? ` och ${x.brist.length - 8} till` : ""}.</p>`).join("")}
    ${U.length ? `<h3 style="margin-top:12px">Förslag på utbildning</h3><ul class="punkter liten">${U.map(u => `<li><b>${esc(u.namn)}:</b> ${u.forslag.length ? u.forslag.map(f => `${esc(f.pid)} (arbetar ${f.pass} av passen där den saknas)`).join(", ") : "ingen arbetar de passen"}. Med kompetensen hade de kunnat täcka bristen utan att schemat ändras.</li>`).join("")}</ul>` : ""}</section>`;
}

return { STANDARD, FORSKOLA, forskolaLista, kopia, lagg, andra, taBort, orgKort, enhetsLista, synka, sattPerson, nyttKrav, taBortKrav, andraKrav, perDag, komprimera,
  balans, balansKort, flik, hantera, marke, utbildning, tackningKort, esc };
})();
if (typeof module !== "undefined") module.exports = KOMP;
