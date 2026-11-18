// ===================================================================
//  DÜŞMAN KOLONİSİ — çağ ilerletir, oda kurar, ordu toplar, dalga gönderir
// ===================================================================
"use strict";

const ai = { wave:0, next:190, bt:16, digT:6, techT:30, scoutT:60, lastHit:0, saveT:55, lastAge:0 };

function aiTeam(){ return st.teams[ENEMY]; }
function aiHave(type){ return blds.filter(b=>b.team===ENEMY&&b.type===type).length; }
function aiNest(){ return blds.find(b=>b.team===ENEMY&&b.type==='nest'); }

function enemyAI(dt){
  if(st.over) return;
  const T=aiTeam(), D=DIFFS[st.diff], g=st.time;
  // gelir (yapay zekâ için basitleştirilmiş ekonomi + gerçek işçiler)
  const inc=D.inc*(1.0+g/300);
  T.res.f+=dt*2.3*inc; T.res.l+=dt*2.0*inc; T.res.m+=dt*1.1*inc; T.res.d+=dt*0.5*inc;

  // ---- çağ birikimi: sınırlı süre, ordu zayıfsa hiç yok
  const nest=aiNest();
  const armyN=units.filter(u=>u.team===ENEMY&&!u.d.work&&u.type!=='queen'&&u.type!=='scout').length;
  const nxId=T.age<4?('age'+(T.age+1)):null;
  const nxCost=nxId?techCost(ENEMY,nxId):null;
  if(ai.lastAge!==T.age){ ai.lastAge=T.age; ai.saveT=55; }
  if(nxId&&!nest?.rq&&g>45*T.age) ai.saveT-=dt; else ai.saveT=Math.min(55,(ai.saveT||55)+dt*0.5);
  const saving = !!nxId && g>45*T.age && !nest?.rq && armyN>=6 && ai.saveT>0;

  // ---- çağ yükseltme
  if(nest&&!nest.rq&&nest.q.length===0){
    const next=T.age===1?'age2':(T.age===2?'age3':(T.age===3?'age4':null));
    if(next&&techReady(ENEMY,next)&&ageReqMet(ENEMY)&&g>45*T.age){
      const c=techCost(ENEMY,next);
      for(const k in c) c[k]=Math.round(c[k]*0.7);      // yapay zekâ indirimi
      if(canPay(ENEMY,c)){ pay(ENEMY,c); nest.rq={id:next,p:0,t:TECHS[next].t*0.7}; }
    }
  }
  // ---- oda kurma
  ai.bt-=dt;
  if(ai.bt<=0){
    ai.bt=rnd(20,32)/D.inc;
    let want=null;
    if(popCap(ENEMY)-popOf(ENEMY)<6) want='house';          // nüfus sınırı yaklaşınca ev
    else if(aiHave('brood')<2) want='brood';
    else if(aiHave('farm')<2) want='farm';
    else if(T.age>=2&&aiHave('barracks')<1) want='barracks';
    else if(T.age>=2&&aiHave('aphid')<1) want='aphid';
    else if(T.age>=2&&aiHave('tower')<2) want='tower';
    else if(T.age>=3&&aiHave('chem')<1) want='chem';
    else if(T.age>=3&&aiHave('pherom')<1) want='pherom';
    else if(T.age>=3&&aiHave('brood')<3) want='brood';
    else if(aiHave('farm')<4) want='farm';
    else if(T.age>=4&&aiHave('swarm')<1) want='swarm';
    else if(aiHave('barracks')<2) want='barracks';
    else if(aiHave('tower')<5) want='tower';
    // çağ parası biriktiriyorsa lüks odaları erteler
    if(want&&saving&&!['brood','farm','barracks'].includes(want)){
      let blocked=false;
      for(const k in nxCost) if((T.res[k]||0)-(BLDS[want].cost[k]||0) < nxCost[k]*0.8) blocked=true;
      if(blocked) want=null;
    }
    if(want&&BLDS[want].age<=T.age&&canPay(ENEMY,BLDS[want].cost)&&nest){
      const d=BLDS[want];
      for(let i=0;i<70;i++){
        const x=Math.floor(nest.x+rnd(-12,12)), y=Math.floor(nest.y+rnd(-9,9));
        if(canPlaceAt(x,y,d,ENEMY)){ pay(ENEMY,d.cost); mkBld(want,ENEMY,x,y,false); break; }
      }
    }
  }
  // ---- araştırma
  ai.techT-=dt;
  if(ai.techT<=0){
    ai.techT=rnd(25,45);
    for(const b of blds){
      if(b.team!==ENEMY||b.built<1||b.rq||!b.d.techs) continue;
      for(const id of b.d.techs){
        if(TECHS[id].agetech) continue;
        if(techReady(ENEMY,id)&&canPay(ENEMY,techCost(ENEMY,id))){
          pay(ENEMY,techCost(ENEMY,id)); b.rq={id,p:0,t:TECHS[id].t}; break;
        }
      }
    }
  }
  // ---- kazma işleri (üssü genişlet)
  ai.digT-=dt;
  if(ai.digT<=0&&digQ[ENEMY].length<10&&nest){
    ai.digT=3;
    for(let i=0;i<30;i++){
      const x=Math.floor(nest.x+rnd(-13,13)), y=Math.floor(nest.y+rnd(-10,10));
      if(inB(x,y)&&diggable(tiles[ti(x,y)])&&hasOpenNbr(x,y)){ digQ[ENEMY].push({x,y,p:0}); break; }
    }
  }
  // ---- birim üretimi
  const ew=units.filter(u=>u.team===ENEMY&&u.type==='worker').length;
  const ec=units.filter(u=>u.team===ENEMY&&u.type==='cutter').length;
  const eh=units.filter(u=>u.team===ENEMY&&u.type==='herder').length;
  const pop=popOf(ENEMY), cap=popCap(ENEMY);
  const soft=Math.min(cap, (10+g/13)*D.cap);
  for(const b of blds){
    if(b.team!==ENEMY||b.built<1||!b.d.trains||b.q.length>1||pop>=soft) continue;
    let want=null;
    if(b.type==='brood'){
      if(ew<8) want='worker'; else if(ec<5) want='cutter';
      else if(eh<3&&T.age>=2) want='herder';
      else if(units.filter(u=>u.team===ENEMY&&u.type==='scout').length<2) want='scout';
      else if(T.age>=3) want='worker';
    } else if(b.type==='barracks'){
      const r=Math.random();
      if(T.age>=4&&r<0.25) want='bullet';
      else if(T.age>=3&&r<0.5) want=Math.random()<0.5?'major':'trapjaw';
      else want='soldier';
    } else if(b.type==='chem') want='spitter';
    else if(b.type==='swarm') want=Math.random()<0.9?'armyant':null;
    if(!want) continue;
    const d=ANTS[want];
    if(saving&&want!=='worker'&&want!=='cutter'){            // çağ parası bozulmasın
      let blocked=false;
      for(const k in nxCost) if((T.res[k]||0)-(d.cost[k]||0) < nxCost[k]*0.9) blocked=true;
      if(blocked) continue;
    }
    if(d.age<=T.age&&canPay(ENEMY,d.cost)){ pay(ENEMY,d.cost); b.q.push({type:want,p:0}); }
  }
  // ---- keşif
  ai.scoutT-=dt;
  if(ai.scoutT<=0){
    ai.scoutT=rnd(50,90);
    const sc=units.find(u=>u.team===ENEMY&&u.type==='scout'&&u.state==='idle');
    const pn=blds.find(b=>b.team===PLAYER&&b.d.store);
    if(sc&&pn){ sc.state='amove'; order(sc,Math.floor(pn.x)+ri(-6,6),Math.floor(pn.y)+ri(-4,4),true); }
  }
  // ---- saldırı dalgaları
  // Oyuncu asker üretebilir duruma gelmeden ilk dalga gelmez (çok uzun sürerse 10. dakikada başlar)
  const canFight = blds.some(b=>b.team===PLAYER&&b.type==='barracks'&&b.built>=1)
                || units.some(u=>u.team===PLAYER&&!u.d.work&&u.type!=='queen'&&u.type!=='scout');
  if(ai.wave===0 && !canFight && g<600){
    ai.next=Math.max(ai.next,20);
    if(!ai.hinted && g>120){ ai.hinted=1;
      addAlert('🕊 Kızıl koloni henüz saldırmıyor — Savaş Odası kurup ordunu hazırla','ok'); }
  }
  ai.next-=dt;
  if(ai.next<=0){
    const army=units.filter(u=>u.team===ENEMY&&!u.d.work&&u.type!=='queen'&&u.type!=='scout'&&u.state!=='amove');
    const need=Math.min(4+ai.wave*2, 22);
    if(army.length>=need){
      ai.wave++; ai.next=Math.max(55,150-ai.wave*7)*DIFFS[st.diff].wave;
      const tgt=pickTarget();
      let sent=0;
      for(const u of army){ if(sent>=need+6)break;
        u.state='amove'; u.tgt=null; u.auto=null; u.dest={x:tgt.x,y:tgt.y};
        if(order(u,Math.floor(tgt.x)+ri(-3,3),Math.floor(tgt.y)+ri(-2,2),true)) sent++; else u.state='idle'; }
      if(sent>2){ addAlert('⚔ '+sent+' kızıl karınca saldırıya geçti! (Dalga '+ai.wave+')');
        msg('⚠ Düşman dalgası geliyor — Dalga '+ai.wave); }
      else ai.next=20;
    } else ai.next=15;
  }
  // savunma: üssü saldırı altındaysa herkesi topla
  if(E.under>0&&Math.random()<dt*2){
    const nest2=aiNest();
    for(const u of units) if(u.team===ENEMY&&!u.d.work&&u.state==='idle'&&nest2&&dist(u,nest2)>8){
      u.state='amove'; u.dest={x:nest2.x,y:nest2.y}; order(u,Math.floor(nest2.x),Math.floor(nest2.y),true); }
  }
}
function pickTarget(){
  // öncelik: öne çıkmış oyuncu odaları, yoksa ana yuva
  const mine=blds.filter(b=>b.team===PLAYER);
  const nest=mine.find(b=>b.type==='nest');
  if(!mine.length) return {x:16,y:46};
  const en=aiNest()||{x:MW-20,y:46};
  let best=nest||mine[0], bd=1e9;
  for(const b of mine){ const d=Math.hypot(b.x-en.x,b.y-en.y);
    if(d<bd && Math.random()<0.75){ bd=d; best=b; } }
  return Math.random()<0.55 ? (nest||best) : best;
}
function hasOpenNbr(x,y){ for(const[dx,dy] of DIRS) if(walk(x+dx,y+dy)) return true; return false; }
