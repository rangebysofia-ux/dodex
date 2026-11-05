"use strict";
// Schemasystem – webbgränssnitt. Vyer styrs av adressens #-del:
//   #/                 enheter
//   #/enhet/3          redigera enhet 3 (flik i ?flik=)
//   #/korning/7        resultat för körning 7
//   #/jamfor/7,8       jämför körningar

const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const DELAR = { morgon: "Morgon", kvall: "Kväll", natt: "Natt" };
const ARBETAR = { "morgon,kvall": "Dag och kväll", "morgon": "Bara morgon", "kvall": "Bara kväll", "natt": "Natt" };
const HELGER = { "2/4": "Varannan (2/4)", "1/4": "Var fjärde (1/4)", "3/4": "Tre av fyra (3/4)", "alla": "Alla", "ingen": "Inga" };
const ONSKTYP = { ledig: "Ledig", arbetar: "Arbetar", tidigast_start: "Börjar tidigast", senast_slut: "Slutar senast", endast_dygnsdel: "Bara dygnsdel" };
const DAGNYCKEL = { vardag: "Vardagar", helg: "Helg (lör–sön)", alla: "Alla dagar", "mån": "Måndag", "tis": "Tisdag", "ons": "Onsdag", "tor": "Torsdag", "fre": "Fredag", "lör": "Lördag", "sön": "Söndag" };
const KPI = [["vakanta_pass", "Vakanta pass"], ["vakanta_tidpunkter", "Vakanta tidpunkter"], ["blocklangd", "Arbetsdagar i följd över 4"],
  ["passlangd", "Passlängd, avvikelse i minuter"], ["rattvisa", "Rättvisa, spridning"], ["onskemal", "Brutna önskemål"]];

// Regler som visas på fliken Regler. Avtal och lag är låsta: de får aldrig försvagas.
const REGLER = [
  { k: "dygnsvila_minuter", namn: "Dygnsvila", niva: "avtal", typ: "hård", visa: v => tim(v), last: true, std: 660 },
  { k: "veckovila_minuter", namn: "Veckovila", niva: "avtal", typ: "hård", visa: v => tim(v), last: true, std: 2160 },
  { k: "rast_grans_minuter", namn: "Rast efter högst", niva: "lag", typ: "hård", visa: v => tim(v) + " arbete", last: true, std: 300 },
  { k: "rast_minuter", namn: "Rastens längd", niva: "lag", typ: "hård", visa: v => v + " min", last: true, std: 30 },
  { k: "dygnsbryt", namn: "Dygnsbryt", niva: "avtal", typ: "hård", visa: v => v === "auto" ? "föreslås automatiskt" : v, last: true, std: "auto" },
  { k: "pass_per_vecka", namn: "Pass per vecka, dag och kväll", niva: "lokal regel", typ: "hård", falt: "tal", steg: 0.25, std: 4.75 },
  { k: "helgfrekvens", namn: "Varannan helg", niva: "lokal regel", typ: "hård", visa: () => "låst för enheten", last: true, std: "2/4" },
  { k: "hel_helg", namn: "Arbetshelg är både lördag och söndag", niva: "lokal regel", typ: "hård", falt: "check", std: true },
  { k: "ingen_fredagskvall_fore_ledig_helg", namn: "Ingen fredagskväll före ledig helg", niva: "lokal regel", typ: "hård", falt: "check", std: true },
  { k: "block_min", namn: "Minst antal arbetsdagar i följd", niva: "lokal regel", typ: "hård", falt: "tal", steg: 1, std: 2 },
  { k: "block_max", namn: "Högst antal arbetsdagar i följd", niva: "lokal regel", typ: "hård", falt: "tal", steg: 1, std: 5 },
  { k: "block_rekommenderat", namn: "Helst högst antal dagar i följd", niva: "princip", typ: "mjuk", falt: "tal", steg: 1, std: 4 },
  { k: "morgon_start", namn: "Morgonpass börjar", niva: "princip", typ: "hård", falt: "tid", std: "07:00" },
  { k: "kvall_slut", namn: "Kvällspass slutar", niva: "princip", typ: "hård", falt: "tid", std: "22:00" },
  { k: "kant_fran", namn: "Passbyte tidigast", niva: "princip", typ: "hård", falt: "tid", std: "12:00" },
  { k: "kant_till", namn: "Passbyte senast", niva: "princip", typ: "hård", falt: "tid", std: "18:00" },
  { k: "tolerans_minuter", namn: "Tolerans för arbetstid (minuter)", niva: "kontrakt", typ: "hård", falt: "tal", steg: 15, std: 60 },
];

let st = { enhet: null, indata: null, andrad: false, flik: "personal", kontroll: null, korningar: [], valdaKorningar: new Set(),
  korning: null, vecka: 0, valdCell: null, redigeraOnsk: null, pollning: null };

const $ = sel => document.querySelector(sel);
const vy = () => $("#vy");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tim = m => `${Math.floor(m / 60)} h${m % 60 ? " " + String(m % 60).padStart(2, "0") : ""}`;
const timmar = m => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
const datum = s => new Date(s * 1000).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
const sv = x => String(x).replace(".", ",");
const nk = n => "niva-" + String(n).replace(/\s+/g, "-");

function meddela(text) {
  const m = $("#meddelande");
  m.textContent = text; m.classList.add("syns");
  clearTimeout(meddela.t); meddela.t = setTimeout(() => m.classList.remove("syns"), 2600);
}

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

// ---------------------------------------------------------------- inloggning

