---
name: dodex-helhet
description: Håller ihop Dodex som ett heltäckande verksamhetsdrivet beslutsstöd för hållbar kompetensförsörjning med Partilles mål och ARIBUA. Använd vid analys, kravarbete, bemanningsdimensionering, schemaläggning, ekonomi, verksamhetsutveckling, målkonflikter, AI-funktioner, kodgranskning och uppföljning. Ska förhindra att projektet reduceras till bara scheman och vikariehantering.
---

# Dodex – helhetsfärdighet

## Varför färdigheten finns

**Dodex är inte bara ett schemasystem.** Det ska bli ett sammanhängande verksamhetsdrivet beslutsstöd som förenar behov, kompetens, dimensionering, ekonomi, scenarier, schema, daglig bemanning, uppföljning och lärande för att bidra till **hållbar kompetensförsörjning**.

Vid arbete i GitHub-projektet: läs först `docs/vision-hallbar-kompetensforsorjning.md`, `AGENTS.md`, `CLAUDE.md` och relevanta delar av `ROADMAP.md`, `docs/regelhierarki.md`. Respektera äldre beslut men pröva mot helheten. Om en fil saknas, säg det; hitta inte på dess innehåll.

## Strategiskt ramverk

- Partilles utvecklingsriktning för vård och omsorg: hälsofrämjande och förebyggande vård, hållbar kompetensförsörjning samt innovationsdriven och tillitsbaserad vård och omsorg.
- Kompetensförsörjning: attraktiv arbetsgivare, utbildning och lärande samt ledarskapets förutsättningar.
- **ARIBUA**: Attrahera, Rekrytera, Introducera, Behålla, Utveckla, Avsluta/Avveckla. Det beskriver hela kompetensresan; förväxla inte med det operativa schemaläggningsflödet.
- Tre tidsperspektiv: strategiskt (år), taktiskt (månader/perioder), operativt (veckor/dagar).

Koppla varje större funktion till en eller flera relevanta ARIBUA-delar. Ange om påverkan är direkt, indirekt eller en möjlig långsiktig effekt.

## Demografisk nulägesanalys – börja med faktiskt utfall från SCB

Vid kommunal behovsanalys ska **SCB:s senast publicerade utfall** vara
standardkälla för befolkningens storlek och förändring. Redovisa alltid:
- Folkmängd per ålder/ettårsklass och område där statistiken medger det.
- **Levande födda och avlidna** samt födelseöverskott.
- **Inflyttade och utflyttade** samt flyttningsnetto.
- Flyttningar efter ålder, från/till geografiska områden och inom/utanför
  kommunen där statistik finns och integritetsskyddet tillåter det.
- Tidserie (kvartal och helår) för att skilja korta variationer från trend.
- Datum för senaste statistikperiod, publiceringsdatum, preliminär/slutlig
  status, källa och eventuella korrigeringsposter.

Skilj **observerade händelser**, **befolkningsprognoser** och **beräknat
verksamhetsbehov**. Jämställ aldrig befolkningsökning med en lika stor procentuell
ökning av personal eller insatser. Väg in insatsgrad, servicenivå,
vårdtyngd/komplexitet, politiska beslut, produktivitet, kompetensmix och lokala
bostadsplaner. Lägg inte ihop SCB:s skyddade statistikvärden utan att
redovisa att de kan ha små differenser på grund av röjandekontroll.

Källor:
- SCB befolkningsstatistik: https://www.scb.se/BE0101
- SCB kvartal 1–3, 2026 (exempel på datumstämplad tabell):
  https://www.scb.se/hitta-statistik/statistik-efter-amne/befolkning-och-levnadsforhallanden/befolkningens-sammansattning-och-utveckling/befolkningsstatistik/pong/tabell-och-diagram/folkmangd-och-befolkningsforandringar---manad-kvartal-och-halvar/folkmangd-och-befolkningsforandringar---kvartal-13-2026/

## Sammanhängande arbetsprocess

1. **Behovsanalys:** faktiska och framtida verksamhetsvolymer, aktiviteter, kompetenskrav och timvisa bemanningskurvor.
2. **Kompetens och kapacitet:** tillgänglig kompetens, personalresurser, lärande, introduktion och framtida gap.
3. **Dimensionering och budget:** timmar, årsarbetare, kompetensmix, bemanningsbehov, resurstid och strukturellt budgetgap.
4. **Scenario- och målkonfliktsanalys:** jämför konsekvenser för kvalitet, kontinuitet, arbetsmiljö, kompetensförsörjning och ekonomi.
5. **Schemakonstruktion:** utforma bemannings- och passstruktur först; fördela därefter passen på personer. Skilj denna verksamhetsmetod från OR-Tools-motorns interna två faser.
6. **Beslut och aktivering:** behörigt godkännande, regeltillämpning och oföränderligt grundschema med versionshistorik.
7. **Daglig bemanning:** frånvaro → faktisk täckningsbedömning → intern resurs/omfördelning → vid behov vikarie → bokning och genomförande.
8. **Plan mot utfall och lärande:** analysera avvikelser, faktisk kompetenstäckning, kostnader, kvalitet och återför lärdomarna till nästa analys och kompetensplan.

