// Steg 1 är den befintliga körningen. Steg 2 söker lokala förbättringar kring den.
const TVASTEG = (() => {
  const kvall = p => p?.dygnsdel === "kvall";
  function matt(rad, cykliskt) {
    let fyra = 0, kv = 0, helg = 0;
    for (let d = 0; d < rad.length; d++) {
      if (!kvall(rad[d])) continue;
      kv++; if (d % 7 >= 5) helg++;
      if ((cykliskt || d >= 3) && [1,2,3].every(i => kvall(rad[(d-i+rad.length)%rad.length]))) fyra++;
    }
    return [fyra, kv * kv, helg * helg];
  }
  const jamfor = (a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2];
  const flyttbar = p => p && !p.jour && !p.jourdel && !p.manuell && !p.extra_helg &&
    !p.aktiviteter?.length && ["morgon","kvall"].includes(p.dygnsdel);
  function byt(schema, a, b, d) {
    const x = schema[a].slice(), y = schema[b].slice();
    [x[d], y[d]] = [y[d], x[d]];
    return {...schema, [a]: x, [b]: y};
  }
  async function sok(k, granska) {
    const ind = k.indata, grund = k.resultat;
    if (!ind || !grund?.schema || grund.status !== "OK" || grund.brott?.length ||
        grund.avslappnade_krav?.length || !k.granskning?.giltigt)
      throw Error("Lägg och granska ett giltigt grundschema med oförändrade krav först.");
    let schema = grund.schema;
    const alternativ = [], byten = [], cyk = ind.cykliskt !== false;
    const skyddade = new Set((ind.onskemal || []).map(o => o.person));
    const personal = ind.personal.filter(p => !skyddade.has(p.id) && schema[p.id] &&
      ["kvall","morgon"].every(d => (p.dygnsdelar || ["kvall","morgon"]).includes(d)));
    let provade = 0;
    for (let steg = 0; steg < 2; steg++) {
      const val = [];
      for (let i=0; i<personal.length; i++) for (const q of personal.slice(i+1)) {
        const p = personal[i], a = p.id, b = q.id;
        if (p.grad !== q.grad || p.team !== q.team ||
            JSON.stringify([...(p.kompetenser||[])].sort()) !== JSON.stringify([...(q.kompetenser||[])].sort())) continue;
        const x = schema[a], y = schema[b], mx = matt(x,cyk), my = matt(y,cyk);
        for (let d=0; d<x.length; d++) {
          if (!flyttbar(x[d]) || !flyttbar(y[d]) || kvall(x[d]) === kvall(y[d]) ||
              x[d].netto !== y[d].netto || !Number.isFinite(x[d].netto) ||
              byten.some(v => v.d === d && [v.a,v.b].some(id => id === a || id === b))) continue;
          // Endast fyra fyradagarsfönster kan påverkas av ett byte på d.
          const fonsterDelta = (rad, ny) => {
            let delta=0;
            for(let start=d-3;start<=d;start++){
              if(!cyk && (start<0 || start+3>=rad.length)) continue;
              let andra=true;
              for(let t=start;t<start+4;t++){
                const j=(t+rad.length)%rad.length;
                if(j!==d && !kvall(rad[j])) andra=false;
              }
              if(andra) delta+=ny;
            }
            return delta;
          };
          const tecken=kvall(x[d]) ? -1 : 1;
          const diff=[fonsterDelta(x,tecken)+fonsterDelta(y,-tecken),
            2+2*tecken*(Math.sqrt(mx[1])-Math.sqrt(my[1])),
            d%7>=5 ? 2+2*tecken*(Math.sqrt(mx[2])-Math.sqrt(my[2])) : 0];
          if (jamfor(diff,[0,0,0]) < 0 && (val.length < 24 || jamfor(diff,val.at(-1).diff)<0)) {
            val.push({a,b,d,diff}); val.sort((a,b)=>jamfor(a.diff,b.diff));
            if(val.length>24) val.pop();
          }
        }
      }
      let hittat = false;
      for (const v of val) {
        const s = byt(schema,v.a,v.b,v.d);
        provade++;
        const g = await granska(s);
        if (!g?.giltigt) continue;
        byten.push({...v, fran: kvall(schema[v.a][v.d]) ? v.a : v.b, till: kvall(schema[v.a][v.d]) ? v.b : v.a});
        schema = s;
        alternativ.push({schema, byten:[...byten], g}); hittat = true; break;
      }
      if (!hittat) break;
    }
    return {alternativ, provade};
  }
  function kort() {
    return '<section class="kort"><h2>Förbättra grundschemat i två steg</h2><p>Utgå från den här körningen. Pröva dag–kvällsbyten för att bryta fyra kvällar i rad och fördela kvällar och helgkvällar jämnare. Jour och arbetade helger ligger kvar.</p><button type="button" data-tvasteg>Jämför med grundschemat</button><div aria-live="polite"></div></section>';
  }
  function installera(hamta, kontrollera, spara) {
    document.addEventListener("click", async e => {
      const knapp=e.target.closest("[data-tvasteg]"); if (!knapp) return;
      const ruta=knapp.nextElementSibling, k=hamta();
      knapp.disabled=true; ruta.textContent="Prövar byten och granskar reglerna …";
      try {
        const {alternativ,provade}=await sok(k, s=>kontrollera(k,s));
        if (!ruta.isConnected) return;
        ruta.replaceChildren();
        const rad = txt => { const el=document.createElement("p"); el.textContent=txt; ruta.append(el); };
        rad("Grundschema: 0 ändrade pass. "+provade+" förslag regelkontrollerades.");
        if (!alternativ.length) rad("Ingen godkänd förbättring hittades bland de prövade bytena.");
        alternativ.forEach(({schema,byten,g},i)=>{
          rad((i ? "B – ytterligare utjämning" : "A – ett byte")+" · "+(byten.length*2)+" pass får ny person · 0 hårda regelbrott.");
          byten.forEach(v=>rad("V"+(1+Math.floor(v.d/7))+" "+["mån","tis","ons","tor","fre","lör","sön"][v.d%7]+": "+v.fran+" lämnar kvällspasset till "+v.till+" och tar dagpasset."));
          for (const id of new Set(byten.flatMap(v=>[v.a,v.b]))) {
            const x=matt(k.resultat.schema[id],k.indata.cykliskt!==false), y=matt(schema[id],k.indata.cykliskt!==false);
            rad(id+": kvällar "+Math.sqrt(x[1])+" → "+Math.sqrt(y[1])+", helgkvällar "+Math.sqrt(x[2])+" → "+Math.sqrt(y[2])+", fyrakvällsföljder "+x[0]+" → "+y[0]+".");
          }
          const brist=g.varningar.filter(v=>v.regel==="KOMPETENS");
          rad("Kompetensluckor: "+(brist.length ? brist.map(v=>v.text).join(" · ") : "inga")+".");
          if (spara) {
            const b=document.createElement("button"); b.textContent="Spara "+(i?"B":"A")+" som ny körning"; ruta.append(b);
            b.onclick=async()=>{ b.disabled=true; try {await spara(k,schema,i);} catch(err){rad(err.message);b.disabled=false;} };
          }
        });
        if(alternativ.length===1) rad("Inget ytterligare godkänt byte hittades för B.");
      } catch(err){ruta.textContent=err.message;} finally {knapp.disabled=false;}
    });
  }
  return {sok,kort,installera,matt};
})();
if(typeof module!=="undefined") module.exports=TVASTEG;
