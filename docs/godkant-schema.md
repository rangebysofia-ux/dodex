# Godkänt och aktiverat schema, konton och roller

Färdplan 22 och beslut 29 i `regelhierarki.md`. Det här är det första steget från grundschema till drift (fas 8).

## Flödet

1. Scheman läggs, jämförs (till exempel med balansmallen) och justeras som vanligt.
2. När verksamheten har valt ett schema **godkänns och aktiveras** det från en måndag. Alla inloggade får göra det (användarens beslut), och det sparas vem som gjorde det. Det kan bara göras om schemat saknar brott mot hårda regler.
3. Det godkända schemat är **låst**. Det får guldram, en guldbanner och märket **✓ Godkänt**, och kan inte tas bort. *Redigera* heter då *Gör ny version*, och det som sparas blir en ny körning som inte är godkänd.
4. Ett nytt grundschema godkänns och aktiveras från ett senare datum. Det tidigare gäller fram till dess. Alla godkännanden finns kvar.

Planeringsdelen (frånvaro och vikarier per datum, färdplan 23–24) bygger på det aktiverade schemat.

## Kalender

Under **Kalender** (webbens meny, och knappen 📅 Kalender i telefonen) visas vecka för vecka vilket godkänt schema som gäller, med veckonummer och vilken vecka i perioden det är (till exempel V3/6). Där syns också vad som gäller i dag och vad som är på väg. Ett schema gäller från sin måndag tills nästa godkända schema börjar, och perioden börjar om med V1 efter sista veckan. Veckan då ett schema börjar har en guldlinje. Du kan bläddra tre månader i taget. Koden är `GRAF.kalender` i `grafer.js`. Planeringsdelen (frånvaro och vikarier per datum) kommer att bygga på den här kalendern.

## Konton och roller (webbtjänsten)

| Roll | Får |
|---|---|
| **Chef** | allt, och dessutom skapa och ta bort konton |
| **Schemaläggare** | lägga, justera, jämföra, exportera, godkänna och aktivera scheman, och ändra enheter |

Med miljövariabeln `SCHEMA_GODKANNARE=chef` får bara chefer godkänna och aktivera. Standard är `alla`.

- Kontona skapas under **Konton** i menyn. Det **första kontot blir chef**, och därefter kan bara en chef skapa konton. Det sista chefskontot kan inte tas bort.
- Lösenord har minst 10 tecken och sparas som PBKDF2-SHA256 med salt (standardbiblioteket, inget nytt beroende). Var och en kan byta sitt eget lösenord.
- Det gemensamma lösenordet (`SCHEMA_LOSENORD`) fungerar som tidigare och ger rollen schemaläggare.
- På egen dator utan lösenord och utan konton krävs ingen inloggning, och man räknas som chef. Så fort ett konto finns krävs inloggning.
- Användarnamnet kan vara en id-kod. Den som godkände ett schema sparas med användarnamn och tid.
- Utan `SCHEMA_HEMLIGHET` och utan gemensamt lösenord signeras inloggningen med en slumpad nyckel som sparas i filen `hemlighet` bredvid databasen.

API:
- `GET /api/session` returnerar `anvandare`, `roll`, `konton` och `gemensamt`.
- `POST /api/logga-in` tar `losenord` och, för konton, `anvandare`.
- `GET`, `POST` och `DELETE /api/anvandare`, och `POST /api/anvandare/losenord`.
- `POST /api/korningar/{id}/aktivera` tar `fran_datum` (en måndag). Alla inloggade får använda den, eller bara chefer med `SCHEMA_GODKANNARE=chef`. `GET /api/session` ger `far_godkanna`.
- `GET /api/enheter/{id}/aktiveringar`. `GET /api/enheter/{id}` ger dessutom `aktivt` och `kommande`.

## Lättversionen

I telefonversionen är man ensam användare och godkänner själv. Det godkända schemat får samma guldram, märke och lås. Ett godkännande följer inte med i en enhetsfil; schemat godkänns där det ska användas.

Testerna finns i `tests/test_godkant.py`.
