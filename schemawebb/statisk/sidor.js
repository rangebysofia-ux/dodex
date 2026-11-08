"use strict";
// Sidor i DODEX Scheduler: Översikt, Bemanningsbehov, Medarbetare, Analys och nyckeltal, Regelkontroll
// och Rapporter. Graferna finns i grafer.js. Laddas efter vyer.js och före app.js.
const { PASSNAMN, REGELGRUPPER, nyckeltalFor, kr, linjegraf, ringdiagram, varmekarta, behovsstaplar, passring, grafkort } = GRAF;


function nyckeltalskort(k, foregaende) {
  if (!k || k.status !== "klar" || k.resultat?.status !== "OK") {
    const kort = (ikon, klass, namn) => `<div class="nyckel"><div class="ikon ${klass}">${IKON[ikon]}</div><div><span>${namn}</span><b>–</b><small>Lägg ett schema</small></div></div>`;
    return `<div class="nyckeltal">${kort("behov", "", "Bemanningsgrad")}${kort("kostnad", "sand", "Personalkostnad")}${kort("lucka", "bla", "Obemannade pass")}${kort("klocka", "guld", "Planerad övertid")}<div class="nyckel"><div class="ikon svart">◼</div><div><span>Resurspass</span><b>–</b><small>Lägg ett schema</small></div></div></div>`;
  }
  const n = nyckeltalFor(k), fv = foregaende?.kpi?.vakanta_pass;
  const diff = fv != null ? n.vak - fv : null;
  return `<div class="nyckeltal">
    <div class="nyckel"><div class="ikon">${IKON.behov}</div><div><span>Bemanningsgrad</span><b>${sv(n.grad, 1)} %</b><small class="${n.grad >= 99.95 ? "upp" : "ned"}">${n.tackt} av ${n.behov} pass täckta</small></div></div>
    <div class="nyckel"><div class="ikon sand">${IKON.kostnad}</div><div><span>Personalkostnad (uppskattad)</span>${n.kostnadVecka != null
      ? `<b>${kr(n.kostnadVecka * 52 / 12)}</b><small>per månad${n.obVecka ? `, varav OB ${kr(n.obVecka * 52 / 12)}` : ""}</small>`
      : `<b>${sv(n.timmarVecka, 1)} h</b>${n.obVecka ? `<small>OB ${kr(n.obVecka * 52 / 12)} per månad</small>` : ""}<a href="#/e/${st.enhet.id}/installningar">Ange timkostnad för kronor</a>`}</div></div>
    <div class="nyckel"><div class="ikon bla">${IKON.lucka}</div><div><span>Obemannade pass</span><b class="${n.vak ? "minus" : ""}">${n.vak}</b><small class="${diff == null ? "" : diff <= 0 ? "upp" : "ned"}">${diff == null ? "vakanta pass" : diff === 0 ? "samma som förra körningen" : `${diff > 0 ? "+" : ""}${diff} mot förra körningen`}</small></div></div>
    <div class="nyckel"><div class="ikon guld">${IKON.klocka}</div><div><span>Planerad övertid</span><b>${sv(n.overtid, 1)} h</b><small>per vecka, utöver kontrakterad tid</small></div></div>
    <div class="nyckel"><div class="ikon svart">◼</div><div><span>Resurspass</span><b>${n.resursPass}</b><small>${sv(n.resursTimmarVecka, 1)} h per vecka utöver behovet</small></div></div>
  </div>`;
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
    h += grafkort(k) + GRAF.balansKort([{ namn: k.namn, k }]) + GRAF.resursKort(k, p => `<a href="#/e/${id}/personer/${k.id}?p=${encodeURIComponent(p)}">${esc(p)}</a>`);
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
    ["HELG", "Helger och fredagskvällar", "helgfrekvens"], ["BLOCK_MIN", "Inga enstaka arbetsdagar"], ["BLOCK_MAX", `Högst ${(k.indata.regler || {}).block_max ?? 5} arbetsdagar i följd`], ["NATT_I_RAD", `Nattpersonal: högst ${(k.indata.regler || {}).natt_max_i_rad ?? 3} nätter i rad`], ["KVALL_I_RAD", `Högst ${(k.indata.regler || {}).kvall_max_i_rad ?? 3} kvällar i rad${(k.indata.regler || {}).kvall_i_rad_typ === "hard" ? " (hård)" : " (mjuk)"}`], ["PASSFONSTER", "Passbyte i fönstret 12–18"]];
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

