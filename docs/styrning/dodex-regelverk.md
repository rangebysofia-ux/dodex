# DODEX Scheduler – regelverk för schemamotorn

Version 2026-11-07. Genererat från schemamotor/build.py (STANDARDREGLER, MALORDNING), light/motor.js och schemawebb/statisk/ob.js med python -m schemamotor.regelverk.

Cykliska grundscheman i dygnet runt-verksamhet inom äldreomsorg och funktionsstöd, Kommunal (HÖK/AB).

## Principer

- Hårda regler får aldrig brytas. Behovet är högsta mjuka nivå: en vakans är bättre än ett avtalsbrott.
- Mjuka mål optimeras i strikt ordning (lexikografiskt); ett lägre mål kan aldrig försämra ett högre.
- Låsta regler (dygnsvila, veckovila, rast, varannan helg) kan bara ändras när användaren bekräftar att villkoren i källan är uppfyllda. Bekräftelsen sparas i 'avvikelser' och visas på alla scheman. 11 timmars dygnsvila är hård och kan inte låsas upp alls (AB 25 § 13 mom. 8; verksamhetens beslut 2026-11-07).
- Varje hård regel anger sin källa (AB 25, ATL, kontrakt eller lokalt beslut) och vilken avvikelse källan tillåter.
- Lokala regler (varannan helg, block 2–5 dagar, 4,75 pass per vecka) kallas aldrig avtalsregler.
- Ett färdigt schema granskas av en fristående kontroll som inte delar kod med motorn.
- Personal anges med id-koder, aldrig namn.

## Nivåer

| Nivå | Innebörd |
|---|---|
| lag | Arbetstidslagen. Får aldrig brytas. |
| avtal | Centralt kollektivavtal (HÖK/AB, Kommunal). Får aldrig brytas; avvikelse kräver lokalt kollektivavtal. |
| kontrakt | Löften till medarbetaren: sysselsättningsgrad, arbetstid och antal pass. |
| verksamhet | Bemanningsbehovet. Högsta mjuka nivå: hellre en synlig vakans än ett regelbrott. |
| lokal regel | Verksamhetens egna beslut. Kallas aldrig avtal. |
| princip | Planeringsprinciper för hur schemat ska se ut. |
| önskemål | Enskilda medarbetares önskemål. Mjuka, eller hårda om de markeras som krav. |

## Hårda regler

Måste alltid uppfyllas.

