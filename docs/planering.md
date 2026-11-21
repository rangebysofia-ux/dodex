# Planering på datum – första byggstenen (fas 8, punkt 23)

## Syfte
DODEX ska ha ett oföränderligt godkänt **grundschema** och en separat **daglig planering**.
Det ska gå att följa processen budget → behov → grundschema → frånvaro → bedömning av
täckning → vikariebeställning → bokning → faktiskt utfall → ekonomisk uppföljning.

## Implementerad grund (detta utkast)
`schemamotor/planering.py` erbjuder två rena funktioner:

- `generera_daterade_pass(aktiveringar, korningar, fran_datum, till_datum)`
  lägger ut ett godkänt cykliskt schema på verkliga kalenderdatum och växlar
  till rätt schemaversion när en ny aktivering träder i kraft. Nattpass går
  korrekt över midnatt. Ingen databas eller godkänd körning ändras.
- `markera_franvaro(passlista, franvarohandelser)` lägger en separat status
  `franvaro_registrerad` med `tackning: ej_bedomd` för frånvaro över hela pass.

**Detta är en beräkningsgrund – inte en färdig planeringsmodul.**
Den sparar inga frånvarohändelser, skickar inga bokningar och beräknar inte
om ett frånvaropass verkligen orsakar en vakans. Kompetens, resurstid,
detaljtäckning och individuella vila måste vägas in innan en åtgärd beslutas.

## Nattpass över ett aktiveringsbyte

Ett pass hör till **dagen det börjar**. Ett nattpass söndag 21:45–måndag 06:45 hör därför till söndagen, och
därmed till den aktivering och det grundschema som gäller på söndagen, även när ett nytt schema aktiveras på
måndagen. Passet behåller hela vägen till 06:45:

- `aktivering_id` och `korning_id` från det gamla schemat,
- `dagindex` och `grundschema_vecka` i det gamla schemat (till exempel dag 6, söndag),
- pass-id `<aktivering>:<startdatum>:<person>`, så att frånvaro och senare händelser pekar på rätt schema.

Det nya schemat börjar med de pass som *startar* på måndagen. Söndagens nattpass läggs inte till en gång till.
Ett intervall som bara omfattar måndagen innehåller därför inte söndagens nattpass. Den som vill se vem som
arbetar natten mot måndag tar med söndagen i intervallet. Testet är
`test_nattpass_sondag_till_mandag_tillhor_schemat_det_borjade_i` i `tests/test_planering.py`.

## Från aktiverat schema till frånvaro (test)

`tests/test_planering_aktiverat.py` går hela vägen genom webbtjänsten med syntetiska koder: motorn lägger
schemat, granskningen godkänner det, det importeras som körning, godkänns och aktiveras från en måndag, rullas
ut på datum och ett pass markeras med frånvaro. Testet kontrollerar att grundschemat i databasen är oförändrat,
att täckningen är `ej_bedomd` och att inget vikariebehov, ingen beställning och ingen bokning skapas, varken
på passen eller som nya tabeller.

## Föreslagen händelsekedja och datamodell

1. `schema_aktivering` (redan befintlig, versionslåst)
2. `planerat_pass` (genererad datumvy med källa till godkännandet)
3. `franvarohandelse` (egen händelse; helt/del av pass, orsak och giltighet)
4. `tackningsbedomning` (behov, kompetens, tillgänglig resurstid, regelkontroll)
5. `vikariebehov` (endast efter bedömning – aldrig per automatik vid frånvaro)
6. `bestallning` (godkänd, öppen, erbjuden, tillsatt, avbruten)
7. `bokning` (person, faktisk tid, kompetens, regelkontroll)
8. `utfall` (arbetad tid, frånvaro, kostnad, budgetavvikelse)

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
