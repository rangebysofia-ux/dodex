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
5. **Periodlängd.** 4,75 × veckor blir ett heltal vid 4, 8 och 12 veckor (19, 38, 57 pass). Vid andra längder, till exempel 6 veckor (28,5), får dag- och kvällspersonalen utan angivet antal pass växelvis avrundat nedåt och uppåt i den ordning de står: 28, 29, 28, 29 … Antal pass kan fortfarande anges per person. Beslutat av användaren 2026-11-06.
6. **Ingen fredagskväll före ledig helg.** Den som är ledig helgen arbetar inte kväll eller natt fredagen innan. Hård lokal regel; kan stängas av med `"ingen_fredagskvall_fore_ledig_helg": false`.
7. **Varannan helg är hård för enheten.** Alla arbetar exakt varannan helg i fasta grupper (A och B). Enhetens standard kan inte ändras. Undantag görs bara per person (helgfrekvens 1/4, 3/4, alla eller ingen), till exempel när kontraktet säger något annat, och visas som undantag i gränssnittet. Beslutat av användaren 2026-11-05.
8. **Låsta regler kan låsas upp.** Dygnsvila, veckovila, rast och varannan helg är låsta som standard, men kan ändras under Regler när användaren bekräftar att det finns ett lokalt avtal eller beslut. Bekräftelsen sparas i `avvikelser` i indata, och avvikelsen visas på alla scheman från enheten. Utan bekräftelse avvisas försvagningen. Beslutat av användaren 2026-11-06.
9. **Minsta passlängd 5 timmar (lokal regel).** Med 4,75 pass per vecka blir passen kortare än 5 timmars arbetstid för den som har under cirka 64 % (heltid 37 h). Då tas pass bort i stället, tills varje pass är minst 5 timmar: antal pass = arbetstid ÷ 5 h, avrundat nedåt. Kontrakterad tid ändras inte. Gäller bara när antal pass räknas fram, inte när det anges för personen. `min_passlangd_minuter` (standard 300, 0 stänger av). Exempel för 4 veckor: 60 % ger 17 pass, 50 % ger 14 pass. Beslutat av användaren 2026-11-06.
10. **Blandning av morgon och kväll varje vecka (princip, mjuk).** Den som arbetar både morgon och kväll ska ha båda sorterna varje vecka, inte till exempel bara kvällar en vecka och bara morgnar nästa. `spridning_kvallar`: "av", "mjuk" (standard, efter rättvisan) eller "stark" (direkt efter vakanserna). `spridning_tolerans` 1 = båda sorterna varje vecka, 0 = dessutom högst en kvälls skillnad mot morgnarna. Fredagsregeln gör ofta helgveckor ensidiga: den som arbetar fredag kväll arbetar kväll hela helgen. Beslutat av användaren 2026-11-06.
11. **Dygnsbrytet föreslås där flest pass slutar och börjar, oftast kring 15 för en heltid. Nattpersonal får eget dygnsbryt.

12. **OB-prognos efter avtalet.** Efter sista kontrollerade OB-nivån (HÖK 25, till och med 2027-03-31) räknas OB upp med 3 % per avtalsår. Det är en prognos för budget, inte avtal, och märks så i gränssnittet. `ob_prognos_procent`, 0 stänger av. Beslutat av användaren 2026-11-06.

13. **Jämn bemanning mellan dag och kväll (princip, mjuk).** Det som blir över eller saknas fördelas efter behovet, jämnt mellan dag- och kvällspass, per vecka och för hela perioden, och jämnt över dagarna: straffet växer med överskottet på ett pass (ungefär kvadratiskt), så +6 på en dag och +2 på en annan väger tyngre än +4 och +4. Vägs ihop med rättvisan mellan personer (rättvisan väger dubbelt). `jamn_bemanning`: "mjuk" (standard) eller "av". Beslutat av användaren 2026-11-06.

Öppna frågor, alltså inte beslutade:
- Om rapportöverlapp mellan morgon och kväll ska vara en regel.
- Om nattpersonalens antal pass ska räknas från nattpassets längd (så gör skillen nu) eller enligt en annan princip.

## Lexikografisk optimering

De mjuka målen löses i ordning, och varje nivå låses innan nästa optimeras:

1. Vakanser (pass per dygnsdel och tidpunkter)
2. Blocklängd (antal tillfällen med fler än 4 dagar i följd)
3. Passlängd (avvikelse från mållängd per pass och från kontrakterad tid, i minuter)
4. Rättvisa och jämn bemanning (spridning i antal kvälls- och morgonpass mellan personer, vägd dubbelt, plus skillnaden mellan dag och kväll i över- och underbemanning)
5. Spridning (veckor med bara morgnar eller bara kvällar; med inställningen "stark" direkt efter vakanser)
6. Önskemål (viktade brutna önskemål)

Det betyder att en lägre nivå aldrig kan köpas på bekostnad av en högre. Ett femte arbetspass i följd accepteras bara om det är nödvändigt för att undvika en vakans, aldrig för att få jämnare passlängder.

## Växelkurs

När användaren vill väga två mål mot varandra i stället för i strikt ordning, uttryck avvägningen i vakanstimmar: "hellre upp till 2 timmars vakans än att bryta detta". Det är lättare att ta ställning till än abstrakta straffsiffror. Skillen arbetar i strikt ordning; en växelkurs kräver att målen slås ihop till ett, vilket är en ändring i schemamotor/build.py.

## Krav och önskemål

- "Vill", "föredrar", "helst" → önskemål (mjukt).
- "Måste", "kan inte", "får inte" → krav (hårt).
- Fråga när det är oklart. Ett krav som inte går att uppfylla gör hela schemat olösbart, och då pekar schemamotor/explain.py ut det.