| Id | Regel | Nyckel | Standard | Enhet | Nivå | Låst | Beskrivning |
|---|---|---|---|---|---|---|---|
| DYGNSVILA | Dygnsvila | `dygnsvila_minuter` | 660 | minuter (minst 660, kan inte låsas upp) | avtal | ja | Minst så lång sammanhängande vila per 24-timmarsperiod, räknat från dygnsbrytet. Kontrolleras även över skarven mellan sista och första veckan. |
| DYGNSBRYT | Dygnsbryt | `dygnsbryt` | auto | klockslag eller auto | avtal | nej | Var 24-timmarsperioden börjar för dag- och kvällspersonal. 'auto' = där flest pass slutar och börjar; ett klockslag när verksamheten har bestämt sig. |
| DYGNSBRYT_NATT | Dygnsbryt för nattpersonal | `dygnsbryt_natt` | auto | klockslag eller auto | avtal | nej | 'auto' = där nattpassen oftast slutar; ett klockslag när verksamheten har bestämt sig. En person kan också ha eget dygnsbryt. |
| VECKOVILA | Veckovila | `veckovila_minuter` | 2160 | minuter | avtal | ja | Minst så lång sammanhängande vila per sjudagarsperiod, räknat från veckobrytet. |
| VECKOBRYT | Veckobryt | `veckobryt` | mån 00:00 | veckodag och klockslag | avtal | nej | Var sjudagarsperioden för veckovila börjar. |
| RAST_GRANS | Rast efter högst | `rast_grans_minuter` | 300 | minuter | lag | ja | Längsta arbetstid utan rast. |
| RAST_LANGD | Rastens längd | `rast_minuter` | 30 | minuter | lag | ja | Rast i pass över gränsen. Nattpass med måltidsuppehåll har ingen rast. |
| HELGFREKVENS | Helgfrekvens för enheten | `helgfrekvens` | 2/4 | andel helger | lokal regel | ja | Varannan helg i fasta grupper A och B. Låst för enheten; undantag bara per person (1/4, 3/4, alla, ingen). |
| HEL_HELG | Arbetshelg är både lördag och söndag | `hel_helg` | på | på/av | lokal regel | nej |  |
| HELG_START | Helgen börjar | `helg_start` | fre 22:00 | veckodag och klockslag | lokal regel | nej |  |
| HELG_SLUT | Helgen slutar | `helg_slut` | mån 06:00 | veckodag och klockslag | lokal regel | nej |  |
| FREDAGSKVALL | Ingen fredagskväll före ledig helg | `ingen_fredagskvall_fore_ledig_helg` | på | på/av | lokal regel | nej | Den som är ledig helgen arbetar inte kväll eller natt fredagen innan. |
| PASS_PER_VECKA | Pass per vecka, dag och kväll | `pass_per_vecka` | 4,75 | pass per vecka | lokal regel | nej | Antal pass = värdet × veckor. Blir det inte ett heltal (28,5 på 6 veckor) får dag- och kvällspersonal utan angivet antal växelvis avrundat nedåt och uppåt i den ordning de står (28, 29, 28 …). Antal pass kan anges per person. |
| MIN_PASSLANGD | Minsta passlängd | `min_passlangd_minuter` | 300 | minuter | lokal regel | nej | Blir passen kortare än så vid låg sysselsättningsgrad tas pass bort i stället: antal pass = arbetstid ÷ minsta längd, avrundat nedåt. 0 stänger av. |
| BLOCK_MIN | Minst arbetsdagar i följd | `block_min` | 2 | dagar | lokal regel | nej | Inga enstaka arbetsdagar. |
| BLOCK_MAX | Högst arbetsdagar i följd | `block_max` | 5 | dagar | lokal regel | nej |  |
| NATT_I_RAD | Nattpersonal: högst nätter i rad | `natt_max_i_rad` | 3 | nätter | lokal regel | nej | Gäller personal som bara arbetar natt. 0 stänger av. |
| TOLERANS | Tolerans för arbetstid mot kontrakt | `tolerans_minuter` | 60 | minuter per period | kontrakt | nej | Nattpersonal: minst ett halvt nattpass. |
| MORGON_START | Dagpass börjar | `morgon_start` | 07:00 | klockslag | princip | nej | Fast start; slutet anpassas. |
| MORGON_STARTER | Dagpass får också börja | `morgon_starter` | [] | klockslag | princip | nej | Rörlig start efter täckningen vid klockslag. Motorn väljer en annan start än den vanliga bara när behovet kräver det. Tom lista = fast start. |
| KVALL_SLUT | Kvällspass slutar | `kvall_slut` | 22:00 | klockslag | princip | nej | Fast slut; starten anpassas. |
| PASSBYTE_FRAN | Passbyte tidigast | `kant_fran` | 12:00 | klockslag | princip | nej | Dagpassets slut och kvällspassets start ligger i fönstret. |
| PASSBYTE_TILL | Passbyte senast | `kant_till` | 18:00 | klockslag | princip | nej |  |
| STEG | Steg för passlängder | `steg_minuter` | 15 | minuter | princip | nej |  |
| LANGD_BAND | Största avvikelse från personens snittlängd | `langd_band_minuter` | 120 | minuter | princip | nej |  |
| HELTID | Heltid | `heltid_minuter_per_vecka` | 2220 | minuter per vecka | kontrakt | nej |  |
| HELTID_NATT | Heltid för nattpersonal | `heltid_natt_minuter_per_vecka` | 2060 | minuter per vecka (34:20) | kontrakt | nej | Gäller personal som bara arbetar natt och inte har egen heltid angiven. |
| NATTPASS | Nattpass | `nattpass` | 21:45–06:45 | klockslag | princip | nej | Med måltidsuppehåll är hela passet arbetstid (ingen rast). |
| BERAKNINGSPERIOD | Schemaperiod (beräkningsperiod) | `veckor` | 4 | veckor, högst 16 | avtal | nej | Kontrolleras i indata: 1–16 veckor. |
| ARBETSTID_48 | Högst 48 timmar per vecka i snitt under 4 veckor | – | 2880 | minuter per vecka i snitt | avtal | ja | Kontrolleras inte separat. Uppfylls när arbetstiden följer kontraktet (högst heltid) och högst 5 arbetsdagar i följd. |
| SCHEMA_14_DAGAR | Schemat meddelas 14 dagar innan | – | 14 | dagar | avtal | ja | Utanför schemamotorn: verksamhetens ansvar när schemat publiceras. |
| KRAV | Önskemål markerade som krav | `onskemal[].krav` | av | per önskemål | önskemål | nej | Kan göra schemat olösbart; förklaringen pekar då ut kravet. |
| AKTIVITET | Aktiviteter markerade som krav | `aktiviteter[].krav` | av | per aktivitet | verksamhet | nej | Den som deltar arbetar hela aktivitetstiden. Kan göra schemat olösbart; förklaringen pekar då ut aktiviteten. |