function visaInloggning() {
  stoppaPollning();
  sokvag([]);
  $("#logga-ut").hidden = true;
  vy().innerHTML = `<form class="kort inloggning" id="inlogg">
    <h1>Logga in</h1>
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
$("#logga-ut").onclick = async () => { await api("POST", "logga-ut"); visaInloggning(); };

// ---------------------------------------------------------------- vy: enheter

async function visaEnheter() {
  sokvag([["Enheter"]]);
  const [enheter, exempel] = await Promise.all([api("GET", "enheter"), api("GET", "exempel")]);
  vy().innerHTML = `
    <section class="kort">
      <div class="rubrikrad"><h1>Enheter</h1><div><button class="primar" data-g="ny-enhet">Ny enhet</button></div></div>
      <p class="dampad" style="margin-top:6px">En enhet är en arbetsgrupp med personal, behov, önskemål och regler. Varje gång du lägger ett schema sparas det som en körning.</p>
    </section>
    <section class="lista-enheter">${enheter.length ? enheter.map(e => `
      <div class="kort enhet">
        <div><a class="namn" href="#/enhet/${e.id}">${esc(e.namn)}</a>
          <div class="dampad liten">${e.personer ?? 0} personer · ${e.korningar} körningar · ändrad ${datum(e.andrad)}</div></div>
        <div class="chips"><a class="knapp" href="#/enhet/${e.id}">Öppna</a>
          <button data-g="kopiera" data-id="${e.id}">Kopiera</button>
          <button class="fara" data-g="ta-bort-enhet" data-id="${e.id}" data-namn="${esc(e.namn)}">Ta bort</button></div>
      </div>`).join("") : `<div class="kort tom">Inga enheter än. Skapa en ny eller börja från ett exempel nedan.</div>`}</section>
    <section class="kort">
      <h2>Börja från ett exempel</h2>
      <p class="dampad liten">Testfallen från projektet. De använder id-koder i stället för namn.</p>
      <div class="rull"><table><tbody>${exempel.map((x, i) => `<tr><td><b>${esc(x.namn)}</b><div class="dampad liten">${esc(x.beskrivning)}</div></td>
        <td class="nw"><button data-g="fran-exempel" data-i="${i}">Skapa</button></td></tr>`).join("")}</tbody></table></div>
    </section>`;
  st.exempel = exempel;
}

const NY_INDATA = () => ({
  enhet: "", veckor: 4, cykliskt: true,
  behov: { vardag: { morgon: 2, kvall: 2, natt: 1 }, helg: { morgon: 2, kvall: 2, natt: 1 } },
  personal: [{ id: "A1", grad: 1 }, { id: "A2", grad: 1 }, { id: "A3", grad: 0.75 }, { id: "N1", grad: 1, dygnsdelar: ["natt"] }],
  onskemal: [], losare: { tid_per_steg_s: 15 },
});

// ---------------------------------------------------------------- vy: enhet

async function visaEnhet(id, flik) {
  if (!st.enhet || st.enhet.id !== id) {
    const e = await api("GET", "enheter/" + id);
    st.enhet = e; st.indata = e.indata; st.andrad = false; st.kontroll = null; st.valdaKorningar = new Set(); st.redigeraOnsk = null;
  }
  st.flik = flik || st.flik || "personal";
  st.korningar = await api("GET", `enheter/${id}/korningar`);
  sokvag([["Enheter", "#/"], [st.enhet.namn]]);
  ritaEnhet();
  kontrollera();
  if (st.korningar.some(k => k.status === "i kö" || k.status === "kör")) startaPollning(() => uppdateraKorningar());
}

function ritaEnhet() {
  const F = [["personal", "Personal"], ["behov", "Behov"], ["onskemal", "Önskemål"], ["regler", "Regler"], ["period", "Period"], ["json", "Avancerat"]];
  vy().innerHTML = `
    <section class="kort">
      <div class="rubrikrad">
        <div style="flex:1;min-width:200px"><label for="enhet-namn">Enhet</label><input id="enhet-namn" value="${esc(st.enhet.namn)}" style="font-size:18px;font-weight:600"></div>
        <div><button id="spara" ${st.andrad ? "" : "disabled"}>Sparat</button>
          <button class="primar" data-g="lagg-schema">Lägg schema</button></div>
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
  uppdateraSparaknapp();
}

