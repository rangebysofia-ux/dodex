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
const DELAR = { morgon: "Dag", kvall: "Kväll", natt: "Natt" };
const ARBETAR = { "morgon,kvall": "Dag och kväll", "morgon": "Bara morgon", "kvall": "Bara kväll", "natt": "Natt" };
const HELGER = { "2/4": "Varannan (2/4)", "1/4": "Var fjärde (1/4)", "3/4": "Tre av fyra (3/4)", "alla": "Alla", "ingen": "Inga" };
const ONSKTYP = { ledig: "Ledig", arbetar: "Arbetar", tidigast_start: "Börjar tidigast", senast_slut: "Slutar senast", endast_dygnsdel: "Bara dygnsdel" };
const DAGNYCKEL = { vardag: "Vardagar", helg: "Helg (lör–sön)", alla: "Alla dagar", "mån": "Måndag", "tis": "Tisdag", "ons": "Onsdag", "tor": "Torsdag", "fre": "Fredag", "lör": "Lördag", "sön": "Söndag" };

let loggaNr = 0;
// Urtavlan (DODEX grafiska profil): svart urtavla med guldring, minutstreck, timstreck (dubbelt vid 12) och visare.
// LOGGA_TEXT har DODEX och SCHEDULER på tavlan och används där logotypen är stor.
const LOGGA = () => { const id = "guld" + (++loggaNr); return `<svg viewBox="0 0 64 64" role="img" aria-label="Dodex"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc95"/><stop offset=".55" stop-color="#d2a64c"/><stop offset="1" stop-color="#9a6f22"/></linearGradient></defs><circle cx="32" cy="32" r="30.6" fill="#0d0c0a"/><circle cx="32" cy="32" r="29.6" fill="none" stroke="url(#${id})" stroke-width="2.2"/><circle cx="32" cy="32" r="26.9" fill="none" stroke="url(#${id})" stroke-width=".55" opacity=".85"/><path d="M34.66 6.74L34.77 5.65M37.28 7.16L37.51 6.08M39.85 7.84L40.19 6.8M42.33 8.8L42.78 7.79M46.93 11.45L47.58 10.56M49 13.12L49.73 12.31M50.88 15L51.69 14.27M52.55 17.07L53.44 16.42M55.2 21.67L56.21 21.22M56.16 24.15L57.2 23.81M56.84 26.72L57.92 26.49M57.26 29.34L58.35 29.23M57.26 34.66L58.35 34.77M56.84 37.28L57.92 37.51M56.16 39.85L57.2 40.19M55.2 42.33L56.21 42.78M52.55 46.93L53.44 47.58M50.88 49L51.69 49.73M49 50.88L49.73 51.69M46.93 52.55L47.58 53.44M42.33 55.2L42.78 56.21M39.85 56.16L40.19 57.2M37.28 56.84L37.51 57.92M34.66 57.26L34.77 58.35M29.34 57.26L29.23 58.35M26.72 56.84L26.49 57.92M24.15 56.16L23.81 57.2M21.67 55.2L21.22 56.21M17.07 52.55L16.42 53.44M15 50.88L14.27 51.69M13.12 49L12.31 49.73M11.45 46.93L10.56 47.58M8.8 42.33L7.79 42.78M7.84 39.85L6.8 40.19M7.16 37.28L6.08 37.51M6.74 34.66L5.65 34.77M6.74 29.34L5.65 29.23M7.16 26.72L6.08 26.49M7.84 24.15L6.8 23.81M8.8 21.67L7.79 21.22M11.45 17.07L10.56 16.42M13.12 15L12.31 14.27M15 13.12L14.27 12.31M17.07 11.45L16.42 10.56M21.67 8.8L21.22 7.79M24.15 7.84L23.81 6.8M26.72 7.16L26.49 6.08M29.34 6.74L29.23 5.65" stroke="url(#${id})" stroke-width=".45" stroke-linecap="round"/><path d="M30.75 12.6L30.75 7M33.25 12.6L33.25 7M42.6 13.64L44.5 10.35M50.36 21.4L53.65 19.5M51.4 32L57 32M50.36 42.6L53.65 44.5M42.6 50.36L44.5 53.65M32 51.4L32 57M21.4 50.36L19.5 53.65M13.64 42.6L10.35 44.5M12.6 32L7 32M13.64 21.4L10.35 19.5M21.4 13.64L19.5 10.35" stroke="url(#${id})" stroke-width="2.1" stroke-linecap="butt"/><path d="M32 32L24.55 27.7" stroke="url(#${id})" stroke-width="2.2" stroke-linecap="round"/><path d="M32 32L43.73 23.48" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><circle cx="32" cy="32" r="1.9" fill="#f0d58e"/></svg>`; };
const LOGGA_TEXT = () => { const id = "guld" + (++loggaNr); return `<svg viewBox="0 0 64 64" role="img" aria-label="Dodex Scheduler"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc95"/><stop offset=".55" stop-color="#d2a64c"/><stop offset="1" stop-color="#9a6f22"/></linearGradient></defs><circle cx="32" cy="32" r="30.6" fill="#0d0c0a"/><circle cx="32" cy="32" r="29.6" fill="none" stroke="url(#${id})" stroke-width="2.2"/><circle cx="32" cy="32" r="26.9" fill="none" stroke="url(#${id})" stroke-width=".55" opacity=".85"/><path d="M34.66 6.74L34.77 5.65M37.28 7.16L37.51 6.08M39.85 7.84L40.19 6.8M42.33 8.8L42.78 7.79M46.93 11.45L47.58 10.56M49 13.12L49.73 12.31M50.88 15L51.69 14.27M52.55 17.07L53.44 16.42M55.2 21.67L56.21 21.22M56.16 24.15L57.2 23.81M56.84 26.72L57.92 26.49M57.26 29.34L58.35 29.23M57.26 34.66L58.35 34.77M56.84 37.28L57.92 37.51M56.16 39.85L57.2 40.19M55.2 42.33L56.21 42.78M52.55 46.93L53.44 47.58M50.88 49L51.69 49.73M49 50.88L49.73 51.69M46.93 52.55L47.58 53.44M42.33 55.2L42.78 56.21M39.85 56.16L40.19 57.2M37.28 56.84L37.51 57.92M34.66 57.26L34.77 58.35M29.34 57.26L29.23 58.35M26.72 56.84L26.49 57.92M24.15 56.16L23.81 57.2M21.67 55.2L21.22 56.21M17.07 52.55L16.42 53.44M15 50.88L14.27 51.69M13.12 49L12.31 49.73M11.45 46.93L10.56 47.58M8.8 42.33L7.79 42.78M7.84 39.85L6.8 40.19M7.16 37.28L6.08 37.51M6.74 34.66L5.65 34.77M6.74 29.34L5.65 29.23M7.16 26.72L6.08 26.49M7.84 24.15L6.8 23.81M8.8 21.67L7.79 21.22M11.45 17.07L10.56 16.42M13.12 15L12.31 14.27M15 13.12L14.27 12.31M17.07 11.45L16.42 10.56M21.67 8.8L21.22 7.79M24.15 7.84L23.81 6.8M26.72 7.16L26.49 6.08M29.34 6.74L29.23 5.65" stroke="url(#${id})" stroke-width=".45" stroke-linecap="round"/><path d="M30.75 12.6L30.75 7M33.25 12.6L33.25 7M42.6 13.64L44.5 10.35M50.36 21.4L53.65 19.5M51.4 32L57 32M50.36 42.6L53.65 44.5M42.6 50.36L44.5 53.65M32 51.4L32 57M21.4 50.36L19.5 53.65M13.64 42.6L10.35 44.5M12.6 32L7 32M13.64 21.4L10.35 19.5M21.4 13.64L19.5 10.35" stroke="url(#${id})" stroke-width="1.9" stroke-linecap="butt"/><text x="32" y="22.2" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="5.2" letter-spacing=".55" fill="url(#${id})">DODEX</text><text x="32" y="44.2" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="2.3" letter-spacing=".55" fill="url(#${id})">SCHEDULER</text><path d="M28.6 45.6H35.4" stroke="url(#${id})" stroke-width=".3"/><path d="M32 32L24.55 27.7" stroke="url(#${id})" stroke-width="2.2" stroke-linecap="round"/><path d="M32 32L43.73 23.48" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round"/><circle cx="32" cy="32" r="1.9" fill="#f0d58e"/></svg>`; };
const loggaText = () => `${LOGGA()}<span><b>DODEX</b><small>Scheduler</small></span>`;

const IKON = {
  kalender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/></svg>',
  oversikt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  behov: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M17 8v6M14 11h6"/></svg>',
  stjarna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
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
  const KORT = { Schemaplanering: "Schema", Bemanningsbehov: "Behov", Bemanningsbalans: "Balans", "Analys och nyckeltal": "Nyckeltal", Regelkontroll: "Regler", Inställningar: "Inställn." };
  const lank = (vyer, ikon, text, href, av) => `<a class="post" href="${href}" aria-label="${text}"${vyer.includes(st.vy) ? ' aria-current="page"' : ""}${av ? ' aria-disabled="true" tabindex="-1"' : ""}>${IKON[ikon]}<span class="lang">${text}</span><span class="kortnamn">${KORT[text] || text}</span></a>`;
  const bas = e ? `#/e/${e.id}` : "#/", kk = k ? "/" + k : "";
  const lista = st.enhetLista || [];
  $("#meny").innerHTML = `<a class="logga" href="#/" aria-label="DODEX Scheduler, till enheterna">${loggaText()}</a>
    <div class="enhetsval"><label for="enhetsval">Enhet</label><select id="enhetsval"><option value="">Alla enheter …</option>${lista.map(x => `<option value="${x.id}"${e && x.id === e.id ? " selected" : ""}>${esc(x.namn)}</option>`).join("")}</select></div>
    ${lank(["schema"], "schema", "Schemaplanering", `${bas}/schema${kk}`, !e)}
    ${lank(["kalender"], "kalender", "Kalender", `${bas}/kalender`, !e)}
    ${lank(["oversikt", "hem"], "oversikt", "Översikt", e ? `${bas}/oversikt` : "#/")}
    ${lank(["behov"], "behov", "Bemanningsbehov", `${bas}/behov`, !e)}
    ${lank(["bemanningsbalans"], "kostnad", "Bemanningsbalans", `${bas}/bemanningsbalans`, !e)}
    ${lank(["medarbetare", "personer", "indata"], "grupp", "Medarbetare", `${bas}/medarbetare`, !e)}
    ${lank(["aktiviteter"], "stjarna", "Aktiviteter", `${bas}/aktiviteter`, !e)}
    ${lank(["nyckeltal", "bemanning"], "graf", "Analys och nyckeltal", `${bas}/nyckeltal${kk}`, !e)}
    ${lank(["analys"], "simulering", "Simulering", `${bas}/analys`, !e)}
    ${lank(["regelkontroll"], "kontroll", "Regelkontroll", `${bas}/regelkontroll${kk}`, !e)}
    ${lank(["rapporter"], "rapport", "Rapporter", `${bas}/rapporter`, !e)}
    ${lank(["installningar"], "installning", "Inställningar", `${bas}/installningar`, !e)}
    <div class="fyll"></div>
    ${lank(["organisation"], "installning", "Organisation", "#/organisation")}
    ${lank(["konton"], "grupp", "Konton", "#/konton")}
    ${st.session?.anvandare ? `<div class="inloggad-som">${esc(st.session.anvandare)} · ${st.session.roll === "chef" ? "chef" : "schemaläggare"}</div>` : ""}
    ${kravsInloggning ? `<button class="post ut" data-g="logga-ut" aria-label="Logga ut">${IKON.ut}<span>Logga ut</span></button>` : ""}
    <div class="fot"><em>Planering som skapar balans – idag och imorgon.</em>© Sofia Rångeby</div>`;
  $("#mobillogga").innerHTML = loggaText();
  const v = $("#enhetsval");
  if (v) v.onchange = () => { location.hash = v.value ? `#/e/${v.value}/schema` : "#/"; };
  $("#toppknappar").innerHTML = e ? `<button class="guld liten" data-g="lagg-schema">${IKON.spela} Lägg schema</button>` : "";
}

