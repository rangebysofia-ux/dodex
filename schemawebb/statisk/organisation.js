"use strict";
// Organisationsstruktur: enheter ordnas under verksamheter, till exempel Äldreomsorg → SÄBO och Hemtjänst,
// LSS och Förskola. Fritt antal nivåer. Delas av webben (app.js) och lättversionen (light/sida.html).
// Strukturen är bara ordning och rubriker – den påverkar inte schemaläggningen. Se docs/organisation.md.

const ORG = (() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Startstrukturen (användarens önskemål 2026-11-08). Kan ändras fritt i gränssnittet.
const STANDARD = [
  { id: "aldreomsorg", namn: "Äldreomsorg", forelder: null, farg: "#b08a2e" },
  { id: "sabo", namn: "SÄBO", forelder: "aldreomsorg", farg: "#c46a2b" },
  { id: "hemtjanst", namn: "ORDBO", forelder: "aldreomsorg", farg: "#2f8a6f" },  // ordinärt boende (hemtjänst), användarens namn 2026-11-09
  { id: "lss", namn: "LSS", forelder: null, farg: "#3f6bb0" },
  { id: "forskola", namn: "Förskola", forelder: null, farg: "#9a4fa8" },
];

// Färger att välja bland för en verksamhet. Enheterna under ärver färgen från närmaste grupp som har en.
const PALETT = ["#b08a2e", "#c46a2b", "#c0473f", "#b5487e", "#9a4fa8", "#5b5bb8", "#3f6bb0", "#2b8aa0", "#2f8a6f", "#5f8a2f", "#7a6a55", "#4a4a4a"];
const GRA = "#8b8f8a";
const giltigFarg = f => typeof f === "string" && /^#[0-9a-f]{6}$/i.test(f);

// Gruppens färg: egen, annars ärvd uppåt. En sparad startstruktur utan färger får startfärgerna.
function farg(noder, id) {
  let x = noder.find(n => n.id === id), varv = 0;
  while (x && varv++ < 20) {
    if (giltigFarg(x.farg)) return x.farg;
    const std = STANDARD.find(n => n.id === x.id);
    if (std && x.farg === undefined) return std.farg;
    x = noder.find(n => n.id === x.forelder);
  }
  return GRA;
}
function sattFarg(noder, id, f) {
  if (f && !giltigFarg(f)) throw new Error("Ogiltig färg.");
  return noder.map(x => x.id === id ? { ...x, farg: f || null } : x);
}
// Enhetens färg: egen om den har en, annars verksamhetens.
const enhetsfarg = (noder, e) => (e && giltigFarg(e.farg) ? e.farg : farg(noder, e && e.org));
// Husmärket för en enhet. Andra argumentet är enheten ({org, farg}) eller bara verksamhetens id.
const ikon = (noder, e, hus = "🏠") => `<span class="enhet-ikon" style="--ef:${typeof e === "object" && e ? enhetsfarg(noder, e) : farg(noder, e)}" aria-hidden="true">${hus}</span>`;

// En sparad struktur där startgruppen fortfarande heter Hemtjänst får det nya startnamnet ORDBO (användarens beslut
// 2026-11-09). En grupp som användaren själv har döpt om lämnas orörd.
const kopia = n => (n && n.length ? n : STANDARD).map(x => (x.id === "hemtjanst" && x.namn === "Hemtjänst" ? { ...x, namn: "ORDBO" } : { ...x }));
const barn = (noder, id) => noder.filter(x => (x.forelder || null) === (id || null));
const finns = (noder, id) => noder.some(x => x.id === id);

// Gruppen och alla grupper ovanför, till exempel för att öppna dem när en enhet har lagts till där.
// Ligger enheten under LSS eller funktionsstöd? Bilaga J (jour) erbjuds bara där (användarens beslut 2026-11-09).
const LSS_NAMN = /\blss\b|funktionsst/i;
function arLss(noder, id) { return !!id && vag(noder, id).some(x => x === "lss" || LSS_NAMN.test(((noder.find(n => n.id === x) || {}).namn) || "")); }
function vag(noder, id) { const ut = []; let x = noder.find(n => n.id === id), varv = 0; while (x && varv++ < 20) { ut.push(x.id); x = noder.find(n => n.id === x.forelder); } return ut; }

// "Äldreomsorg › SÄBO"
function sokvag(noder, id) {
  const ut = []; let x = noder.find(n => n.id === id), varv = 0;
  while (x && varv++ < 20) { ut.unshift(x.namn); x = noder.find(n => n.id === x.forelder); }
  return ut.join(" › ");
}

function nyttId(noder, namn) {
  const bas = String(namn || "grupp").toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grupp";
  let id = bas, i = 2;
  while (finns(noder, id)) id = `${bas}-${i++}`;
  return id;
}

// Ändringar i strukturen. Returnerar ny lista eller kastar Error med svensk text.
function lagg(noder, namn, forelder) {
  namn = String(namn || "").trim();
  if (!namn) throw new Error("Skriv ett namn.");
  if (forelder && !finns(noder, forelder)) throw new Error("Den överordnade gruppen finns inte.");
  if (barn(noder, forelder).some(x => x.namn.toLowerCase() === namn.toLowerCase())) throw new Error(`Det finns redan en grupp som heter ${namn} här.`);
  return [...noder, { id: nyttId(noder, namn), namn, forelder: forelder || null }];
}
// Gruppen med det namnet under forelder; skapas om den inte finns. Returnerar { noder, id }.
function grupp(noder, namn, forelder) {
  namn = String(namn || "").trim();
  const finnsRedan = barn(noder, forelder || null).find(x => x.namn.toLowerCase() === namn.toLowerCase());
  if (finnsRedan) return { noder, id: finnsRedan.id };
  const ny = lagg(noder, namn, forelder || null);
  return { noder: ny, id: ny[ny.length - 1].id };
}
function bytNamn(noder, id, namn) {
  namn = String(namn || "").trim();
  if (!namn) throw new Error("Skriv ett namn.");
  return noder.map(x => x.id === id ? { ...x, namn } : x);
}
// En grupp kan tas bort när den saknar undergrupper; dess enheter flyttas upp ett steg (eller blir utan placering).
function taBort(noder, id) {
  if (barn(noder, id).length) throw new Error("Ta bort eller flytta undergrupperna först.");
  const x = noder.find(n => n.id === id);
  return { noder: noder.filter(n => n.id !== id), flyttaTill: x ? x.forelder || null : null };
}

// ---------------------------------------------------------------- aktivitetstyper
// Organisationens aktivitetstyper: namn och färg, och vilken sorts aktivitet det är (kategorin som motorn känner).
// En enhets aktivitet får typens kategori och färg när typen väljs. Färgen är bara för visning.
const KATEGORI = { apt: "APT", utbildning: "Utbildning", mote: "Möte", studier: "Studier", dokumentation: "Dokumentation", handledning: "Handledning", annat: "Annat" };
const AKT_STANDARD = [
  { id: "apt", namn: "APT", typ: "apt", farg: "#3f6bb0" },
  { id: "utbildning", namn: "Utbildning", typ: "utbildning", farg: "#2f8a6f" },
  { id: "mote", namn: "Möte", typ: "mote", farg: "#b08a2e" },
  { id: "studier", namn: "Studier", typ: "studier", farg: "#9a4fa8" },
  { id: "dokumentation", namn: "Dokumentation", typ: "dokumentation", farg: "#2b8aa0" },
  { id: "handledning", namn: "Handledning", typ: "handledning", farg: "#c46a2b" },
  { id: "annat", namn: "Annat", typ: "annat", farg: "#7a6a55" },
];
const aktKopia = l => (l && l.length ? l : AKT_STANDARD).map(x => ({ ...x }));
function aktLagg(l, namn, typ = "annat") {
  namn = String(namn || "").trim();
  if (!namn) throw new Error("Skriv ett namn på aktivitetstypen.");
  if (l.some(x => x.namn.toLowerCase() === namn.toLowerCase())) throw new Error(`Det finns redan en aktivitetstyp som heter ${namn}.`);
  let id = nyttId(l, namn);
  return [...l, { id, namn, typ: KATEGORI[typ] ? typ : "annat", farg: PALETT[l.length % PALETT.length] }];
}
function aktAndra(l, id, falt, varde) {
  if (falt === "farg" && !giltigFarg(varde)) throw new Error("Ogiltig färg.");
  if (falt === "typ" && !KATEGORI[varde]) throw new Error("Okänd kategori.");
  if (falt === "namn" && !String(varde || "").trim()) throw new Error("Skriv ett namn.");
  return l.map(x => x.id === id ? { ...x, [falt]: falt === "namn" ? String(varde).trim() : varde } : x);
}
const aktTaBort = (l, id) => l.filter(x => x.id !== id);
// Färgen för en aktivitet i en enhet: egen, annars typens med samma kategori.
const aktFarg = (l, a) => (a && giltigFarg(a.farg) ? a.farg : ((aktKopia(l).find(x => x.typ === (a && a.typ)) || {}).farg || "#7a6a55"));

// Valet av typ i en enhets aktivitetsformulär: organisationens typer. Den valda är den med samma kategori och färg.
function aktAlternativ(l, a) {
  l = aktKopia(l);
  const vald = l.find(x => x.typ === (a.typ || "annat") && x.farg === a.farg) || l.find(x => x.typ === (a.typ || "annat")) || l[0];
  return l.map(x => `<option value="${esc(x.id)}"${x === vald ? " selected" : ""}>${esc(x.namn)}</option>`).join("");
}
const aktTyp = (l, id) => aktKopia(l).find(x => x.id === id) || { id: "annat", namn: "Annat", typ: "annat" };
// Fälten en aktivitet får av sin typ: kategori och färg.
const aktFalt = t => ({ typ: KATEGORI[t.typ] ? t.typ : "annat", ...(giltigFarg(t.farg) ? { farg: t.farg } : {}) });
// Namnet följer typen när det är tomt eller samma som en typs namn.
const aktNamnEfterTyp = (l, nuvarande, t) => (!String(nuvarande || "").trim() || aktKopia(l).some(x => x.namn === String(nuvarande).trim()) ? (t.id === "annat" ? "" : t.namn) : nuvarande);

// ---------------------------------------------------------------- sidan Organisation
// Hela strukturen på ett ställe, utan att något schema behöver läggas: verksamheter och grupper, enheterna under
// dem med färg och områden/team, och organisationens aktivitetstyper. enheter = [{id, namn, org, farg, team}].
// lank(e) ger adressen eller data-attributen för att öppna en enhet.
function stod(noder, enheter, typer, { lank = () => "", oppna = new Set() } = {}) {
  const per = new Map();
  // i bokstavsordning, så att det går att hitta i en lång lista
  for (const e of [...enheter].sort((a, b) => String(a.namn).localeCompare(String(b.namn), "sv"))) { const k = e.org && finns(noder, e.org) ? e.org : ""; if (!per.has(k)) per.set(k, []); per.get(k).push(e); }
  const enhet = e => `<div class="os-enhet" style="--ef:${enhetsfarg(noder, e)}">
      <div class="os-rad"><input type="color" class="org-farg" data-enhetfarg="${esc(e.id)}" value="${enhetsfarg(noder, e)}" aria-label="Färg för ${esc(e.namn)}" title="Färg">
        <span class="os-hus" aria-hidden="true">🏠</span><b class="os-namn">${lank(e) ? `<a ${lank(e)}>${esc(e.namn)}</a>` : esc(e.namn)}</b>
        <span class="chips os-knappar"><button class="liten" data-os="enhet-namn" data-e="${esc(e.id)}">Byt namn</button><button class="liten" data-os="team-ny" data-e="${esc(e.id)}">+ Område/team</button></span></div>
      ${(e.team || []).length ? `<div class="os-team">${e.team.map((t, i) => `<span class="os-teamchip" style="--tf:${giltigFarg(t.farg) ? t.farg : PALETT[i % PALETT.length]}"><button class="lank" data-os="team-namn" data-e="${esc(e.id)}" data-t="${esc(t.id)}" title="Byt namn">${esc(t.namn || t.id)}</button><button class="os-x" data-os="team-bort" data-e="${esc(e.id)}" data-t="${esc(t.id)}" aria-label="Ta bort ${esc(t.namn || t.id)}">×</button></span>`).join("")}</div>` : ""}</div>`;
  const grupp = (x, niva) => {
    const egna = per.get(x.id) || [], under = barn(noder, x.id);
    return `<details class="org-grupp os-grupp niva${Math.min(niva, 3)}" data-org="${esc(x.id)}" style="--ef:${farg(noder, x.id)}"${oppna.has(x.id) ? " open" : ""}>
      <summary><span class="org-prick" aria-hidden="true"></span><span class="org-namn">${esc(x.namn)}</span></summary>
      <div class="os-verktyg"><input type="color" class="org-farg" data-orgfarg="${esc(x.id)}" value="${farg(noder, x.id)}" aria-label="Färg för ${esc(x.namn)}" title="Färg">
        <span class="chips os-knappar"><button class="liten primar" data-os="enhet-ny" data-org="${esc(x.id)}">+ Enhet</button><button class="liten" data-orgg="under" data-id="${esc(x.id)}">+ Undergrupp</button><button class="liten" data-orgg="byt" data-id="${esc(x.id)}">Byt namn</button>${under.length ? "" : `<button class="liten fara" data-orgg="bort" data-id="${esc(x.id)}">Ta bort</button>`}</span></div>
      <div class="os-innehall">${egna.map(enhet).join("")}${under.map(y => grupp(y, niva + 1)).join("")}${!egna.length && !under.length ? `<p class="dampad liten org-tom">Inga enheter här än.</p>` : ""}</div></details>`;
  };
  const utan = per.get("") || [];
  const typRad = t => `<div class="os-typ"><input type="color" class="org-farg" data-akt="${esc(t.id)}" data-falt="farg" value="${giltigFarg(t.farg) ? t.farg : "#7a6a55"}" aria-label="Färg för ${esc(t.namn)}" title="Färg">
      <input data-akt="${esc(t.id)}" data-falt="namn" value="${esc(t.namn)}" aria-label="Namn"><select data-akt="${esc(t.id)}" data-falt="typ" aria-label="Kategori för ${esc(t.namn)}">${Object.entries(KATEGORI).map(([k, v]) => `<option value="${k}"${k === t.typ ? " selected" : ""}>${v}</option>`).join("")}</select>
      <button class="liten fara" data-os="akt-bort" data-id="${esc(t.id)}" aria-label="Ta bort ${esc(t.namn)}">×</button></div>`;
  return `<section class="kort"><h2>Struktur</h2>
      <p class="dampad liten"><b>+ Enhet</b> lägger till en enhet under en verksamhet. <b>+ Område/team</b> delar upp enheten i områden eller team med ett gemensamt schema. Ska ett område ha eget schema, gör det till en egen enhet under en undergrupp. Färgerna är bara till för att hitta rätt.</p>
      <div class="org-trad os-trad">${barn(noder, null).map(x => grupp(x, 0)).join("")}
      ${utan.length ? `<details class="org-grupp niva0" data-org=""${oppna.has("") ? " open" : ""}><summary><span class="org-namn">Utan placering</span></summary><div class="os-innehall">${utan.map(enhet).join("")}</div></details>` : ""}</div>
      <form class="chips" id="org-ny" style="margin-top:12px"><input id="org-ny-namn" placeholder="Ny verksamhet, till exempel Socialpsykiatri" style="max-width:320px"><button type="submit" class="liten">+ Lägg till verksamhet</button></form></section>
    <section class="kort"><h2>Aktivitetstyper</h2>
      <p class="dampad liten">Typer av aktiviteter under arbetstid, med namn och färg. Välj typen när du lägger in en aktivitet i en enhet, så får den namnet och färgen. Kategorin säger vad det är för slags aktivitet.</p>
      <div class="os-typer">${typer.map(typRad).join("")}</div>
      <form class="chips" id="akt-ny" style="margin-top:10px"><input id="akt-ny-namn" placeholder="Ny typ, till exempel Brandövning" style="max-width:280px"><button type="submit" class="liten">+ Lägg till typ</button></form></section>`;
}

// ---------------------------------------------------------------- import från Excel
// Läser en organisation ur kalkylblad (rader som listor av celler, första raden rubriker). Tre format:
//   1. Hierarki: kolumnerna Område/Enhet, Typ, Under ("SÄBO / Furulund") och Avdelningar (kommaseparerade).
//   2. Par: två kolumner, enhet och avdelning, en rad per avdelning (till exempel Förskola, Avdelning).
//   3. Sammanställning: enhet och en kolumn Avdelningar med kommaseparerade namn.
// Resultatet är en lista poster {nyckel, namn, foralder, typ: "grupp"|"enhet", team: [namn]} i ordning
// (överordnade först) och ett förslag på verksamhet att lägga dem under. Bara namn läses, inga personuppgifter.
function importPlan(blad) {
  const ren = v => String(v ?? "").trim();
  const rubrik = r => r.map(x => ren(x).toLowerCase());
  const delaLista = v => ren(v).split(/\s*[,;]\s*/).map(ren).filter(Boolean);
  const poster = new Map(), ordning = [];
  const lagg = (namn, foralder, typ) => {
    const nyckel = (foralder ? foralder + " / " : "") + namn;
    if (!poster.has(nyckel)) { poster.set(nyckel, { nyckel, namn, foralder: foralder || null, typ, team: [] }); ordning.push(nyckel); }
    const p = poster.get(nyckel); if (typ === "enhet") p.typ = p.typ === "grupp" ? "grupp" : "enhet";
    return p;
  };
  const hierarki = blad.find(b => { const h = rubrik(b.rader[0] || []); return h.includes("under") && h.some(x => x.startsWith("avdelning")); });
  const ord = blad.map(b => b.namn + " " + b.rader.slice(0, 60).map(r => r.slice(0, 3).map(ren).join(" ")).join(" ")).join(" ").toLowerCase();
  if (hierarki) {
    const h = rubrik(hierarki.rader[0]), iN = 0, iU = h.indexOf("under"), iA = h.findIndex(x => x.startsWith("avdelning"));
    const rader = hierarki.rader.slice(1).filter(r => ren(r[iN])).map(r => ({ namn: ren(r[iN]), under: ren(r[iU]).split(/\s*\/\s*/).filter(Boolean), avd: delaLista(r[iA]) }));
    const ar = n => rader.some(r => r.under.includes(n));  // har undergrupper
    // vägen till en post: kedjan i Under, där varje led är en egen grupp
    const nyckelFor = vag => vag.reduce((f, n) => { lagg(n, f, "grupp"); return (f ? f + " / " : "") + n; }, null);
    // grupper utan Under först, sedan resten i ordning efter djup
    rader.sort((a, b) => a.under.length - b.under.length);
    for (const r of rader) {
      const f = nyckelFor(r.under);
      const p = lagg(r.namn, f, r.avd.length || !ar(r.namn) ? "enhet" : "grupp");
      if (ar(r.namn)) p.typ = "grupp";
      r.avd.forEach(a => { if (!p.team.includes(a)) p.team.push(a); });
    }
  } else {
    for (const b of blad) {
      const h = rubrik(b.rader[0] || []), iA = h.findIndex(x => x.startsWith("avdelning") || x === "team" || x.startsWith("område"));
      if (iA < 0) continue;
      const lista = h[iA] === "avdelningar";
      for (const r of b.rader.slice(1)) {
        const namn = ren(r[0]); if (!namn) continue;
        const p = lagg(namn, null, "enhet");
        (lista ? delaLista(r[iA]) : [ren(r[iA])]).filter(Boolean).forEach(a => { if (!p.team.includes(a)) p.team.push(a); });
      }
      if (ordning.length) break;  // ett blad räcker; paren och sammanställningen innehåller samma sak
    }
  }
  const forslag = /förskol/.test(ord) ? "forskola" : /säbo|ordbo|hemtjänst|äldre/.test(ord) ? "aldreomsorg" : /lss|gruppbostad|daglig/.test(ord) ? "lss" : null;
  return { poster: ordning.map(k => poster.get(k)), forslag };
}

// Förhandsvisning med kryssrutor; valda = Set av nycklar, bort = Set av bortvalda avdelningar (avdNyckel).
const avdNyckel = (nyckel, avd) => nyckel + " ¦ " + avd;
function importForhand(plan, valda, bort = new Set()) {
  const barnTill = f => plan.poster.filter(p => p.foralder === f);
  const rad = (p, niva) => `<li style="--niva:${niva}"><label class="check"><input type="checkbox" data-imp="${esc(p.nyckel)}"${valda.has(p.nyckel) ? " checked" : ""}>
      <b>${p.typ === "grupp" ? "▸ " : "🏠 "}${esc(p.namn)}</b></label>${p.team.length ? `<span class="imp-avd">${p.team.map(a => `<label class="imp-chip"><input type="checkbox" data-imp-avd="${esc(avdNyckel(p.nyckel, a))}"${valda.has(p.nyckel) && !bort.has(avdNyckel(p.nyckel, a)) ? " checked" : ""}${valda.has(p.nyckel) ? "" : " disabled"}> ${esc(a)}</label>`).join("")}</span>` : ""}</li>
    ${barnTill(p.nyckel).map(b => rad(b, niva + 1)).join("")}`;
  const n = plan.poster.filter(p => valda.has(p.nyckel)), e = n.filter(p => p.typ === "enhet");
  return `<ul class="org-red imp-lista">${barnTill(null).map(p => rad(p, 0)).join("")}</ul>
    <p class="liten">Valt: ${n.length - e.length} grupper, ${e.length} enheter och ${e.reduce((s, p) => s + p.team.filter(a => !bort.has(avdNyckel(p.nyckel, a))).length, 0)} avdelningar.</p>`;
}
// Kryssrutor: en bortvald grupp tar med sig allt under, en vald post tar med sig sina överordnade.
function importVal(plan, valda, nyckel, pa) {
  const ut = new Set(valda), under = k => plan.poster.filter(p => p.foralder === k).forEach(p => { ut.delete(p.nyckel); under(p.nyckel); });
  if (pa) { let k = nyckel; while (k) { ut.add(k); k = (plan.poster.find(p => p.nyckel === k) || {}).foralder; } }
  else { ut.delete(nyckel); under(nyckel); }
  return ut;
}

// Lägger in de valda posterna under forelder. Grupper och enheter med samma namn på samma plats återanvänds,
// och avdelningar som redan finns läggs inte till igen, så importen kan köras om. enheter = befintliga enheter
// ({id, namn, org, indata}). Returnerar { noder, nya: [{namn, org, team}], andrade: [{id, team}] } – skapandet
// och sparandet gör webben respektive lättversionen.
function importera(noder, plan, valda, forelder, enheter, bort = new Set()) {
  const idFor = new Map(); let n = noder;
  const nya = [], andrade = [];
  let fargNr = 0;
  for (const p of plan.poster) {
    if (!valda.has(p.nyckel)) continue;
    const f = p.foralder ? idFor.get(p.foralder) : (forelder || null);
    if (p.typ === "grupp") {
      const g = grupp(n, p.namn, f); n = g.noder; idFor.set(p.nyckel, g.id);
      // nya grupper direkt under verksamheten får en egen färg
      const nod = n.find(x => x.id === g.id);
      if (!p.foralder && nod && nod.farg === undefined && !STANDARD.some(s => s.id === nod.id)) {
        const upptagna = new Set([...barn(n, f).map(x => farg_(x)), f ? farg(n, f) : null]);
        let c = PALETT.find(x => !upptagna.has(x)) || PALETT[fargNr++ % PALETT.length];
        n = sattFarg(n, g.id, c);
      }
      continue;
    }
    const team = p.team.filter(a => !bort.has(avdNyckel(p.nyckel, a)));
    const finns = enheter.find(e => e.namn.toLowerCase() === p.namn.toLowerCase() && (e.org || null) === (f || null));
    if (finns) {
      const har = new Set(((finns.indata && finns.indata.team) || finns.team || []).map(t => String(t.namn || "").toLowerCase()));
      const saknas = team.filter(t => !har.has(t.toLowerCase()));
      if (saknas.length) andrade.push({ id: finns.id, team: saknas });
    } else nya.push({ namn: p.namn, org: f, team });
  }
  return { noder: n, nya, andrade };
}
// Kortet på sidan Organisation: välj fil, eller förhandsvisning med kryssrutor och var det ska läggas.
function importKort(noder, imp) {
  if (!imp) return `<section class="kort"><h2>Importera från Excel</h2>
      <p class="dampad liten">En lista med enheter och avdelningar, till exempel en kolumn för förskolan och en för avdelningen, eller områden med kolumnerna Typ, Under och Avdelningar. Du ser allt och väljer vad som ska med innan något sparas. Bara namnen läses.</p>
      <p class="chips"><label class="knapp">Välj Excel-fil<input type="file" id="org-import" accept=".xlsx,.xls,.csv" hidden></label>
      <button data-os="grund" title="Förskolorna och avdelningarna som finns som grund i verktyget. Bara det som saknas läggs till.">Lägg in förskolorna</button></p></section>`;
  return `<section class="kort"><h2>Importera ${esc(imp.fil || "")}</h2>
      <div class="falt" style="max-width:420px"><div><label for="imp-plats">Lägg under</label><select id="imp-plats">${alternativ(noder, imp.forelder, { tom: "Överst i organisationen" })}</select></div></div>
      <p class="dampad liten">Bocka ur det som ska vänta, eller enskilda avdelningar som inte ska med. Grupper och enheter som redan finns på samma plats återanvänds, och avdelningar läggs bara till om de saknas. Avdelningarna blir områden/team i enhetens gemensamma schema.</p>
      <div id="imp-forhand">${importForhand(imp.plan, imp.valda, imp.bort)}</div>
      <p class="chips"><button class="primar" data-os="import-kor">Importera</button><button data-os="import-avbryt">Avbryt</button></p></section>`;
}
// Kalkylbladen ur en fil som SheetJS har läst: [{namn, rader}].
const bladUr = (XLSX, wb) => wb.SheetNames.map(n => ({ namn: n, rader: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: "" }) }));
const farg_ = x => (giltigFarg(x.farg) ? x.farg : (STANDARD.find(s => s.id === x.id) || {}).farg);

