"use strict";
// Inklistring: läser personal och bemanningsbehov som klistras in från Excel eller skrivs som text, och
// gör om dem till förslag för startguiden (guide.js). Delas av webben och lättversionen. Se docs/inklistring.md.
// Namn sparas aldrig: personerna får id-koder (A1 … för dag och kväll, N1 … för natt). Texten de klistrade in
// visas bara i förhandsvisningen. Fristående: inga regler, inga beroenden.

const KLISTRA = (() => {
const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const DELAR = ["morgon", "kvall", "natt"];
const HELTID = 37, HELTID_NATT = 2060 / 60;

const liten = s => String(s ?? "").trim().toLowerCase();
const tal = s => Number(String(s).replace(",", "."));
const minuter = t => { const [h, m] = t.split(/[:.]/).map(Number); return h * 60 + (m || 0); };
const klock = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// "07:00 - 15:30" och "mån - fre" blir en cell; sedan delas raden i celler (tabb från Excel, annars ; | eller mellanrum).
function rader(text) {
  return String(text || "").split(/\r?\n/).map(r => r.replace(/(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/g, "$1-$2")
    .replace(/([a-zåäö]{3,})\s*[-–]\s*([a-zåäö]{3,})/gi, "$1-$2"))
    .filter(r => r.trim())
    .map(r => (r.includes("\t") ? r.split("\t") : /[;|]/.test(r) ? r.split(/[;|]/) : r.trim().split(/\s+/)).map(c => c.trim()));
}

// ---------------------------------------------------------------- veckodagar
const DAGORD = { "mån": 0, "måndag": 0, "måndagar": 0, "tis": 1, "tisdag": 1, "tisdagar": 1, "ons": 2, "onsdag": 2, "onsdagar": 2,
  "tor": 3, "tors": 3, "torsdag": 3, "torsdagar": 3, "fre": 4, "fredag": 4, "fredagar": 4, "lör": 5, "lördag": 5, "lördagar": 5,
  "sön": 6, "söndag": 6, "söndagar": 6, "mon": 0, "ma": 0, "ti": 1, "on": 2, "to": 3, "fr": 4, "lö": 5, "sö": 6 };
const GRUPPER = { vardag: [0, 1, 2, 3, 4], vardagar: [0, 1, 2, 3, 4], helg: [5, 6], helger: [5, 6], helgdag: [5, 6], helgdagar: [5, 6],
  alla: [0, 1, 2, 3, 4, 5, 6], "alla dagar": [0, 1, 2, 3, 4, 5, 6], "varje dag": [0, 1, 2, 3, 4, 5, 6], dagligen: [0, 1, 2, 3, 4, 5, 6] };
function dagar(cell) {
  const c = liten(cell).replace(/[.:]$/, "");
  if (GRUPPER[c]) return GRUPPER[c];
  if (c in DAGORD) return [DAGORD[c]];
  const m = c.match(/^([a-zåäö]+)-([a-zåäö]+)$/);
  if (m && m[1] in DAGORD && m[2] in DAGORD) {
    const ut = []; for (let i = DAGORD[m[1]]; ; i = (i + 1) % 7) { ut.push(i); if (i === DAGORD[m[2]] || ut.length > 7) break; }
    return ut;
  }
  return null;
}

// ---------------------------------------------------------------- dygnsdelar och pass med tider
function del(cell) {
  const c = liten(cell).replace(/[.:]$/, "");
  if (/^(dag|dagpass|dagar|morgon|morgonpass|fm|förmiddag|d|m)$/.test(c)) return "morgon";
  if (/^(kväll|kvall|kvällspass|kvallspass|em|eftermiddag|k)$/.test(c)) return "kvall";
  if (/^(natt|nattpass|nätter|n)$/.test(c)) return "natt";
  return null;
}
function pass(cell) {
  const m = String(cell).match(/^(\d{1,2}[:.]\d{2})-(\d{1,2}[:.]\d{2})$/);
  if (!m) return null;
  const s = minuter(m[1]), e = minuter(m[2]);
  return { start: s, slut: e, del: e <= s || s >= 20 * 60 ? "natt" : s < 11 * 60 ? "morgon" : "kvall" };
}
const arTal = c => /^\d+([.,]\d+)?$/.test(String(c).trim());

// ---------------------------------------------------------------- behov
// Returnerar { behov: {mån: {morgon, kvall, natt}, …} | null, tider: {…}, varningar: [] }.
function behov(text) {
  const R = rader(text), varningar = [], per = Array.from({ length: 7 }, () => null);
  const tider = { morgonStart: [], kvallSlut: [], nattStart: [], nattSlut: [] };
  const satt = (dagLista, d, n, lagg) => dagLista.forEach(i => {
    per[i] = per[i] || { morgon: 0, kvall: 0, natt: 0 }; per[i][d] = lagg ? per[i][d] + n : n;
  });
  const noteraTid = p => {
    if (p.del === "morgon") tider.morgonStart.push(p.start);
    if (p.del === "kvall") tider.kvallSlut.push(p.slut);
    if (p.del === "natt") { tider.nattStart.push(p.start); tider.nattSlut.push(p.slut); }
  };
  let kolDagar = null, kolDelar = null, kanda = 0;
  for (const r of R) {
    const celler = r.filter(c => c !== "");
    // rubrikrad med veckodagar: pass eller dygnsdelar står i raderna
    const dagCeller = r.map(dagar);
    if (dagCeller.filter(Boolean).length >= 2 && !celler.some(arTal)) { kolDagar = dagCeller; kolDelar = null; continue; }
    // rubrikrad med dygnsdelar: veckodagar står i raderna
    const delCeller = r.map(del);
    if (delCeller.filter(Boolean).length >= 2 && !celler.some(arTal)) { kolDelar = delCeller; kolDagar = null; continue; }
    // fritext: "vardagar 3 på dag, 2 på kväll och 1 natt"
    const rad = r.join(" "), forsta = celler.map(dagar).find(Boolean);
    const par = [...rad.matchAll(/(\d+)\s*(?:st\.?\s*)?(?:pers(?:oner)?\.?\s*)?(?:på\s+)?(dag|morgon|kv[äa]ll|natt)/gi)];
    if (forsta && par.length) {
      for (const [, n, d] of par) satt(forsta, del(d) || "kvall", Number(n));
      kanda++; continue;
    }
    if (kolDagar) {
      // en rad per pass eller dygnsdel, ett antal per veckodag
      const etikett = celler.find(c => !arTal(c));
      const p = etikett && pass(etikett), d = p ? p.del : etikett && del(etikett);
      if (!d) { if (celler.some(arTal)) varningar.push(`Raden ”${rad.slice(0, 40)}” har varken dygnsdel eller tider och hoppades över.`); continue; }
      if (p) noteraTid(p);
      const iTabb = r.length === kolDagar.length || r.length === kolDagar.length + 1;
      const kol = kolDagar.map((x, i) => [x, i]).filter(([x]) => x);
      if (iTabb && r.length === kolDagar.length) kol.forEach(([x, i]) => { if (arTal(r[i])) satt(x, d, tal(r[i]), true); });
      else { const n = celler.filter(arTal); kol.forEach(([x], j) => { if (j < n.length) satt(x, d, tal(n[j]), true); }); }
      kanda++; continue;
    }
    // en rad per veckodag, antal per dygnsdel
    if (forsta) {
      const tider2 = celler.map(pass).filter(Boolean);
      const n = celler.filter(arTal).map(tal);
      if (tider2.length === 1 && n.length === 1) { noteraTid(tider2[0]); satt(forsta, tider2[0].del, n[0], true); kanda++; continue; }
      const ordning = kolDelar ? kolDelar.filter(Boolean) : DELAR;
      if (kolDelar && r.length === kolDelar.length) kolDelar.forEach((x, i) => { if (x && arTal(r[i])) satt(forsta, x, tal(r[i])); });
      else ordning.forEach((x, j) => { if (j < n.length) satt(forsta, x, n[j]); });
      if (!n.length) varningar.push(`Raden ”${rad.slice(0, 40)}” saknar antal och hoppades över.`);
      else kanda++;
      continue;
    }
    // pass med tider utan rubrik, till exempel "07:00-15:30 2" (gäller alla dagar)
    const p = celler.map(pass).find(Boolean), n = celler.filter(arTal).map(tal);
    if (p && n.length === 1) { noteraTid(p); satt(GRUPPER.alla, p.del, n[0], true); kanda++; continue; }
    if (celler.some(arTal)) varningar.push(`Raden ”${rad.slice(0, 40)}” gick inte att tolka och hoppades över.`);
  }
  if (!kanda) return { behov: null, tider: null, varningar: R.length ? [...varningar, "Hittade inget behov. Skriv till exempel ”Vardag 3 2 1” och ”Helg 3 2 1” (dag, kväll, natt), eller klistra in en tabell från Excel."] : [] };
  const saknas = DAGAR.filter((_, i) => !per[i]);
  if (saknas.length && saknas.length < 7) varningar.push(`Inget behov angavs för ${saknas.join(", ")}. Där blir behovet 0.`);
  const ut = Object.fromEntries(DAGAR.map((d, i) => [d, per[i] || { morgon: 0, kvall: 0, natt: 0 }]));
  for (const d of DAGAR) for (const x of DELAR) if (!Number.isInteger(ut[d][x]) || ut[d][x] < 0) {
    varningar.push(`Behovet ${ut[d][x]} för ${d} ska vara ett heltal och avrundades.`); ut[d][x] = Math.max(0, Math.round(ut[d][x]));
  }
  const t = {};
  if (tider.morgonStart.length) t.morgon = klock(Math.min(...tider.morgonStart));
  if (tider.kvallSlut.length) t.kvall = klock(Math.max(...tider.kvallSlut));
  if (tider.nattStart.length) { t.nattStart = klock(tider.nattStart[0]); t.nattSlut = klock(tider.nattSlut[0]); }
  return { behov: ut, tider: t, varningar };
}

// ---------------------------------------------------------------- personal
function arbetar(rad) {
  const t = " " + liten(rad).replace(/[,;|\t]/g, " ") + " ";
  if (/\s(n|natt|nattpersonal|nattjänst|natt-?tjänst)\s/.test(t) || /\bnatt/.test(t)) return "natt";
  if (/(d\s*\/\s*k|\bdk\b|dag\s*(och|\+|&|\/)\s*kv[äa]ll|dag-kv[äa]ll|växlande|rotation)/.test(t)) return "morgon,kvall";
  if (/(bara|endast|enbart)\s+kv[äa]ll|\s(k|kväll|kvall|kvällstjänst)\s/.test(t)) return "kvall";
  if (/(bara|endast|enbart)\s+dag|\s(d|dag|dagtid|dagtjänst)\s/.test(t)) return "morgon";
  return null;
}
function helg(rad) {
  const t = liten(rad);
  if (/inga helger|ingen helg|ej helg|utan helg/.test(t)) return "ingen";
  if (/alla helger|varje helg/.test(t)) return "alla";
  if (/var\s*(4:?e|fjärde)|\b1\/4\b/.test(t)) return "1/4";
  if (/tre av fyra|\b3\/4\b/.test(t)) return "3/4";
  if (/varannan|\b2\/4\b/.test(t)) return "2/4";
  return null;
}

// Returnerar { personer: [{id, grad (procent), arbetar, helg, rad (det inklistrade, sparas inte)}], varningar: [] }.
function personal(text) {
  const R = rader(text), varningar = [], ut = [];
  let timmar = false, rubrik = null;
  for (const [nr, r] of R.entries()) {
    const rad = r.join(" "), t = liten(rad);
    const harTal = /\d/.test(rad.replace(/\b[a-zåäö]+\d+\b/gi, ""));
    if (!harTal && /(namn|grad|syssels|tjänstgöring|procent|arbetar|helg|timmar|tim\b|anställ|medarbetare|id\b)/.test(t) && ut.length === 0 && nr === 0) {
      rubrik = r; timmar = /(timmar|tim\b|h\/v|tim\/v)/.test(t); continue;
    }
    if (/^(summa|totalt|total)\b/.test(t)) continue;
    const a = arbetar(rad) || "morgon,kvall", h = helg(rad);
    let grad = null;
    const pct = rad.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
    const tim = rad.match(/(\d{1,2})[:.](\d{2})(?!\s*%)/) || rad.match(/(\d{1,2}(?:[.,]\d+)?)\s*(h|tim|timmar)\b/i);
    const heltid = a === "natt" ? HELTID_NATT : HELTID;
    if (pct) grad = tal(pct[1]);
    else if (tim) grad = (tim[2] && /^\d{2}$/.test(tim[2]) ? Number(tim[1]) + Number(tim[2]) / 60 : tal(tim[1])) / heltid * 100;
    else {
      // flera tal på raden (till exempel ett radnummer): välj det som ser ut som en grad
      const siffror = r.filter(c => arTal(c)).map(tal).filter(x => x > 0 && x <= 100);
      const x = timmar ? siffror.find(v => v >= 5) : siffror.find(v => v > 0 && v < 1) ?? siffror.find(v => v >= 10) ?? (siffror.length === 1 ? siffror[0] : undefined);
      if (x !== undefined) grad = timmar ? x / heltid * 100 : x <= 1 ? x * 100 : x;
      else if (/\bheltid\b/.test(t)) grad = 100;
    }
    if (grad === null) { grad = 100; varningar.push(`Rad ${nr + 1}: ingen sysselsättningsgrad hittades, satt till 100 %.`); }
    grad = Math.round(grad / 5) * 5;
    if (grad < 10 || grad > 100) { varningar.push(`Rad ${nr + 1}: sysselsättningsgraden ${grad} % är utanför 10–100 % och ändrades.`); grad = Math.min(100, Math.max(10, grad)); }
    ut.push({ grad, arbetar: a, helg: h || "2/4", rad: r.filter(c => c && !arTal(c) && !/%$/.test(c)).slice(0, 2).join(" ") || `Rad ${nr + 1}` });
  }
  let nd = 0, nn = 0;
  for (const p of ut) p.id = p.arbetar === "natt" ? `N${++nn}` : `A${++nd}`;
  return { personer: ut, varningar, rubrik: !!rubrik };
}

return { personal, behov, dagar, DAGAR };
})();
if (typeof module !== "undefined") module.exports = KLISTRA;
