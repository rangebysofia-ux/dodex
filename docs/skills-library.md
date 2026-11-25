# DODEX Skills Library – en källa, flera AI-klienter

**Status:** första läsbara prototypen på grenen test. Ingen ändring av schema- eller regelmotor.

## Vad som återanvänds

De fyra redan befintliga och versionshanterade färdigheterna under copilot/ är enda
källan till instruktioner och referensfiler:

- dodex-bemanningsanalys – bemanning, budget, ekonomi, kapacitet och nytta
- dodex-grundschemaanalys – kontroll och analys av ett konkret grundschema
- dodex-schemastod – helhetsprocess och alternativa handlingsvägar
- dodex-schemamall – exportunderlag, Excelmall och enhetsfil

För Codex finns små inläsningsadaptrar under .agents/skills/. De hänvisar till
samma originalfiler och är inte separata regelversioner.

För Claude Code v2.1.331+ tillhandahåller den lokala MCP-servern samma innehåll
via io.modelcontextprotocol/skills (SEP-2640), inklusive references/ och scripts/
som läsbara resurser. Servern exponerar bara tillåtna filer, aldrig personuppgifter,
inloggningsuppgifter, enhetsdata eller verktyg som ändrar schemat.

## Kom igång med Claude Code

1. Öppna terminalen i projektets rot på grenen test.
2. Använd Python 3.11 eller senare (ordinarie Dodex kan fortfarande köras med
   sitt befintliga Python-krav). Installera den valfria integrationen:

       python -m pip install -e ".[mcp]"

3. Registrera servern lokalt för ditt projekt:

       claude mcp add --scope project --transport stdio dodex-skills -- python -m dodexskills.server

4. Starta om Claude Code vid behov. Kontrollera med:

       claude mcp get dodex-skills

   I Claude Codes /-meny ska färdigheterna visas som servernamn:färdighet
   (till exempel dodex-skills:dodex-bemanningsanalys). Godkänn endast
   MCP-servern från den här betrodda projektmappen.

5. Prova exempelvis: "Använd dodex-bemanningsanalys för att jämföra två
   bemanningsalternativ med anonymiserade indata. Visa antaganden och målkonflikter."

Om en MCP-klient ännu inte stöder Skills-extension kan den fortfarande använda
lokala Skill-filer eller läsa GitHub-filerna manuellt. MCP-kompatibilitet är inte
samma sak som fullt stöd för Skills-extension i varje klient.

## Codex

Öppna projektet från dess rot. Codex hittar de fyra adapterfärdigheterna
under .agents/skills/ och läser original-SKILL.md från copilot/ vid behov.
Ingen separat import eller kopiering av verksamhetsreglerna krävs.

## Säkerhetsgräns

- Färdigheter är **instruktioner**, inte kod som får kringgå systemet.
- Endast schemamotor/validate.py avgör regelkontroll, oberoende av
  schemamotor/build.py. Färdigheterna ersätter aldrig dessa kontroller.
- AI-assistenten får föreslå, inte automatiskt godkänna, ändra avtal,
  publicera schema eller skriva till Heroma.
- Avtal och lokala beslut ska spåras till dokumenterad källa och version.
- Använd endast anonymiserade/id-kodade testdata i AI-verktyg.
- MCP-servern är lokal (stdio) och läsbar; inga API-nycklar eller driftkopplingar.
- En senare fjärrserver kräver egen autentisering, behörighetsmodell,
  dataskyddsbedömning och granskningslogg innan den får produktionsdata.

## Test

    python -m pytest -q tests/test_skills_library.py

Kör sedan hela testsuiten före publicering:

    python -m pytest -q

Ändringen går endast till test. Main och publik drift ändras inte utan
användarens uttryckliga publiceringsbeslut.

## Tekniska referenser

- Claude Code Skills: https://code.claude.com/docs/en/skills
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- MCP Python SDK v2 / Skills: https://py.sdk.modelcontextprotocol.io/advanced/skills/
- OpenAI Skills: https://developers.openai.com/plugins/concepts/skills