// ---------------------------------------------------------------- inloggning
async function visaInloggning(s) {
  stoppaPollning(); st.vy = "hem"; st.enhet = null; st.session = null; ritaMeny(); sokvag([]);
  if (!s) { try { s = await api("GET", "session"); } catch { s = { konton: false, gemensamt: true }; } }
  vy().innerHTML = `<form class="kort inloggning" id="inlogg">
    <div class="logga ljus stor" style="margin-bottom:6px">${LOGGA_TEXT()}<span><b>DODEX</b><small>Scheduler</small></span></div>
    <h1>Välkommen till DODEX Scheduler</h1>
    <p class="dampad">Smart schemaplanering för en hållbar verksamhet.</p>
    ${s.konton ? `<div><label for="anv">Användarnamn</label><input id="anv" autocomplete="username"${s.gemensamt ? "" : " required"}></div>` : ""}
    <div><label for="losen">Lösenord</label><input id="losen" type="password" autocomplete="current-password" required></div>
    ${s.konton && s.gemensamt ? `<p class="dampad liten" style="margin:0">Lämna användarnamnet tomt om du loggar in med det gemensamma lösenordet.</p>` : ""}
    <button class="primar" type="submit">Logga in</button>
    <p class="dampad liten" id="inlogg-fel" role="alert"></p></form>`;
  ($("#anv") || $("#losen")).focus();
  $("#inlogg").onsubmit = async e => {
    e.preventDefault();
    try { await api("POST", "logga-in", { losenord: $("#losen").value, anvandare: $("#anv")?.value || null }); route(); }
    catch (err) { $("#inlogg-fel").textContent = err.message; }
  };
}

// ---------------------------------------------------------------- vy: enheter
async function visaEnheter() {
  st.vy = "hem"; st.enhet = null; st.korning = null;
  if (!st.guide) st.nyOrg = null;  // gruppen gäller bara den enhet som skapas i guiden
  if (st.guide) { if (!$(".guide")) { ritaMeny(); sokvag([["Enheter", "#/"], ["Ny enhet"]]); } st.guide.orgval = st.org ? ORG.alternativ(st.org, st.guide.plats !== undefined ? st.guide.plats : st.nyOrg) : ""; st.guide.forskola = !!st.org && ORG.vag(st.org, (st.guide.plats !== undefined ? st.guide.plats : st.nyOrg) || "").includes("forskola"); vy().innerHTML = GUIDE.html(st.guide); return; }
  try { st.enhetLista = await api("GET", "enheter"); } catch { /* behåll */ }
  ritaMeny();
  sokvag([["Enheter"]]);
  const [enheter, exempel, org] = await Promise.all([api("GET", "enheter"), api("GET", "exempel"), api("GET", "organisation").catch(() => ({}))]);
  st.exempel = exempel; st.org = ORG.kopia(org.noder);
  vy().innerHTML = `
    <section class="kort valkommen"><div class="logga ljus stor">${LOGGA_TEXT()}<span><b>DODEX</b><small>Scheduler</small><em>© Sofia Rångeby</em></span></div>
      <p class="dampad" style="margin:8px 0 0">Planering som skapar balans – idag och imorgon. En enhet är en arbetsgrupp med medarbetare, behov, önskemål och regler; varje schema du lägger sparas som en körning.</p></section>
    ${GUIDE.val({ harEnheter: enheter.length > 0 })}
    <div class="rubrikrad" style="margin:6px 4px 0"><h2 id="mina-enheter" style="margin:0">Mina enheter</h2>
      <div class="chips"><a class="knapp liten" href="#/organisation" title="Verksamheter, enheter, områden och aktivitetstyper">Organisation</a>
      <label class="knapp liten" title="Öppna en enhet som har sparats som fil, i webben eller i telefonen">Öppna fil<input type="file" id="enhetsfil-in" accept=".json,application/json" hidden></label></div></div>
    ${st.orgRed ? `<section class="kort"><h2>Organisation</h2><p class="dampad liten">Verksamheter och grupper som enheterna ordnas under. Påverkar inte schemaläggningen. En borttagen grupps enheter flyttas upp ett steg.</p>${ORG.redigera(st.org)}</section>` : ""}
    <section class="org-trad">${ORG.trad(st.org, enheter, { oppna: st.orgOppna || new Set(),
      nyKnapp: id => `<button class="liten org-ny" data-guide="ny-i" data-org="${esc(id)}" title="Ny enhet i ${esc(ORG.sokvag(st.org, id))}">+ Ny enhet</button>`,
      ritaEnhet: e => `
      <div class="kort enhet" style="--ef:${ORG.enhetsfarg(st.org, e)}">
        <a class="namn" href="#/e/${e.id}/schema">${ORG.ikon(st.org, e, GUIDE.HUS)}${esc(e.namn)}</a>
        <div class="dampad liten">${e.personer ?? 0} personer · ${e.korningar} körningar · ändrad ${datum(e.andrad)}</div>
        <div class="chips"><a class="knapp liten primar" href="#/e/${e.id}/schema">${IKON.schema} Schema</a><a class="knapp liten" href="#/e/${e.id}/oversikt">Översikt</a>
          <button class="liten" data-g="kopiera" data-id="${e.id}">Kopiera</button>
          <button class="liten" data-g="spara-fil" data-id="${e.id}" title="Enheten med alla inställningar och scheman, att öppna i webben eller i telefonen">Spara som fil</button>
          <button class="liten fara" data-g="ta-bort-enhet" data-id="${e.id}" data-namn="${esc(e.namn)}">Ta bort</button></div>
        <label class="org-plats">Plats <select data-flytta="${e.id}" aria-label="Plats i organisationen för ${esc(e.namn)}">${ORG.alternativ(st.org, e.org)}</select></label>
        ${fargVal(e)}
      </div>` })}</section>
    ${enheter.length ? "" : `<div class="kort tom">Inga enheter än. Tryck <b>+ Ny enhet</b> vid en verksamhet, eller börja från ett exempel nedan.</div>`}
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
    if (!st.org) try { st.org = ORG.kopia((await api("GET", "organisation")).noder); } catch { st.org = ORG.kopia(); }
    if (!st.akttyper) try { st.akttyper = ORG.aktKopia((await api("GET", "aktivitetstyper")).typer); } catch { st.akttyper = ORG.aktKopia(); }
    if (!st.kompetenser) try { st.kompetenser = KOMP.kopia((await api("GET", "kompetenser")).kompetenser); } catch { st.kompetenser = KOMP.kopia(); }
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
  const F = [["personal", "Personal"], ["team", "Team"], ["kompetens", "Kompetens"], ["behov", "Behov"], ["onskemal", "Önskemål"], ["aktiviteter", "Aktiviteter"], ["period", "Period"], ["json", "Avancerat"]];
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
        <div class="flikar" role="tablist">${F.map(([k, t]) => `<button role="tab" data-g="flik" data-flik="${k}" aria-selected="${st.flik === k}">${t}${k === "personal" ? ` (${st.indata.personal.length})` : k === "onskemal" ? ` (${(st.indata.onskemal || []).length})` : k === "aktiviteter" ? ` (${(st.indata.aktiviteter || []).length})` : ""}</button>`).join("")}</div>
        <div id="flik">${ritaFlik()}</div>
      </section>
      <aside>
        <section class="kort" id="kontroll">${ritaKontroll()}</section>
        <section class="kort" id="korningar">${ritaKorningar()}</section>
      </aside>
    </div>`;
  $("#enhet-namn").oninput = e => { st.enhet.namn = e.target.value; markeraAndrad(false); };
  $("#spara").onclick = spara;
  kopplaOnskForm(); kopplaAktForm();
  uppdateraSparaknapp();
}

