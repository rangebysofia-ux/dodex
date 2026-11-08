# Organisationsstruktur

Enheterna ordnas under verksamheter på startsidan, i webben och i telefonen. Strukturen är bara ordning och rubriker. Den påverkar inte schemaläggningen. Användarens önskemål 2026-11-08.

## Startstruktur

```
Äldreomsorg
  SÄBO
  Hemtjänst
LSS
Förskola
```

Strukturen kan ändras fritt under **Ändra organisation**, med valfritt antal nivåer:
- *Byt namn* på en grupp.
- *+ Undergrupp*, till exempel ett område under SÄBO.
- *Ta bort* en grupp. Det går bara när gruppen saknar undergrupper, och dess enheter flyttas upp ett steg.
- *Lägg till överst*, till exempel Socialpsykiatri.

## Enheter

- **+ Ny enhet** (i telefonen **+ Ny**) vid en grupp startar guiden, och den nya enheten hamnar i gruppen.
- Varje enhet har en **Plats** som kan ändras. Det flyttar enheten.
- *Kopiera* lägger kopian på samma plats.
- Enheter utan plats, eller med en plats som inte längre finns, visas under **Utan placering**.
- Grupperna går att fälla ihop och fälla ut.

## Förskola

DODEX är byggt för verksamhet dygnet runt. För förskolan anger man bara dagbehov. Regler som varannan helg kan behöva ändras för de enheterna under Regler, som en avvikelse som syns.

## Teknik

- `schemawebb/statisk/organisation.js` (ORG) delas av webben och lättversionen och innehåller startstrukturen, ändringarna, valrutan och trädet.
- **Webben:**
  - `GET /api/organisation` returnerar `{noder}`, där `null` betyder startstrukturen.
  - `PUT /api/organisation` kontrollerar dubbletter, okända överordnade grupper och cirklar, och flyttar enheterna från borttagna grupper upp ett steg.
  - `POST /api/enheter/{id}/flytta`.
  - `org` på enheten, i tabellen `enheter` (kolumnen läggs till i äldre databaser).
- **Lättversionen:** strukturen sparas i dokumentet `org` i användarens lagring, och `org` sparas på varje enhet.
- Tester: `tests/test_organisation.py`.