function ritaFlik() {
  const i = st.indata;
  switch (st.flik) {
    case "personal": return `
      <p class="dampad liten">Använd id-koder, inte namn. Antal pass räknas ut från perioden om fältet är tomt: ${sv(regel("pass_per_vecka"))} pass per vecka för dag och kväll, och efter nattpassets längd för natt.</p>
      <div class="rull"><table class="form personal"><thead><tr><th>Id</th><th>Grad %</th><th>Arbetar</th><th>Helger</th><th>Grupp</th><th title="Antal pass under perioden">Pass</th><th></th></tr></thead><tbody>
      ${i.personal.map((p, n) => {
        const del = (p.dygnsdelar || ["morgon", "kvall"]).join(",");
        return `<tr>
          <td data-l="Id"><input data-s="personal.${n}.id" value="${esc(p.id)}" style="width:64px" aria-label="Id"></td>
          <td data-l="Grad %"><input data-s="personal.${n}.grad" data-t="procent" type="number" inputmode="numeric" min="10" max="100" step="5" value="${Math.round((p.grad ?? 1) * 100)}" style="width:70px" aria-label="Sysselsättningsgrad"></td>
          <td data-l="Arbetar"><select data-s="personal.${n}.dygnsdelar" data-t="dygnsdelar" aria-label="Arbetar">${Object.entries(ARBETAR).map(([v, t]) => `<option value="${v}"${v === del ? " selected" : ""}>${t}</option>`).join("")}</select></td>
          <td data-l="Helger"><select data-s="personal.${n}.helgfrekvens" data-t="valfri" aria-label="Helger"${p.helgfrekvens && p.helgfrekvens !== "2/4" ? ' class="undantag"' : ""}><option value="">Varannan</option>${Object.entries(HELGER).filter(([v]) => v !== "2/4").map(([v, t]) => `<option value="${v}"${v === p.helgfrekvens ? " selected" : ""}>Undantag: ${t.toLowerCase()}</option>`).join("")}</select></td>
          <td data-l="Helggrupp"><select data-s="personal.${n}.helggrupp" data-t="valfri" aria-label="Helggrupp"><option value="">Auto</option><option${p.helggrupp === "A" ? " selected" : ""}>A</option><option${p.helggrupp === "B" ? " selected" : ""}>B</option></select></td>
          <td data-l="Antal pass"><input data-s="personal.${n}.antal_pass" data-t="pass" value="${esc(Array.isArray(p.antal_pass) ? p.antal_pass.join(", ") : p.antal_pass ?? "")}" placeholder="auto" style="width:64px" aria-label="Antal pass"></td>
          <td class="bort"><button class="liten fara" data-g="ta-bort-person" data-n="${n}" aria-label="Ta bort ${esc(p.id)}">×</button></td></tr>`;
      }).join("")}</tbody></table></div>
      <p style="margin-top:10px"><button data-g="ny-person">+ Lägg till person</button> <button data-g="ny-person" data-natt="1">+ Nattperson</button></p>
      ${undantagText()}
      <p class="dampad liten">Alla arbetar varannan helg (hård lokal regel). Undantag görs per person under Helger, till exempel för den som enligt sitt kontrakt inte arbetar helg. Helggrupp A arbetar helgerna i vecka 1, 3, 5 …, grupp B i vecka 2, 4, 6 … Auto låter lösaren välja med lika många i varje grupp.</p>`;

    case "behov": {
      const b = i.behov || {};
      const tp = [];
      Object.entries(i.tidpunkter || {}).forEach(([k, l]) => l.forEach(t => tp.push({ k, ...t })));
      return `
      <p class="dampad liten">Antal pass per dygnsdel. Rader längre ned skriver över rader ovanför, till exempel en egen rad för fredag.</p>
      <div class="rull"><table class="form"><thead><tr><th>Dagar</th><th>Morgon</th><th>Kväll</th><th>Natt</th><th></th></tr></thead><tbody>
      ${Object.keys(b).map(k => `<tr><th>${DAGNYCKEL[k] || esc(k)}</th>${Object.keys(DELAR).map(d =>
        `<td><input type="number" inputmode="numeric" min="0" data-s="behov.${k}.${d}" data-t="heltal" value="${b[k][d] ?? 0}" style="width:70px" aria-label="${DAGNYCKEL[k]} ${DELAR[d]}"></td>`).join("")}
        <td>${["vardag", "helg"].includes(k) ? "" : `<button class="liten fara" data-g="ta-bort-behov" data-k="${k}" aria-label="Ta bort">×</button>`}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="chips" style="margin-top:10px"><label for="ny-behovsdag" style="border:0;padding:0">Egen rad för</label>
        <select id="ny-behovsdag" style="width:auto">${Object.keys(DAGNYCKEL).filter(k => !b[k]).map(k => `<option value="${k}">${DAGNYCKEL[k]}</option>`).join("")}</select>
        <button data-g="ny-behovsrad">Lägg till</button></div>

      <h3>Minst i tjänst vid klockslag</h3>
      <p class="dampad liten">Till exempel mitt på dagen när morgon och kväll överlappar.</p>
      ${tp.length ? `<div class="rull"><table class="form"><thead><tr><th>Dagar</th><th>Klockslag</th><th>Antal</th><th></th></tr></thead><tbody>
        ${tp.map((t, n) => `<tr><td><select data-tp="${n}" data-f="k">${Object.keys(DAGNYCKEL).map(k => `<option value="${k}"${k === t.k ? " selected" : ""}>${DAGNYCKEL[k]}</option>`).join("")}</select></td>
          <td><input type="time" data-tp="${n}" data-f="tid" value="${esc(t.tid)}" style="width:110px"></td>
          <td><input type="number" min="0" data-tp="${n}" data-f="antal" value="${t.antal}" style="width:70px"></td>
          <td><button class="liten fara" data-g="ta-bort-tp" data-n="${n}" aria-label="Ta bort">×</button></td></tr>`).join("")}</tbody></table></div>` : ""}
      <p style="margin-top:8px"><button data-g="ny-tp">+ Lägg till klockslag</button></p>`;
    }

    case "onskemal": return ritaOnskemal();

    case "regler": {
      const r = i.regler || {};
      const np = (i.nattpass && i.nattpass[0]) || { start: "21:45", slut: "07:15" };
      return `
      <p class="dampad liten">Nivån visar varifrån regeln kommer. Avtal och lag kan inte ändras, och inte heller varannan helg, som verksamheten har beslutat ska vara hård. Övriga lokala regler och principer går att justera.</p>
      ${REGLER.map(R => {
        const v = r[R.k] ?? R.std;
        let falt;
        if (R.last) falt = `<span class="lat">${esc(R.visa(v))}</span>`;
        else if (R.falt === "check") falt = `<label class="check" style="justify-content:flex-end"><input type="checkbox" data-r="${R.k}" data-t="check"${v ? " checked" : ""}> ${v ? "På" : "Av"}</label>`;
        else if (R.falt === "val") falt = `<select data-r="${R.k}">${Object.entries(R.val).map(([a, t]) => `<option value="${a}"${a === v ? " selected" : ""}>${t}</option>`).join("")}</select>`;
        else if (R.falt === "tid") falt = `<input type="time" data-r="${R.k}" value="${esc(v)}">`;
        else falt = `<input type="number" inputmode="decimal" step="${R.steg}" data-r="${R.k}" data-t="tal" value="${v}">`;
        return `<div class="regel"><div><div class="namn">${R.namn}</div><span class="niva ${nk(R.niva)}">${R.niva}</span> <span class="niva">${R.typ}</span>${r[R.k] !== undefined && !R.last ? ` <button class="lank liten" data-g="aterstall-regel" data-k="${R.k}">Återställ (${esc(R.std === true ? "på" : R.std === false ? "av" : R.std)})</button>` : ""}</div>${falt}</div>`;
      }).join("")}
      <div class="regel"><div><div class="namn">Heltid, timmar per vecka</div><span class="niva">kontrakt</span> <span class="niva">hård</span></div>
        <input type="number" step="0.25" data-heltid value="${(i.heltid_minuter_per_vecka ?? 2220) / 60}"></div>
      <div class="regel"><div><div class="namn">Nattpass</div><span class="niva">princip</span></div>
        <div style="display:flex;gap:6px"><input type="time" data-natt="start" value="${esc(np.start)}" aria-label="Nattpass börjar"><input type="time" data-natt="slut" value="${esc(np.slut)}" aria-label="Nattpass slutar"></div></div>
      <p class="dampad liten" style="margin-top:10px">Behovet är högsta mjuka nivå: när personalen inte räcker blir det en synlig vakans, aldrig ett avtalsbrott.</p>`;
    }

    case "period": return `
      <div class="falt">
        <div><label for="p-veckor">Veckor i perioden</label><input id="p-veckor" type="number" min="1" max="16" data-s="veckor" data-t="heltal" value="${i.veckor}"></div>
        <div><label for="p-iso">Första veckans veckonummer</label><input id="p-iso" type="number" min="1" max="53" data-s="start_iso_vecka" data-t="valfritt-tal" value="${i.start_iso_vecka ?? ""}" placeholder="schemats egna"></div>
        <div><label for="p-delp">Delperioder (veckor)</label><input id="p-delp" data-s="delperioder" data-t="lista" value="${esc((i.delperioder || []).join(", "))}" placeholder="hela perioden"></div>
        <div><label for="p-tid">Sekunder per optimeringssteg</label><input id="p-tid" type="number" min="1" max="60" data-s="losare.tid_per_steg_s" data-t="tal" value="${i.losare?.tid_per_steg_s ?? 15}"></div>
      </div>
      <p style="margin-top:12px"><label class="check"><input type="checkbox" data-s="cykliskt" data-t="check"${i.cykliskt !== false ? " checked" : ""}> Cykliskt: sista veckan följs av vecka 1 igen</label></p>
      <p class="dampad liten">Med ${sv(regel("pass_per_vecka"))} pass per vecka blir antalet pass ett heltal bara när perioden är en multipel av 4 veckor. Vid till exempel 6 veckor anger du antal pass per person (28 eller 29). Veckonumret används för önskemål på jämna och udda veckor.</p>`;

    case "json": return `
      <p class="dampad liten">All indata som JSON, enligt docs/indata-schema.md.</p>
      <textarea id="json" spellcheck="false" aria-label="Indata som JSON">${esc(JSON.stringify(st.indata, null, 2))}</textarea>
      <p style="margin-top:8px"><button data-g="anvand-json">Använd JSON</button> <span id="json-fel" class="liten" style="color:var(--dalig)"></span></p>`;
  }
  return "";
}

function undantag() {
  return st.indata.personal.filter(p => p.helgfrekvens && p.helgfrekvens !== "2/4");
}
function undantagText() {
  const u = undantag();
  return u.length ? `<div class="banner varn liten" style="margin-top:10px"><strong>Undantag från varannan helg</strong>${u.map(p => `${esc(p.id)}: ${HELGER[p.helgfrekvens].toLowerCase()}`).join(", ")}</div>` : "";
}

function regel(k) { return st.indata.regler?.[k] ?? REGLER.find(r => r.k === k).std; }

// ---------------------------------------------------------------- önskemål

function tomtOnsk() { return { person: st.indata.personal[0]?.id || "", typ: "ledig", dagar: [], veckor: "alla", krav: false, vikt: 1 }; }

function ritaOnskemal() {
  const lista = st.indata.onskemal || [];
  const varn = {};
  (st.kontroll?.onskemal || []).forEach(w => (varn[w.id] = w.varning));
  const text = st.kontroll?.onskemal_text || {};
  const o = st.redigeraOnsk;
  let h = `<p class="dampad liten">Önskemål vägs in efter behov, blocklängd, passlängd och rättvisa. Ett krav måste uppfyllas; går det inte blir schemat olösbart och förklaringen pekar ut kravet.</p>`;
  if (o) h += ritaOnskForm(o.data, o.index);
  else h += `<p><button class="primar" data-g="nytt-onsk">+ Nytt önskemål</button></p>`;
  h += lista.length ? lista.map((x, n) => {
    const id = x.id || `O${n + 1}`;
    return `<div class="onsk"><div><div>${x.krav ? `<span class="niva niva-avtal">krav</span> ` : ""}${esc(text[id] || `${x.person} ${ONSKTYP[x.typ]}`)}</div>
      ${x.kommentar ? `<div class="dampad liten">${esc(x.kommentar)}</div>` : ""}
      ${varn[id] ? `<div class="varning">⚠ ${esc(varn[id].replace(/^\S+ \(.*?\) /, ""))}</div>` : ""}</div>
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
    const typ = $("#o-typ").value;
    const r = $("#o-varde-ruta");
    if (typ === "tidigast_start" || typ === "senast_slut")
      r.innerHTML = `<label for="o-varde">Klockslag</label><input id="o-varde" type="time" value="${esc(typeof o.varde === "string" && o.varde.includes(":") ? o.varde : typ === "tidigast_start" ? "08:00" : "14:00")}">`;
    else if (typ === "endast_dygnsdel")
      r.innerHTML = `<label for="o-varde">Dygnsdel</label><select id="o-varde">${Object.entries(DELAR).map(([k, t]) => `<option value="${k}"${k === o.varde ? " selected" : ""}>${t}</option>`).join("")}</select>`;
    else r.innerHTML = "";
  };
  vardeRuta();
  $("#o-typ").onchange = vardeRuta;
  if ($("#o-veckor")) $("#o-veckor").onchange = () => ($("#o-vissa").hidden = $("#o-veckor").value !== "vissa");
  f.querySelectorAll("[name=o-krav]").forEach(r => (r.onchange = () => ($("#o-vikt-ruta").hidden = r.value === "1" && r.checked)));
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

// ---------------------------------------------------------------- kontroll och körningar

function ritaKontroll() {
  const k = st.kontroll;
  if (!k) return `<h2>Kontroll</h2><p class="dampad liten"><span class="spinner"></span>Räknar …</p>`;
  if (k.natfel) return `<h2>Kontroll</h2><p class="dampad liten">${esc(k.natfel)}</p>`;
  let h = `<h2>Kontroll</h2>`;
  if (k.fel.length) return h + `<div class="banner dalig"><strong>${k.fel.length === 1 ? "Ett fel" : k.fel.length + " fel"} att rätta</strong></div><ul class="punkter liten" style="margin-top:8px">${k.fel.map(f => `<li>${esc(f)}</li>`).join("")}</ul>`;
  const b = k.balans;
  h += `<div class="banner ${b.forvantade_vakanser ? "varn" : "ok"}"><strong>${b.forvantade_vakanser ? `Cirka ${b.forvantade_vakanser} vakanta pass` : "Personalen räcker"}</strong><span class="liten">Bemanningsbalans före schemaläggningen</span></div>
    <div class="rull" style="margin-top:8px"><table class="liten"><thead><tr><th></th><th class="tal">Behov</th><th class="tal">Finns</th></tr></thead><tbody>
    ${b.rader.slice(0, 2).map(r => `<tr><td>${esc(r.namn)}</td><td class="tal">${r.behov}</td><td class="tal">${r.tillgang}</td></tr>`).join("")}</tbody></table></div>`;
  if (b.atgarder.length) h += `<h3>Förslag</h3><ul class="punkter liten">${b.atgarder.map(a => `<li>${esc(a)}</li>`).join("")}</ul>`;
  const hv = b.helger.filter(x => x.vakanser);
  if (hv.length) h += `<p class="liten dampad">Helger med brist: ${hv.map(x => `v${x.vecka}`).join(", ")}.</p>`;
  const u = undantag();
  if (u.length) h += `<h3>Undantag från varannan helg</h3><p class="liten">${u.map(p => `${esc(p.id)}: ${HELGER[p.helgfrekvens].toLowerCase()}`).join(", ")}</p>`;
  if (k.onskemal.length) h += `<h3>Önskemål</h3><ul class="punkter liten">${k.onskemal.map(w => `<li>${esc(w.varning)}</li>`).join("")}</ul>`;
  b.varningar.forEach(v => (h += `<p class="dampad liten">${esc(v)}</p>`));
  return h;
}

function ritaKorningar() {
  const l = st.korningar;
  let h = `<div class="rubrikrad"><h2 style="margin:0">Körningar</h2>${st.valdaKorningar.size >= 2 ? `<button class="liten" data-g="jamfor">Jämför ${st.valdaKorningar.size}</button>` : ""}</div>`;
  if (!l.length) return h + `<p class="dampad liten" style="margin-top:8px">Inga körningar än. Klicka på Lägg schema.</p>`;
  h += `<div style="margin-top:8px">` + l.map(k => {
    const s = statusFor(k);
    return `<div class="onsk"><label class="check" style="align-items:flex-start"><input type="checkbox" data-g="valj-korning" data-id="${k.id}"${st.valdaKorningar.has(k.id) ? " checked" : ""} aria-label="Välj för jämförelse">
      <span><a href="#/korning/${k.id}">${esc(k.namn)}</a><br><span class="status ${s.klass}">${s.text}</span> <span class="dampad liten">${datum(k.skapad)}</span></span></label></div>`;
  }).join("") + `</div>`;
  if (l.length >= 2) h += `<p class="dampad liten">Kryssa i två eller fler för att jämföra.</p>`;
  return h;
}

function statusFor(k) {
  if (k.status === "i kö" || k.status === "kör") return { klass: "kor", text: k.steg || "Kör" };
  if (k.status === "fel") return { klass: "dalig", text: "Fel" };
  if (k.losning !== "OK") return { klass: "dalig", text: k.losning === "INFEASIBLE" ? "Går inte att lägga" : "Inget schema" };
  const v = k.kpi?.vakanta_pass + k.kpi?.vakanta_tidpunkter;
  if (k.brott) return { klass: "dalig", text: `${k.brott} brott` };
  return v ? { klass: "kor", text: `${v} vakanser` } : { klass: "ok", text: "Klart" };
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
    if (st.flik === "onskemal" && !st.redigeraOnsk) { $("#flik").innerHTML = ritaFlik(); }
  }, 400);
}

