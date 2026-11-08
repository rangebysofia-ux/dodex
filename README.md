# Schemasystem för vård och omsorg

Cykliska grundscheman för dygnet runt-verksamhet enligt Kommunals avtalsområde (HÖK/AB), med optimeringslösaren Google OR-Tools CP-SAT.

Systemet har två delar:

- **schemamotor** – lägger, granskar och förklarar scheman. Kan köras från kommandoraden.
- **schemawebb** – webbtjänsten DODEX Scheduler, med inloggning, där man lägger in enheter, personal, behov, önskemål, aktiviteter som APT och regler, lägger schemat, ser resultatet, jämför körningar och exporterar till Excel och PDF. Fungerar i mobilen.


## Så navigerar du

Schemat är navet. När du öppnar en enhet kommer du direkt till det senaste schemat (eller till inställningarna om inget schema finns än). I schemat finns raden **Ändra: Personal, Behov, Önskemål, Aktiviteter, Period** som öppnar inställningarna i en panel ovanpå schemat (på webben) eller som en sida med knappen *‹ Till schemat* (i telefonen), och knappen **🤖 Lägg nytt schema**. Regler och bemanningsbalans har egna sidor.

## Schema light

`light/` är en lättversion som körs helt i webbläsaren, utan server: `motor.js` lägger schemat med en heuristik (simulerad glödgning) i stället för OR-Tools, och `granskning.js` är en fristående översättning av `schemamotor/validate.py`. `python light/bygg.py` sätter ihop `light/schema-light.html`. Samma hårda regler gäller, men lättversionen kan inte bevisa att ett schema är olösbart och saknar behov vid klockslag och delperioder. Lättversionen har samma översikt (nyckeltal och grafer), regelkontroll och simulering som webben: graferna kommer från `schemawebb/statisk/grafer.js` och simuleringen från `light/analys.js`, en översättning av `schemamotor/analys.py`.

## Kom igång på egen dator

```bash
pip install -e ".[dev]"
pytest -q
```

Starta webbtjänsten och öppna http://127.0.0.1:8000:

```bash
uvicorn schemawebb.app:app --port 8000
```

På Windows räcker det att dubbelklicka på `starta-windows.bat` efter installationen. Webbläsaren öppnas av sig själv, och systemet stängs när fönstret stängs.

Utan miljövariabeln `SCHEMA_LOSENORD` krävs ingen inloggning. Sätt alltid ett lösenord när tjänsten nås av andra. Databasen sparas i `./data`.

## Kommandoraden

```bash
python -m schemamotor.balans tests/fall/six_week_basic.json
python -m schemamotor.build tests/fall/six_week_basic.json --ut schema.json --md schema.md
python -m schemamotor.validate tests/fall/six_week_basic.json schema.json
python -m schemamotor.explain tests/fall/wraparound_failure.json
python -m schemamotor.export schema.json --excel schema.xlsx --pdf schema.pdf
```

Efter installationen finns kommandona även som `schema-balans`, `schema-build`, `schema-validate`, `schema-explain`, `schema-compare` och `schema-export`.

## Gränssnittet: DODEX Scheduler

Det första man möter är **Vad vill du göra?**:

- **Skapa ny enhet** öppnar en frågeguide med en fråga i taget: vad gruppen heter, hur många medarbetare (dag och kväll, natt), sysselsättning (samma, olika per person eller en budget som fördelas), undantag (bara dag, bara kväll, natt, andra helger), behovet i veckan (dag, kväll och natt för vardag och helg), tider för passen, och period. Guiden visar hur många timmar behovet motsvarar och hur många som behövs för helgerna. Sist väljer man **🤖 Låt AI lägga schemat** (motorn lägger det) eller **✋ Lägg schemat själv** (ett tomt schema i redigeringsläge, där varje pass granskas direkt; `POST /api/enheter/{id}/manuell`).
- **Klistra in från Excel** – klistra in personal (grad, dag/kväll/natt, helger) och behov (per vardag/helg, veckodag eller pass med tider), se förhandsvisningen och gå vidare i guiden. Namn blir id-koder och sparas aldrig (`docs/inklistring.md`).
- **Få hjälp av AI-assistenten** skapar en tom enhet och öppnar 🤖 med en förifylld fråga. Assistenten föreslår indata som användaren godkänner.
- **Börja från ett exempel** och **Fortsätt med en enhet**.
- **Spara som fil** och **Öppna fil** – en enhet med alla inställningar och färdiga scheman flyttas mellan webben och telefonen (Schema light). Inga inställningar försvinner, och scheman granskas om när filen öppnas (`docs/enhetsfil.md`).

