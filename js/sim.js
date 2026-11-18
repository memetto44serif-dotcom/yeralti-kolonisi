// ===================================================================
//  SİMÜLASYON — kastlar, odalar, işler, savaş, yaban hayatı, ekonomi
// ===================================================================
"use strict";

let units=[], blds=[], nodes=[], shots=[], parts=[], digQ=[[],[]];
let bgrid, nextId=1;
let P, E;   // oyuncu / düşman takım durumu

function defEff(){ return {dmg:0,arm:0,carry:0,trainSpd:0,gatherSpd:0,farm:0,aphid:0,acid:0,slow:0,
  regen:0,recycle:0,spd:0,rage:0,flood:0,winter:0,swarm:0,vision:0,buildSpd:0}; }
function mkTeam(){ return {res:{f:320,l:180,m:140,d:0}, age:1, tech:{}, lvl:{}, eff:defEff(),
  under:0, idle:0}; }

const st = { teams:[mkTeam(),mkTeam()], diff:1, speed:1, paused:false, over:0, time:0, kills:[0,0] };

// ------------------------------------------------------------ yardımcılar
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function costStr(c){ let s=''; for(const r of RESL) if(c&&c[r.k]) s+=r.ic+c[r.k]+' '; return s.trim(); }
function canPay(t,c){ const R=st.teams[t].res; for(const k in c) if(R[k]<c[k]) return false; return true; }
function pay(t,c){ const R=st.teams[t].res; for(const k in c) R[k]-=c[k]; }
function refund(t,c){ const R=st.teams[t].res; for(const k in c) R[k]+=c[k]*0.75; }

function atTile(u,tx,ty,r){ return Math.max(Math.abs(Math.floor(u.x)-tx),Math.abs(Math.floor(u.y)-ty))<=(r||1); }
function atBld(u,b){ const x=Math.floor(u.x), y=Math.floor(u.y);
  return x>=b.tx-1&&x<b.tx+b.d.w+1&&y>=b.ty-1&&y<b.ty+b.d.h+1; }
function edgeDist(px,py,b){
  const cx=clamp(px,b.tx,b.tx+b.d.w), cy=clamp(py,b.ty,b.ty+b.d.h);
  return Math.hypot(px-cx,py-cy);
}
let bldById=new Map();
function bldAt(x,y){ if(!inB(x,y))return null; const i=bgrid[ti(x,y)]; return i?(bldById.get(i)||null):null; }
function gateAt(x,y){ const b=bldAt(x,y); return b&&b.d.gate&&b.built>=1?b:null; }
function regrid(){ bgrid.fill(0); bldById.clear(); for(const b of blds) bldById.set(b.id,b);
  for(const b of blds) for(let y=b.ty;y<b.ty+b.d.h;y++)for(let x=b.tx;x<b.tx+b.d.w;x++)
    if(inB(x,y)) bgrid[ti(x,y)]=b.id; }

// ------------------------------------------------------------ varlık üretimi
function mkUnit(type,team,x,y){
  const d=ANTS[type], T=st.teams[team];
  const hpm=1+(T?T.eff.arm:0)+ (T? (T.age-1)*0.05 : 0);
  const u={id:nextId++,type,team,d,x,y,hp:d.hp*hpm,mhp:d.hp*hpm,
    state:'idle',path:null,pi:0,tgt:null,job:null,carry:0,cres:'f',cd:0,think:Math.random(),
    ang:0,leg:Math.random()*6,rep:0,stun:0,slow:0,poison:0,stance:'def',auto:null,wild:0};
  units.push(u); return u;
}
function mkWild(type,x,y){
  const w=WILD[type];
  const d={n:w.n,hp:w.hp,dmg:w.dmg,rng:w.r/8+0.8,spd:w.spd,cd:1.2,vis:9,r:w.r,col:w.col,desc:w.desc};
  const u={id:nextId++,type,team:NEUTRAL,d,wd:w,wild:1,x,y,hp:w.hp,mhp:w.hp,
    state:'wander',path:null,pi:0,tgt:null,cd:0,think:Math.random(),ang:0,leg:0,rep:0,
    stun:0,slow:0,poison:0,job:null,carry:0,digP:0,home:{x,y}};
  units.push(u); return u;
}
function mkBld(type,team,tx,ty,done){
  const d=BLDS[type], T=st.teams[team];
  const mhp=d.hp*(1+(T?T.eff.arm*0.5:0));
  const b={id:nextId++,type,team,d,tx,ty,x:tx+d.w/2,y:ty+d.h/2,
    hp:done?mhp:mhp*0.12,mhp,built:done?1:0,q:[],rq:null,cd:0,rally:null,herders:0,acc:0};
  blds.push(b); regrid();
  if(d.gate||done) for(let y=ty;y<ty+d.h;y++)for(let x=tx;x<tx+d.w;x++)
    if(inB(x,y)&&!walk(x,y)) setTile(x,y,T_TUN);
  return b;
}
function mkNode(x,y,res,kind,a){ const n={x,y,res,kind,a,w:0,bad:0}; nodes.push(n); return n; }

// ------------------------------------------------------------ nüfus
function popOf(t){ let c=0;
  for(const u of units) if(u.team===t&&u.type!=='queen'&&!u.wild) c++;
  for(const b of blds) if(b.team===t) c+=b.q.length; return c; }
