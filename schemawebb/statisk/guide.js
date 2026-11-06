"use strict";
// Startguiden: det första man möter. Val av vad man vill göra, och en guide i fem steg som skapar en ny
// enhet (enheten, behov, budget, medarbetare, sammanfattning). Delas av webben och lättversionen.
// Guiden räknar bara fram förslag och tips; schemat läggs och granskas som vanligt efteråt.

const GUIDE = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sv = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
  const HELTID = 37, PASS_PER_VECKA = 4.75, NATTPASS_H = 9.5;
  const STEG = ["Enheten", "Behov", "Budget", "Medarbetare", "Klart"];
  const DELAR = [["morgon", "Morgon"], ["kvall", "Kväll"], ["natt", "Natt"]];

  function ny() {
    return { steg: 1, namn: "", veckor: 4, startdatum: "", behov: { vardag: { morgon: 2, kvall: 2, natt: 1 }, helg: { morgon: 2, kvall: 2, natt: 1 } },
      budget: "", timkostnad: "", dagkvall: 6, natt: 2, grad: 100, fordela: true };
  }

  // Vad behovet kräver: pass per vecka, timmar och minsta antal personer med varannan helg och fredagsregeln.
  function berakna(g) {
    const b = g.behov, v = b.vardag, h = b.helg;
    const dagPass = 5 * (v.morgon + v.kvall) + 2 * (h.morgon + h.kvall);
    const nattNatter = 5 * v.natt + 2 * h.natt;
    const dagTimmar = dagPass * HELTID / PASS_PER_VECKA, nattTimmar = nattNatter * NATTPASS_H;
    // varannan helg: dubbelt så många som arbetar en helg; den som tar fredagskvällen arbetar helgen
    const perHelg = h.morgon + Math.max(h.kvall, v.kvall);
    const minDag = dagPass ? Math.max(Math.ceil(dagPass / PASS_PER_VECKA), perHelg * 2) : 0;
    const minNatt = nattNatter ? Math.max(Math.ceil(nattTimmar / HELTID), Math.max(h.natt, v.natt) * 2) : 0;
    return { dagPass, nattNatter, dagTimmar, nattTimmar, behovTimmar: dagTimmar + nattTimmar, minDag, minNatt, perHelg, fredagStyr: v.kvall > h.kvall };
  }

  const steg5 = x => Math.max(0.05, Math.min(1, Math.floor(x / 0.05 + 1e-9) * 0.05));
  // Sysselsättningsgrad för dag/kväll och natt: fördela budgeten, eller samma grad för alla.
  function grader(g) {
    const r = berakna(g), budget = Number(g.budget) || 0;
    if (!g.fordela || !budget) return { dag: g.grad / 100, natt: g.grad / 100 };
    const natt = g.natt ? Math.min(1, Math.ceil(r.nattTimmar / HELTID / g.natt * 20) / 20) : 0;
    const rest = budget - natt * g.natt * HELTID;
    return { dag: g.dagkvall ? steg5(rest / HELTID / g.dagkvall) : 0, natt };
  }

  function kontrakt(g) { const gr = grader(g); return (g.dagkvall * gr.dag + g.natt * gr.natt) * HELTID; }

  function indata(g) {
    const gr = grader(g);
    const personal = [...Array.from({ length: g.dagkvall }, (_, i) => ({ id: `A${i + 1}`, grad: Math.round(gr.dag * 100) / 100 })),
      ...Array.from({ length: g.natt }, (_, i) => ({ id: `N${i + 1}`, grad: Math.round(gr.natt * 100) / 100, dygnsdelar: ["natt"] }))];
    const ut = { enhet: g.namn || "Ny enhet", veckor: Number(g.veckor) || 4, cykliskt: true, behov: structuredClone(g.behov), personal, onskemal: [] };
    if (g.startdatum) ut.startdatum = g.startdatum;
    if (Number(g.budget)) ut.budget_timmar_vecka = Number(g.budget);
    if (Number(g.timkostnad)) ut.timkostnad_kr = Number(g.timkostnad);
    return ut;
  }

  // Den tomma enheten som AI-assistenten fyller i tillsammans med användaren.
  function tomIndata(namn) { return { enhet: namn || "Ny enhet", veckor: 4, cykliskt: true, behov: {}, personal: [], onskemal: [] }; }
  const AI_START = "Jag vill lägga in en ny enhet. Fråga mig steg för steg om medarbetare, sysselsättningsgrad, budget och bemanningsbehov, och föreslå sedan indata som jag kan godkänna.";

  // ---------------------------------------------------------------- startsidan: vad vill du göra?
  function val({ harEnheter = false } = {}) {
    const ruta = (g, ikon, rubrik, text, extra = "") => `<button class="valruta${extra}" data-guide="${g}"><span class="valikon" aria-hidden="true">${ikon}</span><b>${rubrik}</b><span>${text}</span></button>`;
    return `<section class="kort"><h1>Vad vill du göra?</h1><p class="dampad" style="margin:6px 0 14px">Välj en väg. Allt går att ändra efteråt.</p>
      <div class="valrutor">
        ${ruta("ny", "✚", "Skapa ny enhet", "Steg för steg: behov, budget och medarbetare. Du får förslag på hur många som behövs.", " huvud")}
        ${ruta("ai", "🤖", "Få hjälp av AI-assistenten", "Börja med en tom enhet och berätta med egna ord. Assistenten föreslår, du godkänner.")}
        ${ruta("exempel", "◎", "Börja från ett exempel", "Färdiga testfall att pröva systemet med.")}
        ${harEnheter ? ruta("enheter", "▤", "Fortsätt med en enhet", "Öppna en enhet du redan har.") : ""}
      </div>
      <details class="nyttigt"><summary>Bra att veta</summary><ul class="punkter liten">
        <li>Reglerna (dygnsvila 11 h, veckovila 36 h, rast, varannan helg) gäller från start. Ändra under Inställningar eller Regler.</li>
        <li>Behovet är det som styr. Räcker inte personalen blir det en synlig vakans, aldrig ett avtalsbrott.</li>
        <li>Perioder på 4, 8 eller 12 veckor går jämnt ut med 4,75 pass per vecka.</li>
        <li>Ange startdatum och timkostnad så räknas OB och personalkostnad.</li>
        <li>🤖 finns på varje sida. Fråga till exempel ”hur många kvällar har var och en?”.</li>
      </ul></details></section>`;
  }

  // ---------------------------------------------------------------- guiden
  function html(g) {
    const r = berakna(g), gr = grader(g), k = kontrakt(g), budget = Number(g.budget) || 0;
    const stegrad = `<ol class="guidesteg">${STEG.map((t, i) => `<li class="${i + 1 === g.steg ? "aktiv" : i + 1 < g.steg ? "klar" : ""}"><span>${i + 1}</span>${t}</li>`).join("")}</ol>`;
    const tips = t => `<div class="guidetips">💡 ${t}</div>`;
    let h = "";
    if (g.steg === 1) h = `<h2>Enheten</h2>
      <div class="falt"><div><label for="g-namn">Namn på enheten</label><input id="g-namn" data-gf="namn" value="${esc(g.namn)}" placeholder="till exempel Solgården avd 2"></div>
        <div><label for="g-veckor">Schemaperiod</label><select id="g-veckor" data-gf="veckor">${[4, 8, 12].map(v => `<option value="${v}"${+g.veckor === v ? " selected" : ""}>${v} veckor</option>`).join("")}</select></div>
        <div><label for="g-start">Startdatum (måndag, valfritt)</label><input id="g-start" type="date" data-gf="startdatum" value="${esc(g.startdatum)}"></div></div>
      ${tips("Startdatumet behövs för OB och helgdagar. Det kan anges senare.")}`;
    else if (g.steg === 2) h = `<h2>Behov i verksamheten</h2><p class="dampad liten">Hur många behöver vara i tjänst per pass?</p>
      <div class="rull"><table class="guidetabell"><thead><tr><th></th>${DELAR.map(([, t]) => `<th>${t}</th>`).join("")}</tr></thead><tbody>
      ${[["vardag", "Vardag (mån–fre)"], ["helg", "Helg (lör–sön)"]].map(([d, t]) => `<tr><th>${t}</th>${DELAR.map(([k]) => `<td><input type="number" min="0" max="30" inputmode="numeric" data-gb="${d}.${k}" value="${g.behov[d][k]}" aria-label="${t} ${k}"></td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
      ${tips(`Det blir ${r.dagPass} dag- och kvällspass och ${r.nattNatter} nätter per vecka, ungefär <b>${sv(r.behovTimmar)} h per vecka</b>. Behov per veckodag eller vid vissa klockslag läggs in efteråt under Bemanningsbehov.`)}`;
    else if (g.steg === 3) h = `<h2>Budget</h2>
      <div class="falt"><div><label for="g-budget">Timmar per vecka i budget</label><input id="g-budget" type="number" inputmode="decimal" min="0" step="0.5" data-gf="budget" value="${esc(g.budget)}" placeholder="${Math.round(r.behovTimmar)}"></div>
        <div><label for="g-tk">Timkostnad, kr (lön och PO, utan OB, valfritt)</label><input id="g-tk" type="number" inputmode="decimal" min="0" data-gf="timkostnad" value="${esc(g.timkostnad)}"></div></div>
      <p style="margin-top:10px"><button class="liten" data-guide="anvand-behov">Använd behovets ${sv(r.behovTimmar)} h som budget</button></p>
      ${budget ? tips(budget >= r.behovTimmar ? `Budgeten räcker till behovet med ${sv(budget - r.behovTimmar)} h över per vecka (${sv(budget / HELTID, 2)} årsarbetare).` : `Budgeten är <b>${sv(r.behovTimmar - budget)} h mindre</b> än behovet. Räkna med vakanser, eller sänk behovet.`) : tips("Utan budget anger du sysselsättningsgrad själv i nästa steg.")}`;
    else if (g.steg === 4) h = `<h2>Medarbetare</h2>
      <div class="falt"><div><label for="g-dk">Antal med dag och kväll</label><input id="g-dk" type="number" min="0" max="80" inputmode="numeric" data-gf="dagkvall" value="${g.dagkvall}"></div>
        <div><label for="g-natt">Antal med natt</label><input id="g-natt" type="number" min="0" max="40" inputmode="numeric" data-gf="natt" value="${g.natt}"></div></div>
      <div style="margin-top:10px">${budget ? `<label class="check"><input type="checkbox" data-gf="fordela"${g.fordela ? " checked" : ""}> Fördela budgeten (${sv(budget)} h) på medarbetarna</label>` : ""}
        ${!budget || !g.fordela ? `<div style="margin-top:8px;max-width:220px"><label for="g-grad">Sysselsättningsgrad för alla, %</label><input id="g-grad" type="number" min="10" max="100" step="5" data-gf="grad" value="${g.grad}"></div>` : ""}</div>
      ${tips(`För helgerna behövs minst <b>${r.minDag} med dag och kväll</b>${r.fredagStyr ? " (fredagskvällen styr: den som arbetar fredag kväll arbetar hela helgen)" : ""} och minst <b>${r.minNatt} med natt</b>, med varannan helg.`)}
      ${g.dagkvall < r.minDag || g.natt < r.minNatt ? `<div class="guidetips varn">⚠ Färre än så ger vakanser på helgerna, oavsett timmar. <button class="liten" data-guide="minsta">Använd ${r.minDag} och ${r.minNatt}</button></div>` : ""}
      <p class="liten" style="margin-top:10px">Grad: dag och kväll <b>${Math.round(gr.dag * 100)} %</b>${g.natt ? `, natt <b>${Math.round(gr.natt * 100)} %</b>` : ""}. Kontrakterad tid <b>${sv(k)} h per vecka</b>${budget ? ` av budgeten ${sv(budget)} h` : ""}.</p>`;
    else h = `<h2>Sammanfattning</h2>
      <ul class="punkter"><li><b>${esc(g.namn || "Ny enhet")}</b>, ${g.veckor} veckor${g.startdatum ? `, från ${esc(g.startdatum)}` : ""}</li>
        <li>Behov vardag ${g.behov.vardag.morgon}/${g.behov.vardag.kvall}/${g.behov.vardag.natt}, helg ${g.behov.helg.morgon}/${g.behov.helg.kvall}/${g.behov.helg.natt} (morgon/kväll/natt)</li>
        <li>${g.dagkvall} med dag och kväll (${Math.round(gr.dag * 100)} %), ${g.natt} med natt${g.natt ? ` (${Math.round(gr.natt * 100)} %)` : ""}, id-koder A1, A2 … och N1, N2 …</li>
        <li>Kontrakterad tid ${sv(k)} h per vecka${budget ? `, budget ${sv(budget)} h` : ""}${Number(g.timkostnad) ? `, timkostnad ${g.timkostnad} kr` : ""}</li></ul>
      ${tips("Medarbetarna får id-koder i stället för namn. Grad, nätter och helgundantag per person ändras under Medarbetare.")}`;
    const nav = `<div class="guidenav">${g.steg > 1 ? `<button data-guide="tillbaka">‹ Tillbaka</button>` : `<button data-guide="avbryt">Avbryt</button>`}
      ${g.steg < 5 ? `<button class="primar" data-guide="nasta">Nästa ›</button>` : `<span class="chips"><button data-guide="skapa">Skapa enheten</button><button class="primar" data-guide="skapa-lagg">Skapa och lägg schema</button></span>`}</div>`;
    return `<section class="kort guide">${stegrad}${h}${nav}</section>`;
  }

  // Läs fälten i guiden till tillståndet. Anropas vid varje ändring.
  function las(g, el) {
    if (el.dataset.gb) { const [d, k] = el.dataset.gb.split("."); g.behov[d][k] = Math.max(0, parseInt(el.value) || 0); return true; }
    const f = el.dataset.gf; if (!f) return false;
    if (f === "fordela") g.fordela = el.checked;
    else if (["dagkvall", "natt", "grad", "veckor"].includes(f)) g[f] = Math.max(0, parseInt(el.value) || 0);
    else g[f] = el.value;
    return true;
  }

  // Kontroll innan nästa steg; returnerar ett felmeddelande eller null.
  function kontrollera(g) {
    if (g.steg === 1 && g.startdatum && new Date(g.startdatum + "T00:00:00Z").getUTCDay() !== 1) return "Startdatum ska vara en måndag.";
    if (g.steg === 4 && !g.dagkvall && !g.natt) return "Lägg till minst en medarbetare.";
    if (g.steg === 4 && (!g.budget || !g.fordela) && (g.grad < 10 || g.grad > 100)) return "Sysselsättningsgraden ska vara 10–100 %.";
    return null;
  }

  return { ny, html, las, kontrollera, indata, tomIndata, val, berakna, grader, AI_START };
})();
if (typeof module !== "undefined") module.exports = GUIDE;
