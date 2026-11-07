# Optimeringsmodellen

## Lösare

Google OR-Tools CP-SAT (constraint programming med SAT-teknik). Installeras med `pip install ortools --break-system-packages`.

## Variabler

- `x[person, dag, passmall]` – personen arbetar den passmallen den dagen.
- `work[person, dag]` – personen arbetar den dagen (summan av x, högst ett pass per dag).
- Helggrupp per person med varannan helg, och en variabel per person och helg för om helgen är arbetshelg.
- Vakansvariabler per dag och dygnsdel och per tidpunkt.
- `y[aktivitet, dag, person]` – personen deltar i aktiviteten den dagen. `y ≤ summan av x` för passmallar som täcker hela aktivitetstiden (för nattpass även passet som började dagen före). Per tillfälle: `summan av y + brist = antal`. Deltagare med `fran_golvet` dras från täckningen vid klockslag under aktiviteten. Med `minst_pa_golvet` får varje kvart under aktiviteten en vakansvariabel: `i tjänst − deltagare + vakans ≥ minst`; den ingår i vakansmålet.

## Hårda regler

Varje regel kan få en egen literal per person (används av schemamotor/explain.py):

| Grupp | Villkor |
|---|---|
| DYGNSVILA | Ett pass som slutar vid tiden e får inte följas nästa dag av ett pass som börjar mindre än 11 h senare. Uttryckt per sluttid som en grupperad olikhet för stark propagering. |
| VECKOVILA | Varje kalendervecka har två lediga dagar i följd, eller en ledig dag där föregående pass slutar och nästa börjar så att vilan blir minst 36 h. |
| BLOCK_MIN | Ingen arbetsdag utan arbetsdag före eller efter. |
| BLOCK_MAX | Högst 5 arbetsdagar i varje fönster om 6 dagar. |
| NATT_I_RAD | Nattpersonal: högst 3 nätter i varje fönster om 4 dagar (`natt_max_i_rad`, lokal regel). |
| HELG | Ledig helg: inga pass som går in i helgfönstret och inget kvälls- eller nattpass fredagen före. Arbetshelg: både lördag och söndag. Varannan helg växlar strikt. |
| ANTAL_PASS | Exakt antal pass per delperiod. |
| TID | Summan av arbetstid inom kontrakterad tid ± tolerans. |
| KRAV | Önskemål markerade som krav. |
| AKTIVITET | Aktiviteter markerade som krav: inget tillfälle får sakna deltagare (en literal per aktivitet). |

I cykliska scheman räknas alla fönster runt periodgränsen.

Mjukt mål efter vakanser och aktiviteter: **natt_vila**, antal gånger vilan mellan två nattblock är kortare än `natt_vila_mellan_block_minuter` (48 h). Villkoret är `arbete(d) + ledigt(d+1) + pass(d+k) ≤ 2 + brott` för de k där nästa pass börjar för tidigt.

## Två faser

En modell med alla passlängder och exakt arbetstid är svår att hitta en första lösning i. Därför löses problemet i två faser:

1. **Mönster.** Varje person får bara tre passmallar per dygnsdel (kortast, längst och närmast mållängden), och den exakta arbetstiden släpps. Fasen bestämmer vilka dagar och vilken dygnsdel varje person arbetar och optimerar vakanser, blocklängd, rättvisa och önskemål. Det tar sekunder.
2. **Längder.** Mönstret låses och passlängderna väljs fritt så att arbetstiden blir rätt, aktiviteterna får sina deltagare (ett morgonpass förlängs till exempel till 16:00 för APT 14–16 och andra pass kortas), vakanserna vid tidpunkter blir så få som möjligt och passen så nära mållängden som möjligt.

Uppdelningen fungerar eftersom morgonpass har fast start och kvällspass fast slut: vilken vila som är tillåten beror då nästan bara på dygnsdelen, inte på längden. Om fas 2 ändå inte går att lösa körs hela modellen på en gång som reserv. Om fas 1 är olösbar kontrolleras det med alla passlängder innan schemat förklaras olösbart.

## Lexikografisk ordning

Inom varje fas optimeras målen i tur och ordning. Efter varje mål läggs villkoret `mål ≤ bästa värde` till, och lösningen ges som startpunkt till nästa steg.

## Symmetri

Personer med samma villkor kan byta schema med varandra utan att något ändras. Lösaren hjälps genom att helggrupperna balanseras (lika många i A och B) och att en person utan önskemål låses i grupp A.

## Förklaring av olösbarhet

schemamotor/explain.py:
1. Aritmetiska förkontroller: kan antal pass × tillåtna passlängder ge rätt arbetstid?
2. Mönstermodellen med alla regelgrupper påslagna. Olösbar → krymp: släpp hela personer i taget, sedan en regel i taget. Det som återstår är en minimal konflikt: varje regel i den behövs för att konflikten ska uppstå.
3. För cykliska scheman prövas konflikten utan cykel. Går det då ihop ligger problemet vid periodgränsen.

Grupperna fixeras som av eller på i stället för att ges som antaganden. Det låter förlösningen hitta konflikten direkt, vilket i tester var mycket snabbare.

## Prestanda

- Ett 6-veckorsschema med 12 personer löses på 10–20 sekunder på en processorkärna, ett 12-veckorsschema med samma grupp och två delperioder på cirka 40 sekunder.
- `tid_per_steg_s` styr tidsgränsen per optimeringssteg. Längre tid ger fler steg med status OPTIMAL.
- Större grupper (30+ personer, 12 veckor) kan behöva längre tid, eller uppdelning per arbetslag.
- Antalet passmallar per person begränsas av `langd_band_minuter`. Ett smalare band gör lösningen snabbare.

## Begränsningar

- Behovet anges per dygnsdel och tidpunkt, inte per kvart. Rasternas placering optimeras inte.
- Kompetenskrav och samplanering mellan enheter finns inte än.
- Veckovilan i modellen är ett tillräckligt villkor per kalendervecka; granskningen räknar exakt.
