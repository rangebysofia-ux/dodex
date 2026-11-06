// Frågeguiden: beräkningar och indata (guide.js). tests/test_guide.py kontrollerar indata mot modell.py.
const G = require("../../schemawebb/statisk/guide.js");
const g = G.ny(); g.namn = "Avd T"; g.behov.helg.kvall = 3; g.antalDag = 10; g.antalNatt = 2; g.startdatum = "2026-12-07"; g.timkostnad = "320";
const r = G.berakna(g);
G.satt(g, "gradSatt", "budget"); g.budget = "300";
const budget = { grader: G.grader(g), indata: G.indata(g) };
G.satt(g, "gradSatt", "olika"); G.synka(g); g.personer[0].grad = 75;
G.satt(g, "harUndantag", "ja"); g.personer[1].arbetar = "kvall"; g.personer[2].helg = "ingen"; g.tider.kvall = "21:30"; g.tider.nattStart = "21:30"; g.tider.nattSlut = "07:00";
const undantag = G.indata(g);
console.log(JSON.stringify({ berakna: r, budget, undantag, tomt: G.tomtSchema(undantag), tom: G.tomIndata("X"),
  fel: G.kontrollera({ ...G.ny(), steg: 7, startdatum: "2026-12-08" }) }));