function markeraAndrad(rita) {
  st.andrad = true;
  uppdateraSparaknapp();
  if (rita) { $("#flik").innerHTML = ritaFlik(); kopplaOnskForm(); uppdateraFlikrubriker(); }
  kontrollera();
  clearTimeout(markeraAndrad.t);
  markeraAndrad.t = setTimeout(spara, 1500);  // spara automatiskt efter en kort paus
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
    sokvag([["Enheter", "#/"], [st.enhet.namn]]);
    return true;
  } catch (e) { meddela("Kunde inte spara: " + e.message); return false; }
}

// Ändringar i formulär: data-s="personal.2.grad" med data-t som anger typ.
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

document.addEventListener("input", e => {
  const el = e.target;
  if (!st.indata || !el.closest("#flik")) return;
  if (el.dataset.s) { sattVarde(el.dataset.s, tolka(el)); markeraAndrad(el.dataset.s.endsWith(".helgfrekvens")); }
  else if (el.dataset.r) {
    st.indata.regler = st.indata.regler || {};
    const R = REGLER.find(r => r.k === el.dataset.r);
    const v = el.dataset.t === "check" ? el.checked : el.dataset.t === "tal" ? parseFloat(el.value.replace(",", ".")) : el.value;
    if (v === R.std || (typeof v === "number" && isNaN(v))) delete st.indata.regler[R.k]; else st.indata.regler[R.k] = v;
    if (!Object.keys(st.indata.regler).length) delete st.indata.regler;
    markeraAndrad(el.dataset.t === "check");
  } else if (el.dataset.heltid !== undefined) {
    const h = parseFloat(el.value.replace(",", "."));
    if (h > 0) { st.indata.heltid_minuter_per_vecka = Math.round(h * 60); markeraAndrad(false); }
  } else if (el.dataset.natt) {
    const np = (st.indata.nattpass && st.indata.nattpass[0]) || { id: "N", start: "21:45", slut: "07:15", maltidsuppehall: true };
    np[el.dataset.natt] = el.value;
    st.indata.nattpass = [np];
    markeraAndrad(false);
  } else if (el.dataset.tp !== undefined) {
    const tp = [];
    Object.entries(st.indata.tidpunkter || {}).forEach(([k, l]) => l.forEach(t => tp.push({ k, ...t })));
    const t = tp[+el.dataset.tp];
    t[el.dataset.f] = el.dataset.f === "antal" ? parseInt(el.value) || 0 : el.value;
    byggTidpunkter(tp);
    markeraAndrad(el.dataset.f === "k");
  }
});
document.addEventListener("change", e => {
  // select-fält skickar input i de flesta webbläsare, men inte alla
  if (e.target.tagName === "SELECT" && e.target.closest("#flik") && (e.target.dataset.s || e.target.dataset.r || e.target.dataset.tp !== undefined))
    e.target.dispatchEvent(new Event("input", { bubbles: true }));
});

