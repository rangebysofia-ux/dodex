# Hållbara scheman

Avtalet sätter minimikrav. Ett schema kan följa avtalet och ändå vara slitsamt. Den här filen beskriver vad som gör ett schema hållbart och hur skillen hanterar det.

Forskning om skiftarbete pekar på att korta vilotider mellan pass, många nätter i följd och oregelbundna scheman påverkar sömn, återhämtning och sjukfrånvaro. Hänvisa inte till specifika studier utan att ha kontrollerat dem.

## Vad skillen redan hanterar

**Snabba vändningar.** Kväll följt av morgon dagen efter ger bara 9 timmars vila med passen 13:45–22:00 och 07:00–15:15. Dygnsvilan på 11 timmar gör att det aldrig förekommer.

**Långa arbetsblock.** Högst 5 dagar i följd är hårt, och fler än 4 straffas som näst högsta mål efter vakanser.

**Enstaka arbetsdagar.** Är förbjudna (minst 2 i följd), eftersom en ensam arbetsdag mitt i ledigheten splittrar återhämtningen.

**Förutsägbarhet.** Cykliska grundscheman upprepas, så medarbetarna vet sitt schema långt i förväg.

**Helger.** Strikt växling ger varannan helg ledig.

**Rättvis fördelning.** Spridningen i antal kvälls- och morgonpass mellan medarbetare minimeras.

## Vad som är värt att lyfta för användaren

Granskningen visar mjuka avvikelser under "Att notera". Lyft dem som frågor, inte som fel:

- Fem dagar i följd: tillåtet men slitsamt. Behövs det för att undvika vakans?
- Arbetsveckor utan två lediga dagar i följd: veckovilan kan vara uppfylld ändå (en ledig dag med kväll före och kväll efter kan ge 36 timmar), men återhämtningen blir kortare.
- Många nätter i följd för nattpersonal: inte reglerat i skillen. Fråga om verksamheten har en egen gräns och lägg den i så fall in som lokal regel.
- Deltidare med mycket korta pass: under cirka 64 procent kan morgonpass inte förekomma, så personen får bara kvällar. Kontrollera att det är acceptabelt.

## Möjliga tillägg

Om användaren vill skärpa hållbarheten kan dessa läggas till som mjuka mål i build_schedule.py:
- högst ett visst antal kvällar i följd
- minst en längre ledighet (tre dagar) per fyra veckor
- jämn fördelning av helgkvällar
- en gräns för antal nätter i följd
