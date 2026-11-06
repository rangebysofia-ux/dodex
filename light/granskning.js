// Fristående granskning av ett färdigt schema, översatt från schemamotor/validate.py.
// Delar ingen kod med light/motor.js, så att den kan fånga fel i motorn.
"use strict";

const GRANSKNING = (() => {
  const DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
  const DYGN = 1440;
  const STANDARD = {
    dygnsvila_minuter: 660, veckovila_minuter: 2160, dygnsbryt: "auto", veckobryt: "mån 00:00",
    rast_grans_minuter: 300, rast_minuter: 30, pass_per_vecka: 4.75, morgon_start: "07:00",
    kvall_slut: "22:00", kant_fran: "12:00", kant_till: "18:00", block_min: 2, block_max: 5,
    block_rekommenderat: 4, helg_start: "fre 22:00", helg_slut: "mån 06:00", hel_helg: true,
    helgfrekvens: "2/4", ingen_fredagskvall_fore_ledig_helg: true, tolerans_minuter: 60, min_passlangd_minuter: 300, spridning_kvallar: "mjuk", spridning_tolerans: 1,
  };
  const NIVA = { DYGNSVILA: "avtal", VECKOVILA: "avtal", RAST: "lag", ANTAL_PASS: "kontrakt", TID: "kontrakt",
    HELG: "lokal regel", BLOCK_MIN: "lokal regel", BLOCK_MAX: "lokal regel", PASSFONSTER: "princip",
    BLOCK_REKOMMENDERAT: "princip", BEHOV: "verksamhet", SPRIDNING: "princip" };

  const tid = s => { const [h, m] = s.trim().split(":").map(Number); return h * 60 + m; };
  const klocka = m => { m = ((m % DYGN) + DYGN) % DYGN; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const veckotid = s => { const [d, k] = s.split(" "); return DAGNAMN.indexOf(d) * DYGN + tid(k); };
  const dagText = d => `vecka ${Math.floor(d / 7) + 1} ${DAGNAMN[d % 7]}`;
  const h = m => (m / 60).toFixed(1).replace(".", ",");

  function langstaLucka(iv, a, b) {
    const k = iv.filter(([s, e]) => e > a && s < b).map(([s, e]) => [Math.max(s, a), Math.min(e, b)]).sort((x, y) => x[0] - y[0]);
    let langst = 0, pos = a;
    for (const [s, e] of k) { langst = Math.max(langst, s - pos); pos = Math.max(pos, e); }
    return Math.max(langst, b - pos);
  }

  function foreslaDygnsbryt(alla, r) {
    const fran = tid(r.kant_fran), till = tid(r.kant_till), granser = new Map();
    for (const lista of Object.values(alla)) for (const [, s, e, p] of lista) {
      if (p.dygnsdel === "natt") continue;
      for (const g of [s % DYGN, e % DYGN]) if (g >= fran && g <= till) granser.set(g, (granser.get(g) || 0) + 1);
    }
    if (!granser.size) return tid(r.morgon_start) + 480;
    let tot = 0, n = 0; granser.forEach((c, g) => { tot += g * c; n += c; });
    const snitt = tot / n;
    let bast = fran, nyckel = [-1, 0];
    for (let t = fran; t <= till; t += 15) {
      let v = 0; granser.forEach((c, g) => { if (Math.abs(g - t) <= 30) v += c; });
      const k = [v, -Math.abs(t - snitt)];
      if (k[0] > nyckel[0] || (k[0] === nyckel[0] && k[1] > nyckel[1])) { nyckel = k; bast = t; }
    }
    return bast;
  }

  function kontrollera(indata, dok) {
    const r = { ...STANDARD, ...(indata.regler || {}) };
    const W = indata.veckor, N = W * 7, L = N * DYGN, cyk = indata.cykliskt !== false;
    const schema = dok.schema || dok;
    const fel = [], varn = [];
    const brott = (regel, pid, text, hard = true) => (hard ? fel : varn).push({ regel, niva: NIVA[regel] || "", person: pid, text });
    const alla = {};
    for (const [pid, dagar] of Object.entries(schema)) {
      alla[pid] = [];
      dagar.forEach((p, d) => {
        if (!p) return;
        const s = tid(p.start); let e = tid(p.slut); if (e <= s) e += DYGN;
        alla[pid].push([d, d * DYGN + s, d * DYGN + e, p]);
      });
    }
    const dbDag = r.dygnsbryt === "auto" ? foreslaDygnsbryt(alla, r) : tid(r.dygnsbryt);
    const vb = veckotid(r.veckobryt);
    const personer = Object.fromEntries((indata.personal || []).map(p => [p.id, p]));

    for (const [pid, lista] of Object.entries(alla)) {
      let iv = lista.map(([, s, e]) => [s, e]);
      if (cyk) iv = iv.concat(iv.map(([s, e]) => [s - L, e - L]), iv.map(([s, e]) => [s + L, e + L]));
      const pers = personer[pid] || {};
      const natt = JSON.stringify(pers.dygnsdelar) === '["natt"]';
      let db = dbDag;
      if (pers.dygnsbryt) db = tid(pers.dygnsbryt);
      else if (natt && lista.length) {
        const c = new Map(); lista.forEach(([, , e]) => c.set(e % DYGN, (c.get(e % DYGN) || 0) + 1));
        db = [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
      const sort = lista.slice().sort((a, b) => a[1] - b[1]);
      const par = sort.slice(1).map((v, i) => [sort[i], v]);
      if (cyk && sort.length > 1) par.push([sort.at(-1), [sort[0][0] + N, sort[0][1] + L, sort[0][2] + L]]);
      for (const [[d1, , e1], [d2, s2]] of par) {
        if (s2 < e1) brott("DYGNSVILA", pid, `Pass överlappar (${dagText(d1)} och ${dagText(d2 % N)}).`);
        else if (s2 - e1 < r.dygnsvila_minuter) brott("DYGNSVILA", pid, `Bara ${h(s2 - e1)} h vila mellan passet ${dagText(d1)} och passet ${dagText(d2 % N)}.`);
      }
      for (let d = 0; d < (cyk ? N : N - 1); d++) {
        const a = d * DYGN + db;
        if (langstaLucka(iv, a, a + DYGN) < r.dygnsvila_minuter) brott("DYGNSVILA", pid, `Ingen sammanhängande dygnsvila på 11 h i perioden från ${dagText(d)} kl ${klocka(db)}.`);
      }
      for (let w = 0; w < (cyk ? W : W - 1); w++) {
        const a = w * 7 * DYGN + vb, l = langstaLucka(iv, a, a + 7 * DYGN);
        if (l < r.veckovila_minuter) brott("VECKOVILA", pid, `Längsta vila vecka ${w + 1} är ${h(l)} h (minst 36 h).`);
      }
      const arbetstider = [];
      for (const [d, s, e, p] of lista) {
        const paPlats = e - s, rast = p.rast || 0;
        const arb = p.maltidsuppehall ? paPlats : paPlats - rast;
        arbetstider.push(arb);
        if (!p.maltidsuppehall && paPlats - rast > r.rast_grans_minuter) {
          if (rast < r.rast_minuter) brott("RAST", pid, `${dagText(d)} ${p.start}–${p.slut}: över 5 h arbete utan rast.`);
          else if (paPlats - rast > 2 * r.rast_grans_minuter) brott("RAST", pid, `${dagText(d)} ${p.start}–${p.slut}: rasten kan inte placeras så att ingen del blir över 5 h.`);
        }
        if (p.dygnsdel === "morgon" && (s % DYGN !== tid(r.morgon_start) || e % DYGN < tid(r.kant_fran) || e % DYGN > tid(r.kant_till)))
          brott("PASSFONSTER", pid, `${dagText(d)}: morgonpass ${p.start}–${p.slut} följer inte fönstret.`);
        if (p.dygnsdel === "kvall" && (e % DYGN !== tid(r.kvall_slut) || s % DYGN < tid(r.kant_fran) || s % DYGN > tid(r.kant_till)))
          brott("PASSFONSTER", pid, `${dagText(d)}: kvällspass ${p.start}–${p.slut} följer inte fönstret.`);
      }
      const work = Array(N).fill(0); lista.forEach(([d]) => (work[d] = 1));
      for (let d = cyk ? 0 : 1; d < (cyk ? N : N - 1); d++)
        if (work[d] && !work[(d - 1 + N) % N] && !work[(d + 1) % N]) brott("BLOCK_MIN", pid, `Enstaka arbetsdag ${dagText(d)}.`);
      for (const [regel, grans, hard] of [["BLOCK_MAX", r.block_max, true], ["BLOCK_REKOMMENDERAT", r.block_rekommenderat, false]]) {
        for (let d = 0; d < (cyk ? N : N - grans); d++) {
          let alla_ = true; for (let k = 0; k <= grans; k++) if (!work[(d + k) % N]) { alla_ = false; break; }
          if (alla_ && (!work[(d - 1 + N) % N] || (!cyk && d === 0))) {
            let langd = grans + 1; while (langd < N && work[(d + langd) % N]) langd++;
            brott(regel, pid, `${langd} arbetsdagar i följd från ${dagText(d)} (gräns ${grans}).`, hard);
          }
        }
      }
      const hs = veckotid(r.helg_start), he = veckotid(r.helg_slut), helger = [];
      for (let w = 0; w < W; w++) {
        const a = w * 7 * DYGN + hs, b = (w + 1) * 7 * DYGN + he;
        const jobbar = iv.some(([s, e]) => e > a && s < b);
        helger.push(jobbar);
        if (jobbar && r.hel_helg && !(work[w * 7 + 5] && work[w * 7 + 6])) brott("HELG", pid, `Arbetar helgen vecka ${w + 1} men inte både lördag och söndag.`);
        if (!jobbar && r.ingen_fredagskvall_fore_ledig_helg)
          for (const [d, , , p] of lista) if (d === w * 7 + 4 && (p.dygnsdel === "kvall" || p.dygnsdel === "natt")) brott("HELG", pid, `Kvällspass fredag vecka ${w + 1} före ledig helg.`);
      }
      const frek = pers.helgfrekvens || r.helgfrekvens, antal = helger.filter(Boolean).length;
      if (frek === "2/4") {
        for (let w = 0; w < (cyk ? W : W - 1); w++) if (helger[w] === helger[(w + 1) % W]) { brott("HELG", pid, "Helgerna växlar inte varannan: " + helger.map(x => x ? "J" : "L").join("") + "."); break; }
      } else if (frek === "alla" && antal !== W) brott("HELG", pid, `Ska arbeta alla helger, arbetar ${antal} av ${W}.`);
      else if (frek === "ingen" && antal) brott("HELG", pid, `Ska inte arbeta helg, arbetar ${antal}.`);
      else if (frek === "1/4" || frek === "3/4") {
        const [t, n] = frek.split("/").map(Number);
        if (antal !== Math.round(W * t / n)) brott("HELG", pid, `Helgfrekvens ${frek} ger ${W * t / n} helger, arbetar ${antal}.`);
      }
      const heltid = pers.heltid_minuter_per_vecka || indata.heltid_minuter_per_vecka || 2220;
      const malMin = Math.round(heltid * (pers.grad ?? 1) * W);
      let mal = pers.antal_pass;
      if (Array.isArray(mal)) mal = mal.reduce((a, b) => a + b, 0);
      if (mal == null && !natt) {
        mal = Math.round(r.pass_per_vecka * W);
        if (r.min_passlangd_minuter && malMin / mal < r.min_passlangd_minuter) mal = Math.max(1, Math.floor(malMin / r.min_passlangd_minuter));
      }
      const faktiskt = work.reduce((a, b) => a + b, 0);
      if (mal != null && faktiskt !== mal) brott("ANTAL_PASS", pid, `${faktiskt} pass, ska vara ${mal}.`);
      const delar = pers.dygnsdelar || ["morgon", "kvall"];
      if (r.spridning_kvallar !== "av" && delar.includes("morgon") && delar.includes("kvall") && W >= 2) {
        const ensidiga = [];
        for (let w = 0; w < W; w++) {
          const typer = lista.filter(([d]) => d >= w * 7 && d < w * 7 + 7).map(([, , , p]) => p.dygnsdel);
          if (typer.length && (!typer.includes("kvall") || !typer.includes("morgon"))) ensidiga.push(`v${w + 1} (${typer.includes("morgon") ? "bara morgon" : "bara kväll"})`);
        }
        if (ensidiga.length) brott("SPRIDNING", pid, `Veckor utan blandning av morgon och kväll: ${ensidiga.join(", ")}.`, false);
      }
      let tol = pers.tolerans_minuter;
      if (tol == null) { tol = r.tolerans_minuter; if (natt && arbetstider.length) tol = Math.max(tol, Math.ceil(Math.min(...arbetstider) / 2)); }
      const arb = arbetstider.reduce((a, b) => a + b, 0);
      if (Math.abs(arb - malMin) > tol) brott("TID", pid, `Arbetstid ${h(arb)} h, kontrakterat ${h(malMin)} h (tolerans ${tol} min).`);
    }

    const behov = Array.from({ length: 7 }, () => ({}));
    for (const [k, v] of Object.entries(indata.behov || {})) {
      const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGNAMN.indexOf(k)];
      idx.forEach(i => (behov[i] = v));
    }
    let vakanser = 0;
    for (let d = 0; d < N; d++) for (const [del, antal] of Object.entries(behov[d % 7])) {
      let n = 0; for (const l of Object.values(alla)) for (const [dd, , , p] of l) if (dd === d && p.dygnsdel === del) n++;
      if (n < antal) { vakanser += antal - n; brott("BEHOV", null, `${dagText(d)}: ${antal - n} vakant ${del === "kvall" ? "kvälls" : del}pass.`, false); }
    }
    return { giltigt: !fel.length, dygnsbryt: klocka(dbDag), veckobryt: r.veckobryt, brott: fel, varningar: varn, vakanser };
  }
  return { kontrollera };
})();

if (typeof module !== "undefined") module.exports = GRANSKNING;
