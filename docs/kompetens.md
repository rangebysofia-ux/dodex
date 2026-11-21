# Kompetensbaserade behov och planering

Användarens beslut 2026-11-09 (beslut 34 i `regelhierarki.md`). Utöver hur många som ska vara i tjänst kan en enhet ange hur många **med en viss kompetens** som behövs, till exempel minst en med läkemedelsdelegering på varje kvällspass, eller en sjuksköterska på natten.

## Kompetenser

Organisationens lista finns på sidan **Organisation** under *Kompetenser*: namn, kort märkning i schemat (till exempel DEL) och färg. Startlistan är Undersköterska, Vårdbiträde, Sjuksköterska, Läkemedelsdelegering, Insulindelegering, Körkort, Förskollärare och Barnskötare. Den går att ändra, och nya kompetenser kan läggas till.

I varje enhet finns fliken **Kompetens**:
- **Kompetenskrav:** kompetens och minsta antal per pass (dag, kväll, natt) för vardag och helg.
- **Kompetensbalans:** en uppskattning före schemat (se nedan).
- **Medarbetarnas kompetenser:** en tabell med en kryssruta per medarbetare och kompetens, och antalet med varje kompetens.

## Hur motorn lägger schemat

Kravet är **mjukt** och kommer **direkt efter behovet** i målordningen: vakanser → kompetens → aktiviteter → … (`MALORDNING` i `build.py`).

- Motorn väljer vilka som arbetar vilka pass, så att så många krav som möjligt täcks.
- Den gör aldrig behovet sämre för kompetensens skull: antalet vakanta pass blir aldrig fler.
- Den lägger aldrig ett extra pass utöver behovet för att få in kompetensen (användarens beslut). Det som inte går att täcka syns som **kompetensvakanser**.
- Avtal, lag och lokala regler går alltid före. Den med kompetensen arbetar till exempel inte fler kvällar i rad än regeln tillåter.

Varför direkt efter behovet och inte på samma nivå? Med lexikografisk optimering minimeras först vakanserna och sedan, bland alla scheman med lika få vakanser, kompetensvakanserna. Det ger den bästa kompetenstäckningen som går utan att någon vakans tillkommer. Om kompetensen låg på samma nivå som behovet skulle motorn kunna lämna ett pass helt obemannat för att få in en kompetens på ett annat, och då väger en vakans och en kompetensvakans lika. Det är ett annat beslut, och det kan göras senare som en inställning per krav.

Lättversionen (`light/motor.js`) väger en kompetensvakans lite lägre än en vakant plats och högre än en saknad aktivitetsdeltagare (vikten `WK`). Den är en heuristik och kan ibland lämna någon kompetensvakans mer än den fullständiga motorn.

## Granskningen

Regeln **KOMPETENS** (nivå verksamhet) i `validate.py` och `light/granskning.js`, skrivna var för sig. Varje dag och dygnsdel där det finns färre med kompetensen än kravet blir en varning, aldrig ett brott. Fler än kravet är aldrig fel.

## Planering

- **Kompetensbalans** (fliken Kompetens): per krav hur många pass per vecka som kräver kompetensen, och hur många pass de med kompetensen hinner arbeta i de dygnsdelarna (grad × 4,75 pass per vecka). Helgerna räknas för sig: med varannan helg behövs minst dubbelt så många med kompetensen som helgkravet.
  - *Räcker inte* visar ungefär hur många fler som behöver kompetensen.
  - *Knappt* betyder under 1,5 gånger kravet. De med kompetensen arbetar också pass där den inte krävs, så det blir ofta luckor.
  - Balansen är en uppskattning. Motorn avgör.
- **Kompetens i schemat:** varje medarbetares kompetenser står med korta märken under id:t. Kortet **Kompetens** under schemat visar per krav pass med krav, täckta och saknade, och vilka pass som saknar kompetensen.
- **Förslag på utbildning:** de utan kompetensen som oftast arbetar de pass där den saknas. Med kompetensen hade de kunnat täcka bristen utan att schemat ändras.

## Indata

```json
"kompetenser": [{"id": "del", "namn": "Läkemedelsdelegering", "kort": "DEL", "farg": "#c0473f"}],
"kompetenskrav": [{"id": "K1", "kompetens": "del", "behov": {"alla": {"kvall": 1}}}],
"personal": [{"id": "A1", "grad": 0.75, "kompetenser": ["del"]}, …]
```

- `kompetenser`: enhetens lista. Gränssnittet skriver den från organisationens lista med de kompetenser som används.
- `kompetenskrav[].behov` anges som enhetens behov (vardag, helg, alla eller en veckodag, och morgon, kväll och natt) och betyder *minst så många med kompetensen*.
- Indatakontrollen avvisar kompetenser och krav som inte finns i enhetens lista, och dubbletter.
- Resultatet får `kompetenskrav`, `kompetens_tackning` (per dag, dygnsdel och krav: behov, i tjänst, vilka, saknas) och nyckeltalet `kompetensvakanser`. `justera.py` räknar om täckningen efter en handjustering.

## Teknik

- Motorn: `schemamotor/build.py` (målet `kompetens`, `kompetens_tackning`), `justera.py`, `validate.py` (KOMPETENS) och `regelverk.py`.
- Lättversionen: `light/motor.js` (`kompFor`, `kompetensTackning`, vikten `WK`) och `light/granskning.js`.
- Gränssnittet: `schemawebb/statisk/kompetens.js` (KOMP), som delas av webben och lättversionen.
- Webben: `GET` och `PUT /api/kompetenser`, där `null` betyder startlistan. Lättversionen: dokumentet `kompetenser` i användarens lagring.
- Testfall: `tests/fall/kompetens_delegering.json` (går att täcka) och `tests/fall/kompetens_brist.json` (bara en har delegering, så det blir kompetensvakanser). Tester: `tests/test_kompetens.py`.
