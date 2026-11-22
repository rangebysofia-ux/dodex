# Testdata

Syntetiska filer som testerna läser. Inga personuppgifter: bara passtider, antal och gruppnamn.

- `bemanningsmall_veckodagar.txt` – en bemanningsmall med ett block per veckodag (Från, Till, Rast, Arbetstid, antal per pass), som verksamhetens Excel-mall ser ut när den klistras in. Används av `tests/test_inklistring.py`.

Mappen heter `fixtures` och inte `data`, eftersom `.gitignore` utesluter alla mappar som heter `data/` (där ligger databasen).
