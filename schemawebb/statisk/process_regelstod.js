"use strict";
/* Publik informationsmodul. Ändrar aldrig scheman, avtalsregler eller data.
   All controllerberäkning sker lokalt i vyn och sparas inte. */
const PROCESS_REGELSTOD = (() => {
  const DATA = REGELSTOD_DATA;
  const e = value => esc(String(value == null ? "" : value));
  const format = v => v == null ? "Okänt" : new Intl.NumberFormat("sv-SE", {maximumFractionDigits:2}).format(v);
  const statusar = {
    "avtalskontroll": "Kontrollera aktuell avtalslydelse",
    "historisk-lokal": "Historisk rutin – inte verifierad 2026",
    "processforslag": "Föreslagen process – inte beslutad"
  };
  const stegVyer = {behov:"behov", dimensionering:"bemanningsbalans", grundschema:"schema",
                     aktivering:"schema", daglig:"daglig-planering", utfall:"nyckeltal"};
  function timtal(value, namn) {
    if (value == null || String(value).trim() === "") return null;
    const v = Number(String(value).replace(/\s+/g, "").replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 1000000000)
      throw new Error(namn + " måste vara ett giltigt antal timmar (0 eller mer).");
    return v;
  }
  function controllerBas(f) {
    const behov = timtal(f.behov,"Behov");
    const kapacitet = timtal(f.kapacitet,"Kapacitet");
    const budget = timtal(f.budget,"Budget");
    const utfall = timtal(f.utfall,"Utfall");
    return {behov,kapacitet,budget,utfall,
      gapBehovKapacitet: behov === null || kapacitet === null ? null : behov-kapacitet,
      gapBehovBudget: behov === null || budget === null ? null : behov-budget,
      gapKapacitetUtfall: kapacitet === null || utfall === null ? null : utfall-kapacitet};
  }
  function sokRegler(query="", status="alla") {
    const q = String(query).toLocaleLowerCase("sv-SE").trim();
    return DATA.regler.filter(r => (status === "alla" || r.status === status) &&
      (!q || [r.id,r.rubrik,r.omrade,r.sammanfattning,r.referens].some(v=>v.toLocaleLowerCase("sv-SE").includes(q))));
  }
  function stegkort(x) {
    const vyId = stegVyer[x.id];
    const lank = vyId && st.enhet ? '<p><a href="#/e/'+st.enhet.id+'/'+vyId+'">Öppna relevant vy i Dodex</a></p>' : '';
    return '<details class="kort process-steg"><summary><strong>'+e(x.namn)+
      '</strong> <span class="dampad liten">'+e(x.period)+'</span></summary>'+
      '<p><b>Controllerfråga:</b> '+e(x.fraga)+'</p>'+
      '<p><b>Underlag:</b> '+e(x.underlag)+'</p>'+
      '<p><b>Resultat:</b> '+e(x.resultat)+'</p>'+
      '<p><b>Roller:</b> '+e(x.agare)+'</p>'+
      '<p><b>ARIBUA:</b> '+e(x.aribua.join(', '))+'</p>'+
      x.lankar.map(l=>'<p><a target="_blank" rel="noopener noreferrer" href="'+e(l.url)+'">'+e(l.namn)+'</a></p>').join('')+
      lank+'</details>';
  }
  function regelkort(r) {
    const l = r.url ? '<a href="'+e(r.url)+'" target="_blank" rel="noopener noreferrer">Öppna officiell källa</a>' :
      '<span class="dampad liten">Lokalt källdokument publiceras inte i denna modul.</span>';
    return '<article class="kort process-regel"><div class="process-topp"><h3>'+e(r.rubrik)+
      '</h3><span class="process-status">'+e(statusar[r.status]||r.status)+'</span></div>'+
      '<p>'+e(r.sammanfattning)+'</p><p class="dampad liten"><b>Område:</b> '+e(r.omrade)+
      ' · <b>Referens:</b> '+e(r.referens)+'</p>'+l+'</article>';
  }
  function ritaRegler() {
    const el = document.getElementById('process-regler');
    if (!el) return;
    const sok = document.getElementById('process-sok').value;
    const status = document.getElementById('process-status').value;
    const poster = sokRegler(sok,status);
    el.innerHTML = poster.length ? poster.map(regelkort).join('') :
      '<p class="kort dampad">Inga träffar. Prova ett annat sökord.</p>';
    document.getElementById('process-antal').textContent = poster.length+' av '+DATA.regler.length+' poster';
  }
  function berakningsResultat(a, kompetens) {
    const rader = [
      ['Verksamhetsbehov',a.behov], ['Tillgänglig kapacitet',a.kapacitet],
      ['Finansierad tid',a.budget], ['Rapporterat arbete',a.utfall],
      ['Behov minus kapacitet',a.gapBehovKapacitet],
      ['Behov minus finansierad tid',a.gapBehovBudget],
      ['Utfall minus kapacitet',a.gapKapacitetUtfall]
    ];
    const html = rader.map(x=>'<tr><td>'+e(x[0])+'</td><td>'+
      (x[1]===null?'Saknar uppgift':e(format(x[1]))+' h')+'</td></tr>').join('');
    const r = [];
    if (a.gapBehovKapacitet !== null) {
      if (a.gapBehovKapacitet > 0)
        r.push('Behovet överstiger tillgängliga timmar. Pröva dimensionering, frånvaro och kompetens innan schemaändring.');
      else r.push('Timmarna räcker på totalnivå, men kompetens och bemanning vid rätt klockslag är inte verifierade.');
    }
    if (a.gapBehovBudget !== null && a.gapBehovBudget > 0)
      r.push('Behovet överstiger finansierade timmar. Synliggör budgetgapet och lyft det till ansvarig chef.');
    if (kompetens === 'brist') r.push('Angiven kompetensbrist behöver hanteras, även om antalet timmar räcker.');
    if (kompetens === 'okant') r.push('Kompetenstäckning är inte bedömd. Uppföljningen är därför ofullständig.');
    if (a.utfall !== null) r.push('Faktiska timmar beskriver inte ensamma kvalitet, ersättning eller orsak till avvikelse.');
    if (!r.length) r.push('Ange två jämförbara timvärden för att bedöma skillnader. Saknade data visas som okända.');
    return '<div class="kort"><h3>Preliminär controlleranalys</h3>'+
      '<p class="dampad liten">Endast lokalt räkneexempel. Inga uppgifter lagras eller skickas.</p>'+
      '<div class="rull"><table><thead><tr><th>Underlag</th><th>Timmar</th></tr></thead><tbody>'+
      html+'</tbody></table></div><h4>Frågor att gå vidare med</h4><ul>'+
      r.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>'+
      '<p><b>Nästa steg:</b> Kontrollera fördelning över dygnet, kompetenskrav, arbetsmiljö,'+
      ' målkonflikter, ansvar och uppföljningsmått med koppling till ARIBUA.</p>'+
      '<p class="dampad liten">Inte en fullständig bemanningsdimensionering, avtalskontroll eller ett beslut om personal.</p></div>';
  }
  function sidinnehall() {
    return '<section class="kort"><h1>Bemanningsprocess & regelstöd</h1>'+
      '<p class="dampad">Behov, kompetens, ekonomi, schema, daglig bemanning och uppföljning – ett sammanhängande controllerstöd kopplat till ARIBUA.</p>'+
      '<div class="banner varn"><div><strong>Testversion – inte fastställd kommunal handbok</strong>'+
      '<span class="liten">'+e(DATA.anmarkning)+'</span></div></div>'+
      '<p class="dampad liten">Version: '+e(DATA.utgava)+'. Endast allmänna processbeskrivningar och offentliga hänvisningar.</p></section>'+
      '<section class="kort"><h2>Åtta steg i bemanningsprocessen</h2>'+
      '<p>Öppna ett steg och se vilken controllerfråga som hör till det. Behov, kapacitet, budget, plan och utfall hålls isär.</p></section>'+
      '<div class="process-steglista">'+DATA.steg.map(stegkort).join('')+'</div>'+
      '<section class="kort"><h2>Sökbart regelbibliotek</h2>'+
      '<p>Visade regler är vägledning och källhänvisningar, <b>inte</b> aktiverade systemregler.</p>'+
      '<div class="process-filter"><label>Sök <input id="process-sok" type="search" placeholder="Dygnsvila, ÖS, schema, jour …"></label>'+
      '<label>Filtrera på status <select id="process-status"><option value="alla">Alla</option>'+
      '<option value="avtalskontroll">Avtal – kräver kontroll</option>'+
      '<option value="historisk-lokal">Historisk lokal rutin</option>'+
      '<option value="processforslag">Processförslag</option></select></label></div>'+
      '<p class="dampad liten" id="process-antal"></p></section>'+
      '<div id="process-regler" class="process-regellista"></div>'+
      '<section class="kort"><h2>Snabbcontroller – timanalys</h2>'+
      '<p>Ange enbart aggregerade, fiktiva timmar för samma period. Denna kalkyl görs i webbläsaren och sparas inte.</p>'+
      '<form class="process-form" id="process-controller">'+
      '<label>Behovstimmar <input type="text" inputmode="decimal" name="behov" placeholder="Exempel: 1200"></label>'+
      '<label>Tillgängliga timmar <input type="text" inputmode="decimal" name="kapacitet" placeholder="Exempel: 1100"></label>'+
      '<label>Budgeterade timmar <input type="text" inputmode="decimal" name="budget" placeholder="Exempel: 1080"></label>'+
      '<label>Faktiskt arbetade timmar <input type="text" inputmode="decimal" name="utfall" placeholder="Valfritt"></label>'+
      '<label>Kompetenstäckning <select name="kompetens">'+
      '<option value="okant">Ej bedömd</option><option value="ok">Bedöms tillräcklig</option>'+
      '<option value="brist">Kompetensbrist finns</option></select></label>'+
      '<button class="knapp" type="submit">Analysera skillnader</button></form>'+
      '<p role="alert" id="process-fel"></p><div id="process-resultat" aria-live="polite"></div></section>'+
      '<section class="kort"><h2>Bemanningscontroller – arbetssättet</h2>'+
      '<p>Ta reda på <b>var i processen en brist behöver åtgärdas</b>. Dokumentera källor, gap, alternativ, målkonflikter,'+
      ' vem som fattar beslut och när effekten ska följas upp.</p>'+
      '<p class="dampad liten">Den återanvändbara Claude Code-färdigheten finns i'+
      ' <code>.claude/skills/bemanningscontroller/SKILL.md</code>. Ingen AI-modell beslutar om undantag eller bokningar.</p></section>';
  }
  function visa() {
    st.vy = 'process';
    ritaMeny();
    sokvag([['Enheter','#/'],['Bemanningsprocess & regelstöd']]);
    vy().innerHTML = sidinnehall();
    document.getElementById('process-sok').addEventListener('input',ritaRegler);
    document.getElementById('process-status').addEventListener('change',ritaRegler);
    ritaRegler();
    document.getElementById('process-controller').addEventListener('submit',ev=>{
      ev.preventDefault();
      const fd = new FormData(ev.currentTarget);
      const felt = document.getElementById('process-fel');
      const container = document.getElementById('process-resultat');
      try {
        const resultat = controllerBas(Object.fromEntries(['behov','kapacitet','budget','utfall'].map(x=>[x,fd.get(x)])));
        container.innerHTML = berakningsResultat(resultat,fd.get('kompetens'));
        felt.textContent = '';
      } catch(err) {container.innerHTML = ''; felt.textContent = err.message;}
    });
  }
  return {visa,controllerBas,sokRegler};
})();
async function visaProcessRegelstod() { PROCESS_REGELSTOD.visa(); }
if (typeof module !== "undefined" && module.exports) module.exports = PROCESS_REGELSTOD;
