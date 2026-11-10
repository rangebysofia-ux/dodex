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
8. **Låsta regler kan låsas upp.** Dygnsvila, veckovila, rast och varannan helg är låsta som standard, men kan ändras under Regler när användaren bekräftar att det finns ett lokalt avtal eller beslut. Bekräftelsen sparas i `avvikelser` i indata, och avvikelsen visas på alla scheman från enheten. Utan bekräftelse avvisas försvagningen. Beslutat av användaren 2026-11-06. **Ändrat 2026-11-07:** 11 timmars dygnsvila är hård i schemaplaneringen och kan inte låsas upp alls, inte heller med AB:s undantag till 9 timmar (AB 25 § 13 mom. 8 a). Lokalt kollektivavtal om kortare dygnsvila är inte heller möjligt (mom. 10). Veckovila kan låsas upp med lokalt kollektivavtal (mom. 10 e), rasten med kollektivavtal (ATL 15 §, mom. 10 f). Varannan helg kan låsas upp med verksamhetens beslut. Källorna för varje hård regel finns i `docs/styrning/dodex-regelverk.md`.
9. **Minsta passlängd 5 timmar (lokal regel).** Med 4,75 pass per vecka blir passen kortare än 5 timmars arbetstid för den som har under cirka 64 % (heltid 37 h). Då tas pass bort i stället, tills varje pass är minst 5 timmar: antal pass = arbetstid ÷ 5 h, avrundat nedåt. Kontrakterad tid ändras inte. Gäller bara när antal pass räknas fram, inte när det anges för personen. `min_passlangd_minuter` (standard 300, 0 stänger av). Exempel för 4 veckor: 60 % ger 17 pass, 50 % ger 14 pass. Beslutat av användaren 2026-11-06.
10. **Blandning av morgon och kväll varje vecka (princip, mjuk).** Den som arbetar både morgon och kväll ska ha båda sorterna varje vecka, inte till exempel bara kvällar en vecka och bara morgnar nästa. `spridning_kvallar`: "av", "mjuk" (standard, efter rättvisan) eller "stark" (direkt efter vakanserna). `spridning_tolerans` 1 = båda sorterna varje vecka, 0 = dessutom högst en kvälls skillnad mot morgnarna. Fredagsregeln gör ofta helgveckor ensidiga: den som arbetar fredag kväll arbetar kväll hela helgen. Beslutat av användaren 2026-11-06.
11. **Dygnsbrytet föreslås där flest pass slutar och börjar, oftast kring 15 för en heltid. Nattpersonal får eget dygnsbryt.** När verksamheten har bestämt sig låses ett fast klockslag: `dygnsbryt` för dag och kväll och `dygnsbryt_natt` för nattpersonal ("auto" = förslaget). En person kan ha eget `dygnsbryt`. Inställningarna visar förslaget från senaste schemat och en knapp för att låsa det. Granskningen, lättversionens motor och dess granskning följer det fasta värdet. (Färdplan 4, 2026-11-07.)

12. **OB-prognos efter avtalet.** Efter sista kontrollerade OB-nivån (HÖK 25, till och med 2027-03-31) räknas OB upp med 3 % per avtalsår. Det är en prognos för budget, inte avtal, och märks så i gränssnittet. `ob_prognos_procent`, 0 stänger av. Beslutat av användaren 2026-11-06.

13. **Jämn bemanning mellan dag och kväll (princip, mjuk).** Det som blir över eller saknas fördelas efter behovet, jämnt mellan dag- och kvällspass, per vecka och för hela perioden, och jämnt över dagarna: straffet växer med överskottet på ett pass (ungefär kvadratiskt), så +6 på en dag och +2 på en annan väger tyngre än +4 och +4. Vägs ihop med rättvisan mellan personer (rättvisan väger dubbelt). `jamn_bemanning`: "mjuk" (standard) eller "av". Beslutat av användaren 2026-11-06.

14. **Nattpasset är i grunden 9 timmar (princip).** Standardnattpasset är 21:45–06:45 med måltidsuppehåll, så hela passet är arbetstid. Det ger 15 minuters överlämning från kvällspasset (slutar 22:00). Mellan 06:45 och dagpassets start 07:00 finns ingen överlappning. 9 timmar är ett standardvärde, inget tak: en enhet kan ange andra tider i `nattpass`. Beslutat av användaren 2026-11-07.

