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

- Ett pass räknas som natt om det går över midnatt eller börjar efter kl. 20. Det räknas som dag om det börjar före kl. 11, och annars som kväll. Flera pass i samma dygnsdel läggs ihop.
- Passens tider föreslås som enhetens tider: tidigaste dagstart, senaste kvällsslut och nattpassets tider.
- Är alla vardagar lika och lördag lika med söndag blir behovet *vardag* och *helg*. Annars läggs behovet per veckodag. Guiden har knappen *Förenkla till vardag och helg*, som tar den tyngsta dagen i varje grupp.
- Rader som inte går att tolka hoppas över med en varning. Dagar utan behov blir 0, också med en varning.

## Tester

Formaten testas i `tests/test_inklistring.py` (via `tests/js/inklistring_test.js`). Testerna kontrollerar också att den indata som byggs är giltig och att inga namn följer med.
