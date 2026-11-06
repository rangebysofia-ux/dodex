// Startguiden: beräkningar och indata (guide.js). tests/test_guide.py kontrollerar indata mot modell.py.
const G = require("../../schemawebb/statisk/guide.js");
const g = G.ny(); g.namn = "Avd T"; g.behov.helg.kvall = 3; g.budget = "300"; g.dagkvall = 10; g.natt = 2; g.startdatum = "2026-12-07"; g.timkostnad = "320";
const r = G.berakna(g);
console.log(JSON.stringify({ berakna: r, grader: G.grader(g), indata: G.indata(g), tom: G.tomIndata("X"), fel: G.kontrollera({ ...G.ny(), steg: 1, startdatum: "2026-12-08" }) }));
