# Regelhierarki

## Nivåer

Varje regel har en nivå som anger varifrån den kommer. Nivån avgör hur en avvikelse beskrivs.

| Nivå | Exempel | Typ |
|---|---|---|
| Lag | Rast efter fem timmar | Hård |
| Avtal | Dygnsvila 11 h, veckovila 36 h | Hård |
| Kontrakt | Antal pass per period, kontrakterad arbetstid | Hård |
| Verksamhet | Bemanningsbehov per dygnsdel och tidpunkt | Mjuk, högsta prioritet |
| Lokal regel | Varannan helg, ingen fredagskväll före ledig helg, block 2–5 dagar | Hård |
| Princip | Fönstret 12–18, helst högst 4 dagar i följd, mållängd per pass, rättvis fördelning | Hård eller mjuk |
| Önskemål | Starttider, lediga dagar | Mjuk, eller hård om markerat som krav |

Säg "bryter mot avtalet" bara för nivåerna lag och avtal.

## Verksamhetens beslut

Dessa beslut ligger till grund för skillen. Ändra dem inte utan att fråga användaren.

1. **Behovet avgör** allt som går att ändra. Det är högsta mjuka nivå, inte hårt. När personalen inte räcker blir resultatet en synlig vakans med förklaring, aldrig ett avtalsbrott.
2. **Antal pass väger tyngre än passlängd.** Dag- och kvällspersonal arbetar i snitt 4,75 pass per vecka. Snittlängden följer sysselsättningsgraden, men enskilda pass får variera så länge antal och total tid stämmer.
3. **Passlängden anpassas i fönstret 12–18.** Morgonpass har fast start och rörligt slut, kvällspass har fast slut och rörlig start.
4. **Rast i pass över fem timmars arbetstid** om inget annat anges.
5. **Periodlängd i multiplar av fyra veckor**, eftersom 4,75 × veckor bara då blir ett heltal (19, 38, 57). Vid 6-veckorsperioder anges antal pass per person, till exempel 28 och 29.
6. **Ingen fredagskväll före ledig helg.** Den som är ledig helgen arbetar inte kväll eller natt fredagen innan. Hård lokal regel; kan stängas av med `"ingen_fredagskvall_fore_ledig_helg": false`.
7. **Dygnsbrytet föreslås där flest pass slutar och börjar, oftast kring 15 för en heltid. Nattpersonal får eget dygnsbryt.

Öppna frågor, alltså inte beslutade:
- Hur personer under cirka 51 procent ska hanteras, eftersom 4,75 pass inte ryms i fönstret för dem: färre pass eller kortare kvällspass efter 18.
- Om rapportöverlapp mellan morgon och kväll ska vara en regel.
- Om nattpersonalens antal pass ska räknas från nattpassets längd (så gör skillen nu) eller enligt en annan princip.

## Lexikografisk optimering

De mjuka målen löses i ordning, och varje nivå låses innan nästa optimeras:

1. Vakanser (pass per dygnsdel och tidpunkter)
2. Blocklängd (antal tillfällen med fler än 4 dagar i följd)
3. Passlängd (avvikelse från mållängd per pass och från kontrakterad tid, i minuter)
4. Rättvisa (spridning i antal kvälls- och morgonpass mellan personer)
5. Önskemål (viktade brutna önskemål)

Det betyder att en lägre nivå aldrig kan köpas på bekostnad av en högre. Ett femte arbetspass i följd accepteras bara om det är nödvändigt för att undvika en vakans, aldrig för att få jämnare passlängder.

## Växelkurs

När användaren vill väga två mål mot varandra i stället för i strikt ordning, uttryck avvägningen i vakanstimmar: "hellre upp till 2 timmars vakans än att bryta detta". Det är lättare att ta ställning till än abstrakta straffsiffror. Skillen arbetar i strikt ordning; en växelkurs kräver att målen slås ihop till ett, vilket är en ändring i build_schedule.py.

## Krav och önskemål

- "Vill", "föredrar", "helst" → önskemål (mjukt).
- "Måste", "kan inte", "får inte" → krav (hårt).
- Fråga när det är oklart. Ett krav som inte går att uppfylla gör hela schemat olösbart, och då pekar explain_infeasibility.py ut det.