Guiden finns i `schemawebb/statisk/guide.js` och delas med lättversionen.

Webbgränssnittet har en sidomeny med:

- **Översikt** – fyra nyckeltal (bemanningsgrad, personalkostnad, obemannade pass, planerad övertid), bemanningsgrad och kostnad per vecka, behov mot planerad bemanning per dag, passfördelning och en värmekarta över under- och överbemanning.
- **Schemaplanering** – schemat med medarbetare i rader och datum i kolumner, per vecka, hela perioden eller klockslag. Behovet visas i raden längst ned. Med **Redigera schemat** kan pass dras till en annan dag eller person, ändras, läggas till och tas bort. Varje ändring räknas om och granskas direkt, och resultatet sparas som en ny körning; originalet finns kvar (`schemamotor/justera.py`, `POST /api/korningar/{id}/justera`).
- **Bemanningsbehov**, **Medarbetare** – indata, med kontroll och bemanningsbalans vid sidan.
- **Analys och nyckeltal** – graferna och fördelningen per medarbetare.
- **Simulering** – konsekvensanalysen nedan, med kostnad och nuläge mot alternativ.
- **Regelkontroll** – den fristående granskningen grupperad per regel.
- **Rapporter** – Excel, PDF, utskrift och jämförelse av körningar.
- **Inställningar** – regler, period, budget och timkostnad, samt indata som JSON.

Personalkostnaden är en uppskattning: schemalagd tid × `timkostnad_kr` (lön och PO, utan OB) plus OB enligt AB 25 § 21, räknat på verkliga datum från `startdatum`. Tryck på en person för hela schemat med timmar, OB per kategori och kostnad per period och år. Personvyn visar också vilan: kortaste vila mellan två pass (dygnsvila, minst 11 h) och längsta lediga tid varje vecka (veckovila, minst 36 h), och Regelkontrollen har samma siffror för alla. Se `docs/ob.md`.

## Konsekvensanalys

Sidan Simulering tar fram bemanningsförslag utifrån en budget, lägger ett schema för vart och ett och jämför vakanser, överkapacitet, helgbemanning, timmar mot budget och blandning av morgon och kväll. Se `docs/analys.md`.

## Schemaassistent

En assistent (knappen Fråga) svarar på frågor om schemat och föreslår ändringar som du godkänner. På datorn behövs en API-nyckel från Anthropic, se `docs/assistent.md`. I lättversionen fungerar den direkt via Claude-kontot.

## Driftsättning

Se `docs/drift.md` för hur tjänsten läggs på Render med lösenord och sparad databas.

## Dokumentation

- `docs/regelhierarki.md` – vilka regler som gäller och i vilken ordning de väger
- `docs/styrning/lathund-arbetstid.md` – lathund om dygnsvila, veckovila, rast, arbetstid, fridagar, övertid, förskjuten arbetstid, semester och OB, med paragrafer i AB 25
- `docs/styrning/dodex-regelverk.md` och `.json` – alla hårda regler och mjuka mål med standardvärden, som styrdokument för andra system (genereras med `python -m schemamotor.regelverk`)
- `docs/avtal-regler.md` – vila, rast och dygnsbryt
- `docs/indata-schema.md` – format för indata och schema
- `docs/godkant-schema.md` – godkänt och aktiverat schema, konton och roller (chef, schemaläggare)
- `docs/balansmall.md` – balansmallen: schemat i fyra perspektiv (behov, arbetsmiljö, budget, kvalitet)
- `docs/inklistring.md` – vad som går att klistra in för personal och behov
- `docs/enhetsfil.md` – filen som flyttar en enhet mellan webben och telefonen
- `docs/optimering.md` – hur modellen fungerar
- `docs/hallbarhet.md`, `docs/ekonomi.md` – hur resultatet värderas
- `docs/drift.md` – driftsättning, lösenord, säkerhetskopior
- `ROADMAP.md` – vad som ska byggas härnäst