function popCap(t){ let c=0; for(const b of blds) if(b.team===t&&b.built>=1) c+=(b.d.pop||0);
  return Math.min(c,120); }

// ------------------------------------------------------------ teknoloji
// AoE kuralı: çağ atlamak için mevcut çağdan en az 2 oda dikilmiş olmalı
function ageBuildingsOf(team){
  const T=st.teams[team]; let c=0;
  for(const b of blds) if(b.team===team&&b.built>=1&&b.d.age===T.age&&b.type!=='nest') c++;
  return c;
}
const AGE_REQ=2;
function ageReqMet(team){ return ageBuildingsOf(team)>=AGE_REQ; }

// ------------------------------------------------------------ takas odası (AoE market mantığı)
// her kaynak yiyecek karşılığı alınıp satılır; bolluk fiyatı düşürür
function marketRate(res){
  const base={f:1, l:1.1, m:1.35, d:2.2};
  const have=P.res[res]||0;
  return base[res]*(1+clamp((300-have)/600,-0.35,0.6));
}
function marketSell(res,amount){
  amount=amount||100;
  if(P.res[res]<amount){ msg('Satacak kadar '+RESL.find(r=>r.k===res).n+' yok'); return; }
  P.res[res]-=amount; P.res.f+=amount*marketRate(res)*0.85;
  msg(amount+' '+RESL.find(r=>r.k===res).n+' satıldı');
}
function marketBuy(res,amount){
  amount=amount||100;
  const cost=amount*marketRate(res)*1.15;
  if(P.res.f<cost){ msg('Yetersiz yiyecek ('+Math.round(cost)+' gerekli)'); return; }
  P.res.f-=cost; P.res[res]+=amount;
  msg(amount+' '+RESL.find(r=>r.k===res).n+' alındı');
}

function techReady(team,id){
  const T=st.teams[team], tk=TECHS[id];
  if(tk.agetech) return T.age===tk.agetech-1 && !T.tech[id];
  if(tk.req && !T.tech[tk.req]) return false;
  if(tk.lvl) return (T.lvl[id]||0)<tk.lvl;
  return !T.tech[id];
}
function techCost(team,id){
  const T=st.teams[team], tk=TECHS[id], lv=T.lvl[id]||0, s=1+lv*0.75, c={};
  for(const k in tk.cost) c[k]=Math.round(tk.cost[k]*s);
  return c;
}
function applyTech(team,id){
  const T=st.teams[team], tk=TECHS[id];
  if(tk.agetech){ T.age=tk.agetech; T.tech[id]=1;
    for(const u of units) if(u.team===team){ const add=u.mhp*0.05; u.mhp+=add; u.hp+=add; }
    if(team===PLAYER){ addAlert('🏛 '+AGES[T.age-1].n+' çağına yükseldin!','ok'); msg(AGES[T.age-1].n); }
    return; }
  if(tk.lvl){ T.lvl[id]=(T.lvl[id]||0)+1; } else T.tech[id]=1;
  if(tk.eff){
    if(tk.eff==='arm'){ T.eff.arm+=tk.val;
      for(const u of units) if(u.team===team){ const add=u.d.hp*tk.val; u.mhp+=add; u.hp+=add; } }
    else T.eff[tk.eff]+=tk.val;
  }
  if(team===PLAYER) addAlert('🔬 '+tk.n+' tamamlandı','ok');
}

// ------------------------------------------------------------ hareket
function goTo(u,gx,gy,adj,dt){
  if(!u.path || u.rep<0){ u.rep=1.2; if(!order(u,gx,gy,adj)) return false; }
  moveAlong(u,dt); return true;
}
function order(u,gx,gy,adj){
  const p=findPath(u.x,u.y,gx,gy,adj,u.team);
  if(p){ u.path=p; u.pi=Math.min(1,p.length-1); return true; }
  u.path=null; return false;
}
let auraBlds=[];
function refreshAuras(){ auraBlds=blds.filter(b=>b.d.aura&&b.built>=1); }
function unitSpd(u){
  const T=st.teams[u.team];
  let s=u.d.spd*(1+(T?T.eff.spd:0));
  if(u.slow>0) s*=0.55;
  const i=ti(u.x|0,u.y|0);
  if(inB(u.x|0,u.y|0)){
    if(tiles[i]===T_WATER) s*=0.55;
    if(!u.wild && phero[i]>0.25) s*=1.12;
  }
  if(!u.wild && isNight() && (u.y|0)<surfH[clamp(u.x|0,0,MW-1)]+2) s*=0.8;  // gece yüzeyde yavaş
  for(const b of auraBlds) if(b.team===u.team&&Math.hypot(b.x-u.x,b.y-u.y)<b.d.aura.r){ s*=1+b.d.aura.spd; break; }
  return s;
}
function moveAlong(u,dt){
  if(!u.path) return false;
  if(u.stun>0) return true;
  let budget=unitSpd(u)/TS*dt, guard=0;
  while(budget>1e-6 && u.path && guard++<48){
    const wp=u.path[u.pi];
    if(!wp){ u.path=null; break; }
    const dx=wp.x-u.x, dy=wp.y-u.y, d=Math.hypot(dx,dy);
    if(d>1e-6) u.ang=Math.atan2(dy,dx);
    if(d<=budget){
      if(passable(wp.x|0,wp.y|0,u.team)){ u.x=wp.x; u.y=wp.y; }
      budget-=Math.max(d,0.02); u.pi++; u.leg+=dt*9;
      if(u.pi>=u.path.length) u.path=null;
      continue;
    }
    const nx=u.x+dx/d*budget, ny=u.y+dy/d*budget;
    if(!passable(nx|0,ny|0,u.team)){ u.path=null; break; }
    u.x=nx; u.y=ny; u.leg+=dt*9; budget=0;
  }
  return u.path!==null;
}
let sepGrid=new Map();
function buildSepGrid(){
  sepGrid.clear();
  for(const u of units){
    if(u.wild) continue;
    const k=((u.y|0)*MW+(u.x|0));
    let a=sepGrid.get(k); if(!a){ a=[]; sepGrid.set(k,a); }
    a.push(u);
  }
}
function nearbyUnits(u){
  const out=[], bx=u.x|0, by=u.y|0;
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    const a=sepGrid.get(((by+dy)*MW+(bx+dx)));
    if(a) for(const o of a) out.push(o);
  }
  return out;
}
function separate(u){
  for(const o of nearbyUnits(u)){ if(o===u||o.team!==u.team||o.wild)continue;
    const dx=o.x-u.x, dy=o.y-u.y, d2=dx*dx+dy*dy;
    if(d2<0.36&&d2>1e-4){ const d=Math.sqrt(d2), f=(0.6-d)*0.32;
      if(passable((u.x-dx/d*f)|0,(u.y-dy/d*f)|0,u.team)){ u.x-=dx/d*f; u.y-=dy/d*f; } } }
}

