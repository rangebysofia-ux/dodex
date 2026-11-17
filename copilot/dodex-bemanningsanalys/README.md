# DODEX Bemanningsanalys – färdighet för Microsoft 365 Copilot

Bred bemannings-, ekonomi- och nyttoanalys: behov, budget, årsarbetare, kostnad, scenarier, kompetens och beslutsunderlag. Granskar inte ett schemas regler; det gör `dodex-grundschemaanalys`.

## En agent med två färdigheter (rekommenderat)

1. Skapa eller öppna agenten i Agent Builder.
2. **Instruktioner:** klistra in `../agent-instruktioner.txt`. Den innehåller beslutsregeln för vilken färdighet som används och hur kombinerade frågor hanteras (gemensamma indata en gång, regelkontroll först, Del A regelkontroll, Del B verksamhetsanalys, Del C rekommendation).
3. **Färdigheter:** ladda upp `dodex-grundschemaanalys.zip` och `dodex-bemanningsanalys.zip`. Ta bort `dodex-schemastod` om den finns, eftersom den överlappar med båda.
4. **Funktioner:** slå på **Kodtolk**.

`skill/dodex-bemanningsanalys` är färdigheten (SKILL.md och references/). Mappens namn och `name` i SKILL.md ska vara lika.
