"use strict";
// Schemasystem – webbgränssnitt. Vyer styrs av adressens #-del:
//   #/                         enheter
//   #/e/3/indata?flik=behov     redigera enhet 3
//   #/e/3/schema/7              schema för körning 7 (utan id: senaste)
//   #/e/3/personer/7?p=A1       person A1 i körning 7
//   #/e/3/bemanning/7           bemanning och vakanser
//   #/e/3/installningar         regler
//   #/jamfor/7,8                jämför körningar

const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const DELAR = { morgon: "Morgon", kvall: "Kväll", natt: "Natt" };
const ARBETAR = { "morgon,kvall": "Dag och kväll", "morgon": "Bara morgon", "kvall": "Bara kväll", "natt": "Natt" };
const HELGER = { "2/4": "Varannan (2/4)", "1/4": "Var fjärde (1/4)", "3/4": "Tre av fyra (3/4)", "alla": "Alla", "ingen": "Inga" };
const ONSKTYP = { ledig: "Ledig", arbetar: "Arbetar", tidigast_start: "Börjar tidigast", senast_slut: "Slutar senast", endast_dygnsdel: "Bara dygnsdel" };
const DAGNYCKEL = { vardag: "Vardagar", helg: "Helg (lör–sön)", alla: "Alla dagar", "mån": "Måndag", "tis": "Tisdag", "ons": "Onsdag", "tor": "Torsdag", "fre": "Fredag", "lör": "Lördag", "sön": "Söndag" };

let loggaNr = 0;
const LOGGA = () => { const id = "guld" + (++loggaNr); return `<svg viewBox="0 0 64 64" role="img" aria-label="Dodex"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc95"/><stop offset=".55" stop-color="#cfa246"/><stop offset="1" stop-color="#94691f"/></linearGradient></defs><circle cx="32" cy="32" r="29" fill="#141310" stroke="url(#${id})" stroke-width="3"/><circle cx="32" cy="32" r="24.5" fill="none" stroke="url(#${id})" stroke-width="0.9" opacity=".8"/><line x1="32.00" y1="13.50" x2="32.00" y2="9.00" stroke="url(#${id})" stroke-width="2.6" stroke-linecap="round"/><line x1="42.25" y1="14.25" x2="43.50" y2="12.08" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="49.75" y1="21.75" x2="51.92" y2="20.50" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="50.50" y1="32.00" x2="55.00" y2="32.00" stroke="url(#${id})" stroke-width="2.6" stroke-linecap="round"/><line x1="49.75" y1="42.25" x2="51.92" y2="43.50" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="42.25" y1="49.75" x2="43.50" y2="51.92" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="32.00" y1="50.50" x2="32.00" y2="55.00" stroke="url(#${id})" stroke-width="2.6" stroke-linecap="round"/><line x1="21.75" y1="49.75" x2="20.50" y2="51.92" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="14.25" y1="42.25" x2="12.08" y2="43.50" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="13.50" y1="32.00" x2="9.00" y2="32.00" stroke="url(#${id})" stroke-width="2.6" stroke-linecap="round"/><line x1="14.25" y1="21.75" x2="12.08" y2="20.50" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="21.75" y1="14.25" x2="20.50" y2="12.08" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><line x1="32" y1="32" x2="22.5" y2="26.5" stroke="url(#${id})" stroke-width="2.6" stroke-linecap="round"/><line x1="32" y1="32" x2="44" y2="23" stroke="url(#${id})" stroke-width="1.8" stroke-linecap="round"/><circle cx="32" cy="32" r="2.4" fill="#f0d58e"/></svg>`; };
const loggaText = () => `${LOGGA()}<span><b>DODEX</b><small>Scheduler</small></span>`;

const IKON = {
  oversikt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  behov: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M17 8v6M14 11h6"/></svg>',
  grupp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.6c2.6 0 4.6 1.7 5.5 4.4"/></svg>',
  simulering: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11M4 17h7"/><path d="m15 3 4 4-4 4M11 13l4 4-4 4"/></svg>',
  kontroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  rapport: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  kostnad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
  klocka: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  lucka: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M10 14l4 4M14 14l-4 4"/></svg>',
  logga: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="5"/><path d="M8 2v4M16 2v4M7.5 13.5l3 3 6-6"/></svg>',
  hem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  indata: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>',
  schema: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  graf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M6 16v-5M11 16V6M16 16v-8M20 16v-3"/></svg>',
  analys: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>',
  installning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h12M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  ut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
  las: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  olast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
  penna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
  varning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h0"/></svg>',
  stopp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h0"/></svg>',
  ladda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  spela: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
};

let st = { enhet: null, indata: null, andrad: false, flik: "personal", kontroll: null, korningar: [], valdaKorningar: new Set(),
  korning: null, vecka: 0, valdCell: null, redigeraOnsk: null, pollning: null, oppnaRegel: null, vy: "hem", sv: {} };

const $ = sel => document.querySelector(sel);
const vy = () => $("#vy");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tim = m => `${Math.floor(m / 60)} h${m % 60 ? " " + String(m % 60).padStart(2, "0") : ""}`;
const timmar = m => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;
const datum = s => new Date(s * 1000).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
const sv = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
const nk = n => "niva-" + String(n).replace(/\s+/g, "-");
const vakText = n => `${n} ${n === 1 ? "vakant pass" : "vakanta pass"}`;

function meddela(text) {
  const m = $("#meddelande");
  m.textContent = text; m.classList.add("syns");
  clearTimeout(meddela.t); meddela.t = setTimeout(() => m.classList.remove("syns"), 2800);
}

// verktygstips för grafer och schema: element med data-tips
document.addEventListener("pointerover", e => {
  const el = e.target.closest("[data-tips]"); const t = $("#tips");
  if (!el) { t.classList.remove("syns"); return; }
  t.textContent = el.dataset.tips; t.classList.add("syns");
});
document.addEventListener("pointermove", e => {
  const t = $("#tips"); if (!t.classList.contains("syns")) return;
  const x = Math.min(e.clientX + 14, innerWidth - t.offsetWidth - 8), y = e.clientY + 16 + t.offsetHeight > innerHeight ? e.clientY - t.offsetHeight - 10 : e.clientY + 16;
  t.style.left = x + "px"; t.style.top = y + "px";
});

async function api(metod, sokv, kropp) {
  const svar = await fetch("api/" + sokv, {
    method: metod, credentials: "same-origin",
    headers: kropp ? { "Content-Type": "application/json" } : {},
    body: kropp ? JSON.stringify(kropp) : undefined,
  });
  if (svar.status === 401 && sokv !== "logga-in") { visaInloggning(); throw new Error("Logga in först."); }
  const data = svar.headers.get("content-type")?.includes("json") ? await svar.json() : null;
  if (!svar.ok) {
    const fel = new Error(data?.detail && typeof data.detail === "string" ? data.detail : (data?.fel ? data.fel.join(" ") : `Fel ${svar.status}`));
    fel.data = data; fel.status = svar.status; throw fel;
  }
  return data;
}

function sokvag(delar) {
  $("#sokvag").innerHTML = delar.map(([t, l]) => l ? `<a href="${l}">${esc(t)}</a>` : esc(t)).join(" › ");
}

// ---------------------------------------------------------------- meny
let kravsInloggning = false;
function ritaMeny() {
  const e = st.enhet, k = st.korning && st.enhet && st.korning.enhet_id === st.enhet.id ? st.korning.id : "";
  const KORT = { Schemaplanering: "Schema", Bemanningsbehov: "Behov", "Analys och nyckeltal": "Nyckeltal", Regelkontroll: "Regler", Inställningar: "Inställn." };
  const lank = (vyer, ikon, text, href, av) => `<a class="post" href="${href}" aria-label="${text}"${vyer.includes(st.vy) ? ' aria-current="page"' : ""}${av ? ' aria-disabled="true" tabindex="-1"' : ""}>${IKON[ikon]}<span class="lang">${text}</span><span class="kortnamn">${KORT[text] || text}</span></a>`;
  const bas = e ? `#/e/${e.id}` : "#/", kk = k ? "/" + k : "";
  const lista = st.enhetLista || [];
  $("#meny").innerHTML = `<a class="logga" href="#/" aria-label="DODEX Scheduler, till enheterna">${loggaText()}</a>
    <div class="enhetsval"><label for="enhetsval">Enhet</label><select id="enhetsval"><option value="">Alla enheter …</option>${lista.map(x => `<option value="${x.id}"${e && x.id === e.id ? " selected" : ""}>${esc(x.namn)}</option>`).join("")}</select></div>
    ${lank(["oversikt", "hem"], "oversikt", "Översikt", e ? `${bas}/oversikt` : "#/")}
    ${lank(["schema"], "schema", "Schemaplanering", `${bas}/schema${kk}`, !e)}
    ${lank(["behov"], "behov", "Bemanningsbehov", `${bas}/behov`, !e)}
    ${lank(["medarbetare", "personer", "indata"], "grupp", "Medarbetare", `${bas}/medarbetare`, !e)}
    ${lank(["nyckeltal", "bemanning"], "graf", "Analys och nyckeltal", `${bas}/nyckeltal${kk}`, !e)}
    ${lank(["analys"], "simulering", "Simulering", `${bas}/analys`, !e)}
    ${lank(["regelkontroll"], "kontroll", "Regelkontroll", `${bas}/regelkontroll${kk}`, !e)}
    ${lank(["rapporter"], "rapport", "Rapporter", `${bas}/rapporter`, !e)}
    ${lank(["installningar"], "installning", "Inställningar", `${bas}/installningar`, !e)}
    <div class="fyll"></div>
    ${kravsInloggning ? `<button class="post ut" data-g="logga-ut" aria-label="Logga ut">${IKON.ut}<span>Logga ut</span></button>` : ""}
    <div class="fot"><em>Planering som skapar balans – idag och imorgon.</em>© Sofia Rångeby</div>`;
  $("#mobillogga").innerHTML = loggaText();
  const v = $("#enhetsval");
  if (v) v.onchange = () => { location.hash = v.value ? `#/e/${v.value}/oversikt` : "#/"; };
  $("#toppknappar").innerHTML = e ? `<button class="guld liten" data-g="lagg-schema">${IKON.spela} Lägg schema</button>` : "";
}