// ------------------------------------------------------------ savaş
function hostile(a,b){
  if(b.hp<=0) return false;
  if(b.wd && b.wd.passive && b.wd.noTarget) return false;
  if(a.team===b.team) return false;
  if(a.team===NEUTRAL&&b.team===NEUTRAL) return false;
  return true;
}
function findEnemy(u,range){
  let best=null,bd=range;
  const now=st.time;
  for(const o of units){
    if(o.unreach>now)continue;
    if(!hostile(u,o))continue;
    if(o.type==='aphid')continue;                      // bitler avlanmaz
    if(u.wild&&u.wd.passive)continue;
    const d=dist(u,o); if(d<bd){bd=d;best=o;}
  }
  if(!best) for(const b of blds){ if(b.team===u.team||b.hp<=0||b.unreach>now)continue;
    if(u.team===NEUTRAL&&!u.wd.digs&&!u.wd.day&&u.wd.passive)continue;
    const d=edgeDist(u.x,u.y,b); if(d<bd){bd=d;best=b;} }
  return best;
}
function damage(e,dmg,fromTeam,src){
  let arm=0;
  if(e.d&&!e.tx) arm=(e.d.arm||0)+(st.teams[e.team]?st.teams[e.team].eff.arm*0.4:0);
  e.hp-=dmg*(1-Math.min(0.62,arm));
  if(e.tx&&e.team===PLAYER) P.under=3;
  if(e.hp<=0){ e.hp=0; onDeath(e,fromTeam); }
  else for(let i=0;i<2;i++) parts.push({x:e.x,y:e.y,vx:rnd(-1.6,1.6),vy:rnd(-2,0),l:.3,c:'#b53a2a'});
}
function onDeath(e,byTeam){
  for(let i=0;i<6;i++) parts.push({x:e.x,y:e.y,vx:rnd(-2.5,2.5),vy:rnd(-3,0),l:rnd(.3,.8),c:'#8a2a1e'});
  if(!e.tx && e.d){                                  // yerde kalan ceset izi
    decals.push({x:e.x, y:e.y, ang:e.ang||0, r:e.d.r, life:30,
      col: e.wild?'rgba(58,44,32,1)':(e.team===PLAYER?'rgba(72,54,32,1)':'rgba(74,34,26,1)')});
    if(decals.length>140) decals.shift();
  }
  if(e.wild && e.wd.food>0) mkNode(e.x,e.y,'f','carcass',e.wd.food);
  else if(!e.tx && byTeam!==undefined && st.teams[byTeam] && st.teams[byTeam].eff.recycle)
    mkNode(e.x,e.y,'f','carcass',Math.round(e.d.hp*0.35));
  if(!e.tx && e.team!==NEUTRAL && byTeam!==undefined) st.kills[byTeam]=(st.kills[byTeam]||0)+1;
}
function dmgOf(u,tg){
  const T=st.teams[u.team];
  let d=u.d.dmg*(1+(T?T.eff.dmg:0));
  if(T&&T.eff.rage&&T.under>0) d*=1.25;
  if(u.type==='spitter') d*=1+(T?T.eff.acid*0.5:0);
  if(tg.tx&&u.d.vsBld) d*=u.d.vsBld;
  for(const b of auraBlds) if(b.team===u.team&&Math.hypot(b.x-u.x,b.y-u.y)<b.d.aura.r){ d*=1+b.d.aura.dmg; break; }
  return d;
}
function attack(u,tg,dt){
  const T=st.teams[u.team];
  let rr=u.d.rng + (u.type==='spitter'&&T?T.eff.acid*2:0);
  const d=tg.tx!==undefined ? edgeDist(u.x,u.y,tg) : dist(u,tg);
  if(d>rr){
    if(!goTo(u,Math.floor(tg.x),Math.floor(tg.y),true,dt)){
      tg.unreach=st.time+6;                     // ulaşılamayan hedefi bir süre yok say
      u.auto=null; u.rep=-1;
      if(u.state==='attack'){ u.state='idle'; u.tgt=null; } }
    return;
  }
  u.path=null; u.ang=Math.atan2(tg.y-u.y,tg.x-u.x);
  if(u.cd>0) return;
  u.cd=u.d.cd;
  const dmg=dmgOf(u,tg);
  if(rr>2.2){ shots.push({x:u.x,y:u.y-0.2,tx:tg.x,ty:tg.y,tg,dmg,t:0,team:u.team,
      slow:(T&&T.eff.slow)?2:0, kind:u.type==='spitter'?'acid':'bolt'}); }
  else {
    damage(tg,dmg,u.team,u);
    if(u.d.stun&&tg.d&&!tg.tx) tg.stun=Math.max(tg.stun,u.d.stun);
    if(u.d.poison&&tg.d&&!tg.tx) tg.poison=Math.max(tg.poison,5);
    parts.push({x:tg.x,y:tg.y,vx:rnd(-1,1),vy:rnd(-2,0),l:.22,c:'#ffd27a'});
  }
}

