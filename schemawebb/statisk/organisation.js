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
  { id: "hemtjanst", namn: "Hemtjänst", forelder: "aldreomsorg", farg: "#2f8a6f" },
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

const kopia = n => (n && n.length ? n : STANDARD).map(x => ({ ...x }));
const barn = (noder, id) => noder.filter(x => (x.forelder || null) === (id || null));
const finns = (noder, id) => noder.some(x => x.id === id);

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
function stod(noder, enheter, typer, { lank = () => "", stangda = new Set() } = {}) {
  const per = new Map();
  for (const e of enheter) { const k = e.org && finns(noder, e.org) ? e.org : ""; if (!per.has(k)) per.set(k, []); per.get(k).push(e); }
  const enhet = e => `<div class="os-enhet" style="--ef:${enhetsfarg(noder, e)}">
      <div class="os-rad"><input type="color" class="org-farg" data-enhetfarg="${esc(e.id)}" value="${enhetsfarg(noder, e)}" aria-label="Färg för ${esc(e.namn)}" title="Färg">
        <span class="os-hus" aria-hidden="true">🏠</span><b class="os-namn">${lank(e) ? `<a ${lank(e)}>${esc(e.namn)}</a>` : esc(e.namn)}</b>
        <span class="chips os-knappar"><button class="liten" data-os="enhet-namn" data-e="${esc(e.id)}">Byt namn</button><button class="liten" data-os="team-ny" data-e="${esc(e.id)}">+ Område/team</button></span></div>
      ${(e.team || []).length ? `<div class="os-team">${e.team.map((t, i) => `<span class="os-teamchip" style="--tf:${giltigFarg(t.farg) ? t.farg : PALETT[i % PALETT.length]}"><button class="lank" data-os="team-namn" data-e="${esc(e.id)}" data-t="${esc(t.id)}" title="Byt namn">${esc(t.namn || t.id)}</button><button class="os-x" data-os="team-bort" data-e="${esc(e.id)}" data-t="${esc(t.id)}" aria-label="Ta bort ${esc(t.namn || t.id)}">×</button></span>`).join("")}</div>` : ""}</div>`;
  const grupp = (x, niva) => {
    const egna = per.get(x.id) || [], under = barn(noder, x.id);
    return `<details class="org-grupp os-grupp niva${Math.min(niva, 3)}" data-org="${esc(x.id)}" style="--ef:${farg(noder, x.id)}"${stangda.has(x.id) ? "" : " open"}>
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
      ${utan.length ? `<details class="org-grupp niva0" open><summary><span class="org-namn">Utan placering</span></summary><div class="os-innehall">${utan.map(enhet).join("")}</div></details>` : ""}</div>
      <form class="chips" id="org-ny" style="margin-top:12px"><input id="org-ny-namn" placeholder="Ny verksamhet, till exempel Socialpsykiatri" style="max-width:320px"><button type="submit" class="liten">+ Lägg till verksamhet</button></form></section>
    <section class="kort"><h2>Aktivitetstyper</h2>
      <p class="dampad liten">Typer av aktiviteter under arbetstid, med namn och färg. Välj typen när du lägger in en aktivitet i en enhet, så får den namnet och färgen. Kategorin säger vad det är för slags aktivitet.</p>
      <div class="os-typer">${typer.map(typRad).join("")}</div>
      <form class="chips" id="akt-ny" style="margin-top:10px"><input id="akt-ny-namn" placeholder="Ny typ, till exempel Brandövning" style="max-width:280px"><button type="submit" class="liten">+ Lägg till typ</button></form></section>`;
}

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

// Enheterna grupperade i strukturen. ritaEnhet(e) ger HTML för en enhet; nyKnapp(id) ger HTML för "ny enhet här".
// Grupper utan enheter längre ned visas också, så att man kan lägga till där.
function trad(noder, enheter, { ritaEnhet, nyKnapp = () => "", stangda = new Set() } = {}) {
  const per = new Map();
  for (const e of enheter) { const k = e.org && finns(noder, e.org) ? e.org : ""; if (!per.has(k)) per.set(k, []); per.get(k).push(e); }
  const antal = id => (per.get(id) || []).length + barn(noder, id).reduce((s, x) => s + antal(x.id), 0);
  const grupp = (x, niva) => {
    const egna = per.get(x.id) || [], n = antal(x.id);
    return `<details class="org-grupp niva${Math.min(niva, 3)}" data-org="${esc(x.id)}" style="--ef:${farg(noder, x.id)}"${stangda.has(x.id) ? "" : " open"}>
      <summary><span class="org-prick" aria-hidden="true"></span><span class="org-namn">${esc(x.namn)}</span><span class="org-antal">${n} ${n === 1 ? "enhet" : "enheter"}</span>${nyKnapp(x.id)}</summary>
      <div class="org-innehall">${egna.map(ritaEnhet).join("")}${barn(noder, x.id).map(y => grupp(y, niva + 1)).join("")}
      ${!egna.length && !barn(noder, x.id).length ? `<p class="dampad liten org-tom">Inga enheter här än.</p>` : ""}</div></details>`;
  };
  let h = barn(noder, null).map(x => grupp(x, 0)).join("");
  const utan = per.get("") || [];
  if (utan.length) h += `<details class="org-grupp niva0" data-org="" open><summary><span class="org-namn">Utan placering</span><span class="org-antal">${utan.length} ${utan.length === 1 ? "enhet" : "enheter"}</span></summary><div class="org-innehall">${utan.map(ritaEnhet).join("")}</div></details>`;
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

return { aktAlternativ, aktTyp, aktFalt, aktNamnEfterTyp, KATEGORI, AKT_STANDARD, aktKopia, aktLagg, aktAndra, aktTaBort, aktFarg, stod, grupp, STANDARD, PALETT, farg, sattFarg, ikon, enhetsfarg, giltigFarg, kopia, barn, sokvag, lagg, bytNamn, taBort, alternativ, trad, redigera, finns };
})();
if (typeof module !== "undefined") module.exports = ORG;
