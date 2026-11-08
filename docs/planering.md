# Planering på datum – första byggstenen (fas 8, punkt 23)

## Syfte
DODEX ska ha ett oföränderligt godkänt **grundschema** och en separat **daglig planering**.
Det ska gå att följa processen budget → behov → grundschema → frånvaro → bedömning av
täckning → vikariebeställning → bokning → faktiskt utfall → ekonomisk uppföljning.

## Implementerad grund (detta utkast)
\`schemamotor/planering.py\` erbjuder två rena funktioner:

- \`generera_daterade_pass(aktiveringar, korningar, fran_datum, till_datum)\`
  lägger ut ett godkänt cykliskt schema på verkliga kalenderdatum och växlar
  till rätt schemaversion när en ny aktivering träder i kraft. Nattpass går
  korrekt över midnatt. Ingen databas eller godkänd körning ändras.
- \`markera_franvaro(passlista, franvarohandelser)\` lägger en separat status
  \`franvaro_registrerad\` med \`tackning: ej_bedomd\` för frånvaro över hela pass.

**Detta är en beräkningsgrund – inte en färdig planeringsmodul.**
Den sparar inga frånvarohändelser, skickar inga bokningar och beräknar inte
om ett frånvaropass verkligen orsakar en vakans. Kompetens, resurstid,
detaljtäckning och individuella vila måste vägas in innan en åtgärd beslutas.

## Föreslagen händelsekedja och datamodell

1. \`schema_aktivering\` (redan befintlig, versionslåst)
2. \`planerat_pass\` (genererad datumvy med källa till godkännandet)
3. \`franvarohandelse\` (egen händelse; helt/del av pass, orsak och giltighet)
4. \`tackningsbedomning\` (behov, kompetens, tillgänglig resurstid, regelkontroll)
5. \`vikariebehov\` (endast efter bedömning – aldrig per automatik vid frånvaro)
6. \`bestallning\` (godkänd, öppen, erbjuden, tillsatt, avbruten)
7. \`bokning\` (person, faktisk tid, kompetens, regelkontroll)
8. \`utfall\` (arbetad tid, frånvaro, kostnad, budgetavvikelse)

Varje händelse behöver enhetskoppling, tidsstämplar, ändringshistorik
och behörighetskontroll. Grundschema och faktisk planering ska kunna
jämföras utan att förvanska det ursprungliga beslutet.

## Fortsatt arbete innan skarp drift

- Säkerställ enhetsbaserad åtkomst, tydliga roller och revisionslogg.
- Inför databasens separata planerings- och frånvarotabeller med migrationer.
- Bygg datumvy och API för att läsa pass från aktivt grundschema.
- Stöd delpassfrånvaro och verklig täckning per kvart/tidpunkt.
- Dra av tillgänglig, kompetensmatchad resurstid **innan** beställningsförslag.
- Boka vikarier först efter kontroll av överlapp, dygns-/veckovila,
  avtalstillhörighet och andra pass i samtliga enheter.
- Budget, faktisk lönekostnad och friktion i beställningsflödet måste
  följas upp på separata poster för att undvika dubbelräkning.
- Verklig frånvaro och lön är känsliga data: använd enbart syntetiska
  exempel tills säkerhet, behörighet och rättslig databehandling är klar.
- Lokala tidsstämplar i första byggstenen är inte tidszonsmedvetna.
  Sommartidsbyten och ersättning kräver särskilda tester.

## Förslag till nästa leverans
Planerings-API i webbtjänsten med skrivskyddad datumvy, därefter
händelsestyrd frånvaroregistrering med reviderbar historik. Håll huvudgrenen
orörd tills automatiska tester körts och PR:n granskats.
