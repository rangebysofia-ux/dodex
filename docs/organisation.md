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

## Färger

Varje verksamhet och grupp har en färg, så att man ser direkt vilken sorts enhet det är. Enheterna under en grupp får gruppens färg: huset 🏠 framför enhetens namn, en kant på enhetskortet och en etikett med verksamheten (till exempel Äldreomsorg › SÄBO) överst på enhetens sida.

- Startfärgerna: Äldreomsorg guld, SÄBO orange, Hemtjänst grön, LSS blå och Förskola lila.
- En undergrupp utan egen färg ärver färgen från närmaste grupp ovanför.
- Färgen ändras under **Ändra struktur**, med den runda färgrutan framför gruppens namn.
- En enhet kan också ha en egen färg (väljs vid enheten i listan, ↺ går tillbaka till verksamhetens). Områden som skapas i guiden får var sin färg.
- Enheter utan placering blir grå.

Färgen är bara till för att hitta rätt och påverkar inte schemaläggningen.

## Sidan Organisation

Hela organisationen kan byggas upp innan något schema läggs (användarens önskemål 2026-11-08, beslut 32 i `regelhierarki.md`). Sidan nås via **Organisation** i sidomenyn i webben och via knappen **Organisation** vid Mina enheter i telefonen.

- **Struktur:** verksamheter och grupper i fritt antal nivåer, med färg, *+ Enhet*, *+ Undergrupp*, *Byt namn* och *Ta bort*.
  - *+ Enhet* skapar en tom enhet med bara namn. Personal, behov och regler fylls i sedan, i enheten.
  - Varje enhet visas med färg, namn och områden/team. *+ Område/team* delar upp enheten i team med ett gemensamt schema (`docs/team.md`). Det första teamet tar över enhetens behov, så att inget behov försvinner.
  - Ska ett område ha eget schema blir det en egen enhet under en undergrupp, till exempel Hemtjänst Centrum › Öst.
- **Aktivitetstyper:** organisationens typer av aktiviteter med namn, färg och kategori (APT, utbildning, möte, studier, dokumentation, handledning, annat). Typerna går att ändra, ta bort och lägga till, till exempel Brandövning.
  - När en aktivitet läggs in i en enhet väljs typen. Aktiviteten får då typens namn, kategori och färg.
  - I schemat visas aktivitetens markering i dess färg, och i aktivitetslistan med en färgprick. En aktivitet utan färg får kategorins standardfärg.

## Teknik

- `schemawebb/statisk/organisation.js` (ORG) delas av webben och lättversionen och innehåller startstrukturen, ändringarna, valrutan och trädet.
- **Webben:**
  - `GET /api/organisation` returnerar `{noder}`, där `null` betyder startstrukturen.
  - `PUT /api/organisation` kontrollerar dubbletter, okända överordnade grupper och cirklar, och flyttar enheterna från borttagna grupper upp ett steg.
  - `POST /api/enheter/{id}/flytta`.
  - `org` på enheten, i tabellen `enheter` (kolumnen läggs till i äldre databaser).
- **Lättversionen:** strukturen sparas i dokumentet `org` i användarens lagring, och `org` sparas på varje enhet.
- `farg` på en grupp (`#rrggbb`, kan saknas). `ORG.farg` räknar fram den ärvda färgen och `ORG.ikon` ritar huset.
- `farg` på en enhet: kolumnen `farg` i `enheter` (webben, `POST /api/enheter/{id}/farg`) och fältet `farg` på enheten i lättversionen. `ORG.enhetsfarg` ger enhetens egen färg eller verksamhetens.
- `ORG.grupp(noder, namn, forelder)` hittar eller skapar gruppen som områdena i guiden samlas under.
- `ORG.stod` ritar sidan Organisation. `TEAM.laggTill`, `TEAM.bytNamn` och `TEAM.taBort` ändrar en enhets team.
- Aktivitetstyper: `ORG.AKT_STANDARD`, `aktLagg`, `aktAndra`, `aktTaBort`, `aktAlternativ`, `aktFalt` och `aktFarg`. Webben: `GET` och `PUT /api/aktivitetstyper`, där `null` betyder standardtyperna. Lättversionen: dokumentet `akttyper` i användarens lagring.
- `GET /api/enheter` innehåller enhetens team (id, namn och färg).
- Tester: `tests/test_organisation.py`, `tests/test_omraden.py` och `tests/test_organisationsstod.py`.
