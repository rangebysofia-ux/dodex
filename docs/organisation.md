# Organisationsstruktur

Enheterna ordnas under verksamheter på startsidan, i webben och i telefonen. Strukturen är bara ordning och rubriker. Den påverkar inte schemaläggningen. Användarens önskemål 2026-11-08. Ett undantag i inställningarna: regelverket Funktionsstöd med Bilaga J (jourpass) erbjuds bara för enheter under LSS (`ORG.arLss`, se `docs/regelverk.md`).

## Startstruktur

```
Äldreomsorg
  SÄBO
  ORDBO        (ordinärt boende, hemtjänst)
LSS
Förskola
```

Gruppen för hemtjänst heter ORDBO (användarens beslut 2026-11-09). En sparad struktur där den fortfarande heter Hemtjänst får det nya namnet när den läses in, om användaren inte har döpt om den själv.

Strukturen kan ändras fritt på sidan **Organisation**, med valfritt antal nivåer:
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

- Startfärgerna: Äldreomsorg guld, SÄBO orange, ORDBO grön, LSS blå och Förskola lila.
- En undergrupp utan egen färg ärver färgen från närmaste grupp ovanför.
- Färgen ändras under **Ändra struktur**, med den runda färgrutan framför gruppens namn.
- En enhet kan också ha en egen färg (väljs vid enheten i listan, ↺ går tillbaka till verksamhetens). Områden som skapas i guiden får var sin färg.
- Enheter utan placering blir grå.

Färgen är bara till för att hitta rätt och påverkar inte schemaläggningen.

## Sidan Organisation

Alla grupper i trädet är stängda tills man öppnar dem (användarens önskemål 2026-11-09), både på startsidan och på sidan Organisation. Det man har öppnat förblir öppet när man byter sida. När en enhet läggs till öppnas gruppen där den hamnade. Enheterna står i bokstavsordning på sidan Organisation.

Hela organisationen kan byggas upp innan något schema läggs (användarens önskemål 2026-11-08, beslut 32 i `regelhierarki.md`). Sidan nås via **Organisation** i sidomenyn i webben och via knappen **Organisation** vid Mina enheter i telefonen.

- **Struktur:** verksamheter och grupper i fritt antal nivåer, med färg, *+ Enhet*, *+ Undergrupp*, *Byt namn* och *Ta bort*.
  - *+ Enhet* skapar en tom enhet med bara namn. Personal, behov och regler fylls i sedan, i enheten.
  - Varje enhet visas med färg, namn och områden/team. *+ Område/team* delar upp enheten i team med ett gemensamt schema (`docs/team.md`). Det första teamet tar över enhetens behov, så att inget behov försvinner.
  - Ska ett område ha eget schema blir det en egen enhet under en undergrupp, till exempel Hemtjänst Centrum › Öst.
- **Aktivitetstyper:** organisationens typer av aktiviteter med namn, färg och kategori (APT, utbildning, möte, studier, dokumentation, handledning, annat). Typerna går att ändra, ta bort och lägga till, till exempel Brandövning.
  - När en aktivitet läggs in i en enhet väljs typen. Aktiviteten får då typens namn, kategori och färg.
  - I schemat visas aktivitetens markering i dess färg, och i aktivitetslistan med en färgprick. En aktivitet utan färg får kategorins standardfärg.

## Grunden: förskolorna

Förskolorna och deras avdelningar finns som grund i verktyget (användarens beslut 2026-11-09): 29 förskolor med 113 avdelningar under Förskola, från `schemawebb/grund_forskola.json`. Förskolorna har öppet 06:00–18:00 som grundinställning (`docs/starttider.md`). Varje förskola blir en enhet, och avdelningarna blir områden/team i förskolans gemensamma schema. Personal, behov och regler fylls i sedan.

- **Webben** lägger in grunden en gång när tjänsten startar (flaggan `grund_forskola`). En förskola som tas bort kommer alltså inte tillbaka av sig själv. `SCHEMA_GRUND=av` stänger av det (testerna gör det).
- **Lättversionen** lägger in grunden första gången listan öppnas, i användarens egen lagring.
- Knappen **Lägg in förskolorna** på sidan Organisation lägger in förskolor och avdelningar som saknas, till exempel efter att något har tagits bort av misstag.
- **Äldreomsorgen** finns också som grund (användarens beslut 2026-11-10), från `schemawebb/grund_aldreomsorg.json`: 13 områden med 40 avdelningar. Varje område blir en enhet där vägen (`vag`) anger var: SÄBO (Forellen, Jonsereds-gården, Kullegården), SÄBO › Furulund (Furulund 1–3 och Furulund Natt), ORDBO (Björndammen, Centrum, Digital hemtjänst och Nattpatrull) och ORDBO › Sävedalen (Norra och Södra). Avdelningarna blir team i områdets gemensamma schema. Grupper som saknas skapas, och ORDBO återanvänds även om den heter Hemtjänst. Det läggs in en gång (flaggan `grund_aldreomsorg`); knappen **Lägg in äldreomsorgen** på sidan Organisation lägger in det som saknas igen (`POST /api/grund/aldreomsorg`).

## Importera från Excel

Överst på sidan Organisation finns **Importera från Excel**. Bara namn läses, inga personuppgifter. Filen kan se ut på tre sätt (första raden är rubriker):

1. **Par:** en kolumn för enheten och en för avdelningen, en rad per avdelning (till exempel *Förskola* och *Avdelning*).
2. **Sammanställning:** enheten och en kolumn *Avdelningar* med namnen åtskilda av komma.
3. **Hierarki:** *Område*, *Typ*, *Under* och *Avdelningar*. *Under* anger vägen, till exempel "SÄBO / Furulund". En rad med avdelningar blir en enhet. En rad som andra ligger under blir en grupp. En rad utan avdelningar och utan något under blir en enhet utan team.

Förhandsvisningen visar allt som ett träd med kryssrutor. Bocka ur det som ska vänta: en bortvald grupp tar med sig allt under. Enskilda avdelningar går också att bocka ur, till exempel dubbletter i underlaget. Välj också var det ska läggas. Förslaget är Förskola eller Äldreomsorg, efter vad filen innehåller.

Avdelningarna blir områden/team i enhetens gemensamma schema. Grupper och enheter som redan finns på samma plats återanvänds, och avdelningar läggs bara till om de saknas, så importen kan köras om. Excel-filen läses i webbläsaren med SheetJS, samma bibliotek som Excel-exporten i lättversionen (`ORG.importPlan`, `importVal`, `importera`).

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
- Tester: `tests/test_organisation.py`, `tests/test_omraden.py`, `tests/test_organisationsstod.py` och `tests/test_grund.py`.