function byggTidpunkter(tp) {
  const ut = {};
  tp.forEach(({ k, tid, antal }) => (ut[k] = ut[k] || []).push({ tid, antal }));
  if (Object.keys(ut).length) st.indata.tidpunkter = ut; else delete st.indata.tidpunkter;
}

async function laggSchema() {
  if (!(await spara())) return;
  try {
    const { id } = await api("POST", `enheter/${st.enhet.id}/korningar`, {});
    location.hash = "#/korning/" + id;
  } catch (e) {
    if (e.status === 422) { meddela("Rätta felen i kontrollen först."); st.kontroll = { fel: e.data.fel, onskemal: [] }; $("#kontroll").innerHTML = ritaKontroll(); }
    else meddela(e.message);
  }
}

// ---------------------------------------------------------------- vy: körning

async function visaKorning(id) {
  const k = await api("GET", "korningar/" + id);
  if (!st.enhet || st.enhet.id !== k.enhet_id) {
    try { const e = await api("GET", "enheter/" + k.enhet_id); st.enhet = e; st.indata = e.indata; st.andrad = false; } catch { st.enhet = null; }
  }
  if (!st.korning || st.korning.id !== k.id) { st.vecka = 0; st.valdCell = null; }
  st.korning = k;
  sokvag([["Enheter", "#/"], [st.enhet?.namn || "Enhet", st.enhet ? `#/enhet/${k.enhet_id}` : null], [k.namn]]);
  ritaKorning();
  if (k.status === "i kö" || k.status === "kör") startaPollning(async () => {
    const n = await api("GET", "korningar/" + id);
    st.korning = n; ritaKorning();
    return n.status === "i kö" || n.status === "kör";
  });
}

