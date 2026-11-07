# Schemaassistenten

Assistenten svarar på frågor om enheten och det senaste schemat (till exempel "hur många kvällar har var och en?" eller "hur ser fredagskvällarna ut?") och föreslår ändringar i personal, behov, önskemål, aktiviteter (till exempel ”APT tisdag 14–16 för halva gruppen”) och period. Inget ändras förrän användaren trycker **Godkänn**. Regler (vila, helger, block) ändras inte av assistenten utan under Regler.

## Hur den är byggd

- `schemawebb/statisk/assistent.js` innehåller verktygen och instruktionen. Samma fil används av webbsystemet och lättversionen.
  - `las_enhet`, `las_schema`, `las_dagar`, `las_person` läser data.
  - `foresla_andringar` kontrollerar och visar ett förslag; `tillampa` gör ändringen när användaren godkänner.
- **Webbsystemet:** `schemawebb/statisk/chatt.js` kör verktygen i webbläsaren och skickar samtalet till `/api/assistent`, som anropar Claude (`claude-opus-5-5`) med nyckeln på servern. Om en fråga nekas av säkerhetsfiltren tar en annan modell över automatiskt (`fallbacks: "default"`).
- **Lättversionen:** anropar Claude via användarens Claude-konto (`sample`). Ingen nyckel behövs.
- Tester: `tests/test_assistent.py` kör verktygen med Node mot ett riktigt schema; `tests/test_webb.py` testar `/api/assistent` utan riktig nyckel.

## Slå på assistenten på datorn (Windows)

1. Skapa en API-nyckel på **console.anthropic.com** (API Keys, Create Key). Lägg in betalning under Billing. Varje fråga kostar några ören till någon krona beroende på hur mycket schema assistenten behöver läsa.
2. Öppna ett svart fönster (Start, skriv `cmd`) och kör, med din nyckel i stället för `sk-ant-...`:

   ```
   setx ANTHROPIC_API_KEY "sk-ant-..."
   ```

3. Stäng alla svarta fönster och starta systemet igen med `starta-windows.bat`.

Klistra aldrig in nyckeln i en chatt, ett e-postmeddelande eller i koden. Den ligger bara som en miljövariabel på datorn.

Utan nyckel visar assistenten att den inte är påslagen; resten av systemet fungerar som vanligt.

## Personuppgifter

Assistenten skickar enhetens indata och schema till Anthropic. Använd id-koder i stället för namn. Ska riktiga namn användas krävs en dataskyddsbedömning först.


## Schemat blir som du säger

Assistenten skiljer på två sorters ändringar. Båda godkänns med ett tryck.

- **Passändringar** (`satt_pass`, `ta_bort_pass`, `flytta_pass`): när användaren säger hur ett visst pass ska vara, till exempel ”A1 ska jobba kväll tisdag vecka 2”. Passet blir exakt så i det lagda schemat. Resten av schemat ändras inte. Ändringen sparas som en ny körning (`POST /api/korningar/{id}/justera` i webben, lokalt i lättversionen) och granskas direkt mot reglerna. Originalet finns kvar.
- **Ändringar i indata** (personer, behov, önskemål, aktiviteter, period): när något ska gälla generellt. Det användaren säger ”ska”, ”måste” eller ”kan inte” blir krav. Schemat läggs om automatiskt när förslaget godkänns.

De två sorterna blandas inte i samma förslag. Assistenten ändrar aldrig regler, och en passändring som bryter mot en regel visas som regelbrott i granskningen.