function ritaFlik() {
  const i = st.indata;
  switch (st.flik) {
    case "personal": return `
      <p class="dampad liten">Använd id-koder, inte namn. Antal pass räknas ut från perioden om fältet är tomt. Alla arbetar varannan helg om inget undantag anges.</p>
      <div class="rull"><table class="form personal"><thead><tr><th>Id</th><th>Grad %</th><th>Arbetar</th><th>Helger</th><th>Grupp</th><th title="Antal pass under perioden">Pass</th>${(i.team || []).length ? "<th>Team</th>" : ""}<th></th></tr></thead><tbody>
      ${i.personal.map((p, n) => {
        const del = (p.dygnsdelar || ["morgon", "kvall"]).join(",");
        return `<tr>
          <td data-l="Id"><input data-s="personal.${n}.id" value="${esc(p.id)}" style="width:70px" aria-label="Id"></td>
          <td data-l="Grad %"><input data-s="personal.${n}.grad" data-t="procent" type="number" inputmode="numeric" min="10" max="100" step="5" value="${Math.round((p.grad ?? 1) * 100)}" style="width:78px" aria-label="Sysselsättningsgrad"></td>
          <td data-l="Arbetar"><select data-s="personal.${n}.dygnsdelar" data-t="dygnsdelar" aria-label="Arbetar"${del !== "morgon,kvall" && del !== "natt" ? ' class="undantag"' : ""}>${Object.entries(ARBETAR).map(([v, t]) => `<option value="${v}"${v === del ? " selected" : ""}>${t}</option>`).join("")}</select></td>
          <td data-l="Helger"><select data-s="personal.${n}.helgfrekvens" data-t="valfri" aria-label="Helger"${p.helgfrekvens && p.helgfrekvens !== "2/4" ? ' class="undantag"' : ""}><option value="">Varannan</option>${Object.entries(HELGER).filter(([v]) => v !== "2/4").map(([v, t]) => `<option value="${v}"${v === p.helgfrekvens ? " selected" : ""}>Undantag: ${t.toLowerCase()}</option>`).join("")}</select></td>
          <td data-l="Helggrupp"><select data-s="personal.${n}.helggrupp" data-t="valfri" aria-label="Helggrupp"><option value="">Auto</option><option${p.helggrupp === "A" ? " selected" : ""}>A</option><option${p.helggrupp === "B" ? " selected" : ""}>B</option></select></td>
          <td data-l="Antal pass"><input data-s="personal.${n}.antal_pass" data-t="pass" value="${esc(Array.isArray(p.antal_pass) ? p.antal_pass.join(", ") : p.antal_pass ?? "")}" placeholder="auto" style="width:70px" aria-label="Antal pass"></td>
          ${(i.team || []).length ? `<td data-l="Team"><select data-s="personal.${n}.team" data-t="valfri" aria-label="Hemteam"><option value="">Inget</option>${i.team.map(t => `<option value="${esc(t.id)}"${t.id === p.team ? " selected" : ""}>${esc(t.namn || t.id)}</option>`).join("")}</select></td>` : ""}
          <td class="bort"><button class="liten fara" data-g="ta-bort-person" data-n="${n}" aria-label="Ta bort ${esc(p.id)}">×</button></td></tr>`;
      }).join("")}</tbody></table></div>
      <p style="margin-top:12px" class="chips"><button data-g="ny-person">+ Person</button> <button data-g="ny-person" data-natt="1">+ Nattperson</button></p>
      <p class="dampad liten">Gult betyder undantag: från varannan helg, eller från jämn fördelning mellan morgon och kväll. Helggrupp A arbetar helgerna i vecka 1, 3, 5 …</p>`;

    case "kompetens": return KOMP.flik(i, st.kompetenser);
    case "team": {
      const T = i.team || [], DL = [["morgon", "Dag"], ["kvall", "Kväll"], ["natt", "Natt"]];
      return `<p class="dampad liten">Om arbetsgruppen har flera mindre team: varje team har ett eget behov, och varje medarbetare ett hemteam (väljs under Medarbetare). Personalen är gemensam – där ett team har för få lånas personal in från ett team som har fler. Enhetens behov blir summan av teamens. Se docs/team.md.</p>
        ${T.map((t, n) => { const b = TEAM.perDag(t.behov), ant = i.personal.filter(q => q.team === t.id).length;
          return `<div class="kort" style="box-shadow:none;margin:10px 0"><div class="rubrikrad"><input type="color" class="org-farg" data-s="team.${n}.farg" value="${TEAM.farg(T, t.id)}" aria-label="Färg för ${esc(t.namn || t.id)}" title="Färg"><input data-s="team.${n}.namn" value="${esc(t.namn || "")}" placeholder="Teamets namn" style="font-weight:700;max-width:260px" aria-label="Teamets namn">
            <span class="dampad liten">${ant} medarbetare</span><button class="liten fara" data-g="ta-bort-team" data-n="${n}">Ta bort</button></div>
            <div class="rull"><table class="form"><thead><tr><th></th>${DL.map(([, x]) => `<th>${x}</th>`).join("")}</tr></thead><tbody>
            ${[["vardag", "Vardag (mån–fre)", 0], ["helg", "Helg (lör–sön)", 5]].map(([k, txt, di]) => `<tr><th>${txt}</th>${DL.map(([d]) => `<td><input type="number" min="0" inputmode="numeric" data-s="team.${n}.behov.${k}.${d}" data-t="heltal" value="${b[di][d] || ""}" placeholder="0" style="width:74px" aria-label="${esc(t.namn)} ${txt} ${d}"></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`; }).join("")}
        <p class="chips"><button data-g="ny-team">+ Team</button></p>
        ${T.length ? `<p class="dampad liten">Enhetens behov (summan): ${(() => { const s = TEAM.summaBehov(T); return `vardag ${s.vardag.morgon}/${s.vardag.kvall}/${s.vardag.natt}, helg ${s.helg.morgon}/${s.helg.kvall}/${s.helg.natt} (dag/kväll/natt)`; })()}. Utan hemteam räknas man som gemensam och kan arbeta i alla team.</p>` : ""}`;
    }
    case "behov": {
      if ((i.team || []).length) {
        const s = TEAM.summaBehov(i.team);
        return `<div class="banner info">${IKON.grupp}<div><strong>Behovet anges per team</strong>Enhetens behov är summan av teamens: vardag ${s.vardag.morgon}/${s.vardag.kvall}/${s.vardag.natt}, helg ${s.helg.morgon}/${s.helg.kvall}/${s.helg.natt} (dag/kväll/natt). Ändra under Medarbetare → Team.</div></div>
          <h3>Arbetstiden som behovet ger</h3><div id="arbetstid" class="grafyta">${GRAF.arbetstid(i)}</div>
          <h3>Starttider för dagpassen</h3>${GUIDE.starttiderHtml(((i.starttider || {}).morgon) || [], { start: (i.regler || {}).morgon_start || "07:00", behov: TEAM.perDag(i.behov) })}`;
      }
      const b = i.behov || {};
      const tp = [];
      Object.entries(i.tidpunkter || {}).forEach(([k, l]) => l.forEach(t => tp.push({ k, ...t })));
      return `
      <p class="dampad liten">Antal pass per dygnsdel. Rader längre ned skriver över rader ovanför, till exempel en egen rad för fredag.</p>
      <div class="rull"><table class="form"><thead><tr><th>Dagar</th><th>Dag</th><th>Kväll</th><th>Natt</th><th></th></tr></thead><tbody>
      ${Object.keys(b).map(k => `<tr><th>${DAGNYCKEL[k] || esc(k)}</th>${Object.keys(DELAR).map(d =>
        `<td><input type="number" inputmode="numeric" min="0" data-s="behov.${k}.${d}" data-t="heltal" value="${b[k][d] ?? 0}" style="width:74px" aria-label="${DAGNYCKEL[k]} ${DELAR[d]}"></td>`).join("")}
        <td>${["vardag", "helg"].includes(k) ? "" : `<button class="liten fara" data-g="ta-bort-behov" data-k="${k}" aria-label="Ta bort">×</button>`}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="chips" style="margin-top:10px"><select id="ny-behovsdag" style="width:auto">${Object.keys(DAGNYCKEL).filter(k => !b[k]).map(k => `<option value="${k}">${DAGNYCKEL[k]}</option>`).join("")}</select>
        <button data-g="ny-behovsrad">Lägg till rad</button></div>
      <h3>Arbetstiden som behovet ger</h3>
      <div id="arbetstid" class="grafyta">${GRAF.arbetstid(i)}</div>
      <h3>Starttider för dagpassen</h3>${GUIDE.starttiderHtml(((i.starttider || {}).morgon) || [], { start: (i.regler || {}).morgon_start || "07:00", behov: TEAM.perDag(i.behov) })}
      ${i.jour ? `<h3>Jour</h3>${RV.jourHtml(i)}` : ""}
      <h3>Täckning vid klockslag</h3>
      <p class="dampad liten">Minst så många i tjänst vid klockslaget, till exempel tidigt på morgonen eller mitt på dagen när dag och kväll överlappar. Passens längd anpassas efter det, och med rörlig starttid (Regler, Dagpass får också börja) även dagpassens start. Täckningsgraden syns i vyn Klockslag.</p>
      ${tp.length ? `<div class="rull"><table class="form"><thead><tr><th>Dagar</th><th>Klockslag</th><th>Antal</th><th></th></tr></thead><tbody>
        ${tp.map((t, n) => `<tr><td><select data-tp="${n}" data-f="k">${Object.keys(DAGNYCKEL).map(k => `<option value="${k}"${k === t.k ? " selected" : ""}>${DAGNYCKEL[k]}</option>`).join("")}</select></td>
          <td><input type="time" data-tp="${n}" data-f="tid" value="${esc(t.tid)}" style="width:120px"></td>
          <td><input type="number" min="0" data-tp="${n}" data-f="antal" value="${t.antal}" style="width:74px"></td>
          <td><button class="liten fara" data-g="ta-bort-tp" data-n="${n}" aria-label="Ta bort">×</button></td></tr>`).join("")}</tbody></table></div>` : ""}
      <p style="margin-top:8px"><button data-g="ny-tp">+ Klockslag</button></p>`;
    }

    case "onskemal": return ritaOnskemal();
    case "aktiviteter": return ritaAktiviteter();

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

// ---------------------------------------------------------------- aktiviteter (APT, handledning, utbildning …)
const VEMDELTAR = { alla: "Alla som kan arbeta då", andel: "En andel av gruppen", antal: "Ett visst antal", varje: "Alla, fördelat på tillfällena" };
// förslag på minsta bemanning på golvet: den lägsta av morgonens och kvällens behov på vardagar
function minstForslag() { const v = (st.indata.behov || {}).vardag || {}; const l = [v.morgon, v.kvall].filter(x => x > 0); return l.length ? Math.min(...l) : 0; }
function tomAkt() { return { typ: "apt", namn: "APT", dagar: ["tis"], veckor: "alla", start: "14:00", slut: "16:00", andel: 0.5, fran_golvet: true, minst_pa_golvet: minstForslag() || undefined, krav: false }; }

function aktText(a) {
  const vv = Array.isArray(a.veckor) ? `vecka ${a.veckor.join(", ")}` : a.veckor === "jämna" ? "jämna veckor" : a.veckor === "udda" ? "udda veckor" : "varje vecka";
  const dagar = a.dagar && a.dagar.length ? a.dagar.join(", ") : "alla dagar";
  const vem = a.antal ? `${a.antal} personer` : a.andel ? `${Math.round(a.andel * 100)} % av gruppen` : a.varje_person ? `alla, ${a.varje_person} ${a.varje_person === 1 ? "gång" : "gånger"} var` : "alla";
  return `${a.namn || a.id} ${a.start}–${a.slut}, ${dagar}, ${vv}: ${vem}${a.deltagare?.length ? ` bland ${a.deltagare.join(", ")}` : ""}${a.minst_pa_golvet ? `. Minst ${a.minst_pa_golvet} kvar på golvet` : ""}`;
}

function ritaAktiviteter() {
  const lista = st.indata.aktiviteter || [];
  const a = st.redigeraAkt;
  let h = `<p class="dampad liten">Aktiviteter under arbetstid, till exempel APT, utbildning, möte, studier, dokumentation eller handledning. De blir delaktiviteter i passen. Den som deltar arbetar hela aktivitetstiden: passet läggs så att det täcker tiden, och tiden räknas som arbetstid. Därför påverkar aktiviteten passlängd, vila, OB och bemanningen på golvet. Deltagarna fördelas rättvist.</p>`;
  h += a ? ritaAktForm(a.data, a.index) : `<p><button class="primar" data-g="ny-akt">+ Ny aktivitet</button></p>`;
  h += lista.length ? lista.map((x, n) => `<div class="onsk"><div><div>${x.krav ? `<span class="niva niva-avtal">måste</span> ` : ""}<span class="team-prick" style="--tf:${ORG.aktFarg(st.akttyper, x)}"></span>${esc(aktText(x))}</div>
      <div class="dampad liten">${x.fran_golvet === false ? "Räknas som i tjänst på golvet." : "Deltagarna räknas inte på golvet under aktiviteten."}${x.kommentar ? " " + esc(x.kommentar) : ""}</div></div>
      <div class="chips"><button class="liten" data-g="andra-akt" data-n="${n}">Ändra</button><button class="liten fara" data-g="ta-bort-akt" data-n="${n}" aria-label="Ta bort">×</button></div></div>`).join("")
    : `<p class="tom">Inga aktiviteter.</p>`;
  return h;
}

function ritaAktForm(a, index) {
  const vv = Array.isArray(a.veckor) ? "vissa" : (a.veckor || "alla");
  const vem = a.antal ? "antal" : a.andel ? "andel" : a.varje_person ? "varje" : "alla";
  const valda = new Set(a.deltagare || []);
  return `<form class="formular" id="akt-form">
    <div class="falt">
      <div><label for="a-typ">Typ</label><select id="a-typ">${ORG.aktAlternativ(st.akttyper, a)}</select></div>
      <div><label for="a-namn">Namn</label><input id="a-namn" value="${esc(a.namn || "")}" placeholder="APT" required></div>
      <div><label for="a-start">Från</label><input id="a-start" type="time" value="${esc(a.start)}" required></div>
      <div><label for="a-slut">Till</label><input id="a-slut" type="time" value="${esc(a.slut)}" required></div>
    </div>
    <div><label>Dagar</label><div class="chips">${DAGAR.map(d => `<label><input type="checkbox" name="a-dag" value="${d}"${(a.dagar || []).includes(d) ? " checked" : ""}> ${d}</label>`).join("")}</div></div>
    <div class="falt">
      <div><label for="a-veckor">Veckor</label><select id="a-veckor">
        <option value="alla"${vv === "alla" ? " selected" : ""}>Varje vecka</option><option value="jämna"${vv === "jämna" ? " selected" : ""}>Jämna veckor</option>
        <option value="udda"${vv === "udda" ? " selected" : ""}>Udda veckor</option><option value="vissa"${vv === "vissa" ? " selected" : ""}>Vissa veckor</option></select></div>
      <div id="a-vissa"${vv === "vissa" ? "" : " hidden"}><label for="a-veckolista">Veckor i schemat (2, 4)</label><input id="a-veckolista" value="${Array.isArray(a.veckor) ? a.veckor.join(", ") : ""}"></div>
    </div>
    <div class="falt">
      <div><label for="a-vem">Vilka deltar</label><select id="a-vem">${Object.entries(VEMDELTAR).map(([k, t]) => `<option value="${k}"${k === vem ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      <div id="a-andel-ruta"${vem === "andel" ? "" : " hidden"}><label for="a-andel">Andel, %</label><input id="a-andel" type="number" min="5" max="100" step="5" value="${Math.round((a.andel || 0.5) * 100)}"></div>
      <div id="a-antal-ruta"${vem === "antal" ? "" : " hidden"}><label for="a-antal">Antal per tillfälle</label><input id="a-antal" type="number" min="1" value="${a.antal || 2}"></div>
      <div id="a-varje-ruta"${vem === "varje" ? "" : " hidden"}><label for="a-varje">Gånger per person</label><input id="a-varje" type="number" min="1" value="${a.varje_person || 1}"></div>
    </div>
    <details${valda.size ? " open" : ""}><summary>Bara vissa personer (valfritt)</summary>
      <div class="chips" style="margin-top:6px">${st.indata.personal.map(p => `<label><input type="checkbox" name="a-pers" value="${esc(p.id)}"${valda.has(p.id) ? " checked" : ""}> ${esc(p.id)}</label>`).join("")}</div>
      <p class="dampad liten" style="margin:4px 0 0">Inga valda betyder alla som har pass som kan täcka tiden.</p></details>
    <div class="falt"><div><label for="a-minst">Minst kvar på golvet under tiden</label><input id="a-minst" type="number" min="0" value="${a.minst_pa_golvet ?? ""}" placeholder="ingen gräns"></div>
      <p class="dampad liten" style="align-self:end;margin:0">De som inte deltar får längre pass så att minst så många är i tjänst varje kvart. Behövs det fler än som finns blir det vakans.</p></div>
    <p><label class="check"><input type="checkbox" id="a-golv"${a.fran_golvet !== false ? " checked" : ""}> Deltagarna räknas inte på golvet under aktiviteten</label><br>
      <label class="check"><input type="checkbox" id="a-krav"${a.krav ? " checked" : ""}> Måste genomföras (annars läggs den så långt det går, efter behovet)</label></p>
    <div><label for="a-kommentar">Kommentar (valfri, utan personuppgifter)</label><input id="a-kommentar" value="${esc(a.kommentar || "")}"></div>
    <div class="chips"><button class="primar" type="submit">${index == null ? "Lägg till" : "Spara ändring"}</button><button type="button" data-g="avbryt-akt">Avbryt</button></div>
  </form>`;
}

function kopplaAktForm() {
  const f = $("#akt-form");
  if (!f) return;
  const a = st.redigeraAkt.data;
  $("#a-veckor").onchange = () => ($("#a-vissa").hidden = $("#a-veckor").value !== "vissa");
  $("#a-typ").onchange = () => { const n = $("#a-namn"); n.value = ORG.aktNamnEfterTyp(st.akttyper, n.value, ORG.aktTyp(st.akttyper, $("#a-typ").value)); };
  $("#a-vem").onchange = () => { const v = $("#a-vem").value; $("#a-andel-ruta").hidden = v !== "andel"; $("#a-antal-ruta").hidden = v !== "antal"; $("#a-varje-ruta").hidden = v !== "varje"; };
  f.onsubmit = e => {
    e.preventDefault();
    const namn = $("#a-namn").value.trim() || "Aktivitet";
    const ny = { id: a.id || nyttAktId(namn), ...ORG.aktFalt(ORG.aktTyp(st.akttyper, $("#a-typ").value)), namn, start: $("#a-start").value, slut: $("#a-slut").value };
    if (!(ny.slut > ny.start)) { meddela("Aktiviteten måste sluta efter att den börjar, samma dag."); return; }
    const dagar = [...f.querySelectorAll("[name=a-dag]:checked")].map(x => x.value);
    if (!dagar.length) { meddela("Välj minst en dag."); return; }
    ny.dagar = dagar;
    const vv = $("#a-veckor").value;
    if (vv === "vissa") {
      const l = $("#a-veckolista").value.split(/[,; ]+/).map(Number).filter(n => n > 0);
      if (!l.length) { meddela("Ange vilka veckor, till exempel 2, 4."); return; }
      ny.veckor = l;
    } else if (vv !== "alla") ny.veckor = vv;
    const vem = $("#a-vem").value;
    if (vem === "andel") ny.andel = Math.max(5, Math.min(100, +$("#a-andel").value || 50)) / 100;
    if (vem === "antal") ny.antal = Math.max(1, parseInt($("#a-antal").value) || 1);
    if (vem === "varje") ny.varje_person = Math.max(1, parseInt($("#a-varje").value) || 1);
    const pers = [...f.querySelectorAll("[name=a-pers]:checked")].map(x => x.value);
    if (pers.length) ny.deltagare = pers;
    if (!$("#a-golv").checked) ny.fran_golvet = false;
    const minst = parseInt($("#a-minst").value); if (minst > 0) ny.minst_pa_golvet = minst;
    if ($("#a-krav").checked) ny.krav = true;
    const k = $("#a-kommentar").value.trim(); if (k) ny.kommentar = k;
    st.indata.aktiviteter = st.indata.aktiviteter || [];
    if (st.redigeraAkt.index == null) st.indata.aktiviteter.push(ny); else st.indata.aktiviteter[st.redigeraAkt.index] = ny;
    st.redigeraAkt = null;
    markeraAndrad(true);
  };
}

function nyttAktId(namn) {
  const ids = new Set((st.indata.aktiviteter || []).map(a => a.id));
  const bas = (namn.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "AKT").slice(0, 8);
  let id = bas, n = 2; while (ids.has(id)) id = bas + n++;
  return id;
}

// ---------------------------------------------------------------- kontroll och körningslista
function kontrakteradTid(indata) {
  const ht = (indata.heltid_minuter_per_vecka || 2220) / 60;
  const htn = (indata.heltid_natt_minuter_per_vecka || 2060) / 60, natt = p => p.dygnsdelar && p.dygnsdelar.length === 1 && p.dygnsdelar[0] === "natt";
  return indata.personal.reduce((s, p) => s + (p.grad ?? 1) * ((p.heltid_minuter_per_vecka || 0) / 60 || (natt(p) ? htn : ht)), 0);
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
  const at = $("#arbetstid"); if (at && st.indata) at.innerHTML = GRAF.arbetstid(st.indata);
  uppdateraSparaknapp();
  if (rita && $("#flik")) { $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); kopplaAktForm(); uppdateraFlikrubriker(); }
  if (rita && st.vy === "installningar") ritaInstallningar();
  kontrollera();
  clearTimeout(markeraAndrad.t);
  markeraAndrad.t = setTimeout(spara, 1200);
}

function uppdateraFlikrubriker() {
  document.querySelectorAll("[data-flik=personal]").forEach(b => (b.textContent = `Personal (${st.indata.personal.length})`));
  document.querySelectorAll("[data-flik=onskemal]").forEach(b => (b.textContent = `Önskemål (${(st.indata.onskemal || []).length})`));
  document.querySelectorAll("[data-flik=aktiviteter],[data-g=mflik][data-f=aktiviteter]").forEach(b => (b.textContent = `Aktiviteter (${(st.indata.aktiviteter || []).length})`));
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
    if (el.dataset.s.startsWith("team.")) st.indata.behov = TEAM.summaBehov(st.indata.team);  // enhetens behov = summan
    markeraAndrad(/\.(helgfrekvens|dygnsdelar)$/.test(el.dataset.s));
  } else if (el.dataset.tp !== undefined) {
    const tp = tidpunktLista(), t = tp[+el.dataset.tp];
    t[el.dataset.f] = el.dataset.f === "antal" ? parseInt(el.value) || 0 : el.value;
    byggTidpunkter(tp);
    markeraAndrad(el.dataset.f === "k");
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "enhetsfil-in") { const f = e.target.files[0]; e.target.value = ""; if (f) oppnaEnhetsfil(f); return; }
  if (e.target.dataset.g === "byt-korning") { location.hash = `#/e/${st.enhet.id}/${e.target.dataset.vy}/${e.target.value}`; return; }
  if (e.target.tagName === "SELECT" && (e.target.closest("#flik") || e.target.closest("#regler")) && (e.target.dataset.s || e.target.dataset.r || e.target.dataset.tp !== undefined))
    e.target.dispatchEvent(new Event("input", { bubbles: true }));
});

// ---------------------------------------------------------------- enhetsfil (samma format som lättversionen)
async function sparaEnhetsfil(eid) {
  try {
    const e = await api("GET", "enheter/" + eid);
    const lista = (await api("GET", `enheter/${eid}/korningar`)).filter(k => k.status === "klar" && k.losning === "OK");
    const korningar = [];
    for (const k of lista) korningar.push(await api("GET", "korningar/" + k.id));
    const url = URL.createObjectURL(new Blob([ENHETSFIL.text(e, korningar, "webb")], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: ENHETSFIL.filnamn(e.namn) });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    meddela(`Sparat: alla inställningar och ${korningar.length} ${korningar.length === 1 ? "schema" : "scheman"}.`);
  } catch (err) { meddela("Kunde inte spara filen: " + err.message); }
}

async function oppnaEnhetsfil(fil) {
  let d;
  try { d = ENHETSFIL.las(await fil.text()); } catch (err) { meddela(err.message); return; }
  try {
    const { id } = await api("POST", "enheter", { namn: d.namn, indata: d.indata, org: st.nyOrg || null });
    const fel = [...d.varningar];
    let brott = 0;
    for (const k of d.korningar.slice().reverse()) {
      try { brott += (await api("POST", `enheter/${id}/importerad-korning`, { namn: k.namn, indata: k.indata, resultat: k.resultat, forvantade_vakanser: k.forvantade_vakanser })).brott; }
      catch (err) { fel.push(`${k.namn}: ${err.message}`); }
    }
    const kontroll = await api("POST", "kontrollera", { indata: d.indata }).catch(() => null);
    let text = `${d.namn} är öppnad med alla inställningar och ${d.korningar.length} ${d.korningar.length === 1 ? "schema" : "scheman"}.`;
    if (brott) text += ` Granskningen här hittar ${brott} brott mot hårda regler – se Regelkontroll.`;
    if (kontroll?.fel?.length) text += " Inställningarna behöver rättas innan ett nytt schema läggs.";
    if (fel.length) text += " " + fel.join(" ");
    st.enhet = null; st.enhetLista = null; location.hash = `#/e/${id}/schema`;
    setTimeout(() => meddela(text), 300);
  } catch (err) { meddela("Kunde inte öppna filen: " + err.message); }
}

async function laggSchema() {
  if (!(await spara())) return;
  try {
    const { id } = await api("POST", `enheter/${st.enhet.id}/korningar`, {});
    st.korning = null;
    location.hash = `#/e/${st.enhet.id}/schema/${id}`;
  } catch (e) {
    if (e.status === 422) {
      meddela("Rätta felen i kontrollen först.");
      if (st.vy !== "indata" && !$("#lada")) location.hash = `#/e/${st.enhet.id}/indata`;
      st.kontroll = { fel: e.data.fel, onskemal: [] }; const r = $("#kontroll"); if (r) r.innerHTML = ritaKontroll();
    } else meddela(e.message);
  }
}

// ---------------------------------------------------------------- inställningar i en panel ovanpå schemat
const LADFLIKAR = [["personal", "Personal"], ["behov", "Behov"], ["onskemal", "Önskemål"], ["aktiviteter", "★ Aktiviteter"], ["period", "Period"]];
function oppnaLada(flik) {
  st.flik = flik; st.redigeraOnsk = null; st.redigeraAkt = null;
  stangLada();
  const el = document.createElement("div");
  el.id = "lada";
  el.innerHTML = `<div class="lada-bakgrund" data-g="stang-lada"></div><aside class="lada" role="dialog" aria-label="Inställningar">
    <div class="rubrikrad"><h2 style="margin:0">Inställningar</h2><button class="liten" data-g="stang-lada" aria-label="Stäng">✕ Stäng</button></div>
    <div class="flikar" role="tablist">${LADFLIKAR.map(([k, t]) => `<button role="tab" data-g="ladflik" data-f="${k}" aria-selected="${k === flik}">${t}</button>`).join("")}
      <a class="knapp liten" href="#/e/${st.enhet.id}/installningar" style="margin-left:auto">Regler ›</a></div>
    <div id="flik">${ritaFlik()}</div>
    <section id="kontroll" class="kontroll-lada">${ritaKontroll()}</section>
    <div class="lada-fot"><span class="dampad liten">Ändringar sparas automatiskt. Lägg ett nytt schema för att se effekten.</span><button class="guld" data-g="lagg-schema">${IKON.spela} Lägg nytt schema</button></div>
  </aside>`;
  document.body.appendChild(el);
  kopplaOnskForm(); kopplaAktForm(); kontrollera();
}
function stangLada() { const l = document.getElementById("lada"); if (l) l.remove(); }

// ---------------------------------------------------------------- vy: inställningar (regler)
// Alla regler går att ändra. Avtal, lag och varannan helg är låsta tills avvikelsen bekräftas.
const REGLER = [
  { grupp: "Avtal", k: "dygnsvila_minuter", namn: "Dygnsvila", beskr: "Sammanhängande vila per dygn, räknat från dygnsbrytet. 11 timmar är hård i schemaplaneringen och kan inte låsas upp (verksamhetens beslut).", ab: "AB 25 § 13 mom. 8 och mom. 5", niva: "avtal", typ: "hård", falt: "timmar", std: 660, last: true, aldrigUpplas: true },
  { grupp: "Avtal", k: "dygnsbryt", namn: "Dygnsbryt, dag och kväll", beskr: "När 24-timmarsperioden för dygnsvilan börjar. Automatiskt = där flest pass slutar och börjar. Välj ett klockslag när verksamheten har bestämt sig.", ab: "AB 25 § 13 mom. 5", niva: "avtal", typ: "hård", falt: "bryt", std: "auto", forslag: () => st.korning?.granskning?.dygnsbryt },
  { grupp: "Avtal", k: "dygnsbryt_natt", namn: "Dygnsbryt, nattpersonal", beskr: "Automatiskt = där nattpassen oftast slutar. En person kan också ha eget dygnsbryt.", ab: "AB 25 § 13 mom. 5", niva: "avtal", typ: "hård", falt: "bryt", std: "auto",
    forslag: () => { const g = st.korning?.granskning, ind = st.korning?.indata; if (!g || !ind) return null; const n = ind.personal.find(p => p.dygnsdelar?.length === 1 && p.dygnsdelar[0] === "natt"); return n ? g.dygnsbryt_per_person?.[n.id] : null; } },
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
  { grupp: "Lokala regler", k: "natt_vila_mellan_block_minuter", namn: "Nattpersonal: vila mellan nattblock", beskr: "Eftersträvas; bryts bara när schemat annars inte går ihop (till exempel heltid natt med 9-timmarsnätter).", niva: "lokal regel", typ: "mjuk", falt: "timmar", steg: 1, std: 2880 },
  { grupp: "Lokala regler", k: "kvall_max_i_rad", namn: "Högst antal kvällar i rad", beskr: "Gäller alla som arbetar kväll. 0 stänger av.", niva: "lokal regel", typ: "mjuk eller hård", falt: "tal", steg: 1, std: 3 },
  { grupp: "Lokala regler", k: "kvall_i_rad_typ", namn: "Kvällar i rad: hur strikt", beskr: "Mjuk: eftersträvas men kan brytas när schemat annars inte går ihop. Hård: aldrig fler kvällar i rad, även om det kan göra schemat olösbart.", niva: "lokal regel", typ: "mjuk eller hård", falt: "val", val: { mjuk: "Mjuk (eftersträvas)", hard: "Hård (aldrig fler)" }, std: "mjuk" },
  { grupp: "Lokala regler", k: "natt_max_i_rad", namn: "Nattpersonal: högst antal nätter i rad", niva: "lokal regel", typ: "hård", falt: "tal", steg: 1, std: 3 },
  { grupp: "Principer", k: "block_rekommenderat", namn: "Helst högst antal dagar i följd", niva: "princip", typ: "mjuk", falt: "tal", steg: 1, std: 4 },
  { grupp: "Principer", k: "spridning_kvallar", namn: "Blandning av morgon och kväll varje vecka", beskr: "För den som arbetar både morgon och kväll. Mjuk väger in efter rättvisan, Stark väger tyngst efter vakanserna.", niva: "princip", typ: "mjuk", falt: "val", val: { av: "Av", mjuk: "Mjuk", stark: "Stark" }, std: "mjuk" },
  { grupp: "Principer", k: "spridning_tolerans", namn: "Hur jämn blandningen ska vara", niva: "princip", typ: "mjuk", falt: "val", tal: true, val: { 1: "Båda sorterna varje vecka", 0: "Nästan lika många av varje" }, std: 1 },
  { grupp: "Principer", k: "jamn_bemanning", namn: "Jämn bemanning mellan dag och kväll", beskr: "Det som blir över eller saknas fördelas efter behovet, jämnt mellan dag- och kvällspass och över veckorna, i stället för att allt hamnar på samma pass.", niva: "princip", typ: "mjuk", falt: "val", val: { av: "Av", mjuk: "På" }, std: "mjuk" },
  { grupp: "Principer", k: "morgon_start", namn: "Dagpass börjar", niva: "princip", typ: "hård", falt: "tid", std: "07:00" },
  { grupp: "Principer", k: "morgon_starter", namn: "Dagpass får också börja", beskr: "Rörlig start efter täckningen: skriv tider med komma, till exempel 06:30, 07:30. Motorn väljer en annan start bara när behovet vid ett klockslag kräver det (ange det under Behov, Minst i tjänst vid klockslag). Tomt = alltid den vanliga starttiden.", niva: "princip", typ: "hård", falt: "tider", std: [] },
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
  try { await laddaKorning(null); } catch { /* inget schema: inget förslag på dygnsbryt */ }
  ritaInstallningar();
}

function ritaInstallningar() {
  const r = st.indata.regler || {}, avv = new Set(st.indata.avvikelser || []);
  const grupper = [...new Set(REGLER.map(x => x.grupp))];
  const rad = R => {
    const v = r[R.k] ?? R.std, andrad = r[R.k] !== undefined && r[R.k] !== R.std, last = R.last && !avv.has(R.k);
    let falt;
    const visa = R.falt === "timmar" ? sv(v / 60, 1) + " h" : R.falt === "minuter" ? v + " min" : R.falt === "val" ? R.val[v] : Array.isArray(v) ? v.join(", ") : v;
    if (last && R.aldrigUpplas) falt = `<span class="lat">${esc(visa)}</span><span class="niva">${IKON.las.replace("<svg", '<svg width="11" height="11"')} kan inte låsas upp</span>`;
    else if (last) falt = `<span class="lat">${esc(visa)}</span><button class="liten" data-g="las-upp" data-k="${R.k}" aria-label="Lås upp ${R.namn}">${IKON.las} Lås upp</button>`;
    else if (R.falt === "check") falt = `<label class="check"><input type="checkbox" data-r="${R.k}" data-t="check"${v ? " checked" : ""}> ${v ? "På" : "Av"}</label>`;
    else if (R.falt === "val") falt = `<select data-r="${R.k}">${Object.entries(R.val).map(([a, t]) => `<option value="${a}"${String(a) === String(v) ? " selected" : ""}>${t}</option>`).join("")}</select>`;
    else if (R.falt === "tid") falt = `<input type="time" data-r="${R.k}" value="${esc(v)}">`;
    else if (R.falt === "bryt") {
      const fs = R.forslag && R.forslag(), auto = v === "auto";
      falt = `<select data-r="${R.k}" data-t="bryt" aria-label="${R.namn}"><option value="auto"${auto ? " selected" : ""}>Automatiskt${fs ? ` (nu ${fs})` : ""}</option><option value="fast"${auto ? "" : " selected"}>Fast klockslag</option></select>
        ${auto ? (fs ? `<button class="liten" data-g="las-bryt" data-k="${R.k}" data-v="${fs}">Lås ${fs}</button>` : "") : `<input type="time" data-r="${R.k}" data-t="brytid" value="${esc(v)}" aria-label="${R.namn}, klockslag">`}`;
    }
    else if (R.falt === "tider") falt = `<input data-r="${R.k}" data-t="tider" value="${esc((v || []).join(", "))}" placeholder="till exempel 06:30, 07:30" style="width:190px">`;
    else if (R.falt === "timmar") falt = `<input type="number" inputmode="decimal" step="0.5" min="${(R.min || 0) / 60}" data-r="${R.k}" data-t="timmar" value="${v / 60}" aria-label="${R.namn} i timmar"> <span class="dampad">h</span>`;
    else if (R.falt === "minuter") falt = `<input type="number" inputmode="numeric" step="5" min="0" data-r="${R.k}" data-t="tal" value="${v}" aria-label="${R.namn} i minuter"> <span class="dampad">min</span>`;
    else falt = `<input type="number" inputmode="decimal" step="${R.steg}" data-r="${R.k}" data-t="tal" value="${v}">`;
    const oppen = st.oppnaRegel === R.k && last;
    return `<div class="regel"><div><div class="namn">${R.namn}</div>${R.beskr ? `<div class="beskr">${R.beskr}</div>` : ""}${R.ab ? `<div class="beskr"><b>${R.ab}</b></div>` : ""}
        <div class="chips" style="margin-top:4px"><span class="niva ${nk(R.niva)}">${R.niva}</span><span class="niva">${R.typ}</span>
        ${avv.has(R.k) ? `<span class="niva avviker">${IKON.olast.replace("<svg", '<svg width="11" height="11"')} upplåst</span>` : ""}
        ${andrad ? `<span class="niva avviker">avviker från ${Array.isArray(R.std) ? "standard" : R.std === "auto" ? "automatiskt" : R.falt === "timmar" ? sv(R.std / 60, 1) + " h" : R.falt === "val" ? R.val[R.std] : R.std === true ? "på" : R.std === false ? "av" : R.std}</span> <button class="lank liten" data-g="aterstall-regel" data-k="${R.k}">Återställ</button>` : ""}
        ${avv.has(R.k) && !andrad ? `<button class="lank liten" data-g="las-igen" data-k="${R.k}">Lås igen</button>` : ""}</div></div>
      <div class="varde">${falt}</div>
      ${oppen ? `<div class="lasupp"><div><b>Avvikelse från ${R.niva === "lag" ? "lagen" : R.niva === "avtal" ? "avtalet" : "verksamhetens beslut"}.</b> ${R.avvikelse || "Ändringen gäller hela enheten."} Avvikelsen syns på alla scheman från enheten.</div>
        <label class="check"><input type="checkbox" id="bekrafta"> ${R.bekrafta || "Vi har ett lokalt beslut som tillåter avvikelsen"}</label>
        <div class="chips"><button class="primar liten" data-g="bekrafta-upplasning" data-k="${R.k}">Lås upp</button><button class="liten" data-g="avbryt-upplasning">Avbryt</button></div></div>` : ""}
    </div>`;
  };
  const np = (st.indata.nattpass && st.indata.nattpass[0]) || { start: "21:45", slut: "06:45" };
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
      <div style="margin-top:12px">${RV.kort(st.indata, st.rvVal)}</div>
      <p class="dampad" style="margin:12px 0 0">Alla regler går att ändra. Regler från avtal, lag och varannan helg är låsta: lås upp dem bara om ni har ett lokalt avtal eller beslut, och avvikelsen syns då på alla scheman. Behovet är alltid mjukt: hellre en vakans än ett regelbrott.</p></section>
    <div id="regler" class="tva">
      ${grupper.map(g => `<section class="kort"><h2>${g}</h2><div class="regelgrupp">${REGLER.filter(x => x.grupp === g).map(rad).join("")}
        ${g === "Kontrakt" ? `<div class="regel"><div><div class="namn">Heltid per vecka</div><div class="chips" style="margin-top:4px"><span class="niva">kontrakt</span></div></div>
          <div class="varde"><input type="number" step="0.25" data-heltid value="${(st.indata.heltid_minuter_per_vecka ?? 2220) / 60}" aria-label="Heltid i timmar"> <span class="dampad">h</span></div></div>
          <div class="regel"><div><div class="namn">Heltid per vecka, nattpersonal</div><div class="chips" style="margin-top:4px"><span class="niva">kontrakt</span></div><div class="dampad liten">34:20 som standard (AB 25 § 13 mom. 2, kontinuerligt treskift)</div></div>
          <div class="varde"><input type="text" inputmode="numeric" data-heltidnatt value="${(() => { const m = st.indata.heltid_natt_minuter_per_vecka ?? 2060; return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); })()}" aria-label="Heltid för nattpersonal, timmar:minuter" style="width:90px"> <span class="dampad">h:mm</span></div></div>` : ""}
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
  if (el.dataset.heltidnatt !== undefined) {
    const m = /^(\d{1,2})[:.,](\d{1,2})$/.exec(el.value.trim()), h = m ? +m[1] * 60 + +m[2] : Math.round(parseFloat(el.value.replace(",", ".")) * 60);
    if (h > 0) { if (h === 2060) delete st.indata.heltid_natt_minuter_per_vecka; else st.indata.heltid_natt_minuter_per_vecka = h; markeraAndrad(false); } return;
  }
  if (el.dataset.natt) {
    const np = (st.indata.nattpass && st.indata.nattpass[0]) || { id: "N", start: "21:45", slut: "06:45", maltidsuppehall: true };
    np[el.dataset.natt] = el.value; st.indata.nattpass = [np]; markeraAndrad(false); return;
  }
  if (!el.dataset.r) return;
  const R = REGLER.find(r => r.k === el.dataset.r);
  st.indata.regler = st.indata.regler || {};
  if (el.dataset.t === "bryt" || el.dataset.t === "brytid") {
    const v = el.dataset.t === "bryt" ? (el.value === "auto" ? "auto" : (R.forslag && R.forslag()) || "15:00") : el.value;
    if (v === "auto") delete st.indata.regler[R.k]; else st.indata.regler[R.k] = v;
    if (!Object.keys(st.indata.regler).length) delete st.indata.regler;
    markeraAndrad(false); ritaInstallningar(); return;
  }
  if (el.dataset.t === "tider") {
    const l = el.value.split(/[,; ]+/).map(t => t.trim().replace(".", ":")).filter(Boolean).map(t => /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, "0") : null);
    if (l.some(t => !t)) { meddela("Skriv tiderna som 06:30, 07:30."); return; }
    if (l.length) st.indata.regler[R.k] = [...new Set(l)].sort(); else delete st.indata.regler[R.k];
    if (!Object.keys(st.indata.regler).length) delete st.indata.regler;
    markeraAndrad(false); return;
  }
  let v = el.dataset.t === "check" ? el.checked : el.dataset.t === "tal" || R.tal ? parseFloat(el.value.replace(",", ".")) : el.dataset.t === "timmar" ? Math.round(parseFloat(el.value.replace(",", ".")) * 60) : el.value;
  if (v === R.std || (typeof v === "number" && isNaN(v))) delete st.indata.regler[R.k]; else st.indata.regler[R.k] = v;
  if (!Object.keys(st.indata.regler).length) delete st.indata.regler;
  markeraAndrad(el.dataset.t === "check" || R.falt === "val");
}

// ---------------------------------------------------------------- klick
// startguiden (guide.js). Platsen i organisationen: vald i guiden, annars gruppen där man tryckte + Ny enhet.
const platsFor = g => (g.plats !== undefined ? g.plats : st.nyOrg) || null;
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-guide]"); if (!el) return;
  const g = st.guide, val = el.dataset.guide;
  try {
    switch (val) {
      case "ny": st.nyOrg = null; st.guide = GUIDE.ny(); return visaEnheter();
      case "ny-i": e.preventDefault(); st.nyOrg = el.dataset.org; st.guide = GUIDE.ny(); window.scrollTo(0, 0); meddela(`Den nya enheten hamnar i ${ORG.sokvag(st.org, st.nyOrg)}.`); return visaEnheter();
      case "exempel": return $("#exempel")?.scrollIntoView({ behavior: "smooth" });
      case "enheter": return $("#mina-enheter")?.scrollIntoView({ behavior: "smooth" });
      case "ai": {
        const { id } = await api("POST", "enheter", { namn: "Ny enhet", indata: GUIDE.tomIndata("Ny enhet"), org: st.nyOrg || null });
        st.enhet = null; st.enhetLista = null; st.oppnaAssistent = true; location.hash = `#/e/${id}/medarbetare`; return;
      }
      case "klistra": st.nyOrg = null; st.guide = GUIDE.nyKlistra(); window.scrollTo(0, 0); return visaEnheter();
      case "anvand-klistrat": { const fel = GUIDE.anvandKlistrat(g); if (fel) return meddela(fel); window.scrollTo(0, 0); return visaEnheter(); }
      case "behov-forenkla": GUIDE.forenklaBehov(g); return visaEnheter();
      case "avbryt": st.guide = null; st.nyOrg = null; return visaEnheter();
      case "tillbaka": g.steg--; return visaEnheter();
      case "nasta": { const fel = GUIDE.kontrollera(g); if (fel) return meddela(fel); g.steg++; window.scrollTo(0, 0); return visaEnheter(); }
      case "satt": GUIDE.satt(g, el.dataset.falt, el.dataset.varde); return visaEnheter();
      case "minsta": { const r = GUIDE.berakna(g); g.antalDag = Math.max(g.antalDag, r.minDag); g.antalNatt = Math.max(g.antalNatt, r.minNatt); return visaEnheter(); }
      case "omrade-ny": GUIDE.laggOmrade(g); return visaEnheter();
      case "omrade-bort": GUIDE.taBortOmrade(g, +el.dataset.i); return visaEnheter();
      case "skapa-omraden": {
        // gruppen i organisationen (eller den som redan finns med samma namn) och en enhet per område
        if (!st.org) st.org = ORG.kopia((await api("GET", "organisation")).noder);
        const { noder, id: gid } = ORG.grupp(st.org, g.namn, platsFor(g));
        if (noder !== st.org) { await api("PUT", "organisation", { noder }); st.org = noder; }
        const E = GUIDE.omradesEnheter(g);
        for (const x of E) await api("POST", "enheter", { namn: x.namn, indata: x.indata, org: gid, farg: x.farg });
        st.guide = null; st.nyOrg = null; st.enhetLista = null;
        meddela(`${E.length} områden är skapade under ${ORG.sokvag(st.org, gid)}. Kontrollera personal och behov i varje område och lägg sedan schemat.`);
        return visaEnheter();
      }
      case "skapa": case "skapa-ai": case "skapa-manuellt": {
        const { id } = await api("POST", "enheter", { namn: g.namn || "Ny enhet", indata: GUIDE.indata(g), org: platsFor(g) });
        st.guide = null; st.enhet = null; st.enhetLista = null;
        if (val === "skapa-ai") { await laddaEnhet(id); await laggSchema(); }
        else if (val === "skapa-manuellt") { const k = await api("POST", `enheter/${id}/manuell`); st.startaRedigering = true; location.hash = `#/e/${id}/schema/${k.id}`; }
        else location.hash = `#/e/${id}/oversikt`;
        meddela("Enheten är skapad."); return;
      }
    }
  } catch (err) { meddela(err.message); }
});
document.addEventListener("change", e => {
  // rita om efter en kort stund, så att ett tryck på Nästa direkt efter att man har skrivit hinner gå fram
  if (st.guide && e.target.closest(".guide") && GUIDE.las(st.guide, e.target))
    setTimeout(() => { if (st.guide) visaEnheter().then(() => { const x = document.getElementById(e.target.id); if (x && document.activeElement === document.body) x.focus(); }); }, 150);
});
document.addEventListener("input", e => { if (st.guide && e.target.closest(".guide")) GUIDE.las(st.guide, e.target); });

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-g]");
  if (!el) return;
  const g = el.dataset.g;
  try {
    switch (g) {
      case "logga-ut": await api("POST", "logga-ut"); visaInloggning(); break;
      case "kal-flytta": st.kalForskj = +el.dataset.v ? (st.kalForskj || 0) + +el.dataset.v : 0; return visaKalender(st.enhet.id);
      case "org-red": st.orgRed = !st.orgRed; return visaEnheter();
      case "konto-bort":
        if (el.dataset.ok !== "1") { el.dataset.ok = "1"; el.textContent = "Säker?"; setTimeout(() => { el.dataset.ok = ""; el.textContent = "Ta bort"; }, 4000); return; }
        await api("DELETE", "anvandare/" + encodeURIComponent(el.dataset.n)); meddela("Kontot är borttaget."); visaKonton(); break;
      case "ny-enhet": { st.guide = GUIDE.ny(); location.hash = "#/"; visaEnheter(); break; }
      case "ny-enhet-tom": {
        const { id } = await api("POST", "enheter", { namn: "Ny enhet", indata: NY_INDATA(), org: st.nyOrg || null });
        st.enhet = null; st.enhetLista = null; location.hash = `#/e/${id}/medarbetare`; break;
      }
      case "fran-exempel": {
        const x = st.exempel[+el.dataset.i];
        const { id } = await api("POST", "enheter", { namn: x.namn, indata: x.indata, org: st.nyOrg || null });
        st.enhet = null; st.enhetLista = null; location.hash = `#/e/${id}/oversikt`; break;
      }
      case "spara-fil": return sparaEnhetsfil(el.dataset.id);
      case "kopiera": {
        const e2 = await api("GET", "enheter/" + el.dataset.id);
        await api("POST", "enheter", { namn: e2.namn + " (kopia)", indata: e2.indata, org: e2.org || null, farg: e2.farg || null });
        meddela("Kopia skapad. Pröva ändringar i den och jämför sedan körningarna."); visaEnheter(); break;
      }
      case "ta-bort-enhet":
        if (el.dataset.bekrafta !== "1") { el.dataset.bekrafta = "1"; el.textContent = "Säker?"; setTimeout(() => { el.dataset.bekrafta = ""; el.textContent = "Ta bort"; }, 4000); return; }
        await api("DELETE", "enheter/" + el.dataset.id); meddela(`${el.dataset.namn} är borttagen.`); visaEnheter(); break;
      case "iflik": st.iflik = el.dataset.f; ritaInstallningar(); break;
      case "mflik":
        st.flik = el.dataset.f; st.redigeraOnsk = null; st.redigeraAkt = null;
        document.querySelectorAll("[data-g=mflik]").forEach(b => b.setAttribute("aria-selected", b === el));
        $("#flik").innerHTML = ritaFlik(); history.replaceState(null, "", `#/e/${st.enhet.id}/medarbetare?flik=${st.flik}`); break;
      case "flik":
        st.flik = el.dataset.flik; st.redigeraOnsk = null; st.redigeraAkt = null;
        document.querySelectorAll("[data-g=flik]").forEach(b => b.setAttribute("aria-selected", b === el));
        $("#flik").innerHTML = ritaFlik(); history.replaceState(null, "", `#/e/${st.enhet.id}/indata?flik=${st.flik}`); break;
      case "lagg-schema": await laggSchema(); break;
      case "ny-team": {
        const T = st.indata.team || (st.indata.team = []);
        T.push({ id: TEAM.nyttId(T), namn: `Team ${T.length + 1}`, farg: TEAM.nyFarg(T), behov: { vardag: { morgon: 0, kvall: 0, natt: 0 }, helg: { morgon: 0, kvall: 0, natt: 0 } } });
        st.indata.behov = TEAM.summaBehov(T); markeraAndrad(true); break;
      }
      case "ta-bort-team": {
        const i = st.indata, t = i.team[+el.dataset.n];
        if (!confirm(`Ta bort ${t.namn || t.id}? Medarbetarna blir utan hemteam.`)) return;
        i.team.splice(+el.dataset.n, 1); i.personal.forEach(q => { if (q.team === t.id) delete q.team; });
        if (i.team.length) i.behov = TEAM.summaBehov(i.team); else delete i.team;
        markeraAndrad(true); break;
      }
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
      case "las-bryt": st.indata.regler = { ...(st.indata.regler || {}), [el.dataset.k]: el.dataset.v }; markeraAndrad(false); ritaInstallningar(); meddela(`Dygnsbrytet är låst till ${el.dataset.v}.`); break;
      case "aterstall-regel":
        delete st.indata.regler[el.dataset.k]; if (!Object.keys(st.indata.regler).length) delete st.indata.regler;
        markeraAndrad(true); break;
      case "nytt-onsk":
        if (!st.indata.personal.length) { meddela("Lägg till personal först."); return; }
        st.redigeraOnsk = { index: null, data: tomtOnsk() }; $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); $("#o-person").focus(); break;
      case "andra-onsk": st.redigeraOnsk = { index: +el.dataset.n, data: structuredClone(st.indata.onskemal[+el.dataset.n]) }; $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); break;
      case "avbryt-onsk": st.redigeraOnsk = null; $("#flik").innerHTML = ritaFlik(); break;
      case "lada": oppnaLada(el.dataset.f); break;
      case "tre-alternativ": {
        if (!(await spara())) return;
        el.disabled = true; el.textContent = "Startar …";
        try {
          const ids = [];
          for (const profil of ["medarbetare", "verksamhet", "ekonomi"]) ids.push((await api("POST", `enheter/${st.enhet.id}/korningar`, { profil })).id);
          st.korningar = null; location.hash = `#/jamfor/${ids.join(",")}`;
        } catch (e) { meddela(e.status === 422 ? "Rätta felen i kontrollen först." : e.message); el.disabled = false; el.textContent = "⚖ Tre alternativ"; }
        break;
      }
      case "stang-lada": stangLada(); if (st.andrad) await spara(); break;
      case "ladflik":
        st.flik = el.dataset.f; st.redigeraOnsk = null; st.redigeraAkt = null;
        document.querySelectorAll("[data-g=ladflik]").forEach(b => b.setAttribute("aria-selected", b === el));
        $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); kopplaAktForm(); break;
      case "ny-akt": st.redigeraAkt = { index: null, data: tomAkt() }; $("#flik").innerHTML = ritaFlik(); kopplaAktForm(); $("#a-namn").focus(); break;
      case "andra-akt": st.redigeraAkt = { index: +el.dataset.n, data: structuredClone(st.indata.aktiviteter[+el.dataset.n]) }; $("#flik").innerHTML = ritaFlik(); kopplaAktForm(); break;
      case "avbryt-akt": st.redigeraAkt = null; $("#flik").innerHTML = ritaFlik(); break;
      case "ta-bort-akt": st.indata.aktiviteter.splice(+el.dataset.n, 1); if (!st.indata.aktiviteter.length) delete st.indata.aktiviteter; markeraAndrad(true); break;
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

