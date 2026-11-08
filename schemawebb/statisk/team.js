"use strict";
// Team i en arbetsgrupp (docs/team.md): gemensam personal med hemteam, och ett eget behov per team.
// Delas av webben och lättversionen. Enhetens behov är summan av teamens; det räknas här så att det aldrig
// behöver skrivas in två gånger. Fristående: inga regler (motorn och granskningen avgör).

const TEAM = (() => {
const DAGAR = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
const DELAR = ["morgon", "kvall", "natt"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function perDag(spec) {
  const ut = Array.from({ length: 7 }, () => ({ morgon: 0, kvall: 0, natt: 0 }));
  for (const [k, v] of Object.entries(spec || {})) {
    const idx = k === "vardag" ? [0, 1, 2, 3, 4] : k === "helg" ? [5, 6] : k === "alla" ? [0, 1, 2, 3, 4, 5, 6] : [DAGAR.indexOf(k)];
    for (const i of idx) if (i >= 0) ut[i] = { morgon: +v.morgon || 0, kvall: +v.kvall || 0, natt: +v.natt || 0 };
  }
  return ut;
}

// Per dag till nycklar: vardag och helg när dagarna är lika, annars en rad per avvikande dag.
function komprimera(dagar) {
  const lika = (a, b) => DELAR.every(x => a[x] === b[x]);
  const ut = { vardag: { ...dagar[0] }, helg: { ...dagar[5] } };
  dagar.forEach((d, i) => { if (!lika(d, i < 5 ? dagar[0] : dagar[5])) ut[DAGAR[i]] = { ...d }; });
  return ut;
}

// Enhetens behov = summan av teamens behov.
function summaBehov(team) {
  const tot = Array.from({ length: 7 }, () => ({ morgon: 0, kvall: 0, natt: 0 }));
  for (const t of team || []) perDag(t.behov).forEach((d, i) => DELAR.forEach(x => (tot[i][x] += d[x])));
  return komprimera(tot);
}

function nyttId(team) { let i = (team || []).length + 1; while ((team || []).some(t => t.id === `T${i}`)) i++; return `T${i}`; }
const namn = (team, id) => ((team || []).find(t => t.id === id) || {}).namn || id || "";
// kort märkning i schemat: "Team 2" → "T2", "Norr" → "Nor"
const kort = (team, id) => { const n = namn(team, id); const m = n.match(/(\d+)\s*$/); return m ? "T" + m[1] : n.slice(0, 3); };

// Kort i resultatet: per team hur många pass som behövdes, hur många som täcktes av egen personal, hur många
// som lånades in och hur många som saknas. Och vilka som lånades ut mest.
function tackningKort(res) {
  if (!res || !res.team || !res.team.length) return "";
  const rader = res.team_tackning || [];
  const per = res.team.map(t => {
    const l = rader.filter(x => x.team === t.id);
    const behov = l.reduce((a, x) => a + x.behov, 0), inl = l.reduce((a, x) => a + x.inlanade, 0), sakn = l.reduce((a, x) => a + x.saknas, 0);
    const iTjanst = l.reduce((a, x) => a + x.i_tjanst, 0);
    return { t, behov, egna: iTjanst - inl, inl, sakn, over: Math.max(0, iTjanst - behov) };
  });
  const ut = Object.entries(res.personer || {}).filter(([, k]) => k.utlanad).sort((a, b) => b[1].utlanad - a[1].utlanad);
  return `<section class="kort team-kort"><h2>Team</h2><p class="dampad liten">Var och en arbetar i sitt hemteam. Där ett team har färre än sitt behov lånas personal in från ett team som har fler.</p>
    <div class="rull"><table class="jamfor"><thead><tr><th>Team</th><th class="tal">Behov, pass</th><th class="tal">Egna</th><th class="tal">Inlånade</th><th class="tal">Saknas</th></tr></thead><tbody>
    ${per.map(x => `<tr><td><b>${esc(x.t.namn)}</b></td><td class="tal">${x.behov}</td><td class="tal">${x.egna}</td><td class="tal">${x.inl || "–"}</td><td class="tal${x.sakn ? " minus" : ""}">${x.sakn || "–"}</td></tr>`).join("")}</tbody></table></div>
    ${ut.length ? `<p class="liten" style="margin:8px 0 0"><span class="dampad">Utlånade pass:</span> ${ut.map(([pid, k]) => `${esc(pid)} ${k.utlanad}`).join(" · ")}</p>` : `<p class="liten dampad" style="margin:8px 0 0">Ingen behövde lånas ut.</p>`}</section>`;
}

return { perDag, komprimera, summaBehov, nyttId, namn, kort, tackningKort, DAGAR, DELAR, esc };
})();
if (typeof module !== "undefined") module.exports = TEAM;