// ------------------------------------------------------------ işler
function nearestStore(u){
  let best=null,bd=1e9;
  for(const b of blds) if(b.team===u.team&&b.built>=1&&b.d.store){
    const d=dist(u,b); if(d<bd){bd=d;best=b;} }
  return best;
}
function removeDig(team,x,y){ const a=digQ[team];
  for(let i=0;i<a.length;i++) if(a[i].x===x&&a[i].y===y){a.splice(i,1);return;} }
function dropJob(u){
  if(u.job){ if(u.job.k==='dig'&&u.job.t) u.job.t.taken=null;
    if(u.job.k==='gather'&&u.job.n) u.job.n.w=Math.max(0,u.job.n.w-1);
    if(u.job.k==='herd'&&u.job.b) u.job.b.herders=Math.max(0,u.job.b.herders-1); }
  u.job=null;
}
function claimJob(u){
  const t=u.team, T=st.teams[t];
  // 1) inşaat
  let best=null,bd=1e9;
  for(const b of blds) if(b.team===t&&b.built<1){
    let w=0; for(const o of units) if(o.job&&o.job.k==='build'&&o.job.b===b) w++;
    if(w>=5) continue;
    const d=dist(u,b); if(d<bd){bd=d;best=b;} }
  if(best){ u.job={k:'build',b:best}; return; }
  // 2) kazma
  bd=1e9; best=null;
  for(const d0 of digQ[t]){
    if(d0.taken&&d0.taken!==u.id) continue;
    if(!hasOpenNbr(d0.x,d0.y)) continue;       // henüz ulaşılamıyor: sırada beklesin
    const d=Math.hypot(u.x-d0.x-0.5,u.y-d0.y-0.5); if(d<bd){bd=d;best=d0;} }
  if(best){ best.taken=u.id; u.job={k:'dig',t:best}; return; }
  // 3) çobanlar ahıra
  if(u.type==='herder'){
    bd=1e9; best=null;
    for(const b of blds) if(b.team===t&&b.built>=1&&b.d.herd&&b.herders<3){
      const d=dist(u,b); if(d<bd){bd=d;best=b;} }
    if(best){ best.herders++; u.job={k:'herd',b:best}; return; }
  }
  // 4) kaynak toplama (kasta göre öncelikli)
  const home=nearestStore(u);
  for(const want of u.d.res){
    bd=1e9; best=null;
    for(const n of nodes){ if(n.a<=0||n.bad>=3||n.res!==want)continue;
      if(n.kind==='aphid'&&u.type!=='herder')continue;
      if(home && Math.hypot(home.x-n.x,home.y-n.y)>72) continue;
      if(isNight() && n.y < surfH[clamp(n.x|0,0,MW-1)]+3) continue;   // gece yüzeye çıkılmaz
      const d=Math.hypot(u.x-n.x,u.y-n.y)+n.w*5;
      if(d<bd){bd=d;best=n;} }
    if(best){ best.w++; u.job={k:'gather',n:best}; return; }
  }
  u.job=null;
}

