# DODEX Schemastöd – helhetsagent för Microsoft 365 Copilot

Ett helhetsstöd genom hela kedjan: nulägesanalys av behovet, bemanningsbalans och budget, analys av grundscheman, scenarier, kompetens och utbildning, och beslutsunderlag. Samma regler som DODEX Scheduler.

Agenten för bara grundscheman finns i `../grundschema-analys`. Helhetsagenten innehåller den och mer; välj en av dem.

## Innehåll

| Fil | Var den används |
|---|---|
| `instruktioner.txt` | **Instruktioner** i Agent Builder (cirka 5 200 tecken av 8 000) |
| `kunskap/1–6 *.docx` | **Kunskap**: ladda upp alla sex (Markdown-versionerna är samma text) |
| `startfragor.txt` | **Startfrågor** |

Kunskapsfilerna: 1 Regler och nivåer, 2 Analysmetod, 3 Dataformat, 4 Verksamheterna, 5 Bemanningsbalans och budget, 6 Balansmall och nyckeltal. Filerna 1–4 är desamma som i grundschemaagenten.

## Skapa agenten

1. Microsoft 365 Copilot → **Skapa agent** → fliken **Konfigurera**.
2. **Namn:** DODEX Schemastöd. **Beskrivning:** Stöd för bemanning, budget och grundscheman i äldreomsorg, LSS och förskola.
3. **Instruktioner:** klistra in `instruktioner.txt`.
4. **Kunskap:** ladda upp de sex Word-filerna, gärna från en SharePoint-mapp så att de kan uppdateras. Lägg till er egen bemanningsbalansmall eller lokala beslut om ni vill att agenten ska följa dem.
5. **Funktioner:** slå på **Kodtolk** (Code interpreter) för Excel-beräkningar.
6. **Startfrågor:** raderna i `startfragor.txt`.
7. Prova och välj **Skapa**. Dela med dem som behöver den.

## Som färdighet (skill)

Mappen `skill/dodex-schemastod` är samma innehåll som en färdighet enligt standarden Agent Skills: `SKILL.md` (namn och beskrivning överst, sedan instruktionerna) och referensfilerna i `references/`. Använd den när Copilot ber om en skill-fil.

1. Packa mappen som ZIP med mappen överst: `dodex-schemastod.zip` innehåller `dodex-schemastod/SKILL.md` och `dodex-schemastod/references/…`. Ladda inte upp SKILL.md ensam.
2. **Agent Builder:** i agenten, under **Färdigheter** (Skills), välj **Lägg till** och ladda upp ZIP-filen. Instruktionerna kan då vara korta, till exempel "Använd färdigheten dodex-schemastod för frågor om bemanning och scheman."
3. **Copilot i PowerPoint och andra appar med personliga färdigheter:** lägg mappen `dodex-schemastod` i den mapp i OneDrive som Copilot anger för färdigheter.
4. Mappens namn och `name` i SKILL.md måste vara lika (dodex-schemastod).

## Att tänka på

- Id-koder i stället för namn. Ladda inte upp lön, frånvaro eller hälsouppgifter för enskilda.
- Agenten kan räkna fel. DODEX granskning och era egna kontroller avgör.
- Uppdatera kunskapsfilerna när verksamheten fattar nya beslut (de bygger på `docs/` i DODEX).
