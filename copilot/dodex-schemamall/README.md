# DODEX Schemamall – färdighet för Microsoft 365 Copilot

Skapar ett färdigt grundschema eller en tom mall som fil att ladda ner, i samma struktur som DODEX:

- `<enhet>.xlsx` med flikarna Schema, Per person, Vakanser och Granskning, samma layout och färger som DODEX Excel-export.
- `<enhet>.dodex.json`, en enhetsfil som öppnas i DODEX (Mina enheter → Öppna fil). Schemat granskas om där.

Filerna skapas av `skill/dodex-schemamall/scripts/skapa_schemamall.py` i Copilots kodtolk, så **Kodtolk måste vara påslagen** i agenten. Skriptet behöver bara openpyxl. `tests/test_copilot_schemamall.py` kontrollerar att ett schema från DODEX-motorn blir samma schema efter en rundtur genom skriptet och att DODEX kan öppna filen.

## Lägga till

1. Agent Builder → **Färdigheter** → **Lägg till** → ladda upp `dodex-schemamall.zip` (mappen `dodex-schemamall` överst i ZIP-filen).
2. Byt instruktionerna mot `../agent-instruktioner.txt`, som nu tar med alla tre färdigheterna.
3. Slå på **Kodtolk**.

Prova: *"Gör en tom schemamall för Forellen 3A, 6 veckor, 8 personer på 100 %, behov vardag dag 3 kväll 3 natt 1, helg dag 2 kväll 2 natt 1."*
