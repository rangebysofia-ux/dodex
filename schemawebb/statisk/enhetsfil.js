"use strict";
// Enhetsfil: en enhet med inställningar och sparade scheman i en fil som både webben (app.js) och
// lättversionen (light/sida.html) kan spara och öppna. Se docs/enhetsfil.md.
// Indata förs över orörd – ingen inställning tas bort eller skrivs om. Scheman granskas om av den
// som öppnar filen (validate.py i webben, granskning.js i lättversionen), så filen behöver inte litas på.
// Fristående: inga regler, inga beroenden.

const ENHETSFIL = (() => {
const FORMAT = "dodex-enhet", VERSION = 1;

const kopia = x => JSON.parse(JSON.stringify(x));
const iso = t => new Date(typeof t === "number" ? t * (t < 1e11 ? 1000 : 1) : t || Date.now()).toISOString();

// körning från webben ({resultat, balans:{...}}) eller lättversionen ({data:"{...}"}) till filens form
function korningTillFil(k) {
  const d = typeof k.data === "string" ? JSON.parse(k.data) : k;
  if (!d.resultat || d.resultat.status !== "OK") return null;
  const b = d.balans;
  return {
    namn: k.namn || "Schema",
    skapad: iso(k.skapad),
    indata: kopia(d.indata),
    resultat: kopia(d.resultat),
    forvantade_vakanser: typeof b === "number" ? b : b && typeof b.forvantade_vakanser === "number" ? b.forvantade_vakanser : null,
  };
}

// enhet = {namn, indata}; korningar = lista i webbens eller lättversionens form
function skapa(enhet, korningar, kalla) {
  return {
    format: FORMAT, version: VERSION, kalla: kalla || "", sparad: iso(),
    enhet: { namn: enhet.namn || "Enhet", indata: kopia(enhet.indata) },
    korningar: (korningar || []).map(korningTillFil).filter(Boolean),
  };
}

function text(enhet, korningar, kalla) { return JSON.stringify(skapa(enhet, korningar, kalla), null, 2); }

function filnamn(namn) { return ((namn || "enhet").replace(/[^\wåäöÅÄÖ -]/g, "").trim() || "enhet") + ".dodex.json"; }

// Läs en enhetsfil – eller ren indata, som testfallen i tests/fall. Kastar Error med svensk text.
function las(innehall) {
  let d = innehall;
  if (typeof d === "string") {
    try { d = JSON.parse(d); } catch { throw new Error("Filen är inte en DODEX-fil (den går inte att läsa som JSON)."); }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("Filen är inte en DODEX-fil.");
  const varningar = [];
  if (d.format === undefined && Array.isArray(d.personal)) {
    return { namn: d.enhet || "Importerad enhet", indata: kopia(d), korningar: [], varningar };
  }
  if (d.format !== FORMAT) throw new Error("Filen är inte en DODEX-fil.");
  if (typeof d.version !== "number" || d.version > VERSION) {
    throw new Error("Filen är sparad med en nyare version av DODEX. Uppdatera programmet och försök igen.");
  }
  const e = d.enhet;
  if (!e || typeof e.indata !== "object" || !e.indata || Array.isArray(e.indata)) throw new Error("Filen saknar enhetens inställningar.");
  const korningar = [];
  for (const [i, k] of (Array.isArray(d.korningar) ? d.korningar : []).entries()) {
    if (!k || typeof k.indata !== "object" || !k.resultat || k.resultat.status !== "OK" || typeof k.resultat.schema !== "object") {
      varningar.push(`Schema ${i + 1} i filen gick inte att läsa och hoppades över.`); continue;
    }
    const t = Date.parse(k.skapad);
    korningar.push({ namn: String(k.namn || `Schema ${i + 1}`), skapad: Number.isNaN(t) ? Date.now() : t,
      indata: kopia(k.indata), resultat: kopia(k.resultat),
      forvantade_vakanser: typeof k.forvantade_vakanser === "number" ? k.forvantade_vakanser : null });
  }
  return { namn: String(e.namn || "Importerad enhet"), indata: kopia(e.indata), korningar, varningar };
}

return { FORMAT, VERSION, skapa, text, las, filnamn };
})();
if (typeof module !== "undefined") module.exports = ENHETSFIL;
