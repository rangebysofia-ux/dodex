// Schemamotor light: lägger cykliska grundscheman i webbläsaren utan server.
// Heuristik (simulerad glödgning) i stället för OR-Tools. Hårda regler (avtal, lag, kontrakt och
// lokala regler) väger mycket tyngre än vakanser; vakanser tyngre än block, rättvisa och önskemål.
// Fungerar i en Web Worker (postMessage) och i Node (module.exports) för tester.
"use strict";

const MOTOR = (() => {
  const DYGN = 1440;
  const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
  const STD = {
    dygnsvila_minuter: 660, veckovila_minuter: 2160, rast_grans_minuter: 300, rast_minuter: 30,
    pass_per_vecka: 4.75, morgon_start: "07:00", kvall_slut: "22:00", kant_fran: "12:00", kant_till: "18:00",
    block_min: 2, block_max: 5, block_rekommenderat: 4, natt_max_i_rad: 3, natt_vila_mellan_block_minuter: 2880, helgfrekvens: "2/4", hel_helg: true,
    ingen_fredagskvall_fore_ledig_helg: true, tolerans_minuter: 60, min_passlangd_minuter: 300, spridning_kvallar: "mjuk", spridning_tolerans: 1, jamn_bemanning: "mjuk",
  };
  const OFF = 0, M = 1, K = 2, NT = 3;
  const DELNAMN = { 1: "morgon", 2: "kvall", 3: "natt" };
  const HW = 1e8;      // hård regel
  const WV = 1e5;      // vakant pass (väger alltid tyngre än block, rättvisa, spridning och önskemål)
  const WB = 60;       // arbetsdagar i följd över rekommenderat
  const WF = 8;        // rättvisa (kvadratisk avvikelse i antal kvällar)
  const WO = 4;        // brutet önskemål per vikt
  const WJ = 40;       // jämn bemanning: över- och underbemanning lika mellan dag och kväll
  const WNV = 2e3;     // vila mellan nattblock under gränsen (mjuk lokal regel, efter vakanser och aktiviteter)
  const WA = 5e4;      // saknad deltagare i en aktivitet (efter vakanser, före block och rättvisa)

  const tid = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
  const klocka = m => { m = ((m % DYGN) + DYGN) % DYGN; return String(m / 60 | 0).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  const onsite = (net, r) => net > r.rast_grans_minuter ? net + r.rast_minuter : net;
  // arbetstid för en given tid på plats; null i glappet där rast krävs men passet då blir för kort
  const netto = (o, r) => o <= r.rast_grans_minuter ? o : (o - r.rast_minuter > r.rast_grans_minuter ? o - r.rast_minuter : null);

  function slump(seed) {  // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ------------------------------------------------------------------ förberedelse
  function forbered(ind) {
    const fel = [];
    const r = { ...STD, ...(ind.regler || {}) };
    const W = ind.veckor | 0, N = W * 7;
    if (!(W >= 1 && W <= 16)) fel.push("Perioden måste vara 1–16 veckor.");
    const cyk = ind.cykliskt !== false;
    const heltid = ind.heltid_minuter_per_vecka || 2220;
    const np = (ind.nattpass && ind.nattpass[0]) || { start: "21:45", slut: "06:45", maltidsuppehall: true };
    const ns = tid(np.start); let ne = tid(np.slut); if (ne <= ns) ne += DYGN;
    const nRast = np.maltidsuppehall === false && ne - ns > r.rast_grans_minuter ? r.rast_minuter : 0;
    const nnet = ne - ns - nRast;
    const ms = tid(r.morgon_start), ks = tid(r.kvall_slut), kf = tid(r.kant_fran), kt = tid(r.kant_till);

    const behov = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
    for (const [nyckel, v] of Object.entries(ind.behov || {})) {
      const idx = nyckel === "vardag" ? [0, 1, 2, 3, 4] : nyckel === "helg" ? [5, 6] : nyckel === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGAR.indexOf(nyckel)];
      if (idx[0] < 0) { fel.push(`Okänd dag i behovet: ${nyckel}.`); continue; }
      for (const i of idx) behov[i] = [0, v.morgon || 0, v.kvall || 0, v.natt || 0];
    }

    // AB 25 § 13 mom. 8 och verksamhetens beslut: 11 timmars dygnsvila är hård och kan inte låsas upp
    if (r.dygnsvila_minuter < 660) fel.push("Dygnsvilan är minst 11 timmar och kan inte låsas upp i schemaplaneringen (AB 25 § 13 mom. 8; verksamhetens beslut).");
    const pers = [], ids = new Set();
    let vaxel = 0;  // för perioder där antal pass inte går jämnt ut
    for (const p of ind.personal || []) {
      if (!p.id) { fel.push("En person saknar id."); continue; }
      if (ids.has(p.id)) fel.push(`Samma id finns två gånger: ${p.id}.`);
      ids.add(p.id);
      const delar = p.dygnsdelar || ["morgon", "kvall"];
      const natt = delar.length === 1 && delar[0] === "natt";
      if (!(p.grad > 0 && p.grad <= 1)) { fel.push(`${p.id}: sysselsättningsgraden måste vara mellan 1 och 100 %.`); continue; }
      // nattpersonal: heltid 34 h 20 min om inget annat anges (AB 25 § 13 mom. 2; verksamhetens beslut)
      const malMin = Math.round((p.heltid_minuter_per_vecka || (natt ? ind.heltid_natt_minuter_per_vecka || 2060 : heltid)) * p.grad * W);
      let P = Array.isArray(p.antal_pass) ? p.antal_pass.reduce((a, b) => a + b, 0) : p.antal_pass;
      if (P == null) {
        if (natt) P = Math.round(malMin / nnet);
        else {
          // går det inte jämnt ut (28,5 på 6 veckor) får dag/kväll växelvis nedåt och uppåt: 28, 29, 28 …
          const x = r.pass_per_vecka * W;
          P = Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : (vaxel % 2 === 0 ? Math.floor(x) : Math.ceil(x));
          vaxel++;
          if (r.min_passlangd_minuter && malMin / P < r.min_passlangd_minuter) P = Math.max(1, Math.floor(malMin / r.min_passlangd_minuter));
        }
      }
      if (!(P > 0)) { fel.push(`${p.id}: antal pass måste vara minst 1.`); continue; }
      const typer = natt ? [NT] : delar.map(d => d === "morgon" ? M : K);
      const L = malMin / P;
      let bas = natt ? nnet : Math.floor(L / 15) * 15, k = 0;
      if (!natt) {
        k = Math.max(0, Math.min(P, Math.round((malMin - P * bas) / 15)));
        for (const net of k ? [bas, bas + 15] : [bas]) {
          const o = onsite(net, r);
          const okM = ms + o >= kf && ms + o <= kt, okK = ks - o >= kf && ks - o <= kt;
          if ((typer.includes(M) && !okM) || (typer.includes(K) && !okK)) {
            fel.push(`${p.id}: passen blir ${Math.floor(net / 60)} h ${net % 60} min arbetstid, vilket inte ryms i fönstret ${r.kant_fran}–${r.kant_till}. Ändra antal pass eller sysselsättningsgrad.`);
            break;
          }
        }
      }
      const frek = p.helgfrekvens || r.helgfrekvens;
      const tol = p.tolerans_minuter ?? (natt ? Math.max(r.tolerans_minuter, Math.ceil(nnet / 2)) : r.tolerans_minuter);
      pers.push({ id: p.id, natt, typer, P, malMin, L, bas, k, tol, frek, grupp: p.helggrupp === "A" ? 0 : p.helggrupp === "B" ? 1 : null, grad: p.grad });
    }
    if (!pers.length) fel.push("Lägg till minst en person.");

    for (const p of pers) {
      if (p.frek === "2/4" && cyk && W % 2) fel.push(`Varannan helg kräver ett jämnt antal veckor (${p.id}).`);
      if ((p.frek === "1/4" || p.frek === "3/4") && W % 4) fel.push(`${p.id}: helgfrekvens ${p.frek} kräver 4, 8, 12 eller 16 veckor.`);
    }

    // helggrupper: lika många i varje grupp per klass (dag/natt); fasta grupper räknas in
    for (const natt of [false, true]) {
      for (const [frek, n] of [["2/4", 2], ["1/4", 4], ["3/4", 4]]) {
        const lista = pers.filter(p => p.natt === natt && p.frek === frek);
        const antal = Array(n).fill(0);
        lista.filter(p => p.grupp != null).forEach(p => { p.grupp = p.grupp % n; antal[p.grupp]++; });
        lista.filter(p => p.grupp == null).sort((a, b) => b.grad - a.grad).forEach(p => {
          const g = antal.indexOf(Math.min(...antal)); p.grupp = g; antal[g]++;
        });
      }
    }
    for (const p of pers) {
      p.helg = Array.from({ length: W }, (_, w) =>
        p.frek === "alla" ? true : p.frek === "ingen" ? false : p.frek === "2/4" ? w % 2 === p.grupp :
        p.frek === "1/4" ? w % 4 === p.grupp : p.frek === "3/4" ? w % 4 !== p.grupp : w % 2 === 0);
      const helgdagar = 2 * p.helg.filter(Boolean).length;
      const vardagar = Array.from({ length: N }, (_, d) => d).filter(d => d % 7 < 5 && tillatna(p, d, r, W).length).length;
      if (p.P < helgdagar) fel.push(`${p.id}: ${p.P} pass räcker inte till ${helgdagar} helgdagar.`);
      else if (p.P - helgdagar > vardagar) fel.push(`${p.id}: ${p.P} pass ryms inte på de vardagar som är tillåtna.`);
    }

    // önskemål
    const onsk = [];
    (ind.onskemal || []).forEach((o, i) => {
      const pi = pers.findIndex(p => p.id === o.person);
      if (pi < 0) { fel.push(`Önskemål ${o.id || i + 1} gäller ${o.person}, som inte finns.`); return; }
      const dagar = [];
      if (Array.isArray(o.dagindex)) o.dagindex.forEach(d => dagar.push(((d % N) + N) % N));
      else {
        const dd = o.dagar && o.dagar.length ? o.dagar : DAGAR;
        const vv = o.veckor || "alla";
        for (let w = 0; w < W; w++) {
          const nr = ind.start_iso_vecka ? ind.start_iso_vecka + w : w + 1;
          if (vv === "alla" || (vv === "jämna" && nr % 2 === 0) || (vv === "udda" && nr % 2 === 1) || (Array.isArray(vv) && vv.includes(w + 1)))
            dd.forEach(x => dagar.push(w * 7 + DAGAR.indexOf(x)));
        }
      }
      onsk.push({ ...o, id: o.id || `O${i + 1}`, pi, dagar, vikt: o.vikt || 1, krav: !!o.krav });
    });

    // aktiviteter (verksamhetens beslut): den som deltar arbetar hela aktivitetstiden
    const akt = [];
    const aIds = new Set();
    (ind.aktiviteter || []).forEach((a, i) => {
      const id = a.id || `A${i + 1}`;
      if (aIds.has(id)) fel.push(`Aktiviteten ${id} finns flera gånger.`);
      aIds.add(id);
      const a0 = tid(a.start), a1 = tid(a.slut);
      if (!(a1 > a0)) { fel.push(`Aktiviteten ${id} måste sluta efter att den börjar samma dag.`); return; }
      const okanda = (a.deltagare || []).filter(q => !ids.has(q));
      if (okanda.length) { fel.push(`Aktiviteten ${id} har deltagare som inte finns i personalen: ${okanda.join(", ")}.`); return; }
      const dagar = new Set();
      if (Array.isArray(a.dagindex)) a.dagindex.forEach(d => dagar.add(((d % N) + N) % N));
      else {
        const dd = a.dagar && a.dagar.length ? a.dagar : DAGAR, vv = a.veckor || "alla";
        for (let w = 0; w < W; w++) {
          const nr = ind.start_iso_vecka ? ind.start_iso_vecka + w : w + 1;
          if (vv === "alla" || (vv === "jämna" && nr % 2 === 0) || (vv === "udda" && nr % 2 === 1) || (Array.isArray(vv) && vv.includes(w + 1)))
            dd.forEach(x => dagar.add(w * 7 + DAGAR.indexOf(x)));
        }
      }
      const ryms = t => t === M ? ms <= a0 && a1 <= kt : t === K ? kf <= a0 && a1 <= ks
        : (ns <= a0 && a1 <= ne) || (ns <= a0 + DYGN && a1 + DYGN <= ne);
      const grupp = pers.map((p, pi) => pi).filter(pi => a.deltagare && a.deltagare.length ? a.deltagare.includes(pers[pi].id) : pers[pi].typer.some(ryms));
      const G = grupp.length, T = dagar.size;
      const onskat = a.antal ? a.antal : a.andel ? Math.ceil(a.andel * G - 1e-9) : a.varje_person && T ? Math.ceil(G * a.varje_person / T) : G;
      const antal = Math.min(onskat, G);
      const snitt = G ? antal * T / G : 0;
      akt.push({ id, namn: a.namn || id, start: a.start, slut: a.slut, a0, a1, dagar: [...dagar].sort((x, y) => x - y), grupp, antal, onskat,
        krav: !!a.krav, minst: a.minst_pa_golvet || 0, golv: a.fran_golvet !== false, lo: a.varje_person || Math.floor(snitt + 1e-9), hi: a.varje_person || Math.ceil(snitt - 1e-9) });
    });

    // dygnsbryt för sökningen: där flest dag- och kvällspass byts
    const raknare = {};
    for (const p of pers) if (!p.natt) {
      const o = onsite(p.bas, r);
      if (p.typer.includes(M)) raknare[ms + o] = (raknare[ms + o] || 0) + p.P;
      if (p.typer.includes(K)) raknare[ks - o] = (raknare[ks - o] || 0) + p.P;
    }
    let db = ms + 8 * 60, bast = -1;
    for (let t = kf; t <= kt; t += 15) {
      const v = Object.entries(raknare).reduce((s, [g, n]) => s + (Math.abs(g - t) <= 30 ? n : 0), 0);
      if (v > bast) { bast = v; db = t; }
    }
    return { fel, r, W, N, cyk, behov, pers, onsk, akt, ms, ks, ns, ne, nnet, nRast, db, nattDb: ne % DYGN, enhet: ind.enhet || "" };
  }

  function tillatna(p, d, r, W) {
    const w = Math.floor(d / 7), wd = d % 7;
    if (p.natt) {
      if (wd >= 5) return p.helg[w] ? [NT] : [];
      if (wd === 4) return p.helg[w] ? [NT] : [];   // fredagsnatt går in i helgen
      if (wd === 0) return [NT];
      return [NT];
    }
    if (wd >= 5) return p.helg[w] ? p.typer.slice() : [];
    if (wd === 4 && !p.helg[w] && r.ingen_fredagskvall_fore_ledig_helg) return p.typer.filter(t => t !== K);
    return p.typer.slice();
  }

  // ------------------------------------------------------------------ sökning
  function los(ind, opt = {}) {
    const pr = forbered(ind);
    if (pr.fel.length) return { status: "INDATAFEL", fel: pr.fel };
    const { r, W, N, cyk, behov, pers, onsk } = pr;
    const P = pers.length;
    const rnd = slump(opt.seed ?? 12345);
    const tidsgrans = opt.sekunder ?? 8;
    const rapport = opt.rapport || (() => {});
    const per = pers.map((p, pi) => ({ onsk: onsk.filter(o => o.pi === pi), tillat: Array.from({ length: N }, (_, d) => tillatna(p, d, r, W)) }));

    // passtider per person och typ (utan förlängning)
    const tider = pers.map(p => {
      const o = onsite(p.bas, r);
      return { 1: [pr.ms, pr.ms + o], 2: [pr.ks - o, pr.ks], 3: [pr.ns, pr.ne] };
    });

    // andel kvällar för rättvisa
    let mB = 0, kB = 0;
    for (let d = 0; d < N; d++) { mB += behov[d % 7][M]; kB += behov[d % 7][K]; }
    const kAndel = mB + kB ? kB / (mB + kB) : 0.5;

    function personKost(pi, x, ut) {
      const p = pers[pi], t = tider[pi];
      let hard = 0, block = 0, onskStraff = 0;
      const not = (regel, niva, text) => { if (ut) ut.push({ regel, niva, person: p.id, text }); };
      const dt = d => `vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}`;
      // vila mellan pass: kväll följd av morgon
      for (let d = 0; d < N; d++) if (x[d] === K && (cyk || d < N - 1) && x[(d + 1) % N] === M) { hard++; not("DYGNSVILA", "avtal", `Kväll ${dt(d)} följs av morgon, för kort vila.`); }
      // block
      let start = -1;
      for (let d = 0; d < N; d++) if (!x[d]) { start = d; break; }
      if (start < 0) hard += 10;
      else {
        let len = 0;
        for (let i = 1; i <= N; i++) {
          const d = (start + i) % N;
          if (x[d]) len++;
          else if (len) {
            const kant = !cyk && (d - len <= 0 || d === N);
            if (len < r.block_min && !kant) { hard++; not("BLOCK_MIN", "lokal regel", `Enstaka arbetsdag ${dt((d - 1 + N) % N)}.`); }
            if (len > r.block_max) { hard += len - r.block_max; not("BLOCK_MAX", "lokal regel", `${len} arbetsdagar i följd fram till ${dt((d - 1 + N) % N)}.`); }
            // nattpersonal: högst natt_max_i_rad nätter i rad (lokal regel)
            if (p.natt && r.natt_max_i_rad && len > r.natt_max_i_rad) { hard += len - r.natt_max_i_rad; not("NATT_I_RAD", "lokal regel", `${len} nätter i rad fram till ${dt((d - 1 + N) % N)}.`); }
            if (len > r.block_rekommenderat) block++;
            len = 0;
          }
        }
      }
      // nattpersonal: minst natt_vila_mellan_block_minuter mellan två nattblock (lokal regel, mjuk)
      let nv = 0;
      if (p.natt && r.natt_vila_mellan_block_minuter) {
        const gap = k => k * DYGN + t[NT][0] - t[NT][1];
        for (let d = 0; d < N; d++) {
          if (!x[d] || (!cyk && d + 1 >= N) || x[(d + 1) % N]) continue;
          for (let k = 2; k < 8 && gap(k) < r.natt_vila_mellan_block_minuter; k++) {
            if (!cyk && d + k >= N) break;
            if (x[(d + k) % N]) { nv++; break; }
          }
        }
      }
      // veckovila och dygnsvila
      const iv = d => {
        const dd = ((d % N) + N) % N;
        if (!cyk && dd !== d) return null;
        const typ = x[dd]; if (!typ) return null;
        return [d * DYGN + t[typ][0], d * DYGN + t[typ][1]];
      };
      const lucka = (a, b, d0, d1) => {
        let pos = a, best = 0;
        for (let d = d0; d <= d1; d++) {
          const v = iv(d); if (!v || v[1] <= a || v[0] >= b) continue;
          best = Math.max(best, Math.max(v[0], a) - pos); pos = Math.max(pos, Math.min(v[1], b));
        }
        return Math.max(best, b - pos);
      };
      for (let w = 0; w < W; w++) {
        const a = w * 7 * DYGN;
        if (lucka(a, a + 7 * DYGN, w * 7 - 1, w * 7 + 7) < r.veckovila_minuter) { hard++; not("VECKOVILA", "avtal", `Mindre än 36 timmars veckovila vecka ${w + 1}.`); }
      }
      const db = p.natt ? pr.nattDb : pr.db;
      for (let d = 0; d < (cyk ? N : N - 1); d++) {
        const a = d * DYGN + db;
        if (lucka(a, a + DYGN, d - 1, d + 2) < r.dygnsvila_minuter) { hard++; not("DYGNSVILA", "avtal", `Mindre än ${r.dygnsvila_minuter / 60} timmars dygnsvila från ${dt(d)}.`); }
      }
      // önskemål
      for (const o of per[pi].onsk) {
        for (const d of o.dagar) {
          const typ = x[d];
          let bryt = false;
          if (o.typ === "ledig") bryt = !!typ;
          else if (o.typ === "arbetar") bryt = !typ;
          else if (typ && o.typ === "tidigast_start") bryt = t[typ][0] < tid(o.varde);
          else if (typ && o.typ === "senast_slut") bryt = t[typ][1] > tid(o.varde);
          else if (typ && o.typ === "endast_dygnsdel") bryt = ![].concat(o.varde).includes(DELNAMN[typ]);
          if (bryt) { if (o.krav) { hard++; not("KRAV", "önskemål som krav", `Krav ${o.id} (${o.typ.replace("_", " ")}) bryts ${dt(d)}.`); } else onskStraff += o.vikt; }
        }
      }
      // rättvisa
      let f = 0;
      if (p.typer.length > 1) {
        let kv = 0; for (let d = 0; d < N; d++) if (x[d] === K) kv++;
        f = (kv - p.P * kAndel) ** 2;
      }
      // spridning: veckor med bara morgnar eller bara kvällar
      let spr = 0;
      if (p.typer.length > 1 && r.spridning_kvallar !== "av" && W >= 2) {
        for (let w = 0; w < W; w++) {
          let km = 0, mm = 0;
          for (let d = w * 7; d < w * 7 + 7; d++) { if (x[d] === K) km++; else if (x[d] === M) mm++; }
          if (km + mm) { if (!km) spr++; if (!mm) spr++; if (Number(r.spridning_tolerans) < 1) spr += Math.max(0, Math.abs(km - mm) - 1); }
        }
      }
      const ws = r.spridning_kvallar === "stark" ? 400 : 25;
      return { hard, block, onsk: onskStraff, f, spr, nv, summa: hard * HW + block * WB + onskStraff * WO + f * WF + spr * ws + nv * WNV };
    }

    function bygg() {
      const X = pers.map((p, pi) => {
        const x = new Array(N).fill(OFF);
        let kvar = p.P;
        for (let w = 0; w < W; w++) if (p.helg[w]) for (const d of [w * 7 + 5, w * 7 + 6]) {
          const a = per[pi].tillat[d]; x[d] = a[Math.floor(rnd() * a.length)]; kvar--;
        }
        const lediga = [];
        for (let d = 0; d < N; d++) if (d % 7 < 5 && per[pi].tillat[d].length) lediga.push(d);
        for (let i = lediga.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [lediga[i], lediga[j]] = [lediga[j], lediga[i]]; }
        for (let i = 0; i < Math.max(0, kvar); i++) {
          const d = lediga[i], a = per[pi].tillat[d]; x[d] = a[Math.floor(rnd() * a.length)];
        }
        return x;
      });
      return X;
    }

    // aktiviteter: minuter som passet behöver förlängas för att täcka aktiviteten (Infinity = går inte).
    // Under sökningen räknas bara pass som täcker med högst toleransen i förlängning.
    const aktiv = pr.akt.length > 0;
    function forlangning(pi, X, d, a) {
      const x = X[pi], p = pers[pi], t = tider[pi];
      const typ = x[d];
      if (typ === M && a.a0 >= pr.ms && a.a1 <= tid(r.kant_till)) return Math.max(0, a.a1 - t[M][1]);
      if (typ === K && a.a1 <= pr.ks && a.a0 >= tid(r.kant_fran)) return Math.max(0, t[K][0] - a.a0);
      if (typ === NT && t[NT][0] <= a.a0 && a.a1 <= t[NT][1]) return 0;
      const fore = cyk ? (d - 1 + N) % N : d - 1;
      if (fore >= 0 && x[fore] === NT && t[NT][0] <= a.a0 + DYGN && a.a1 + DYGN <= t[NT][1]) return 0;
      return Infinity;
    }
    function aktKost(X) {
      if (!aktiv) return 0;
      let k = 0;
      for (const a of pr.akt) {
        const mojlig = new Map();
        for (const d of a.dagar) {
          let n = 0;
          for (const pi of a.grupp) if (forlangning(pi, X, d, a) <= Math.max(pers[pi].tol, 120)) { n++; mojlig.set(pi, (mojlig.get(pi) || 0) + 1); }
          k += Math.max(0, a.antal - n) * (a.krav ? HW : WA);
          // minsta bemanning på golvet: utöver deltagarna behövs så många som kan vara kvar (behov, som vakanser)
          if (a.minst) k += (Math.max(0, a.antal + a.minst - n) - Math.max(0, a.antal - n)) * WV / 2;
        }
        // rättvisa: var och en ska kunna delta minst så många gånger som fördelningen kräver
        if (a.lo) for (const pi of a.grupp) k += Math.max(0, a.lo - (mojlig.get(pi) || 0)) * WA / 4;
      }
      return k;
    }

    function vakans(cnt, d, t) { return Math.max(0, behov[d % 7][t] - cnt[d][t]); }
    // jämn bemanning: det som blir över eller saknas på dag och kväll sprids jämnt (per vecka och för perioden),
    // och ett andra extra pass samma dag och dygnsdel kostar extra
    const medJamn = r.jamn_bemanning !== "av";
    function jamnKost(cnt) {
      if (!medJamn) return 0;
      let k = 0, toM = 0, toK = 0, tvM = 0, tvK = 0;
      for (let w = 0; w < W; w++) {
        let om = 0, ok = 0, vm = 0, vk = 0;
        for (let d = w * 7; d < w * 7 + 7; d++) {
          const bm = behov[d % 7][M], bk = behov[d % 7][K], nm = cnt[d][M], nk = cnt[d][K];
          const o1 = Math.max(0, nm - bm), o2 = Math.max(0, nk - bk);
          om += o1; ok += o2; vm += Math.max(0, bm - nm); vk += Math.max(0, bk - nk);
          // växande straff (kvadratiskt): +6 på ett pass och +2 på ett annat kostar mer än +4 och +4
          k += o1 * o1 + o2 * o2 + 2 * Math.max(0, bm - nm) ** 2 + 2 * Math.max(0, bk - nk) ** 2;
        }
        k += Math.abs(om - ok) + Math.abs(vm - vk); toM += om; toK += ok; tvM += vm; tvK += vk;
      }
      return (k + 2 * Math.abs(toM - toK) + 2 * Math.abs(tvM - tvK)) * WJ;
    }

    let bastX = null, bastKost = Infinity;
    const start = Date.now();
    const omstarter = opt.omstarter ?? 3;
    for (let om = 0; om < omstarter; om++) {
      const X = bygg();
      const cnt = Array.from({ length: N }, () => [0, 0, 0, 0]);
      X.forEach(x => x.forEach((t, d) => { if (t) cnt[d][t]++; }));
      const pk = X.map((x, pi) => personKost(pi, x));
      let vak = 0;
      for (let d = 0; d < N; d++) for (let t = 1; t <= 3; t++) vak += vakans(cnt, d, t);
      let jk = jamnKost(cnt), ak = aktKost(X);
      let kost = pk.reduce((s, k) => s + k.summa, 0) + vak * WV + jk + ak;
      let lokalBast = kost, lokalX = X.map(x => x.slice());
      const budget = tidsgrans * 1000 / omstarter;
      const t0 = Date.now();
      let T = 3000, iter = 0;
      const Tslut = 0.3;
      while (true) {
        iter++;
        if ((iter & 1023) === 0) {
          const andel = (Date.now() - t0) / budget;
          if (andel >= 1) break;
          T = 3000 * Math.pow(Tslut / 3000, andel);
          if ((iter & 32767) === 0) rapport({ andel: (om + andel) / omstarter, kost: Math.min(lokalBast, bastKost) });
        }
        const pi = Math.floor(rnd() * P), x = X[pi], p = pers[pi];
        const v = rnd();
        let andrade = [];  // [pi, d, gammal]
        let pj = -1;
        if (v < 0.5) {  // flytta ett pass mellan två vardagar
          const d1 = Math.floor(rnd() * N), d2 = Math.floor(rnd() * N);
          if (d1 % 7 >= 5 || d2 % 7 >= 5 || !x[d1] || x[d2]) continue;
          const a = per[pi].tillat[d2]; if (!a.length) continue;
          andrade = [[pi, d1, x[d1]], [pi, d2, OFF]];
          x[d2] = a[Math.floor(rnd() * a.length)]; x[d1] = OFF;
        } else if (v < 0.75) {  // byt dygnsdel
          if (p.typer.length < 2) continue;
          const d = Math.floor(rnd() * N); if (!x[d]) continue;
          const a = per[pi].tillat[d].filter(t => t !== x[d]); if (!a.length) continue;
          andrade = [[pi, d, x[d]]]; x[d] = a[Math.floor(rnd() * a.length)];
        } else if (v < 0.9) {  // byt dygnsdel för en del av ett arbetsblock: kvällar sist och morgnar först, så att vilan håller
          if (p.typer.length < 2) continue;
          const d = Math.floor(rnd() * N); if (x[d] !== M && x[d] !== K) continue;
          const mal = x[d] === M ? K : M;
          let a = d, b = d; while (a > 0 && x[a - 1]) a--; while (b < N - 1 && x[b + 1]) b++;
          const dagar = []; if (mal === K) for (let i = d; i <= b; i++) dagar.push(i); else for (let i = a; i <= d; i++) dagar.push(i);
          if (dagar.length > 5 || dagar.some(i => !per[pi].tillat[i].includes(mal))) continue;
          andrade = dagar.filter(i => x[i] !== mal).map(i => [pi, i, x[i]]); if (!andrade.length) continue;
          for (const [, i] of andrade) x[i] = mal;
        } else {  // två personer byter dygnsdel samma dag
          pj = Math.floor(rnd() * P); if (pj === pi) continue;
          const d = Math.floor(rnd() * N), y = X[pj];
          if (!x[d] || !y[d] || x[d] === y[d]) continue;
          if (!per[pi].tillat[d].includes(y[d]) || !per[pj].tillat[d].includes(x[d])) continue;
          andrade = [[pi, d, x[d]], [pj, d, y[d]]];
          const tmp = x[d]; x[d] = y[d]; y[d] = tmp;
        }
        // delta
        let delta = 0;
        const vakFore = {}, berorda = new Set();
        for (const [q, d, gammal] of andrade) {
          berorda.add(q);
          for (const t of [gammal, X[q][d]]) if (t) { const n = d * 4 + t; if (!(n in vakFore)) vakFore[n] = vakans(cnt, d, t); }
        }
        for (const [q, d, gammal] of andrade) { if (gammal) cnt[d][gammal]--; if (X[q][d]) cnt[d][X[q][d]]++; }
        for (const n in vakFore) delta += (vakans(cnt, Math.floor(n / 4), n % 4) - vakFore[n]) * WV;
        const jkNy = medJamn ? jamnKost(cnt) : 0; delta += jkNy - jk;
        const akNy = aktiv ? aktKost(X) : 0; delta += akNy - ak;
        const nya = {};
        for (const q of berorda) { nya[q] = personKost(q, X[q]); delta += nya[q].summa - pk[q].summa; }
        if (delta <= 0 || rnd() < Math.exp(-delta / T)) {
          kost += delta; jk = jkNy; ak = akNy;
          for (const q of berorda) pk[q] = nya[q];
          if (kost < lokalBast - 1e-9) { lokalBast = kost; lokalX = X.map(x => x.slice()); }
        } else {
          for (const [q, d, gammal] of andrade) { if (X[q][d]) cnt[d][X[q][d]]--; if (gammal) cnt[d][gammal]++; }
          for (let i = andrade.length - 1; i >= 0; i--) { const [q, d, gammal] = andrade[i]; X[q][d] = gammal; }
        }
      }
      if (lokalBast < bastKost) { bastKost = lokalBast; bastX = lokalX; }
      if (bastKost < WV) break;  // inga hårda brott och inga vakanser: bra nog
    }
    rapport({ andel: 1, kost: bastKost });
    return resultat(pr, bastX, tider, personKost, (Date.now() - start) / 1000);
  }

  // ------------------------------------------------------------------ resultat och passlängder
  function resultat(pr, X, tider, personKost, sekunder) {
    const { r, W, N, cyk, behov, pers } = pr;
    const schema = {}, personer = {};
    let hardTotalt = 0, block = 0, onskStraff = 0, passlangd = 0, spridning = 0, nattVila = 0;
    const brott = [];
    const kvallar = [];
    pers.forEach((p, pi) => {
      const x = X[pi], k = personKost(pi, x, brott);
      hardTotalt += k.hard; block += k.block; onskStraff += k.onsk; spridning += k.spr; nattVila += k.nv;
      const rad = x.map((t, d) => {
        if (!t) return null;
        if (t === NT) return { mall: "N", dygnsdel: "natt", start: klocka(pr.ns), slut: klocka(pr.ne), rast: pr.nRast, netto: pr.nnet, ...(pr.nRast ? {} : { maltidsuppehall: true }) };
        const net = p.bas, o = onsite(net, r);
        const [s, e] = t === M ? [pr.ms, pr.ms + o] : [pr.ks - o, pr.ks];
        return { mall: (t === M ? "M" : "K") + klocka(s) + "-" + klocka(e), dygnsdel: DELNAMN[t], start: klocka(s), slut: klocka(e), rast: o - net, netto: net };
      });
      // förläng k pass med 15 minuter där vilan räcker
      if (!p.natt && p.k) {
        const dagar = rad.map((v, d) => v ? d : -1).filter(d => d >= 0);
        let kvar = p.k;
        const ordning = dagar.slice().sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97));
        for (const d of ordning) {
          if (!kvar) break;
          const v = rad[d], net = v.netto + 15, o = onsite(net, r);
          const forsok = v.dygnsdel === "morgon" ? { ...v, slut: klocka(pr.ms + o) } : { ...v, start: klocka(pr.ks - o) };
          forsok.netto = net; forsok.rast = o - net; forsok.mall = (v.dygnsdel === "morgon" ? "M" : "K") + forsok.start + "-" + forsok.slut;
          const gammal = rad[d]; rad[d] = forsok;
          if (vilaOk(rad, pr, p)) kvar--; else rad[d] = gammal;
        }
      }
      schema[p.id] = rad;
    });
    const golvVak = [];
    const tillfallen = aktiviteter(pr, schema, brott, golvVak);
    for (const t of tillfallen) if (t.saknas && t.krav) hardTotalt++;
    pers.forEach(p => {
      const rad = schema[p.id];
      const minuter = rad.reduce((s, v) => s + (v ? v.netto : 0), 0);
      const kv = rad.filter(v => v && v.dygnsdel === "kvall").length;
      if (p.typer.length > 1) kvallar.push(kv);
      passlangd += rad.reduce((s, v) => s + (v ? Math.abs(v.netto - p.L) : 0), 0) + Math.abs(minuter - p.malMin);
      personer[p.id] = { pass: rad.filter(Boolean).length, minuter, mal_minuter: p.malMin, kvallspass: kv,
        helggrupp: p.frek === "2/4" ? (p.grupp === 0 ? "A" : "B") : null, helgfrekvens: p.frek,
        aktiviteter: rad.reduce((s, v) => s + (v && v.aktiviteter ? v.aktiviteter.length : 0), 0) };
    });
    const vakanser = [];
    let vak = 0;
    for (let d = 0; d < N; d++) for (let t = 1; t <= 3; t++) {
      const n = pers.reduce((s, p, pi) => s + (X[pi][d] === t ? 1 : 0), 0), b = behov[d % 7][t];
      if (n < b) { vak += b - n; vakanser.push({ dag: d, vecka: Math.floor(d / 7) + 1, veckodag: DAGAR[d % 7], dygnsdel: DELNAMN[t], tid: null, antal: b - n }); }
    }
    vakanser.push(...golvVak);
    const golv = golvVak.reduce((s, v) => s + v.antal, 0);
    return {
      status: hardTotalt ? "BROTT" : "OK", motor: "light", enhet: pr.enhet, veckor: W, cykliskt: cyk, sekunder: Math.round(sekunder * 10) / 10,
      kpi: { vakanser: vak + golv, vakanta_pass: vak, vakanta_tidpunkter: golv, blocklangd: block, passlangd: Math.round(passlangd),
        rattvisa: kvallar.length ? Math.max(...kvallar) - Math.min(...kvallar) : 0, spridning, onskemal: onskStraff, hardregelbrott: hardTotalt,
        aktivitet_saknas: tillfallen.reduce((s, t) => s + t.saknas, 0), natt_vila: nattVila },
      personer, vakanser, aktiviteter: tillfallen.map(({ krav, ...t }) => t), schema, brott,
    };
  }

  // Välj deltagare till varje aktivitetstillfälle bland dem som arbetar: först de vars pass redan täcker,
  // sedan de som har deltagit minst. Behöver passet förlängas kortas personens andra pass i steg om 15 minuter,
  // så att arbetstiden stämmer med kontraktet. Vilan kontrolleras efter varje ändring.
  function aktiviteter(pr, schema, brott, golvVak) {
    const { r, N, cyk, pers } = pr, kf = tid(r.kant_fran), kt = tid(r.kant_till);
    const ut = [];
    const satt = (v, o) => {
      const net = netto(o, r); if (net == null) return null;
      const n = { ...v, netto: net, rast: o - net };
      if (v.dygnsdel === "morgon") n.slut = klocka(pr.ms + o); else n.start = klocka(pr.ks - o);
      n.mall = (v.dygnsdel === "morgon" ? "M" : "K") + n.start + "-" + n.slut;
      return n;
    };
    const paPlats = v => { const s = tid(v.start); let e = tid(v.slut); if (e <= s) e += DYGN; return e - s; };
    const tackDag = (rad, d, a) => {
      const v = rad[d];
      if (v) { const s = tid(v.start); let e = tid(v.slut); if (e <= s) e += DYGN; if (s <= a.a0 && a.a1 <= e) return d; }
      const f = cyk ? (d - 1 + N) % N : d - 1, w = f >= 0 ? rad[f] : null;
      if (w && w.dygnsdel === "natt") { const s = tid(w.start); let e = tid(w.slut); if (e <= s) e += DYGN; if (s <= a.a0 + DYGN && a.a1 + DYGN <= e) return f; }
      return -1;
    };
    // försök förlänga passet dag d så att det täcker aktiviteten, och korta andra pass lika mycket
    const forlang = (p, rad, d, a, prova) => {
      const v = rad[d]; if (!v || (v.dygnsdel !== "morgon" && v.dygnsdel !== "kvall")) return false;
      const o = v.dygnsdel === "morgon" ? a.a1 - pr.ms : pr.ks - a.a0;
      if (o <= paPlats(v)) return false;
      if (v.dygnsdel === "morgon" ? (a.a0 < pr.ms || a.a1 > kt) : (a.a1 > pr.ks || a.a0 < kf)) return false;
      const ny = satt(v, o); if (!ny) return false;
      const kopia = rad.slice(); kopia[d] = ny;
      let over = kopia.reduce((s, x) => s + (x ? x.netto : 0), 0) - p.malMin;
      if (over > p.tol) {
        const andra = kopia.map((x, i) => i).filter(i => i !== d && kopia[i] && !kopia[i].aktiviteter && (kopia[i].dygnsdel === "morgon" || kopia[i].dygnsdel === "kvall"))
          .sort((i, j) => kopia[j].netto - kopia[i].netto);
        let andrat = true;
        while (over > 0 && andrat) {
          andrat = false;
          for (const i of andra) {
            if (over <= 0) break;
            const x = kopia[i], o2 = paPlats(x) - 15;
            const slut = x.dygnsdel === "morgon" ? pr.ms + o2 : pr.ks - o2;
            if (x.dygnsdel === "morgon" ? slut < kf : slut > kt) continue;
            const k = satt(x, o2); if (!k || k.netto < p.L - 120) continue;
            over -= x.netto - k.netto; kopia[i] = k; andrat = true;
          }
        }
        if (over > p.tol) return false;
      }
      if (!vilaOk(kopia, pr, p)) return false;
      if (!prova) kopia.forEach((x, i) => { rad[i] = x; });
      return true;
    };
    for (const a of pr.akt) {
      // vilka kan delta vid varje tillfälle (passet täcker, eller kan förlängas)
      const kan = a.dagar.map(d => new Set(a.grupp.filter(pi => {
        const rad = schema[pers[pi].id];
        return tackDag(rad, d, a) >= 0 || forlang(pers[pi], rad, d, a, true);
      })));
      const delt = a.dagar.map(() => []), n = new Map();
      const tilldela = (pi, i) => {
        const p = pers[pi], rad = schema[p.id], d = a.dagar[i];
        let dd = tackDag(rad, d, a);
        if (dd < 0) { if (!forlang(p, rad, d, a)) return false; dd = d; }
        rad[dd] = { ...rad[dd], aktiviteter: [...(rad[dd].aktiviteter || []), { id: a.id, namn: a.namn, start: a.start, slut: a.slut }] };
        delt[i].push(p.id); n.set(pi, (n.get(pi) || 0) + 1);
        return true;
      };
      // rättvis fördelning: varv för varv får var och en ett tillfälle, de med färst möjligheter först,
      // till det tillfälle som har minst deltagare hittills
      for (let varv = 1; varv <= a.hi; varv++) {
        const ordning = a.grupp.filter(pi => (n.get(pi) || 0) < varv)
          .sort((x, y) => kan.filter(k => k.has(x)).length - kan.filter(k => k.has(y)).length || x - y);
        for (const pi of ordning) {
          const val = a.dagar.map((d, i) => i).filter(i => kan[i].has(pi) && delt[i].length < a.antal && !delt[i].includes(pers[pi].id))
            .sort((i, j) => delt[i].length - delt[j].length || i - j);
          for (const i of val) if (tilldela(pi, i)) break;
        }
      }
      // fyll platser som är kvar med dem som har deltagit minst
      a.dagar.forEach((d, i) => {
        const resten = [...kan[i]].filter(pi => !delt[i].includes(pers[pi].id)).sort((x, y) => (n.get(x) || 0) - (n.get(y) || 0) || x - y);
        for (const pi of resten) { if (delt[i].length >= a.antal) break; tilldela(pi, i); }
      });
      // minsta bemanning på golvet: förläng pass för dem som inte deltar tills nog många är kvar varje kvart
      if (a.minst) a.dagar.forEach((d, i) => {
        const pagolv = t => {
          let n = 0;
          for (const p of pers) {
            const rad = schema[p.id];
            for (const dd of [d, cyk ? (d - 1 + N) % N : d - 1]) {
              const v = dd >= 0 ? rad[dd] : null; if (!v) continue;
              const s = tid(v.start); let e = tid(v.slut); if (e <= s) e += DYGN;
              const tt = dd === d ? t : t + DYGN;
              if (s <= tt && tt < e) { if (!(dd === d && a.golv && pr.akt.some(b => b.golv && b.a0 <= t && t < b.a1 && (v.aktiviteter || []).some(x => x.id === b.id)))) n++; break; }
            }
          }
          return n;
        };
        const brist = () => { let m = 0; for (let t = a.a0; t < a.a1; t += 15) m = Math.max(m, a.minst - pagolv(t)); return m; };
        const kand = pers.filter(p => !delt[i].includes(p.id) && schema[p.id][d] && !schema[p.id][d].aktiviteter
          && (schema[p.id][d].dygnsdel === "morgon" || schema[p.id][d].dygnsdel === "kvall"));
        for (const p of kand) { if (brist() <= 0) break; if (tackDag(schema[p.id], d, a) < 0) forlang(p, schema[p.id], d, a); }
        for (let t = a.a0; t < a.a1; t += 15) {
          const m = a.minst - pagolv(t);
          if (m > 0) golvVak.push({ dag: d, vecka: Math.floor(d / 7) + 1, veckodag: DAGAR[d % 7], dygnsdel: null, tid: klocka(t), antal: m });
        }
      });
      a.dagar.forEach((d, i) => {
        const saknas = a.onskat - delt[i].length;
        const dt = `vecka ${Math.floor(d / 7) + 1} ${DAGAR[d % 7]}`;
        if (saknas > 0 && a.krav) brott.push({ regel: "AKTIVITET", niva: "verksamhet", person: null, text: `${dt}: ${delt[i].length} deltar i ${a.namn}, behov ${a.onskat}.` });
        ut.push({ aktivitet: a.id, namn: a.namn, dag: d, vecka: Math.floor(d / 7) + 1, veckodag: DAGAR[d % 7], start: a.start, slut: a.slut,
          deltagare: delt[i], behov: a.onskat, saknas: Math.max(0, saknas), krav: a.krav });
      });
    }
    return ut;
  }

  function vilaOk(rad, pr, p) {
    const { r, N, W, cyk } = pr;
    const L = N * DYGN;
    let iv = [];
    rad.forEach((v, d) => { if (v) { const s = d * DYGN + tid(v.start); let e = d * DYGN + tid(v.slut); if (e <= s) e += DYGN; iv.push([s, e]); } });
    if (cyk) iv = iv.concat(iv.map(([s, e]) => [s - L, e - L]), iv.map(([s, e]) => [s + L, e + L]));
    iv.sort((a, b) => a[0] - b[0]);
    const lucka = (a, b) => { let pos = a, best = 0; for (const [s, e] of iv) { if (e <= a || s >= b) continue; best = Math.max(best, Math.max(s, a) - pos); pos = Math.max(pos, Math.min(e, b)); } return Math.max(best, b - pos); };
    for (let i = 1; i < iv.length; i++) if (iv[i][0] - iv[i - 1][1] < r.dygnsvila_minuter && iv[i][0] >= 0 && iv[i][0] < L) return false;
    for (let w = 0; w < W; w++) if (lucka(w * 7 * DYGN, (w + 1) * 7 * DYGN) < r.veckovila_minuter) return false;
    const db = p.natt ? pr.nattDb : pr.db;
    for (let d = 0; d < N; d++) if (lucka(d * DYGN + db, d * DYGN + db + DYGN) < r.dygnsvila_minuter) return false;
    return true;
  }

  // ------------------------------------------------------------------ bemanningsbalans
  function balans(ind) {
    const pr = forbered(ind);
    if (pr.fel.length) return { fel: pr.fel };
    const { r, W, N, behov, pers } = pr;
    const b = (d, t) => behov[d % 7][t];
    const dag = pers.filter(p => !p.natt), natt = pers.filter(p => p.natt);
    const sum = (l, f) => l.reduce((s, x) => s + f(x), 0);
    let behovDK = 0, behovN = 0, vardagDK = 0, vardagN = 0;
    for (let d = 0; d < N; d++) { behovDK += b(d, M) + b(d, K); behovN += b(d, NT); if (d % 7 < 5) { vardagDK += b(d, M) + b(d, K); vardagN += b(d, NT); } }
    const tillDK = sum(dag, p => p.P), tillN = sum(natt, p => p.P);
    let vakHelg = 0, fredag = 0, helgDK = 0, helgN = 0;
    const helger = [];
    for (let w = 0; w < W; w++) {
      const fre = w * 7 + 4, lor = w * 7 + 5, son = w * 7 + 6;
      const bada = dag.filter(p => p.helg[w] && p.typer.length > 1).length;
      const mo = dag.filter(p => p.helg[w] && p.typer.length === 1 && p.typer[0] === M).length;
      const kv = dag.filter(p => p.helg[w] && p.typer.length === 1 && p.typer[0] === K).length;
      const nw = natt.filter(p => p.helg[w]).length;
      const mB = Math.max(b(lor, M), b(son, M)), kB = Math.max(b(lor, K), b(son, K));
      const kF = r.ingen_fredagskvall_fore_ledig_helg ? Math.max(kB, b(fre, K)) : kB;
      const brist = kb => Math.max(0, Math.max(0, kb - kv) + Math.max(0, mB - mo) - bada);
      const bDK = brist(kF);
      fredag += bDK - brist(kB);
      const nB = Math.max(r.ingen_fredagskvall_fore_ledig_helg ? b(fre, NT) : 0, b(lor, NT), b(son, NT));
      const bN = Math.max(0, nB - nw);
      vakHelg += bDK + bN; helgDK += 2 * (bada + mo + kv); helgN += 2 * nw;
      helger.push({ vecka: w + 1, arbetar: bada + mo + kv, behov: mB + kF, natt: nw, nattbehov: nB, vakanser: bDK + bN });
    }
    const vakVDK = Math.max(0, vardagDK - (tillDK - helgDK)), vakVN = Math.max(0, vardagN - (tillN - helgN));
    const atgarder = [];
    if (vakVDK) atgarder.push(`Det saknas cirka ${vakVDK} dag- och kvällspass på vardagar. En person till ger ${String(r.pass_per_vecka * W).replace(".", ",")} pass.`);
    if (vakVN) atgarder.push(`Det saknas cirka ${vakVN} nattpass på vardagar. Utöka nattpersonalen.`);
    if (fredag) atgarder.push(`Fredagskvällarna ger ${fredag} ${fredag === 1 ? "vakant pass" : "vakanta pass"}: den som är ledig helgen arbetar inte fredag kväll, och den som arbetar fredag kväll kan inte ta morgon på lördagen. Sänk behovet fredag kväll eller låt fler arbeta helg.`);
    if (vakHelg - fredag > 0) atgarder.push(`Helgerna räcker inte till (vecka ${helger.filter(h => h.vakanser).map(h => h.vecka).join(", ")}). Sänk helgbehovet eller utöka personalen.`);
    return { forvantade_vakanser: vakHelg + vakVDK + vakVN, behovDK, tillDK, behovN, tillN, helger, atgarder };
  }

  return { los, balans, forbered, DAGAR };
})();

if (typeof module !== "undefined") module.exports = MOTOR;
if (typeof self !== "undefined" && typeof window === "undefined" && typeof module === "undefined") {
  self.onmessage = e => {
    try {
      const res = MOTOR.los(e.data.indata, { sekunder: e.data.sekunder, seed: e.data.seed, rapport: m => self.postMessage({ typ: "framsteg", ...m }) });
      self.postMessage({ typ: "klar", resultat: res });
    } catch (err) { self.postMessage({ typ: "fel", fel: String(err && err.message || err) }); }
  };
}
