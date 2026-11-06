"use strict";
// OB enligt AB 25 § 21 mom. 1 (Sveriges Kommuner och Regioner, lydelse 2025-04-01), kalenderstyrt.
// Delas av webben och lättversionen. Räknar tid och kronor per kategori A, B, C och D med nattförhöjning
// för A och B. Ett cykliskt grundschema kopplas till verkliga datum med ett startdatum (en måndag).
//
// Källa och nivåer: se docs/ob.md. Belopp läggs till som nya daterade rader när ett nytt avtal har
// kontrollerats; de räknas aldrig upp med procent. Datum utanför en kontrollerad nivå får tid men inga kronor.

const OB = (() => {
  const NIVAER = [
    { fran: "2025-04-01", till: "2026-03-31", A: 126.90, A_natt: 152.30, B: 66.10, B_natt: 76.00, C: 56.70, D: 25.60, kalla: "AB 25 § 21, fr.o.m. 2025-04-01" },
    { fran: "2026-04-01", till: "2027-03-31", A: 130.70, A_natt: 156.90, B: 68.10, B_natt: 78.30, C: 58.40, D: 26.40, kalla: "AB 25 § 21, fr.o.m. 2026-04-01" },
  ];
  const DYGN = 1440;
  const KATEGORIER = ["A", "B", "C", "D"];

  // ---------------------------------------------------------------- datum som dagnummer (dagar sedan 1970-01-01, UTC)
  const dagnr = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 864e5);
  const frånText = s => { const [y, m, d] = s.split("-").map(Number); return dagnr(y, m, d); };
  const datum = n => new Date(n * 864e5);
  const iso = n => datum(n).toISOString().slice(0, 10);
  const veckodag = n => (datum(n).getUTCDay() + 6) % 7;  // 0 = måndag
  const ar = n => datum(n).getUTCFullYear();
  const manad = n => iso(n).slice(0, 7);

  function pask(y) {  // påskdagen (Meeus/Jones/Butcher)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return dagnr(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
  }
  const lordagMellan = (y, m, d0) => { for (let d = d0; d < d0 + 7; d++) { const n = dagnr(y, m, d); if (veckodag(n) === 5) return n; } };

  const arCache = {};
  function arsdagar(y) {
    if (arCache[y]) return arCache[y];
    const p = pask(y), mids = lordagMellan(y, 6, 20), alla = lordagMellan(y, 10, 31);
    const helg = new Map([
      [dagnr(y, 1, 1), "Nyårsdagen"], [dagnr(y, 1, 6), "Trettondedag jul"], [p - 2, "Långfredagen"], [p, "Påskdagen"], [p + 1, "Annandag påsk"],
      [dagnr(y, 5, 1), "Första maj"], [p + 39, "Kristi himmelsfärdsdag"], [p + 49, "Pingstdagen"], [dagnr(y, 6, 6), "Nationaldagen"],
      [mids, "Midsommardagen"], [alla, "Alla helgons dag"], [dagnr(y, 12, 25), "Juldagen"], [dagnr(y, 12, 26), "Annandag jul"],
    ]);
    const aftnar = new Map([[p - 1, "Påskafton"], [mids - 1, "Midsommarafton"], [dagnr(y, 12, 24), "Julafton"], [dagnr(y, 12, 31), "Nyårsafton"]]);
    return (arCache[y] = { helg, aftnar, pask: p, mids, alla, tretton: dagnr(y, 1, 6), forstaMaj: dagnr(y, 5, 1), kristi: p + 39, national: dagnr(y, 6, 6) });
  }
  const helgdag = n => arsdagar(ar(n)).helg.has(n);
  const afton = n => arsdagar(ar(n)).aftnar.get(n) || null;
  const sonEllerHelg = n => veckodag(n) === 6 || helgdag(n);
  // "vardag" i lagens mening: inte söndag eller helgdag (lördag räknas som vardag)
  const vardag = n => !sonEllerHelg(n);

  // ---------------------------------------------------------------- O-tilläggstid A: storhelgsfönster i minuter
  const aCache = {};
  function aFonster(y) {
    if (aCache[y]) return aCache[y];
    const a = arsdagar(y), f = [];
    const nastaVardag = (n, utomLordag) => { let d = n + 1; while (!vardag(d) || afton(d) || (utomLordag && veckodag(d) === 5)) d++; return d; };
    // påsk: kl. 18 dagen före långfredagen till kl. 07 dagen efter annandag påsk
    f.push([(a.pask - 3) * DYGN + 18 * 60, (a.pask + 2) * DYGN + 7 * 60]);
    // midsommar: kl. 18 dagen före midsommarafton till kl. 07 vardag närmast efter aftonen
    f.push([(a.mids - 2) * DYGN + 18 * 60, nastaVardag(a.mids - 1, false) * DYGN + 7 * 60]);
    // jul och nyår: kl. 18 dagen före aftonen till kl. 07 vardag utom lördag närmast efter aftonen
    for (const af of [dagnr(y, 12, 24), dagnr(y, 12, 31)]) f.push([(af - 1) * DYGN + 18 * 60, nastaVardag(af, true) * DYGN + 7 * 60]);
    return (aCache[y] = f);
  }
  const iA = t => { const y = ar(Math.floor(t / DYGN)); return [y - 1, y].some(x => aFonster(x).some(([s, e]) => t >= s && t < e)); };

  // ---------------------------------------------------------------- O-tilläggstid B
  function iB(n, minut) {
    const a = arsdagar(ar(n)), vd = veckodag(n);
    const likHelg = d => sonEllerHelg(d) || ["Julafton", "Nyårsafton"].includes(afton(d));
    if (vd === 5 || vd === 6 || helgdag(n) || ["Julafton", "Nyårsafton"].includes(afton(n))) return true;
    if (likHelg(n - 1) && likHelg(n + 1)) return true;  // klämdag mellan söndag/helgdag
    if (minut >= 16 * 60) {  // vardag närmast före trettondag jul, första maj, Kristi himmelsfärdsdag, nationaldagen, alla helgons dag
      for (const h of [a.tretton, a.forstaMaj, a.kristi, a.national, a.alla, arsdagar(ar(n) + 1).tretton]) {
        let d = h - 1; while (!vardag(d)) d--;
        if (d === n) return true;
      }
    }
    if (minut < 7 * 60) {  // måndag, eller vardag närmast efter trettondag jul, första maj, Kristi himmelsfärdsdag, nationaldagen
      if (vd === 0) return true;
      for (const h of [a.tretton, a.forstaMaj, a.kristi, a.national, arsdagar(ar(n) - 1).national]) {
        let d = h + 1; while (!vardag(d)) d++;
        if (d === n) return true;
      }
    }
    if (vd === 4 && minut >= 17 * 60) return true;  // fredag kl. 17–24
    return false;
  }

  // Kategori för en minut (absolut minut sedan 1970). Ordning: A, B, C/D.
  function kategori(t) {
    const n = Math.floor(t / DYGN), m = t - n * DYGN, vd = veckodag(n);
    const nattMot = pred => (m >= 22 * 60 && pred(n + 1)) || (m < 6 * 60 && pred(n));
    if (iA(t)) return nattMot(d => helgdag(d) || !!afton(d)) ? "A_natt" : "A";
    if (iB(n, m)) return nattMot(d => veckodag(d) >= 5 || helgdag(d)) ? "B_natt" : "B";
    if ((m >= 22 * 60 && vd <= 3) || (m < 6 * 60 && vd >= 1 && vd <= 4)) return "C";
    if (m >= 19 * 60 && m < 22 * 60 && vd <= 4) return "D";
    return null;
  }

  function niva(n) {
    const d = iso(n);
    return NIVAER.find(x => d >= x.fran && d <= x.till) || null;
  }

  const minut = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

  // Alla gränser i § 21 ligger på dessa klockslag, så kategorin är densamma inom varje intervall.
  const GRANSER = [0, 6 * 60, 7 * 60, 16 * 60, 17 * 60, 18 * 60, 19 * 60, 22 * 60, DYGN];
  const dagCache = new Map();
  function dagKategorier(n) {
    let k = dagCache.get(n);
    if (!k) { k = GRANSER.slice(0, -1).map(g => kategori(n * DYGN + g)); dagCache.set(n, k); }
    return k;
  }

  // OB-minuter för ett pass på dag n. Rasten antas ligga mitt i passet (den är inte arbetstid).
  function pass(n, p) {
    const s = n * DYGN + minut(p.start); let e = n * DYGN + minut(p.slut); if (e <= s) e += DYGN;
    const rast = p.rast || 0, r0 = Math.round((s + e) / 2 - rast / 2), r1 = r0 + rast;
    const delar = rast ? [[s, r0], [r1, e]] : [[s, e]];
    const ut = [];  // {manad, kat, min, niva}
    for (const [a, b] of delar) {
      let t = a;
      while (t < b) {
        const dag = Math.floor(t / DYGN), m = t - dag * DYGN;
        let i = 0; while (GRANSER[i + 1] <= m) i++;
        const slut = Math.min(b, dag * DYGN + GRANSER[i + 1]), k = dagKategorier(dag)[i];
        if (k) {
          const man = manad(dag), nv = niva(dag), sista = ut[ut.length - 1];
          if (sista && sista.kat === k && sista.manad === man && sista.niva === nv) sista.min += slut - t;
          else ut.push({ manad: man, kat: k, min: slut - t, niva: nv });
        }
        t = slut;
      }
    }
    return ut;
  }

  // Summera segment per kalendermånad och kategori (A inklusive nattförhöjd tid, osv.), och räkna kronor.
  // avrunda: AB:s regel för utbetalning (uppåt till hel/halv timme per kategori och månad, under en timme ger inget).
  function summera(segment, { avrunda = false } = {}) {
    const perManad = {};
    for (const x of segment) {
      const bas = x.kat[0], m = (perManad[x.manad] = perManad[x.manad] || {});
      const k = (m[bas] = m[bas] || { min: 0, kr: 0, natt: 0, utanNiva: 0 });
      k.min += x.min;
      if (x.kat.endsWith("_natt")) k.natt += x.min;
      if (x.niva) k.kr += x.min / 60 * x.niva[x.kat]; else k.utanNiva += x.min;
    }
    const tot = { A: { min: 0, kr: 0 }, B: { min: 0, kr: 0 }, C: { min: 0, kr: 0 }, D: { min: 0, kr: 0 } };
    let saknarNiva = 0;
    for (const m of Object.values(perManad)) for (const [bas, k] of Object.entries(m)) {
      let min = k.min, kr = k.kr;
      if (avrunda) {
        const rundat = Math.ceil(min / 30) * 30;
        if (rundat < 60) { min = 0; kr = 0; }
        else if (min > 0 && rundat > min && k.min > k.utanNiva) { kr += (rundat - min) / 60 * (kr / ((k.min - k.utanNiva) / 60) || 0); min = rundat; }
      }
      tot[bas].min += min; tot[bas].kr += kr; saknarNiva += k.utanNiva;
    }
    const kr = KATEGORIER.reduce((s, k) => s + tot[k].kr, 0), min = KATEGORIER.reduce((s, k) => s + tot[k].min, 0);
    return { kategorier: tot, min, kr, saknarNiva, perManad };
  }

  // Antaget startdatum när enheten saknar ett: den senaste måndagen där ett helt år (52 veckor) ryms inom
  // kontrollerade avtalsbelopp, så att årskostnaden inte blir för låg av tid utan belopp.
  function antagetStart() {
    let n = frånText(NIVAER[NIVAER.length - 1].till) - 52 * 7 + 1;
    while (veckodag(n) !== 0) n--;
    return iso(n);
  }

  // OB för ett grundschema: en period från startdatum och ett år (52 veckor, cykeln upprepad).
  // schema: {person: [pass eller null per dag i cykeln]}.
  function forSchema(schema, startdatum, { veckorAr = 52 } = {}) {
    const start = frånText(startdatum), N = Object.values(schema)[0]?.length || 0;
    const ut = {};
    for (const [pid, rad] of Object.entries(schema)) {
      const period = [], helar = [], perPass = [];
      for (let d = 0; d < veckorAr * 7; d++) {
        const p = rad[d % N]; if (!p) continue;
        const seg = pass(start + d, p);
        helar.push(...seg);
        if (d < N) { period.push(...seg); perPass.push({ dag: d, datum: iso(start + d), seg }); }
      }
      ut[pid] = { period: summera(period), ar: summera(helar, { avrunda: true }), perPass };
    }
    return ut;
  }

  function dagInfo(n) { return { datum: iso(n), veckodag: veckodag(n), helgdag: arsdagar(ar(n)).helg.get(n) || null, afton: afton(n) }; }

  return { NIVAER, KATEGORIER, kategori, pass, summera, forSchema, niva, antagetStart, dagnr, iso, frånText, veckodag, dagInfo };
})();
if (typeof module !== "undefined") module.exports = OB;
