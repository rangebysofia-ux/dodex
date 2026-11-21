# Dodex – daglig bemanning (syntetisk pilot)

Det här är ett första sammanhängande arbetsflöde för punkterna **23, 24 och 26** i
ROADMAP.md. Det är inte samma sak som att dessa punkter är färdiga för drift.

## Starta säkert

API och gränssnitt är **avstängda som standard**. I en separat lokal testmiljö
med enbart fiktiva personkoder kan du aktivera funktionen med:

Windows PowerShell:

    $env:DODEX_PLANERING_DEMO="1"
    uvicorn schemawebb.app:app --port 8000

macOS/Linux:

    DODEX_PLANERING_DEMO=1 uvicorn schemawebb.app:app --port 8000

Välj en enhet med **godkänt och aktiverat grundschema** och klicka
**Daglig bemanning** i vänstermenyn. Välj datum omkring aktiveringsdatumet.
Du kan registrera frånvaro, bedöma täckning, boka en fiktiv vikarie och
registrera utfall. Nyckeltal och öppna konflikter uppdateras.

Testa på separata konton, lokal testdatabas och syntetiska medarbetare. Kör
inte detta på en befintlig driftmiljö och använd aldrig riktiga namn, sjukuppgifter,
personnummer, löneuppgifter eller interna organisationsuppgifter i denna pilot.

## Genomfört i piloten

1. Aktiverat grundschema läggs ut på kalenderdatum via
   schemamotor.planering.generera_daterade_pass.
2. Frånvaro registreras separat som en händelse. Det skapar **inte automatiskt**
   vikariebehov eller bokning.
3. Användaren gör en explicit täckningsbedömning med motivering:
   inget vikariebehov, intern resurs eller vikariebehov.
4. Fiktiv vikariepool kan skapas med kod och kompetenstaggar.
5. En testbokning måste ha godkänt täckningsbeslut. Kontroll görs av
   kompetenstaggar och tidigare testbokningar (överlapp och 11 timmars vila).
   Avbokning kan ske utan att historiken försvinner.
6. Faktiskt antal arbetade minuter och uppskattad kostnad kan rapporteras,
   manuellt och separat från grundschemat.
7. Uppföljningen visar antal planerade pass, frånvaro, ej bedömda pass,
   vikariebehov, bokningar, olösta behov samt rapporterat utfall.
   Ofullständiga utfall redovisas som okända, inte som genomförda.
8. Alla åtgärder loggas med tid och testaktör i separata pilottabeller.

Pilottabellerna heter dodex_demo_handelser och dodex_demo_vikarier. Varken
schemakörningarnas resultat eller aktiveringarna ändras.

## API

- GET /api/enheter/{id}/daglig-planering?fran=2026-11-23&till=2026-11-29
- GET, POST /api/enheter/{id}/testvikarier
- POST /api/enheter/{id}/planeringshandelser
- GET /api/enheter/{id}/planeringshistorik?pass_id=...

POST-typer: franvaro, aterta_franvaro, bedomning, bokning, avboka, utfall.
Samtliga kräver inloggning. Allt är dessutom gated av DODEX_PLANERING_DEMO=1.

## Tydliga begränsningar – får inte användas skarpt

- Ingen behörighetsstyrning per enhet ännu. Inloggade har bred åtkomst.
- Ingen Heroma-integration, inga riktiga utskick, ingen personverifiering.
- Kompetenskontrollen är konservativ och granskar kandidatens taggar.
  Den beräknar inte om kompetens finns kvar hos övriga medarbetare.
- Vikarieöverlapp och 11 h vila kontrolleras bara mot pilotens aktiva
  testbokningar. Grundschema, anställningar och pass i andra system
  ingår inte. Veckovila, jour, övertid och fulla avtalskrav behöver
  kontrolleras av en utökad regelmotor och oberoende granskning.
- Händelser låses inom en webbprocess. För flera serverprocesser krävs
  transaktionssäker bokningslåsning i databasen.
- Tiderna är lokala och saknar tidszoner; särskilda tester krävs vid
  övergång mellan sommar- och vintertid.
- Förändringar av godkänt schema, övertid och förlängda pass ingår inte.
- Kostnad är ett manuellt testvärde; ingen löneberäkning eller kostnad mot
  budget finns i denna första version.
- Avvikelse- och målkonfliktskort visar **operativa luckor**, inte
  slutlig bedömning av kvalitet, hälsa och kompetensförsörjning.
- Skydd mot radering av enheter, säkrare autentisering, revisions- och
  åtkomstkontroll krävs före drift. Pilotens personkoder får inte kunna
  identifiera riktiga medarbetare.

## Testning

    python -m pytest -q tests/test_planering.py tests/test_daglig_planering.py

För att kalla nästa version driftmässig krävs även full testsvit, kodgranskning,
enhetsbehörigheter, stöd för delpassfrånvaro, kompetens-/resursberäkning,
regelkontroll mot alla andra pass och godkänd behandling av personuppgifter.

## Nästa steg

1. Inför enhetsspecifik behörighet, skydd mot destruktiv radering och
   stark autentisering innan någon verklig användning.
2. Flytta händelser till en produktionsduglig transaktionell datamodell,
   inklusive migration, revisionsspår och idempotenta bokningar.
3. Räkna verklig täckning timme för timme och pröva interna resurser före
   vikariebehov; verifiera alla relevanta regler över enhetsgränser.
4. Följ planerat mot utfört och budget på aggregerad nivå med
   explicit orsak, effekter och målkonflikter.
5. Undersök eventuell Heroma-integration efter IT- och dataskyddsbeslut.
