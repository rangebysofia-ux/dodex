"use strict";
// Organisationsstruktur: enheter ordnas under verksamheter, till exempel Äldreomsorg → SÄBO och Hemtjänst,
// LSS och Förskola. Fritt antal nivåer. Delas av webben (app.js) och lättversionen (light/sida.html).
// Strukturen är bara ordning och rubriker – den påverkar inte schemaläggningen. Se docs/organisation.md.

const ORG = (() => {
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Startstrukturen (användarens önskemål 2026-11-08). Kan ändras fritt i gränssnittet.
const STANDARD = [
  { id: "aldreomsorg", namn: "Äldreomsorg", forelder: null },
  { id: "sabo", namn: "SÄBO", forelder: "aldreomsorg" },
  { id: "hemtjanst", namn: "Hemtjänst", forelder: "aldreomsorg" },
  { id: "lss", namn: "LSS", forelder: null },
  { id: "forskola", namn: "Förskola", forelder: null },
];

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
    return `<details class="org-grupp niva${Math.min(niva, 3)}" data-org="${esc(x.id)}"${stangda.has(x.id) ? "" : " open"}>
      <summary><span class="org-namn">${esc(x.namn)}</span><span class="org-antal">${n} ${n === 1 ? "enhet" : "enheter"}</span>${nyKnapp(x.id)}</summary>
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
  const rad = (x, niva) => `<li style="--niva:${niva}"><span class="org-red-namn">${esc(x.namn)}</span>
      <span class="chips"><button class="liten" data-orgg="byt" data-id="${esc(x.id)}">Byt namn</button><button class="liten" data-orgg="under" data-id="${esc(x.id)}">+ Undergrupp</button>${barn(noder, x.id).length ? "" : `<button class="liten fara" data-orgg="bort" data-id="${esc(x.id)}">Ta bort</button>`}</span></li>
      ${barn(noder, x.id).map(y => rad(y, niva + 1)).join("")}`;
  return `<ul class="org-red">${barn(noder, null).map(x => rad(x, 0)).join("")}</ul>
    <form class="chips" id="org-ny" style="margin-top:10px"><input id="org-ny-namn" placeholder="Ny verksamhet, till exempel Socialpsykiatri" style="max-width:320px"><button type="submit" class="liten">+ Lägg till överst</button></form>`;
}

return { STANDARD, kopia, barn, sokvag, lagg, bytNamn, taBort, alternativ, trad, redigera, finns };
})();
if (typeof module !== "undefined") module.exports = ORG;