// ---------------------------------------------------------------- inloggning
function visaInloggning() {
  stoppaPollning(); st.vy = "hem"; st.enhet = null; ritaMeny(); sokvag([]);
  vy().innerHTML = `<form class="kort inloggning" id="inlogg">
    <div class="logga ljus" style="margin-bottom:6px">${loggaText()}</div>
    <h1>Välkommen till DODEX Scheduler</h1>
    <p class="dampad">Smart schemaplanering för en hållbar verksamhet.</p>
    <div><label for="losen">Lösenord</label><input id="losen" type="password" autocomplete="current-password" required></div>
    <button class="primar" type="submit">Logga in</button>
    <p class="dampad liten" id="inlogg-fel" role="alert"></p></form>`;
  $("#losen").focus();
  $("#inlogg").onsubmit = async e => {
    e.preventDefault();
    try { await api("POST", "logga-in", { losenord: $("#losen").value }); route(); }
    catch (err) { $("#inlogg-fel").textContent = err.message; }
  };
}

// ---------------------------------------------------------------- vy: enheter
async function visaEnheter() {
  st.vy = "hem"; st.enhet = null; st.korning = null;
  if (st.guide) { if (!$(".guide")) { ritaMeny(); sokvag([["Enheter", "#/"], ["Ny enhet"]]); } vy().innerHTML = GUIDE.html(st.guide); return; }
  try { st.enhetLista = await api("GET", "enheter"); } catch { /* behåll */ }
  ritaMeny();
  sokvag([["Enheter"]]);
  const [enheter, exempel] = await Promise.all([api("GET", "enheter"), api("GET", "exempel")]);
  st.exempel = exempel;
  vy().innerHTML = `
    <section class="kort valkommen"><div class="logga ljus">${loggaText()}</div>
      <p class="dampad" style="margin:8px 0 0">Planering som skapar balans – idag och imorgon. En enhet är en arbetsgrupp med medarbetare, behov, önskemål och regler; varje schema du lägger sparas som en körning.</p></section>
    ${GUIDE.val({ harEnheter: enheter.length > 0 })}
    <h2 id="mina-enheter" style="margin:6px 4px 0">Mina enheter</h2>
    <section class="lista-enheter">${enheter.length ? enheter.map(e => `
      <div class="kort enhet">
        <a class="namn" href="#/e/${e.id}/oversikt">${esc(e.namn)}</a>
        <div class="dampad liten">${e.personer ?? 0} personer · ${e.korningar} körningar · ändrad ${datum(e.andrad)}</div>
        <div class="chips"><a class="knapp liten primar" href="#/e/${e.id}/oversikt">${IKON.oversikt} Översikt</a><a class="knapp liten" href="#/e/${e.id}/schema">Schema</a>
          <button class="liten" data-g="kopiera" data-id="${e.id}">Kopiera</button>
          <button class="liten fara" data-g="ta-bort-enhet" data-id="${e.id}" data-namn="${esc(e.namn)}">Ta bort</button></div>
      </div>`).join("") : `<div class="kort tom">Inga enheter än. Skapa en ny eller börja från ett exempel nedan.</div>`}</section>
    <section class="kort" id="exempel">
      <h2>Börja från ett exempel</h2>
      <p class="dampad liten">Testfallen från projektet. De använder id-koder i stället för namn.</p>
      ${exempel.map((x, i) => `<div class="onsk"><div><b>${esc(x.namn)}</b><div class="dampad liten">${esc(x.beskrivning)}</div></div>
        <button class="liten" data-g="fran-exempel" data-i="${i}">Skapa</button></div>`).join("")}
    </section>`;
}

const NY_INDATA = () => ({
  enhet: "", veckor: 4, cykliskt: true,
  behov: { vardag: { morgon: 2, kvall: 2, natt: 1 }, helg: { morgon: 2, kvall: 2, natt: 1 } },
  personal: [{ id: "A1", grad: 1 }, { id: "A2", grad: 1 }, { id: "A3", grad: 0.75 }, { id: "N1", grad: 1, dygnsdelar: ["natt"] }],
  onskemal: [], losare: { tid_per_steg_s: 15 },
});

// ---------------------------------------------------------------- enhet och körningar
async function laddaEnhet(id) {
  if (!st.enhet || st.enhet.id !== id) {
    const e = await api("GET", "enheter/" + id);
    st.enhet = e; st.indata = e.indata; st.andrad = false; st.kontroll = null; st.valdaKorningar = new Set(); st.redigeraOnsk = null; st.korning = null;
  }
  st.korningar = await api("GET", `enheter/${id}/korningar`);
}

async function laddaKorning(kid) {
  if (!kid) {
    const klar = st.korningar.find(k => k.status === "klar" && k.losning === "OK") || st.korningar[0];
    if (!klar) { st.korning = null; return null; }
    kid = klar.id;
  }
  if (!st.korning || st.korning.id !== kid || st.korning.status !== "klar") {
    const k = await api("GET", "korningar/" + kid);
    if (!st.korning || st.korning.id !== k.id) { st.vecka = 0; st.valdCell = null; }
    st.korning = k;
  }
  return st.korning;
}

async function visaEnhet(id, flik) {
  st.vy = "indata";
  await laddaEnhet(id);
  st.flik = flik || st.flik || "personal";
  if (st.flik === "regler") st.flik = "personal";
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn]]);
  ritaEnhet();
  kontrollera();
  if (st.korningar.some(k => k.status === "i kö" || k.status === "kör")) startaPollning(() => uppdateraKorningar());
}

function ritaEnhet() {
  const F = [["personal", "Personal"], ["behov", "Behov"], ["onskemal", "Önskemål"], ["period", "Period"], ["json", "Avancerat"]];
  vy().innerHTML = `
    <section class="kort">
      <div class="rubrikrad">
        <div style="flex:1;min-width:200px;display:block"><label for="enhet-namn">Enhet</label><input id="enhet-namn" value="${esc(st.enhet.namn)}" style="font-size:20px;font-weight:800"></div>
        <div><button id="spara" ${st.andrad ? "" : "disabled"}>Sparat</button>
          <button class="guld" data-g="lagg-schema">${IKON.spela} Lägg schema</button></div>
      </div>
    </section>
    <div class="redigera">
      <section class="kort">
        <div class="flikar" role="tablist">${F.map(([k, t]) => `<button role="tab" data-g="flik" data-flik="${k}" aria-selected="${st.flik === k}">${t}${k === "personal" ? ` (${st.indata.personal.length})` : k === "onskemal" ? ` (${(st.indata.onskemal || []).length})` : ""}</button>`).join("")}</div>
        <div id="flik">${ritaFlik()}</div>
      </section>
      <aside>
        <section class="kort" id="kontroll">${ritaKontroll()}</section>
        <section class="kort" id="korningar">${ritaKorningar()}</section>
      </aside>
    </div>`;
  $("#enhet-namn").oninput = e => { st.enhet.namn = e.target.value; markeraAndrad(false); };
  $("#spara").onclick = spara;
  kopplaOnskForm();
  uppdateraSparaknapp();
}