function ritaKorning() {
  const k = st.korning, res = k.resultat, g = k.granskning, f = k.forklaring, b = k.balans;
  let h = `<section class="kort"><div class="rubrikrad"><div style="display:block"><h1>${esc(k.namn)}</h1><div class="dampad liten">${datum(k.skapad)}${k.sekunder ? ` · beräknat på ${sv(k.sekunder)} s` : ""}</div></div>
    <div>${res?.status === "OK" ? `<a class="knapp" href="api/korningar/${k.id}/excel">Excel</a><a class="knapp" href="api/korningar/${k.id}/pdf">PDF</a>` : ""}
    <a class="knapp" href="#/enhet/${k.enhet_id}">Tillbaka till enheten</a></div></div></section>`;
  if (k.status === "i kö" || k.status === "kör") {
    vy().innerHTML = h + `<section class="kort"><div class="banner varn"><strong><span class="spinner"></span>${esc(k.steg || "Väntar")} …</strong>
      Lösaren optimerar i ordning: vakanser, arbetsdagar i följd, passlängd, rättvisa, önskemål. Det tar vanligen mellan några sekunder och ett par minuter. Du kan lämna sidan.</div>
      ${b ? `<p class="dampad" style="margin-top:10px">Bemanningsbalansen förutser ${b.forvantade_vakanser} vakanta pass.</p>` : ""}</section>`;
    return;
  }
  if (k.status === "fel") { vy().innerHTML = h + `<section class="kort"><div class="banner dalig"><strong>Schemat kunde inte läggas</strong>${esc(k.fel)}</div></section>`; return; }

  if (res.status === "OK") {
    const brott = g ? g.brott.length : 0;
    h += `<section class="kort"><div class="banner ${res.kpi.vakanser || brott ? "dalig" : "ok"}"><strong>${
      brott ? `${brott} brott mot hårda regler` : res.kpi.vakanser ? `Schema klart, med ${res.kpi.vakanser} vakanser` : "Schema klart, utan vakanser och avtalsbrott"}</strong>
      ${res.veckor} veckor${res.cykliskt ? ", cykliskt" : ""} · ${Object.keys(res.schema).length} personer</div>
      <div class="kpi">${KPI.map(([n, t]) => `<div class="${n.startsWith("vakanta") && res.kpi[n] ? "fel" : ""}"><b>${res.kpi[n]}</b><span>${t}</span></div>`).join("")}
        <div class="${brott ? "fel" : ""}"><b>${brott}</b><span>Brott i granskningen</span></div></div>
      ${b ? `<p class="dampad liten" style="margin-top:10px">Bemanningsbalansen förutsåg ${b.forvantade_vakanser} vakanta pass${b.forvantade_vakanser === res.kpi.vakanta_pass ? ", vilket stämde." : `; lösaren fick ${res.kpi.vakanta_pass}.`}</p>` : ""}</section>`;
    h += `<section class="kort"><h2>Schema</h2><div class="veckor" role="group" aria-label="Vecka">` +
      Array.from({ length: res.veckor }, (_, v) => `<button data-g="vecka" data-v="${v}" aria-pressed="${v === st.vecka}">V${v + 1}</button>`).join("") +
      `<button data-g="vecka" data-v="-1" aria-pressed="${st.vecka === -1}">Alla</button></div>` +
      (st.vecka === -1 ? Array.from({ length: res.veckor }, (_, v) => `<h3>Vecka ${v + 1}</h3>` + schemaVecka(res, v)).join("") : schemaVecka(res, st.vecka)) +
      `<p class="info" id="info">${cellInfo(res)}</p><p class="dampad liten">M morgon, K kväll, N natt. Raden I tjänst räknar pass per dygnsdel; röd betyder vakans.</p></section>`;
    if (res.vakanser.length) h += `<section class="kort"><h2>Vakanser</h2><ul class="punkter">` + res.vakanser.map(x =>
      `<li>Vecka ${x.vecka} ${x.veckodag}: ${x.antal} ${x.dygnsdel ? DELAR[x.dygnsdel].toLowerCase() + "pass" : "för få i tjänst kl " + x.tid}</li>`).join("") + `</ul>
      ${b?.atgarder?.length ? `<h3>Förslag från bemanningsbalansen</h3><ul class="punkter">${b.atgarder.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}</section>`;
    h += `<div class="tva"><section class="kort"><h2>Per person</h2><div class="rull"><table><thead><tr><th>Person</th><th class="tal">Pass</th><th class="tal">Arbetstid</th><th class="tal">Mål</th><th class="tal">Kvällar</th><th>Helg</th></tr></thead><tbody>` +
      Object.entries(res.personer).map(([p, x]) => `<tr><td><b>${esc(p)}</b></td><td class="tal">${x.pass}</td><td class="tal nw">${timmar(x.minuter)}</td><td class="tal nw">${timmar(x.mal_minuter)}</td><td class="tal">${x.kvallspass}</td><td>${x.helggrupp || "–"}</td></tr>`).join("") +
      `</tbody></table></div></section>`;
    if (g) {
      h += `<section class="kort"><h2>Granskning</h2><p class="dampad liten">Fristående kontroll av det färdiga schemat. Dygnsvila räknad från dygnsbryt ${esc(g.dygnsbryt)}, veckovila från ${esc(g.veckobryt)}.</p>`;
      h += g.brott.length ? `<h3>Brott</h3><ul class="punkter">` + g.brott.map(x => `<li><span class="niva ${nk(x.niva)}">${esc(x.niva)}</span> ${esc(x.person || "")} ${esc(x.text)}</li>`).join("") + `</ul>`
        : `<p style="color:var(--bra);font-weight:600">Inga brott mot hårda regler.</p>`;
      if (g.varningar.length) h += `<details><summary>${g.varningar.length} saker att notera</summary><ul class="punkter liten" style="margin-top:8px">` +
        g.varningar.map(x => `<li><span class="niva">${esc(x.niva)}</span> ${esc(x.person || "")} ${esc(x.text)}</li>`).join("") + `</ul></details>`;
      h += `</section>`;
    }
    h += `</div>`;
  } else {
    h += `<section class="kort"><div class="banner dalig"><strong>${res.status === "INFEASIBLE" ? "Schemat går inte att lägga" : "Inget schema hittades inom tidsgränsen"}</strong>${f ? esc(f.slutsats) : esc(res.orsak)}</div>`;
    if (f) {
      if (f.forkontroller?.length) h += `<h3>Förkontroller</h3><ul class="punkter">${f.forkontroller.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
      if (f.konflikt?.length) h += `<h3>Regler som krockar</h3><ul class="punkter">${f.konflikt.map(x => `<li><b>${esc(x.person)}</b> <span class="niva ${nk(x.niva)}">${esc(x.niva)}</span> ${esc(x.text)}</li>`).join("")}</ul>`;
      if (f.cykelgrans) h += `<h3>Cykelgränsen</h3><p>${esc(f.cykelgrans)}</p>`;
    }
    if (res.status !== "INFEASIBLE") h += `<p class="dampad" style="margin-top:8px">Pröva fler sekunder per optimeringssteg under fliken Period.</p>`;
    h += `<p style="margin-top:10px"><a class="knapp" href="#/enhet/${k.enhet_id}">Ändra indata</a></p></section>`;
  }
  vy().innerHTML = h;
}

