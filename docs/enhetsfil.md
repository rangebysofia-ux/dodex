# Enhetsfil – samma fil i webben och i telefonen

Första steget i att slå ihop webbtjänsten och lättversionen. En enhet kan sparas som fil i den ena och öppnas i den andra.

## Var

- **Webben:** Enheter → *Spara som fil* på enhetens kort, *Öppna fil* vid rubriken Mina enheter.
- **Lättversionen:** samma knappar under Mina enheter.

Det finns bara en implementation för att skriva och läsa filen: `schemawebb/statisk/enhetsfil.js` (ENHETSFIL), som båda delarna använder (`light/bygg.py` bygger in den).

## Ingen inställning försvinner

- Enhetens indata förs över **orörd**: varje regel, avvikelse, aktivitet, önskemål, bemanningsbalans och lösarinställning, även fält som en senare version lägger till. Inget fylls i, tas bort eller skrivs om.
- Avvikelser från låsta regler (`avvikelser`) följer med och syns precis som förut. Filen kan inte låsa upp något som inte redan var upplåst.
- `tests/test_enhetsfil.py` kontrollerar det för varje testfall och för en enhet där varje regel är ändrad, i båda riktningarna.

## Scheman granskas om

Färdiga scheman (status OK) följer med. Den som öppnar filen granskar dem själv: webben med `validate.py`, lättversionen med `granskning.js`. Filens egen granskning sparas inte och används inte. Brott mot hårda regler visas i Regelkontroll. Scheman som inte är färdiga hoppas över med ett meddelande.

Webben tar emot scheman med `POST /api/enheter/{id}/importerad-korning` (`namn`, `indata`, `resultat`, `forvantade_vakanser`).

## Format

```json
{
  "format": "dodex-enhet",
  "version": 1,
  "kalla": "webb",
  "sparad": "2026-11-07T10:00:00.000Z",
  "enhet": { "namn": "Avd 3", "indata": { "...": "indata enligt indata-schema.md" } },
  "korningar": [
    { "namn": "Körning 4", "skapad": "2026-11-06T14:12:00.000Z", "indata": {}, "resultat": {}, "forvantade_vakanser": 2.5 }
  ]
}
```

- `indata` i en körning är den indata schemat lades med (kan skilja från enhetens nuvarande inställningar).
- En fil med en högre `version` än programmet känner till öppnas inte; användaren får veta att programmet behöver uppdateras.
- Ren indata (som filerna i `tests/fall/`) kan också öppnas; den blir en enhet utan scheman.

## Personuppgifter

Filen innehåller det som finns i enheten, alltså id-koder för personalen. Enhetens namn är det namn användaren har gett enheten. Filen ska hanteras som annat schemaunderlag.
