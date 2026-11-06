"use strict";
// Chattpanel för schemaassistenten i webbsystemet. Verktygen finns i assistent.js och körs här
// i webbläsaren; servern (/api/assistent) anropar Claude med nyckeln.

const chatt = { oppen: false, enhetId: null, meddelanden: [], visning: [], forslag: null, upptagen: false, tillganglig: null, notis: "" };
const CHATT_IKON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>';
const FORSLAG_FRAGOR = ["Hur många kvällar har var och en?", "Hur ser fredagskvällarna ut?", "Var finns vakanserna och var har vi överkapacitet?",
  "Lägg till en person på 75 % som bara jobbar kväll", "Ändra behovet på fredagar till 3 på kvällen"];

document.body.insertAdjacentHTML("beforeend", `
  <button id="chatt-knapp" class="chatt-knapp" aria-label="Öppna schemaassistenten" hidden>${CHATT_IKON}<span>Fråga</span></button>
  <aside id="chatt" class="chatt" aria-label="Schemaassistent" hidden>
    <header><div><b>Schemaassistent</b><div class="dampad liten" id="chatt-enhet"></div></div><button class="lank" id="chatt-stang" aria-label="Stäng">✕</button></header>
    <div id="chatt-logg" class="chatt-logg" aria-live="polite"></div>
    <form id="chatt-form"><textarea id="chatt-text" rows="2" placeholder="Fråga om schemat, eller be om en ändring …" aria-label="Meddelande"></textarea>
      <button class="primar" type="submit" id="chatt-skicka">Skicka</button></form>
  </aside>`);

function chattKontext() {
  const k = st.korning && st.enhet && st.korning.enhet_id === st.enhet.id && st.korning.status === "klar" ? st.korning : chatt.korning;
  return { indata: st.indata, resultat: k?.resultat || null, granskning: k?.granskning || null, forklaring: k?.forklaring || null,
    onForslag: f => { chatt.forslag = f; } };
}

async function hamtaSenasteKorning() {
  chatt.korning = null;
  const klar = (st.korningar || []).find(k => k.status === "klar" && k.losning === "OK") || (st.korningar || []).find(k => k.status === "klar");
  if (klar) { try { chatt.korning = await api("GET", "korningar/" + klar.id); } catch { /* utan schema */ } }
}

function ritaChatt() {
  $("#chatt-knapp").hidden = !st.enhet || chatt.oppen;
  const p = $("#chatt"); p.hidden = !chatt.oppen;
  if (!chatt.oppen) return;
  $("#chatt-enhet").textContent = st.enhet ? st.enhet.namn : "";
  const logg = $("#chatt-logg");
  let h = "";
  if (chatt.tillganglig === false) h += `<div class="banner varn">${IKON.varning}<div><strong>Assistenten är inte påslagen</strong>Den behöver en API-nyckel från Anthropic på datorn. Se docs/assistent.md, eller använd assistenten i lättversionen.</div></div>`;
  if (!chatt.visning.length) h += `<p class="dampad liten">Jag kan svara på frågor om personal, behov och det senaste schemat, och föreslå ändringar som du godkänner. Till exempel:</p>
    <div class="chips">${FORSLAG_FRAGOR.map(f => `<button class="chip" data-g="chatt-fraga">${esc(f)}</button>`).join("")}</div>`;
  for (const m of chatt.visning) {
    if (m.roll === "anvandare") h += `<div class="bubbla du">${esc(m.text)}</div>`;
    else if (m.roll === "verktyg") h += `<div class="chatt-verktyg">${esc(m.text)}</div>`;
    else if (m.roll === "fel") h += `<div class="bubbla fel">${esc(m.text)}</div>`;
    else h += `<div class="bubbla">${formatera(m.text)}</div>`;
  }
  if (chatt.forslag) h += `<div class="forslagskort"><b>${esc(chatt.forslag.sammanfattning)}</b><ul class="punkter liten">${chatt.forslag.texter.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
    <div class="chips"><button class="primar liten" data-g="chatt-godkann">Godkänn</button><button class="liten" data-g="chatt-avvisa">Avvisa</button></div></div>`;
  if (chatt.upptagen) h += `<div class="chatt-verktyg"><span class="spinner"></span>${esc(chatt.status || "Tänker …")}</div>`;
  logg.innerHTML = h;
  logg.scrollTop = logg.scrollHeight;
  $("#chatt-skicka").disabled = chatt.upptagen || chatt.tillganglig === false;
}

// enkel formatering: **fet**, radbrytningar, listor och tabeller som text
function formatera(t) {
  const rader = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split("\n");
  let h = "", lista = false;
  for (const r of rader) {
    if (/^\s*[-•*]\s+/.test(r)) { if (!lista) { h += "<ul>"; lista = true; } h += `<li>${r.replace(/^\s*[-•*]\s+/, "")}</li>`; continue; }
    if (lista) { h += "</ul>"; lista = false; }
    if (/^\s*\|.*\|\s*$/.test(r)) { if (/^\s*\|[\s:|-]+\|\s*$/.test(r)) continue; h += `<div class="mono liten">${r.replace(/\|/g, " │ ")}</div>`; continue; }
    h += r.trim() ? `<p>${r}</p>` : "";
  }
  return h + (lista ? "</ul>" : "");
}

