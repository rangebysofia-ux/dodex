"""Datamodell för indata med kontroll och felmeddelanden på svenska.

Beskriver formatet i docs/indata-schema.md. `kontrollera_indata` returnerar en lista med
begripliga fel; `las_indata` kastar `IndataKontrollFel` med samma lista.

Kontrollen körs före lösaren så att användaren får alla fel på en gång i stället för det
första som lösaren stöter på.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator  # noqa: F401

DAGNAMN = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
DAGNYCKLAR = ["vardag", "helg", "alla"] + DAGNAMN
DYGNSDELAR = ["morgon", "kvall", "natt"]
HELGFREKVENSER = ["1/4", "2/4", "3/4", "alla", "ingen"]
ONSKEMALSTYPER = ["ledig", "arbetar", "tidigast_start", "senast_slut", "endast_dygnsdel"]
STANDARD_PASS_PER_VECKA = 4.75

FALTNAMN = {
    "enhet": "enhet", "veckor": "veckor", "personal": "personal", "grad": "sysselsättningsgrad",
    "id": "id", "behov": "behov", "dygnsdelar": "dygnsdelar", "antal_pass": "antal pass",
    "person": "person", "typ": "typ", "onskemal": "önskemål", "regler": "regler",
    "nattpass": "nattpass", "tidpunkter": "tidpunkter", "delperioder": "delperioder", "varde": "värde", "start": "start", "slut": "slut",
    "tid": "tid", "antal": "antal", "helgfrekvens": "helgfrekvens", "helggrupp": "helggrupp",
    "aktiviteter": "aktivitet", "andel": "andel", "deltagare": "deltagare", "varje_person": "gånger per person",
    "namn": "namn", "fran_golvet": "från golvet",
}

Klocka = Annotated[str, Field(pattern=r"^([01]?\d|2[0-3]):[0-5]\d$")]


STANDARDREGLER = {
    "dygnsvila_minuter", "veckovila_minuter", "dygnsbryt", "veckobryt", "rast_grans_minuter", "rast_minuter",
    "pass_per_vecka", "morgon_start", "kvall_slut", "kant_fran", "kant_till", "steg_minuter", "block_min",
    "block_max", "block_rekommenderat", "helg_start", "helg_slut", "hel_helg", "helgfrekvens",
    "ingen_fredagskvall_fore_ledig_helg", "tolerans_minuter", "langd_band_minuter", "min_passlangd_minuter",
    "spridning_kvallar", "spridning_tolerans", "jamn_bemanning",
}
# Avtal och lag får aldrig försvagas (AGENTS.md). Skärpningar är tillåtna.
SKYDDADE = {
    "dygnsvila_minuter": (660, lambda v, g: v < g, "Dygnsvilan kan inte vara kortare än 11 timmar (AB 25 § 13 mom. 8). "
                          "Kortare, lägst 9 timmar, kräver särskilda skäl, kompenserande vila och MBL-förhandling (mom. 8 a och mom. 5)."),
    "veckovila_minuter": (2160, lambda v, g: v < g, "Veckovilan kan inte vara kortare än 36 timmar (ATL 14 §). "
                          "Avvikelse kräver lokalt kollektivavtal (AB 25 § 13 mom. 10 e)."),
    "rast_grans_minuter": (300, lambda v, g: v > g, "Rast krävs efter högst 5 timmars arbete (ATL 15 §)."),
    "rast_minuter": (30, lambda v, g: v < g, "Rasten kan inte vara kortare än 30 minuter."),
}
# Verksamhetens beslut 2026-11-07: 11 timmars dygnsvila är hård i schemaplaneringen och kan inte låsas upp,
# inte heller med undantaget till 9 timmar i mom. 8 a.
GOLV = {"dygnsvila_minuter": (660, "Dygnsvilan är minst 11 timmar och kan inte låsas upp i schemaplaneringen "
                              "(AB 25 § 13 mom. 8; verksamhetens beslut). Lokalt kollektivavtal om kortare dygnsvila är inte möjligt (mom. 10).")}


class IndataKontrollFel(ValueError):
    def __init__(self, fel: list[str]):
        super().__init__("\n".join(fel))
        self.fel = fel


class Strikt(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Nattpass(Strikt):
    id: str = "N"
    start: Klocka
    slut: Klocka
    maltidsuppehall: bool = True


class ExtraPassmall(Strikt):
    id: str
    start: Klocka
    slut: Klocka
    dygnsdel: Literal["morgon", "kvall", "natt"]
    rast: Optional[int] = Field(default=None, ge=0)


class Tidpunkt(Strikt):
    tid: Klocka
    antal: int = Field(ge=0)


class Person(Strikt):
    id: str = Field(min_length=1, max_length=20)
    grad: float = Field(gt=0, le=1)
    dygnsdelar: Optional[list[Literal["morgon", "kvall", "natt"]]] = None
    antal_pass: Optional[Union[int, list[int]]] = None
    helgfrekvens: Optional[Literal["1/4", "2/4", "3/4", "alla", "ingen"]] = None
    helggrupp: Optional[Literal["A", "B"]] = None
    tolerans_minuter: Optional[int] = Field(default=None, ge=0)
    heltid_minuter_per_vecka: Optional[int] = Field(default=None, gt=0)
    dygnsbryt: Optional[Klocka] = None

    @field_validator("dygnsdelar")
    @classmethod
    def natt_ensam(cls, v):
        if v is not None:
            if not v:
                raise ValueError("ange minst en dygnsdel")
            if "natt" in v and len(v) > 1:
                raise ValueError("nattpersonal kan bara ha dygnsdelen natt")
        return v


class Onskemal(Strikt):
    id: Optional[str] = None
    person: str
    typ: Literal["ledig", "arbetar", "tidigast_start", "senast_slut", "endast_dygnsdel"]
    varde: Optional[Union[str, list[str]]] = None
    dagar: Optional[list[str]] = None
    veckor: Optional[Union[Literal["alla", "jämna", "udda"], list[int]]] = None
    dagindex: Optional[list[int]] = None
    krav: bool = False
    vikt: int = Field(default=1, ge=1, le=100)
    kommentar: Optional[str] = None

    @model_validator(mode="after")
    def kontroll(self):
        if self.dagar is not None:
            okanda = [d for d in self.dagar if d not in DAGNAMN]
            if okanda:
                raise ValueError(f"okänd dag {', '.join(okanda)} (använd {', '.join(DAGNAMN)})")
        if self.typ in ("tidigast_start", "senast_slut"):
            if not isinstance(self.varde, str) or not re.match(r"^([01]?\d|2[0-3]):[0-5]\d$", self.varde):
                raise ValueError(f"{self.typ.replace('_', ' ')} behöver ett klockslag som värde, till exempel 07:30")
        if self.typ == "endast_dygnsdel":
            v = [self.varde] if isinstance(self.varde, str) else (self.varde or [])
            if not v or any(x not in DYGNSDELAR for x in v):
                raise ValueError("endast dygnsdel behöver värdet morgon, kvall eller natt")
        return self


class Aktivitet(Strikt):
    """Aktivitet under arbetstid, till exempel APT eller handledning. Den som deltar arbetar hela aktivitetstiden.

    Antal per tillfälle: `antal`, eller `andel` av deltagargruppen (avrundat uppåt), eller – om bara
    `varje_person` anges – så många att alla hinner delta så många gånger. Utan något av dem deltar alla."""
    id: str = Field(min_length=1, max_length=20)
    namn: Optional[str] = None
    start: Klocka
    slut: Klocka
    dagar: Optional[list[str]] = None
    veckor: Optional[Union[Literal["alla", "jämna", "udda"], list[int]]] = None
    dagindex: Optional[list[int]] = None
    antal: Optional[int] = Field(default=None, ge=1)
    andel: Optional[float] = Field(default=None, gt=0, le=1)
    deltagare: Optional[list[str]] = None
    varje_person: Optional[int] = Field(default=None, ge=1)
    fran_golvet: bool = True
    krav: bool = False
    kommentar: Optional[str] = None

    @model_validator(mode="after")
    def kontroll(self):
        if self.dagar is not None:
            okanda = [d for d in self.dagar if d not in DAGNAMN]
            if okanda:
                raise ValueError(f"okänd dag {', '.join(okanda)} (använd {', '.join(DAGNAMN)})")
        if self.antal is not None and self.andel is not None:
            raise ValueError("ange antal eller andel, inte båda")
        a, b = (int(t.split(":")[0]) * 60 + int(t.split(":")[1]) for t in (self.start, self.slut))
        if b <= a:
            raise ValueError("aktiviteten måste sluta efter att den börjar samma dag")
        return self


class Indata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enhet: str = ""
    veckor: int = Field(ge=1, le=16)
    cykliskt: bool = True
    delperioder: Optional[list[int]] = None
    start_iso_vecka: Optional[int] = Field(default=None, ge=1, le=53)
    heltid_minuter_per_vecka: int = Field(default=2220, gt=0)
    regler: dict = Field(default_factory=dict)
    nattpass: Optional[list[Nattpass]] = None
    extra_passmallar: list[ExtraPassmall] = Field(default_factory=list)
    behov: dict[str, dict[str, int]] = Field(default_factory=dict)
    tidpunkter: dict[str, list[Tidpunkt]] = Field(default_factory=dict)
    personal: list[Person] = Field(min_length=1)
    onskemal: list[Onskemal] = Field(default_factory=list)
    aktiviteter: list[Aktivitet] = Field(default_factory=list)
    losare: dict = Field(default_factory=dict)
    # låsta regler (avtal, lag, varannan helg) som användaren uttryckligen har godkänt avvikelser från
    avvikelser: list[str] = Field(default_factory=list)
    budget_timmar_vecka: Optional[float] = Field(default=None, gt=0)
    timkostnad_kr: Optional[float] = Field(default=None, gt=0, le=10000)
    # första dagen i schemat (en måndag), för OB och kalender; utan den antas nästa måndag
    startdatum: Optional[date] = None
    # uppräkning av OB efter sista kontrollerade avtalsnivån, procent per år (prognos, inte avtal); 0 stänger av
    ob_prognos_procent: Optional[float] = Field(default=None, ge=0, le=20)
    # används bara i testfallen
    beskrivning: Optional[str] = None
    forvantat: Optional[dict] = None

    @field_validator("startdatum")
    @classmethod
    def mandag(cls, v):
        if v is not None and v.weekday() != 0:
            raise ValueError(f"startdatum ska vara en måndag ({v} är inte det)")
        return v

    @field_validator("behov", "tidpunkter")
    @classmethod
    def dagnycklar(cls, v, info):
        for nyckel, varde in v.items():
            if nyckel not in DAGNYCKLAR:
                raise ValueError(f"okänd dag: {nyckel} (använd vardag, helg, alla eller {', '.join(DAGNAMN)})")
            if info.field_name == "behov":
                for del_, antal in varde.items():
                    if del_ not in DYGNSDELAR:
                        raise ValueError(f"okänd dygnsdel: {del_} (använd morgon, kvall eller natt)")
                    if antal < 0:
                        raise ValueError(f"behovet för {nyckel} {del_} kan inte vara negativt")
        return v


def _helhet(d: dict) -> list[str]:
    """Kontroller som gäller flera fält. Körs på rådata så att de syns även när andra fält har fel."""
    fel = []
    W = d.get("veckor")
    if not isinstance(W, int) or isinstance(W, bool):
        return fel
    personal = [p for p in d.get("personal") or [] if isinstance(p, dict)]
    delp = d.get("delperioder") or [W]
    if isinstance(delp, list) and all(isinstance(v, int) for v in delp) and sum(delp) != W:
        fel.append(f"Delperioderna {delp} blir {sum(delp)} veckor tillsammans, men perioden är {W} veckor.")
    ids = [str(p.get("id")) for p in personal]
    dubbla = sorted({i for i in ids if ids.count(i) > 1})
    if dubbla:
        fel.append(f"Samma id finns flera gånger: {', '.join(dubbla)}.")
    regler = d.get("regler") if isinstance(d.get("regler"), dict) else {}
    okanda = sorted(set(regler) - set(STANDARDREGLER))
    if okanda:
        fel.append(f"Okända regler: {', '.join(okanda)}. Se docs/indata-schema.md för giltiga namn.")
    avvikelser = d.get("avvikelser") if isinstance(d.get("avvikelser"), list) else []
    okanda_avv = sorted(set(map(str, avvikelser)) - set(SKYDDADE) - {"helgfrekvens"})
    if okanda_avv:
        fel.append(f"Avvikelser kan bara godkännas för låsta regler, inte för: {', '.join(okanda_avv)}.")
    for nyckel, (grans, jamfor, text) in SKYDDADE.items():
        v = regler.get(nyckel)
        if (isinstance(v, (int, float)) and not isinstance(v, bool) and jamfor(v, grans)
                and nyckel not in avvikelser):
            fel.append(text + " Bekräfta avvikelsen under Inställningar.")
    for nyckel, (golv, text) in GOLV.items():
        v = regler.get(nyckel)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v < golv:
            fel.append(text)
    if "helgfrekvens" in regler and regler["helgfrekvens"] != "2/4" and "helgfrekvens" not in avvikelser:
        fel.append("Varannan helg är en hård lokal regel för enheten och kan inte ändras. Undantag görs per person "
                   "med helgfrekvens på personen.")
    # Går 4,75 × veckor inte jämnt ut får dag- och kvällspersonalen växelvis avrundat nedåt och uppåt
    # (build.py, validate.py och lättversionen gör likadant), så alla periodlängder fungerar.
    for p in personal:
        if isinstance(p.get("antal_pass"), list) and isinstance(delp, list) and len(p["antal_pass"]) != len(delp):
            fel.append(f"{p.get('id')}: antal pass har {len(p['antal_pass'])} värden men det finns {len(delp)} "
                       f"delperioder.")
    for i, o in enumerate(d.get("onskemal") or []):
        if isinstance(o, dict) and o.get("person") not in ids:
            fel.append(f"Önskemål {o.get('id') or i + 1} gäller {o.get('person')}, som inte finns i personalen.")
        if isinstance(o, dict) and isinstance(o.get("dagindex"), list) and any(
                isinstance(v, int) and v < 0 for v in o["dagindex"]):
            fel.append(f"Önskemål {o.get('id') or i + 1}: dagindex kan inte vara negativt.")
    akt_ids = [str(a.get("id")) for a in d.get("aktiviteter") or [] if isinstance(a, dict)]
    for i in sorted({i for i in akt_ids if akt_ids.count(i) > 1}):
        fel.append(f"Aktiviteten {i} finns flera gånger.")
    for a in d.get("aktiviteter") or []:
        if not isinstance(a, dict):
            continue
        okanda = [p for p in a.get("deltagare") or [] if p not in ids]
        if okanda:
            fel.append(f"Aktiviteten {a.get('id')} har deltagare som inte finns i personalen: {', '.join(map(str, okanda))}.")
        if isinstance(a.get("veckor"), list) and any(isinstance(v, int) and not 1 <= v <= W for v in a["veckor"]):
            fel.append(f"Aktiviteten {a.get('id')}: veckorna måste ligga mellan 1 och {W}.")
    return fel


def _plats(loc, indata) -> str:
    """Gör en pydantic-sökväg som ('personal', 3, 'grad') begriplig: 'personal B1, sysselsättningsgrad'."""
    delar = []
    nod = indata
    for i, steg in enumerate(loc):
        if isinstance(steg, int) and isinstance(nod, list):
            post = nod[steg] if steg < len(nod) else None
            namn = post.get("id") if isinstance(post, dict) else None
            forra = loc[i - 1] if i else ""
            delar[-1:] = [f"{FALTNAMN.get(forra, forra)} {namn or f'rad {steg + 1}'}"] if delar else [f"rad {steg + 1}"]
            nod = post
        else:
            delar.append(FALTNAMN.get(str(steg), str(steg)))
            nod = nod.get(steg) if isinstance(nod, dict) else None
    return ", ".join(d for d in delar if d)


def _text(e, indata) -> list[str]:
    typ, loc, ctx = e["type"], e["loc"], e.get("ctx", {})
    # pydantic lägger till variantnamn för unioner/literals i sökvägen; ta bort dem
    loc = tuple(s for s in loc if not (isinstance(s, str) and ("[" in s or s in ("int", "str", "list[int]", "list[str]"))))
    plats = _plats(loc, indata)
    if typ in ("value_error", "assertion_error"):
        meddelande = str(ctx.get("error", e["msg"])).removeprefix("Value error, ")
        texter = meddelande.split("|")
        return [f"{plats}: {t}" if plats and not t[0].isupper() else (t[0].upper() + t[1:]) for t in texter]
    mallar = {
        "missing": "saknas",
        "extra_forbidden": "okänt fält – kontrollera stavningen",
        "int_parsing": "måste vara ett heltal", "int_type": "måste vara ett heltal",
        "int_from_float": "måste vara ett heltal",
        "float_parsing": "måste vara ett tal", "float_type": "måste vara ett tal",
        "bool_type": "måste vara sant eller falskt", "bool_parsing": "måste vara sant eller falskt",
        "string_type": "måste vara text", "list_type": "måste vara en lista", "dict_type": "måste vara en tabell",
        "string_pattern_mismatch": "måste vara ett klockslag som 07:30",
        "greater_than": f"måste vara större än {ctx.get('gt')}",
        "greater_than_equal": f"måste vara minst {ctx.get('ge')}",
        "less_than_equal": f"får vara högst {ctx.get('le')}",
        "too_short": "får inte vara tom",
        "string_too_short": "får inte vara tom",
        "string_too_long": f"får vara högst {ctx.get('max_length')} tecken",
        "literal_error": "måste vara något av: " + ctx.get("expected", "").replace("'", "").replace(" or ", " eller "),
    }
    text = mallar.get(typ, e["msg"])
    if typ == "less_than_equal" and loc and loc[-1] == "grad":
        text = "får vara högst 1 (100 %)"
    return [f"{plats}: {text}" if plats else text]


def kontrollera_indata(indata: dict) -> list[str]:
    """Returnera en lista med fel på svenska; tom lista betyder att indata är i ordning."""
    if not isinstance(indata, dict):
        return ["Indata måste vara ett JSON-objekt."]
    fel = []
    try:
        Indata.model_validate(indata)
    except ValidationError as ve:
        for e in ve.errors():
            for t in _text(e, indata):
                if t not in fel:
                    fel.append(t)
    return fel + [t for t in _helhet(indata) if t not in fel]


def las_indata(indata: dict) -> Indata:
    fel = kontrollera_indata(indata)
    if fel:
        raise IndataKontrollFel(fel)
    return Indata.model_validate(indata)
