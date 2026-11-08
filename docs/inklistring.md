# Klistra in personal och behov

Startsidan har valet **📋 Klistra in från Excel**. Man klistrar in personal, behov eller båda, ser en förhandsvisning och går sedan vidare i den vanliga guiden. Där kan allt justeras innan enheten skapas. Tolkningen finns i `schemawebb/statisk/inklistring.js` (KLISTRA) och delas av webben och lättversionen. `guide.js` för över resultatet till guiden (`nyKlistra`, `anvandKlistrat`).

Inklistringen räknar bara fram förslag. Regler, vila och helger hanteras som vanligt av motorn och granskningen.

## Personal

En rad per person. Kolumnerna kan stå i valfri ordning, med eller utan rubrikrad, separerade med tabb (Excel), semikolon eller mellanslag.

| Vad | Exempel | Blir |
|---|---|---|
| Sysselsättningsgrad | `75%`, `75 %`, `0,75`, `75` | 75 % |
| Timmar per vecka | `27,75 tim`, `30:54`, eller en kolumn med rubriken *Timmar* | grad av heltid (37 h, natt 34:20) |
| Arbetar | `dag/kväll`, `D/K`, `bara dag`, `bara kväll`, `natt`, `N` | dygnsdelar |
| Helger | `varannan`, `var fjärde`, `1/4`, `3/4`, `alla helger`, `inga helger` | helgfrekvens (undantag per person) |

- Graden avrundas till närmaste 5 % och hålls inom 10–100 %.
- Saknas graden blir den 100 %, med en varning.
- Den som arbetar natt får id N1, N2 …, och övriga får A1, A2 …

**Namn sparas aldrig.** Det inklistrade visas bara i förhandsvisningen (kolumnen *Från inklistringen*) så att användaren kan göra en egen nyckel. Enheten får bara id-koderna. Texten finns kvar i minnet medan guiden är öppen, så att man kan gå tillbaka och rätta. Den skrivs aldrig till databasen, webbläsarens lagring eller en fil.

## Behov

Hur många som behöver vara i tjänst. Följande format känns igen:

```
        Dag   Kväll   Natt          Vardag 3 2 1               Vardagar: 3 på dag, 2 på kväll och 1 natt
Vardag  3     2       1             Helg 2 2 1                 Helger: 2 dag, 2 kväll, 1 natt
Helg    2     2       1             (eller mån-fre, lör-sön, mån, tis …)
```

Det går också med pass och tider och en kolumn per veckodag:

```
              Mån  Tis  Ons  Tor  Fre  Lör  Sön
07:00-15:30   2    2    2    2    2    2    2
14:00-21:30   2    2    2    2    3    2    2
21:15-07:00   1    1    1    1    1    1    1
```

Verksamhetens bemanningsmall går också att klistra in som den är, med ett block per veckodag och en rad per pass (grupp, Från, Till, Rast, Arbetstid, antal):

```
Måndag        Från   Till   Rast   Arbetstid  Arb.Tf
Avdelningar   07:00  15:00  00:30  07:30      12
              12:00  21:00  00:30  08:30      6
Löpare        06:30  15:00  00:30  08:00      2
              00:00  00:00  00:00  00:00      0
                                   202:00     26
Tisdag        …
```

Grupperna (Avdelningar, Löpare, Förstärkning …) räknas ihop per dygnsdel, och förhandsvisningen visar vilka som räknats med. Tomma rader (00:00–00:00), pass med antal 0 och summarader hoppas över. Rasten och arbetstiden i mallen används inte, eftersom motorn räknar rast och passlängd själv efter reglerna. Testfallet finns i `tests/data/bemanningsmall_veckodagar.txt`.

- Ett pass räknas som natt om det går över midnatt eller börjar efter kl. 20. Det räknas som dag om det börjar före kl. 11, och annars som kväll. Flera pass i samma dygnsdel läggs ihop.
- Passens tider föreslås som enhetens tider: den starttid för dagpass och den sluttid för kvällspass som flest pass har, och nattpassets tider. Andra starttider för dagpass (till exempel löpare 06:30) nämns i en varning. De kan läggas till under Regler (`morgon_starter`) men läggs aldrig till automatiskt.
- Pass som är längre än 10 timmar (till exempel 07:00–20:00 med lång rast) räknas som dagpass, med en varning.
- Är alla vardagar lika och lördag lika med söndag blir behovet *vardag* och *helg*. Annars läggs behovet per veckodag. Guiden har knappen *Förenkla till vardag och helg*, som tar den tyngsta dagen i varje grupp.
- Rader som inte går att tolka hoppas över med en varning. Dagar utan behov blir 0, också med en varning.

## Tester

Formaten testas i `tests/test_inklistring.py` (via `tests/js/inklistring_test.js`). Testerna kontrollerar också att den indata som byggs är giltig och att inga namn följer med.