### Koppling till AB 25 och ATL

Källa och tillåten avvikelse för varje hård regel. Kontrollerat mot AB 25 i lydelse 2025-04-01 (SKR).

| Id | Källa | Avvikelse |
|---|---|---|
| DYGNSVILA | AB 25 § 13 mom. 8 (minst 11 timmars sammanhängande ledighet per 24 timmar) och mom. 5 (arbete och dygnsvila alternerande); ATL 13 §. | Ingen. 11 timmar är hård i schemaplaneringen och kan inte låsas upp (verksamhetens beslut 2026-11-07). Lokalt kollektivavtal om kortare dygnsvila är inte möjligt (AB 25 § 13 mom. 10). AB:s undantag till lägst 9 timmar vid särskilda skäl (mom. 8 a) används inte i planeringen. |
| DYGNSBRYT | AB 25 § 13 mom. 5: klockslaget när 24-timmarsperioden för dygnsberäkning inleds ska framgå av schemat. | – |
| DYGNSBRYT_NATT | AB 25 § 13 mom. 5: klockslaget när 24-timmarsperioden inleds ska framgå av schemat; nattpersonal kan ha ett eget. | – |
| VECKOVILA | ATL 14 § (36 timmars sammanhängande ledighet per sjudagarsperiod); AB 25 § 13 mom. 7 h. | Lokalt kollektivavtal om avvikelse (AB 25 § 13 mom. 10 e). Vid tillfällig avvikelse minst 24 timmar (mom. 7 h). |
| VECKOBRYT | ATL 14 § (sjudagarsperiod). | – |
| RAST_GRANS | ATL 15 § (rast senast efter fem timmars arbete); AB 25 § 13 mom. 7 a. | Kollektivavtal om förläggning av raster (AB 25 § 13 mom. 10 f). Vid nattarbete får rast bytas mot måltidsuppehåll (mom. 7 a). |
| RAST_LANGD | ATL 15 §. | Kollektivavtal. |
| HELGFREKVENS | Lokalt beslut i verksamheten, inte AB (beslutat 2026-11-05). | Låst för enheten. Undantag bara per person (helgfrekvens 1/4, 3/4, alla eller ingen), synligt som undantag. |
| HEL_HELG | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| HELG_START | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| HELG_SLUT | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| FREDAGSKVALL | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| PASS_PER_VECKA | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| MIN_PASSLANGD | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| BLOCK_MIN | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| BLOCK_MAX | Lokalt beslut i verksamheten, inte AB. | Verksamheten kan ändra regeln för enheten. |
| NATT_I_RAD | Verksamhetens beslut 2026-11-07 (lokal regel, inte avtal). | Verksamheten kan ändra. |
| TOLERANS | Kontrakt: arbetstiden ska motsvara anställningens omfattning. | Per person (tolerans_minuter). |
| MORGON_START | Planeringsprincip. | Verksamheten kan ändra. |
| MORGON_STARTER | Planeringsprincip; användarens beslut 2026-11-07 (rörlig start efter täckningen). | Verksamheten kan ändra. |
| KVALL_SLUT | Planeringsprincip. | Verksamheten kan ändra. |
| PASSBYTE_FRAN | Planeringsprincip. | Verksamheten kan ändra. |
| PASSBYTE_TILL | Planeringsprincip. | Verksamheten kan ändra. |
| STEG | Planeringsprincip. | Verksamheten kan ändra. |
| LANGD_BAND | Planeringsprincip. | Verksamheten kan ändra. |
| HELTID | Kontrakt eller lokalt beslut. Centralt i AB 25 § 13 mom. 2: 40 timmar per helgfri vecka; 38 timmar 15 minuter när arbetstiden är förlagd både vardag och sön- eller helgdag; 34 timmar 20 minuter vid kontinuerligt treskift; 36 timmar 20 minuter vid intermittent treskift. Standardvärdet 37 timmar är inte AB:s centrala nivå. | Anges per enhet eller person. |
| HELTID_NATT | AB 25 § 13 mom. 2: 34 timmar 20 minuter per vecka vid kontinuerligt treskiftsarbete. Används för nattpersonal (verksamhetens beslut 2026-11-07). | Annan heltid anges för enheten eller per person. |
| NATTPASS | AB 25 § 13 mom. 7 a (rast får bytas mot måltidsuppehåll vid nattarbete) och mom. 7 j (nattpass = minst 3 timmar ordinarie arbetstid mellan kl. 22 och 06). | Verksamheten bestämmer tiderna. |
| BERAKNINGSPERIOD | AB 25 § 13 mom. 7 g: en beräkningsperiod kan omfatta högst 16 veckor. | Lokalt kollektivavtal om längre period, högst ett år (mom. 10). |
| ARBETSTID_48 | Anmärkning till AB 25 § 13 mom. 7 g: ordinarie arbetstid högst 48 timmar per vecka i genomsnitt under 4 veckor. | Lokalt kollektivavtal (mom. 10). |
| SCHEMA_14_DAGAR | AB 25 § 13 mom. 5: schemat ska meddelas arbetstagaren senast 14 dagar innan det börjar gälla. | – |
| KRAV | Medarbetarens önskemål som verksamheten har gjort till krav. | – |
| AKTIVITET | Verksamhetens beslut (till exempel APT enligt lokal samverkan). Aktiviteten är arbetstid. | – |

