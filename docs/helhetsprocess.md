# DODEX – sammanhängande process från budget till vikariebokning

**Status:** Produkt- och arkitekturförslag, ännu inte genomfört i sin helhet.
**Utgångspunkt:** Behåll OR-Tools, självständig validering, webb-API, schemagodkännande
och befintlig bemanningsbalans. Bygg separata delar ovanpå samma enhet, period och
aktiverade schemaversion.

## Ledande principer

1. **Verksamhetsbehov och kompetens först.** Ekonomin är en ram och en konsekvens,
   inte tillåtelse att schemalägga otillräcklig bemanning.
2. **En källa per uppgift.** Budget, kontrakterad tid, grundschema, faktisk frånvaro,
   bokning och löneutfall är olika datatyper, med källa och uppdateringstid.
3. **Tre scheman:** (a) förslag, (b) godkänt/aktiverat grundschema, (c) daglig
   planering/utfall. Varken frånvaro eller vikarie ändrar historiken i (b).
4. **Ingen automatisk vikarie vid frånvaro.** Pröva behovet, kompetens,
   resurstid, interna omfördelningar och regelverk innan bokningsunderlag.
5. **Samma kostnadsbegrepp genom kedjan.** Kontrakterad grundkostnad, frånvaro,
   ersättningskostnad, OB, övertid och eventuell dubbelbemanning särskiljs
   så att belopp inte dubbelräknas.
6. **Beslutsstöd, inte självständigt avtalsbeslut.** AI tolkar och föreslår,
   men regelmotor, verifierad konfiguration och godkännande styr förändringar.

## Funktionsmoduler

| Modul | Indata | Utdata |
|---|---|---|
| Budget & ekonomiramar | Årsbudget, kalkylparametrar, PO, buffert, ansvarsområde | Budget per månad, år och enhet, finansierad arbetstid/ÅA |
| Bemanningsdimensionering | Behov per tidpunkt, kompetens, frånvaroantaganden, övrig tid | Timmar, pass, ÅA, luckor, scenariojämförelse |
| Grundschema | Kontrakt, regler, önskemål, aktiviteter, bemanningsbehov | Förslag, validering, kostnad och godkänt grundschema |
| Datumplanering | Aktiverat schema, faktisk kalender, verksamhetskrav | Bemanning, faktisk resurstid och ändrade förutsättningar per datum |
| Frånvaro | Orsak, person, del av pass, giltighet, registreringstid | Frånvarohändelse, möjlig bemanningskonsekvens |
| Täckningsbedömning | Planerad bemanning, samtidiga uppgifter, kompetens, resursläge | Åtgärdsförslag med konsekvenser, bedömt vikariebehov |
| Beställningar & bokningar | Beslutat behov, giltig kompetens, tillgänglighet, vila | Beställning, erbjudanden, accept, bokning, återtag |
| Utfall & uppföljning | Bokning, arbetad tid, OB, faktisk kostnad, budget | Planerat mot faktiskt, vikariegrad, resursutnyttjande, prognos |

## Nödvändiga datanycklar

