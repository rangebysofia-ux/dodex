# Olika starttider för dagpassen

Användarens beslut 2026-11-09 (beslut 35 i `regelhierarki.md`). När behovet läggs in kan man ange hur många av dagpassen som börjar vid varje tid. Exempel: en förskola med öppet 06:00–18:00 och sex i dagbehov, där 1 börjar 06:00, 1 börjar 07:00, 2 börjar 08:00 och 2 börjar 09:00, så att hela dagen täcks.

## I gränssnittet

- **Behov** (fliken i enheten, i webben och i telefonen): avsnittet *Starttider för dagpassen*. Varje rad har en tid och hur många som börjar då. *+ Starttid* lägger till nästa hel timme. Under listan står hur många av dagbehovet som har en angiven starttid.
- **Guiden för en ny enhet**, steget *Tider*: *Olika starttider för dagpassen*, med samma rader.
- De som inte har en angiven starttid börjar vid dagpassets vanliga start (`morgon_start`).
- Passen blir lika långa som annars, så den som börjar senare slutar senare. Ett dagpass slutar som senast vid fönstrets slut (`kant_till`, standard 18:00). Ska någon arbeta till stängning behöver passet få plats före 18:00.

## Hur motorn lägger schemat

- `starttider.morgon` = `[{"tid": "07:00", "antal": 1}, …]`. Tiderna blir tillåtna starttider för dagpassen, som `morgon_starter` i beslut 24.
- Varje dag fördelas dagbehovet på tiderna i tidsordning, och högst så långt behovet räcker. Med behovet 3 och 1 + 1 + 2 börjar en kl. 06, en kl. 07 och en kl. 08. Är dagbehovet 0, till exempel på helgen, gäller inga starttider.
- Kravet är mjukt och ligger på samma nivå som behovet: det som saknas räknas som en startvakans (`startvakanser`, nyckeltalet `starttid_saknas`). Avtal, lag och lokala regler går alltid före.
- Lättversionen lägger först dagpassen med den vanliga starten och flyttar sedan så många som behövs till de andra tiderna, med samma längd. Ett pass flyttas bara om det ryms i fönstret och vilan räcker, och aldrig ett pass med en aktivitet.

## Granskningen

Regeln **STARTTID** (nivå verksamhet) i `validate.py` och `light/granskning.js`, skrivna var för sig. En dag där färre dagpass börjar vid en tid än vad som ska blir en varning. Starttiderna i listan godtas i kontrollen av passfönstret (PASSFONSTER).

## Förskolor

Förskolornas grundinställning är öppet 06:00–18:00: `morgon_start` 06:00 och `kvall_slut` 18:00 (`schemawebb/grund_forskola.json`). Det gäller förskolorna i grunden, förskolor som redan fanns och saknade egna tider, och en ny enhet som skapas i guiden under Förskola. En tid som användaren själv har satt ändras inte.

## Teknik

- Motorn: `forbered` och `bygg_modell` i `schemamotor/build.py`, och en passmall per starttid i mönsterfasen (`monsterproblem`).
- Lättversionen: `starttiderFor` i `light/motor.js`.
- Gränssnittet: `GUIDE.starttiderHtml`, `GUIDE.starttiderAndra` och `GUIDE.sattStarttider` i `schemawebb/statisk/guide.js`.
- Testfall: `tests/fall/starttider_forskola.json`. Tester: `tests/test_starttider.py` och `tests/test_grund.py`.