// <option>-lista med indrag, för att välja var en enhet ska ligga
function alternativ(noder, valt, { tom = "Utan placering" } = {}) {
  const ut = [`<option value=""${valt ? "" : " selected"}>${esc(tom)}</option>`];
  const gå = (id, niva) => barn(noder, id).forEach(x => {
    ut.push(`<option value="${esc(x.id)}"${x.id === valt ? " selected" : ""}>${"  ".repeat(niva)}${niva ? "› " : ""}${esc(x.namn)}</option>`);
    gå(x.id, niva + 1);
  });
  gå(null, 0);
  return ut.join("");
}

// Alla grupper är stängda tills användaren öppnar dem (oppna = Set av öppnade grupper; "" = Utan placering).
// Enheterna grupperade i strukturen. ritaEnhet(e) ger HTML för en enhet; nyKnapp(id) ger HTML för "ny enhet här".
// Grupper utan enheter längre ned visas också, så att man kan lägga till där.
function trad(noder, enheter, { ritaEnhet, nyKnapp = () => "", oppna = new Set() } = {}) {
  const per = new Map();
  for (const e of enheter) { const k = e.org && finns(noder, e.org) ? e.org : ""; if (!per.has(k)) per.set(k, []); per.get(k).push(e); }
  const antal = id => (per.get(id) || []).length + barn(noder, id).reduce((s, x) => s + antal(x.id), 0);
  const grupp = (x, niva) => {
    const egna = per.get(x.id) || [], n = antal(x.id);
    return `<details class="org-grupp niva${Math.min(niva, 3)}" data-org="${esc(x.id)}" style="--ef:${farg(noder, x.id)}"${oppna.has(x.id) ? " open" : ""}>
      <summary><span class="org-prick" aria-hidden="true"></span><span class="org-namn">${esc(x.namn)}</span><span class="org-antal">${n} ${n === 1 ? "enhet" : "enheter"}</span>${nyKnapp(x.id)}</summary>
      <div class="org-innehall">${egna.map(ritaEnhet).join("")}${barn(noder, x.id).map(y => grupp(y, niva + 1)).join("")}
      ${!egna.length && !barn(noder, x.id).length ? `<p class="dampad liten org-tom">Inga enheter här än.</p>` : ""}</div></details>`;
  };
  let h = barn(noder, null).map(x => grupp(x, 0)).join("");
  const utan = per.get("") || [];
  if (utan.length) h += `<details class="org-grupp niva0" data-org=""${oppna.has("") ? " open" : ""}><summary><span class="org-namn">Utan placering</span><span class="org-antal">${utan.length} ${utan.length === 1 ? "enhet" : "enheter"}</span></summary><div class="org-innehall">${utan.map(ritaEnhet).join("")}</div></details>`;
  return h;
}

