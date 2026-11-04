# Avtals- och lagregler

Den här filen beskriver de regler som kommer från lag och kollektivavtal, och hur skriptet hanterar dem. Kontrollera alltid mot gällande lydelse av AB och HÖK och mot verksamhetens lokala kollektivavtal, som kan innehålla avvikelser.

## Allmänna bestämmelser (AB)

Uppgifterna nedan gäller AB i lydelse 2025-04-01 enligt SKR.

**Dygnsvila.** Minst 11 timmars sammanhängande vila under varje 24-timmarsperiod. Perioden räknas från *dygnsbrytet*, ett klockslag som verksamheten bestämmer och som ska vara detsamma under hela beräkningsperioden.

**Veckovila.** Minst 36 timmars sammanhängande vila under varje period om sju dagar, räknat från *veckobrytet*.

Lokala kollektivavtal kan tillåta avvikelser, till exempel tillfälligt kortare dygnsvila. Lägg aldrig in en sådan avvikelse utan att användaren har bekräftat att den finns i ett gällande avtal.

## Arbetstidslagen

**Rast.** Ingen får arbeta mer än fem timmar i följd utan rast. I skriptet får ett pass med mer än fem timmars arbetstid automatiskt 30 minuters obetald rast, om inget annat anges. Rasten ska placeras så att ingen arbetsdel före eller efter blir längre än fem timmar.

**Måltidsuppehåll.** Kan ersätta rast, till exempel på nattpass där personalen inte kan lämna arbetsplatsen. Det är betalt och räknas som arbetstid. Ange `"maltidsuppehall": true` på passmallen.

Följden av rastregeln är att pass med 5:00–5:30 på plats inte kan förekomma: så fort arbetstiden passerar fem timmar tillkommer 30 minuters rast.

## Dygnsbryt i praktiken

- **Dag och kväll.** Föreslå dygnsbrytet där flest pass börjar och slutar inom fönstret 12–18, i regel vid skiftbytet mitt på dagen, oftast kring 15 för en heltid. Med `"dygnsbryt": "auto"` gör granskningen detta automatiskt.
- **Natt.** Nattpersonal behöver ett eget dygnsbryt, i regel när nattpasset slutar. Med dag/kvällens dygnsbryt (till exempel 14:00) hamnar nattpasset mitt i 24-timmarsperioden och delar vilan i två delar som var för sig är kortare än 11 timmar. Granskningen ger därför nattpersonal ett eget dygnsbryt automatiskt, eller det som anges på personen (`"dygnsbryt": "07:15"`).

## Hur skripten hanterar reglerna

| Regel | schemamotor/build.py | schemamotor/validate.py |
|---|---|---|
| Dygnsvila | Minst 11 h mellan två pass | Exakt: 11 h sammanhängande i varje period från dygnsbrytet, plus 11 h mellan pass |
| Veckovila | Tillräckligt villkor per kalendervecka: två lediga dagar i följd, eller en ledig dag med tillräckligt tidigt slut före och sen start efter | Exakt: längsta lediga tid i varje sjudagarsperiod från veckobrytet |
| Rast | Inbyggd i passmallarna | Kontrollerar att rast finns och kan placeras |

Generering och granskning är alltså avsiktligt olika. Modellen använder villkor som är lätta att lösa och som räcker i praktiken. Granskningen räknar exakt på tidslinjen. Om veckobrytet inte är måndag 00:00 är modellens veckovila en approximation, och granskningen avgör.

## Vad som inte är avtal

Följande regler är lokala regler eller planeringsprinciper, inte AB eller HÖK. Beskriv dem aldrig som avtalsregler:

- minst 2 och högst 5 arbetsdagar i följd, helst högst 4
- varannan helg
- ingen fredagskväll före ledig helg
- 4,75 pass per vecka och antal pass per period
- fönstret 12–18 för passens rörliga kant
- rapportöverlapp
