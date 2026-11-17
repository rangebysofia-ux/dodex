# DODEX Grundschemaanalys – agent för Microsoft 365 Copilot

En Copilot-agent som analyserar cykliska grundscheman (äldreomsorg, LSS och förskola, Kommunal/AB) med samma regler som DODEX Scheduler, och hjälper dig att arbeta vidare med schemat.

## Innehåll

| Fil | Var den används |
|---|---|
| `instruktioner.txt` | Rutan **Instruktioner** i Agent Builder (cirka 4 200 tecken, gränsen är 8 000) |
| `kunskap/*.docx` | **Kunskap**: ladda upp de fyra filerna (Markdown-versionerna `*.md` är samma text) |
| `startfragor.txt` | **Startfrågor** (förslag som visas när agenten öppnas) |

## Skapa agenten (cirka 10 minuter)

1. Öppna **Microsoft 365 Copilot** (m365copilot.com eller Copilot i Teams).
2. Välj **Skapa agent** (Create agent) i vänstermenyn. Gå till fliken **Konfigurera** (Configure).
3. **Namn:** DODEX Grundschemaanalys. **Beskrivning:** Analyserar grundscheman mot avtal, lag och lokala regler och föreslår förbättringar.
4. **Instruktioner:** klistra in hela `instruktioner.txt`.
5. **Kunskap:** ladda upp `1-regler-och-nivaer.docx`, `2-analysmetod.docx`, `3-dataformat.docx` och `4-verksamheterna.docx`. Lägg dem gärna i en SharePoint-mapp och peka på den, så kan de uppdateras utan att agenten görs om.
6. **Funktioner:** slå på **Kodtolk** (Code interpreter), så att agenten kan räkna på Excel-filer. Slå på **Skapa bilder** bara om du vill ha diagram som bilder.
7. **Startfrågor:** lägg in raderna från `startfragor.txt`.
8. Prova i rutan till höger med en Excel-export från DODEX, och välj **Skapa** (Create). Dela med kollegor via **Dela**.

## Använda den

- Exportera schemat från DODEX: i webben **Rapporter → Excel**, i telefonen knappen **Excel** vid schemat. Bifoga filen och skriv till exempel "Analysera mitt grundschema".
- Ange behovet om det inte finns i filen, till exempel "vardag dag 3, kväll 3, natt 1; helg dag 2, kväll 2, natt 1".
- Be agenten arbeta vidare: "Föreslå ett byte så att fredagskvällarna täcks", "Gör ett beslutsunderlag".
- Den exakta kontrollen görs i DODEX: lägg in förslaget där och titta under Regelkontroll.

## Att tänka på

- Använd id-koder för medarbetarna, inte namn. Ladda inte upp lön, frånvaro eller hälsouppgifter.
- Agenten räknar med en språkmodell. Den kan räkna fel; DODEX granskning är den som avgör.
- Uppdatera kunskapsfilerna när verksamheten fattar nya beslut. De bygger på `docs/regelhierarki.md` i DODEX.
