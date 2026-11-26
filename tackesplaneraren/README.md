# Täckesplaneraren

Fristående webbapp (en HTML-fil, inget byggsteg) som föreslår täcke per häst
för dag (08–20) och natt (20–08) de närmaste 3–5 dygnen. Den hör inte till
schemasystemet och delar ingen kod med det.

Öppna `index.html` i en webbläsare. All data sparas i webbläsarens
`localStorage` och kan flyttas mellan enheter som text under Väder.

## Väder

Prognosen hämtas från SMHI:s öppna API (först `snow1g`, sedan `pmp3g`) för
latitud/longitud under Väder. Går det inte (ingen nätåtkomst eller blockerat)
kan vädret fyllas i för hand. Dag = medeltemperatur 08–20, natt = lägsta
temperatur 20–08, vind = högsta medelvind under perioden.

## Täckeslogik

Effektiv temperatur = temperatur − 5 °C × summan av justeringssteg.

Klippt häst (hel-, jakt- eller delklippt) väljer steg ur grundtabellen:

| Effektiv temp | Fyllning |
|---|---|
| över 15 °C | inget täcke |
| 10–15 °C | 0–50 g |
| 5–10 °C | 100–150 g |
| 0–5 °C | 200–250 g |
| −5–0 °C | 250–300 g |
| −10 till −5 °C | 300–400 g |
| under −10 °C | 300–400 g + underlägg/halsdel |

Justeringar: delklippt −1, box −1 (isolerat stall −2), vind över 8 m/s eller
regn/blötsnö utan vindskydd +1 (bara klippta), senior/mager/sjuk/fryser lätt +1,
svettas lätt/tjock päls/gott hull −1, begränsat grovfoder +1, egen justering
−2…+2. Från 20 år räknas hästen som senior och hull 1–2 som mager.

Oklippt häst: inget täcke över −10 °C, lätt täcke (50–150 g) under −10 °C och
150–250 g under −20 °C. Senior, mager, tunn päls eller fullblod: lätt täcke
från 0 °C och 150–250 g under −10 °C. Regn eller blötsnö med vind (minst 5 m/s)
utan vindskydd ger regntäcke 0–50 g.

Täcket väljs ur hästens förråd: närmast mitten av intervallet, vattentätt ute
vid nederbörd. Finns inget passar en kombination (underlägg/stalltäcke/fleece
under ett ytterlager), annars visas vad som saknas.

Loggen räknar känslor (för varm/lagom/för kall) sedan egen justering senast
ändrades. Tre likadana av de sex senaste ger ett förslag att ändra den ett steg.

Tabellen är tumregler. Känn alltid efter bakom bogen.
