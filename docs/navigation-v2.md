# DODEX 2.0 – navigation och översikt (första granskbara etappen)

## Designbeslut
Bevara **DODEX Scheduler** som användaren känner det: befintlig klocklogotyp, grön/guld/salviapalett,
DM Sans, schemavy, formulär och funktioner. Detta förslag är en *informationsarkitekturförändring*,
inte ett nytt designsystem eller ett alternativt schemaprogram.

## Huvudnavigation
- **Översikt:** direktlänk (även utan vald enhet).
- **Schema och planering:** Schemaplanering, Bemanningsbehov, Medarbetare, Aktiviteter, Regelkontroll.
- **Daglig bemanning:** Kalender för aktiverade grundscheman. Frånvaro och vikariebokningar står
  tydligt som framtida funktioner; det finns inga skenbara länkar.
- **Ekonomi och uppföljning:** Bemanningsbalans, Simulering, Analys och nyckeltal, Rapporter.
- **Administration:** Inställningar, Organisation och Konton.

Sidomenyn använder gruppvisa, uppfällbara avsnitt på dator. Gruppen för vald sida
är öppen vid navigering. På mobil: fem fasta genvägar (Översikt, Schema, Kalender,
Balans och Mer). **Mer** visar samtliga befintliga menylänkar och kan användas utan
vald enhet för globala sidor som Organisation och Konton.

## Förbättrad enhetsöversikt
Ovanför nuvarande nyckeltal finns fyra kort som visar nästa steg:
1. Ekonomi och behov
2. Grundschema
3. Kalender och drift
4. Analys och uppföljning

Korten länkar endast till sidor som redan finns i projektet. Framtida funktioner
beskrivs som kommande. KPI:er, diagram och regulatorisk kontroll är orörda.

## Filer
- `schemawebb/statisk/app.js`: navigationsstruktur
- `schemawebb/statisk/stil.css`: enbart tillägg för gruppering och responsiv layout
- `schemawebb/statisk/sidor.js`: översiktens snabbvägar
- `tests/test_navigation.cjs`: regression av länkar, desktop/mobil och översikt
- `.github/workflows/ui-navigation.yml`: JS-kontroller och Python-regressioner

## Manuell granskning före sammanslagning
1. Testa desktop, surfplatta och mobil (iOS Safari och Android Chrome).
2. Öppna och stäng grupper, kontrollera aktiv sida, länkarnas fokus och mobilens Mer.
3. Testa både utan vald enhet och med en vald enhet.
4. Testa inloggning, Utloggning och byte av enhet.
5. Säkerställ att alla tidigare funktioner kan nås och att schema/KPI:er fungerar.
6. Gör kontrollen på **utvecklingsgrenen** och godkänn PR först när CI och manuell
   granskning passerat. Huvudgrenen driftsätts automatiskt via Render i detta projekt.

## Nästa etapp – ingår INTE nu
Separat datumplanering med frånvaro, resurstid och vikarieprocess. En riktig daglig
bemanningsvy placeras under *Daglig bemanning* först när API och datalagring finns,
och behörighets- och dataskyddskrav är uppfyllda.
