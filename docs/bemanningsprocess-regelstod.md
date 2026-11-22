# Bemanningsprocess & regelstöd – pilot i Dodex

**Status:** första läsbara och interaktiva demonstrationsmodulen.
**Plats i gränssnittet:** menyn **Bemanningsprocess & regelstöd**.
**Integrerad färdighet:** \`.claude/skills/bemanningscontroller/SKILL.md\`.
**Huvudvision:** \`docs/vision-hallbar-kompetensforsorjning.md\`.

## Varför modulen finns

2022 års bemanningshandbok skiljer på strategisk planering,
schemaprocess och operativ planering. Det reviderade arbetsutkastet
Bemanningshandbok 2.0 utvecklar sambandet mellan behov, kapacitet,
kompetens, budget, ÖS, schema, daglig bemanning, uppföljning och ARIBUA.

Modulen ska vara en sökbar struktur som kan kopplas till Dodex olika
funktioner och till Bemanningscontroller som analysmetod. Den är **inte**
ett nytt godkänt kommunalt styrdokument.

## Det som fungerar i version 1

- Åtta processteg med controllerfråga, underlag, förväntat resultat,
  typiska roller och relation till ARIBUA.
- En offentlig, sökbar regelkatalog med filter och källstatus.
- Officiella källänkar för arbetstid/avtal, där sådana finns.
- Navigering till relevanta befintliga Dodex-vyer när en enhet är vald.
- En enkel **lokal** beräkning av aggregerade behovs-, kapacitets-,
  budget- och utfallstimmar. Uppgifter skickas inte till servern och sparas
  inte. Kompetens bedöms kvalitativt, inte automatiskt av denna kalkyl.
- En Claude Code-färdighet som strukturerar controlleranalys,
  regelstatus, målkonflikter och uppföljning.

Regelkatalogen ligger i \`schemawebb/statisk/regelstod_data.js\` och den
interaktiva vyn i \`schemawebb/statisk/process_regelstod.js\`.

## Viktiga begränsningar

- **Inga interna PDF/DOCX-filer är incheckade.** GitHub-projektet är
  offentligt. Den äldre handboken och Bemanningshandbok 2.0 ska bara
  hanteras i en behörighetsstyrd kontext efter godkänt delningsbeslut.
- ÖS, lokala rutiner och tidsfrister från 2022 är endast historiska
  referenser tills Partille bekräftar vad som gäller.
- Dygnsvila, veckovila, 4,75, rast, jour och andra avtal är
  markerade för verifiering mot aktuell central och lokal tillämpning.
- Sökning visar *dokumentationsposter*. Den förändrar inga
  hårda regler i schemamotor eller validate.py.
- Räkneexemplet är inte fullständig bemanningsdimensionering,
  kompetenskontroll, faktisk regelgranskning eller skarp
  ekonomisk uppföljning.
- Ingen koppling till Heroma, kommunens interna personregister eller
  skarp bokning. Ingen automatisk bevakning av avtal ännu.

## Regelregister: nästa utvecklingssteg

En produktionsduglig lösning behöver lagra:
\`regel_id\`, \`regeltext\`, \`klassning\`, \`kalla\`, \`kallversion\`,
\`giltig_fran\`, \`giltig_till\`, \`avtalsomrade\`, \`verksamhet\`,
\`lokalt_beslut\`, \`status\`, \`verifierad_av\`, \`verifierad_datum\`,
\`motor_regel_id\`, \`forvaltning\` och \`auditlogg\`.
Därefter måste behörigheter, källuppdatering, sökning, granskning,
godkännande och olika versioner finnas innan ett regelbyte kan påverka
schemagenerering eller den oberoende valideringen.

AI får föreslå tolkningar och förbättringar, men får inte ändra regler
eller hantera avtalsundantag utan behörigt godkännande.

## Tester

    node --check schemawebb/statisk/regelstod_data.js
    node --check schemawebb/statisk/process_regelstod.js
    node --test tests/process_regelstod.test.cjs

Testerna innehåller bara fiktiva, aggregerade tal.
Den fullständiga Python-testsviten måste också kontrolleras innan
sammanfogning och eventuell publicering.

## Användning och nästa prioritet

1. Testa sökning, källänkar, lokala/historiska statusar och controllerkalkylen.
2. Verifiera de konkreta avtals- och ÖS-reglerna med HR/ansvarig beslutsfunktion.
3. Definiera behörighetsstyrd dokumentförvaring samt beslut om
   innehållet får göras tillgängligt i appen.
4. Bygg strukturerade, versionsstyrda regler med säkra kopplingar
   till den befintliga schemamotorn och dess oberoende granskare.
5. Utöka controllern med verksamhetsspecifik behovskurva,
   kompetens- och kostnadsanalys samt dokumenterade beslut
   och systematisk uppföljning.

**Ingen merge till test eller main utan granskning och användarens beslut.**
