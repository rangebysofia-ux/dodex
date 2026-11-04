# Färdplan

Ge kodagenten en uppgift i taget. Varje uppgift är klar när acceptanskriterierna är uppfyllda och `pytest -q` passerar.

## Fas 1 – Stabil kärna

- [ ] **1. Gör motorn till ett Python-paket.** Flytta `motor/` till paketet `schemamotor` med moduler i stället för `sys.path`-tricket. Behåll kommandona som `python -m schemamotor.build …`.
  *Klart när:* alla tester passerar och kommandona i README fungerar med de nya namnen. `validate` importerar fortfarande ingenting från `build`.
- [ ] **2. Datamodell med validering.** Beskriv indata och schema med Pydantic enligt `docs/indata-schema.md`. Felaktig indata ger begripliga felmeddelanden på svenska.
  *Klart när:* ett test visar tre typiska fel (okänd dag, saknad grad, periodlängd som inte ger heltal) med tydliga meddelanden.
- [ ] **3. Bemanningsbalans.** Modul som före genereringen räknar pass, timmar, helger, nätter, morgon- och kvällskapacitet och fredagskvällar mot behovet, och föreslår åtgärder.
  *Klart när:* balansen förutsäger de vakanser som genereringen ger för `tests/fall/` och för en grupp där fredagsregeln ger vakans.
- [ ] **4. Eget dygnsbryt i regelprofilen.** Förslag från passen för dag och kväll, eget för nattpersonal, fast värde när verksamheten har bestämt sig.

## Fas 2 – Tjänst och gränssnitt

- [ ] **5. API.** FastAPI med endpoints för att skapa schemajobb (lösningen tar tid, så kör den i bakgrunden), hämta status och resultat, granska, förklara och jämföra scenarier.
  *Klart när:* ett integrationstest skapar ett jobb, väntar på resultatet och granskar det.
- [ ] **6. Webbgränssnitt för indata.** Personal, behov per dygnsdel och tidpunkt, regler med nivå och hård/mjuk.
- [ ] **7. Visning av schema.** Vecka för vecka, vakanser markerade, KPI:er, granskningens brott och varningar, förklaring när schemat är olösbart.
- [ ] **8. Export.** Excel och PDF.

## Fas 3 – Önskemål och AI

- [ ] **9. Strukturerade önskemål.** Formulär: dagar, veckor (alla, jämna, udda, arbetshelger), passtyp, tider, krav eller önskemål med vikt. Kontroll som varnar för regler som inte påverkar något (tar bort noll passalternativ).
- [ ] **10. AI-tolkning av fritext.** En språkmodell fyller i formuläret från fritext. Tolkningen visas i klartext och måste godkännas innan den används. AI:n får aldrig skriva kod som körs i lösaren.
  *Klart när:* testfall med "sina helger", "vill" mot "måste" och "varannan fredag" ger rätt formulär eller en följdfråga.

## Fas 4 – Prioriteringsstöd och lärande

- [ ] **11. Åtgärdsförslag.** När det blir vakanser: kör automatiskt en uppsättning tänkbara ändringar (helgfrekvens, sysselsättningsgrad, behov, passmallar) och rangordna dem efter effekt.
- [ ] **12. Växelkurs.** Visa vad varje mjuk regel kostar i vakanstimmar.
- [ ] **13. Lärande av val.** Spara vilka utkast användaren väljer och vilka tolkningar som rättas, och använd det för att föreslå vikter och tolkningar.

## Senare

Kompetenskrav, samplanering mellan enheter, omplanering med minimal avvikelse från grundschemat, kostnader i kronor.