function schemaVecka(res, v) {
  const pers = Object.keys(res.schema), vak = {};
  (res.vakanser || []).forEach(x => (vak[x.dag] = (vak[x.dag] || []).concat(x)));
  let h = `<div class="rull"><table class="schema"><thead><tr><th>V${v + 1}</th>` +
    DAGAR.map((d, i) => `<th class="${i > 4 ? "helg" : ""}">${d}</th>`).join("") + `</tr></thead><tbody>`;
  for (const pid of pers) {
    h += `<tr><td title="${esc(pid)}">${esc(pid)}</td>` + DAGAR.map((_, i) => {
      const d = v * 7 + i, p = res.schema[pid][d];
      if (!p) return `<td class="${i > 4 ? "helg" : ""}"></td>`;
      const n = pid + ":" + d;
      return `<td class="${i > 4 ? "helg" : ""}"><button class="pass ${p.dygnsdel}${st.valdCell === n ? " vald" : ""}" data-g="cell" data-c="${esc(n)}"
        aria-label="${esc(pid)} ${DAGAR[i]} ${p.start} till ${p.slut}"><b>${{ morgon: "M", kvall: "K", natt: "N" }[p.dygnsdel] || "?"}</b><small>${p.start}–${p.slut}</small></button></td>`;
    }).join("") + `</tr>`;
  }
  h += `<tr class="bem"><td>I tjänst</td>` + DAGAR.map((_, i) => {
    const d = v * 7 + i, n = { morgon: 0, kvall: 0, natt: 0 };
    pers.forEach(pid => { const p = res.schema[pid][d]; if (p && n[p.dygnsdel] !== undefined) n[p.dygnsdel]++; });
    const t = (vak[d] || []).map(x => `Vakans: ${x.antal} ${x.dygnsdel ? DELAR[x.dygnsdel].toLowerCase() : "kl " + x.tid}`).join(", ");
    return `<td class="${vak[d] ? "vakans" : ""}" title="${esc(t)}">M${n.morgon}<br>K${n.kvall}<br>N${n.natt}</td>`;
  }).join("") + `</tr></tbody></table></div>`;
  return h;
}

function cellInfo(res) {
  if (!st.valdCell) return `<span class="dampad">Tryck på ett pass för att se tider, rast och arbetstid.</span>`;
  const i = st.valdCell.lastIndexOf(":"), pid = st.valdCell.slice(0, i), d = +st.valdCell.slice(i + 1), p = res.schema[pid]?.[d];
  if (!p) return "";
  return `<b>${esc(pid)}</b>, vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}: ${DELAR[p.dygnsdel]?.toLowerCase() || ""}pass <span class="mono">${p.start}–${p.slut}</span>, rast ${p.rast} min, arbetstid ${timmar(p.netto)}.`;
}

// ---------------------------------------------------------------- vy: jämför