15. **Aktiviteter under arbetstid (verksamhet).** APT, handledning, utbildning och liknande läggs in på grundschemat med dag, tid och hur många som deltar (antal, andel eller antal gånger per person). Den som deltar arbetar hela aktivitetstiden, så passet läggs om för att täcka tiden; tiden är arbetstid och påverkar passlängd, vila, OB och bemanning. Aktiviteten är ett mjukt mål direkt efter vakanserna: behovet går före, och en aktivitet kan aldrig köpas med ett avtalsbrott. Med `krav` blir den hård och visas i förklaringen när den krockar med andra regler. Deltagarna fördelas rättvist. Deltagare räknas inte på golvet vid klockslag under aktiviteten (`fran_golvet`). Beslutat av användaren 2026-11-07. Typerna är APT, utbildning, möte, studier, dokumentation, handledning och annat; de blir delaktiviteter i passen. Med `minst_pa_golvet` hålls en minsta bemanning på golvet under aktiviteten: de som inte deltar får längre pass. Bristen räknas som vakans (behov). Tillagt av användaren 2026-11-07. **Alla en gång per period (2026-11-08):** med *Alla, fördelat på tillfällena* (`varje_person`) fördelas platserna jämnt på tillfällena, och de första tillfällena får en plats extra när det inte går jämnt ut (13 personer på 2 tillfällen blir 7 och 6). Ingen deltar fler gånger än angivet. Den som har kortare pass (lägre sysselsättning) och därför inte täcker aktivitetstiden får ett längre pass just den dagen. Arbetstiden i perioden ligger kvar inom toleransen, så andra pass blir kortare. Den som ändå inte kan delta, till exempel bara kvällspass och ett möte på förmiddagen, visas under Aktiviteter. Användaren valde att låta systemet fördela i stället för fasta halvor.

16. **Resurstid visas svart.** Det som ligger utöver behovet är resurstid. Per dag och dygnsdel blir så många pass som ligger över behovet resurspass, och de fördelas rättvist mellan personerna (den som har haft minst resurspass först). Resurspassen märks svarta med ◼ R i schemat, personvyn och exporten. Översikten visar antal resurspass, timmar per vecka och fördelningen per person. Resurstiden är svart i bemanningsgrafen och värmekartan och i raden ”I tjänst” (+1). Påverkar inte lösningen, bara visningen. Beslutat av användaren 2026-11-07.

17. **Sammanställning per rad i schemat.** Varje persons rad i schemat visar antal pass, dag-, kvälls- och nattpass, helgdagar, resurspass, aktiviteter, arbetstid, kortaste vila mellan pass och kortaste veckovila för det som visas (en vecka eller hela perioden). Vila under gränsen visas röd. På webben är sammanställningen kolumner till höger i schemat; i telefonen är den en egen tabell under schemat. Påverkar bara visningen. Beslutat av användaren 2026-11-07.

18. **Bemanningsbalans som i Excel-mallen.** Budget i årsarbetare med buffert, bemanningsbehov per dag (pass och jour), personal och övrig arbetstid ger bemanning mot budget och mot personal, per vecka och per period. Räknas som mallen, med de skillnader som står i `docs/bemanningsbalans.md`. Påverkar inte schemaläggningen. Beslutat av användaren 2026-11-07.

19. **Nattpersonal arbetar 34:20 per vecka på heltid.** Standard för personal som bara arbetar natt, om personen inte har egen heltid (`heltid_natt_minuter_per_vecka` 2060). Motsvarar AB 25 § 13 mom. 2 för kontinuerligt treskiftsarbete. Påverkar kontrakterad tid, antal nattpass, bemanningsbalansen och analysen. Beslutat av användaren 2026-11-07.

20. **Veckovilan syns i schemat.** De lediga dagar som ingår i veckans längsta sammanhängande vila märks VV (randigt) med antal timmar på första dagen; verktygstipset visar från och till. Rött om vilan är under 36 h. I schemat, personvyn och telefonen. Påverkar bara visningen. Beslutat av användaren 2026-11-07.

21. **Nattpersonal arbetar högst tre nätter i rad (lokal regel, hård).** Gäller personal som bara arbetar natt. `natt_max_i_rad` (standard 3, 0 stänger av). Det är verksamhetens beslut, inte en avtalsregel. Kontrolleras i motorn, granskningen (NATT_I_RAD) och lättversionen, och visas i förklaringen när den krockar. Beslutat av användaren 2026-11-07.

22. **Nattpersonal: 48 timmars vila mellan nattblocken (lokal regel, mjuk).** `natt_vila_mellan_block_minuter` (standard 2880, 0 stänger av). Med tre nätter i rad, varannan helg och ingen fredagsnatt före ledig helg ryms högst 14 nätter på fyra veckor, men heltid 34:20 med 9-timmarsnätter kräver 15. Därför är vilan mjuk: den eftersträvas direkt efter vakanser och aktiviteter, och bryts bara när schemat annars inte går ihop. Granskningen visar varje brott som något att notera. Beslutat av användaren 2026-11-07.