function ritaFlik() {
  const i = st.indata;
  switch (st.flik) {
    case "personal": return `
      <p class="dampad liten">Använd id-koder, inte namn. Antal pass räknas ut från perioden om fältet är tomt. Alla arbetar varannan helg om inget undantag anges.</p>
      <div class="rull"><table class="form personal"><thead><tr><th>Id</th><th>Grad %</th><th>Arbetar</th><th>Helger</th><th>Grupp</th><th title="Antal pass under perioden">Pass</th><th></th></tr></thead><tbody>
      ${i.personal.map((p, n) => {
        const del = (p.dygnsdelar || ["morgon", "kvall"]).join(",");
        return `<tr>
          <td data-l="Id"><input data-s="personal.${n}.id" value="${esc(p.id)}" style="width:70px" aria-label="Id"></td>
          <td data-l="Grad %"><input data-s="personal.${n}.grad" data-t="procent" type="number" inputmode="numeric" min="10" max="100" step="5" value="${Math.round((p.grad ?? 1) * 100)}" style="width:78px" aria-label="Sysselsättningsgrad"></td>
          <td data-l="Arbetar"><select data-s="personal.${n}.dygnsdelar" data-t="dygnsdelar" aria-label="Arbetar"${del !== "morgon,kvall" && del !== "natt" ? ' class="undantag"' : ""}>${Object.entries(ARBETAR).map(([v, t]) => `<option value="${v}"${v === del ? " selected" : ""}>${t}</option>`).join("")}</select></td>
          <td data-l="Helger"><select data-s="personal.${n}.helgfrekvens" data-t="valfri" aria-label="Helger"${p.helgfrekvens && p.helgfrekvens !== "2/4" ? ' class="undantag"' : ""}><option value="">Varannan</option>${Object.entries(HELGER).filter(([v]) => v !== "2/4").map(([v, t]) => `<option value="${v}"${v === p.helgfrekvens ? " selected" : ""}>Undantag: ${t.toLowerCase()}</option>`).join("")}</select></td>
          <td data-l="Helggrupp"><select data-s="personal.${n}.helggrupp" data-t="valfri" aria-label="Helggrupp"><option value="">Auto</option><option${p.helggrupp === "A" ? " selected" : ""}>A</option><option${p.helggrupp === "B" ? " selected" : ""}>B</option></select></td>
          <td data-l="Antal pass"><input data-s="personal.${n}.antal_pass" data-t="pass" value="${esc(Array.isArray(p.antal_pass) ? p.antal_pass.join(", ") : p.antal_pass ?? "")}" placeholder="auto" style="width:70px" aria-label="Antal pass"></td>
          <td class="bort"><button class="liten fara" data-g="ta-bort-person" data-n="${n}" aria-label="Ta bort ${esc(p.id)}">×</button></td></tr>`;
      }).join("")}</tbody></table></div>
      <p style="margin-top:12px" class="chips"><button data-g="ny-person">+ Person</button> <button data-g="ny-person" data-natt="1">+ Nattperson</button></p>
      <p class="dampad liten">Gult betyder undantag: från varannan helg, eller från jämn fördelning mellan morgon och kväll. Helggrupp A arbetar helgerna i vecka 1, 3, 5 …</p>`;

    case "behov": {
      const b = i.behov || {};
      const tp = [];
      Object.entries(i.tidpunkter || {}).forEach(([k, l]) => l.forEach(t => tp.push({ k, ...t })));
      return `
      <p class="dampad liten">Antal pass per dygnsdel. Rader längre ned skriver över rader ovanför, till exempel en egen rad för fredag.</p>
      <div class="rull"><table class="form"><thead><tr><th>Dagar</th><th>Morgon</th><th>Kväll</th><th>Natt</th><th></th></tr></thead><tbody>
      ${Object.keys(b).map(k => `<tr><th>${DAGNYCKEL[k] || esc(k)}</th>${Object.keys(DELAR).map(d =>
        `<td><input type="number" inputmode="numeric" min="0" data-s="behov.${k}.${d}" data-t="heltal" value="${b[k][d] ?? 0}" style="width:74px" aria-label="${DAGNYCKEL[k]} ${DELAR[d]}"></td>`).join("")}
        <td>${["vardag", "helg"].includes(k) ? "" : `<button class="liten fara" data-g="ta-bort-behov" data-k="${k}" aria-label="Ta bort">×</button>`}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="chips" style="margin-top:10px"><select id="ny-behovsdag" style="width:auto">${Object.keys(DAGNYCKEL).filter(k => !b[k]).map(k => `<option value="${k}">${DAGNYCKEL[k]}</option>`).join("")}</select>
        <button data-g="ny-behovsrad">Lägg till rad</button></div>
      <h3>Minst i tjänst vid klockslag</h3>
      <p class="dampad liten">Till exempel mitt på dagen när morgon och kväll överlappar. Syns som punkter i vyn Klockslag.</p>
      ${tp.length ? `<div class="rull"><table class="form"><thead><tr><th>Dagar</th><th>Klockslag</th><th>Antal</th><th></th></tr></thead><tbody>
        ${tp.map((t, n) => `<tr><td><select data-tp="${n}" data-f="k">${Object.keys(DAGNYCKEL).map(k => `<option value="${k}"${k === t.k ? " selected" : ""}>${DAGNYCKEL[k]}</option>`).join("")}</select></td>
          <td><input type="time" data-tp="${n}" data-f="tid" value="${esc(t.tid)}" style="width:120px"></td>
          <td><input type="number" min="0" data-tp="${n}" data-f="antal" value="${t.antal}" style="width:74px"></td>
          <td><button class="liten fara" data-g="ta-bort-tp" data-n="${n}" aria-label="Ta bort">×</button></td></tr>`).join("")}</tbody></table></div>` : ""}
      <p style="margin-top:8px"><button data-g="ny-tp">+ Klockslag</button></p>`;
    }

    case "onskemal": return ritaOnskemal();

    case "period": return `
      <div class="falt">
        <div><label for="p-veckor">Veckor i perioden</label><input id="p-veckor" type="number" min="1" max="16" data-s="veckor" data-t="heltal" value="${i.veckor}"></div>
        <div><label for="p-bud">Budget, timmar per vecka</label><input id="p-bud" type="number" inputmode="decimal" min="1" step="0.5" data-s="budget_timmar_vecka" data-t="tal" value="${i.budget_timmar_vecka ?? ""}" placeholder="ingen"></div>
        <div><label for="p-start">Startdatum (måndag), för OB och helgdagar</label><input id="p-start" type="date" data-s="startdatum" data-t="valfri" value="${i.startdatum ?? ""}"></div>
        <div><label for="p-obp">OB-prognos efter avtalet, % per år</label><input id="p-obp" type="number" inputmode="decimal" min="0" max="20" step="0.5" data-s="ob_prognos_procent" data-t="tal" value="${i.ob_prognos_procent ?? ""}" placeholder="3 (standard)"></div>
        <div><label for="p-kost">Timkostnad, kr (lön och PO, utan OB)</label><input id="p-kost" type="number" inputmode="decimal" min="1" step="1" data-s="timkostnad_kr" data-t="tal" value="${i.timkostnad_kr ?? ""}" placeholder="ingen"></div>
        <div><label for="p-iso">Första veckans veckonummer</label><input id="p-iso" type="number" min="1" max="53" data-s="start_iso_vecka" data-t="valfritt-tal" value="${i.start_iso_vecka ?? ""}" placeholder="schemats egna"></div>
        <div><label for="p-delp">Delperioder (veckor)</label><input id="p-delp" data-s="delperioder" data-t="lista" value="${esc((i.delperioder || []).join(", "))}" placeholder="hela perioden"></div>
        <div><label for="p-tid">Sekunder per optimeringssteg</label><input id="p-tid" type="number" min="1" max="60" data-s="losare.tid_per_steg_s" data-t="tal" value="${i.losare?.tid_per_steg_s ?? 15}"></div>
      </div>
      <p style="margin-top:12px"><label class="check"><input type="checkbox" data-s="cykliskt" data-t="check"${i.cykliskt !== false ? " checked" : ""}> Cykliskt: sista veckan följs av vecka 1 igen</label></p>
      <p class="dampad liten">Antalet pass blir ett heltal när perioden är en multipel av 4 veckor (med 4,75 pass per vecka). Vid till exempel 6 veckor anger du antal pass per person. Regler som dygnsvila och helger ändrar du under <a href="#/e/${st.enhet.id}/installningar">Regler</a>.</p>`;

    case "json": return `
      <p class="dampad liten">All indata som JSON, enligt docs/indata-schema.md.</p>
      <textarea id="json" spellcheck="false" aria-label="Indata som JSON">${esc(JSON.stringify(st.indata, null, 2))}</textarea>
      <p style="margin-top:8px"><button data-g="anvand-json">Använd JSON</button> <span id="json-fel" class="liten" style="color:var(--kritisk)"></span></p>`;
  }
  return "";
}

// ---------------------------------------------------------------- önskemål
function tomtOnsk() { return { person: st.indata.personal[0]?.id || "", typ: "ledig", dagar: [], veckor: "alla", krav: false, vikt: 1 }; }

function ritaOnskemal() {
  const lista = st.indata.onskemal || [];
  const varn = {};
  (st.kontroll?.onskemal || []).forEach(w => (varn[w.id] = w.varning));
  const text = st.kontroll?.onskemal_text || {};
  const o = st.redigeraOnsk;
  let h = `<p class="dampad liten">Önskemål vägs in efter behov, blocklängd, passlängd och rättvisa. Ett krav måste uppfyllas; går det inte blir schemat olösbart och förklaringen pekar ut kravet.</p>`;
  h += o ? ritaOnskForm(o.data, o.index) : `<p><button class="primar" data-g="nytt-onsk">+ Nytt önskemål</button></p>`;
  h += lista.length ? lista.map((x, n) => {
    const id = x.id || `O${n + 1}`;
    return `<div class="onsk"><div><div>${x.krav ? `<span class="niva niva-avtal">krav</span> ` : ""}${esc(text[id] || `${x.person} ${ONSKTYP[x.typ]}`)}</div>
      ${x.kommentar ? `<div class="dampad liten">${esc(x.kommentar)}</div>` : ""}
      ${varn[id] ? `<div class="varning">${esc(varn[id].replace(/^\S+ \(.*?\) /, ""))}</div>` : ""}</div>
      <div class="chips"><button class="liten" data-g="andra-onsk" data-n="${n}">Ändra</button><button class="liten fara" data-g="ta-bort-onsk" data-n="${n}" aria-label="Ta bort">×</button></div></div>`;
  }).join("") : `<p class="tom">Inga önskemål.</p>`;
  return h;
}

function ritaOnskForm(o, index) {
  const vv = Array.isArray(o.veckor) ? "vissa" : (o.veckor || "alla");
  const dagindex = Array.isArray(o.dagindex);
  return `<form class="formular" id="onsk-form">
    <div class="falt">
      <div><label for="o-person">Person</label><select id="o-person">${st.indata.personal.map(p => `<option${p.id === o.person ? " selected" : ""}>${esc(p.id)}</option>`).join("")}</select></div>
      <div><label for="o-typ">Önskemål</label><select id="o-typ">${Object.entries(ONSKTYP).map(([k, t]) => `<option value="${k}"${k === o.typ ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      <div id="o-varde-ruta"></div>
    </div>
    ${dagindex ? `<p class="dampad liten">Gäller enskilda dagar (dagindex ${esc(o.dagindex.join(", "))}). Ändra dem under Avancerat.</p>` : `
    <div><label>Dagar</label><div class="chips">${DAGAR.map(d => `<label><input type="checkbox" name="o-dag" value="${d}"${(o.dagar || []).includes(d) ? " checked" : ""}> ${d}</label>`).join("")}</div>
      <p class="dampad liten" style="margin:4px 0 0">Inga dagar valda betyder alla dagar.</p></div>
    <div class="falt">
      <div><label for="o-veckor">Veckor</label><select id="o-veckor">
        <option value="alla"${vv === "alla" ? " selected" : ""}>Alla veckor</option><option value="jämna"${vv === "jämna" ? " selected" : ""}>Jämna veckor</option>
        <option value="udda"${vv === "udda" ? " selected" : ""}>Udda veckor</option><option value="vissa"${vv === "vissa" ? " selected" : ""}>Vissa veckor</option></select></div>
      <div id="o-vissa"${vv === "vissa" ? "" : " hidden"}><label for="o-veckolista">Veckor i schemat (1, 3)</label><input id="o-veckolista" value="${Array.isArray(o.veckor) ? o.veckor.join(", ") : ""}"></div>
    </div>`}
    <div class="falt">
      <div><label>Hur viktigt</label><div class="chips">
        <label><input type="radio" name="o-krav" value="0"${o.krav ? "" : " checked"}> Önskemål</label>
        <label><input type="radio" name="o-krav" value="1"${o.krav ? " checked" : ""}> Krav</label></div></div>
      <div id="o-vikt-ruta"${o.krav ? " hidden" : ""}><label for="o-vikt">Vikt (1–10)</label><input id="o-vikt" type="number" min="1" max="10" value="${o.vikt || 1}"></div>
    </div>
    <div><label for="o-kommentar">Kommentar (valfri, utan personuppgifter)</label><input id="o-kommentar" value="${esc(o.kommentar || "")}"></div>
    <div class="chips"><button class="primar" type="submit">${index == null ? "Lägg till" : "Spara ändring"}</button><button type="button" data-g="avbryt-onsk">Avbryt</button></div>
  </form>`;
}

function kopplaOnskForm() {
  const f = $("#onsk-form");
  if (!f) return;
  const o = st.redigeraOnsk.data;
  const vardeRuta = () => {
    const typ = $("#o-typ").value, r = $("#o-varde-ruta");
    if (typ === "tidigast_start" || typ === "senast_slut")
      r.innerHTML = `<label for="o-varde">Klockslag</label><input id="o-varde" type="time" value="${esc(typeof o.varde === "string" && o.varde.includes(":") ? o.varde : typ === "tidigast_start" ? "08:00" : "14:00")}">`;
    else if (typ === "endast_dygnsdel")
      r.innerHTML = `<label for="o-varde">Dygnsdel</label><select id="o-varde">${Object.entries(DELAR).map(([k, t]) => `<option value="${k}"${k === o.varde ? " selected" : ""}>${t}</option>`).join("")}</select>`;
    else r.innerHTML = "";
  };
  vardeRuta();
  $("#o-typ").onchange = vardeRuta;
  if ($("#o-veckor")) $("#o-veckor").onchange = () => ($("#o-vissa").hidden = $("#o-veckor").value !== "vissa");
  f.querySelectorAll("[name=o-krav]").forEach(r => (r.onchange = () => ($("#o-vikt-ruta").hidden = f.querySelector("[name=o-krav]:checked").value === "1")));
  f.onsubmit = e => {
    e.preventDefault();
    const ny = { id: o.id || nyttOnskId(), person: $("#o-person").value, typ: $("#o-typ").value };
    if ($("#o-varde")) ny.varde = $("#o-varde").value;
    if (Array.isArray(o.dagindex)) ny.dagindex = o.dagindex;
    else {
      const dagar = [...f.querySelectorAll("[name=o-dag]:checked")].map(x => x.value);
      if (dagar.length && dagar.length < 7) ny.dagar = dagar;
      const vv = $("#o-veckor").value;
      if (vv === "vissa") {
        const l = $("#o-veckolista").value.split(/[,; ]+/).map(Number).filter(n => n > 0);
        if (!l.length) { meddela("Ange vilka veckor, till exempel 1, 3."); return; }
        ny.veckor = l;
      } else if (vv !== "alla") ny.veckor = vv;
    }
    ny.krav = f.querySelector("[name=o-krav]:checked").value === "1";
    if (!ny.krav) ny.vikt = Math.max(1, Math.min(10, parseInt($("#o-vikt").value) || 1));
    const k = $("#o-kommentar").value.trim(); if (k) ny.kommentar = k;
    st.indata.onskemal = st.indata.onskemal || [];
    if (st.redigeraOnsk.index == null) st.indata.onskemal.push(ny); else st.indata.onskemal[st.redigeraOnsk.index] = ny;
    st.redigeraOnsk = null;
    markeraAndrad(true);
  };
}

function nyttOnskId() {
  const ids = new Set((st.indata.onskemal || []).map(o => o.id));
  let n = 1; while (ids.has("O" + n)) n++;
  return "O" + n;
}

// ---------------------------------------------------------------- kontroll och körningslista
function kontrakteradTid(indata) {
  const ht = (indata.heltid_minuter_per_vecka || 2220) / 60;
  return indata.personal.reduce((s, p) => s + (p.grad ?? 1) * ((p.heltid_minuter_per_vecka || 0) / 60 || ht), 0);
}

function ritaKontroll() {
  const k = st.kontroll;
  if (!k) return `<h2>Kontroll</h2><p class="dampad liten"><span class="spinner"></span>Räknar …</p>`;
  if (k.natfel) return `<h2>Kontroll</h2><p class="dampad liten">${esc(k.natfel)}</p>`;
  let h = `<h2>Kontroll</h2>`;
  if (k.fel.length) return h + `<div class="banner dalig">${IKON.stopp}<div><strong>${k.fel.length === 1 ? "Ett fel" : k.fel.length + " fel"} att rätta</strong></div></div><ul class="punkter liten" style="margin-top:8px">${k.fel.map(f => `<li>${esc(f)}</li>`).join("")}</ul>`;
  const b = k.balans;
  const kt = kontrakteradTid(st.indata), ht = (st.indata.heltid_minuter_per_vecka || 2220) / 60, bud = st.indata.budget_timmar_vecka;
  h += `<div class="banner ${b.forvantade_vakanser ? "varn" : "ok"}">${b.forvantade_vakanser ? IKON.varning : IKON.ok}<div><strong>${b.forvantade_vakanser ? `Cirka ${vakText(b.forvantade_vakanser)}` : "Personalen räcker"}</strong><span class="liten">Bemanningsbalans före schemaläggningen</span></div></div>
    <div class="kpi" style="margin-top:10px"><div><b>${sv(kt, 1)} h</b><span>kontrakterat per vecka</span></div><div><b>${sv(kt / ht)}</b><span>årsarbetare</span></div>
    ${bud ? `<div class="${kt > bud + 0.05 ? "fel" : "bra"}"><b>${sv(bud - kt, 1)} h</b><span>${kt > bud + 0.05 ? "över" : "kvar av"} budget ${sv(bud, 1)} h</span></div>` : ""}</div>`;
  if (b.atgarder.length) h += `<h3>Förslag</h3><ul class="punkter liten">${b.atgarder.map(a => `<li>${esc(a)}</li>`).join("")}</ul>`;
  const und = st.indata.personal.filter(p => p.helgfrekvens && p.helgfrekvens !== "2/4");
  const enbart = st.indata.personal.filter(p => p.dygnsdelar && p.dygnsdelar.length === 1 && p.dygnsdelar[0] !== "natt");
  if (und.length || enbart.length) h += `<h3>Undantag</h3><ul class="punkter liten">${und.map(p => `<li>${esc(p.id)}: ${HELGER[p.helgfrekvens].toLowerCase()} helger</li>`).join("")}${enbart.map(p => `<li>${esc(p.id)}: bara ${DELAR[p.dygnsdelar[0]].toLowerCase()}</li>`).join("")}</ul>`;
  const avv = st.indata.avvikelser || [];
  if (avv.length) h += `<h3>Avvikelser från avtal eller låsta regler</h3><p class="liten" style="color:var(--varn)">${avv.map(a => esc(regelnamn(a))).join(", ")}. <a href="#/e/${st.enhet.id}/installningar">Visa</a></p>`;
  if (k.onskemal.length) h += `<h3>Önskemål</h3><ul class="punkter liten">${k.onskemal.map(w => `<li>${esc(w.varning)}</li>`).join("")}</ul>`;
  b.varningar.forEach(v => (h += `<p class="dampad liten">${esc(v)}</p>`));
  return h;
}

function ritaKorningar() {
  const l = st.korningar;
  let h = `<div class="rubrikrad"><h2 style="margin:0">Körningar</h2>${st.valdaKorningar.size >= 2 ? `<button class="liten" data-g="jamfor">Jämför ${st.valdaKorningar.size}</button>` : ""}</div>`;
  if (!l.length) return h + `<p class="dampad liten" style="margin-top:8px">Inga körningar än. Tryck på Lägg schema.</p>`;
  h += `<div style="margin-top:8px">` + l.map(k => {
    const s = statusFor(k);
    return `<div class="onsk"><label class="check" style="align-items:flex-start"><input type="checkbox" data-g="valj-korning" data-id="${k.id}"${st.valdaKorningar.has(k.id) ? " checked" : ""} aria-label="Välj för jämförelse">
      <span><a href="#/e/${st.enhet.id}/schema/${k.id}">${esc(k.namn)}</a><br><span class="status ${s.klass}">${s.text}</span> <span class="dampad liten">${datum(k.skapad)}</span></span></label></div>`;
  }).join("") + `</div>`;
  if (l.length >= 2) h += `<p class="dampad liten">Kryssa i två eller fler för att jämföra.</p>`;
  return h;
}

function statusFor(k) {
  if (k.status === "i kö" || k.status === "kör") return { klass: "kor", text: k.steg || "Kör" };
  if (k.status === "fel") return { klass: "dalig", text: "Fel" };
  if (k.losning !== "OK") return { klass: "dalig", text: k.losning === "INFEASIBLE" ? "Går inte att lägga" : "Inget schema" };
  const v = (k.kpi?.vakanta_pass || 0) + (k.kpi?.vakanta_tidpunkter || 0);
  if (k.brott) return { klass: "dalig", text: `${k.brott} brott` };
  return v ? { klass: "kor", text: vakText(v) } : { klass: "ok", text: "Klart" };
}

async function uppdateraKorningar() {
  if (!st.enhet) return false;
  st.korningar = await api("GET", `enheter/${st.enhet.id}/korningar`);
  const r = $("#korningar"); if (r) r.innerHTML = ritaKorningar();
  return st.korningar.some(k => k.status === "i kö" || k.status === "kör");
}

let kontrollTimer = null;
function kontrollera() {
  clearTimeout(kontrollTimer);
  kontrollTimer = setTimeout(async () => {
    try { st.kontroll = await api("POST", "kontrollera", { indata: st.indata }); }
    catch (e) { st.kontroll = { natfel: e.message }; }
    const r = $("#kontroll"); if (r) r.innerHTML = ritaKontroll();
    if ((st.vy === "indata" || st.vy === "medarbetare") && st.flik === "onskemal" && !st.redigeraOnsk && $("#flik")) $("#flik").innerHTML = ritaFlik();
  }, 400);
}

function markeraAndrad(rita) {
  st.andrad = true;
  uppdateraSparaknapp();
  if (rita && $("#flik")) { $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); uppdateraFlikrubriker(); }
  if (rita && st.vy === "installningar") ritaInstallningar();
  kontrollera();
  clearTimeout(markeraAndrad.t);
  markeraAndrad.t = setTimeout(spara, 1200);
}

function uppdateraFlikrubriker() {
  document.querySelectorAll("[data-flik=personal]").forEach(b => (b.textContent = `Personal (${st.indata.personal.length})`));
  document.querySelectorAll("[data-flik=onskemal]").forEach(b => (b.textContent = `Önskemål (${(st.indata.onskemal || []).length})`));
}

function uppdateraSparaknapp() {
  const b = $("#spara"); if (!b) return;
  b.disabled = !st.andrad; b.textContent = st.andrad ? "Spara" : "Sparat";
}

async function spara() {
  clearTimeout(markeraAndrad.t);
  if (!st.andrad || !st.enhet) return true;
  st.indata.enhet = st.enhet.namn;
  try {
    await api("PUT", "enheter/" + st.enhet.id, { namn: st.enhet.namn, indata: st.indata });
    st.andrad = false; uppdateraSparaknapp();
    return true;
  } catch (e) { meddela("Kunde inte spara: " + e.message); return false; }
}

function sattVarde(sokv, varde) {
  const delar = sokv.split(".");
  let o = st.indata;
  for (let n = 0; n < delar.length - 1; n++) {
    const k = /^\d+$/.test(delar[n]) ? +delar[n] : delar[n];
    if (o[k] == null) o[k] = {};
    o = o[k];
  }
  const sista = delar.at(-1);
  if (varde === undefined) delete o[sista]; else o[sista] = varde;
}

function tolka(el) {
  const v = el.value.trim();
  switch (el.dataset.t) {
    case "procent": return v === "" ? undefined : Math.round(parseFloat(v.replace(",", "."))) / 100;
    case "heltal": return parseInt(v) || 0;
    case "tal": return v === "" ? undefined : parseFloat(v.replace(",", "."));
    case "valfritt-tal": return v === "" ? undefined : parseInt(v);
    case "check": return el.checked;
    case "valfri": return v || undefined;
    case "dygnsdelar": return v === "morgon,kvall" ? undefined : v.split(",");
    case "lista": { const l = v.split(/[,; ]+/).map(Number).filter(n => n > 0); return l.length ? l : undefined; }
    case "pass": { if (!v) return undefined; const l = v.split(/[,; ]+/).map(Number).filter(n => !isNaN(n)); return l.length > 1 ? l : l[0]; }
    default: return v;
  }
}

function byggTidpunkter(tp) {
  const ut = {};
  tp.forEach(({ k, tid, antal }) => (ut[k] = ut[k] || []).push({ tid, antal }));
  if (Object.keys(ut).length) st.indata.tidpunkter = ut; else delete st.indata.tidpunkter;
}
function tidpunktLista() {
  const tp = []; Object.entries(st.indata.tidpunkter || {}).forEach(([k, l]) => l.forEach(t => tp.push({ k, ...t }))); return tp;
}

document.addEventListener("input", e => {
  const el = e.target;
  if (!st.indata) return;
  if (el.closest("#regler")) return regelInput(el);
  if (!el.closest("#flik")) return;
  if (el.dataset.s) {
    sattVarde(el.dataset.s, tolka(el));
    markeraAndrad(/\.(helgfrekvens|dygnsdelar)$/.test(el.dataset.s));
  } else if (el.dataset.tp !== undefined) {
    const tp = tidpunktLista(), t = tp[+el.dataset.tp];
    t[el.dataset.f] = el.dataset.f === "antal" ? parseInt(el.value) || 0 : el.value;
    byggTidpunkter(tp);
    markeraAndrad(el.dataset.f === "k");
  }
});
document.addEventListener("change", e => {
  if (e.target.dataset.g === "byt-korning") { location.hash = `#/e/${st.enhet.id}/${e.target.dataset.vy}/${e.target.value}`; return; }
  if (e.target.tagName === "SELECT" && (e.target.closest("#flik") || e.target.closest("#regler")) && (e.target.dataset.s || e.target.dataset.r || e.target.dataset.tp !== undefined))
    e.target.dispatchEvent(new Event("input", { bubbles: true }));
});

async function laggSchema() {
  if (!(await spara())) return;
  try {
    const { id } = await api("POST", `enheter/${st.enhet.id}/korningar`, {});
    st.korning = null;
    location.hash = `#/e/${st.enhet.id}/schema/${id}`;
  } catch (e) {
    if (e.status === 422) {
      meddela("Rätta felen i kontrollen först.");
      if (st.vy !== "indata") location.hash = `#/e/${st.enhet.id}/indata`;
      st.kontroll = { fel: e.data.fel, onskemal: [] }; const r = $("#kontroll"); if (r) r.innerHTML = ritaKontroll();
    } else meddela(e.message);
  }
}

// ---------------------------------------------------------------- vy: inställningar (regler)
// Alla regler går att ändra. Avtal, lag och varannan helg är låsta tills avvikelsen bekräftas.
const REGLER = [
  { grupp: "Avtal", k: "dygnsvila_minuter", namn: "Dygnsvila", beskr: "Sammanhängande vila per dygn, räknat från dygnsbrytet.", ab: "AB 25 § 13 mom. 8 och mom. 5", niva: "avtal", typ: "hård", falt: "timmar", std: 660, min: 540, last: true,
    avvikelse: "Lokalt kollektivavtal om kortare dygnsvila är inte möjligt (AB 25 § 13 mom. 10). Dygnsvilan kan bara förkortas till lägst 9 timmar i undantagsfall: det ska finnas särskilda skäl i en verksamhet med ansvar för liv, hälsa och säkerhet, bedömningen ska vara motiverad, arbetstagaren har rätt till kompenserande vila i samband med nästa dygnsvila, och MBL-förhandling krävs (mom. 8 a och mom. 5). Systemet lägger inte in den kompenserande vilan; den måste planeras.",
    bekrafta: "Vi har särskilda skäl enligt AB 25 § 13 mom. 8 a, har MBL-förhandlat och planerar kompenserande vila" },
  { grupp: "Avtal", k: "veckovila_minuter", namn: "Veckovila", beskr: "Sammanhängande vila per vecka, räknat från måndag 00:00.", ab: "ATL 14 §, AB 25 § 13 mom. 7 h och mom. 10 e", niva: "avtal", typ: "hård", falt: "timmar", std: 2160, last: true,
    avvikelse: "Avvikelse från veckovilan kräver lokalt kollektivavtal (AB 25 § 13 mom. 10 e). Vid tillfällig avvikelse ska veckovilan vara minst 24 timmar (mom. 7 h).",
    bekrafta: "Vi har ett lokalt kollektivavtal om avvikelse från veckovilan (AB 25 § 13 mom. 10 e)" },
  { grupp: "Lag", k: "rast_grans_minuter", namn: "Rast efter högst", beskr: "Längsta arbetstid utan rast (arbetstidslagen).", ab: "ATL 15 §", niva: "lag", typ: "hård", falt: "timmar", std: 300, last: true,
    avvikelse: "Arbetstidslagen tillåter avvikelse bara genom kollektivavtal (AB 25 § 13 mom. 10 f gäller förläggning av raster). Vid nattarbete får rast bytas mot måltidsuppehåll (mom. 7 a).",
    bekrafta: "Vi har ett kollektivavtal som tillåter avvikelsen" },
  { grupp: "Lag", k: "rast_minuter", namn: "Rastens längd", beskr: "Minuter rast i pass över gränsen.", ab: "ATL 15 §", niva: "lag", typ: "hård", falt: "minuter", std: 30, last: true,
    avvikelse: "Arbetstidslagen tillåter avvikelse bara genom kollektivavtal.", bekrafta: "Vi har ett kollektivavtal som tillåter avvikelsen" },
  { grupp: "Lokala regler", k: "helgfrekvens", namn: "Helgfrekvens för enheten", beskr: "Varannan helg är verksamhetens beslut, inte AB. Undantag per person görs under Personal.", niva: "lokal regel", typ: "hård", falt: "val", val: HELGER, std: "2/4", last: true },
  { grupp: "Lokala regler", k: "hel_helg", namn: "Arbetshelg är både lördag och söndag", niva: "lokal regel", typ: "hård", falt: "check", std: true },
  { grupp: "Lokala regler", k: "ingen_fredagskvall_fore_ledig_helg", namn: "Ingen fredagskväll före ledig helg", niva: "lokal regel", typ: "hård", falt: "check", std: true },
  { grupp: "Lokala regler", k: "pass_per_vecka", namn: "Pass per vecka, dag och kväll", niva: "lokal regel", typ: "hård", falt: "tal", steg: 0.25, std: 4.75 },
  { grupp: "Lokala regler", k: "min_passlangd_minuter", namn: "Minsta passlängd", beskr: "Blir passen kortare än så (vid låg sysselsättningsgrad) tas pass bort i stället. 0 stänger av.", niva: "lokal regel", typ: "hård", falt: "timmar", std: 300 },
  { grupp: "Lokala regler", k: "block_min", namn: "Minst antal arbetsdagar i följd", niva: "lokal regel", typ: "hård", falt: "tal", steg: 1, std: 2 },
  { grupp: "Lokala regler", k: "block_max", namn: "Högst antal arbetsdagar i följd", niva: "lokal regel", typ: "hård", falt: "tal", steg: 1, std: 5 },
  { grupp: "Principer", k: "block_rekommenderat", namn: "Helst högst antal dagar i följd", niva: "princip", typ: "mjuk", falt: "tal", steg: 1, std: 4 },
  { grupp: "Principer", k: "spridning_kvallar", namn: "Blandning av morgon och kväll varje vecka", beskr: "För den som arbetar både morgon och kväll. Mjuk väger in efter rättvisan, Stark väger tyngst efter vakanserna.", niva: "princip", typ: "mjuk", falt: "val", val: { av: "Av", mjuk: "Mjuk", stark: "Stark" }, std: "mjuk" },
  { grupp: "Principer", k: "spridning_tolerans", namn: "Hur jämn blandningen ska vara", niva: "princip", typ: "mjuk", falt: "val", tal: true, val: { 1: "Båda sorterna varje vecka", 0: "Nästan lika många av varje" }, std: 1 },
  { grupp: "Principer", k: "jamn_bemanning", namn: "Jämn bemanning mellan dag och kväll", beskr: "Det som blir över eller saknas fördelas efter behovet, jämnt mellan dag- och kvällspass och över veckorna, i stället för att allt hamnar på samma pass.", niva: "princip", typ: "mjuk", falt: "val", val: { av: "Av", mjuk: "På" }, std: "mjuk" },
  { grupp: "Principer", k: "morgon_start", namn: "Morgonpass börjar", niva: "princip", typ: "hård", falt: "tid", std: "07:00" },
  { grupp: "Principer", k: "kvall_slut", namn: "Kvällspass slutar", niva: "princip", typ: "hård", falt: "tid", std: "22:00" },
  { grupp: "Principer", k: "kant_fran", namn: "Passbyte tidigast", niva: "princip", typ: "hård", falt: "tid", std: "12:00" },
  { grupp: "Principer", k: "kant_till", namn: "Passbyte senast", niva: "princip", typ: "hård", falt: "tid", std: "18:00" },
  { grupp: "Kontrakt", k: "tolerans_minuter", namn: "Tolerans för arbetstid", beskr: "Hur många minuter arbetstiden får avvika från kontraktet över perioden.", niva: "kontrakt", typ: "hård", falt: "minuter", std: 60 },
];
const regelnamn = k => (REGLER.find(r => r.k === k) || {}).namn || k;
function regel(k) { return st.indata.regler?.[k] ?? REGLER.find(r => r.k === k).std; }

async function visaInstallningar(id) {
  st.vy = "installningar";
  await laddaEnhet(id);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Inställningar"]]);
  ritaInstallningar();
}

function ritaInstallningar() {
  const r = st.indata.regler || {}, avv = new Set(st.indata.avvikelser || []);
  const grupper = [...new Set(REGLER.map(x => x.grupp))];
  const rad = R => {
    const v = r[R.k] ?? R.std, andrad = r[R.k] !== undefined && r[R.k] !== R.std, last = R.last && !avv.has(R.k);
    let falt;
    const visa = R.falt === "timmar" ? sv(v / 60, 1) + " h" : R.falt === "minuter" ? v + " min" : R.falt === "val" ? R.val[v] : v;
    if (last) falt = `<span class="lat">${esc(visa)}</span><button class="liten" data-g="las-upp" data-k="${R.k}" aria-label="Lås upp ${R.namn}">${IKON.las} Lås upp</button>`;
    else if (R.falt === "check") falt = `<label class="check"><input type="checkbox" data-r="${R.k}" data-t="check"${v ? " checked" : ""}> ${v ? "På" : "Av"}</label>`;
    else if (R.falt === "val") falt = `<select data-r="${R.k}">${Object.entries(R.val).map(([a, t]) => `<option value="${a}"${String(a) === String(v) ? " selected" : ""}>${t}</option>`).join("")}</select>`;
    else if (R.falt === "tid") falt = `<input type="time" data-r="${R.k}" value="${esc(v)}">`;
    else if (R.falt === "timmar") falt = `<input type="number" inputmode="decimal" step="0.5" min="${(R.min || 0) / 60}" data-r="${R.k}" data-t="timmar" value="${v / 60}" aria-label="${R.namn} i timmar"> <span class="dampad">h</span>`;
    else if (R.falt === "minuter") falt = `<input type="number" inputmode="numeric" step="5" min="0" data-r="${R.k}" data-t="tal" value="${v}" aria-label="${R.namn} i minuter"> <span class="dampad">min</span>`;
    else falt = `<input type="number" inputmode="decimal" step="${R.steg}" data-r="${R.k}" data-t="tal" value="${v}">`;
    const oppen = st.oppnaRegel === R.k && last;
    return `<div class="regel"><div><div class="namn">${R.namn}</div>${R.beskr ? `<div class="beskr">${R.beskr}</div>` : ""}${R.ab ? `<div class="beskr"><b>${R.ab}</b></div>` : ""}
        <div class="chips" style="margin-top:4px"><span class="niva ${nk(R.niva)}">${R.niva}</span><span class="niva">${R.typ}</span>
        ${avv.has(R.k) ? `<span class="niva avviker">${IKON.olast.replace("<svg", '<svg width="11" height="11"')} upplåst</span>` : ""}
        ${andrad ? `<span class="niva avviker">avviker från ${R.falt === "timmar" ? sv(R.std / 60, 1) + " h" : R.falt === "val" ? R.val[R.std] : R.std === true ? "på" : R.std === false ? "av" : R.std}</span> <button class="lank liten" data-g="aterstall-regel" data-k="${R.k}">Återställ</button>` : ""}
        ${avv.has(R.k) && !andrad ? `<button class="lank liten" data-g="las-igen" data-k="${R.k}">Lås igen</button>` : ""}</div></div>
      <div class="varde">${falt}</div>
      ${oppen ? `<div class="lasupp"><div><b>Avvikelse från ${R.niva === "lag" ? "lagen" : R.niva === "avtal" ? "avtalet" : "verksamhetens beslut"}.</b> ${R.avvikelse || "Ändringen gäller hela enheten."} Avvikelsen syns på alla scheman från enheten.</div>
        <label class="check"><input type="checkbox" id="bekrafta"> ${R.bekrafta || "Vi har ett lokalt beslut som tillåter avvikelsen"}</label>
        <div class="chips"><button class="primar liten" data-g="bekrafta-upplasning" data-k="${R.k}">Lås upp</button><button class="liten" data-g="avbryt-upplasning">Avbryt</button></div></div>` : ""}
    </div>`;
  };
  const np = (st.indata.nattpass && st.indata.nattpass[0]) || { start: "21:45", slut: "07:15" };
  const IF = [["regler", "Regler"], ["period", "Period, budget och kostnad"], ["json", "Avancerat"]];
  const iflik = st.iflik || "regler";
  const flikrad = `<div class="flikar" role="tablist" style="margin-top:14px">${IF.map(([k, t]) => `<button role="tab" data-g="iflik" data-f="${k}" aria-selected="${iflik === k}">${t}</button>`).join("")}</div>`;
  if (iflik !== "regler") {
    st.flik = iflik;
    vy().innerHTML = `<section class="kort"><h1>Inställningar</h1>${flikrad}</section><section class="kort"><div id="flik">${ritaFlik()}</div></section>`;
    return;
  }
  vy().innerHTML = `
    <section class="kort"><h1>Inställningar</h1>${flikrad}
      <p class="dampad" style="margin:12px 0 0">Alla regler går att ändra. Regler från avtal, lag och varannan helg är låsta: lås upp dem bara om ni har ett lokalt avtal eller beslut, och avvikelsen syns då på alla scheman. Behovet är alltid mjukt: hellre en vakans än ett regelbrott.</p></section>
    <div id="regler" class="tva">
      ${grupper.map(g => `<section class="kort"><h2>${g}</h2><div class="regelgrupp">${REGLER.filter(x => x.grupp === g).map(rad).join("")}
        ${g === "Kontrakt" ? `<div class="regel"><div><div class="namn">Heltid per vecka</div><div class="chips" style="margin-top:4px"><span class="niva">kontrakt</span></div></div>
          <div class="varde"><input type="number" step="0.25" data-heltid value="${(st.indata.heltid_minuter_per_vecka ?? 2220) / 60}" aria-label="Heltid i timmar"> <span class="dampad">h</span></div></div>` : ""}
        ${g === "Principer" ? `<div class="regel"><div><div class="namn">Nattpass</div><div class="chips" style="margin-top:4px"><span class="niva">princip</span></div></div>
          <div class="varde"><input type="time" data-natt="start" value="${esc(np.start)}" aria-label="Nattpass börjar"><input type="time" data-natt="slut" value="${esc(np.slut)}" aria-label="Nattpass slutar"></div></div>` : ""}
        </div></section>`).join("")}
    </div>`;
}

function regelInput(el) {
  if (el.id === "bekrafta") return;
  if (el.dataset.heltid !== undefined) {
    const h = parseFloat(el.value.replace(",", ".")); if (h > 0) { st.indata.heltid_minuter_per_vecka = Math.round(h * 60); markeraAndrad(false); } return;
  }
  if (el.dataset.natt) {
    const np = (st.indata.nattpass && st.indata.nattpass[0]) || { id: "N", start: "21:45", slut: "07:15", maltidsuppehall: true };
    np[el.dataset.natt] = el.value; st.indata.nattpass = [np]; markeraAndrad(false); return;
  }
  if (!el.dataset.r) return;
  const R = REGLER.find(r => r.k === el.dataset.r);
  st.indata.regler = st.indata.regler || {};
  let v = el.dataset.t === "check" ? el.checked : el.dataset.t === "tal" || R.tal ? parseFloat(el.value.replace(",", ".")) : el.dataset.t === "timmar" ? Math.round(parseFloat(el.value.replace(",", ".")) * 60) : el.value;
  if (v === R.std || (typeof v === "number" && isNaN(v))) delete st.indata.regler[R.k]; else st.indata.regler[R.k] = v;
  if (!Object.keys(st.indata.regler).length) delete st.indata.regler;
  markeraAndrad(el.dataset.t === "check" || R.falt === "val");
}

// ---------------------------------------------------------------- klick
// startguiden (guide.js)
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-guide]"); if (!el) return;
  const g = st.guide, val = el.dataset.guide;
  try {
    switch (val) {
      case "ny": st.guide = GUIDE.ny(); return visaEnheter();
      case "exempel": return $("#exempel")?.scrollIntoView({ behavior: "smooth" });
      case "enheter": return $("#mina-enheter")?.scrollIntoView({ behavior: "smooth" });
      case "ai": {
        const { id } = await api("POST", "enheter", { namn: "Ny enhet", indata: GUIDE.tomIndata("Ny enhet") });
        st.enhet = null; st.enhetLista = null; st.oppnaAssistent = true; location.hash = `#/e/${id}/medarbetare`; return;
      }
      case "avbryt": st.guide = null; return visaEnheter();
      case "tillbaka": g.steg--; return visaEnheter();
      case "nasta": { const fel = GUIDE.kontrollera(g); if (fel) return meddela(fel); g.steg++; window.scrollTo(0, 0); return visaEnheter(); }
      case "satt": GUIDE.satt(g, el.dataset.falt, el.dataset.varde); return visaEnheter();
      case "minsta": { const r = GUIDE.berakna(g); g.antalDag = Math.max(g.antalDag, r.minDag); g.antalNatt = Math.max(g.antalNatt, r.minNatt); return visaEnheter(); }
      case "skapa": case "skapa-ai": case "skapa-manuellt": {
        const { id } = await api("POST", "enheter", { namn: g.namn || "Ny enhet", indata: GUIDE.indata(g) });
        st.guide = null; st.enhet = null; st.enhetLista = null;
        if (val === "skapa-ai") { await laddaEnhet(id); await laggSchema(); }
        else if (val === "skapa-manuellt") { const k = await api("POST", `enheter/${id}/manuell`); st.startaRedigering = true; location.hash = `#/e/${id}/schema/${k.id}`; }
        else location.hash = `#/e/${id}/oversikt`;
        meddela("Enheten är skapad."); return;
      }
    }
  } catch (err) { meddela(err.message); }
});
document.addEventListener("change", e => { if (st.guide && e.target.closest(".guide") && GUIDE.las(st.guide, e.target)) visaEnheter().then(() => document.getElementById(e.target.id)?.focus()); });
document.addEventListener("input", e => { if (st.guide && e.target.closest(".guide")) GUIDE.las(st.guide, e.target); });

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-g]");
  if (!el) return;
  const g = el.dataset.g;
  try {
    switch (g) {
      case "logga-ut": await api("POST", "logga-ut"); visaInloggning(); break;
      case "ny-enhet": { st.guide = GUIDE.ny(); location.hash = "#/"; visaEnheter(); break; }
      case "ny-enhet-tom": {
        const { id } = await api("POST", "enheter", { namn: "Ny enhet", indata: NY_INDATA() });
        st.enhet = null; st.enhetLista = null; location.hash = `#/e/${id}/medarbetare`; break;
      }
      case "fran-exempel": {
        const x = st.exempel[+el.dataset.i];
        const { id } = await api("POST", "enheter", { namn: x.namn, indata: x.indata });
        st.enhet = null; st.enhetLista = null; location.hash = `#/e/${id}/oversikt`; break;
      }
      case "kopiera": {
        const e2 = await api("GET", "enheter/" + el.dataset.id);
        await api("POST", "enheter", { namn: e2.namn + " (kopia)", indata: e2.indata });
        meddela("Kopia skapad. Pröva ändringar i den och jämför sedan körningarna."); visaEnheter(); break;
      }
      case "ta-bort-enhet":
        if (el.dataset.bekrafta !== "1") { el.dataset.bekrafta = "1"; el.textContent = "Säker?"; setTimeout(() => { el.dataset.bekrafta = ""; el.textContent = "Ta bort"; }, 4000); return; }
        await api("DELETE", "enheter/" + el.dataset.id); meddela(`${el.dataset.namn} är borttagen.`); visaEnheter(); break;
      case "iflik": st.iflik = el.dataset.f; ritaInstallningar(); break;
      case "mflik":
        st.flik = el.dataset.f; st.redigeraOnsk = null;
        document.querySelectorAll("[data-g=mflik]").forEach(b => b.setAttribute("aria-selected", b === el));
        $("#flik").innerHTML = ritaFlik(); history.replaceState(null, "", `#/e/${st.enhet.id}/medarbetare?flik=${st.flik}`); break;
      case "flik":
        st.flik = el.dataset.flik; st.redigeraOnsk = null;
        document.querySelectorAll("[data-g=flik]").forEach(b => b.setAttribute("aria-selected", b === el));
        $("#flik").innerHTML = ritaFlik(); history.replaceState(null, "", `#/e/${st.enhet.id}/indata?flik=${st.flik}`); break;
      case "lagg-schema": await laggSchema(); break;
      case "ny-person": {
        const natt = el.dataset.natt === "1", ids = new Set(st.indata.personal.map(p => p.id));
        let n = st.indata.personal.length + 1; const pre = natt ? "N" : "P"; while (ids.has(pre + n)) n++;
        st.indata.personal.push(natt ? { id: pre + n, grad: 1, dygnsdelar: ["natt"] } : { id: pre + n, grad: 0.75 });
        markeraAndrad(true); break;
      }
      case "ta-bort-person": {
        const p = st.indata.personal[+el.dataset.n];
        if ((st.indata.onskemal || []).some(o => o.person === p.id)) { meddela(`${p.id} har önskemål. Ta bort dem först.`); return; }
        st.indata.personal.splice(+el.dataset.n, 1); markeraAndrad(true); break;
      }
      case "ny-behovsrad": {
        const k = $("#ny-behovsdag").value; if (!k) return;
        const kopia = DAGAR.indexOf(k) >= 5 || k === "helg" ? st.indata.behov.helg : st.indata.behov.vardag;
        st.indata.behov[k] = { ...(kopia || { morgon: 0, kvall: 0, natt: 0 }) }; markeraAndrad(true); break;
      }
      case "ta-bort-behov": delete st.indata.behov[el.dataset.k]; markeraAndrad(true); break;
      case "ny-tp": { const tp = tidpunktLista(); tp.push({ k: "vardag", tid: "14:00", antal: 3 }); byggTidpunkter(tp); markeraAndrad(true); break; }
      case "ta-bort-tp": { const tp = tidpunktLista(); tp.splice(+el.dataset.n, 1); byggTidpunkter(tp); markeraAndrad(true); break; }
      case "las-upp": st.oppnaRegel = el.dataset.k; ritaInstallningar(); break;
      case "avbryt-upplasning": st.oppnaRegel = null; ritaInstallningar(); break;
      case "bekrafta-upplasning":
        if (!$("#bekrafta").checked) { meddela("Kryssa i rutan för att bekräfta."); return; }
        st.indata.avvikelser = [...new Set([...(st.indata.avvikelser || []), el.dataset.k])];
        st.oppnaRegel = null; markeraAndrad(true); meddela(`${regelnamn(el.dataset.k)} är upplåst.`); break;
      case "las-igen":
        st.indata.avvikelser = (st.indata.avvikelser || []).filter(a => a !== el.dataset.k);
        if (!st.indata.avvikelser.length) delete st.indata.avvikelser;
        markeraAndrad(true); break;
      case "aterstall-regel":
        delete st.indata.regler[el.dataset.k]; if (!Object.keys(st.indata.regler).length) delete st.indata.regler;
        markeraAndrad(true); break;
      case "nytt-onsk":
        if (!st.indata.personal.length) { meddela("Lägg till personal först."); return; }
        st.redigeraOnsk = { index: null, data: tomtOnsk() }; $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); $("#o-person").focus(); break;
      case "andra-onsk": st.redigeraOnsk = { index: +el.dataset.n, data: structuredClone(st.indata.onskemal[+el.dataset.n]) }; $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); break;
      case "avbryt-onsk": st.redigeraOnsk = null; $("#flik").innerHTML = ritaFlik(); break;
      case "ta-bort-onsk": st.indata.onskemal.splice(+el.dataset.n, 1); markeraAndrad(true); break;
      case "anvand-json":
        try { st.indata = JSON.parse($("#json").value); $("#json-fel").textContent = ""; markeraAndrad(true); meddela("JSON används."); }
        catch (err) { $("#json-fel").textContent = "Ogiltig JSON: " + err.message; }
        break;
      case "valj-korning": {
        const id = +el.dataset.id; el.checked ? st.valdaKorningar.add(id) : st.valdaKorningar.delete(id);
        $("#korningar").innerHTML = ritaKorningar(); break;
      }
      case "jamfor": location.hash = `#/jamfor/${[...st.valdaKorningar].sort((a, b) => a - b).join(",")}`; break;
      default: if (typeof vyKlick === "function") await vyKlick(g, el);
    }
  } catch (err) { if (err.message !== "Logga in först.") meddela(err.message); }
});