## Mjuka mål

Optimeras i den här ordningen. Ett lägre mål kan aldrig försämra ett högre.

| Ordning | Mål | Nivå | Styrs av | Standard | Hur det räknas |
|---|---|---|---|---|---|
| 1 | Vakanser | verksamhet | – | – | Antal pass och klockslag där behovet inte täcks. Högsta mjuka nivå: behovet görs aldrig hårt. |
| 2 | Aktiviteter under arbetstid | verksamhet | – | – | Saknade deltagare i aktiviteter som APT, därefter ojämn fördelning mellan personerna. Deltagarna arbetar hela aktivitetstiden. Aktiviteter markerade som krav är hårda. |
| 3 | Nattpersonal: vila mellan nattblock | lokal regel | `natt_vila_mellan_block_minuter` | 2880 | Antal gånger vilan mellan två nattblock är kortare än gränsen (2880 = 48 h, minst två lediga nätter). Mjuk: bryts bara när schemat annars inte går ihop. Verksamhetens beslut 2026-11-07. |
| 4 | Team: täckning med egen personal | verksamhet | – | – | När arbetsgruppen har team med eget behov: antal pass där ett team inte täcks av sin egen personal, så att någon måste lånas in från ett annat team. Lån är tillåtet; behovet går före. Verksamhetens beslut 2026-11-08. |
| 5 | Dagar i följd över rekommenderat | princip | `block_rekommenderat` | 4 | Antal tillfällen med fler arbetsdagar i följd än rekommenderat. |
| 6 | Passlängd | princip | – | – | Minuter från personens snittlängd per pass och från kontrakterad tid. |
| 7 | Rättvisa och jämn bemanning | princip | `jamn_bemanning` | mjuk | 2 × rättvisa (skillnad i antal kvälls- och morgonpass mellan personer som arbetar båda) + jämn bemanning (över- och underbemanning lika mellan dag och kväll per vecka och för perioden, och ett växande straff för överskott på ett enskilt pass, ungefär kvadratiskt). |
| 8 | Blandning av morgon och kväll varje vecka | princip | `spridning_kvallar` | mjuk | Veckor med bara morgnar eller bara kvällar för den som arbetar båda. 'stark' flyttar målet direkt efter vakanserna; spridning_tolerans 0 = dessutom högst en kvälls skillnad mot morgnarna. |
| 9 | Önskemål | önskemål | – | – | Viktade brutna önskemål (vikt 1–10). Önskemål markerade som krav är hårda. |