// ------------------------------------------------------------ birim güncelleme
function updUnit(u,dt){
  u.cd-=dt; u.think-=dt; u.rep-=dt; if(u.noTT>0) u.noTT-=dt;
  if(u.stun>0) u.stun-=dt;
  if(u.slow>0) u.slow-=dt;
  if(u.poison>0){ u.poison-=dt; u.hp-=dt*6; if(u.hp<=0){u.hp=0; onDeath(u,1-u.team); return;} }
  if(u.stun>0) return;
  if(u.wild){ updWild(u,dt); return; }

  const T=st.teams[u.team];
  // yuva yakınında iyileşme
  if(T.eff.regen&&u.hp<u.mhp){
    for(const b of blds) if(b.team===u.team&&b.built>=1&&b.d.store&&edgeDist(u.x,u.y,b)<6){
      u.hp=Math.min(u.mhp,u.hp+dt*3); break; }
  }
  // sel hasarı
  if(!T.eff.flood && inB(u.x|0,u.y|0) && tiles[ti(u.x|0,u.y|0)]===T_WATER && waterT[ti(u.x|0,u.y|0)]>3)
    u.hp-=dt*2.5;
  if(u.hp<=0){ u.hp=0; onDeath(u,1-u.team); return; }

  if(u.type==='queen'){ const e=findEnemy(u,4.5); if(e) attack(u,e,dt); return; }

  // hedef tarama
  if(u.think<=0){
    u.think=0.25+Math.random()*0.3;
    if(u.state!=='attack'&&u.state!=='amove'&&u.stance!=='pas'){
      const agg = u.d.work ? (u.stance==='agg'?5:2.4) : (u.stance==='agg'?10:7.5);
      const e=findEnemy(u,agg);
      u.auto = (e && (!u.d.work || u.carry===0)) ? e : null;
    }
  }
  if(u.state==='attack'){
    if(!u.tgt||u.tgt.hp<=0){ u.state='idle'; u.tgt=null; }
    else { attack(u,u.tgt,dt); separate(u); return; } }
  if(u.state==='amove'){
    const e=findEnemy(u,8.5);
    if(e){ attack(u,e,dt); separate(u); return; }
    if(!moveAlong(u,dt)){                       // yol bitti: hedefe devam et
      if(u.dest && Math.hypot(u.x-u.dest.x,u.y-u.dest.y)>2.5 && u.rep<0){
        u.rep=0.8;
        if(order(u,Math.floor(u.dest.x),Math.floor(u.dest.y),true)) u.fail=0;
        else { u.fail=(u.fail||0)+1;              // yol bulma bütçesi dolmuş olabilir: tekrar dene
          if(u.fail>10){ u.fail=0; u.dest=null; u.state='idle'; } }
      } else if(!u.dest || Math.hypot(u.x-u.dest.x,u.y-u.dest.y)<=2.5){ u.dest=null; u.state='idle'; }
    }
    separate(u); return; }
  if(u.auto&&u.auto.hp>0){ attack(u,u.auto,dt); separate(u); return; }
  if(u.state==='move'){ if(!moveAlong(u,dt)) u.state='idle'; separate(u); return; }
  if(u.state==='found'){ // prenses yeni yuva kuruyor
    if(!u.fx){ u.state='idle'; return; }
    if(!atTile(u,u.fx,u.fy,2)){ if(!goTo(u,u.fx,u.fy,true,dt)){ u.state='idle'; msg('Oraya ulaşılamıyor'); } return; }
    if(canPlaceAt(u.fx,u.fy,BLDS.nest,u.team)){
      mkBld('nest',u.team,u.fx,u.fy,true);
      for(let i=0;i<3;i++) mkUnit('worker',u.team,u.x+rnd(-1,1),u.y+rnd(-1,1));
      u.hp=0; onDeath(u,u.team);
      if(u.team===PLAYER) addAlert('👑 Yeni yuva kuruldu','ok');
    } else { msg('Yuva için uygun değil'); }
    u.state='idle'; u.fx=null; return;
  }
  if(!u.d.work){ separate(u); return; }

  // ---- işçi kastları
  if(u.job&&u.job.k==='gather'&&u.carry===0){
    u.rc=(u.rc||0)-dt;
    if(u.rc<=0){ u.rc=2.5;
      if(blds.some(b=>b.team===u.team&&b.built<1)||digQ[u.team].some(d=>!d.taken)) dropJob(u); } }
  if(!u.job) claimJob(u);
  const j=u.job;
  if(!j){ st.teams[u.team].idle++; separate(u); return; }

  if(j.k==='dig'){
    const t=j.t, tt=inB(t.x,t.y)?tiles[ti(t.x,t.y)]:T_ROCK;
    if(!diggable(tt)){ removeDig(u.team,t.x,t.y); dropJob(u); return; }
    if(!atTile(u,t.x,t.y,1)){
      if(!goTo(u,t.x,t.y,true,dt)){ t.bad=(t.bad||0)+1;
        if(t.bad>5&&hasOpenNbr(t.x,t.y)) removeDig(u.team,t.x,t.y); dropJob(u); }
      return; }
    u.path=null; u.ang=Math.atan2(t.y+0.5-u.y,t.x+0.5-u.x); u.leg+=dt*15;
    t.p=(t.p||0)+dt/digTime(tt)*(1+st.teams[u.team].eff.gatherSpd*0.5);
    if(Math.random()<dt*6) parts.push({x:t.x+0.5,y:t.y+0.5,vx:rnd(-1.4,1.4),vy:rnd(-2,-.3),l:.4,c:'#6b4e2b'});
    if(t.p>=1){
      const y=digYield(tt); for(const k in y) st.teams[u.team].res[k]+=y[k];
      if(u.team===PLAYER) st.dug=(st.dug||0)+1;
      setTile(t.x,t.y,T_TUN);
      removeDig(u.team,t.x,t.y); dropJob(u);
    }
    return;
  }
  if(j.k==='build'){
    const b=j.b;
    if(!b||b.hp<=0||b.built>=1){ dropJob(u); return; }
    if(!atBld(u,b)){ if(!goTo(u,Math.floor(b.x),Math.floor(b.y),true,dt)) dropJob(u); return; }
    u.path=null; u.leg+=dt*13;
    b.built=Math.min(1,b.built+dt/b.d.bt*(1+st.teams[u.team].eff.buildSpd));
    b.hp=Math.max(b.hp,b.mhp*(0.12+0.88*b.built));
    if(b.built>=1){
      for(let y=b.ty;y<b.ty+b.d.h;y++)for(let x=b.tx;x<b.tx+b.d.w;x++) if(inB(x,y)&&!walk(x,y)) setTile(x,y,T_TUN);
      if(b.team===PLAYER) addAlert('🏠 '+b.d.n+' tamamlandı','ok');
      dropJob(u);
    }
    return;
  }
  if(j.k==='herd'){
    const b=j.b;
    if(!b||b.hp<=0||b.built<1){ dropJob(u); return; }
    if(!atBld(u,b)){ if(!goTo(u,Math.floor(b.x),Math.floor(b.y),true,dt)) dropJob(u); return; }
    u.path=null; u.leg+=dt*4; u.ang=Math.sin(st.time*0.7+u.id)*0.6;
    return;
  }
  if(j.k==='gather'){
    const n=j.n;
    if(u.carry>0){
      const dp=nearestStore(u);
      if(!dp){ u.carry=0; return; }
      if(!atBld(u,dp)){
        goTo(u,Math.floor(dp.x),Math.floor(dp.y),true,dt);
        if(Math.random()<dt*9) pheroDrop(u.x,u.y,0.25);
        return; }
      st.teams[u.team].res[u.cres]+=u.carry; u.carry=0; u.path=null; return;
    }
    if(!n||n.a<=0){ dropJob(u); return; }
    if(!atTile(u,Math.floor(n.x),Math.floor(n.y),1)){
      if(!goTo(u,Math.floor(n.x),Math.floor(n.y),true,dt)){ n.bad++; dropJob(u); }
      return; }
    u.path=null; u.ang=Math.atan2(n.y-u.y,n.x-u.x); u.leg+=dt*7;
    const T2=st.teams[u.team];
    u.gp=(u.gp||0)+dt*(1+T2.eff.gatherSpd);
    if(u.gp>1.15){
      u.gp=0;
      const cap=Math.round((u.d.carry||10)*(1+T2.eff.carry));
      const take=Math.min(cap,n.a); n.a-=take; u.carry=take; u.cres=n.res;
      if(n.kind!=='aphid'&&n.a<=0) n.dead=1;
      dropJob(u); u.job={k:'gather',n}; n.w++;
    }
    return;
  }
}

