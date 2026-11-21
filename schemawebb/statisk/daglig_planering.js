"use strict";
/* Avgränsad testvy för datumplanering. Kräver DODEX_PLANERING_DEMO=1.
   Endast syntetiska koder, ingen integration eller automatisk bokning. */
const DAGLIG = (() => {
  let aktuellEnhet = null, data = null, testvikarier = [], valtPass = null;
  let datumFran = null, datumTill = null;
  const element = id => document.getElementById(id);
  const e = value => esc(String(value == null ? "" : value));
  const tid = x => x ? x.substring(11, 16) : "";
  const d = x => x ? x.substring(0, 10) : "";
  const meddelande = txt => { if (typeof meddela === "function") meddela(txt); };
  const datumstr = x => {
    const y = x.getFullYear(), m = String(x.getMonth()+1).padStart(2,"0"), da = String(x.getDate()).padStart(2,"0");
    return [y,m,da].join("-");
  };
  function standardperiod() {
    const idag = new Date();
    idag.setDate(idag.getDate() - (idag.getDay()+6)%7);
    return [datumstr(idag), datumstr(new Date(idag.getFullYear(), idag.getMonth(), idag.getDate()+13))];
  }
  function statustext(p) {
    const s = p.daglig;
    if (s.bokning) return "Bokad: " + s.bokning.vikarie;
    if (s.bedomning) {
      if (s.bedomning.beslut === "vikariebehov") return "Behöver vikarie";
      if (s.bedomning.beslut === "intern_resurs") return "Intern resurs bedömd";
      return "Ingen vikarie behövs";
    }
    if (s.franvaro) return "Frånvaro, ej bedömd";
    return "Planerad";
  }
  function valj(id) { valtPass = id; rita(); }
  async function ladda() {
    const query = "?fran=" + encodeURIComponent(datumFran) + "&till=" + encodeURIComponent(datumTill);
    data = await api("GET", "enheter/" + aktuellEnhet + "/daglig-planering" + query);
    testvikarier = await api("GET", "enheter/" + aktuellEnhet + "/testvikarier");
    if (!data.pass.some(p => p.id === valtPass)) valtPass = data.pass[0]?.id || null;
    rita();
  }
  function visaSammanfattning() {
    const n = data.nyckeltal;
    const tal = [
      [n.pass, "Planerade pass"], [n.franvaro, "Frånvaro"],
      [n.obedomda, "Ej bedömda"], [n.vikariebehov, "Vikariebehov"],
      [n.bokade, "Bokade"], [n.olosta, "Olösta behov"],
      [n.utfall_rapporterade, "Utfall registrerade"]
    ];
    let html = '<section class="kort"><h2>Bemanningsläge och uppföljning</h2><div class="nyckeltal">';
    for (const [v, text] of tal) html += '<div><b>' + e(v) + '</b><span>' + e(text) + '</span></div>';
    html += '</div><p>Rapporterat arbete: <b>' + e(data.nyckeltal.arbetade_timmar.toFixed(1))
      + ' timmar</b> · Rapporterade kostnader: <b>' + e(data.nyckeltal.rapporterad_kostnad_kr.toFixed(0))
      + ' kr</b> (endast manuellt inmatade testvärden).</p></section>';
    html += '<section class="kort"><h2>Synliga målkonflikter och saknad information</h2>';
    if (data.malkonflikter.length) {
      html += '<ul>' + data.malkonflikter.map(x => '<li><b>' + e(x.typ) + ':</b> ' + e(x.text) + '</li>').join("") + '</ul>';
    } else html += '<p>Inga öppna bemanningsavvikelser i detta testintervall.</p>';
    html += '<p class="dampad liten">Detta är en första operativ avvikelseanalys, inte en komplett bedömning av arbetsmiljö, kvalitet eller långsiktig kompetensförsörjning.</p></section>';
    return html;
  }
  function detaljer(p) {
    if (!p) return '<section class="kort"><h2>Välj ett arbetspass</h2><p>Inga pass finns i perioden. Kontrollera att ett schema är godkänt och aktiverat.</p></section>';
    const s = p.daglig;
    let html = '<section class="kort"><h2>Arbeta med passet</h2><p><b>' + e(p.datum) + ' '
      + e(tid(p.start)) + '–' + e(tid(p.slut)) + '</b> · ' + e(p.person_id)
      + ' · ' + e(statustext(p)) + '</p><p class="dampad liten">Kompetenskrav: '
      + e(p.kravda_kompetenser.join(", ") || "Inget angivet") + '</p>';
    if (!s.franvaro) {
      html += '<form id="daglig-franvaro"><label>Registrera testfrånvaro <select name="orsak">'
        + '<option value="sjuk">Sjuk</option><option value="semester">Semester</option><option value="vab">VAB</option>'
        + '<option value="utbildning">Utbildning</option><option value="annan">Annan</option></select></label>'
        + '<button class="knapp" type="submit">Registrera frånvaro</button></form>';
    } else {
      html += '<p>Frånvaro: <b>' + e(s.franvaro.orsak) + '</b></p>';
      if (!s.bokning) html += '<button type="button" class="liten" id="daglig-aterta">Återta frånvaro</button>';
      if (!s.bokning) {
        html += '<form id="daglig-bedom"><label>Bedömt täckningsbehov <select name="beslut">'
          + '<option value="vikariebehov">Vikarie behövs</option><option value="intern_resurs">Kan täckas av intern resurs</option>'
          + '<option value="inget_vikariebehov">Ingen ersättare behövs</option></select></label>'
          + '<label>Motivering <input name="motivering" type="text" maxlength="500" required '
          + 'placeholder="Bedöm behov och kompetens, kontrollera resurstid"></label>'
          + '<button type="submit" class="knapp">Spara täckningsbeslut</button></form>';
      }
      if (s.bedomning) html += '<p>Senaste bedömning: <b>' + e(s.bedomning.beslut)
        + '</b> – ' + e(s.bedomning.motivering) + '</p>';
      if (s.bedomning?.beslut === "vikariebehov") {
        if (s.bokning) {
          html += '<p>Bokning: <b>' + e(s.bokning.vikarie) + '</b></p><button id="daglig-avboka" type="button">Avboka testbokning</button>';
        } else {
          html += '<form id="daglig-bokning"><label>Testvikarie <select name="vikarie" required><option value="">Välj testkod</option>'
            + testvikarier.map(v => '<option value="' + e(v.kod) + '">' + e(v.kod) + ' – '
                + e(v.kompetenser.join(", ") || "Ingen kompetens registrerad") + '</option>').join("")
            + '</select></label><p class="dampad liten">Kontroll omfattar registrerad kompetens och andra testbokningar. '
            + 'Ordinarie pass i Heroma kontrolleras inte.</p>'
            + '<button class="knapp" type="submit">Bekräfta testbokning</button></form>';
        }
      }
    }
    html += '<form id="daglig-utfall"><h3>Registrera faktiskt utfall</h3>'
      + '<label>Arbetade minuter <input name="minuter" type="number" min="0" max="' + e(p.planerade_minuter)
      + '" value="' + e(s.utfall?.arbetade_minuter ?? p.planerade_minuter) + '" required></label>'
      + '<label>Kostnad i kr (valfritt testvärde) <input name="kostnad" type="number" min="0" step="0.01"'
      + ' value="' + e(s.utfall?.kostnad_kr ?? "") + '"></label>'
      + '<label>Kommentar <input name="kommentar" maxlength="500" value="' + e(s.utfall?.kommentar ?? "") + '"></label>'
      + '<button class="knapp" type="submit">Spara utfall</button></form>'
      + '<details><summary>Händelsehistorik</summary><div id="daglig-historik">Välj "Visa historik" för händelser.</div>'
      + '<button type="button" class="liten" id="daglig-hamta-historik">Visa historik</button></details></section>';
    return html;
  }
  function rita() {
    if (!data) return;
    const vald = data.pass.find(p => p.id === valtPass);
    let html = '<section class="kort"><h1>Daglig bemanning – testpilot</h1>'
      + '<div class="banner varn"><div><strong>Endast syntetiska personkoder och testdata</strong>'
      + '<span class="liten">Ingen Heroma-koppling, inga riktiga vikarieförfrågningar och ingen automatisk bokning. '
      + 'Grundschemat kan inte ändras här.</span></div></div>'
      + '<form id="daglig-period"><label>Från <input type="date" name="fran" value="' + e(datumFran) + '" required></label>'
      + '<label>Till <input type="date" name="till" value="' + e(datumTill) + '" required></label>'
      + '<button class="knapp" type="submit">Visa period</button></form></section>';
    html += visaSammanfattning();
    html += '<section class="kort"><h2>Arbetspass i perioden</h2><div class="rull"><table><thead><tr>'
      + '<th>Datum</th><th>Personkod</th><th>Pass</th><th>Status</th><th></th></tr></thead><tbody>';
    for (const p of data.pass) html += '<tr' + (p.id === valtPass ? ' class="nu"' : '') + '>'
      + '<td>' + e(p.datum) + '</td><td>' + e(p.person_id) + '</td><td>' + e(tid(p.start)) + '–'
      + e(tid(p.slut)) + '</td><td>' + e(statustext(p)) + '</td>'
      + '<td><button class="liten" type="button" data-plan-pass="' + e(p.id) + '">Välj</button></td></tr>';
    html += '</tbody></table></div></section>' + detaljer(vald);
    html += '<section class="kort"><h2>Testvikariepool</h2><p class="dampad liten">Använd enbart fiktiva id-koder, exempelvis V001. '
      + 'Kompetenser anges med samma id som i enhetens kompetenslista.</p>'
      + '<form id="daglig-ny-vikarie"><label>Kod <input type="text" name="kod" pattern="[A-Za-z0-9_-]+" '
      + 'maxlength="30" required placeholder="V001"></label><label>Kompetens-ID (kommaavskilda) '
      + '<input name="kompetenser" placeholder="del, usk"></label><button type="submit">Lägg till testvikarie</button></form></section>';
    vy().innerHTML = html;
    bind();
  }
  async function skicka(typ, fler={}) {
    try {
      if (!valtPass) return;
      await api("POST", "enheter/" + aktuellEnhet + "/planeringshandelser",
        Object.assign({pass_id: valtPass, typ: typ}, fler));
      meddelande("Testhändelsen är sparad.");
      await ladda();
    } catch (err) { meddelande(err.message); }
  }
  function bind() {
    for (const kn of document.querySelectorAll("[data-plan-pass]"))
      kn.onclick = () => valj(kn.getAttribute("data-plan-pass"));
    const period = element("daglig-period");
    if (period) period.onsubmit = async ev => {
      ev.preventDefault(); const f = new FormData(period); datumFran = f.get("fran"); datumTill = f.get("till");
      try { await ladda(); } catch(err) { meddelande(err.message); }
    };
    const franvaro = element("daglig-franvaro");
    if (franvaro) franvaro.onsubmit = ev => {ev.preventDefault();skicka("franvaro", {orsak: new FormData(franvaro).get("orsak")});};
    const bedom = element("daglig-bedom");
    if (bedom) bedom.onsubmit = ev => {
      ev.preventDefault();const f = new FormData(bedom);
      skicka("bedomning", {beslut: f.get("beslut"), motivering: f.get("motivering")});
    };
    const bok = element("daglig-bokning");
    if (bok) bok.onsubmit = ev => {
      ev.preventDefault();const code = new FormData(bok).get("vikarie");
      if (code) skicka("bokning", {vikarie: code});
    };
    const utfall = element("daglig-utfall");
    if (utfall) utfall.onsubmit = ev => {
      ev.preventDefault();const f = new FormData(utfall);
      skicka("utfall", {arbetade_minuter: Number(f.get("minuter")), kostnad_kr: f.get("kostnad") ? Number(f.get("kostnad")) : null,
        motivering: f.get("kommentar")});
    };
    const ater = element("daglig-aterta");
    if (ater) ater.onclick = () => {if (confirm("Återta testfrånvaron?")) skicka("aterta_franvaro");};
    const av = element("daglig-avboka");
    if (av) av.onclick = () => {if (confirm("Avboka testvikarien?")) skicka("avboka", {motivering: "Avbokad i testvyn"});};
    const nv = element("daglig-ny-vikarie");
    if (nv) nv.onsubmit = async ev => {
      ev.preventDefault();const f = new FormData(nv);
      const kompetenser = String(f.get("kompetenser") || "").split(",").map(x=>x.trim()).filter(Boolean);
      try {
        await api("POST", "enheter/" + aktuellEnhet + "/testvikarier", {kod: f.get("kod"), kompetenser});
        meddelande("Testvikarie sparad."); await ladda();
      } catch (err) { meddelande(err.message); }
    };
    const historik = element("daglig-hamta-historik");
    if (historik) historik.onclick = async () => {
      try {
        const list = await api("GET", "enheter/" + aktuellEnhet + "/planeringshistorik?pass_id=" + encodeURIComponent(valtPass));
        const el = element("daglig-historik");
        if (el) el.innerHTML = list.length ? '<ol>' + list.map(x => '<li>' + e(x.typ) + ' · ' + e(x.aktor)
          + ' · ' + e(new Date(x.skapad * 1000).toLocaleString("sv-SE")) + '</li>').join("") + '</ol>' : '<p>Inga händelser ännu.</p>';
      } catch (err) { meddelande(err.message); }
    };
  }
  async function visa(id) {
    aktuellEnhet = id;
    valtPass = null;
    [datumFran,datumTill] = standardperiod();
    st.vy = "daglig-planering";
    await laddaEnhet(id);
    ritaMeny();
    sokvag([["Enheter", "#/"],[st.enhet.namn,"#/e/"+id+"/schema"],["Daglig bemanning"]]);
    try { await ladda(); }
    catch (err) {
      vy().innerHTML = '<section class="kort"><h1>Daglig bemanning</h1><p>'
        + e(err.message) + '</p><p>Denna pilot är avstängd som standard. Endast testmiljö med fiktiva uppgifter.</p></section>';
    }
  }
  return {visa};
})();
async function visaDagligPlanering(id) { return DAGLIG.visa(id); }