// ---------------------------------------------------------------- organisationsstruktur (organisation.js)
// Enhetens färg: egen eller verksamhetens (organisation.js).
const fargVal = e => `<label class="org-plats">Färg <input type="color" class="org-farg" data-enhetfarg="${e.id}" value="${ORG.enhetsfarg(st.org, e)}" aria-label="Färg för ${esc(e.namn)}">${e.farg ? `<button class="lank liten" data-enhetfargarv="${e.id}" title="Använd verksamhetens färg">↺ verksamhetens</button>` : ""}</label>`;
async function fargaEnhet(id, farg) {
  try { await api("POST", `enheter/${id}/farg`, { farg }); st.enhet = null; ritaOmOrg(); } catch (err) { meddela(err.message); }
}
document.addEventListener("change", e => { const id = e.target.dataset?.enhetfarg; if (id) fargaEnhet(id, e.target.value); });
document.addEventListener("click", e => { const el = e.target.closest("[data-enhetfargarv]"); if (el) { e.preventDefault(); fargaEnhet(el.dataset.enhetfargarv, null); } });
async function sparaOrg(noder) {
  try { await api("PUT", "organisation", { noder }); st.org = noder; ritaOmOrg(); }
  catch (err) { meddela(err.message); }
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-orgg]"); if (!el || !st.org) return;
  const id = el.dataset.id, namn = ORG.sokvag(st.org, id);
  try {
    if (el.dataset.orgg === "byt") { const n = prompt("Nytt namn för " + namn, st.org.find(x => x.id === id).namn); if (n !== null) sparaOrg(ORG.bytNamn(st.org, id, n)); }
    if (el.dataset.orgg === "under") { const n = prompt("Namn på den nya gruppen under " + namn); if (n) sparaOrg(ORG.lagg(st.org, n, id)); }
    if (el.dataset.orgg === "bort" && confirm(`Ta bort ${namn}? Enheterna där flyttas upp ett steg.`)) sparaOrg(ORG.taBort(st.org, id).noder);
  } catch (err) { meddela(err.message); }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "org-ny") return;
  e.preventDefault();
  try { sparaOrg(ORG.lagg(st.org, $("#org-ny-namn").value, null)); } catch (err) { meddela(err.message); }
});
document.addEventListener("change", e => {
  const id = e.target.dataset?.orgfarg; if (!id || !st.org) return;
  try { sparaOrg(ORG.sattFarg(st.org, id, e.target.value)); } catch (err) { meddela(err.message); }
});
document.addEventListener("change", async e => {
  const id = e.target.dataset?.flytta; if (!id) return;
  try { await api("POST", `enheter/${id}/flytta`, { org: e.target.value || null }); meddela("Enheten är flyttad."); visaEnheter(); }
  catch (err) { meddela(err.message); }
});
// kom ihåg vilka grupper som är ihopfällda
document.addEventListener("toggle", e => {
  const d = e.target; if (!d.classList?.contains("org-grupp")) return;
  st.orgOppna = st.orgOppna || new Set();
  if (d.open) st.orgOppna.add(d.dataset.org); else st.orgOppna.delete(d.dataset.org);
}, true);