// ------------------------------------------------------------ yaban hayatı
function updWild(u,dt){
  const w=u.wd;
  if(w.day && !isNight()===false){ /* kuş gece kaybolur */ }
  if(w.day && isNight()){ u.hp=0; onDeath(u); return; }
  if(u.think<=0){
    u.think=0.5+Math.random();
    if(!w.passive){
      let best=null,bd=w.digs?60:11;
      for(const o of units){ if(o.team===NEUTRAL||o.hp<=0||o.type==='aphid')continue;
        const d=dist(u,o); if(d<bd){bd=d;best=o;} }
      if(!best&&w.digs) for(const b of blds){ const d=edgeDist(u.x,u.y,b); if(d<bd){bd=d;best=b;} }
      u.tgt=best;
    }
  }
  if(u.tgt&&u.tgt.hp>0){
    if(w.digs){ wildDig(u,dt); return; }
    attack(u,u.tgt,dt); return;
  }
  // dolaş
  if(!u.path){
    if(w.digs){ wildDig(u,dt); return; }
    let tx=clamp(Math.floor(u.home.x+rnd(-9,9)),1,MW-2), ty=clamp(Math.floor(u.home.y+rnd(-5,5)),1,MH-2);
    if(w.surf) ty=surfH[tx]-1;
    if(walk(tx,ty)) order(u,tx,ty,false);
    u.wt=(u.wt||0)+dt;
  }
  moveAlong(u,dt);
}
function wildDig(u,dt){                              // köstebek: toprağı delerek ilerler
  const tg=u.tgt||{x:u.home.x,y:u.home.y};
  const d=tg.tx!==undefined?edgeDist(u.x,u.y,tg):dist(u,tg);
  if(d<=u.d.rng+0.4){ if(u.cd<=0){ u.cd=u.d.cd; damage(tg,u.d.dmg,NEUTRAL,u); } return; }
  const ang=Math.atan2(tg.y-u.y,tg.x-u.x);
  const nx=u.x+Math.cos(ang)*0.6, ny=u.y+Math.sin(ang)*0.6;
  const tx=nx|0, tyy=ny|0;
  if(inB(tx,tyy)&&!walk(tx,tyy)){
    if(tiles[ti(tx,tyy)]===T_ROCK){ u.home={x:u.x+rnd(-4,4),y:u.y}; u.tgt=null; return; }
    u.digP+=dt; u.ang=ang;
    if(Math.random()<dt*8) parts.push({x:tx+0.5,y:tyy+0.5,vx:rnd(-2,2),vy:rnd(-2,0),l:.4,c:'#5a4028'});
    if(u.digP>1.1){ u.digP=0; setTile(tx,tyy,T_TUN); }
    return;
  }
  u.x+=Math.cos(ang)*unitSpd(u)/TS*dt; u.y+=Math.sin(ang)*unitSpd(u)/TS*dt; u.ang=ang; u.leg+=dt*8;
}

