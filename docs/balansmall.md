# Balansmall

Ett schema ska vara i balans mellan **behov, arbetsmiljö, budget och kvalitet** (beslut 26 i `regelhierarki.md`). Inget av perspektiven får styra ensamt. Balansmallen visar vad ett schema gör för vart och ett av de fyra, så att verksamheten kan välja medvetet.

## Var den finns

- **Översikten** för det senaste schemat (webben och telefonen).
- **Tre alternativ** (Jämför): alternativen står sida vid sida. Grönt betyder bäst på raden. Överst visas vilket schema som är bäst i varje perspektiv, alltså *vilket schema som gör vad*.

Koden är `GRAF.balans` och `GRAF.balansKort` i `schemawebb/statisk/grafer.js`, och den delas av webben och lättversionen. Allt räknas ur själva schemat och granskningen, inte ur motorns nyckeltal. Därför går scheman från den fullständiga motorn, från lättmotorn och från en enhetsfil att jämföra.

## Måtten

| Perspektiv | Mått | Bäst |
|---|---|---|
| Behov | Täckning av behovet (andel av passen per dag och dygnsdel som är bemannade) | högt |
| | Vakanta pass | lågt |
| | Vakanser vid klockslag (bara när enheten har behov vid klockslag) | lågt |
| Arbetsmiljö | Brott mot hårda regler (den fristående granskningen) | lågt |
| | Att notera i granskningen (mjuka regler som inte nås) | lågt |
| | Längsta arbetsblock, och dagar i följd utöver `block_rekommenderat` | lågt |
| | Flest kvällar i rad, flest nätter i rad | lågt |
| | Brutna önskemål (bara när det finns önskemål) | lågt |
| Budget | Planerade timmar per vecka | visas |
| | Över budget, timmar per vecka (bara med `budget_timmar_vecka`) | lågt |
| | Resurstid, timmar per vecka | visas |
| | OB per vecka (uppskattad, AB 25 § 21) och personalkostnad (med `timkostnad_kr`) | lågt |
| Kvalitet | Resurspass, skillnad mellan veckodagar (flest minus minst per vecka) | lågt |
| | Resurstid på kväll, andel (beslut 27: varken bara dag eller bara kväll) | visas |
| | Rättvisa: skillnad i andel kvällar mellan dem som arbetar dag och kväll | lågt |
| | Aktiviteter som saknar deltagare (bara när det finns aktiviteter) | lågt |

- Rött används bara för brott mot hårda regler, vakanser och tid över budget.
- Andra mått har inga gränsvärden, eftersom verksamheten inte har beslutat några. De jämförs mellan alternativen, och ett mått som "visas" jämförs inte.
- Håll över måttets namn för att se en förklaring.

Testerna finns i `tests/test_balansmall.py`.
