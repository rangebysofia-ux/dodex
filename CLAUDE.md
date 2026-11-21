# Dodex – styrning för Claude Code

## Börja alltid här

**Läs `docs/vision-hallbar-kompetensforsorjning.md` innan du föreslår större utvecklingssteg.**
Läs också `AGENTS.md`, `docs/regelhierarki.md` och `ROADMAP.md` innan kod ändras.

Dodex är ett **heltäckande stöd för hållbar kompetensförsörjning och bemanningsstyrning**,
inte bara schemaoptimering eller vikariehantering. Behovsanalys, kompetensprognos,
dimensionering, bemanningsekonomi, synliga målkonflikter, schemaoptimering, daglig
bemanning, uppföljning och lärande ska hänga ihop.

Partilles utvecklingsprogram för vård och omsorg 2026–2035 är relevant som
strategisk inriktning, men Dodex är ännu ett utvecklingsförslag och inte ett
kommunalt beslutat system. Säg aldrig att projektet är godkänt för kommunal drift.

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
