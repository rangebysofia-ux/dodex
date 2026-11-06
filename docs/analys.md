# Konsekvensanalys och förslag utifrån budget

Sidan **Analys** (och `python -m schemamotor.analys indata.json --budget 357`) tar fram bemanningsförslag inom en budget, lägger ett schema för varje förslag med samma motor och regler som vanligt, och jämför konsekvenserna.

## Underlag

`analys.underlag()` räknar vad behovet kräver, oberoende av vem som är anställd:

- dag- och kvällspass per vecka, och ungefär hur många timmar behovet motsvarar,
- hur många med dag och kväll som måste arbeta varje helg: max morgon lör/sön + max av kväll lör/sön och, med fredagsregeln, fredag kväll,
- minsta antal personer med dag och kväll: så många att passen räcker (4,75 per vecka) och att helgerna täcks med varannan helg,
- nattimmar per vecka, med två extra nätter per period som marginal (med exakt antal blir ofta en natt omöjlig att täcka).

## Förslag

| Förslag | Innehåll |
|---|---|
| Nuvarande bemanning | Enhetens personal i dag, för jämförelse. |
| Heltid som norm | Så många heltider som budgeten räcker till, resten deltider (minst 50 %). |
| Lika deltider | Minsta antal personer med samma grad. |
| Fler personer, lägre grad | Två personer fler. |
| Bara behovet | Minsta bemanning som täcker behovet, när budgeten är större än behovet. |
| Fredagskväll som helgkväll | Behovet fredag kväll sänks till helgens nivå (bara när fredagskvällen styr helgbemanningen). |
| Utan fredagsregeln | Den lokala regeln stängs av (kräver beslut). |

Nattpersonal räknas fram på samma sätt i alla förslag. Önskemål följer bara med i nuvarande bemanning, eftersom de nya förslagen har nya id-koder.

## Konsekvenser

`analys.konsekvenser()` ger för varje lagt schema: vakanser och var de landar (vardag, fredag kväll, helg, natt), överkapacitet i timmar per vecka, kontrakterad tid mot budget, årsarbetare, personer och heltider, personer per helg, veckor utan blandning av morgon och kväll, skillnad i antal kvällar, kortaste och längsta pass, och brott mot hårda regler.

Förslagen rangordnas: inga regelbrott, få vakanser, inom budget, lite överkapacitet (i steg om 10 timmar), blandade veckor. Rangordningen är ett stöd; beslutet är verksamhetens.

**Använd som ny enhet** sparar förslaget som en egen enhet med det lagda schemat som första körning. Analyser sparas bara i minnet.
