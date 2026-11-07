# Indata och utdata

## Indata (JSON)

```json
{
  "enhet": "Namn på enhet",
  "veckor": 6,
  "cykliskt": true,
  "delperioder": [6],
  "start_iso_vecka": 45,
  "heltid_minuter_per_vecka": 2220,
  "regler": {"dygnsbryt": "auto", "veckobryt": "mån 00:00"},
  "nattpass": [{"id": "N", "start": "21:45", "slut": "06:45", "maltidsuppehall": true}],
  "extra_passmallar": [],
  "behov": {
    "vardag": {"morgon": 3, "kvall": 3, "natt": 1},
    "helg":   {"morgon": 2, "kvall": 2, "natt": 1}
  },
  "tidpunkter": {"vardag": [{"tid": "14:00", "antal": 3}]},
  "personal": [
    {"id": "A1", "grad": 1.0, "antal_pass": 28},
    {"id": "K1", "grad": 0.6, "dygnsdelar": ["kvall"]},
    {"id": "N1", "grad": 1.0, "dygnsdelar": ["natt"], "dygnsbryt": "06:45"}
  ],
  "onskemal": [
    {"id": "O1", "person": "A1", "typ": "ledig", "dagar": ["fre"], "veckor": "jämna", "krav": false, "vikt": 1}
  ],
  "losare": {"tid_per_steg_s": 20}
}
```

### Fält

**veckor** – periodens längd. **cykliskt** (standard sant) – sista veckan följs av första; alla regler gäller över gränsen.

**delperioder** – veckor per delperiod, till exempel `[6, 6]` för 12 veckor med 28 + 29 pass. Ange då `antal_pass` per person som lista: `[28, 29]`.

**start_iso_vecka** – ISO-veckonummer för schemats vecka 1. Används för önskemål på jämna och udda veckor. Utan det räknas schemats egna veckonummer (vecka 1 är udda).

**heltid_minuter_per_vecka** (standard 2220, 37 h) och **heltid_natt_minuter_per_vecka** (standard 2060, 34 h 20 min) – heltid för dag- och kvällspersonal respektive nattpersonal (`dygnsdelar: ["natt"]`), när personen inte har egen `heltid_minuter_per_vecka`. 34:20 motsvarar AB 25 § 13 mom. 2 för kontinuerligt treskiftsarbete.

**regler** – skriver över standardvärden. Alla nycklar med standardvärden:
`dygnsvila_minuter` 660, `veckovila_minuter` 2160, `dygnsbryt` "auto", `veckobryt` "mån 00:00", `rast_grans_minuter` 300, `rast_minuter` 30, `pass_per_vecka` 4.75, `morgon_start` "07:00", `kvall_slut` "22:00", `kant_fran` "12:00", `kant_till` "18:00", `steg_minuter` 15, `block_min` 2, `block_max` 5, `block_rekommenderat` 4, `natt_max_i_rad` 3 (nattpersonal: högst nätter i rad, lokal regel; 0 stänger av), `natt_vila_mellan_block_minuter` 2880 (nattpersonal: vila mellan nattblock, mjuk lokal regel; 0 stänger av), `kvall_max_i_rad` 3 (helst högst kvällar i rad, mjuk; 0 stänger av), `morgon_starter` [] (fler tillåtna starttider för dagpass, till exempel ["06:30", "07:30"]; används när behovet vid klockslag kräver det), `helg_start` "fre 22:00", `helg_slut` "mån 06:00", `hel_helg` true (arbetshelg = både lördag och söndag), `helgfrekvens` "2/4", `ingen_fredagskvall_fore_ledig_helg` true, `tolerans_minuter` 60, `langd_band_minuter` 120 (hur långt ett pass får avvika från personens mållängd), `spridning_kvallar` "mjuk" ("av", "mjuk" eller "stark": blandning av morgon och kväll varje vecka), `spridning_tolerans` 1 (0 = även nästan lika många av varje), `jamn_bemanning` "mjuk" ("av" eller "mjuk": över- och underbemanning fördelas jämnt mellan dag och kväll), `min_passlangd_minuter` 300 (blir passen kortare än så när antal pass räknas fram, tas pass bort i stället; 0 stänger av).

**Passmallar** genereras automatiskt: morgonpass från `morgon_start` med slut i kvartssteg inom fönstret, kvällspass till `kvall_slut` med start inom fönstret, rast enligt rastregeln. Nattpass anges i `nattpass`. `extra_passmallar` lägger till egna pass: `{"id", "start", "slut", "dygnsdel", "rast"}`.