// ------------------------------------------------------------ odalar
function updBld(b,dt){
  const T=st.teams[b.team];
  if(b.built<1) return;
  b.cd-=dt;
  // savunma kulesi
  if(b.d.atk&&b.cd<=0){
    let best=null,bd=b.d.atk.rng;
    for(const o of units){ if(o.team===b.team||o.hp<=0||o.type==='aphid')continue;
      if(o.team===NEUTRAL&&o.wd.passive)continue;
      const d=Math.hypot(o.x-b.x,o.y-b.y); if(d<bd){bd=d;best=o;} }
    if(best){ b.cd=b.d.atk.cd;
      shots.push({x:b.x,y:b.y-0.3,tx:best.x,ty:best.y,tg:best,dmg:b.d.atk.dmg*(1+T.eff.dmg),
        t:0,team:b.team,kind:'acid',slow:T.eff.slow?2:0}); }
  }
  // üretim (çiftlik / ahır)
  if(b.d.yield){
    let mult=1;
    if(b.type==='farm') mult=1+T.eff.farm;
    if(b.type==='aphid') mult=(1+T.eff.aphid)*(1+b.herders*0.5);
    if(blds.some(x=>x.team===b.team&&x.type==='cistern'&&x.built>=1)) mult*=1.15;
    if(isWinter()&&!T.eff.winter) mult*=0.55;
    for(const k in b.d.yield){
      const amt=b.d.yield[k]*mult*dt;
      if(b.d.needs){ // lif tüketir (stoğu tamamen dibe çekmez)
        const need=amt*0.26;
        if(T.res[b.d.needs]-need>=20){ T.res[b.d.needs]-=need; T.res[k]+=amt; b.acc=1; }
        else b.acc=0;
      } else { T.res[k]+=amt; b.acc=1; }
    }
  }
  // araştırma
  if(b.rq){
    b.rq.p+=dt/b.rq.t*(1+T.eff.trainSpd*0.5);
    if(b.rq.p>=1){ applyTech(b.team,b.rq.id); b.rq=null; }
  }
  // birim üretimi
  if(b.q.length){
    const it=b.q[0], d=ANTS[it.type];
    let sp=1+T.eff.trainSpd; if(it.type==='armyant') sp*=1+T.eff.swarm;
    for(const q of units) if(q.type==='queen'&&q.team===b.team&&Math.hypot(q.x-b.x,q.y-b.y)<13){ sp*=1.25; break; }
    it.p+=dt/d.t*sp;
    if(it.p>=1){
      b.q.shift();
      let sx=b.x, sy=b.ty+b.d.h+0.5, ok=false;
      for(let r=1;r<8&&!ok;r++) for(let dy=-r;dy<=r&&!ok;dy++) for(let dx=-r;dx<=r&&!ok;dx++){
        const x=Math.floor(b.x+dx), y=Math.floor(b.y+dy);
        if(passable(x,y,b.team)){ sx=x+0.5; sy=y+0.5; ok=true; } }
      const u=mkUnit(it.type,b.team,sx,sy);
      if(b.rally){ u.state='move'; order(u,Math.floor(b.rally.x),Math.floor(b.rally.y),false); }
      if(b.team===PLAYER) msg(ANTS[it.type].n+' yumurtadan çıktı');
    }
  }
}

// ------------------------------------------------------------ yerleştirme
// AoE mantığı: keşfedilmiş her yere kurulabilir; yalnız zemin kazılmış ve boş olmalı
function canPlaceAt(tx,ty,d,team){
  for(let y=ty;y<ty+d.h;y++)for(let x=tx;x<tx+d.w;x++){
    if(!inB(x,y)) return false;
    const t=tiles[ti(x,y)];
    if(t!==T_TUN&&t!==T_WATER) return false;
    if(bgrid[ti(x,y)]) return false;
    if(team===PLAYER && !known[ti(x,y)]) return false;     // keşfedilmemiş alana kurulmaz
  }
  // gerçekçilik: mantar çiftliği nemli derinlikte olmalı
  if(d.needs==='l' || d.id==='farm'){
    const sh=surfH[clamp(tx,0,MW-1)];
    if(ty < sh+10) return false;
  }
  return true;
}

