"use strict";
/* Publika, syntetiska demonstrator-metadata.
 * INNEHÅLLER INTE Partilles interna handbok eller några personuppgifter.
 * Regelnivåer är dokumentationsstatus, inte bevis på juridisk giltighet.
 */
const REGELSTOD_DATA = Object.freeze({
  utgava: "Pilot 2026-11-22",
  rubrik: "Bemanningsprocess & regelstöd",
  anmarkning: "Ej beslutad kommunal rutin eller juridiskt kvalitetssäkrat regelregister. Kontrollera alltid aktuella avtalslydelser och lokala beslut.",
  aribua: ["Attrahera", "Rekrytera", "Introducera", "Behålla", "Utveckla", "Avsluta/avveckla"],
  steg: [
    {
      id: "behov", namn: "1. Demografi och verksamhetsbehov",
      period: "År / kvartal", agare: "Chef, controller, verksamhetsutveckling",
      fraga: "Vad behöver invånarna och verksamheten – nu och framåt?",
      underlag: "SCB:s daterade befolkningsutfall, åldersgrupper, födda, avlidna, in-/utflyttning samt insatsvolymer och brukarbehov.",
      resultat: "Behovsbild med källa, mätperiod, osäkerheter och alternativa framtidsscenarier.",
      aribua: ["Rekrytera", "Utveckla"],
      lankar: [{namn:"SCB – befolkningsstatistik", url:"https://www.scb.se/BE0101"}]
    },
    {
      id: "kompetens", namn: "2. Kompetensförsörjning",
      period: "År / kvartal", agare: "Chef, HR, verksamhet",
      fraga: "Vilken kompetens finns, vilken saknas och hur bygger vi framtida kapacitet?",
      underlag: "Kompetenskrav, introduktion, handledning, utbildning, planerade avgångar och tillgänglig kompetens i arbete.",
      resultat: "Kompetensgap, utvecklingsbehov och handlingsalternativ kopplade till ARIBUA.",
      aribua: ["Attrahera", "Rekrytera", "Introducera", "Behålla", "Utveckla", "Avsluta/avveckla"],
      lankar: []
    },
    {
      id: "dimensionering", namn: "3. Bemanningsdimensionering och budget",
      period: "År / period", agare: "Chef, bemanningscontroller, ekonom",
      fraga: "Hur stor bemanning kräver behovet och vad finansieras?",
      underlag: "Behov per tidpunkt, kompetensmix, tillgängliga årsarbetare, frånvaroantaganden, övrig tid och budget.",
      resultat: "Behovstimmar, tillgänglig kapacitet och budgeterat utrymme – redovisade var för sig.",
      aribua: ["Rekrytera", "Behålla", "Utveckla"],
      lankar: []
    },
    {
      id: "grundschema", namn: "4. Grundschema och scenarioanalys",
      period: "Schemaperiod", agare: "Chef, schemaplanerare",
      fraga: "Vilken plan möter behovet med rätt kompetens och hållbara villkor?",
      underlag: "Arbetstidsmått, avtal, schemaönskemål, kompetens, resurstid och verksamhetskrav.",
      resultat: "Flera granskade alternativ med synliga målkonflikter för behov, kvalitet, arbetsmiljö och ekonomi.",
      aribua: ["Attrahera", "Behålla", "Utveckla"],
      lankar: []
    },
    {
      id: "aktivering", namn: "5. Godkännande och aktivering",
      period: "Före schemaperiod", agare: "Behörig chef",
      fraga: "Är planen granskad, beslutad och tydlig för medarbetarna?",
      underlag: "Valt grundschema, självständig regelgranskning, dokumenterat beslut och datum för ikraftträdande.",
      resultat: "Låst schemaversion. Kommande förändringar sparas som separata händelser.",
      aribua: ["Behålla"],
      lankar: []
    },
    {
      id: "daglig", namn: "6. Daglig bemanningsstyrning",
      period: "Dag / vecka", agare: "Chef, samordnare, schemaplanerare",
      fraga: "Finns ett faktiskt täckningsbehov och hur bör det lösas?",
      underlag: "Aktiverat schema, ändrat behov, frånvaro, kompetens, resurstid och andra tillgängliga resurser.",
      resultat: "Motiverat beslut om intern resurs, omfördelning eller vikarie; kontroll av regelverk och historik.",
      aribua: ["Behålla", "Introducera"],
      lankar: []
    },
    {
      id: "utfall", namn: "7. Plan mot faktiskt utfall",
      period: "Vecka / månad", agare: "Chef, controller, ekonom",
      fraga: "Hur blev behovet täckt och vad kostade det?",
      underlag: "Behov, fastställd plan, avvikelse, faktiskt arbetad tid, kompetenstäckning och kostnad.",
      resultat: "Avvikelser, KPI:er, orsakskoder, konsekvenser och rekommenderade åtgärder.",
      aribua: ["Behålla", "Utveckla"],
      lankar: []
    },
    {
      id: "larande", namn: "8. Förbättring och långsiktigt lärande",
      period: "Månad / kvartal / år", agare: "Ledning, controller, HR",
      fraga: "Är problemet operativt eller behöver grundförutsättningarna ändras?",
      underlag: "Uppföljning av verksamhet, kvalitet, arbetsmiljö, ekonomi, introduktion och kompetensförsörjning.",
      resultat: "Förbättringsbeslut, ansvarig, tidplan, baslinje och uppföljningspunkt.",
      aribua: ["Attrahera", "Rekrytera", "Introducera", "Behålla", "Utveckla", "Avsluta/avveckla"],
      lankar: []
    }
  ],
  regler: [
    {id:"dygnsvila",rubrik:"Dygnsvila – huvudregel",omrade:"Arbetstid",status:"avtalskontroll",
      sammanfattning:"11 timmars sammanhängande dygnsvila inom varje 24-timmarsperiod är huvudregeln. Bedöm dygnsbryt, hela perioder, jour, avvikelser och kompenserande vila mot gällande lydelse.",
      referens:"ATL, AB § 13 och SKR:s vägledning",url:"https://skr.se/arbetsgivarrollen/forlaggningavarbetstid/bestammelseromdygnsvila.8060.html"},
    {id:"veckovila",rubrik:"Veckovila",omrade:"Arbetstid",status:"avtalskontroll",
      sammanfattning:"Minst 36 timmars sammanhängande veckovila är huvudregel; kontrollera rätt sjudagarsperiod och eventuella avtalsbestämmelser.",
      referens:"ATL och AB",url:"https://skr.se/kollektivavtal/allmannabestammelser.655.html"},
    {id:"fridagar",rubrik:"Arbetstillfällen och fridagar – 4,75",omrade:"Schemaläggning",status:"avtalskontroll",
      sammanfattning:"4,75 arbetstillfällen i genomsnitt per vecka används som planeringsutgångspunkt för berörda scheman. Kontrollera aktuell HÖK, dygnsbryt, beräkningsperiod och verksamhetens lokala tillämpning.",
      referens:"HÖK 25, Kommunal – villkor måste verifieras",url:"https://skr.se/kollektivavtal/huvudoverenskommelsehok/huvudoverenskommelsehokmedsvenskakommunalarbetareforbundet.8205.html"},
    {id:"rast",rubrik:"Rast och måltidsuppehåll",omrade:"Arbetstid",status:"avtalskontroll",
      sammanfattning:"Kontrollera att raster läggs enligt lag och tillämpligt avtal. Måltidsuppehåll är inte samma sak som rast; särskilda förutsättningar gäller.",
      referens:"Arbetstidslagen och AB",url:"https://www.av.se/arbetsmiljoarbete-och-inspektioner/lagar-och-regler-om-arbetsmiljo/om-arbetstidslagen/"},
    {id:"jour",rubrik:"Jour och Bilaga J",omrade:"Särskilda avtal",status:"avtalskontroll",
      sammanfattning:"Utgå från aktuell avtalsprofil och verifiera hur arbete, jour, ersättning och vila ska beräknas i den aktuella verksamheten.",
      referens:"AB och Bilaga J, aktuell version krävs",url:"https://skr.se/kollektivavtal/allmannabestammelser.655.html"},
    {id:"os",rubrik:"ÖS – önskad sysselsättningsgrad",omrade:"Kompetensförsörjning",status:"historisk-lokal",
      sammanfattning:"Den historiska handboken innehåller lokal rutin om önskad sysselsättningsgrad. Aktuella ansökningstider, procentsatser och beslutsvägar måste bekräftas av HR.",
      referens:"Partilles bemanningshandbok v1.0 (2022) – inte publicerad i denna modul",url:null},
    {id:"grundschema",rubrik:"Grundschema, periodplanering och fastställande",omrade:"Schemaläggning",status:"historisk-lokal",
      sammanfattning:"Separera grundschema, periodanpassning och godkänt schema. Historiska lokala tidsgränser och periodlängder ska valideras innan de görs bindande.",
      referens:"Partilles bemanningshandbok v1.0 (2022) – historiskt underlag",url:null},
    {id:"samplanering",rubrik:"Samplanering och resurstid",omrade:"Bemanningsprocess",status:"historisk-lokal",
      sammanfattning:"Pröva faktisk behovstäckning, kompetens och introduktion innan intern omfördelning. Kontrollera att samplaneringsområden och ansvarsfördelning fortfarande gäller.",
      referens:"Partilles bemanningshandbok v1.0 (2022) – historiskt underlag",url:null},
    {id:"vakanser",rubrik:"Frånvaro, bedömt behov och vikarie",omrade:"Bemanningsprocess",status:"processforslag",
      sammanfattning:"Frånvaro är inte automatiskt en vakans. Bedöm behovet och pröva resurstid samt interna alternativ innan eventuellt vikariebehov beslutas.",
      referens:"Dodex helhetsvision – förslag, ej antagen lokal rutin",url:null},
    {id:"avtal",rubrik:"Kollektivavtal och lokala riktlinjer",omrade:"Styrning",status:"avtalskontroll",
      sammanfattning:"Varje tillämpning ska ha versions- och datummärkt central källa, avtalsområde, lokalt beslut och kontrollansvarig. AI får aldrig besluta om undantag själv.",
      referens:"SKR – Allmänna bestämmelser",url:"https://skr.se/kollektivavtal/allmannabestammelser.655.html"}
  ]
});
if (typeof module !== "undefined" && module.exports) module.exports = REGELSTOD_DATA;
