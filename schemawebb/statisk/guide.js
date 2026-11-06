"use strict";
// Startguiden: det första man möter. ”Vad vill du göra?” och en frågeguide som ställer en fråga i taget:
// gruppen, antal medarbetare, sysselsättning, undantag, behov, tider för passen, period, och till sist hur
// schemat ska läggas (🤖 lägger det, eller man lägger det själv). Delas av webben och lättversionen.
// Guiden räknar bara fram förslag och tips; schemat läggs och granskas som vanligt efteråt.

const GUIDE = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sv = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
  const HELTID = 37, PASS_PER_VECKA = 4.75;
  const ARBETAR = { "morgon,kvall": "Dag och kväll", morgon: "Bara dag", kvall: "Bara kväll", natt: "Natt" };
  const HELGER = { "2/4": "Varannan helg", "1/4": "Var fjärde", "3/4": "Tre av fyra", alla: "Alla helger", ingen: "Inga helger" };
  const FRAGOR = ["Gruppen", "Medarbetare", "Sysselsättning", "Undantag", "Behov", "Tider", "Period", "Lägg schemat"];
  const SISTA = FRAGOR.length;

  function ny() {
    return { steg: 1, namn: "", antalDag: 8, antalNatt: 2, gradSatt: "samma", grad: 100, budget: "", personer: [], harUndantag: false,
      behov: { vardag: { morgon: 2, kvall: 2, natt: 1 }, helg: { morgon: 2, kvall: 2, natt: 1 } },
      tider: { morgon: "07:00", kvall: "22:00", nattStart: "21:45", nattSlut: "07:15" }, veckor: 4, startdatum: "", timkostnad: "" };
  }

  // Personlistan följer antalet: A1, A2 … för dag och kväll, N1, N2 … för natt. Ändrade värden ligger kvar.
  function synka(g) {
    const gamla = new Map(g.personer.map(p => [p.id, p]));
    g.personer = [...Array.from({ length: g.antalDag }, (_, i) => `A${i + 1}`), ...Array.from({ length: g.antalNatt }, (_, i) => `N${i + 1}`)]
      .map(id => gamla.get(id) || { id, grad: g.grad, arbetar: id[0] === "N" ? "natt" : "morgon,kvall", helg: "2/4" });
  }

  const nattTimmarPass = g => { const m = t => { const [h, x] = t.split(":").map(Number); return h * 60 + x; };
    let d = m(g.tider.nattSlut) - m(g.tider.nattStart); if (d <= 0) d += 1440; return d / 60; };

  // Vad behovet kräver: pass och timmar per vecka, och minsta antal med varannan helg och fredagsregeln.
  function berakna(g) {
    const v = g.behov.vardag, h = g.behov.helg;
    const dagPass = 5 * (v.morgon + v.kvall) + 2 * (h.morgon + h.kvall), natter = 5 * v.natt + 2 * h.natt;
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
    const gr = grader(g);
    const personal = g.personer.map(p => {
      const ut = { id: p.id, grad: Math.round(gr[p.id]) / 100 };
      const arb = g.harUndantag || p.id[0] === "N" ? p.arbetar : p.id[0] === "N" ? "natt" : "morgon,kvall";
      if (arb !== "morgon,kvall") ut.dygnsdelar = arb.split(",");
      if (g.harUndantag && p.helg !== "2/4") ut.helgfrekvens = p.helg;
      return ut;
    });
    const ut = { enhet: g.namn || "Ny enhet", veckor: Number(g.veckor) || 4, cykliskt: true, behov: structuredClone(g.behov), personal, onskemal: [] };
    const regler = {};
    if (g.tider.morgon !== "07:00") regler.morgon_start = g.tider.morgon;
    if (g.tider.kvall !== "22:00") regler.kvall_slut = g.tider.kvall;
    if (Object.keys(regler).length) ut.regler = regler;
    if (g.tider.nattStart !== "21:45" || g.tider.nattSlut !== "07:15") ut.nattpass = [{ id: "N", start: g.tider.nattStart, slut: g.tider.nattSlut, maltidsuppehall: true }];
    if (g.startdatum) ut.startdatum = g.startdatum;
    if (Number(g.budget)) ut.budget_timmar_vecka = Number(g.budget);
    if (Number(g.timkostnad)) ut.timkostnad_kr = Number(g.timkostnad);
    return ut;
  }

  // Den tomma enheten som AI-assistenten fyller i tillsammans med användaren.
  function tomIndata(namn) { return { enhet: namn || "Ny enhet", veckor: 4, cykliskt: true, behov: {}, personal: [], onskemal: [] }; }
  const AI_START = "Jag vill lägga in en ny enhet. Fråga mig steg för steg om medarbetare, sysselsättningsgrad, undantag, bemanningsbehov och tider, och föreslå sedan indata som jag kan godkänna.";

  // Ett tomt grundschema för den som vill lägga schemat själv.
  function tomtSchema(ind) { const N = (ind.veckor || 4) * 7; return Object.fromEntries(ind.personal.map(p => [p.id, Array(N).fill(null)])); }

  // ---------------------------------------------------------------- startsidan
  function val({ harEnheter = false } = {}) {
    const ruta = (g, ikon, rubrik, text, extra = "") => `<button class="valruta${extra}" data-guide="${g}"><span class="valikon" aria-hidden="true">${ikon}</span><b>${rubrik}</b><span>${text}</span></button>`;
    return `<section class="kort"><h1>Vad vill du göra?</h1><p class="dampad" style="margin:6px 0 14px">Välj en väg. Allt går att ändra efteråt.</p>
      <div class="valrutor">
        ${ruta("ny", "✚", "Skapa ny enhet", "Svara på några frågor om gruppen, behovet och tiderna. Välj sedan om 🤖 lägger schemat eller om du gör det själv.", " huvud")}
        ${ruta("ai", "🤖", "Berätta för AI-assistenten", "Börja med en tom enhet och beskriv med egna ord. Assistenten föreslår, du godkänner.")}
        ${ruta("exempel", "◎", "Börja från ett exempel", "Färdiga testfall att pröva systemet med.")}
        ${harEnheter ? ruta("enheter", "▤", "Fortsätt med en enhet", "Öppna en enhet du redan har.") : ""}
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
    const tal = (id, falt, varde, etikett, max = 80) => `<div><label for="${id}">${etikett}</label><input id="${id}" type="number" min="0" max="${max}" inputmode="numeric" data-gf="${falt}" value="${varde}"></div>`;
    let h = "";
    switch (g.steg) {
      case 1: h = fraga("Vad heter gruppen?", "Till exempel avdelningen, boendet eller arbetslaget.") +
        `<input id="g-namn" data-gf="namn" value="${esc(g.namn)}" placeholder="Solgården avd 2" style="max-width:420px">`; break;
      case 2: h = fraga("Hur många medarbetare är det i gruppen?") +
        `<div class="falt" style="max-width:520px">${tal("g-dk", "antalDag", g.antalDag, "Arbetar dag och kväll")}${tal("g-natt", "antalNatt", g.antalNatt, "Arbetar natt", 40)}</div>` +
        tips(`Ni är ${g.antalDag + g.antalNatt} totalt. De får id-koder (A1, A2 … och N1, N2 …) i stället för namn.`); break;
      case 3: h = fraga("Vilken sysselsättningsgrad har de?") +
        `<div class="valknappar">${valknapp("gradSatt", "samma", "Samma för alla", g.gradSatt === "samma")}${valknapp("gradSatt", "olika", "Olika per person", g.gradSatt === "olika")}${valknapp("gradSatt", "budget", "Fördela en budget i timmar", g.gradSatt === "budget")}</div>` +
        (g.gradSatt === "samma" ? `<div style="max-width:220px;margin-top:12px"><label for="g-grad">Sysselsättningsgrad, %</label><input id="g-grad" type="number" min="10" max="100" step="5" data-gf="grad" value="${g.grad}"></div>` : "") +
        (g.gradSatt === "budget" ? `<div style="max-width:260px;margin-top:12px"><label for="g-budget">Timmar per vecka i budget</label><input id="g-budget" type="number" min="0" step="0.5" inputmode="decimal" data-gf="budget" value="${esc(g.budget)}"></div>` : "") +
        (g.gradSatt === "olika" ? `<div class="rull" style="margin-top:12px"><table class="guidetabell"><thead><tr><th>Medarbetare</th><th>Grad %</th></tr></thead><tbody>${g.personer.map((p, i) => `<tr><th>${esc(p.id)}</th><td><input type="number" min="10" max="100" step="5" data-gp="${i}.grad" value="${p.grad}" aria-label="Grad för ${esc(p.id)}"></td></tr>`).join("")}</tbody></table></div>` : "") +
        tips(`Kontrakterad tid blir <b>${sv(k)} h per vecka</b> (${sv(k / HELTID, 2)} årsarbetare)${budget && g.gradSatt === "budget" ? ` av budgeten ${sv(budget)} h` : ""}.`); break;
      case 4: h = fraga("Finns det undantag?", "Till exempel någon som bara arbetar kväll, bara natt, eller inte varannan helg.") +
        `<div class="valknappar">${valknapp("harUndantag", "nej", "Nej, alla arbetar som vanligt", !g.harUndantag)}${valknapp("harUndantag", "ja", "Ja, några har undantag", g.harUndantag)}</div>` +
        (g.harUndantag ? `<div class="rull" style="margin-top:12px"><table class="guidetabell"><thead><tr><th>Medarbetare</th><th>Arbetar</th><th>Helger</th></tr></thead><tbody>${g.personer.map((p, i) => `<tr><th>${esc(p.id)}</th>
          <td><select data-gp="${i}.arbetar" aria-label="Arbetar, ${esc(p.id)}">${Object.entries(ARBETAR).map(([a, t]) => `<option value="${a}"${p.arbetar === a ? " selected" : ""}>${t}</option>`).join("")}</select></td>
          <td><select data-gp="${i}.helg" aria-label="Helger, ${esc(p.id)}">${Object.entries(HELGER).map(([a, t]) => `<option value="${a}"${p.helg === a ? " selected" : ""}>${t}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>` +
          tips("Undantag från varannan helg görs per person och visas som undantag i schemat. Enhetens regel är fortfarande varannan helg.") : tips("Alla med dag och kväll arbetar båda, och alla arbetar varannan helg.")); break;
      case 5: h = fraga("Hur ser behovet ut i veckan?", "Hur många behöver vara i tjänst per pass?") +
        `<div class="rull"><table class="guidetabell"><thead><tr><th></th><th>Dag</th><th>Kväll</th><th>Natt</th></tr></thead><tbody>
        ${[["vardag", "Vardag (mån–fre)"], ["helg", "Helg (lör–sön)"]].map(([d, t]) => `<tr><th>${t}</th>${["morgon", "kvall", "natt"].map(x => `<td><input type="number" min="0" max="30" inputmode="numeric" data-gb="${d}.${x}" value="${g.behov[d][x]}" aria-label="${t} ${x}"></td>`).join("")}</tr>`).join("")}</tbody></table></div>` +
        tips(`Det blir ${r.dagPass} dag- och kvällspass och ${r.natter} nätter per vecka, ungefär <b>${sv(r.behovTimmar)} h per vecka</b>. För helgerna behövs minst <b>${r.minDag} med dag och kväll</b> och <b>${r.minNatt} med natt</b>${r.fredagStyr ? " (fredagskvällen styr: den som arbetar fredag kväll arbetar helgen)" : ""}.`) +
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
      default: h = fraga("Hur vill du lägga schemat?") +
        `<ul class="punkter liten"><li><b>${esc(g.namn || "Ny enhet")}</b>, ${g.veckor} veckor${g.startdatum ? ` från ${esc(g.startdatum)}` : ""}</li>
          <li>${g.antalDag} med dag och kväll, ${g.antalNatt} med natt, ${sv(k)} h kontrakterat per vecka${g.harUndantag ? `, ${g.personer.filter(p => p.helg !== "2/4" || (p.id[0] === "A" && p.arbetar !== "morgon,kvall")).length} med undantag` : ""}</li>
          <li>Behov vardag ${g.behov.vardag.morgon}/${g.behov.vardag.kvall}/${g.behov.vardag.natt}, helg ${g.behov.helg.morgon}/${g.behov.helg.kvall}/${g.behov.helg.natt} (dag/kväll/natt), ungefär ${sv(r.behovTimmar)} h per vecka</li>
          <li>Dag från ${g.tider.morgon}, kväll till ${g.tider.kvall}, natt ${g.tider.nattStart}–${g.tider.nattSlut}</li></ul>
        <div class="valrutor" style="margin-top:14px">
          <button class="valruta huvud" data-guide="skapa-ai"><span class="valikon" aria-hidden="true">🤖</span><b>Låt AI lägga schemat</b><span>Ett schema som följer reglerna, med så få vakanser som möjligt och jämn fördelning. Du kan justera det efteråt.</span></button>
          <button class="valruta" data-guide="skapa-manuellt"><span class="valikon" aria-hidden="true">✋</span><b>Lägg schemat själv</b><span>Börja med ett tomt schema och lägg passen. Varje pass granskas direkt mot reglerna.</span></button>
        </div>
        <p style="margin-top:12px"><button class="lank" data-guide="skapa">Bara skapa enheten, lägg schemat senare</button></p>`;
    }
    const nav = `<div class="guidenav">${g.steg > 1 ? `<button data-guide="tillbaka">‹ Tillbaka</button>` : `<button data-guide="avbryt">Avbryt</button>`}
      ${g.steg < SISTA ? `<button class="primar" data-guide="nasta">Nästa ›</button>` : ""}</div>`;
    const prickar = `<div class="guideprickar" aria-hidden="true">${FRAGOR.map((t, i) => `<i class="${i + 1 === g.steg ? "aktiv" : i + 1 < g.steg ? "klar" : ""}" title="${t}"></i>`).join("")}</div>`;
    return `<section class="kort guide">${prickar}${h}${nav}</section>`;
  }

  // Läs ett fält i guiden till tillståndet. Returnerar true om något ändrades.
  function las(g, el) {
    if (el.dataset.gb) { const [d, k] = el.dataset.gb.split("."); g.behov[d][k] = Math.max(0, parseInt(el.value) || 0); return true; }
    if (el.dataset.gt) { if (el.value) g.tider[el.dataset.gt] = el.value; return true; }
    if (el.dataset.gp) { const [i, k] = el.dataset.gp.split("."); g.personer[+i][k] = k === "grad" ? Math.max(0, parseInt(el.value) || 0) : el.value; return true; }
    const f = el.dataset.gf; if (!f) return false;
    if (["antalDag", "antalNatt", "grad", "veckor"].includes(f)) g[f] = Math.max(0, parseInt(el.value) || 0);
    else g[f] = el.value;
    if (f === "grad") g.personer.forEach(p => (p.grad = g.grad));
    return true;
  }

  function satt(g, falt, varde) { g[falt] = falt === "harUndantag" ? varde === "ja" : varde; }

  // Kontroll innan nästa fråga; returnerar ett felmeddelande eller null.
  function kontrollera(g) {
    if (g.steg === 2 && !g.antalDag && !g.antalNatt) return "Lägg till minst en medarbetare.";
    if (g.steg === 3) {
      const gr = Object.values(grader(g));
      if (g.gradSatt === "budget" && !Number(g.budget)) return "Ange budgeten i timmar per vecka.";
      if (gr.some(x => x < 10 || x > 100)) return "Sysselsättningsgraden ska vara 10–100 %.";
    }
    if (g.steg === 7 && g.startdatum && new Date(g.startdatum + "T00:00:00Z").getUTCDay() !== 1) return "Startdatum ska vara en måndag.";
    return null;
  }

  return { ny, html, las, satt, kontrollera, indata, tomIndata, tomtSchema, val, berakna, grader, synka, AI_START, SISTA };
})();
if (typeof module !== "undefined") module.exports = GUIDE;
