# Team i en arbetsgrupp

Användarens beslut 2026-11-08 (beslut 30 i `regelhierarki.md`): en arbetsgrupp kan ha flera mindre team. Personalen är **gemensam**, men varje medarbetare har ett **hemteam**, och varje team har ett **eget behov**.

## Indata

```json
"team": [
  {"id": "T1", "namn": "Team 1", "farg": "#c46a2b", "behov": {"vardag": {"morgon": 2, "kvall": 2}, "helg": {"morgon": 2, "kvall": 1}}},
  {"id": "T2", "namn": "Team 2", "behov": {"vardag": {"morgon": 2, "kvall": 1}}}
],
"personal": [{"id": "A1", "grad": 1, "team": "T1"}, …]
```

- `team[].behov` anges som enhetens `behov`: vardag, helg, alla eller en veckodag, och morgon, kväll och natt.
- **Enhetens behov är summan av teamens.** Gränssnittet räknar fram summan och skriver den till `behov` (`TEAM.summaBehov` i `schemawebb/statisk/team.js`). Indatakontrollen avvisar team vars behov tillsammans är större än enhetens.
- `personal[].team` anger hemteamet. Den som saknar hemteam räknas som gemensam och kan arbeta i alla team.
- `team[].farg` (`#rrggbb`, valfri) är bara för visning. Saknas den får teamet en färg ur paletten efter ordningen (`TEAM.farg`).

## Motorn

- **Behovet (vakanser) går först** och räknas på hela enheten.
- **Mjukt mål `hemteam`**, direkt efter vakanser, aktiviteter och vila mellan nattblock: antal pass där ett team inte täcks av sin egen personal, alltså där någon måste lånas in. Motorn lägger dagarna så att det behövs så få lån som möjligt. Ett lån är alltid bättre än en vakans.
- **Teamfördelningen** (`fordela_team` i `build.py`, `fordelaTeam` i `light/motor.js`): var och en arbetar i sitt hemteam. När ett team har färre än sitt behov lånas först personal utan hemteam in, och sedan från team som har fler än sitt behov. Den som har lånats ut minst går först. Varje pass får `team`. Resultatet får också:
  - `team` och `team_tackning` (per dag, dygnsdel och team: behov, i tjänst, inlånade och saknas),
  - nyckeltalen `team_lan` och `team_saknas`,
  - `team` och `utlanad` per person.
- När ett schema justeras för hand räknas fördelningen om (`justera.py` och lättversionen).

## Granskningen

Granskningen (`validate.py` och `granskning.js`, regel `TEAM`, nivå verksamhet) kontrollerar två saker:
- **Brott:** ett pass hör till ett team som inte finns.
- **Att notera:** ett team har färre än sitt behov ett pass, och då anges om ett annat team hade fler än sitt behov samma pass.

## Områden direkt i guiden

När en ny enhet skapas frågar guiden i första steget: *Finns det områden, avdelningar eller team?* Till exempel Hemtjänst Centrum med fem områden.

- **Nej:** en vanlig enhet.
- **Ja, ett gemensamt schema:** en enhet där områdena blir team med namn och färg. Personalen fördelas på hemområden i tur och ordning, och nattpersonalen bara till områden med nattbehov. Behovet delas jämnt mellan områdena. Båda är förslag som ändras under Team och Medarbetare.
- **Ja, eget schema per område:** gruppen (till exempel Hemtjänst Centrum) skapas i organisationen. Varje område blir en egen enhet under gruppen, med egen färg, sin del av personalen och behovet, och eget schema (`GUIDE.omradesEnheter`). Finns gruppen redan används den.

I första steget väljs också var i organisationen enheten eller gruppen ska ligga (till exempel Äldreomsorg › Hemtjänst).

Inklistrade team ("team 1" …) blir områden i ett gemensamt schema på samma sätt.

## Gränssnittet

- **Team** (en egen flik under Medarbetare i webben och bland flikarna i telefonen): team med färg, namn och behov för vardag och helg, och enhetens summerade behov. Under *Behov* visas summan och arbetstidsgrafen.
- **Medarbetare:** en kolumn för hemteam.
- **Schemat:**
  - teamfilter (Alla, Team 1 …),
  - hemteamet under varje id, i teamets färg,
  - **→T2** i det andra teamets färg på pass där någon är lånad dit.
- **Teamkortet** under schemat och i översikten (`TEAM.tackningKort`): per team behov, egna, inlånade och saknade pass, och vilka som lånades ut.
- **Inklistring:** rubrikrader som "team 1", "Team A", "Lag 2" eller "Arbetslag norr" i personallistan ger team, och personerna under får det som hemteam. Behovet delas jämnt mellan teamen som ett förslag och ändras under Team.

Testfall: `tests/fall/team_behov.json`. Tester: `tests/test_team.py` och `tests/test_omraden.py`.