23. **Tre schemaalternativ.** Ur ett och samma underlag kan tre scheman läggas och jämföras: *medarbetarstyrt* (rättvist: alla så lika som möjligt i kvällar, helger och blandning; önskemål före block och passlängd), *verksamhetsstyrt* (behovet först: det som blir över eller saknas sprids jämnt över dagar och dygnsdelar) och *ekonomistyrt* (lägsta uppskattade OB enligt AB 25 § 21 utan helgdagar: extra pass där OB är lägst). Behovet (vakanser) ligger alltid först och alla hårda regler gäller i alla tre; bara ordningen på de mjuka målen skiljer. `losare.profil` i indata; `PROFILER` i build.py och `PROFIL` i light/motor.js. Lättversionens motor är heuristisk och ger mindre tydliga skillnader. Beslutat av användaren 2026-11-07.

24. **Rörlig starttid för dagpass efter täckningen (ändrar princip 4 när den används).** `morgon_starter`, till exempel `["06:30", "07:30"]`, ger dagpassen fler tillåtna starttider utöver `morgon_start`. Täckningen styrs av behovet vid klockslag (`tidpunkter`, i gränssnittet *Täckning vid klockslag*): motorn väljer en annan start bara när det minskar vakanserna vid ett klockslag, annars den vanliga (en annan start kostar 30 minuter i passlängdsmålet). Standard är en tom lista, alltså fast start som tidigare. Kvällspassen har fortfarande fast slut. Klockslagsvyn visar täckningsgraden. Lättversionen har fast start (den räknar inte behov vid klockslag); granskningen godtar de tillåtna starttiderna. Beslutat av användaren 2026-11-07.

25. **Helst högst tre kvällar i rad (lokal regel, mjuk).** `kvall_max_i_rad` (standard 3, 0 stänger av) för alla som arbetar kväll. Räknas med blocklängden i målordningen. Granskningen visar fler kvällar i rad som något att notera (KVALL_I_RAD). Beslutat av användaren 2026-11-07. **Tillägg:** `kvall_i_rad_typ` "mjuk" (standard) eller "hard". Som hård är regeln en lokal regel (aldrig fler kvällar i rad): motor (regelgrupp KVALL_I_RAD), granskning (brott), förklaring och lättversionen. Kan göra schemat olösbart; förklaringen visar då krocken. Beslutat av användaren 2026-11-07.

26. **Balans mellan behov, arbetsmiljö, budget och kvalitet (princip).** Schemat styrs inte enbart av bemanningsbehovet eller bemanningskurvan, eftersom det inte går ihop. Det ska alltid vara en balans mellan de fyra. Behovet ligger kvar som högsta mjuka nivå (princip 2), och vakanser syns alltid. Men systemet ska visa vad varje schemaalternativ gör för var och en av de fyra (en *balansmall*), så att verksamheten väljer medvetet. Bemanningskurvan från mallen är ett underlag och styr inte schemat. Beslutat av användaren 2026-11-08.

27. **Resurspassen sprids jämnt (princip, mjuk).** Resurstiden ska ligga relativt jämnt över veckans dagar, inte samma dagar varje vecka. Den ska inte heller hamna bara på dagtid, eller bara på kvällstid där den är svår att få ut och blir en kostnad. Det bygger vidare på jämn bemanning (beslut 13). Resurstiden ska planeras in och följas upp, till exempel för att lägga in ledigheter i verksamheten där det finns resurs. Beslutat av användaren 2026-11-08.

28. **Inte medarbetarstyrda scheman fullt ut (princip).** Medarbetarnas önskemål väger in, men verksamheten lägger schemat. Önskemål ligger fortsatt efter behov, regler, block, passlängd och rättvisa (målordningen). Ett medarbetarstyrt alternativ kan jämföras men är inte grunden. Beslutat av användaren 2026-11-08.

29. **Godkänt grundschema är låst.** Ett valt schema godkänns och aktiveras från en måndag. Därefter är det låst: ändringar görs som en ny version som godkänns och aktiveras från ett nytt datum, och tillfälliga ändringar görs i planeringen. I webbtjänsten kan bara en chef, inloggad med eget konto, godkänna. Ett schema med brott mot hårda regler kan inte godkännas. Det godkända schemat visas med guldram och märket ✓ Godkänt. Se `docs/godkant-schema.md`. Beslutat av användaren 2026-11-08. **Ändrat samma dag:** alla inloggade får godkänna och aktivera (chefen hanterar kontona). Det sparas vem som godkände. `SCHEMA_GODKANNARE=chef` begränsar godkännandet till chefer igen.

