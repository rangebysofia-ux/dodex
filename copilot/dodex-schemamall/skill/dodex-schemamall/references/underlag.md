# Underlag till skriptet skapa_schemamall.py

En Python-dict. Allt utom `personal` kan utelämnas. Använd id-koder, aldrig namn.

```python
underlag = {
    "enhet": "Forellen 3A",            # enhetens namn, blir filnamn
    "veckor": 6,                        # schemaperiod, 1–16 veckor
    "cykliskt": True,                   # sista veckan följs av första
    "behov": {                          # pass per dag och dygnsdel: dag, kvall, natt
        "vardag": {"dag": 3, "kvall": 3, "natt": 1},
        "helg":   {"dag": 2, "kvall": 2, "natt": 1},
        "fre":    {"kvall": 2},             # en enskild dag går före vardag/helg
    },
    "personal": [
        {"id": "A1", "grad": 1.0},
        {"id": "A2", "grad": 0.75, "helgfrekvens": "3/4"},
        {"id": "N1", "grad": 0.8, "natt": True},
    ],
    "schema": {                         # utelämnas = tom mall utan pass
        "A1": ["D 07:00–15:15", "D 07:00–15:15", None, None, "K 14:00–22:00", "K 14:00–22:00", "K 14:00–22:00"],
        # en cell per dag i hela perioden (veckor × 7), måndag först; None eller "" = ledig
    },
    "granskning": [                     # valfritt: resultatet av regelkontrollen, blir fliken Granskning
        {"regel": "DYGNSVILA", "niva": "avtal", "person": "A1", "text": "Vecka 1 fre: 9 h vila", "typ": "Brott"},
    ],
    "heltid_minuter_per_vecka": 2220,   # 37 h; 2400 för 40-timmarsvecka (förskola)
    "regler": {}, "avvikelser": [], "regelverk": None,   # förs över orörda till enhetsfilen
}
```

## Celler

| Kod | Betyder | Exempel |
|---|---|---|
| D | dagpass | `D 07:00–15:15` |
| K | kvällspass | `K 14:00–22:00` |
| N | nattpass (slutar dagen efter) | `N 21:45–06:45` |
| T, M, S | förskolans Tidig, Mellan och Sen (blir dag, dag och kväll i DODEX) | `T 06:00–14:30` |
| tomt, None, L | ledig | |

Rast räknas som i DODEX: 30 minuter när passet är längre än 5 timmar. Nattpass har måltidsuppehåll och ingen rast.

## Resultat

`skapa(underlag, mapp="/mnt/data")` sparar två filer och returnerar deras sökvägar, antal vakanta pass och timmar per person:

- `<enhet>.xlsx` med flikarna **Schema**, **Per person**, **Vakanser** och **Granskning**, i samma layout och färger som DODEX Excel-export.
- `<enhet>.dodex.json`, en enhetsfil. Den öppnas i DODEX under **Mina enheter → Öppna fil** (webben och telefonen). Schemat granskas om där.
