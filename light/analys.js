"use strict";
// Konsekvensanalys i lättversionen: en översättning av schemamotor/analys.py (underlag, förslag,
// konsekvenser, rangordning). Schemat för varje förslag läggs av motor.js och granskas av granskning.js.
// Ändras analys.py ska den här filen ändras på samma sätt; tests/js/analys_test.js jämför dem.

const ANALYS = (() => {
  const DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
  const FORSTA_HELTID = 2220;
  const STD = { pass_per_vecka: 4.75, ingen_fredagskvall_fore_ledig_helg: true, helgfrekvens: "2/4" };
  const kopia = x => JSON.parse(JSON.stringify(x));
  const tid = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  // som Pythons round(): halvor avrundas till jämnt tal
  const avrunda = (x, d) => {
    const exakt = Math.abs(x).toFixed(Math.min(100, d + 30)), svans = exakt.slice(exakt.indexOf(".") + 1 + d);
    if (!/^50*$/.test(svans)) return Number(x.toFixed(d));
    const f = 10 ** d, g = Math.floor(Math.abs(x) * f);
    return Math.sign(x) * (g % 2 === 0 ? g : g + 1) / f;
  };
  const r1 = x => avrunda(x, 1), r2 = x => avrunda(x, 2);
  // som Pythons sum() (Neumaier-summering), så att avrundningen blir densamma
  const summa = lista => { let s = 0, c = 0; for (const x of lista) { const t = s + x; c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s; s = t; } return s + c; };

  function dagvarden(spec) {
    const ut = Array.from({ length: 7 }, () => ({}));
    for (const [k, v] of Object.entries(spec || {})) {
      const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGNAMN.indexOf(k)];
      idx.forEach(i => { if (i >= 0) ut[i] = v; });
    }
    return ut;
  }
  const regler = ind => ({ ...STD, ...(ind.regler || {}) });

  function underlag(indata, budget) {
    const r = regler(indata);
    let W = indata.veckor;
    const ppv = r.pass_per_vecka;
    const heltid = (indata.heltid_minuter_per_vecka || FORSTA_HELTID) / 60;
    const behov = dagvarden(indata.behov), b = (d, k) => behov[d][k] || 0;
    const np = (indata.nattpass || [{ start: "21:45", slut: "07:15" }])[0];
    const s = tid(np.start), e = tid(np.slut), nattlangd = (e + (e <= s ? 1440 : 0) - s) / 60;
    const nattVecka = [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + b(d, "natt"), 0);
    const fredagsregel = r.ingen_fredagskvall_fore_ledig_helg;
    const nattHelg = Math.max(fredagsregel ? b(4, "natt") : 0, b(5, "natt"), b(6, "natt"));
    const nattTimmar = (nattVecka * W + (nattVecka ? 2 : 0)) * nattlangd / W;
    const dagPass = [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + b(d, "morgon") + b(d, "kvall"), 0);
    const kvallHelg = Math.max(b(5, "kvall"), b(6, "kvall"));
    const freKvall = fredagsregel ? b(4, "kvall") : 0;
    const perHelg = Math.max(b(5, "morgon"), b(6, "morgon")) + Math.max(kvallHelg, freKvall);
    const andel = { "2/4": 0.5, "1/4": 0.25, "3/4": 0.75, alla: 1.0 }[r.helgfrekvens] ?? 0.5;
    const minDag = dagPass ? Math.max(Math.ceil(dagPass / ppv), Math.ceil(perHelg / andel)) : 0;
    const minNatt = nattVecka ? Math.max(Math.ceil(nattTimmar / heltid), Math.ceil(nattHelg / andel)) : 0;
    const kontrakt = summa((indata.personal || []).map(p => (p.grad ?? 1) * (p.heltid_minuter_per_vecka || heltid * 60) / 60));
    budget = Number(budget || indata.budget_timmar_vecka || r1(kontrakt) || 0);
    return {
      veckor: W, heltid_timmar: heltid, budget_timmar_vecka: budget, arsarbetare_budget: r2(budget / heltid),
      dag_pass_vecka: dagPass, personer_per_helg_dag: perHelg, fredagskvall_styr: freKvall > kvallHelg,
      minsta_antal_dag: minDag, natt_timmar_vecka: r1(nattTimmar), minsta_antal_natt: minNatt,
      dag_timmar_vecka: r1(budget - nattTimmar), pass_per_vecka: ppv, timmar_per_pass_heltid: r2(heltid / ppv),
      behov_timmar_vecka: r1(Math.max(dagPass * heltid / ppv, minDag * 0.5 * heltid) + nattTimmar),
    };
  }

  function grader(summa, antal, steg = 0.05, golv = 0.5) {
    if (antal <= 0) return [];
    const g = Math.min(1, Math.floor(summa / antal / steg) * steg);
    return g >= golv ? Array(antal).fill(r2(g)) : [];
  }

  function heltidsnorm(summa, minst, steg = 0.05, golv = 0.5) {
    for (let heltider = Math.min(Math.floor(summa), 60); heltider >= 0; heltider--) {
      const rest = summa - heltider, restAntal = Math.max(minst - heltider, rest >= golv ? 1 : 0);
      if (restAntal === 0) return Array(heltider).fill(1);
      const g = Math.min(1, Math.floor(rest / restAntal / steg) * steg);
      if (g >= golv) return [...Array(heltider).fill(1), ...Array(restAntal).fill(r2(g))];
    }
    return [];
  }

  const personal = (dag, natt) => [...dag.map((g, i) => ({ id: `A${i + 1}`, grad: g })), ...natt.map((g, i) => ({ id: `N${i + 1}`, grad: g, dygnsdelar: ["natt"] }))];

  function graderText(lista) {
    const c = {};
    lista.forEach(p => { const g = Math.round((p.grad ?? 1) * 100); c[g] = (c[g] || 0) + 1; });
    return Object.keys(c).map(Number).sort((a, b) => b - a).map(g => `${c[g]} × ${g} %`);
  }

  function forslag(indata, budget) {
    const u = underlag(indata, budget), ht = u.heltid_timmar;
    const bas = {};
    for (const [k, v] of Object.entries(indata)) if (!["personal", "onskemal", "beskrivning", "forvantat"].includes(k)) bas[k] = kopia(v);
    bas.veckor = u.veckor; bas.budget_timmar_vecka = u.budget_timmar_vecka; bas.onskemal = [];
    const nattSumma = u.natt_timmar_vecka / ht;
    let natt = [];
    if (u.minsta_antal_natt) {
      natt = heltidsnorm(nattSumma, u.minsta_antal_natt, 0.05, 0.4);
      if (!natt.length) natt = grader(nattSumma, u.minsta_antal_natt, 0.05, 0.3);
      natt = natt.map(g => Math.min(1, Math.ceil(g * 20) / 20));
    }
    const nattTimmar = summa(natt) * ht;
    const dagSumma = Math.max(0, (u.budget_timmar_vecka - nattTimmar) / ht);
    const n = Math.max(u.minsta_antal_dag, 1);
    const kand = [];
    if (indata.personal?.length) kand.push(["nuvarande", "Nuvarande bemanning", "Personalen som finns i enheten i dag, för jämförelse.", kopia(indata.personal), kopia(indata.onskemal || []), {}]);
    kand.push(["heltid", "Heltid som norm", `Så många heltider som budgeten räcker till, resten deltider. Minst ${n} med dag och kväll för att täcka helgerna.`, personal(heltidsnorm(dagSumma, n), natt), [], {}]);
    kand.push(["jamn", "Lika deltider", `${n} personer med samma sysselsättningsgrad. Ger jämn arbetsbörda men kortare pass.`, personal(grader(dagSumma, n), natt), [], {}]);
    kand.push(["fler", "Fler personer, lägre grad", `${n + 2} personer med dag och kväll. Fler som kan arbeta varje helg och mer flexibilitet, men fler deltider.`, personal(grader(dagSumma, n + 2), natt), [], {}]);
    const behovDag = Math.max(0, (u.behov_timmar_vecka - nattTimmar) / ht);
    if (behovDag < dagSumma - 0.25) {
      const g = heltidsnorm(behovDag, n);
      kand.push(["behovet", "Bara behovet", `Den minsta bemanning som täcker behovet: ${n} personer med dag och kväll. Visar hur mycket av budgeten som inte behövs (${r1((dagSumma - behovDag) * ht)} h per vecka).`,
        personal(g.length ? g : grader(behovDag, n), natt), [], {}]);
    }
    if (u.fredagskvall_styr) {
      const minst = ind2 => Math.max(underlag(ind2, u.budget_timmar_vecka).minsta_antal_dag, 1);
      const behov = kopia(indata.behov || {}), helg = behov.helg || {};
      const fre = { ...(behov.fre || behov.vardag || {}) };
      fre.kvall = helg.kvall ?? fre.kvall ?? 0;
      behov.fre = fre;
      const nFre = minst({ ...indata, behov });
      kand.push(["fredag", "Fredagskväll som helgkväll", `Behovet fredag kväll sänks till helgens nivå (${fre.kvall}). Då krävs minst ${nFre} personer med dag och kväll för helgerna i stället för ${n}. Budgeten fördelas med heltid som norm.`,
        personal(heltidsnorm(dagSumma, nFre), natt), [], { behov }]);
      const reg = { ...(indata.regler || {}), ingen_fredagskvall_fore_ledig_helg: false };
      const nRegel = minst({ ...indata, regler: reg });
      kand.push(["utan_fredagsregel", "Utan fredagsregeln", `Den lokala regeln om ingen fredagskväll före ledig helg stängs av, så fredagskvällen kan tas av den som är ledig helgen. Då krävs minst ${nRegel} personer för helgerna. Kräver ett beslut i verksamheten, eftersom det är en lokal regel.`,
        personal(heltidsnorm(dagSumma, nRegel), natt), [], { regler: reg }]);
    }
    const scenarier = [];
    for (const [nyckel, namn, beskr, pers, onsk, extra] of kand) {
      if (!pers.some(p => !p.dygnsdelar) && u.dag_pass_vecka) continue;
      const ind = { ...kopia(bas), ...kopia(extra), personal: pers, onskemal: onsk };
      if (nyckel === "nuvarande") {
        ind.veckor = indata.veckor; delete ind.budget_timmar_vecka;
        if (indata.budget_timmar_vecka) ind.budget_timmar_vecka = indata.budget_timmar_vecka;
      }
      const kontrakt = summa(pers.map(p => p.grad ?? 1)) * ht;
      const dag = pers.filter(p => !(p.dygnsdelar && p.dygnsdelar.length === 1 && p.dygnsdelar[0] === "natt"));
      const nat = pers.filter(p => p.dygnsdelar && p.dygnsdelar.length === 1 && p.dygnsdelar[0] === "natt");
      const sammanfattning = `${dag.length} dag/kväll (${graderText(dag).join(", ")})` + (nat.length ? ` och ${nat.length} natt (${graderText(nat).join(", ")})` : "");
      scenarier.push({ id: nyckel, namn, beskrivning: beskr, sammanfattning, kontrakt_timmar_vecka: r1(kontrakt), indata: ind });
    }
    return { underlag: u, scenarier };
  }

  function konsekvenser(indata, res, granskning, budget) {
    const W = res.veckor, N = W * 7, r = regler(indata);
    const ht = (indata.heltid_minuter_per_vecka || FORSTA_HELTID) / 60;
    const kontrakt = summa(indata.personal.map(p => (p.grad ?? 1) * (p.heltid_minuter_per_vecka || ht * 60) / 60));
    budget = budget || indata.budget_timmar_vecka;
    const ut = { status: res.status, personer: indata.personal.length, heltider: indata.personal.filter(p => (p.grad ?? 1) >= 0.999).length,
      kontrakt_timmar_vecka: r1(kontrakt), arsarbetare: r2(kontrakt / ht), budget_timmar_vecka: budget, budget_kvar: budget ? r1(budget - kontrakt) : null };
    if (res.status !== "OK") return ut;
    const behov = dagvarden(indata.behov);
    const vak = { vardag: 0, fredagskvall: 0, helg: 0, natt: 0 };
    let over = 0, overTim = 0;
    const langd = {};
    for (const rad of Object.values(res.schema)) for (const p of rad) if (p) (langd[p.dygnsdel] = langd[p.dygnsdel] || []).push(p.netto);
    const snitt = {};
    for (const [k, v] of Object.entries(langd)) snitt[k] = summa(v) / v.length;
    for (let d = 0; d < N; d++) for (const del of ["morgon", "kvall", "natt"]) {
      const n = Object.values(res.schema).filter(rad => rad[d] && rad[d].dygnsdel === del).length, b = behov[d % 7][del] || 0;
      if (n < b) vak[del === "natt" ? "natt" : d % 7 >= 5 ? "helg" : d % 7 === 4 && del === "kvall" ? "fredagskvall" : "vardag"] += b - n;
      else if (n > b) { over += n - b; overTim += (n - b) * (snitt[del] || 0) / 60; }
    }
    const helg = Array.from({ length: W }, (_, w) => Object.values(res.schema).filter(rad => rad[w * 7 + 5] || rad[w * 7 + 6]).length);
    let ensidiga = 0;
    const kvallar = [];
    for (const [pid, rad] of Object.entries(res.schema)) {
      const p = indata.personal.find(q => q.id === pid) || {}, delar = p.dygnsdelar || ["morgon", "kvall"];
      if (delar.includes("morgon") && delar.includes("kvall")) {
        kvallar.push(rad.filter(x => x && x.dygnsdel === "kvall").length);
        for (let w = 0; w < W; w++) {
          const typer = rad.slice(w * 7, w * 7 + 7).filter(Boolean).map(x => x.dygnsdel);
          if (typer.length && (!typer.includes("kvall") || !typer.includes("morgon"))) ensidiga++;
        }
      }
    }
    const alla = Object.values(langd).flat(), dagL = [...(langd.morgon || []), ...(langd.kvall || [])];
    Object.assign(ut, {
      vakanta_pass: res.kpi.vakanta_pass, vakanser: vak, overkapacitet_pass: over, overkapacitet_timmar_vecka: r1(overTim / W),
      helg_personer_min: helg.length ? Math.min(...helg) : 0, helg_personer_max: helg.length ? Math.max(...helg) : 0,
      kvallar_skillnad: kvallar.length ? Math.max(...kvallar) - Math.min(...kvallar) : 0,
      veckor_utan_blandning: ensidiga, personveckor: kvallar.length * W,
      kortaste_pass: dagL.length ? Math.min(...dagL) : alla.length ? Math.min(...alla) : 0, langsta_pass: dagL.length ? Math.max(...dagL) : 0,
      brott: granskning ? granskning.brott.length : null, upplasta_regler: [...(indata.avvikelser || [])], fredagsregel: r.ingen_fredagskvall_fore_ledig_helg,
    });
    return ut;
  }

  function rangordna(rader) {
    const nyckel = x => {
      const k = x.konsekvenser || {};
      if (k.status !== "OK") return [1, 1e6, 0, 0, 0, 0];
      return [k.brott ? 1 : 0, k.vakanta_pass || 0, Math.max(0, -(k.budget_kvar || 0)), Math.round((k.overkapacitet_timmar_vecka || 0) / 10), k.veckor_utan_blandning || 0, k.overkapacitet_timmar_vecka || 0];
    };
    const jfr = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    return rader.map((_, i) => i).sort((a, b) => jfr(nyckel(rader[a]), nyckel(rader[b])) || a - b);
  }

  return { underlag, forslag, konsekvenser, rangordna };
})();
if (typeof module !== "undefined") module.exports = ANALYS;