// ------------------------------------------------------------ doğal yaşam & kaynak döngüsü
let spawnT=14, nodeT=0, digCleanT=5;
// hiçbir zaman ulaşılamayacak kazma işaretlerini (katı kaya/toprak içinde yalnız kalanlar) temizle
function cleanDigQ(){
  for(const team of [PLAYER,ENEMY]){
    const q=digQ[team];
    for(let i=q.length-1;i>=0;i--){
      const d=q[i];
      if(!diggable(tiles[ti(d.x,d.y)])){ q.splice(i,1); continue; }
      if(hasOpenNbr(d.x,d.y)) continue;
      const nbrMarked=q.some(o=>o!==d&&Math.abs(o.x-d.x)<=1&&Math.abs(o.y-d.y)<=1);
      if(!nbrMarked) q.splice(i,1);
    }
  }
}
function updateNature(dt){
  digCleanT-=dt; if(digCleanT<=0){ digCleanT=4; cleanDigQ(); }
  nodeT-=dt;
  if(nodeT<=0){
    nodeT=isWinter()?7:3.2;
    const surfNodes=nodes.filter(n=>n.a>0&&(n.kind==='leaf'||n.kind==='plant')).length;
    if(surfNodes<70+st.time/40){
      const x=ri(3,MW-4), y=surfH[x]-1;
      if(walk(x,y)){
        const plant=Math.random()<0.58;
        mkNode(x+0.5,y+0.5, plant?'l':'f', plant?'plant':'leaf', rnd(90,190)*(isWinter()?0.5:1));
      }
    }
    // mağaralarda mantar
    if(Math.random()<0.3){
      const x=ri(6,MW-7), y=ri(34,MH-8);
      if(walk(x,y)&&y>surfH[x]+8) mkNode(x+0.5,y+0.5,'f','mushroom',rnd(130,260));
    }
    // yaprak bitleri (bal şebnemi)
    if(Math.random()<0.35 && nodes.filter(n=>n.kind==='aphid'&&n.a>0).length<16){
      const x=ri(3,MW-4), y=surfH[x]-1;
      if(walk(x,y)) mkNode(x+0.5,y+0.5,'d','aphid',rnd(150,260));
    }
  }
  spawnT-=dt;
  if(spawnT<=0){
    spawnT=rnd(16,30);
    const n=units.filter(u=>u.wild).length;
    if(n<22){
      const roll=Math.random(), T=st.time;
      let type=null, surf=false;
      if(roll<0.26){ type='aphid'; surf=true; }
      else if(roll<0.46){ type='larvaeW'; surf=true; }
      else if(roll<0.60&&!isNight()){ type='bird'; surf=true; }
      else if(roll<0.78){ type='beetle'; }
      else if(roll<0.90&&T>150){ type='spider'; }
      else if(roll<0.97&&T>300){ type='centi'; }
      else if(T>420){ type='mole'; }
      if(type){
        let x,y,tries=0;
        do{ x=ri(5,MW-6); y=surf?surfH[x]-1:ri(34,MH-8); tries++; }
        while(tries<40 && (!walk(x,y)||visibleToPlayerBase(x,y)));
        if(walk(x,y)){ const w=mkWild(type,x+0.5,y+0.5);
          if(type==='mole'&&st.time>420) addAlert('🐀 Köstebek kokusu alındı!'); }
      }
    }
  }
  nodes=nodes.filter(n=>n.a>0.5);
}
function visibleToPlayerBase(x,y){
  for(const b of blds) if(b.d.store&&Math.hypot(b.x-x,b.y-y)<14) return true;
  return false;
}

// ------------------------------------------------------------ ana döngü adımı
function simulate(dt){
  st.time+=dt; pfBudget=70;
  P.idle=0; E.idle=0;
  if(P.under>0) P.under-=dt; if(E.under>0) E.under-=dt;
  updateEnv(dt); pheroDecay(dt); refreshAuras(); buildSepGrid();
  for(let i=0;i<units.length;i++) updUnit(units[i],dt);
  for(const b of blds) updBld(b,dt);
  for(let i=shots.length-1;i>=0;i--){ const s=shots[i]; s.t+=dt*4.2;
    if(s.t>=1){ if(s.tg&&s.tg.hp>0){ damage(s.tg,s.dmg,s.team);
        if(s.slow&&s.tg.d&&!s.tg.tx) s.tg.slow=Math.max(s.tg.slow,s.slow); }
      shots.splice(i,1); } }
  for(let i=parts.length-1;i>=0;i--){ const p=parts[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=5*dt; p.l-=dt;
    if(p.l<=0) parts.splice(i,1); }
  updateNature(dt);
  for(let i=decals.length-1;i>=0;i--){ decals[i].life-=dt; if(decals[i].life<=0) decals.splice(i,1); }
  units=units.filter(u=>u.hp>0);
  const dead=blds.filter(b=>b.hp<=0);
  if(dead.length){
    for(const b of dead){
      for(let i=0;i<16;i++) parts.push({x:b.x,y:b.y,vx:rnd(-3,3),vy:rnd(-4,1),l:rnd(.4,1),c:'#6b4e2b'});
      if(b.type==='nest'&&!blds.some(o=>o!==b&&o.team===b.team&&o.type==='nest'&&o.hp>0))
        endGame(b.team!==PLAYER);
      if(b.team===PLAYER) addAlert('💥 '+b.d.n+' yıkıldı!');
    }
    blds=blds.filter(b=>b.hp>0); regrid();
  }
  updateFog(dt); enemyAI(dt);
}
function endGame(win){
  if(st.over) return; st.over=win?1:2;
  const o=document.getElementById('over'); o.style.display='flex';
  document.getElementById('overT').textContent = win?'🏆 Koloni Zaferi!':'💀 Koloni Söndü';
  document.getElementById('overT').style.color = win?'#9fd07a':'#d4604a';
  document.getElementById('overS').textContent =
    'Süre '+fmtT(st.time)+' · Çağ: '+AGES[P.age-1].n+' · Düşman kaybı: '+(st.kills[PLAYER]||0);
}
const fmtT=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