// starttider för dagpassen (guide.js): i guiden (data-gst) och i enhetens behov (data-st)
document.addEventListener("click", e => {
  const el = e.target.closest("[data-gst-ny],[data-gst-bort],[data-st-ny],[data-st-bort]"); if (!el) return;
  e.preventDefault();
  if (el.matches("[data-gst-ny],[data-gst-bort]")) {
    if (!st.guide) return;
    st.guide.starttider = GUIDE.starttiderAndra(st.guide.starttider, el, { attr: "gst", knapp: "gst", start: st.guide.tider.morgon });
    return visaEnheter();
  }
  const ind = st.indata; if (!ind) return;
  GUIDE.sattStarttider(ind, GUIDE.starttiderAndra(((ind.starttider || {}).morgon) || [], el, { start: (ind.regler || {}).morgon_start || "07:00" }));
  markeraAndrad(true);
});
document.addEventListener("change", e => {
  const el = e.target; if (!el.dataset || el.dataset.st === undefined) return;
  const ind = st.indata; if (!ind) return;
  const l = GUIDE.starttiderAndra(((ind.starttider || {}).morgon) || [], el, { start: (ind.regler || {}).morgon_start || "07:00" });
  if (l) { GUIDE.sattStarttider(ind, l); markeraAndrad(true); }
});
// ---------------------------------------------------------------- regelverk (regelverk.js)
document.addEventListener("change", e => { if (st.indata && e.target.dataset && e.target.dataset.jour && RV.jourAndra(st.indata, e.target)) markeraAndrad(false); });
document.addEventListener("change", e => {
  if (!e.target.dataset || !e.target.dataset.rv || !st.indata) return;
  st.rvVal = e.target.value; ritaInstallningar();
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-rv-anvand]"); if (!el || !st.indata) return;
  const R = RV.hitta(el.dataset.rvAnvand);
  if (!confirm(`Använd ${R.namn}?\n\n${RV.andringar(st.indata, R.id).join("\n") || "Inga värden ändras."}`)) return;
  RV.tillampa(st.indata, R.id); st.rvVal = null;
  meddela(`${R.namn} gäller nu för enheten.`); markeraAndrad(true); ritaInstallningar();
});