// ---------------------------------------------------------------- Bemanningsbalans (som verksamhetens Excel-mall)
async function visaBemanningsbalans(id) {
  st.vy = "bemanningsbalans";
  await laddaEnhet(id);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Bemanningsbalans"]]);
  const opt = {
    import: true, franBehov: () => BB.behovSomPass(st.indata),
    personalLank: p => `<a href="#/e/${id}/medarbetare">${esc(p)}</a>`,
    importera: async (fil, personalOcksa) => {
      const b64 = await new Promise((ok, fel) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = fel; r.readAsDataURL(fil); });
      try {
        const svar = await api("POST", "bemanningsbalans/las", { fil_base64: b64 });
        const d = svar.delar, ind = st.indata;
        ind.bemanningsbalans = d.bemanningsbalans;
        if (d.budget_timmar_vecka) ind.budget_timmar_vecka = d.budget_timmar_vecka;
        if (d.heltid_minuter_per_vecka) ind.heltid_minuter_per_vecka = d.heltid_minuter_per_vecka;
        let text = "Bemanningsbalansen är importerad.";
        if (personalOcksa && svar.personal.length) {
          ind.personal = svar.personal;
          if (d.veckor) ind.veckor = d.veckor;
          const ids = new Set(ind.personal.map(p => p.id));
          ind.onskemal = (ind.onskemal || []).filter(o => ids.has(o.person));
          (ind.aktiviteter || []).forEach(a => { if (a.deltagare) { a.deltagare = a.deltagare.filter(q => ids.has(q)); if (!a.deltagare.length) delete a.deltagare; } });
          text += " " + svar.meddelanden.join(" ");
        }
        markeraAndrad(false); meddela(text); rita();
      } catch (e) { meddela(e.message); }
    },
  };
  const rita = () => {
    vy().innerHTML = `<section class="kort"><h1>Bemanningsbalans</h1><p class="dampad" style="margin:6px 0 0">Budget, bemanningsbehov, personal och övrig arbetstid, som i verksamhetens Excel-mall. Ändringar sparas automatiskt. Påverkar inte schemaläggningen.</p></section>`
      + BB.rita(st.indata, opt);
    BB.koppla(vy(), st.indata, () => { markeraAndrad(false); rita(); }, opt);
  };
  rita();
}

// ---------------------------------------------------------------- Medarbetare
async function visaMedarbetare(id, kid, q) {
  st.vy = "medarbetare";
  await laddaEnhet(id);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Medarbetare"]]);
  const flik = ["onskemal", "aktiviteter"].includes(q.get("flik")) ? q.get("flik") : "personal";
  st.flik = flik; st.redigeraOnsk = null;
  vy().innerHTML = `<section class="kort"><div class="rubrikrad"><div style="display:block"><h1>Medarbetare</h1>
      <p class="dampad" style="margin:6px 0 0">Sysselsättningsgrad, vilka pass var och en arbetar, helgundantag, önskemål och aktiviteter som APT. Använd id-koder i stället för namn.</p></div>
      <div><a class="knapp" href="#/e/${id}/personer">${IKON.person} Schema per person</a></div></div></section>
    <div class="redigera"><section class="kort">
      <div class="flikar" role="tablist"><button role="tab" data-g="mflik" data-f="personal" aria-selected="${flik === "personal"}">Medarbetare (${st.indata.personal.length})</button>
        <button role="tab" data-g="mflik" data-f="onskemal" aria-selected="${flik === "onskemal"}">Önskemål (${(st.indata.onskemal || []).length})</button>
        <button role="tab" data-g="mflik" data-f="aktiviteter" aria-selected="${flik === "aktiviteter"}">Aktiviteter (${(st.indata.aktiviteter || []).length})</button></div>
      <div id="flik">${ritaFlik()}</div></section>
      <aside><section class="kort" id="kontroll">${ritaKontroll()}</section></aside></div>`;
  kopplaOnskForm(); kopplaAktForm();
  kontrollera();
}

// ---------------------------------------------------------------- Aktiviteter (APT, utbildning, möte, studier …)
async function visaAktiviteter(id) {
  st.vy = "aktiviteter";
  await laddaEnhet(id);
  ritaMeny();
  sokvag([["Enheter", "#/"], [st.enhet.namn, `#/e/${id}/oversikt`], ["Aktiviteter"]]);
  st.flik = "aktiviteter"; st.redigeraOnsk = null;
  vy().innerHTML = `<section class="kort"><h1>★ Aktiviteter</h1>
      <p class="dampad" style="margin:6px 0 0">APT, utbildning, möte, studier, dokumentation, handledning och annan fast tid. Ange dag, tid och vilka som deltar. Gäller det en enskild person (till exempel studier), välj personen under ”Bara vissa personer”. Kryssa i ”Måste genomföras” när tiden ligger fast.</p></section>
    <div class="redigera"><section class="kort"><div id="flik">${ritaFlik()}</div></section>
      <aside><section class="kort" id="kontroll">${ritaKontroll()}</section></aside></div>`;
  kopplaAktForm();
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
  h += GRAF.vilaTabell(k.resultat, k.indata, pid => `<a href="#/e/${id}/personer/${k.id}?p=${encodeURIComponent(pid)}"><b>${esc(pid)}</b></a>`);
  vy().innerHTML = h;
}