30. **Team med eget behov och gemensam personal.** En arbetsgrupp kan ha flera team. Varje team har ett eget behov, och varje medarbetare ett hemteam. Personalen är gemensam: där ett team har för få lånas personal in från ett team som har fler. Enhetens behov är summan av teamens. Behovet (vakanser) går först. Därefter, direkt efter aktiviteter och vila mellan nattblock, kommer det mjuka målet att varje team täcks av sin egen personal (`hemteam`). Lån syns i schemat (→T2) och i teamkortet. Se `docs/team.md`. Beslutat av användaren 2026-11-08.

31. **Områden direkt när en enhet skapas.** Guiden frågar om enheten har områden, avdelningar eller team, med namn och färg. Båda sätten ska gå: *ett gemensamt schema* där områdena är team (beslut 30), eller *eget schema per område* där varje område blir en egen enhet under en grupp i organisationen. Personal och behov delas jämnt som ett förslag. Färger är bara för visning och påverkar inte schemaläggningen. Se `docs/team.md`. Beslutat av användaren 2026-11-08.

32. **Organisationen byggs upp utan schema.** Verksamheter, enheter, områden och team, och organisationens aktivitetstyper med namn och färg, läggs upp på sidan Organisation innan något schema läggs. En aktivitet i en enhet får sin typs namn, kategori och färg. Se `docs/organisation.md`. Beslutat av användaren 2026-11-08.

33. **Förskolorna är grunden i verktyget.** De 29 förskolorna med sina avdelningar finns från start under Förskola (avdelningarna som team). Äldreomsorgen avvaktar. Hemtjänstgruppen under Äldreomsorg heter ORDBO. Se `docs/organisation.md`. Beslutat av användaren 2026-11-09.

34. **Kompetensbaserade behov.** En enhet kan kräva minst så många med en kompetens per dag och dygnsdel, till exempel läkemedelsdelegering på kvällen. Kravet är mjukt och ligger direkt efter behovet (vakanser → kompetens → …): motorn väljer vilka som arbetar, gör aldrig behovet sämre och lägger aldrig ett extra pass för kompetensens skull. Det som inte går syns som kompetensvakanser (användarens beslut). Till planeringen hör organisationens kompetenslista, kompetensbalans före schemat, kompetens i schemat och förslag på utbildning. Se `docs/kompetens.md`. Beslutat av användaren 2026-11-09.

35. **Starttider för dagpassen och förskolornas tider.** När behovet läggs in kan man ange hur många av dagpassen som börjar vid varje tid (till exempel 1 kl. 06, 1 kl. 07 och 2 kl. 08), så att hela dagen täcks. Tiderna blir tillåtna starter (som beslut 24). Kravet är mjukt och på samma nivå som behovet: det som saknas blir startvakanser. Förskolornas grundinställning är öppet 06:00–18:00 (`morgon_start` 06:00, `kvall_slut` 18:00). Se `docs/starttider.md`. Beslutat av användaren 2026-11-09.

36. **Regelverk för en enhet.** Tre färdiga regelverk väljs per enhet under Regler: *Dag, kväll och helgrotation* (heltid 37 h, användarens val), *40-timmarsvecka, dagtid mån–fre* (heltid 40 h per helgfri vecka enligt AB 25 § 13 mom. 2, bara dagpass, inga helger, 5 pass per vecka; varannan helg upplåst som synlig avvikelse) och *Funktionsstöd med Bilaga J* (som dag/kväll/helg, och arbetspass och jour i följd enligt AB 25 § 13 mom. 5: högst 20 timmar sammanlagt och minst lika lång vila efteråt). Avtal och lag ändras aldrig. Se `docs/regelverk.md`. Beslutat av användaren 2026-11-09.

37. **Jourpass över dygnet.** Jouren läggs som ett jourpass, till exempel 15:00–08:00 med jour 00:00–06:00: ett pass som belastar två arbetsdagar, räknas in i kvällens och morgonens bemanning, och där hälften av jourtiden räknas som arbetstid. Högst 20 timmar och vilan efteråt minst lika lång (AB 25 § 13 mom. 5). Tiderna och andelen ändras per enhet. Ersätter jour efter kvällspasset med ledig dag efter. Se `docs/regelverk.md`. Beslutat av användaren 2026-11-09.