// ---------------------------------------------------------------- fliken Kompetens (kompetens.js)
document.addEventListener("change", e => {
  const el = e.target; if (!st.indata || !el.dataset || !(el.dataset.kp || el.dataset.kk !== undefined)) return;
  if (KOMP.hantera(st.indata, st.kompetenser, el)) markeraAndrad(true);
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-kk-ny],[data-kk-bort]"); if (!el || !st.indata) return;
  if (KOMP.hantera(st.indata, st.kompetenser, el)) markeraAndrad(true);
});

// ---------------------------------------------------------------- sidan Organisation (organisation.js)
// Bygg upp verksamheter, enheter, områden/team och aktivitetstyper utan att lägga något schema.
const ritaOmOrg = () => (st.vy === "organisation" ? visaOrganisation() : visaEnheter());
async function visaOrganisation() {
  st.vy = "organisation"; st.enhet = null; ritaMeny(); sokvag([["Enheter", "#/"], ["Organisation"]]);
  const [enheter, org, akt, komp] = await Promise.all([api("GET", "enheter"), api("GET", "organisation").catch(() => ({})), api("GET", "aktivitetstyper").catch(() => ({})), api("GET", "kompetenser").catch(() => ({}))]);
  st.org = ORG.kopia(org.noder); st.akttyper = ORG.aktKopia(akt.typer); st.kompetenser = KOMP.kopia(komp.kompetenser); st.enhetLista = enheter;
  vy().innerHTML = `<section class="kort"><h1>Organisation</h1><p class="dampad" style="margin-top:6px">Verksamheter, enheter, områden och team, och organisationens aktivitetstyper. Allt här går att bygga upp innan något schema läggs. Personal, behov och regler fyller du i sedan, i varje enhet.</p></section>
    ${ORG.importKort(st.org, st.imp)}
    ${ORG.stod(st.org, enheter, st.akttyper, { oppna: st.orgOppna || new Set(), lank: e => `href="#/e/${e.id}/oversikt"` })}
    ${KOMP.orgKort(st.kompetenser)}`;
}
async function sparaKompetenser(l) { await api("PUT", "kompetenser", { kompetenser: l }); st.kompetenser = l; }
// Excel-stöd (SheetJS) för importen, laddas först när det behövs.
function laddaXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ja, nej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = ja; s.onerror = () => nej(new Error("Kunde inte ladda Excel-stödet."));
    document.head.appendChild(s);
  });
}
// Importen: läs filen, visa förhandsvisningen, och lägg in det valda.
async function lasImport(fil) {
  await laddaXlsx();
  const wb = XLSX.read(new Uint8Array(await fil.arrayBuffer()), { type: "array" });
  const plan = ORG.importPlan(ORG.bladUr(XLSX, wb));
  if (!plan.poster.length) throw new Error("Hittade inga enheter i filen. Första raden ska vara rubriker, till exempel Förskola och Avdelning.");
  return { fil: fil.name.replace(/\.[^.]+$/, ""), plan, valda: new Set(plan.poster.map(p => p.nyckel)), bort: new Set(), forelder: plan.forslag && ORG.finns(st.org, plan.forslag) ? plan.forslag : null };
}
document.addEventListener("change", async e => {
  if (st.vy !== "organisation") return;
  const el = e.target;
  try {
    if (el.id === "org-import" && el.files[0]) { st.imp = await lasImport(el.files[0]); return visaOrganisation(); }
    if (el.id === "imp-plats") { st.imp.forelder = el.value || null; return; }
    if (el.dataset && el.dataset.imp) { st.imp.valda = ORG.importVal(st.imp.plan, st.imp.valda, el.dataset.imp, el.checked); $("#imp-forhand").innerHTML = ORG.importForhand(st.imp.plan, st.imp.valda, st.imp.bort); }
    if (el.dataset && el.dataset.impAvd) { if (el.checked) st.imp.bort.delete(el.dataset.impAvd); else st.imp.bort.add(el.dataset.impAvd); $("#imp-forhand").innerHTML = ORG.importForhand(st.imp.plan, st.imp.valda, st.imp.bort); }
  } catch (err) { meddela(err.message); }
});
async function korImport() {
  const r = ORG.importera(st.org, st.imp.plan, st.imp.valda, st.imp.forelder, st.enhetLista || [], st.imp.bort);
  if (r.noder !== st.org) { await api("PUT", "organisation", { noder: r.noder }); st.org = r.noder; }
  for (const x of r.nya) {
    const ind = GUIDE.tomIndata(x.namn); x.team.forEach(t => TEAM.laggTill(ind, t));
    await api("POST", "enheter", { namn: x.namn, indata: ind, org: x.org });
  }
  for (const x of r.andrade) await andraEnhet(x.id, e => { x.team.forEach(t => TEAM.laggTill(e.indata, t)); });
  st.imp = null; st.enhetLista = null;
  meddela(`Importen är klar: ${r.nya.length} nya enheter${r.andrade.length ? ` och nya avdelningar i ${r.andrade.length} enheter som fanns` : ""}.`);
}
async function andraEnhet(id, andring) {
  const e = await api("GET", "enheter/" + id);
  if (andring(e) === false) return;
  await api("PUT", "enheter/" + id, { namn: e.namn, indata: e.indata });
  st.enhet = null; st.enhetLista = null;
}
async function sparaAkttyper(l) { await api("PUT", "aktivitetstyper", { typer: l }); st.akttyper = l; }
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-os]"); if (!el || st.vy !== "organisation") return;
  e.preventDefault();
  const id = el.dataset.e, t = el.dataset.t;
  try {
    switch (el.dataset.os) {
      case "enhet-ny": {
        const namn = prompt(`Namn på den nya enheten i ${ORG.sokvag(st.org, el.dataset.org)}`); if (!namn || !namn.trim()) return;
        await api("POST", "enheter", { namn: namn.trim(), indata: GUIDE.tomIndata(namn.trim()), org: el.dataset.org });
        st.orgOppna = st.orgOppna || new Set(); ORG.vag(st.org, el.dataset.org).forEach(x => st.orgOppna.add(x));
        meddela(`${namn.trim()} är skapad. Lägg till områden eller team, eller öppna enheten och fyll i personal och behov.`); break;
      }
      case "enhet-namn": { const n = prompt("Nytt namn på enheten"); if (!n || !n.trim()) return; await andraEnhet(id, x => { x.namn = n.trim(); x.indata.enhet = n.trim(); }); break; }
      case "team-ny": { const n = prompt("Namn på området eller teamet"); if (!n || !n.trim()) return; await andraEnhet(id, x => { TEAM.laggTill(x.indata, n); }); break; }
      case "team-namn": { const n = prompt("Nytt namn"); if (!n || !n.trim()) return; await andraEnhet(id, x => { TEAM.bytNamn(x.indata, t, n); }); break; }
      case "team-bort": await andraEnhet(id, x => { const tt = (x.indata.team || []).find(y => y.id === t); if (!confirm(`Ta bort ${tt ? tt.namn : t}? Medarbetarna blir utan hemteam.`)) return false; TEAM.taBort(x.indata, t); }); break;
      case "akt-bort": if (!confirm("Ta bort aktivitetstypen? Aktiviteter som redan finns i enheterna ligger kvar.")) return; await sparaAkttyper(ORG.aktTaBort(st.akttyper, el.dataset.id)); break;
      case "import-kor": el.disabled = true; el.textContent = "Importerar …"; await korImport(); break;
      case "import-avbryt": st.imp = null; break;
      case "kom-bort": if (!confirm("Ta bort kompetensen ur listan? Medarbetare och krav i enheterna som redan har den behåller den.")) return; await sparaKompetenser(KOMP.taBort(st.kompetenser, el.dataset.id)); break;
      case "grund": { const r = await api("POST", "grund"); meddela(r.nya || r.avdelningar ? `Förskolorna är inlagda: ${r.nya} nya förskolor och ${r.avdelningar} avdelningar.` : "Alla förskolor och avdelningar finns redan."); break; }
      default: return;
    }
    visaOrganisation();
  } catch (err) { meddela(err.message); }
});
document.addEventListener("change", async e => {
  const el = e.target; if (!el.dataset || !el.dataset.kom || st.vy !== "organisation") return;
  try { await sparaKompetenser(KOMP.andra(st.kompetenser, el.dataset.kom, el.dataset.falt, el.value)); } catch (err) { meddela(err.message); visaOrganisation(); }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "kom-ny") return;
  e.preventDefault();
  try { await sparaKompetenser(KOMP.lagg(st.kompetenser, $("#kom-ny-namn").value)); visaOrganisation(); } catch (err) { meddela(err.message); }
});
document.addEventListener("change", async e => {
  const el = e.target; if (!el.dataset || !el.dataset.akt || st.vy !== "organisation") return;
  try { await sparaAkttyper(ORG.aktAndra(st.akttyper, el.dataset.akt, el.dataset.falt, el.value)); } catch (err) { meddela(err.message); visaOrganisation(); }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "akt-ny") return;
  e.preventDefault();
  try { await sparaAkttyper(ORG.aktLagg(st.akttyper, $("#akt-ny-namn").value)); visaOrganisation(); } catch (err) { meddela(err.message); }
});