\`enhet_id\`, \`person_id\` (pseudonymt), \`kompetens_id\`, \`grundschema_id\`,
\`aktivering_id\`, \`planerat_pass_id\`, \`franvarohandelse_id\`,
\`tackningsbedomning_id\`, \`bestallning_id\`, \`bokning_id\`, \`budgetversion_id\`.

Flera enheter kan dela en vikarie: kontrollera samtidiga bokningar och vilotid
över *samtliga* berörda enheter innan bokning godkänns.

## Exempel på händelsekedja

En schemalagd medarbetare blir sjuk 07:00–15:30. En separat frånvarohändelse
registreras. Bemanningsbilden räknas om per tidsintervall: golvkrav,
aktiviteter, raster, kompetens och tillgängliga resurser. Om ett faktiskt
underskott återstår skapas ett förslag om åtgärd. Godkänd beställning kan
matchas mot vikarier med behörighet, tillgänglighet och regelkontroll. Först
när bokning bekräftats räknas passet som tillsatt. Utfallet följer
budgetpost och förklarar tillkommande kostnad.

## Roller och godkännanden

- **Controller/ekonomi:** ekonomiska ramar, analys, prognos – inte ändring av
  enskild frånvaro.
- **Chef:** godkänna budget-/bemanningsbeslut inom behöriga enheter och
  granska uppföljning.
- **Schemaplanerare:** bygga, ändra och granska schemaförslag.
- **Samordnare/bemanningsplanerare:** frånvaroregistrering, täckningsbedömning,
  beställning och bokning inom tilldelade enheter.
- **Vikarie:** begränsad tillgång till egna erbjudanden och bokningar.

Enhetsavgränsad åtkomst och granskningslogg behövs före verkliga personaldata.
Befintlig rollmodell är ännu inte tillräcklig för detta.

## Leveransordning och acceptanskriterier

### A. Säker planeringsgrund
- Daterade pass från aktiverade scheman, inklusive periodskarv och natt över midnatt.
- Grundschema orört; ingen frånvaro eller bokning kan ändra godkänt schema.
- Tester för byte av aktivering, gränsdatum och felaktigt underlag.

### B. Daglig planering och frånvaro
- Daterad läsvy och separata beständiga frånvarohändelser, även delar av pass.
- Åtkomst per roll och enhet; spårbar ändringshistorik.
- Automatisk omräkning av bemanningsläge utan automatisk vikariebeställning.

### C. Bemanningsbrist och åtgärd
- Verklig täckning per tidsintervall med rast, aktiviteter, kompetens och
  flyttbar resurstid.
- Jämför interna åtgärder, vikarie och övertid; kostnad och avtalspåverkan.
- Ansvarig godkänner åtgärd.

### D. Vikariebokning
- Beställningsstatus och kompetenskrav, erbjudanden, accept och avbokning.
- Dubbelbokning, överlappning, dygns-/veckovila och avtal kontrolleras över enheter.
- Ingen tillsatt-markering förrän korrekt bokning bekräftats.

### E. Ekonomisk helhetsstyrning
- Versionerad budget, kostnadsdrivare, frånvarokostnad, OB och vikarieutfall.
- Undvik dubbelräkning av grundlön och tillkommande vikarieersättning.
- Planerat–prognos–utfall per enhet, månad, arbetstidskategori och kostnadsslag.

### F. Integrationer och drift
- Börja med testfiler; sedan avtalade läs-API:er och exporter med
  idempotens, loggning och ändringshistorik.
- Heroma och andra lönesystem behåller rollen som beslutade källsystem där
  det är tillämpligt. Dubbelriktad skrivning kräver separata avtal och skydd.
- Ingen lagring av löne- eller sjukfrånvarodata i lättversionens webbläsare.

## Kända hinder som ska hanteras innan verkliga personuppgifter

- \`schemawebb/app.py\` tillåter körning utan autentisering om inga konton
  och inget lösenord konfigurerats. Kräver produktionssäker standard.
- Konton har två roller och saknar enhetsavgränsad behörighet. Enhets- och
  objektnivåkontroll behövs.
- Det publika kodrepositoryt får **aldrig** innehålla autentiseringsnycklar,
  verkliga personaluppgifter, sjukfrånvaro eller löneunderlag.
- \`docs/drift.md\` innehåller äldre uppgifter om att konton saknas, trots att
  \`docs/godkant-schema.md\` och appen visar motsatsen. Håll driftinfo aktuell.
- \`schemawebb/statisk/assistent.js\` beräknar kontrakterad tid i
  \`las_enhet\` med dagpersonalens heltidsmått för alla, även nattpersonal.
  Detta ska få ett regressionstest och rättas.

## Nästa avgränsade arbete
När PR för datumgrunden är testad och granskad: skapa läs-API för dagplanering,
samt förslag till databas-migration för frånvarohändelser och
beslutslogg. Kör på syntetiska data tills behörighet och sekretess är klara.
