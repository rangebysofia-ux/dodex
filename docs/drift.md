# Driftsättning

Tjänsten är en Docker-container (`Dockerfile`) med en SQLite-databas på en disk. `render.yaml` beskriver uppsättningen för Render.

## Render, steg för steg

1. Lägg koden i ett privat repo på GitHub.
2. Skapa ett konto på render.com och koppla det till GitHub.
3. Välj **New → Blueprint**, välj repot och godkänn. Render läser `render.yaml`.
4. Fyll i **SCHEMA_LOSENORD** när Render frågar. Välj ett långt lösenord (minst 16 tecken) och dela det bara med dem som ska använda systemet.
   Logga sedan in och skapa chefskontot under **Konton**: det första kontot blir chef och hanterar kontona. Alla inloggade kan godkänna scheman (`SCHEMA_GODKANNARE=chef` begränsar det till chefer). Förskolorna och deras avdelningar läggs in som grund första gången tjänsten startar (`docs/organisation.md`).
5. Vänta tills bygget är klart (några minuter första gången). Adressen visas överst, till exempel `https://dodex.onrender.com` (är namnet upptaget lägger Render till ett kort tillägg, som `dodex-a1b2.onrender.com`). Egen domän, till exempel `dodex.rangeby.se`, kopplas under Settings → Custom Domains med en CNAME-post hos domänleverantören som pekar på Render-adressen.
6. Öppna adressen i mobilen och logga in. Lägg gärna sidan på hemskärmen.

Planen `starter` behövs eftersom gratisplanen saknar disk: utan disk försvinner enheter och körningar vid varje omstart. Kostnaden är planen plus disken, se render.com/pricing.

## Miljövariabler

| Variabel | Betydelse |
|---|---|
| `SCHEMA_LOSENORD` | Gemensamt lösenord (rollen schemaläggare). Tomt och inga konton = ingen inloggning (bara för egen dator). Konton med roller skapas under Konton; det första blir chef (docs/godkant-schema.md). |
| `SCHEMA_HEMLIGHET` | Nyckel som signerar inloggningen. Render skapar en slumpad. Byts den loggas alla ut. |
| `SCHEMA_DATA` | Katalog för databasen, `/var/data` på disken. |
| `SCHEMA_MAX_TID` | Högsta antal sekunder per optimeringssteg (standard 60). |

## Uppdateringar

Varje ändring som pushas till huvudgrenen byggs och driftsätts automatiskt. Körningar som pågår när tjänsten startas om markeras som avbrutna och kan köras igen.

## Säkerhetskopior

Databasen är filen `/var/data/schemasystem.db`. Render tar dagliga ögonblicksbilder av disken. För en egen kopia: öppna **Shell** för tjänsten i Render och kopiera filen, eller exportera viktiga scheman som Excel.

## Personuppgifter

Använd id-koder i stället för namn för personal och i kommentarer. Då innehåller databasen inga direkta personuppgifter. Ska riktiga namn användas behövs en bedömning enligt dataskyddsförordningen och ett personuppgiftsbiträdesavtal med driftleverantören.

## Säkerhet

- Inloggningen är ett gemensamt lösenord, sparat som en signerad kaka i 30 dagar. Fel lösenord ger en sekunds fördröjning.
- Avtal och lag (dygnsvila, veckovila, rast) kan inte försvagas, varken i gränssnittet eller via JSON.
- Separata användarkonton och behörigheter finns inte än.


## Ikon på hemskärmen

När webbtjänsten sparas på hemskärmen (Safari: Dela → Lägg till på hemskärmen; Chrome: Installera app) visas DODEX-klockan på skogsgrön botten och namnet DODEX. Ikonerna (`schemawebb/statisk/ikon-*.png`) och `manifest.json` görs om från `logga.svg` med `node scripts/ikoner.js`. Det fungerar för den publicerade tjänsten, till exempel på Render; lättversionen på claude.ai får Claudes ikon, eftersom den sidan ägs av claude.ai.
