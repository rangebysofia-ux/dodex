// Typfall för OB (AB 25 § 21). Skriver resultaten som JSON; tests/test_ob.py kontrollerar dem.
const OB = require("../../schemawebb/statisk/ob.js");
const kat = (datum, start, slut, rast = 0) => {
  const seg = OB.pass(OB.frånText(datum), { start, slut, rast });
  const ut = {}; seg.forEach(s => (ut[s.kat] = (ut[s.kat] || 0) + s.min)); return ut;
};
const ut = {
  // T5: vanlig fredag 16–22: 16–17 ingen, 17–22 B (inte D)
  fredag: kat("2026-02-13", "16:00", "22:00"),
  // T6: tisdag 18–23: 19–22 D, 22–23 C
  tisdag: kat("2026-02-10", "18:00", "23:00"),
  // natt tisdag→onsdag 21:45–07:15: D 15 min, C 22–06
  vardagsnatt: kat("2026-02-10", "21:45", "07:15"),
  // natt fredag→lördag: fredag 21:45–22 B, 22–24 B natt (mot lördag), lördag 00–06 B natt, 06–07:15 B
  fredagsnatt: kat("2026-02-13", "21:45", "07:15"),
  // natt söndag→måndag: söndag 22–24 B (inte natt mot lördag/söndag/helgdag), måndag 00–07 B
  sondagsnatt: kat("2026-02-15", "21:45", "07:15"),
  // julafton 2026 (torsdag) dagpass: A
  julafton: kat("2026-12-24", "07:00", "15:00"),
  // 23 december 14–22: 14–18 ingen eller D, 18–22 A
  dagForeJul: kat("2026-12-23", "14:00", "22:00"),
  // natt mot juldagen: A natt 22–06
  julnatt: kat("2026-12-24", "21:45", "07:15"),
  // långfredag 2026 är 3 april: A
  langfredag: kat("2026-04-03", "07:00", "15:00"),
  // midsommarafton 2026 är fredag 19 juni: torsdag 18 juni 18–22 är A
  midsommar: kat("2026-06-18", "14:00", "22:00"),
  // dag före Kristi himmelsfärd (onsdag 13 maj 2026) 14–22: 16–22 B
  foreKristi: kat("2026-05-13", "14:00", "22:00"),
  // klämdag fredag 15 maj 2026? Kristi himmelsfärd torsdag 14 maj; fredag 15 är inte klämdag (lördag efter). Vanlig fredag 07–15: ingen OB
  klamfredag: kat("2026-05-15", "07:00", "15:00"),
  // rast mitt i passet räknas inte: tisdag 14–22:30 med 30 min rast → D 19–22 = 180, C 22–22:30 = 30
  medRast: kat("2026-02-10", "14:00", "22:30", 30),
  kategoriLordag: OB.kategori(OB.frånText("2026-02-14") * 1440 + 12 * 60),
  // nivåer: mars 2026 gammal nivå, april ny
  nivaMars: OB.niva(OB.frånText("2026-03-31")).B, nivaApril: OB.niva(OB.frånText("2026-04-01")).B,
  nivaSaknas: OB.niva(OB.frånText("2027-04-01")),
  paskdagen2029: OB.dagInfo(OB.frånText("2029-04-01")).helgdag,
};
// T4: pass över nivågränsen: tisdag 31 mars 2026 kl 19–22 och onsdag 1 april 19–22
const s = OB.summera([...OB.pass(OB.frånText("2026-03-31"), { start: "19:00", slut: "22:00" }), ...OB.pass(OB.frånText("2026-04-01"), { start: "19:00", slut: "22:00" })]);
ut.overGrans = { min: s.kategorier.D.min, kr: Math.round(s.kategorier.D.kr * 100) / 100 };
// T7: månadsavrundning: 40 minuter D i en månad ger inget, 70 minuter avrundas till 90
const t40 = OB.summera(OB.pass(OB.frånText("2026-02-10"), { start: "19:00", slut: "19:40" }), { avrunda: true });
const t70 = OB.summera([...OB.pass(OB.frånText("2026-02-10"), { start: "19:00", slut: "19:40" }), ...OB.pass(OB.frånText("2026-02-11"), { start: "19:00", slut: "19:30" })], { avrunda: true });
ut.avrundning = { t40: t40.kategorier.D.min, t70: t70.kategorier.D.min, t70kr: Math.round(t70.kategorier.D.kr * 100) / 100 };
// ett år för ett schema, med tid
const rad = Array.from({ length: 28 }, (_, d) => d % 7 < 5 ? { start: "13:45", slut: "22:00", rast: 30, dygnsdel: "kvall" } : null);
const t0 = Date.now(); const ar = OB.forSchema({ P1: rad, P2: rad, P3: rad, P4: rad, P5: rad, P6: rad, P7: rad, P8: rad, P9: rad, P10: rad }, "2026-01-05");
ut.arsSchema = { ms: Date.now() - t0, D: ar.P1.ar.kategorier.D.min, B: ar.P1.ar.kategorier.B.min, A: ar.P1.ar.kategorier.A.min, saknar: ar.P1.ar.saknarNiva };
const st = OB.antagetStart(), arAnt = OB.forSchema({ P1: rad }, st);
ut.antaget = { start: st, mandag: OB.veckodag(OB.frånText(st)) === 0, saknar: arAnt.P1.ar.saknarNiva };
console.log(JSON.stringify(ut, null, 1));