38. **Extra helgpass per person.** En medarbetare kan få 1–4 extra helgpass per schemaperiod (`extra_helgpass` på personen). Ett extra helgpass är en lördag eller en söndag en ledig helg, högst ett pass per helg. Det ersätter ett pass på en vardag: antalet pass och arbetstiden är desamma. Det är ett undantag från varannan helg (beslut 5b) och görs bara per person. Varannan helg ligger kvar som hård regel, och helgen räknas fortfarande som ledig i växlingen. Ingen fredagskväll före den helgen, som före andra lediga helger. Extrapassen är ett mjukt mål direkt efter team (`extra_helg`): lösaren tar dem bara när de gör schemat bättre för målen före, till exempel färre vakanser, och aldrig fler än personens antal. De syns i schemat som *+ helg*. Beslutat av användaren 2026-11-10.

39. **Förskolans pass: Tidig, Mellan och Sen.** I en förskola anges behovet per avdelning som Tidig (börjar 06:00), Mellan (börjar 08:00) och Sen (slutar vid stängning 18:00), bara vardagar, i stället för dag, kväll och natt. Gränssnittet lägger om det till dagpass med starttider och kvällspass som slutar vid stängning. För förskolan börjar passbytet 09:00 så att Sen kan vara ett helt pass. Inga helger: varannan helg låses upp för förskolan som synlig avvikelse. Regeln *ingen fredagskväll före ledig helg* gäller inte för förskolan, eftersom Sen slutar 18:00 och inte är ett kvällspass. Förskolans personal arbetar 40 timmar i veckan, fem arbetsdagar och två lediga (regelverket 40-timmarsvecka, där Sen ligger kvar), och läggs in på 100 % som standard. Kompetenserna i en förskola är bara förskollärare och pedagog. Se `docs/starttider.md`. Beslutat av användaren 2026-11-10.

Öppna frågor, alltså inte beslutade:
- Ersättning för jour enligt Bilaga J räknas inte än; bilagans text ska kontrolleras mot SKR:s publicering först.
- Om ett kompetenskrav ska kunna väga lika tungt som behovet, så att ett pass kan lämnas vakant för att få in en kompetens på ett annat (i dag: direkt efter behovet, se beslut 34 och `docs/kompetens.md`).
- Om rapportöverlapp mellan morgon och kväll ska vara en regel.
- Om nattpersonalens antal pass ska räknas från nattpassets längd (så gör skillen nu) eller enligt en annan princip.

## Lexikografisk optimering

De mjuka målen löses i ordning, och varje nivå låses innan nästa optimeras:

1. Vakanser (pass per dygnsdel och tidpunkter)
2. Aktiviteter (saknade deltagare, därefter ojämn fördelning mellan personerna)
   – därefter kompetens, vila mellan nattblock, team (hemteam) och extra helgpass (så få som möjligt), se beslut 30, 34 och 38
3. Blocklängd (antal tillfällen med fler än 4 dagar i följd)
4. Passlängd (avvikelse från mållängd per pass och från kontrakterad tid, i minuter)
5. Rättvisa och jämn bemanning (spridning i antal kvälls- och morgonpass mellan personer, vägd dubbelt, plus skillnaden mellan dag och kväll i över- och underbemanning)
6. Spridning (veckor med bara morgnar eller bara kvällar; med inställningen "stark" direkt efter vakanser)
7. Önskemål (viktade brutna önskemål)

Det betyder att en lägre nivå aldrig kan köpas på bekostnad av en högre. Ett femte arbetspass i följd accepteras bara om det är nödvändigt för att undvika en vakans, aldrig för att få jämnare passlängder.

## Växelkurs

När användaren vill väga två mål mot varandra i stället för i strikt ordning, uttryck avvägningen i vakanstimmar: "hellre upp till 2 timmars vakans än att bryta detta". Det är lättare att ta ställning till än abstrakta straffsiffror. Skillen arbetar i strikt ordning; en växelkurs kräver att målen slås ihop till ett, vilket är en ändring i schemamotor/build.py.

## Krav och önskemål

- "Vill", "föredrar", "helst" → önskemål (mjukt).
- "Måste", "kan inte", "får inte" → krav (hårt).
- Fråga när det är oklart. Ett krav som inte går att uppfylla gör hela schemat olösbart, och då pekar schemamotor/explain.py ut det.
- I webbtjänsten läggs schemat ändå när förklaringen pekar ut krav (önskemål eller aktiviteter som måste genomföras): alla krav blir då starka önskemål (vikt 10) och schemat läggs så nära kraven som möjligt. Körningen markeras med vilka krav som krockade, och förklaringen sparas. Avtal, lag och lokala regler släpps aldrig på det sättet. Enhetens egna indata ändras inte. Beslutat 2026-11-07, efter att användaren inte kunde öppna schemat när undantag krockade.
