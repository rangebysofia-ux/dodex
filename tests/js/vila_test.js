// Dygnsvila och veckovila som de visas (grafer.js): kväll till 22:00 följt av morgon 07:00 ger 9 h vila.
const G = require("../../schemawebb/statisk/grafer.js");
const K = { dygnsdel: "kvall", start: "14:00", slut: "22:00" }, M = { dygnsdel: "morgon", start: "07:00", slut: "15:00" };
const rad = [K, M, null, null, M, M, M, M, M, null, null, null, M, M];  // två veckor
const v = G.vila(rad, 2, true);
console.log(JSON.stringify({ kortast: Math.min(...v.mellan.map(x => x.min)), veckor: v.veckor.map(x => x.min) }));
