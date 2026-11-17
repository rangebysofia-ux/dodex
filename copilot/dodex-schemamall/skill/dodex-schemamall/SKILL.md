---
name: dodex-schemamall
description: "Skapar ett färdigt grundschema eller en tom schemamall som Excel-fil i samma struktur som DODEX Scheduler (flikarna Schema, Per person, Vakanser och Granskning) och en enhetsfil som öppnas i DODEX, så att användaren kan ladda ner och arbeta vidare. Använd när användaren vill ha en schemamall, ett nytt eller ändrat schema som fil, eller vill ladda ner ett förslag från grundschemaanalysen eller bemanningsanalysen."
---

# DODEX Schemamall

Du skapar nedladdningsbara schemafiler i DODEX Schedulers struktur. Svara på svenska med å, ä och ö.

## När

- Användaren vill ha en **tom mall** att fylla i: enhet, period, personal och behov, men inga pass.
- Användaren vill ha ett **färdigt schema** som fil: ett nytt schema, ett ändrat schema eller ett förslag från dodex-grundschemaanalys eller dodex-bemanningsanalys.

Färdigheten granskar inte regler och räknar inte ekonomi. Ett schema som ska bli fil kontrolleras först med dodex-grundschemaanalys när den finns; resultatet läggs i fliken Granskning.

## Arbetsgång

1. **Samla underlaget en gång** enligt references/underlag.md: enhet, antal veckor, cykliskt eller inte, behov per vardag och helg (dag, kväll, natt), personal med id-kod och sysselsättningsgrad, och för ett färdigt schema passen per person och dag. Använd det som redan finns i samtalet; fråga bara efter det som saknas. Visa underlaget i en tabell och låt användaren bekräfta.
2. **Bygg schemat** om användaren ber dig lägga det: följ reglerna i references/1-regler-och-nivaer.md (dygnsvila 11 h, veckovila 36 h, rast, varannan helg, ingen fredagskväll före ledig helg, block 2–5 dagar, 4,75 pass per vecka på heltid). Lägg dagar först och kvällar sist i ett block. En vakans är bättre än ett regelbrott.
3. **Skapa filerna med kodtolken.** Kör koden i scripts/skapa_schemamall.py (kopiera hela filen till kodtolken om den inte kan läsas direkt) och anropa `skapa(underlag, mapp="/mnt/data")`. Använd bara skriptet, så att layouten blir exakt som i DODEX.
4. **Lämna båda filerna som nedladdning**: `<enhet>.xlsx` och `<enhet>.dodex.json`. Skriv kort vad som finns i dem: antal personer, veckor, vakanta pass, timmar per person mot kontrakt.
5. **Säg hur användaren går vidare**: öppna Excel-filen för att se och ändra, eller öppna `.dodex.json` i DODEX (Mina enheter → Öppna fil) och titta under Regelkontroll. DODEX granskning avgör.

## Regler för innehållet

- Id-koder (A1, N1, F3), aldrig namn. Inga personnummer, löner eller frånvarouppgifter i filerna.
- Celler skrivs som `D 07:00–15:15`, `K 14:00–22:00`, `N 21:45–06:45`; i förskola `T`, `M` och `S`. Tomt är ledigt.
- Ändra inte layouten, flikarnas namn eller färgerna; de ska vara samma som DODEX export.
- Lokala regler kallas aldrig avtalsregler.
- Går skriptet inte att köra: säg det, och lämna schemat som en tabell med samma layout (en rad per person, en kolumn per dag) som kan klistras in i Excel.