async function visaJamfor(ids) {
  const k = await Promise.all(ids.map(id => api("GET", "korningar/" + id)));
  sokvag([["Enheter", "#/"], [st.enhet?.namn || "Enhet", `#/enhet/${k[0].enhet_id}`], ["Jämför"]]);
  const sum = x => {
    const r = x.resultat, p = x.indata.personal;
    return {
      "Status": r ? (r.status === "OK" ? "Schema" : r.status === "INFEASIBLE" ? "Går inte att lägga" : "Inget schema") : x.status,
      ...Object.fromEntries(KPI.map(([n, t]) => [t, r?.kpi?.[n] ?? "–"])),
      "Brott i granskningen": x.granskning ? x.granskning.brott.length : "–",
      "Förutsagda vakanser": x.balans?.forvantade_vakanser ?? "–",
      "Personer": p.length,
      "Sysselsättning totalt": sv(Math.round(p.reduce((s, q) => s + (q.grad ?? 1), 0) * 100) / 100) + " heltider",
      "Önskemål": (x.indata.onskemal || []).length,
      "Veckor": x.indata.veckor,
      "Sekunder": x.sekunder != null ? sv(x.sekunder) : "–",
    };
  };
  const rader = k.map(sum);
  const nycklar = Object.keys(rader[0]);
  const lagst = n => { const v = rader.map(r => r[n]).filter(x => typeof x === "number"); return v.length === rader.length ? Math.min(...v) : null; };
  const battre = new Set(["Vakanta pass", "Vakanta tidpunkter", "Arbetsdagar i följd över 4", "Passlängd, avvikelse i minuter", "Rättvisa, spridning", "Brutna önskemål", "Brott i granskningen"]);
  vy().innerHTML = `<section class="kort"><h1>Jämför körningar</h1><p class="dampad liten" style="margin-top:6px">Lägst värde är markerat för mål där lägre är bättre. Målen gäller i ordning uppifrån: färre vakanser väger alltid tyngre än allt under.</p>
    <div class="rull"><table><thead><tr><th></th>${k.map(x => `<th><a href="#/korning/${x.id}">${esc(x.namn)}</a><div class="dampad liten" style="font-weight:400">${datum(x.skapad)}</div></th>`).join("")}</tr></thead><tbody>
    ${nycklar.map(n => { const l = battre.has(n) ? lagst(n) : null; return `<tr><td>${n}</td>${rader.map(r => `<td class="nw"${l !== null && r[n] === l && rader.some(q => q[n] !== l) ? ` style="color:var(--bra);font-weight:700"` : ""}>${esc(r[n])}</td>`).join("")}</tr>`; }).join("")}
    </tbody></table></div></section>`;
}

// ---------------------------------------------------------------- klick

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-g]");
  if (!el) return;
  const g = el.dataset.g;
  try {
    switch (g) {
      case "ny-enhet": {
        const { id } = await api("POST", "enheter", { namn: "Ny enhet", indata: NY_INDATA() });
        st.enhet = null; location.hash = `#/enhet/${id}`; break;
      }
      case "fran-exempel": {
        const x = st.exempel[+el.dataset.i];
        const { id } = await api("POST", "enheter", { namn: x.namn, indata: x.indata });
        st.enhet = null; location.hash = `#/enhet/${id}`; break;
      }
      case "kopiera": {
        const e2 = await api("GET", "enheter/" + el.dataset.id);
        await api("POST", "enheter", { namn: e2.namn + " (kopia)", indata: e2.indata });
        meddela("Kopia skapad. Använd den för att pröva ändringar och jämför sedan körningarna."); visaEnheter(); break;
      }
      case "ta-bort-enhet":
        if (el.dataset.bekrafta !== "1") { el.dataset.bekrafta = "1"; el.textContent = "Ta bort, säker?"; setTimeout(() => { el.dataset.bekrafta = ""; el.textContent = "Ta bort"; }, 4000); return; }
        await api("DELETE", "enheter/" + el.dataset.id); meddela(`${el.dataset.namn} är borttagen.`); visaEnheter(); break;
      case "flik":
        st.flik = el.dataset.flik; st.redigeraOnsk = null;
        document.querySelectorAll("[data-g=flik]").forEach(b => b.setAttribute("aria-selected", b === el));
        $("#flik").innerHTML = ritaFlik(); history.replaceState(null, "", `#/enhet/${st.enhet.id}?flik=${st.flik}`); break;
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
      case "ny-tp": {
        const tp = []; Object.entries(st.indata.tidpunkter || {}).forEach(([k, l]) => l.forEach(t => tp.push({ k, ...t })));
        tp.push({ k: "vardag", tid: "14:00", antal: 3 }); byggTidpunkter(tp); markeraAndrad(true); break;
      }
      case "ta-bort-tp": {
        const tp = []; Object.entries(st.indata.tidpunkter || {}).forEach(([k, l]) => l.forEach(t => tp.push({ k, ...t })));
        tp.splice(+el.dataset.n, 1); byggTidpunkter(tp); markeraAndrad(true); break;
      }
      case "aterstall-regel": delete st.indata.regler[el.dataset.k]; if (!Object.keys(st.indata.regler).length) delete st.indata.regler; markeraAndrad(true); break;
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
      case "vecka": st.vecka = +el.dataset.v; st.valdCell = null; ritaKorning(); break;
      case "cell":
        st.valdCell = st.valdCell === el.dataset.c ? null : el.dataset.c;
        document.querySelectorAll(".pass.vald").forEach(b => b.classList.remove("vald"));
        if (st.valdCell) el.classList.add("vald");
        $("#info").innerHTML = cellInfo(st.korning.resultat); break;
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
  const [sokv, fraga] = location.hash.replace(/^#/, "").split("?");
  const d = sokv.split("/").filter(Boolean);
  try {
    const s = await api("GET", "session");
    if (!s.inloggad) return visaInloggning();
    $("#logga-ut").hidden = !s.kravs;
    if (st.enhet && st.andrad && !(d[0] === "enhet" && +d[1] === st.enhet.id)) await spara();
    if (d[0] === "enhet") await visaEnhet(+d[1], new URLSearchParams(fraga).get("flik"));
    else if (d[0] === "korning") await visaKorning(+d[1]);
    else if (d[0] === "jamfor") await visaJamfor(d[1].split(",").map(Number));
    else { st.enhet = null; await visaEnheter(); }
    vy().focus({ preventScroll: true });
  } catch (e) {
    if (e.message !== "Logga in först.") vy().innerHTML = `<section class="kort"><div class="banner dalig"><strong>Något gick fel</strong>${esc(e.message)}</div><p style="margin-top:10px"><a href="#/">Till enheterna</a></p></section>`;
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => { if (st.andrad) { spara(); e.preventDefault(); } });
route();