// ---------------------------------------------------------------- konton och roller
async function visaKonton() {
  st.vy = "konton"; st.enhet = null; ritaMeny(); sokvag([["Enheter", "#/"], ["Konton"]]);
  const s = st.session || {}, arChef = s.roll === "chef";
  let lista = [];
  try { lista = await api("GET", "anvandare"); } catch { lista = null; }
  const forsta = lista && !lista.length;
  const ROLL = { chef: "Chef – hanterar konton och scheman", schemalaggare: "Schemaläggare – lägger, jämför och godkänner scheman" };
  let h = `<section class="kort"><h1>Konton och roller</h1><p class="dampad" style="margin-top:6px">En <b>chef</b> skapar och tar bort konton. Alla som är inloggade kan lägga, jämföra, godkänna och aktivera scheman${s.far_godkanna === false ? " – men här är godkännandet begränsat till chefer" : ""}. Det sparas vem som godkände. Användarnamnet kan vara en id-kod i stället för ett namn.</p>
    ${s.anvandare ? `<p class="liten">Du är inloggad som <b>${esc(s.anvandare)}</b> (${s.roll === "chef" ? "chef" : "schemaläggare"}).</p>` : s.roll === "schemalaggare" ? `<p class="liten">Du är inloggad med det gemensamma lösenordet (schemaläggare).</p>` : ""}</section>`;
  if (lista && lista.length) h += `<section class="kort"><h2>Konton</h2><div class="rull"><table><thead><tr><th>Användarnamn</th><th>Roll</th><th>Skapat</th><th></th></tr></thead><tbody>
    ${lista.map(u => `<tr><td><b>${esc(u.namn)}</b></td><td>${u.roll === "chef" ? "Chef" : "Schemaläggare"}</td><td>${datum(u.skapad)}</td><td>${arChef && u.namn !== s.anvandare ? `<button class="liten fara" data-g="konto-bort" data-n="${esc(u.namn)}">Ta bort</button>` : ""}</td></tr>`).join("")}</tbody></table></div></section>`;
  if (forsta || arChef) h += `<section class="kort"><h2>${forsta ? "Skapa det första kontot – det blir chef" : "Nytt konto"}</h2>
    <form id="konto-ny" class="falt" style="align-items:end">
      <div><label for="k-namn">Användarnamn</label><input id="k-namn" required minlength="2" maxlength="40" pattern="[A-Za-z0-9_.@\-]+" autocomplete="off"></div>
      ${forsta ? "" : `<div><label for="k-roll">Roll</label><select id="k-roll">${Object.entries(ROLL).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>`}
      <div><label for="k-losen">Lösenord (minst 10 tecken)</label><input id="k-losen" type="password" minlength="10" required autocomplete="new-password"></div>
      <div><button class="primar" type="submit">Skapa konto</button></div></form>
    <p class="dampad liten" style="margin-top:8px">${forsta ? "När kontot är skapat loggar man in med användarnamn och lösenord. Det gemensamma lösenordet fungerar fortfarande och ger rollen schemaläggare." : "Ge personen lösenordet på ett säkert sätt och be dem byta det."}</p></section>`;
  if (s.anvandare) h += `<section class="kort"><h2>Byt ditt lösenord</h2><form id="konto-byt" class="falt" style="align-items:end">
      <div><label for="b-gammalt">Nuvarande lösenord</label><input id="b-gammalt" type="password" required autocomplete="current-password"></div>
      <div><label for="b-nytt">Nytt lösenord (minst 10 tecken)</label><input id="b-nytt" type="password" minlength="10" required autocomplete="new-password"></div>
      <div><button type="submit">Byt lösenord</button></div></form></section>`;
  if (lista === null) h += `<section class="kort"><p class="dampad">Bara en chef kan se och skapa konton.</p></section>`;
  vy().innerHTML = h;
  const ny = $("#konto-ny");
  if (ny) ny.onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api("POST", "anvandare", { namn: $("#k-namn").value.trim(), losenord: $("#k-losen").value, roll: $("#k-roll")?.value || "chef" });
      meddela(forsta ? "Chefskontot är skapat. Logga in med det." : `Kontot är skapat (${r.roll === "chef" ? "chef" : "schemaläggare"}).`);
      if (forsta) { await api("POST", "logga-ut").catch(() => {}); return visaInloggning(); }
      visaKonton();
    } catch (err) { meddela(err.message); }
  };
  const byt = $("#konto-byt");
  if (byt) byt.onsubmit = async e => {
    e.preventDefault();
    try { await api("POST", "anvandare/losenord", { gammalt: $("#b-gammalt").value, nytt: $("#b-nytt").value }); meddela("Lösenordet är bytt."); byt.reset(); }
    catch (err) { meddela(err.message); }
  };
}