**Frånvaro är inte automatiskt en vakans. Vakans är inte automatiskt en vikariebeställning.**

## Obligatorisk analysmetod vid idéer, data och utvecklingsförslag

1. Formulera det verkliga verksamhetsproblemet och vilket beslut som behövs.
2. Placera uppdraget i processen; visa vad som påverkas före och efter.
3. Koppla till strategiskt mål och relevanta ARIBUA-steg.
4. Skilj **verksamhetsbehov** från **befintlig kapacitet** och **budget**.
5. Redovisa nuläge, minst ett alternativ om det är möjligt och synliga målkonflikter.
6. Kontrollera hårda gränser: lag, avtal, lokala regelprofiler, säkerhet, integritet och verksamhetskritisk kompetens.
7. Definiera KPI med exakt definition, baslinje, datakälla, period och ansvar för uppföljningen.
8. Föreslå minsta testbara leverans, risker och acceptanskriterier.
9. Dokumentera förväntad nytta, beslut och plan för återföring av faktiskt utfall.

## Målkonfliktsprotokoll

För varje realistiskt alternativ, visa:
- **Förbättras:** vad vinner vi?
- **Försämras:** vem får bära kostnaden eller belastningen?
- **Okänt:** vilka antaganden och osäkerheter finns?
- **Hårda krav:** vilka alternativ är inte tillåtna?
- **Val och ansvar:** vem fattar beslut och med vilken motivering?
- **Effektmått:** hur vet vi senare om beslutet var hållbart?

Visa inte 'bästa schema' som en enda siffra utan att förklara vilken prioritering som ligger bakom. Om problemet inte är lösbart i schemat ska dimensionering, kompetensmix, uppdrag och ekonomiska ramar prövas – inte döljas.

## Standardformat vid större uppdrag

**Problem och nuläge** → **Samband med hela processen** → **ARIBUA och strategisk nytta** → **Alternativ och målkonflikter** → **Relevanta KPI:er** → **Risker och förutsättningar** → **Rekommenderat nästa testbara steg och acceptanskriterier**.

Vid koduppdrag: lägg även till datamodell, API, tester, behörighetskontroll, hantering av historik och vilka funktioner som kan återanvändas. Läs aktuell kod först.

Vid pitch: tala först om verksamhetens problem, sambanden och mänsklig nytta. Beskriv teknik som en möjliggörare, inte som projektets huvudsyfte.

## Sannings- och säkerhetskrav

- Märk tydligt **idé / dokumenterat / implementerat / testat / verksamhetsverifierat / driftgodkänt**. Dessa statusar är inte utbytbara.
- Döp saknade data till **okänt** och antagna belopp till **scenario eller prognos**. Inga påhittade besparingar.
- Tillskriv inte förändringar i personalomsättning eller sjukfrånvaro Dodex utan belägg.
- Lagar, kollektivavtal och fastställda säkerhetskrav får inte mjukas upp av AI.
- Bevara grundschema oförändrat; skilj behov, plan, ändring och utfall.
- Använd enbart syntetiska uppgifter under prototyputveckling.
- Ändra inte `main`, publicera inte, koppla inte in skarp persondata eller externa bokningar utan användarens uttryckliga godkännande.
- Testa nya tekniker och forskningsidéer mot dokumenterad nytta; undvik leverantörslåsning.

## Använd färdigheten så här

- `/dodex-helhet analysera detta bemanningsunderlag och koppla resultatet till ARIBUA`
- `/dodex-helhet föreslå krav för kompetensförsörjningsprognoser`
- `/dodex-helhet granska denna Pull Request: stödjer den helheten eller bara ett delproblem?`
- `/dodex-helhet skriv en pitch för ett verksamhetsdrivet innovationsuppdrag`

**Ledstjärna:** Vi ska inte bara lösa dagens bemanning. Vi ska bli bättre på att förstå och skapa framtidens förutsättningar för rätt kompetens, god kvalitet och ett hållbart arbetsliv.