// Redigering av strukturen: en lista med namn, knappar för att byta namn, lägga till undergrupp och ta bort.
function redigera(noder) {
  const rad = (x, niva) => `<li style="--niva:${niva}"><input type="color" class="org-farg" list="org-palett" value="${farg(noder, x.id)}" data-orgfarg="${esc(x.id)}" title="Färg för ${esc(x.namn)}" aria-label="Färg för ${esc(x.namn)}"><span class="org-red-namn">${esc(x.namn)}</span>
      <span class="chips"><button class="liten" data-orgg="byt" data-id="${esc(x.id)}">Byt namn</button><button class="liten" data-orgg="under" data-id="${esc(x.id)}">+ Undergrupp</button>${barn(noder, x.id).length ? "" : `<button class="liten fara" data-orgg="bort" data-id="${esc(x.id)}">Ta bort</button>`}</span></li>
      ${barn(noder, x.id).map(y => rad(y, niva + 1)).join("")}`;
  return `<datalist id="org-palett">${PALETT.map(f => `<option value="${f}">`).join("")}</datalist><ul class="org-red">${barn(noder, null).map(x => rad(x, 0)).join("")}</ul>
    <form class="chips" id="org-ny" style="margin-top:10px"><input id="org-ny-namn" placeholder="Ny verksamhet, till exempel Socialpsykiatri" style="max-width:320px"><button type="submit" class="liten">+ Lägg till överst</button></form>`;
}

return { vag, arLss, importKort, bladUr, importPlan, importForhand, importVal, importera, aktAlternativ, aktTyp, aktFalt, aktNamnEfterTyp, KATEGORI, AKT_STANDARD, aktKopia, aktLagg, aktAndra, aktTaBort, aktFarg, stod, grupp, STANDARD, PALETT, farg, sattFarg, ikon, enhetsfarg, giltigFarg, kopia, barn, sokvag, lagg, bytNamn, taBort, alternativ, trad, redigera, finns };
})();
if (typeof module !== "undefined") module.exports = ORG;