**behov** – antal pass per dygnsdel (`morgon`, `kvall`, `natt`) och dag. Nycklar: `vardag`, `helg`, `alla` eller en enskild dag (`mån` … `sön`); senare nycklar skriver över tidigare.

**tidpunkter** – minsta antal i tjänst vid ett klockslag, till exempel mitt på dagen när morgon- och kvällspass överlappar. Samma nycklar som `behov`.

**personal**
- `grad` – sysselsättningsgrad (0.75 = 75 %).
- `dygnsdelar` – standard `["morgon", "kvall"]`. Nattpersonal: `["natt"]`.
- `antal_pass` – heltal eller lista per delperiod. Utan värde: 4,75 × veckor för dag/kväll, arbetstid ÷ nattpassets längd för natt.
- `helgfrekvens` – `2/4` (standard, varannan helg), `1/4`, `3/4`, `alla`, `ingen`. Andra värden än `2/4` är undantag för just den personen. Enhetens `regler.helgfrekvens` är låst till `2/4`.
- `helggrupp` – `A` (arbetar helgerna i vecka 1, 3, 5 …) eller `B`. Utan värde väljer lösaren, med lika många i varje grupp.
- `tolerans_minuter`, `heltid_minuter_per_vecka`, `dygnsbryt` – valfria per person.

**onskemal**
- `typ`: `ledig`, `arbetar`, `tidigast_start` (värde "07:30"), `senast_slut` (värde "13:00"), `endast_dygnsdel` (värde "kvall" eller lista).
- Dagar: `dagar` (veckodagar) med `veckor` (`alla`, `jämna`, `udda` eller lista med veckonummer), eller `dagindex` (0 = vecka 1 måndag).
- `krav: true` gör önskemålet hårt. Annars är det mjukt med `vikt` (standard 1).

**aktiviteter** – aktiviteter under arbetstid, till exempel APT, handledning eller utbildning. Den som deltar arbetar hela aktivitetstiden: passet läggs så att det täcker tiden, och tiden räknas som arbetstid. Aktiviteten påverkar därför passlängd, vila, OB och bemanningen vid klockslag.
- `id` (kort kod, till exempel `APT`), `namn`, `start` och `slut` (samma dag, till exempel "14:00" och "16:00").
- Dagar som för önskemål: `dagar` med `veckor` (`alla`, `jämna`, `udda` eller lista med veckonummer), eller `dagindex`.
- Hur många per tillfälle: `antal`, eller `andel` av deltagargruppen (0.5 = hälften, avrundat uppåt). Anges bara `varje_person` (till exempel 1) blir det så många per tillfälle att alla hinner delta så många gånger. Utan något av dem deltar alla.
- `deltagare` – lista med id-koder. Utan lista är gruppen alla som har pass som kan täcka tiden (för 14–16 är det dag- och kvällspersonal).
- `typ` – `apt`, `utbildning`, `mote`, `studier`, `dokumentation`, `handledning` eller `annat`. Bara för visning och sortering; reglerna är desamma.
- `fran_golvet` (standard sant) – deltagarna räknas inte som i tjänst vid `tidpunkter` under aktiviteten. Behovet per dygnsdel påverkas inte: passet finns ju kvar.
- `minst_pa_golvet` – minsta antal i tjänst på golvet varje kvart under aktiviteten, deltagarna oräknade. De som inte deltar får längre pass (morgonpass som slutar senare, kvällspass som börjar tidigare) så att nivån hålls. Är det ändå för få blir det vakans vid klockslaget, på samma nivå som behovet. Gränssnittet föreslår den lägsta av morgonens och kvällens behov på vardagar.
- `krav` (standard falskt) – aktiviteten måste genomföras med fullt antal. Annars läggs den så långt det går, efter behovet.
- Deltagarna fördelas rättvist: alla i gruppen deltar ungefär lika många gånger, och exakt `varje_person` gånger när det anges.

Exempel: APT tisdag 14–16 vecka 2 och 4, där var och en går en gång (ungefär hälften varje gång):
```json
"aktiviteter": [{"id": "APT", "namn": "Arbetsplatsträff", "dagar": ["tis"], "veckor": [2, 4],
                 "start": "14:00", "slut": "16:00", "varje_person": 1}]
```

**bemanningsbalans** – valfri bemanningsbalans som i verksamhetens Excel-mall: `buffert_procent`, `pass` (behov med tider, rast och antal per dag, jour med `raknad_minuter`) och `ovrig_tid` (tillfällen per år, timmar, personer). Påverkar inte lösningen. Se `docs/bemanningsbalans.md`.