async function route() {
  stoppaPollning();
  stangLada();
  $("#tips").classList.remove("syns");
  const [sokv, fraga] = location.hash.replace(/^#/, "").split("?");
  const d = sokv.split("/").filter(Boolean), q = new URLSearchParams(fraga);
  try {
    const s = await api("GET", "session");
    if (!s.inloggad) return visaInloggning(s);
    kravsInloggning = s.kravs; st.session = s;
    if (st.enhet && st.andrad && !(d[0] === "e" && +d[1] === st.enhet.id)) await spara();
    if (!st.enhetLista) { try { st.enhetLista = await api("GET", "enheter"); } catch { st.enhetLista = []; } }
    if (d[0] === "e") {
      const id = +d[1], vyn = d[2] || "schema", kid = d[3] ? +d[3] : null;
      if (vyn === "indata") await visaEnhet(id, q.get("flik"));
      else if (vyn === "installningar") await visaInstallningar(id);
      else if (vyn === "analys") await visaAnalys(id);
      else if (vyn === "oversikt") await visaOversikt(id);
      else if (vyn === "kalender") await visaKalender(id);
      else if (vyn === "behov") await visaBehov(id);
      else if (vyn === "bemanningsbalans") await visaBemanningsbalans(id);
      else if (vyn === "medarbetare") await visaMedarbetare(id, kid, q);
      else if (vyn === "aktiviteter") await visaAktiviteter(id);
      else if (vyn === "nyckeltal") await visaNyckeltal(id, kid);
      else if (vyn === "regelkontroll") await visaRegelkontroll(id, kid);
      else if (vyn === "rapporter") await visaRapporter(id);
      else await visaKorningsvy(id, vyn, kid, q);
    } else if (d[0] === "jamfor") await visaJamfor(d[1].split(",").map(Number));
    else if (d[0] === "konton") await visaKonton();
    else if (d[0] === "organisation") await visaOrganisation();
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
