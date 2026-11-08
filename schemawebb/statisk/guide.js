"use strict";
// Startguiden: det första man möter. ”Vad vill du göra?” och en frågeguide som ställer en fråga i taget:
// gruppen, antal medarbetare, sysselsättning, undantag, behov, tider för passen, period, och till sist hur
// schemat ska läggas (🤖 lägger det, eller man lägger det själv). Delas av webben och lättversionen.
// Guiden räknar bara fram förslag och tips; schemat läggs och granskas som vanligt efteråt.

const GUIDE = (() => {
  // inklistring.js läses in före guide.js i webben och lättversionen; i Node hämtas den här
  const KL = typeof KLISTRA !== "undefined" ? KLISTRA : typeof require === "function" ? require("./inklistring.js") : null;
  const VECKODAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sv = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
  const HELTID = 37, PASS_PER_VECKA = 4.75;
  const ARBETAR = { "morgon,kvall": "Dag och kväll", morgon: "Bara dag", kvall: "Bara kväll", natt: "Natt" };
  const HELGER = { "2/4": "Varannan helg", "1/4": "Var fjärde", "3/4": "Tre av fyra", alla: "Alla helger", ingen: "Inga helger" };
  const FRAGOR = ["Gruppen", "Medarbetare", "Sysselsättning", "Undantag", "Behov", "Tider", "Period", "Lägg schemat"];
  const SISTA = FRAGOR.length;

  function ny() {
    // Inget är förifyllt (användarens önskemål 2026-11-08): antal, sysselsättning och behov fylls i av användaren.
    // Passtiderna och perioden är regelns standardvärden och syns i sina steg.
    return { steg: 1, namn: "", omraden: "nej", omradesLista: [], antalDag: 0, antalNatt: 0, gradSatt: "samma", grad: "", budget: "", personer: [], harUndantag: false,
      behov: { vardag: { morgon: 0, kvall: 0, natt: 0 }, helg: { morgon: 0, kvall: 0, natt: 0 } }, behovDag: null,
      tider: { morgon: "07:00", kvall: "22:00", nattStart: "21:45", nattSlut: "06:45" }, veckor: 4, startdatum: "", timkostnad: "" };
  }

  // Personlistan följer antalet: A1, A2 … för dag och kväll, N1, N2 … för natt. Ändrade värden ligger kvar.
  function synka(g) {
    const gamla = new Map(g.personer.map(p => [p.id, p]));
    g.personer = [...Array.from({ length: g.antalDag }, (_, i) => `A${i + 1}`), ...Array.from({ length: g.antalNatt }, (_, i) => `N${i + 1}`)]
      .map(id => gamla.get(id) || { id, grad: g.grad, arbetar: id[0] === "N" ? "natt" : "morgon,kvall", helg: "2/4" });
    if (!harOmraden(g)) g.personer.forEach(p => delete p.omrade);
  }

  // ---------------------------------------------------------------- områden, avdelningar eller team
  // Färger för områdena i tur och ordning (samma palett som organisationen).
  const OMRADESFARGER = ["#c46a2b", "#2f8a6f", "#3f6bb0", "#9a4fa8", "#c0473f", "#2b8aa0", "#b08a2e", "#5f8a2f", "#b5487e", "#5b5bb8"];
  const harOmraden = g => g.omraden === "team" || g.omraden === "egna";
  const omradenMedNamn = g => (g.omradesLista || []).filter(o => String(o.namn || "").trim());
  function taBortOmrade(g, i) {
    g.omradesLista.splice(i, 1);
    g.personer.forEach(p => { if (p.omrade === i) delete p.omrade; else if (p.omrade > i) p.omrade--; });
  }
  function laggOmrade(g) { const n = g.omradesLista.length; g.omradesLista.push({ namn: "", farg: OMRADESFARGER[n % OMRADESFARGER.length] }); }

  // Dela ett antal jämnt på n delar; resten går till de första.
  const dela = (antal, n, i) => Math.floor(antal / n) + (i < antal % n ? 1 : 0);
  function delatBehov(g, n, i) {
    const B = structuredClone(g.behovDag || g.behov);
    for (const d of Object.values(B)) for (const k of ["morgon", "kvall", "natt"]) d[k] = dela(d[k] || 0, n, i);
    return B;
  }
  // Personerna fördelas i tur och ordning, dag/kväll och natt var för sig, om de inte redan har ett område.
  // Nattpersonalen går bara till områden som har nattbehov (och dag/kväll till områden med dag- eller kvällsbehov).
  function omradeFor(g, n) {
    const har = (i, delar) => Object.values(delatBehov(g, n, i)).some(d => delar.some(k => d[k] > 0));
    const alla = Array.from({ length: n }, (_, i) => i);
    const val = { A: alla.filter(i => har(i, ["morgon", "kvall"])), N: alla.filter(i => har(i, ["natt"])) };
    const ut = {}, i = { A: 0, N: 0 };
    for (const p of g.personer) {
      const typ = p.id[0] === "N" ? "N" : "A", L = val[typ].length ? val[typ] : alla;
      ut[p.id] = p.omrade ?? L[i[typ]++ % L.length];
    }
    return ut;
  }

  const nattTimmarPass = g => { const m = t => { const [h, x] = t.split(":").map(Number); return h * 60 + x; };
    let d = m(g.tider.nattSlut) - m(g.tider.nattStart); if (d <= 0) d += 1440; return d / 60; };

  // Vad behovet kräver: pass och timmar per vecka, och minsta antal med varannan helg och fredagsregeln.
  function berakna(g) {
    let v = g.behov.vardag, h = g.behov.helg, dagPass = 5 * (v.morgon + v.kvall) + 2 * (h.morgon + h.kvall), natter = 5 * v.natt + 2 * h.natt;
    if (g.behovDag) {
      // behov per veckodag: summera veckan; helgen räknas på den tyngsta helgdagen och fredagskvällen
      const B = VECKODAGAR.map(d => g.behovDag[d]), max = (lista, k) => Math.max(...lista.map(x => x[k]));
      dagPass = B.reduce((s, x) => s + x.morgon + x.kvall, 0); natter = B.reduce((s, x) => s + x.natt, 0);
      h = { morgon: max(B.slice(5), "morgon"), kvall: max(B.slice(5), "kvall"), natt: max(B.slice(5), "natt") };
      v = { morgon: max(B.slice(0, 5), "morgon"), kvall: B[4].kvall, natt: max(B.slice(0, 5), "natt") };
    }
    const dagTimmar = dagPass * HELTID / PASS_PER_VECKA, nattTimmar = natter * nattTimmarPass(g);
    const perHelg = h.morgon + Math.max(h.kvall, v.kvall);
    return { dagPass, natter, dagTimmar, nattTimmar, behovTimmar: dagTimmar + nattTimmar, perHelg, fredagStyr: v.kvall > h.kvall,
      minDag: dagPass ? Math.max(Math.ceil(dagPass / PASS_PER_VECKA), perHelg * 2) : 0,
      minNatt: natter ? Math.max(Math.ceil(nattTimmar / HELTID), Math.max(h.natt, v.natt) * 2) : 0 };
  }

  const steg5 = x => Math.max(0.05, Math.min(1, Math.floor(x / 0.05 + 1e-9) * 0.05));
  // Grad per person i procent, efter valt sätt: samma för alla, var och en för sig, eller fördela en budget.
  function grader(g) {
    synka(g);
    if (g.gradSatt === "olika") return Object.fromEntries(g.personer.map(p => [p.id, p.grad]));
    if (g.gradSatt === "budget" && Number(g.budget)) {
      const r = berakna(g), natt = g.antalNatt ? Math.min(1, Math.ceil(r.nattTimmar / HELTID / g.antalNatt * 20) / 20) : 0;
      const dag = g.antalDag ? steg5((Number(g.budget) - natt * g.antalNatt * HELTID) / HELTID / g.antalDag) : 0;
      return Object.fromEntries(g.personer.map(p => [p.id, Math.round((p.id[0] === "N" ? natt : dag) * 100)]));
    }
    return Object.fromEntries(g.personer.map(p => [p.id, g.grad]));
  }
  const kontrakt = g => Object.values(grader(g)).reduce((s, x) => s + x / 100 * HELTID, 0);

  function indata(g) {
    const gr = grader(g); let teamLista;
    const personal = g.personer.map(p => {
      const ut = { id: p.id, grad: Math.round(gr[p.id]) / 100 };
      const arb = g.harUndantag || p.id[0] === "N" ? p.arbetar : p.id[0] === "N" ? "natt" : "morgon,kvall";
      if (arb !== "morgon,kvall") ut.dygnsdelar = arb.split(",");
      if (g.harUndantag && p.helg !== "2/4") ut.helgfrekvens = p.helg;
      return ut;
    });
    if (g.omraden === "team") {
      const O = omradenMedNamn(g), hem = omradeFor(g, O.length);
      personal.forEach(p => { p.team = `T${hem[p.id] + 1}`; });
      // behovet delas jämnt mellan teamen som ett förslag; det ändras under fliken Team
      teamLista = O.map((o, i) => ({ id: `T${i + 1}`, namn: o.namn.trim(), farg: o.farg, behov: delatBehov(g, O.length, i) }));
    } else teamLista = null;
    const ut = { enhet: g.namn || "Ny enhet", veckor: Number(g.veckor) || 4, cykliskt: true, behov: structuredClone(g.behovDag || g.behov), personal, onskemal: [] };
    const regler = {};
    if (g.tider.morgon !== "07:00") regler.morgon_start = g.tider.morgon;
    if (g.tider.kvall !== "22:00") regler.kvall_slut = g.tider.kvall;
    if (Object.keys(regler).length) ut.regler = regler;
    if (g.tider.nattStart !== "21:45" || g.tider.nattSlut !== "06:45") ut.nattpass = [{ id: "N", start: g.tider.nattStart, slut: g.tider.nattSlut, maltidsuppehall: true }];
    if (g.startdatum) ut.startdatum = g.startdatum;
    if (Number(g.budget)) ut.budget_timmar_vecka = Number(g.budget);
    if (Number(g.timkostnad)) ut.timkostnad_kr = Number(g.timkostnad);
    if (g.passMall) ut.bemanningsbalans = { pass: structuredClone(g.passMall) };
    if (teamLista && teamLista.length) ut.team = teamLista;
    return ut;
  }

  // Eget schema per område: en enhet per område med sin del av personalen och behovet.
  function omradesEnheter(g) {
    synka(g);
    const O = omradenMedNamn(g), hem = omradeFor(g, O.length), alla = indata({ ...g, omraden: "nej" });
    return O.map((o, i) => {
      const ind = structuredClone(alla);
      ind.enhet = o.namn.trim();
      ind.personal = ind.personal.filter(p => hem[p.id] === i);
      ind.behov = delatBehov(g, O.length, i);
      if (ind.budget_timmar_vecka) ind.budget_timmar_vecka = Math.round(ind.budget_timmar_vecka * ind.personal.length / Math.max(1, alla.personal.length) * 10) / 10;
      return { namn: o.namn.trim(), farg: o.farg, indata: ind };
    });
  }

  // Den tomma enheten som AI-assistenten fyller i tillsammans med användaren.
  function tomIndata(namn) { return { enhet: namn || "Ny enhet", veckor: 4, cykliskt: true, behov: {}, personal: [], onskemal: [] }; }
  const AI_START = "Jag vill lägga in en ny enhet. Fråga mig steg för steg om medarbetare, sysselsättningsgrad, undantag, bemanningsbehov och tider, och föreslå sedan indata som jag kan godkänna.";

  // Ett tomt grundschema för den som vill lägga schemat själv.
  function tomtSchema(ind) { const N = (ind.veckor || 4) * 7; return Object.fromEntries(ind.personal.map(p => [p.id, Array(N).fill(null)])); }

  // ---------------------------------------------------------------- startsidan
  // Symboler på startsidan (emojis, användarens val). Enhet = hus.
  const IKONER = { ny: "✚", klistra: "📋", ai: "🤖", exempel: "◎", enheter: "🏠" };
  const HUS = "🏠";

  function val({ harEnheter = false } = {}) {
    // Rutorna visar ikon och rubrik; förklaringen syns när man håller över (title) och läses upp av skärmläsare.
    const ruta = (g, ikon, rubrik, text, extra = "") => `<button class="valruta${extra}" data-guide="${g}" title="${esc(text)}" aria-label="${esc(rubrik + ". " + text)}"><span class="valikon" aria-hidden="true">${IKONER[ikon]}</span><b>${rubrik}</b></button>`;
    return `<section class="kort"><h1>Vad vill du göra?</h1><p class="dampad" style="margin:6px 0 14px">Välj en väg. Allt går att ändra efteråt.</p>
      <div class="valrutor">
        ${ruta("ny", "ny", "Skapa ny enhet", "Svara på några frågor om gruppen, behovet och tiderna. Välj sedan om AI lägger schemat eller om du gör det själv.", " huvud")}
        ${ruta("klistra", "klistra", "Klistra in från Excel", "Klistra in personal och behov från en lista eller ett Excel-blad. Namn blir id-koder.")}
        ${ruta("ai", "ai", "Berätta för AI-assistenten", "Börja med en tom enhet och beskriv med egna ord. Assistenten föreslår, du godkänner.")}
        ${ruta("exempel", "exempel", "Börja från ett exempel", "Färdiga testfall att pröva systemet med.")}
        ${harEnheter ? ruta("enheter", "enheter", "Fortsätt med en enhet", "Öppna en enhet du redan har.") : ""}
      </div>
      <details class="nyttigt"><summary>Bra att veta</summary><ul class="punkter liten">
        <li>Reglerna (dygnsvila 11 h, veckovila 36 h, rast, varannan helg) gäller från start. Ändra under Inställningar eller Regler.</li>
        <li>Behovet är det som styr. Räcker inte personalen blir det en synlig vakans, aldrig ett avtalsbrott.</li>
        <li>Med 4,75 pass per vecka går 4, 8 och 12 veckor jämnt ut. Vid till exempel 6 veckor får hälften 28 pass och hälften 29.</li>
        <li>Ange startdatum och timkostnad så räknas OB och personalkostnad.</li>
        <li>🤖 finns på varje sida. Fråga till exempel ”hur många kvällar har var och en?”.</li>
      </ul></details></section>`;
  }

  // ---------------------------------------------------------------- frågorna
  function html(g) {
    synka(g);
    const r = berakna(g), gr = grader(g), k = kontrakt(g), budget = Number(g.budget) || 0;
    const tips = (t, varn = false) => `<div class="guidetips${varn ? " varn" : ""}">${varn ? "⚠" : "💡"} ${t}</div>`;
    const fraga = (t, under = "") => `<p class="guidefraga-nr">Fråga ${g.steg} av ${SISTA}</p><h2 class="guidefraga">${t}</h2>${under ? `<p class="dampad">${under}</p>` : ""}`;
    const valknapp = (falt, varde, text, aktiv) => `<button class="valknapp" data-guide="satt" data-falt="${falt}" data-varde="${varde}" aria-pressed="${aktiv}">${text}</button>`;
    const tal = (id, falt, varde, etikett, max = 80) => `<div><label for="${id}">${etikett}</label><input id="${id}" type="number" min="0" max="${max}" inputmode="numeric" data-gf="${falt}" value="${varde || ""}" placeholder="0"></div>`;
    let h = "";
    if (g.steg === 0) return klistraHtml(g);
    switch (g.steg) {
      case 1: h = fraga("Vad heter gruppen?", "Till exempel avdelningen, boendet, arbetslaget eller hemtjänstgruppen.") +
        `<input id="g-namn" data-gf="namn" value="${esc(g.namn)}" placeholder="Hemtjänst Centrum" style="max-width:420px">
        ${g.orgval ? `<div style="max-width:420px;margin-top:12px"><label for="g-plats">Var i organisationen?</label><select id="g-plats" data-gf="plats">${g.orgval}</select></div>` : ""}
        <h3 style="margin-top:18px">Finns det områden, avdelningar eller team?</h3>
        <div class="valknappar">${valknapp("omraden", "nej", "Nej", !harOmraden(g))}${valknapp("omraden", "team", "Ja, ett gemensamt schema", g.omraden === "team")}${valknapp("omraden", "egna", "Ja, eget schema per område", g.omraden === "egna")}</div>` +
        (harOmraden(g) ? `<div class="omraden">${g.omradesLista.map((o, i) => `<div class="omrade-rad"><input type="color" class="org-farg" data-go="${i}.farg" value="${esc(o.farg)}" aria-label="Färg för område ${i + 1}" title="Färg"><input data-go="${i}.namn" value="${esc(o.namn)}" placeholder="Område ${i + 1}" aria-label="Namn på område ${i + 1}"><button class="liten fara" data-guide="omrade-bort" data-i="${i}" aria-label="Ta bort område ${i + 1}">×</button></div>`).join("")}
          <button class="liten" data-guide="omrade-ny">+ Lägg till område</button></div>` +
          tips(g.omraden === "team"
            ? "Alla områden ingår i ett och samma schema. Varje område blir ett team med eget behov och egen färg, och var och en får ett hemområde. Där ett område har för få kan personal lånas in från ett annat."
            : `Varje område blir en egen enhet med egen personal, eget behov och eget schema, samlade under ${g.namn ? `<b>${esc(g.namn)}</b>` : "gruppens namn"} i organisationen.`) +
          `<p class="liten dampad">Personalen och behovet som du anger i nästa steg delas jämnt mellan områdena som ett förslag. Det går att ändra efteråt.</p>` : ""); break;
      case 2: h = fraga("Hur många medarbetare är det i gruppen?") +
        `<div class="falt" style="max-width:520px">${tal("g-dk", "antalDag", g.antalDag, "Arbetar dag och kväll")}${tal("g-natt", "antalNatt", g.antalNatt, "Arbetar natt", 40)}</div>` +
        tips(`Ni är ${g.antalDag + g.antalNatt} totalt. De får id-koder (A1, A2 … och N1, N2 …) i stället för namn.`); break;
      case 3: h = fraga("Vilken sysselsättningsgrad har de?") +
        `<div class="valknappar">${valknapp("gradSatt", "samma", "Samma för alla", g.gradSatt === "samma")}${valknapp("gradSatt", "olika", "Olika per person", g.gradSatt === "olika")}${valknapp("gradSatt", "budget", "Fördela en budget i timmar", g.gradSatt === "budget")}</div>` +
        (g.gradSatt === "samma" ? `<div style="max-width:220px;margin-top:12px"><label for="g-grad">Sysselsättningsgrad, %</label><input id="g-grad" type="number" min="10" max="100" step="5" data-gf="grad" value="${g.grad || ""}" placeholder="till exempel 100"></div>` : "") +
        (g.gradSatt === "budget" ? `<div style="max-width:260px;margin-top:12px"><label for="g-budget">Timmar per vecka i budget</label><input id="g-budget" type="number" min="0" step="0.5" inputmode="decimal" data-gf="budget" value="${esc(g.budget)}"></div>` : "") +
        (g.gradSatt === "olika" ? `<div class="rull" style="margin-top:12px"><table class="guidetabell"><thead><tr><th>Medarbetare</th><th>Grad %</th></tr></thead><tbody>${g.personer.map((p, i) => `<tr><th>${esc(p.id)}</th><td><input type="number" min="10" max="100" step="5" data-gp="${i}.grad" value="${p.grad || ""}" placeholder="%" aria-label="Grad för ${esc(p.id)}"></td></tr>`).join("")}</tbody></table></div>` : "") +
        tips(`Kontrakterad tid blir <b>${sv(k)} h per vecka</b> (${sv(k / HELTID, 2)} årsarbetare)${budget && g.gradSatt === "budget" ? ` av budgeten ${sv(budget)} h` : ""}.`); break;
      case 4: h = fraga("Finns det undantag?", "Till exempel någon som bara arbetar kväll, bara natt, eller inte varannan helg.") +
        `<div class="valknappar">${valknapp("harUndantag", "nej", "Nej, alla arbetar som vanligt", !g.harUndantag)}${valknapp("harUndantag", "ja", "Ja, några har undantag", g.harUndantag)}</div>` +
        (g.harUndantag ? `<div class="rull" style="margin-top:12px"><table class="guidetabell"><thead><tr><th>Medarbetare</th><th>Arbetar</th><th>Helger</th></tr></thead><tbody>${g.personer.map((p, i) => `<tr><th>${esc(p.id)}</th>
          <td><select data-gp="${i}.arbetar" aria-label="Arbetar, ${esc(p.id)}">${Object.entries(ARBETAR).map(([a, t]) => `<option value="${a}"${p.arbetar === a ? " selected" : ""}>${t}</option>`).join("")}</select></td>
          <td><select data-gp="${i}.helg" aria-label="Helger, ${esc(p.id)}">${Object.entries(HELGER).map(([a, t]) => `<option value="${a}"${p.helg === a ? " selected" : ""}>${t}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>` +
          tips("Undantag från varannan helg görs per person och visas som undantag i schemat. Enhetens regel är fortfarande varannan helg.") : tips("Alla med dag och kväll arbetar båda, och alla arbetar varannan helg.")); break;
      case 5: h = fraga("Hur ser behovet ut i veckan?", "Hur många behöver vara i tjänst per pass?") +
        `<div class="rull"><table class="guidetabell"><thead><tr><th></th><th>Dag</th><th>Kväll</th><th>Natt</th></tr></thead><tbody>
        ${(g.behovDag ? VECKODAGAR.map(d => [d, d[0].toUpperCase() + d.slice(1), g.behovDag[d]]) : [["vardag", "Vardag (mån–fre)", g.behov.vardag], ["helg", "Helg (lör–sön)", g.behov.helg]])
          .map(([d, t, b]) => `<tr><th>${t}</th>${["morgon", "kvall", "natt"].map(x => `<td><input type="number" min="0" max="30" inputmode="numeric" data-gb="${d}.${x}" value="${b[x] || ""}" placeholder="0" aria-label="${t} ${x}"></td>`).join("")}</tr>`).join("")}</tbody></table></div>` +
        (g.kurvMall ? `<details open style="margin-top:12px"><summary>Bemanningskurva från mallen</summary><div class="grafyta" style="margin-top:8px">${kurvaSvg(g.kurvMall)}</div></details>` : "") +
        (g.behovDag ? `<p class="liten dampad" style="margin:8px 0 0">Behovet skiljer sig mellan veckodagarna och läggs per dag. <button class="lank" data-guide="behov-forenkla">Förenkla till vardag och helg</button></p>` : "") +
        (!r.dagPass && !r.natter ? tips("Skriv hur många som behöver vara i tjänst på dag, kväll och natt.") : tips(`Det blir ${r.dagPass} dag- och kvällspass och ${r.natter} nätter per vecka, ungefär <b>${sv(r.behovTimmar)} h per vecka</b>. För helgerna behövs minst <b>${r.minDag} med dag och kväll</b> och <b>${r.minNatt} med natt</b>${r.fredagStyr ? " (fredagskvällen styr: den som arbetar fredag kväll arbetar helgen)" : ""}.`)) +
        (g.antalDag < r.minDag || g.antalNatt < r.minNatt ? tips(`Ni är ${g.antalDag} med dag och kväll och ${g.antalNatt} med natt. Färre än minsta antal ger vakanser på helgerna. <button class="liten" data-guide="minsta">Ändra till ${r.minDag} och ${r.minNatt}</button>`, true) : "") +
        (k < r.behovTimmar - 0.5 ? tips(`Kontrakterad tid (${sv(k)} h) är mindre än behovet (${sv(r.behovTimmar)} h). Räkna med vakanser.`, true) : ""); break;
      case 6: h = fraga("Vilka tider gäller för passen?") +
        `<div class="falt" style="max-width:640px"><div><label for="g-ms">Dagpass börjar</label><input id="g-ms" type="time" data-gt="morgon" value="${g.tider.morgon}"></div>
          <div><label for="g-ks">Kvällspass slutar</label><input id="g-ks" type="time" data-gt="kvall" value="${g.tider.kvall}"></div>
          <div><label for="g-ns">Nattpass börjar</label><input id="g-ns" type="time" data-gt="nattStart" value="${g.tider.nattStart}"></div>
          <div><label for="g-ne">Nattpass slutar</label><input id="g-ne" type="time" data-gt="nattSlut" value="${g.tider.nattSlut}"></div></div>` +
        tips("Dagpassets slut och kvällspassets start anpassas efter sysselsättningsgraden, med passbyte mellan kl. 12 och 18. Nattpasset är " + sv(nattTimmarPass(g)) + " h med måltidsuppehåll."); break;
      case 7: h = fraga("Hur lång är schemaperioden, och när börjar den?") +
        `<div class="falt" style="max-width:640px"><div><label for="g-veckor">Period</label><select id="g-veckor" data-gf="veckor">${[4, 6, 8, 12].map(v => `<option value="${v}"${+g.veckor === v ? " selected" : ""}>${v} veckor</option>`).join("")}</select></div>
          <div><label for="g-start">Startdatum, måndag (valfritt)</label><input id="g-start" type="date" data-gf="startdatum" value="${esc(g.startdatum)}"></div>
          <div><label for="g-tk">Timkostnad, kr (valfritt)</label><input id="g-tk" type="number" min="0" inputmode="decimal" data-gf="timkostnad" value="${esc(g.timkostnad)}"></div></div>` +
        tips("Startdatum och timkostnad behövs för OB och personalkostnad. De kan anges senare."); break;
      default: if (g.omraden === "egna") { h = sistaEgna(g, fraga, r); break; }
        h = fraga("Hur vill du lägga schemat?") +
        `<ul class="punkter liten"><li><b>${esc(g.namn || "Ny enhet")}</b>, ${g.veckor} veckor${g.startdatum ? ` från ${esc(g.startdatum)}` : ""}</li>
          <li>${g.antalDag} med dag och kväll, ${g.antalNatt} med natt, ${sv(k)} h kontrakterat per vecka${g.harUndantag ? `, ${g.personer.filter(p => p.helg !== "2/4" || (p.id[0] === "A" && p.arbetar !== "morgon,kvall")).length} med undantag` : ""}</li>
          <li>Behov ${g.behovDag ? `per veckodag (${VECKODAGAR.map(d => `${d} ${g.behovDag[d].morgon}/${g.behovDag[d].kvall}/${g.behovDag[d].natt}`).join(", ")})` : `vardag ${g.behov.vardag.morgon}/${g.behov.vardag.kvall}/${g.behov.vardag.natt}, helg ${g.behov.helg.morgon}/${g.behov.helg.kvall}/${g.behov.helg.natt}`} (dag/kväll/natt), ungefär ${sv(r.behovTimmar)} h per vecka</li>
          <li>Dag från ${g.tider.morgon}, kväll till ${g.tider.kvall}, natt ${g.tider.nattStart}–${g.tider.nattSlut}</li>
          ${g.omraden === "team" ? `<li>${omradenMedNamn(g).length} områden i ett gemensamt schema: ${omradenMedNamn(g).map(o => `<span class="omrade-chip" style="--ef:${esc(o.farg)}">${esc(o.namn)}</span>`).join(" ")}</li>` : ""}</ul>
        <div class="valrutor" style="margin-top:14px">
          <button class="valruta huvud" data-guide="skapa-ai"><span class="valikon" aria-hidden="true">🤖</span><b>Låt AI lägga schemat</b><span>Ett schema som följer reglerna, med så få vakanser som möjligt och jämn fördelning. Du kan justera det efteråt.</span></button>
          <button class="valruta" data-guide="skapa-manuellt"><span class="valikon" aria-hidden="true">✋</span><b>Lägg schemat själv</b><span>Börja med ett tomt schema och lägg passen. Varje pass granskas direkt mot reglerna.</span></button>
        </div>
        <p style="margin-top:12px"><button class="lank" data-guide="skapa">Bara skapa enheten, lägg schemat senare</button></p>`;
    }
    const nav = `<div class="guidenav">${g.steg > 1 || g.klistra ? `<button data-guide="tillbaka">‹ Tillbaka</button>` : `<button data-guide="avbryt">Avbryt</button>`}
      ${g.steg < SISTA ? `<button class="primar" data-guide="nasta">Nästa ›</button>` : ""}</div>`;
    const prickar = `<div class="guideprickar" aria-hidden="true">${FRAGOR.map((t, i) => `<i class="${i + 1 === g.steg ? "aktiv" : i + 1 < g.steg ? "klar" : ""}" title="${t}"></i>`).join("")}</div>`;
    return `<section class="kort guide">${prickar}${h}${nav}</section>`;
  }

  // Sista steget när varje område får ett eget schema: visa fördelningen och skapa enheterna.
  function sistaEgna(g, fraga, r) {
    const E = omradesEnheter(g), del = b => { const B = Object.values(b), s = k => B.reduce((x, d) => x + (d[k] || 0), 0); return B.length === 2 ? `${b.vardag.morgon}/${b.vardag.kvall}/${b.vardag.natt} vardag, ${b.helg.morgon}/${b.helg.kvall}/${b.helg.natt} helg` : `${s("morgon")}/${s("kvall")}/${s("natt")} per vecka`; };
    return fraga(`Skapa ${E.length} områden under ${esc(g.namn)}`) +
      `<p class="dampad">Varje område blir en egen enhet med eget schema. Personalen och behovet är delat jämnt som ett förslag. Kontrollera dem i varje område innan du lägger schemat.</p>
      <div class="rull"><table class="guidetabell"><thead><tr><th>Område</th><th>Medarbetare</th><th>Behov (dag/kväll/natt)</th></tr></thead><tbody>
      ${E.map(e => `<tr><th><span class="omrade-chip" style="--ef:${esc(e.farg)}">${esc(e.namn)}</span></th><td>${e.indata.personal.map(p => esc(p.id)).join(", ") || "–"}</td><td>${del(e.indata.behov)}</td></tr>`).join("")}</tbody></table></div>
      <ul class="punkter liten"><li>${g.veckor} veckor${g.startdatum ? ` från ${esc(g.startdatum)}` : ""}, dag från ${g.tider.morgon}, kväll till ${g.tider.kvall}, natt ${g.tider.nattStart}–${g.tider.nattSlut}</li>
        <li>Totalt ungefär ${sv(r.behovTimmar)} h behov per vecka.</li></ul>
      <div class="valrutor" style="margin-top:14px"><button class="valruta huvud" data-guide="skapa-omraden"><span class="valikon" aria-hidden="true">🏠</span><b>Skapa områdena</b><span>En grupp ${esc(g.namn)} i organisationen med ${E.length} enheter under.</span></button></div>`;
  }

  // Läs ett fält i guiden till tillståndet. Returnerar true om något ändrades.
  function las(g, el) {
    if (el.dataset.gk) {
      g.klistra[el.dataset.gk] = el.value;
      const f = typeof document !== "undefined" && document.getElementById("klistra-forhand");
      if (f) f.innerHTML = klistraForhand(g);
      return el.type !== "textarea";  // textrutan ritas inte om medan man skriver
    }
    if (el.dataset.gb) { const [d, k] = el.dataset.gb.split("."); (g.behovDag && g.behovDag[d] ? g.behovDag : g.behov)[d][k] = Math.max(0, parseInt(el.value) || 0); return true; }
    if (el.dataset.gt) { if (el.value) g.tider[el.dataset.gt] = el.value; return true; }
    if (el.dataset.go) { const [i, k] = el.dataset.go.split("."); g.omradesLista[+i][k] = el.value; return k === "farg"; }
    if (el.dataset.gp) { const [i, k] = el.dataset.gp.split("."); g.personer[+i][k] = k === "grad" ? Math.max(0, parseInt(el.value) || 0) : el.value; return true; }
    const f = el.dataset.gf; if (!f) return false;
    if (["antalDag", "antalNatt", "grad", "veckor"].includes(f)) g[f] = Math.max(0, parseInt(el.value) || 0);
    else g[f] = el.value;
    if (f === "grad") g.personer.forEach(p => (p.grad = g.grad));
    return true;
  }

  // ---------------------------------------------------------------- klistra in från Excel
  function nyKlistra() { const g = ny(); g.steg = 0; g.klistra = { personal: "", behov: "" }; return g; }

  function tolka(g) {
    return { p: KL.personal(g.klistra.personal), b: KL.behov(g.klistra.behov) };
  }

  // Bemanningskurva: hur många som är i tjänst över dygnet, en linje per dagtyp (vardag, helg …).
  function kurvaSvg(serier) {
    const alla = serier.flatMap(x => x.data), max = Math.max(1, ...alla);
    const harTid = i => serier.some(x => x.data[i] > 0);
    let a = 0, b = 96; while (a < 96 && !harTid(a)) a++; while (b > a && !harTid(b - 1)) b--;
    a = Math.max(0, Math.floor(a / 4) * 4 - 4); b = Math.min(96, Math.ceil(b / 4) * 4 + 4);
    const B = 640, H = 220, V = 34, T = 12, U = 26, x = i => V + (i - a) / (b - a) * (B - V - 8), y = v => T + (1 - v / max) * (H - T - U);
    const steg = Math.max(1, Math.ceil(max / 5)), FARG = ["var(--accent, #193f38)", "var(--guld-djup, #a9863a)", "#7085a3", "#b8432f", "#5c8a76", "#8a6212", "#4d6488"];
    let h = `<svg class="graf" viewBox="0 0 ${B} ${H}" role="img" aria-label="Bemanningskurva: antal i tjänst över dygnet">`;
    for (let v = 0; v <= max; v += steg) h += `<line class="rutnat" x1="${V}" x2="${B - 8}" y1="${y(v)}" y2="${y(v)}"/><text x="${V - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    for (let i = a; i <= b; i += 4) if ((i - a) % (b - a > 64 ? 8 : 4) === 0) h += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${String(i / 4 % 24).padStart(2, "0")}</text>`;
    serier.forEach((s2, j) => {
      let d = `M${x(a)},${y(s2.data[a] || 0)}`;
      for (let i = a; i < b; i++) d += `H${x(i + 1)}V${y(s2.data[i + 1] ?? 0)}`;
      h += `<path d="${d}" fill="none" stroke="${FARG[j % FARG.length]}" stroke-width="2.5" stroke-linejoin="round"/>`;
      for (let i = a; i < b; i++) if (s2.data[i] !== s2.data[i - 1]) h += `<rect class="traff" x="${x(i)}" y="${y(s2.data[i]) - 8}" width="${Math.max(6, x(i + 1) - x(i))}" height="16" data-tips="${esc(s2.namn)} ${String(Math.floor(i / 4)).padStart(2, "0")}:${String(i % 4 * 15).padStart(2, "0")}: ${s2.data[i]} i tjänst"/>`;
    });
    h += `</svg><div class="legend">${serier.map((s2, j) => `<span><i style="background:${FARG[j % FARG.length]}"></i>${esc(s2.namn)} (högst ${Math.max(...s2.data)})</span>`).join("")}</div>`;
    return h;
  }
  // Dagtyper med samma kurva slås ihop: Mån–fre, Lör–sön, eller en per dag.
  function kurvSerier(b) {
    const k = VECKODAGAR.map((_, i) => KL.kurva(b.passDag, i)), lika = (i, j) => k[i].join() === k[j].join();
    const grupper = [];
    VECKODAGAR.forEach((d, i) => { const g = grupper.find(x => lika(x.idx[0], i)); if (g) g.idx.push(i); else grupper.push({ idx: [i] }); });
    const namn = idx => idx.join() === "0,1,2,3,4" ? "Mån–fre" : idx.join() === "5,6" ? "Lör–sön" : idx.join() === "0,1,2,3,4,5,6" ? "Alla dagar" : idx.map(i => VECKODAGAR[i]).join(", ");
    return grupper.filter(g => k[g.idx[0]].some(v => v > 0)).map(g => ({ namn: namn(g.idx), data: k[g.idx[0]] }));
  }
  const DAGTEXT = { "mån-sön": "Alla dagar", vardag: "Mån–fre", "lör-sön": "Lör–sön" };
  function passTabell(pass) {
    return `<div class="rull"><table class="guidetabell"><thead><tr><th>Dagar</th><th>Pass</th><th>Rast</th><th>Antal</th><th>Grupp</th></tr></thead><tbody>
      ${pass.map(x => `<tr><td>${DAGTEXT[x.dagar] || x.dagar}</td><td class="mono">${x.fran}–${x.till}</td><td>${x.rast_minuter} min</td><td>${x.antal}</td><td class="dampad">${esc(x.grupp || "")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function klistraForhand(g) {
    if (!KL) return "";
    const { p, b } = tolka(g), DEL = { "morgon,kvall": "Dag och kväll", morgon: "Bara dag", kvall: "Bara kväll", natt: "Natt" };
    let h = "";
    if (p.personer.length) {
      const dk = p.personer.filter(x => x.arbetar !== "natt").length, n = p.personer.length - dk;
      const medTeam = (p.team || []).length > 0;
      h += `<h3>Medarbetare: ${p.personer.length} (${dk} dag och kväll, ${n} natt)${medTeam ? ` i ${p.team.length} team` : ""}</h3><div class="rull"><table class="guidetabell"><thead><tr><th>Id</th><th>Från inklistringen</th><th>Grad</th><th>Arbetar</th><th>Helger</th>${medTeam ? "<th>Team</th>" : ""}</tr></thead><tbody>
        ${p.personer.map(x => `<tr><th>${x.id}</th><td class="dampad">${esc(x.rad)}</td><td>${x.grad} %</td><td>${DEL[x.arbetar]}</td><td>${HELGER[x.helg]}</td>${medTeam ? `<td>${esc(x.team || "–")}</td>` : ""}</tr>`).join("")}</tbody></table></div>
        ${medTeam ? `<p class="liten dampad" style="margin:6px 0 0">Teamen blir områden i ett gemensamt schema. Behovet delas mellan dem som ett förslag, och det går att ändra under fliken Team.</p>` : ""}
        <p class="liten dampad" style="margin:6px 0 0">Kolumnen ”Från inklistringen” visas bara här och sparas inte. Enheten får id-koderna. Spara gärna en egen nyckel.</p>`;
    }
    if (b.behov) {
      h += `<h3 style="margin-top:14px">Behov per dag (dag/kväll/natt)</h3><div class="rull"><table class="guidetabell"><thead><tr><th></th>${VECKODAGAR.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>
        ${[["morgon", "Dag"], ["kvall", "Kväll"], ["natt", "Natt"]].map(([k, t]) => `<tr><th>${t}</th>${VECKODAGAR.map(d => `<td>${b.behov[d][k]}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` +
        (b.grupper && b.grupper.length ? `<p class="liten dampad" style="margin:6px 0 0">Räknat med: ${b.grupper.map(esc).join(", ")}.</p>` : "") +
        (b.pass && b.pass.length ? `<h3 style="margin-top:14px">Bemanningskurva – antal i tjänst över dygnet</h3><div class="grafyta">${kurvaSvg(kurvSerier(b))}</div>
          <h3 style="margin-top:14px">Passen</h3>${passTabell(b.pass)}
          <p class="liten dampad" style="margin:6px 0 0">Passen sparas i enhetens bemanningsbalans, där de kan ändras. Schemat läggs efter behovet per dag, kväll och natt ovan.</p>` : "") +
        (b.tider && Object.keys(b.tider).length ? `<p class="liten dampad" style="margin:6px 0 0">Tider från passen: ${[b.tider.morgon && `dag från ${b.tider.morgon}`, b.tider.kvall && `kväll till ${b.tider.kvall}`, b.tider.nattStart && `natt ${b.tider.nattStart}–${b.tider.nattSlut}`].filter(Boolean).join(", ")}.</p>` : "");
    }
    const varn = [...p.varningar, ...b.varningar];
    if (varn.length) h += `<div class="guidetips varn">⚠ ${varn.map(esc).join("<br>")}</div>`;
    return h || `<p class="dampad liten">Förhandsvisningen visas här när du har klistrat in något.</p>`;
  }

  function klistraHtml(g) {
    return `<section class="kort guide"><p class="guidefraga-nr">Klistra in</p><h2 class="guidefraga">Klistra in personal och behov</h2>
      <p class="dampad">Kopiera raderna i Excel (eller skriv dem) och klistra in. Du kan fylla i det ena, det andra eller båda; resten fyller du i guiden efteråt.</p>
      <div class="klistra-rutor">
        <div><label for="kl-personal">Personal – en rad per person</label>
          <textarea id="kl-personal" data-gk="personal" rows="8" placeholder="Namn&#9;Grad&#9;Arbetar&#9;Helger&#10;Person 1&#9;100%&#9;dag/kväll&#9;varannan&#10;Person 2&#9;75%&#9;bara kväll&#10;Person 3&#9;90%&#9;natt">${esc(g.klistra.personal)}</textarea>
          <p class="liten dampad">Grad som 75 %, 0,75 eller timmar per vecka. Arbetar: dag/kväll, bara dag, bara kväll eller natt. Helger: varannan (standard), var fjärde, alla eller inga.</p></div>
        <div><label for="kl-behov">Behov – hur många i tjänst</label>
          <textarea id="kl-behov" data-gk="behov" rows="8" placeholder="&#9;Dag&#9;Kväll&#9;Natt&#10;Vardag&#9;3&#9;2&#9;1&#10;Helg&#9;2&#9;2&#9;1">${esc(g.klistra.behov)}</textarea>
          <p class="liten dampad">En rad per vardag/helg eller veckodag med antal för dag, kväll och natt. Det går också med pass och tider: en kolumn per veckodag (07:00-15:30 &nbsp;2 2 2 2 2 2 2), eller bemanningsmallen med ett block per veckodag (Från, Till, Rast, Arbetstid, antal).</p></div>
      </div>
      <div id="klistra-forhand" class="klistra-forhand">${klistraForhand(g)}</div>
      <div class="guidenav"><button data-guide="avbryt">Avbryt</button><button class="primar" data-guide="anvand-klistrat">Använd och fortsätt ›</button></div></section>`;
  }

  // För över det inklistrade till guiden. Returnerar ett felmeddelande eller null.
  function anvandKlistrat(g) {
    const { p, b } = tolka(g);
    if (!p.personer.length && !b.behov) return "Klistra in personal, behov eller båda först.";
    if (p.personer.length) {
      const dk = p.personer.filter(x => x.arbetar !== "natt"), n = p.personer.filter(x => x.arbetar === "natt");
      g.antalDag = dk.length; g.antalNatt = n.length;
      // team från rubrikrader i listan ("team 1" …): id T1, T2 … och personernas hemteam
      // team från rubrikrader i listan ("team 1" …) blir områden i ett gemensamt schema, med hemområde per person
      const T = p.team || [];
      if (T.length) { g.omraden = "team"; g.omradesLista = T.map((n, i) => ({ namn: n, farg: OMRADESFARGER[i % OMRADESFARGER.length] })); }
      g.personer = p.personer.map(x => ({ id: x.id, grad: x.grad, arbetar: x.arbetar, helg: x.helg, ...(x.team && T.includes(x.team) ? { omrade: T.indexOf(x.team) } : {}) }));  // utan det inklistrade
      const grader = new Set(g.personer.map(x => x.grad));
      if (grader.size === 1) { g.gradSatt = "samma"; g.grad = g.personer[0].grad; } else g.gradSatt = "olika";
      g.harUndantag = g.personer.some(x => x.helg !== "2/4" || (x.arbetar !== "natt" && x.arbetar !== "morgon,kvall"));
    }
    if (b.behov) {
      const B = b.behov, lika = (x, y) => x.morgon === y.morgon && x.kvall === y.kvall && x.natt === y.natt;
      const enkel = ["tis", "ons", "tor", "fre"].every(d => lika(B[d], B.mån)) && lika(B.lör, B.sön);
      g.behov = { vardag: { ...B.mån }, helg: { ...B.lör } };
      g.behovDag = enkel ? null : structuredClone(B);
      Object.assign(g.tider, b.tider || {});
      g.passMall = b.pass && b.pass.length ? b.pass.map(({ grupp, ...x }) => x) : null;
      g.kurvMall = b.pass && b.pass.length ? kurvSerier(b) : null;
    }
    // det inklistrade finns kvar i minnet så att man kan gå tillbaka och rätta, men sparas aldrig
    g.steg = 1;
    return null;
  }

  // Behov per veckodag till vardag och helg: den tyngsta dagen i varje grupp.
  function forenklaBehov(g) {
    if (!g.behovDag) return;
    const max = (dagar, k) => Math.max(...dagar.map(d => g.behovDag[d][k]));
    g.behov = { vardag: { morgon: max(VECKODAGAR.slice(0, 5), "morgon"), kvall: max(VECKODAGAR.slice(0, 5), "kvall"), natt: max(VECKODAGAR.slice(0, 5), "natt") },
      helg: { morgon: max(["lör", "sön"], "morgon"), kvall: max(["lör", "sön"], "kvall"), natt: max(["lör", "sön"], "natt") } };
    g.behovDag = null;
  }

  function satt(g, falt, varde) {
    g[falt] = falt === "harUndantag" ? varde === "ja" : varde;
    if (falt === "omraden" && harOmraden(g)) while (g.omradesLista.length < 2) laggOmrade(g);
  }

  // Kontroll innan nästa fråga; returnerar ett felmeddelande eller null.
  function kontrollera(g) {
    if (g.steg === 1 && harOmraden(g)) {
      const namn = omradenMedNamn(g).map(o => o.namn.trim().toLowerCase());
      if (namn.length < 2) return "Skriv namn på minst två områden, eller välj Nej.";
      if (new Set(namn).size < namn.length) return "Två områden har samma namn.";
      if (g.omraden === "egna" && !String(g.namn || "").trim()) return "Skriv gruppens namn. Områdena samlas under det.";
    }
    if (g.steg === 2 && !g.antalDag && !g.antalNatt) return "Lägg till minst en medarbetare.";
    if (g.steg === 3) {
      const gr = Object.values(grader(g));
      if (g.gradSatt === "samma" && !Number(g.grad)) return "Ange sysselsättningsgraden.";
      if (g.gradSatt === "olika" && gr.some(x => !Number(x))) return "Ange sysselsättningsgraden för alla.";
      if (g.gradSatt === "budget" && !Number(g.budget)) return "Ange budgeten i timmar per vecka.";
      if (gr.some(x => x < 10 || x > 100)) return "Sysselsättningsgraden ska vara 10–100 %.";
    }
    if (g.steg === 5) {
      const B = g.behovDag ? Object.values(g.behovDag) : [g.behov.vardag, g.behov.helg];
      if (!B.some(x => x.morgon || x.kvall || x.natt)) return "Ange behovet – hur många som behöver vara i tjänst.";
    }
    if (g.steg === 7 && g.startdatum && new Date(g.startdatum + "T00:00:00Z").getUTCDay() !== 1) return "Startdatum ska vara en måndag.";
    return null;
  }

  return { HUS, OMRADESFARGER, laggOmrade, taBortOmrade, omradesEnheter, ny, nyKlistra, anvandKlistrat, forenklaBehov, html, las, satt, kontrollera, indata, tomIndata, tomtSchema, val, berakna, grader, synka, AI_START, SISTA };
})();
if (typeof module !== "undefined") module.exports = GUIDE;