const VERKTYGSTEXT = { las_enhet: "Läser personal och behov …", las_schema: "Läser schemat …", las_dagar: "Tittar på dagarna …", las_person: "Tittar på personens schema …", foresla_andringar: "Förbereder ett förslag …" };

async function skickaChatt(text) {
  if (!st.enhet || chatt.upptagen || !text.trim()) return;
  if (chatt.enhetId !== st.enhet.id) { chatt.enhetId = st.enhet.id; chatt.meddelanden = []; chatt.visning = []; chatt.forslag = null; }
  if (!chatt.korning || chatt.korning.enhet_id !== st.enhet.id) await hamtaSenasteKorning();
  const innehall = (chatt.notis ? chatt.notis + "\n\n" : "") + text.trim();
  chatt.notis = "";
  chatt.visning.push({ roll: "anvandare", text: text.trim() });
  chatt.meddelanden.push({ role: "user", content: innehall });
  chatt.upptagen = true; chatt.status = "Tänker …"; ritaChatt();
  const tools = ASSISTENT.verktyg.map(v => ({ name: v.name, description: v.description, input_schema: v.schema }));
  try {
    for (let varv = 0; varv < 10; varv++) {
      const svar = await api("POST", "assistent", { system: ASSISTENT.SYSTEM, messages: chatt.meddelanden, tools });
      chatt.meddelanden.push({ role: "assistant", content: svar.content });  // oförändrat, även tankeblock
      const text = svar.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      if (text) chatt.visning.push({ roll: "assistent", text });
      if (svar.stop_reason === "refusal") { chatt.visning.push({ roll: "fel", text: "Claude kunde inte svara på det här. Formulera om frågan." }); break; }
      const anrop = svar.content.filter(b => b.type === "tool_use");
      if (svar.stop_reason !== "tool_use" || !anrop.length) break;
      const resultat = [];
      const ctx = chattKontext();
      for (const a of anrop) {
        const v = ASSISTENT.verktyg.find(x => x.name === a.name);
        chatt.status = VERKTYGSTEXT[a.name] || "Arbetar …"; ritaChatt();
        try {
          if (!v) throw new Error("Okänt verktyg");
          const ut = v.kor(ctx, a.input || {});
          resultat.push({ type: "tool_result", tool_use_id: a.id, content: typeof ut === "string" ? ut : JSON.stringify(ut) });
        } catch (e) { resultat.push({ type: "tool_result", tool_use_id: a.id, content: "Fel: " + e.message, is_error: true }); }
      }
      chatt.meddelanden.push({ role: "user", content: resultat });
      ritaChatt();
    }
  } catch (e) {
    chatt.visning.push({ roll: "fel", text: e.message });
    if (e.status === 503) chatt.tillganglig = false;
    // ta bort det obesvarade meddelandet så att samtalet kan fortsätta
    while (chatt.meddelanden.length && chatt.meddelanden.at(-1).role === "user" && typeof chatt.meddelanden.at(-1).content === "string") chatt.meddelanden.pop();
  }
  chatt.upptagen = false; ritaChatt();
}

$("#chatt-knapp").onclick = async () => {
  chatt.oppen = true; ritaChatt(); $("#chatt-text").focus();
  if (chatt.tillganglig === null) { try { chatt.tillganglig = (await api("GET", "assistent/status")).tillganglig; } catch { chatt.tillganglig = false; } ritaChatt(); }
};
$("#chatt-stang").onclick = () => { chatt.oppen = false; ritaChatt(); };
$("#chatt-form").onsubmit = e => { e.preventDefault(); const t = $("#chatt-text").value; $("#chatt-text").value = ""; skickaChatt(t); };
$("#chatt-text").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatt-form").requestSubmit(); } };
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-g^=chatt-]"); if (!el) return;
  if (el.dataset.g === "chatt-fraga") skickaChatt(el.textContent);
  if (el.dataset.g === "chatt-avvisa") { chatt.notis = "[Användaren avvisade förslaget. Inget ändrades.]"; chatt.visning.push({ roll: "verktyg", text: "Förslaget avvisades." }); chatt.forslag = null; ritaChatt(); }
  if (el.dataset.g === "chatt-godkann") {
    try {
      ASSISTENT.tillampa(st.indata, chatt.forslag.andringar);
      chatt.visning.push({ roll: "verktyg", text: "Förslaget är godkänt och sparat. Tryck på Lägg schema för ett nytt schema." });
      chatt.notis = "[Användaren godkände förslaget och det är sparat i indata.]";
      chatt.forslag = null;
      markeraAndrad(true);
      if (st.vy === "indata") ritaEnhet();
      await spara();
    } catch (err) { chatt.visning.push({ roll: "fel", text: "Kunde inte tillämpa förslaget: " + err.message }); }
    ritaChatt();
  }
});
window.addEventListener("hashchange", () => setTimeout(ritaChatt, 300));
setInterval(() => { const k = $("#chatt-knapp"); if (k && !chatt.oppen) k.hidden = !st.enhet; }, 800);
