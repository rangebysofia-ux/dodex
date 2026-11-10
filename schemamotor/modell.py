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
DELNAMN_TEXT = {"morgon": "dag", "kvall": "kväll", "natt": "natt"}
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
    "namn": "namn", "fran_golvet": "från golvet", "minst_pa_golvet": "minst på golvet",
}

Klocka = Annotated[str, Field(pattern=r"^([01]?\d|2[0-3]):[0-5]\d$")]


STANDARDREGLER = {
    "dygnsvila_minuter", "veckovila_minuter", "dygnsbryt", "dygnsbryt_natt", "veckobryt", "rast_grans_minuter", "rast_minuter",
    "pass_per_vecka", "morgon_start", "kvall_slut", "kant_fran", "kant_till", "steg_minuter", "block_min",
    "block_max", "block_rekommenderat", "natt_max_i_rad", "natt_vila_mellan_block_minuter", "morgon_starter", "kvall_max_i_rad", "kvall_i_rad_typ", "helg_start", "helg_slut", "hel_helg", "helgfrekvens",
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
    # extra helgpass (användarens beslut 2026-11-10): högst så många lördagar eller söndagar på lediga helger per
    # schemaperiod, ett pass per helg. Ersätter ett vardagspass. Undantag från varannan helg, bara per person.
    extra_helgpass: int = Field(default=0, ge=0, le=4)
    tolerans_minuter: Optional[int] = Field(default=None, ge=0)
    heltid_minuter_per_vecka: Optional[int] = Field(default=None, gt=0)
    dygnsbryt: Optional[Klocka] = None
    # hemteam (id i indata.team); personen kan ändå lånas ut till ett annat team när det behövs
    team: Optional[str] = Field(default=None, min_length=1, max_length=40)
    # kompetenser (id i indata.kompetenser), till exempel undersköterska eller läkemedelsdelegering (docs/kompetens.md)
    kompetenser: list[str] = Field(default_factory=list)
    # jour efter kvällspasset (när enheten har jour); false = den här personen har inte jour
    jour: Optional[bool] = None

    @field_validator("dygnsdelar")
    @classmethod
    def natt_ensam(cls, v):
        if v is not None:
            if not v:
                raise ValueError("ange minst en dygnsdel")
            if "natt" in v and len(v) > 1:
                raise ValueError("nattpersonal kan bara ha dygnsdelen natt")
        return v


class Team(Strikt):
    """Ett team i arbetsgruppen med eget behov. Personalen är gemensam men har ett hemteam (se docs/team.md)."""
    id: str = Field(min_length=1, max_length=40)
    namn: str = Field(default="", max_length=80)
    farg: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")  # bara för visning
    behov: dict[str, dict[str, int]] = Field(default_factory=dict)

    @field_validator("behov")
    @classmethod
    def dagnycklar(cls, v):
        for nyckel, varde in v.items():
            if nyckel not in DAGNYCKLAR:
                raise ValueError(f"okänd dag: {nyckel} (använd vardag, helg, alla eller {', '.join(DAGNAMN)})")
            for del_, antal in varde.items():
                if del_ not in DYGNSDELAR:
                    raise ValueError(f"okänd dygnsdel: {del_} (använd morgon, kvall eller natt)")
                if antal < 0:
                    raise ValueError(f"behovet för {nyckel} {del_} kan inte vara negativt")
        return v


class Jour(Strikt):
    """Jourpass över dygnet (Bilaga J, AB 25 § 13 mom. 5; docs/regelverk.md): arbete från `start` till midnatt, jour
    `jour_fran`–`jour_till` och arbete till `slut` dagen efter. Ett pass som belastar två arbetsdagar. Högst 20 timmar.
    `andel_arbetstid` = hur stor del av jourtiden som räknas som arbetstid. `behov` = jourpass per natt."""
    start: Klocka = "15:00"
    slut: Klocka = "08:00"
    jour_fran: Klocka = "00:00"
    jour_till: Klocka = "06:00"
    andel_arbetstid: float = Field(default=0.5, ge=0, le=1)
    behov: dict[str, int] = Field(default_factory=dict)

    @model_validator(mode="after")
    def tider(self):
        t = lambda s: int(s[:2]) * 60 + int(s[3:])
        if t(self.start) < 12 * 60:
            raise ValueError("jourpasset ska börja på eftermiddagen eller kvällen (efter kl. 12)")
        if not (t(self.jour_fran) < t(self.jour_till) <= t(self.slut) < 12 * 60):
            raise ValueError("jouren ska ligga efter midnatt och före passets slut på morgonen")
        if 24 * 60 - t(self.start) + t(self.slut) > 20 * 60:
            raise ValueError("arbete och jour i följd får vara högst 20 timmar (AB 25 § 13 mom. 5)")
        return self

    @field_validator("behov")
    @classmethod
    def dagnycklar(cls, v):
        for nyckel, antal in v.items():
            if nyckel not in DAGNYCKLAR:
                raise ValueError(f"okänd dag: {nyckel} (använd vardag, helg, alla eller {', '.join(DAGNAMN)})")
            if antal < 0:
                raise ValueError(f"jourbehovet för {nyckel} kan inte vara negativt")
        return v


class Starttid(Strikt):
    """Så många av dagpassen som börjar vid en viss tid (docs/starttider.md)."""
    tid: Klocka
    antal: int = Field(ge=1, le=50)


class Starttider(Strikt):
    morgon: list[Starttid] = Field(default_factory=list)

    @field_validator("morgon")
    @classmethod
    def unika(cls, v):
        tider = [s.tid for s in v]
        if len(set(tider)) != len(tider):
            raise ValueError("samma starttid finns flera gånger")
        return v


class Kompetens(Strikt):
    """En kompetens i enheten, till exempel undersköterska eller läkemedelsdelegering (docs/kompetens.md)."""
    id: str = Field(min_length=1, max_length=40)
    namn: str = Field(default="", max_length=80)
    kort: Optional[str] = Field(default=None, max_length=6)  # märkning i schemat, till exempel SSK
    farg: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")  # bara för visning


class Kompetenskrav(Strikt):
    """Minst så många med kompetensen i tjänst per dag och dygnsdel. Mjukt, direkt efter behovet (vakanserna):
    motorn väljer vilka som arbetar så att kraven täcks, men lägger aldrig ett extra pass för det."""
    id: Optional[str] = Field(default=None, max_length=40)
    kompetens: str = Field(min_length=1, max_length=40)
    behov: dict[str, dict[str, int]] = Field(default_factory=dict)

    @field_validator("behov")
    @classmethod
    def dagnycklar(cls, v):
        for nyckel, varde in v.items():
            if nyckel not in DAGNYCKLAR:
                raise ValueError(f"okänd dag: {nyckel} (använd vardag, helg, alla eller {', '.join(DAGNAMN)})")
            for del_, antal in varde.items():
                if del_ not in DYGNSDELAR:
                    raise ValueError(f"okänd dygnsdel: {del_} (använd morgon, kvall eller natt)")
                if antal < 0:
                    raise ValueError(f"kravet för {nyckel} {del_} kan inte vara negativt")
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
    # minsta antal i tjänst på golvet under aktiviteten; andras pass förlängs vid behov
    minst_pa_golvet: Optional[int] = Field(default=None, ge=0)
    typ: Optional[Literal["apt", "utbildning", "mote", "studier", "dokumentation", "handledning", "annat"]] = None
    farg: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")  # bara för visning
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


class BehovsPass(Strikt):
    """Ett pass i bemanningsbalansens behov: dagar, tider, rast och antal per dag. Jour räknas med räknad tid."""
    dagar: Literal["mån", "tis", "ons", "tor", "fre", "lör", "sön", "vardag", "helg", "lör-sön", "alla", "mån-sön"] = "mån-sön"
    fran: Klocka
    till: Klocka
    rast_minuter: int = Field(default=0, ge=0)
    antal: float = Field(default=1, ge=0)
    typ: Optional[Literal["pass", "natt", "jour"]] = None
    raknad_minuter: Optional[int] = Field(default=None, ge=0)


class OvrigTid(Strikt):
    namn: str = ""
    tillfallen_ar: float = Field(default=0, ge=0)
    timmar: float = Field(default=0, ge=0)
    personer: float = Field(default=0, ge=0)


class Bemanningsbalans(Strikt):
    """Bemanningsbalans som i verksamhetens Excel-mall (schemamotor/bemanningsbalans.py). Påverkar inte lösningen."""
    buffert_procent: Optional[float] = Field(default=None, ge=0, le=100)
    pass_: list[BehovsPass] = Field(default_factory=list, alias="pass")
    ovrig_tid: list[OvrigTid] = Field(default_factory=list)
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Indata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enhet: str = ""
    veckor: int = Field(ge=1, le=16)
    cykliskt: bool = True
    delperioder: Optional[list[int]] = None
    start_iso_vecka: Optional[int] = Field(default=None, ge=1, le=53)
    heltid_minuter_per_vecka: int = Field(default=2220, gt=0)
    # heltid för nattpersonal (dygnsdelar natt) utan egen heltid: 34 h 20 min (AB 25 § 13 mom. 2, kontinuerligt treskift)
    heltid_natt_minuter_per_vecka: int = Field(default=2060, gt=0)
    regler: dict = Field(default_factory=dict)
    nattpass: Optional[list[Nattpass]] = None
    extra_passmallar: list[ExtraPassmall] = Field(default_factory=list)
    behov: dict[str, dict[str, int]] = Field(default_factory=dict)
    tidpunkter: dict[str, list[Tidpunkt]] = Field(default_factory=dict)
    personal: list[Person] = Field(min_length=1)
    onskemal: list[Onskemal] = Field(default_factory=list)
    aktiviteter: list[Aktivitet] = Field(default_factory=list)
    team: list[Team] = Field(default_factory=list)
    kompetenser: list[Kompetens] = Field(default_factory=list)
    # jour efter kvällspasset (AB 25 § 13 mom. 5, Bilaga J; docs/regelverk.md)
    jour: Optional[Jour] = None
    # olika starttider för dagpassen: av dagbehovet börjar så många vid varje tid (docs/starttider.md)
    starttider: Optional[Starttider] = None
    kompetenskrav: list[Kompetenskrav] = Field(default_factory=list)
    bemanningsbalans: Optional[Bemanningsbalans] = None
    losare: dict = Field(default_factory=dict)
    # valt regelverk (docs/regelverk.md); värdena står i regler, heltid och avvikelser, namnet visas för användaren
    regelverk: Optional[Literal["dag-kvall-helg", "40-timmar", "bilaga-j"]] = None
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
    # team: unika id, personernas hemteam finns, och teamens behov ryms i enhetens behov
    team = [t for t in d.get("team") or [] if isinstance(t, dict)]
    tid_ = [str(t.get("id")) for t in team]
    if len(set(tid_)) != len(tid_):
        fel.append("Samma team finns flera gånger.")
    okanda_team = sorted({str(p["team"]) for p in personal if p.get("team") and str(p["team"]) not in tid_})
    if okanda_team:
        fel.append(f"Medarbetare har ett team som inte finns: {', '.join(okanda_team)}.")
    if team and isinstance(d.get("behov"), dict):
        def per_dag(spec):
            ut = [{} for _ in range(7)]
            for k, v in (spec or {}).items():
                idx = {"vardag": range(5), "helg": range(5, 7), "alla": range(7)}.get(k, [DAGNAMN.index(k)] if k in DAGNAMN else [])
                for i in idx:
                    if isinstance(v, dict):
                        ut[i] = v
            return ut
        enhet = per_dag(d.get("behov"))
        summa = [{x: sum(int((per_dag(t.get("behov"))[i] or {}).get(x, 0) or 0) for t in team) for x in DYGNSDELAR} for i in range(7)]
        for i in range(7):
            for x in DYGNSDELAR:
                if summa[i][x] > int(enhet[i].get(x, 0) or 0):
                    fel.append(f"Teamens behov {DAGNAMN[i]} {DELNAMN_TEXT[x]} ({summa[i][x]}) är större än enhetens behov ({int(enhet[i].get(x, 0) or 0)}).")
                    break
            else:
                continue
            break
    # kompetenser: unika id, och medarbetarnas kompetenser och kraven finns i enhetens lista
    komp = [str(k.get("id")) for k in d.get("kompetenser") or [] if isinstance(k, dict)]
    if len(set(komp)) != len(komp):
        fel.append("Samma kompetens finns flera gånger.")
    okanda_komp = sorted({str(k) for p in personal for k in (p.get("kompetenser") or []) if str(k) not in komp})
    if okanda_komp:
        fel.append(f"Medarbetare har en kompetens som inte finns i enhetens lista: {', '.join(okanda_komp)}.")
    okanda_krav = sorted({str(k.get("kompetens")) for k in d.get("kompetenskrav") or [] if isinstance(k, dict) and str(k.get("kompetens")) not in komp})
    if okanda_krav:
        fel.append(f"Ett kompetenskrav gäller en kompetens som inte finns i enhetens lista: {', '.join(okanda_krav)}.")
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
    for k in ("dygnsbryt", "dygnsbryt_natt"):
        v = regler.get(k)
        if v is not None and v != "auto" and not (isinstance(v, str) and re.match(r"^([01]?\d|2[0-3]):[0-5]\d$", v)):
            fel.append(f"{'Dygnsbryt för nattpersonal' if k.endswith('natt') else 'Dygnsbryt'} ska vara auto eller ett klockslag, till exempel 15:00.")
    if regler.get("kvall_i_rad_typ") not in (None, "mjuk", "hard"):
        fel.append("Kvällar i rad ska vara mjuk eller hard.")
    ms = regler.get("morgon_starter")
    if ms is not None and (not isinstance(ms, list) or any(not isinstance(t, str) or not re.match(r"^([01]?\d|2[0-3]):[0-5]\d$", t) for t in ms)):
        fel.append("Starttider för dagpass ska vara en lista med klockslag, till exempel 06:30, 07:00, 07:30.")
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