// ---------------------------------------------------------------- pollning och routing
function startaPollning(steg) {
  stoppaPollning();
  const kor = async () => {
    try { if (await steg()) st.pollning = setTimeout(kor, 1500); else st.pollning = null; }
    catch { st.pollning = setTimeout(kor, 4000); }
  };
  st.pollning = setTimeout(kor, 1200);
}
function stoppaPollning() { clearTimeout(st.pollning); st.pollning = null; }

async function route() {
  stoppaPollning();
  $("#tips").classList.remove("syns");
  const [sokv, fraga] = location.hash.replace(/^#/, "").split("?");
  const d = sokv.split("/").filter(Boolean), q = new URLSearchParams(fraga);
  try {
    const s = await api("GET", "session");
    if (!s.inloggad) return visaInloggning();
    kravsInloggning = s.kravs;
    if (st.enhet && st.andrad && !(d[0] === "e" && +d[1] === st.enhet.id)) await spara();
    if (!st.enhetLista) { try { st.enhetLista = await api("GET", "enheter"); } catch { st.enhetLista = []; } }
    if (d[0] === "e") {
      const id = +d[1], vyn = d[2] || "oversikt", kid = d[3] ? +d[3] : null;
      if (vyn === "indata") await visaEnhet(id, q.get("flik"));
      else if (vyn === "installningar") await visaInstallningar(id);
      else if (vyn === "analys") await visaAnalys(id);
      else if (vyn === "oversikt") await visaOversikt(id);
      else if (vyn === "behov") await visaBehov(id);
      else if (vyn === "medarbetare") await visaMedarbetare(id, kid, q);
      else if (vyn === "nyckeltal") await visaNyckeltal(id, kid);
      else if (vyn === "regelkontroll") await visaRegelkontroll(id, kid);
      else if (vyn === "rapporter") await visaRapporter(id);
      else await visaKorningsvy(id, vyn, kid, q);
    } else if (d[0] === "jamfor") await visaJamfor(d[1].split(",").map(Number));
    else await visaEnheter();
    vy().focus({ preventScroll: true });
    if (st.oppnaAssistent && st.enhet && typeof oppnaAssistent === "function") { st.oppnaAssistent = false; oppnaAssistent(GUIDE.AI_START); }
  } catch (e) {
    if (e.message !== "Logga in först.") vy().innerHTML = `<section class="kort"><div class="banner dalig">${IKON.stopp}<div><strong>Något gick fel</strong>${esc(e.message)}</div></div><p style="margin-top:10px"><a href="#/">Till enheterna</a></p></section>`;
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => { if (st.andrad) { spara(); e.preventDefault(); } });
route();