### Inställningar för de mjuka målen

| Nyckel | Namn | Värden | Standard |
|---|---|---|---|
| `kvall_max_i_rad` | Högst antal kvällar i rad (mjukt räknas med blocklängden) | kvällar; 0 stänger av | 3 |
| `kvall_i_rad_typ` | Kvällar i rad: mjuk eller hård | 'mjuk' (eftersträvas) eller 'hard' (lokal regel, regelgrupp KVALL_I_RAD) | mjuk |
| `natt_vila_mellan_block_minuter` | Nattpersonal: vila mellan nattblock | minuter (2880 = 48 h); 0 stänger av | 2880 |
| `block_rekommenderat` | Helst högst antal dagar i följd | dagar | 4 |
| `jamn_bemanning` | Jämn bemanning mellan dag och kväll | 'mjuk' (på) eller 'av' | mjuk |
| `spridning_kvallar` | Blandning av morgon och kväll | 'av', 'mjuk' eller 'stark' | mjuk |
| `spridning_tolerans` | Hur jämn blandningen ska vara | 1 = båda sorterna varje vecka, 0 = nästan lika många | 1 |

## Vikter i lättmotorn

Lättmotorn (webbläsare och mobil) söker heuristiskt och väger målen med fasta vikter i stället för strikt ordning.

| Mål | Vikt | Per |
|---|---:|---|
| Brott mot hård regel | 100 000 000 | brott |
| Vakant pass | 100 000 | pass |
| Kort vila mellan nattblock | 2 000 | tillfälle |
| Saknad deltagare i aktivitet | 50 000 | deltagare |
| Blandning morgon och kväll (stark) | 400 | vecka utan blandning |
| Dagar i följd över rekommenderat | 60 | tillfälle |
| Jämn bemanning | 40 | kvadraten på överskottet per pass  plus skillnaden dag/kväll |
| Blandning morgon och kväll (mjuk) | 25 | vecka utan blandning |
| Rättvisa | 8 | kvadraten på avvikelsen i antal kvällar |
| Brutet önskemål | 4 | viktsteg |

## Utanför schemaläggningen

Påverkar inte hur schemat läggs, bara beräkningar efteråt.

**OB:** AB 25 § 21, kalenderstyrt (A storhelg, B helg, C vardagsnatt, D vardagskväll, nattförhöjning för A och B). Per kategori och kalendermånad uppåt till hel- eller halvtimme; under en timme ger inget.

| Gäller | A | A natt | B | B natt | C | D | Källa |
|---|---:|---:|---:|---:|---:|---:|---|
| 2025-04-01 – 2026-03-31 | 126,9 | 152,3 | 66,1 | 76,0 | 56,7 | 25,6 | AB 25 § 21, fr.o.m. 2025-04-01 |
| 2026-04-01 – 2027-03-31 | 130,7 | 156,9 | 68,1 | 78,3 | 58,4 | 26,4 | AB 25 § 21, fr.o.m. 2026-04-01 |

Efter sista kontrollerade nivån: prognos 3,0 % per år (inte avtal).

- `timkostnad_kr`: Valfri; lön och PO utan OB.
- `startdatum`: Valfri måndag; kopplar grundschemat till verkliga datum.
- `budget_timmar_vecka`: Valfri; jämförs med kontrakterad tid.
