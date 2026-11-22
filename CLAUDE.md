# Dodex – styrning för Claude Code

## Börja alltid här

**Läs `docs/vision-hallbar-kompetensforsorjning.md` innan du föreslår större utvecklingssteg.**
Läs också `AGENTS.md`, `docs/regelhierarki.md` och `ROADMAP.md` innan kod ändras.

Dodex är ett **heltäckande stöd för hållbar kompetensförsörjning och bemanningsstyrning**,
inte bara schemaoptimering eller vikariehantering. Behovsanalys, kompetensprognos,
dimensionering, bemanningsekonomi, synliga målkonflikter, schemaoptimering, daglig
bemanning, uppföljning och lärande ska hänga ihop.

**ARIBUA** är Partilles modell för hela kompetensförsörjningsresan: Attrahera, Rekrytera, Introducera, Behålla, Utveckla, Avsluta/Avveckla. Bedöm nya funktioners nytta mot dessa perspektiv, inte bara schema och vikariehantering.

Partilles utvecklingsprogram för vård och omsorg 2026–2035 är relevant som
strategisk inriktning, men Dodex är ännu ett utvecklingsförslag och inte ett
kommunalt beslutat system. Säg aldrig att projektet är godkänt för kommunal drift.

## Återanvändbar färdighet

Projektets gemensamma metod finns i `.claude/skills/dodex-helhet/SKILL.md`.
Använd `/dodex-helhet` för krav, analys, målkonflikter, nyttoanalys och granskning av nya funktioner. Färdigheten kopplar varje del tillbaka till helhetsvision, ARIBUA och uppföljningsbar verksamhetsnytta.

## Bemanningscontroller och handbok

Använd färdigheten `.claude/skills/bemanningscontroller/SKILL.md` för att
analysera hela bemanningsprocessen och identifiera om ett problem uppstår i
behovsanalys, kompetens, dimensionering, schema, daglig planering eller utfall.
Den publika testvyn beskrivs i `docs/bemanningsprocess-regelstod.md`.
Handbok 2.0 är ett arbetsutkast och får inte kopieras till detta offentliga
repo. Äldre lokala rutiner får aldrig bli automatiska hårda regler utan
giltigt beslut, källkontroll och test.

## Innan en ny funktion byggs

1. Redovisa vilken del av hela bemanningsprocessen funktionen stödjer.
2. Redovisa hur den kan bidra till hållbar kompetensförsörjning.
3. Identifiera målkonflikter och vad som måste synliggöras för användaren.
4. Definiera uppföljningsbara utfall och acceptanskriterier.
5. Kontrollera säkerhet, personuppgifter, regelverk och beroenden.
6. Föreslå små förändringar i testgren, inte stora oombedda omskrivningar.

Behåll godkända grundscheman oförändrade och separera fastställd plan,
dagliga planeringshändelser och verkligt utfall. Frånvaro är inte samma
sak som vikariebehov. Lag, avtal och säkerhetskrav ska aldrig göras
förhandlingsbara av en AI-modell.

**Rör inte `main`, slå inte ihop grenar eller publicera utan användarens
uttryckliga godkännande. Använd enbart syntetiska personuppgifter under utveckling.**