**avvikelser** – lista med låsta regler som användaren har bekräftat avvikelser från, till exempel `["dygnsvila_minuter"]`. Gäller `dygnsvila_minuter`, `veckovila_minuter`, `rast_grans_minuter`, `rast_minuter` och `helgfrekvens`. Utan bekräftelse avvisas en försvagning av dem.

**budget_timmar_vecka** – valfri budget för hela enheten. Påverkar inte lösningen; gränssnittet jämför den med summan av kontrakterad tid (sysselsättningsgrad × heltid).

**timkostnad_kr** – valfri genomsnittlig timkostnad i kronor: lön med personalomkostnader, **utan OB**. OB räknas separat enligt AB 25 § 21 (se `docs/ob.md`). Påverkar inte lösningen; används för att räkna om timmar till personalkostnad i översikten, nyckeltalen, personvyn och simuleringen.

**startdatum** – valfritt datum (`ÅÅÅÅ-MM-DD`, en måndag) för schemats första dag. Kopplar grundschemat till verkliga datum för OB och helgdagar. Påverkar inte lösningen. Utan startdatum antas nästa måndag.

**ob_prognos_procent** – valfri uppräkning av OB i procent per år för tid efter sista kontrollerade avtalsnivån (2027-03-31). Standard 3. 0 stänger av; då räknas sådan tid utan kronor. Prognosen visas alltid som prognos, inte avtal (se `docs/ob.md`).

**losare** – `tid_per_steg_s` (sekunder per optimeringssteg) och `profil`: `standard`, `medarbetare` (rättvist), `verksamhet` (jämn täckning av behovet) eller `ekonomi` (lägst OB). Se docs/optimering.md.

**forvantat** och **beskrivning** – används bara i testfallen.

### Kontroll

`schemamotor/modell.py` kontrollerar indata innan lösaren startar och ger alla fel på en gång, på svenska. Okända fält och regler avvisas. Regler från avtal och lag kan bara skärpas: dygnsvila minst 660 minuter, veckovila minst 2160, rast efter högst 300 minuters arbete och minst 30 minuter lång.

## Utdata från schemamotor/build.py

```json
{
  "status": "OK | INFEASIBLE | UNKNOWN | INDATAFEL",
  "steg": [{"fas": "mönster", "mal": "vakanser", "varde": 0, "status": "OPTIMAL", "grans": 0}],
  "kpi": {"vakanser": 0, "blocklangd": 0, "passlangd": 2566, "rattvisa": 1, "onskemal": 0,
          "vakanta_pass": 0, "vakanta_tidpunkter": 0, "aktiviteter": 0, "aktivitet_saknas": 0},
  "personer": {"A1": {"pass": 28, "minuter": 13320, "mal_minuter": 13320, "kvallspass": 15, "helggrupp": "A"}},
  "vakanser": [{"dag": 12, "vecka": 2, "veckodag": "lör", "dygnsdel": "kvall", "tid": null, "antal": 1}],
  "aktiviteter": [{"aktivitet": "APT", "namn": "Arbetsplatsträff", "dag": 8, "vecka": 2, "veckodag": "tis",
                   "start": "14:00", "slut": "16:00", "deltagare": ["A1", "A4"], "behov": 2, "saknas": 0}],
  "schema": {"A1": [{"mall": "M07:00-15:15", "dygnsdel": "morgon", "start": "07:00", "slut": "15:15",
                     "rast": 30, "netto": 465}, null]}
}
```

`schema` har en post per dag (veckor × 7), `null` för ledig dag. Ett pass med aktivitet har `"aktiviteter": [{"id": "APT", "namn": "Arbetsplatsträff", "start": "14:00", "slut": "16:00"}]`; aktiviteten ligger på passet som täcker den (för nattpass kan det vara passet som började dagen före). `netto` är arbetstid i minuter. Status `OPTIMAL` i ett steg betyder bevisat bästa möjliga för det målet givet de tidigare nivåerna; `FEASIBLE` betyder bästa som hittades inom tidsgränsen.

## Schema från andra system

schemamotor/validate.py läser samma `schema`-format, antingen hela utdatafilen eller en fil med bara `{"schema": {...}}`. Ett schema från ett annat system kan granskas genom att räkna om det till detta format. `dygnsdel` behövs för fönsterkontrollen och för behovet; `rast` för rastkontrollen.
