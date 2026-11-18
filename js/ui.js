// ===================================================================
//  ARAYÜZ — seçim, komutlar, inşa, üretim, teknoloji, bildirimler
// ===================================================================
"use strict";

let sel=[], selB=null, buildMode=null, foundMode=false, uiTab='cmd';
let groups={}, alerts=[], msgT=0;
let panning=false, panX=0, panY=0, touchpadZoom=false, edgeScroll=false;
let mouse={x:0,y:0,sx:0,sy:0,rsx:0,rsy:0,down:false,rdown:false,drag:false,rdrag:false};
const keys={};
const TRAINK=['Q','W','E','R','T'], TECHK=['Z','X','C','V'];
const $=id=>document.getElementById(id);

function msg(t){ $('msg').textContent=t; msgT=2.6; }
function addAlert(t,cls,x,y){ alerts.unshift({t,cls:cls||'',life:9,x,y}); if(alerts.length>5) alerts.pop(); }
function jumpAlert(i){ const a=alerts[i]; if(a&&a.x!==undefined){ centerOn(a.x,a.y); msg('Olay yerine gidildi'); } }
// kaynak geliri ölçümü (son 10 sn)
let incSamples=[], incRate={f:0,l:0,m:0,d:0};
function trackIncome(dt){
  incSamples.push({t:st.time, f:P.res.f, l:P.res.l, m:P.res.m, d:P.res.d});
  while(incSamples.length>2 && st.time-incSamples[0].t>10) incSamples.shift();
  const a=incSamples[0], b=incSamples[incSamples.length-1], dtp=b.t-a.t;
  if(dtp>2) for(const k of ['f','l','m','d']) incRate[k]=Math.max(0,(b[k]-a[k])/dtp*60);
}
// oyunun ilk dakikaları için hedef listesi
const GOALS=[
  {id:'dig',  t:'20 kare toprak kaz',           ok:()=>st.dug>=20},
  {id:'work', t:'10 işçi/kesen yetiştir',       ok:()=>units.filter(u=>u.team===PLAYER&&u.d.work).length>=10},
  {id:'house',t:'Yavru Odacığı kur (nüfus)',    ok:()=>blds.some(b=>b.team===PLAYER&&b.type==='house'&&b.built>=1)},
  {id:'farm', t:'Mantar Çiftliği kur',          ok:()=>blds.some(b=>b.team===PLAYER&&b.type==='farm'&&b.built>=1)},
  {id:'age',  t:'Çağ II: Büyüyen Koloni',       ok:()=>P.age>=2},
  {id:'army', t:'Savaş Odası + 4 asker',        ok:()=>blds.some(b=>b.team===PLAYER&&b.type==='barracks'&&b.built>=1)&&units.filter(u=>u.team===PLAYER&&!u.d.work&&u.type!=='queen').length>=4}
];

// ------------------------------------------------------------ koordinat
const w2t=(px,py)=>({x:Math.floor((px/cam.z+cam.x)/TS), y:Math.floor((py/cam.z+cam.y)/TS)});
const w2w=(px,py)=>({x:(px/cam.z+cam.x)/TS, y:(py/cam.z+cam.y)/TS});
function clampCam(){
  cam.x=clamp(cam.x,0,Math.max(0,MW*TS-cv.width/cam.z));
  cam.y=clamp(cam.y,0,Math.max(0,MH*TS-cv.height/cam.z));
}
function centerOn(x,y){ cam.x=x*TS-cv.width/cam.z/2; cam.y=y*TS-cv.height/cam.z/2; clampCam(); }

// ------------------------------------------------------------ girdi
function inputInit(){
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  cv.addEventListener('mousemove',e=>{ mouse.x=e.clientX; mouse.y=e.clientY;
    if(mouse.down&&Math.hypot(mouse.x-mouse.sx,mouse.y-mouse.sy)>6) mouse.drag=true;
    if(mouse.rdown&&Math.hypot(mouse.x-mouse.rsx,mouse.y-mouse.rsy)>8) mouse.rdrag=true; });
  cv.addEventListener('mousedown',e=>{
    if(e.button===0){ mouse.down=true; mouse.drag=false; mouse.sx=e.clientX; mouse.sy=e.clientY; }
    if(e.button===2){ mouse.rdown=true; mouse.rdrag=false; mouse.rsx=e.clientX; mouse.rsy=e.clientY; } });
  cv.addEventListener('mouseup',e=>{
    if(e.button===0){ if(e.ctrlKey||e.metaKey){ mouse.rdown=mouse.down; mouse.rsx=mouse.sx; mouse.rsy=mouse.sy;
        mouse.rdrag=mouse.drag; mouse.down=false; mouse.drag=false; onRightUp(e); }
      else onLeftUp(e); }
    else if(e.button===2) onRightUp(e); });
  cv.addEventListener('wheel',e=>{ e.preventDefault();
    if(e.ctrlKey || e.metaKey || touchpadZoom){          // pinch ya da Ctrl+tekerlek → yakınlaş
      const b=w2w(e.clientX,e.clientY);
      cam.z=clamp(cam.z*(e.deltaY<0?1.1:0.91),0.45,2.8);
      const a=w2w(e.clientX,e.clientY);
      cam.x+=(b.x-a.x)*TS; cam.y+=(b.y-a.y)*TS;
    } else {                                              // iki parmak kaydırma → kamerayı sürükle
      cam.x+=e.deltaX/cam.z; cam.y+=e.deltaY/cam.z;
    }
    clampCam(); },{passive:false});
  // orta tuş ya da boşluk ile sürükleyerek kamera taşıma
  cv.addEventListener('mousedown',e=>{ if(e.button===1){ e.preventDefault(); panning=true; panX=e.clientX; panY=e.clientY; } });
  addEventListener('mouseup',e=>{ if(e.button===1) panning=false; });
  addEventListener('mousemove',e=>{
    if(panning||(keys[' ']&&mouse.down)){
      cam.x-=(e.clientX-panX)/cam.z; cam.y-=(e.clientY-panY)/cam.z; clampCam();
    }
    panX=e.clientX; panY=e.clientY;
  });
  mm.addEventListener('mousedown',e=>{ const r=mm.getBoundingClientRect();
    centerOn((e.clientX-r.left)/mm.width*MW,(e.clientY-r.top)/mm.height*MH); });
  addEventListener('keydown',onKey);
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  addEventListener('resize',()=>{ resizeCanvas(); clampCam(); });
  // tooltip
  document.addEventListener('mousemove',e=>{
    const el=e.target.closest&&e.target.closest('[data-tip]');
    const tip=$('tip');
    if(el){ tip.innerHTML=el.getAttribute('data-tip'); tip.style.display='block';
      tip.style.left=Math.min(innerWidth-300,e.clientX+14)+'px';
      tip.style.top=Math.max(8,e.clientY-tip.offsetHeight-14)+'px'; }
    else tip.style.display='none';
  });
}
function onLeftUp(e){
  mouse.down=false;
  if(buildMode){
    // duvar: sürükleyerek sıra sıra ör (AoE duvar çizimi)
    if(BLDS[buildMode].solid && mouse.drag){ placeWallLine(e); mouse.drag=false; return; }
    placeBuilding(); mouse.drag=false; return;
  }
  if(foundMode){ foundNest(); mouse.drag=false; return; }
  // çift tık: ekrandaki aynı kasttan hepsini seç
  if(!mouse.drag){
    const now=performance.now();
    const dbl=(now-(mouse.lastClick||0)<320)&&Math.hypot(e.clientX-(mouse.lastX||0),e.clientY-(mouse.lastY||0))<12;
    mouse.lastClick=now; mouse.lastX=e.clientX; mouse.lastY=e.clientY;
    if(dbl){
      const w0=w2w(e.clientX,e.clientY);
      const hit0=units.find(u=>u.team===PLAYER&&Math.hypot(u.x-w0.x,u.y-w0.y)<0.8);
      if(hit0){
        const a0=w2w(0,0), b0=w2w(cv.width,cv.height);
        sel=units.filter(u=>u.team===PLAYER&&u.type===hit0.type&&u.x>=a0.x&&u.x<=b0.x&&u.y>=a0.y&&u.y<=b0.y);
        selB=null; uiTab='cmd';
        msg('Ekrandaki tüm '+ANTS[hit0.type].n+' seçildi ('+sel.length+')');
        refreshUI(); return;
      }
    }
  }
  if(mouse.drag){
    const a=w2w(Math.min(mouse.sx,e.clientX),Math.min(mouse.sy,e.clientY));
    const b=w2w(Math.max(mouse.sx,e.clientX),Math.max(mouse.sy,e.clientY));
    let got=units.filter(u=>u.team===PLAYER&&u.type!=='queen'&&u.x>=a.x&&u.x<=b.x&&u.y>=a.y&&u.y<=b.y);
    if(got.some(u=>!u.d.work)) got=got.filter(u=>!u.d.work);
    if(got.length){ sel=e.shiftKey?[...new Set([...sel,...got])]:got; selB=null; uiTab='cmd'; }
  } else {
    const w=w2w(e.clientX,e.clientY);
    const hit=units.find(u=>Math.hypot(u.x-w.x,u.y-w.y)<0.7&&(u.team===PLAYER||lit(u.x|0,u.y|0)));
    if(hit&&hit.team===PLAYER){ sel=e.shiftKey?[...new Set([...sel,hit])]:[hit]; selB=null; uiTab='cmd'; }
    else {
      const b=bldAt(w.x|0,w.y|0);
      if(b&&(b.team===PLAYER||seen(b.x|0,b.y|0))){ selB=b; sel=[]; uiTab=b.d.trains?'train':'tech'; }
      else if(hit){ sel=[hit]; selB=null; }
      else if(!e.shiftKey){ sel=[]; selB=null; }
    }
  }
  mouse.drag=false; refreshUI();
}
function onRightUp(e){
  mouse.rdown=false;
  if(buildMode||foundMode){ buildMode=null; foundMode=false; refreshUI(); mouse.rdrag=false; return; }
  if(mouse.rdrag){
    const a=w2t(mouse.rsx,mouse.rsy), b=w2t(e.clientX,e.clientY);
    let n=0;
    for(let y=Math.min(a.y,b.y);y<=Math.max(a.y,b.y);y++)
      for(let x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x++) if(addDig(x,y)) n++;
    if(n){ msg(n+' kare kazma emrine eklendi');
      for(const u of sel) if(u.d.work){ dropJob(u); u.state='idle'; } }
    mouse.rdrag=false; return;
  }
  rightClick(e.clientX,e.clientY);
}
function addDig(x,y){
  if(!inB(x,y)||!diggable(tiles[ti(x,y)])) return false;
  if(digQ[PLAYER].some(d=>d.x===x&&d.y===y)) return false;
  if(digQ[PLAYER].length>400) return false;
  digQ[PLAYER].push({x,y,p:0}); return true;
}
function rightClick(px,py){
  const w=w2w(px,py), t=w2t(px,py);
  if(selB&&!sel.length){ selB.rally={x:w.x,y:w.y}; msg('Toplanma noktası ayarlandı'); return; }
  if(!sel.length){ addDig(t.x,t.y); return; }
  // düşman / yaratık
  const en=units.find(u=>u.hp>0&&u.team!==PLAYER&&u.type!=='aphid'&&Math.hypot(u.x-w.x,u.y-w.y)<0.9&&lit(u.x|0,u.y|0))
        || blds.find(b=>b.team!==PLAYER&&w.x>=b.tx&&w.x<b.tx+b.d.w&&w.y>=b.ty&&w.y<b.ty+b.d.h);
  if(en){ for(const u of sel){ dropJob(u); u.state='attack'; u.tgt=en; u.rep=-1; } msg('Saldır!'); return; }
  // kazma
  if(diggable(tiles[ti(t.x,t.y)])){
    if(addDig(t.x,t.y)) msg('Kazma emri');
    for(const u of sel) if(u.d.work){ dropJob(u); u.state='idle'; }
    return; }
  // kaynak
  const n=nodes.find(n=>n.a>0&&Math.hypot(n.x-w.x,n.y-w.y)<1.0);
  if(n){ let ok=0;
    for(const u of sel) if(u.d.work&&u.d.res.includes(n.res)){ dropJob(u); u.state='idle'; u.job={k:'gather',n}; n.w++; ok++; }
    msg(ok?'Toplamaya gidiyor':'Bu kastlar bu kaynağı toplayamaz'); return; }
  // hareket
  let i=0;
  for(const u of sel){
    dropJob(u);
    const ox=Math.floor(w.x)+((i%3)-1), oy=Math.floor(w.y)+(Math.floor(i/3)%3-1);
    const gx=passable(ox,oy,PLAYER)?ox:Math.floor(w.x), gy=passable(ox,oy,PLAYER)?oy:Math.floor(w.y);
    u.state=u.d.work?'move':'amove'; u.tgt=null; u.auto=null; u.dest={x:w.x,y:w.y};
    if(!order(u,gx,gy,false)) if(!order(u,Math.floor(w.x),Math.floor(w.y),true)) u.state='idle';
    i++;
  }
}
function onKey(e){
  const k=e.key.toLowerCase(); keys[k]=true;
  if(e.key==='Escape'){ buildMode=null; foundMode=false; sel=[]; selB=null; uiTab='cmd'; refreshUI(); return; }
  if(k==='p'){ st.paused=!st.paused; msg(st.paused?'⏸ Duraklatıldı':'▶ Devam'); return; }
  if(k==='f'){ st.speed=st.speed===1?2:(st.speed===2?3:1); msg('Hız ×'+st.speed); return; }
  if(k===' '){ e.preventDefault(); const n=blds.find(b=>b.team===PLAYER&&b.type==='nest'); if(n) centerOn(n.x,n.y); return; }
  if(k==='.'){ selectIdle(); return; }
  if(e.key==='F1'){ e.preventDefault(); toggleHelp(); return; }
  if(k==='y'){                                   // Kraliçe Odasını seç (çağ yükseltmesi)
    const n=blds.find(b=>b.team===PLAYER&&b.type==='nest');
    if(n){ selB=n; sel=[]; uiTab='tech'; centerOn(n.x,n.y); refreshUI(); msg('Kraliçe Odası — çağ yükseltmeleri'); }
    return; }
  if(e.ctrlKey&&k==='a'){ e.preventDefault();
    sel=units.filter(u=>u.team===PLAYER&&!u.d.work&&u.type!=='queen'); selB=null; uiTab='cmd'; refreshUI(); return; }
  if(/^[1-9]$/.test(k)){
    if(e.ctrlKey){ groups[k]=sel.slice(); msg('Grup '+k+' kuruldu ('+sel.length+')'); }
    else if(groups[k]){ sel=groups[k].filter(u=>u.hp>0); selB=null; uiTab='cmd';
      if(sel.length) centerOn(sel[0].x,sel[0].y); }
    refreshUI(); return;
  }
  if(k==='b'&&sel.some(u=>u.d.work)){ uiTab=uiTab==='build'?'cmd':'build'; refreshUI(); return; }
  // bağlam tuşları
  for(const b of document.querySelectorAll('#cmds .btn,#side .mini-btn')){
    if((b.dataset.key||'').toLowerCase()===k && !b.classList.contains('off')){ b.click(); return; }
  }
}
function selectIdle(){
  const idle=units.filter(u=>u.team===PLAYER&&u.d.work&&!u.job&&u.state==='idle');
  if(idle.length){ sel=[idle[0]]; selB=null; centerOn(idle[0].x,idle[0].y); refreshUI(); msg('Boş işçi'); }
  else msg('Boş işçi yok');
}
function camUpdate(dt){
  const s=700*dt/cam.z;
  if(keys['a']||keys['arrowleft'])cam.x-=s; if(keys['d']||keys['arrowright'])cam.x+=s;
  if(keys['w']||keys['arrowup'])cam.y-=s; if(keys['s']||keys['arrowdown'])cam.y+=s;
  const m=18;
  if(mouse.x<m)cam.x-=s; if(mouse.x>innerWidth-m)cam.x+=s;
  if(mouse.y<m&&mouse.y>0)cam.y-=s; if(mouse.y>innerHeight-m-150||((mouse.y>innerHeight-m)))cam.y+=0;
  if(mouse.y>innerHeight-m)cam.y+=s;
  clampCam();
}

// ------------------------------------------------------------ komutlar
function startBuild(type){
  const d=BLDS[type], T=P;
  if(!sel.some(u=>u.d.work)){                         // kolaylık: işçi seçili değilse biri atanır
    const w=units.filter(u=>u.team===PLAYER&&u.d.work)
      .sort((a,b)=>((a.job?1:0)-(b.job?1:0)))[0];
    if(w){ sel=[w]; selB=null; }
  }
  if(d.age>T.age){ msg(AGES[d.age-1].n+' çağı gerekli'); return; }
  if(!canPay(PLAYER,d.cost)){ msg('Yetersiz kaynak: '+d.n); return; }
  buildMode=type; foundMode=false; msg(d.n+' — yerleştir (sağ tık iptal)'); refreshUI();
}
function placeBuilding(){
  const d=BLDS[buildMode], t=w2t(mouse.x,mouse.y);
  const tx=t.x-Math.floor(d.w/2), ty=t.y-Math.floor(d.h/2);
  if(!canPlaceAt(tx,ty,d,PLAYER)){
    msg(d.needs==='l' ? 'Mantar çiftliği nemli derinlikte olmalı (daha aşağı kaz)'
                      : 'Buraya kurulamaz — kazılmış, boş ve keşfedilmiş olmalı'); return; }
  if(!canPay(PLAYER,d.cost)){ msg('Yetersiz kaynak'); buildMode=null; return; }
  pay(PLAYER,d.cost);
  const b=mkBld(buildMode,PLAYER,tx,ty,false);
  for(const u of sel) if(u.d.work){ dropJob(u); u.job={k:'build',b}; }
  msg(d.n+' inşaatı başladı');
  if(!keys['shift']) buildMode=null;
  refreshUI();
}
// duvarı sürükleyerek sıra hâlinde ör
function placeWallLine(e){
  const d=BLDS[buildMode];
  const a=w2t(mouse.sx,mouse.sy), b=w2t(e.clientX,e.clientY);
  const dx=b.x-a.x, dy=b.y-a.y;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  let n=0;
  for(let i=0;i<=steps;i++){
    const x=Math.round(a.x+dx*(steps?i/steps:0)), y=Math.round(a.y+dy*(steps?i/steps:0));
    if(!canPlaceAt(x,y,d,PLAYER)||!canPay(PLAYER,d.cost)) continue;
    pay(PLAYER,d.cost);
    const bb=mkBld(buildMode,PLAYER,x,y,false);
    for(const u of sel) if(u.d.work&&!u.job){ u.job={k:'build',b:bb}; }
    n++;
  }
  msg(n?n+' duvar parçası sıraya girdi':'Duvar kurulamadı');
  if(!keys['shift']) buildMode=null;
  refreshUI();
}
function foundNest(){
  const t=w2t(mouse.x,mouse.y), tx=t.x-1, ty=t.y-1;
  if(!canPlaceAt(tx,ty,BLDS.nest,PLAYER)){ msg('Yuva için uygun değil'); return; }
  let ok=false;
  for(const u of sel) if(u.d.found){ u.state='found'; u.fx=tx; u.fy=ty; u.rep=-1; ok=true; }
  if(ok) msg('Prenses yeni yuvayı kurmaya gidiyor');
  foundMode=false; refreshUI();
}
function train(b,type){
  const d=ANTS[type], T=st.teams[b.team];
  if(d.age>T.age){ msg(AGES[d.age-1].n+' çağı gerekli'); return; }
  if(popOf(b.team)>=popCap(b.team)){ msg('Nüfus dolu — Kuluçka Odası kur'); return; }
  if(!canPay(b.team,d.cost)){ msg('Yetersiz kaynak: '+d.n); return; }
  if(b.q.length>=6){ msg('Kuyruk dolu'); return; }
  pay(b.team,d.cost); b.q.push({type,p:0}); refreshUI();
}
function research(b,id){
  const tk=TECHS[id];
  if(b.rq){ msg('Bu odada zaten araştırma var'); return; }
  if(!techReady(PLAYER,id)){ msg(tk.agetech?'Önce bir önceki çağ':'Zaten araştırıldı'); return; }
  if(tk.agetech && !ageReqMet(PLAYER)){ msg('Çağ atlamak için bu çağdan '+AGE_REQ+' oda gerekli ('+ageBuildingsOf(PLAYER)+'/'+AGE_REQ+')'); return; }
  const c=techCost(PLAYER,id);
  if(!canPay(PLAYER,c)){ msg('Yetersiz kaynak: '+tk.n); return; }
  pay(PLAYER,c); b.rq={id,p:0,t:tk.t};
  msg(tk.n+' araştırılıyor'); refreshUI();
}
function setStance(s){ for(const u of sel) u.stance=s; msg('Duruş: '+
  (s==='agg'?'Saldırgan':s==='def'?'Savunma':'Pasif')); refreshUI(); }
function stopSel(){ for(const u of sel){ dropJob(u); u.state='idle'; u.path=null; u.tgt=null; u.auto=null; } msg('Dur'); }

// ------------------------------------------------------------ arayüz çizimi
function tipOf(obj,cost,extra){
  let s='<b>'+obj.n+'</b>';
  if(obj.sp) s+=' <i style="opacity:.7">'+obj.sp+'</i>';
  s+='<br>'+obj.desc;
  if(cost) s+='<br><span style="color:#9fd07a">'+costStr(cost)+'</span>';
  if(extra) s+='<br><span style="opacity:.85">'+extra+'</span>';
  return s.replace(/"/g,'&quot;');
}
function btn(opts){
  const off=opts.off?' off':'', on=opts.on?' on':'';
  return `<div class="btn${off}${on}" data-key="${opts.key||''}" data-tip="${opts.tip||''}"
    onclick="${opts.off?'':opts.act}">
    ${opts.key?`<span class="k">${opts.key}</span>`:''}
    <b>${opts.n}</b><span class="c">${opts.cost||''}</span>${opts.sub||''}</div>`;
}
function refreshUI(){
  const info=$('info'), cmds=$('cmds'), tabs=$('tabs'), side=$('side');
  let h='', c='', tb='', sd='';
  const T=P;

  // ---------- bilgi paneli
  if(selB){
    const b=selB, d=b.d;
    h=`<h3>${d.n}</h3><i style="opacity:.65;font-size:11px">${b.team===PLAYER?'Koloniniz':'Düşman'}</i><br>
      <span class="stat">❤ ${Math.ceil(b.hp)}/${Math.round(b.mhp)}</span>`;
    if(d.atk) h+=`<span class="stat">⚔ ${d.atk.dmg}</span><span class="stat">🎯 ${d.atk.rng}</span>`;
    if(d.pop) h+=`<span class="stat">👥 +${d.pop}</span>`;
    if(b.built<1) h+=`<br><span style="color:#d8a24a">İnşa: %${Math.floor(b.built*100)}</span>`;
    if(b.rq) h+=`<br><span style="color:#9fd0e8">🔬 ${TECHS[b.rq.id].n} %${Math.floor(b.rq.p*100)}</span>`;
    if(d.herd) h+=`<br><span style="color:#e8b44a">Çoban: ${b.herders}/3 (üretim ×${(1+b.herders*0.5).toFixed(1)})</span>`;
    h+=`<br><span style="opacity:.8">${d.desc}</span>`;
  } else if(sel.length){
    const types={}; for(const u of sel) types[u.type]=(types[u.type]||0)+1;
    const u=sel[0], d=u.d;
    h=`<h3>${sel.length>1?sel.length+' karınca':d.n}</h3>`;
    if(sel.length===1){
      h+=`<i style="opacity:.65;font-size:11px">${d.sp||''}</i><br>
        <span class="stat">❤ ${Math.ceil(u.hp)}/${Math.round(u.mhp)}</span>
        <span class="stat">⚔ ${Math.round(dmgOf(u,{}))}</span>
        <span class="stat">🎯 ${d.rng.toFixed(1)}</span>
        <span class="stat">👟 ${Math.round(unitSpd(u))}</span>`;
      if(d.arm) h+=`<span class="stat">🛡 %${Math.round(d.arm*100)}</span>`;
      if(d.carry) h+=`<span class="stat">🧺 ${Math.round(d.carry*(1+T.eff.carry))}</span>`;
      h+=`<br><span style="opacity:.8">${d.desc}</span>`;
      if(u.job) h+=`<br><span style="color:#9fd07a">İş: ${({dig:'kazıyor',build:'inşa ediyor',gather:'topluyor',herd:'bit sağıyor'})[u.job.k]}</span>`;
    } else {
      for(const t in types) h+=`<span style="color:${ANTS[t].col}">■</span> ${ANTS[t].n} ×${types[t]}&nbsp; `;
    }
  } else {
    const idle=units.filter(u=>u.team===PLAYER&&u.d.work&&!u.job).length;
    h=`<h3>${AGES[T.age-1].n}</h3>
      <span class="stat">👥 ${popOf(PLAYER)}/${popCap(PLAYER)}</span>
      <span class="stat">💤 ${idle} boş</span>
      <span class="stat">⚔ Dalga ${ai.wave}</span><br>
      <span style="opacity:.78">Karınca seç ya da <kbd>B</kbd> ile oda kur. İşçiler boş kalınca
      kazma/inşa/toplama işlerini kendileri üstlenir.</span>`;
  }

  // ---------- sekmeler + komutlar
  const workers=sel.filter(u=>u.d.work);
  if(selB&&selB.team===PLAYER&&selB.built>=1){
    const hasT=selB.d.trains&&selB.d.trains.length, hasR=selB.d.techs&&selB.d.techs.length;
    if(hasT) tb+=`<div class="tab ${uiTab==='train'?'on':''}" onclick="uiTab='train';refreshUI()">Üretim</div>`;
    if(hasR) tb+=`<div class="tab ${uiTab==='tech'?'on':''}" onclick="uiTab='tech';refreshUI()">Teknoloji</div>`;
    if(uiTab!=='train'&&uiTab!=='tech') uiTab=hasT?'train':'tech';
    if(uiTab==='train'&&hasT){
      selB.d.trains.forEach((t,i)=>{
        const d=ANTS[t], locked=d.age>T.age, poor=!canPay(PLAYER,d.cost), full=popOf(PLAYER)>=popCap(PLAYER);
        c+=btn({n:d.n, key:TRAINK[i], cost:costStr(d.cost)+' ⏱'+d.t+'s',
          sub:locked?`<span class="lock">🔒 ${AGES[d.age-1].n}</span>`:'',
          off:locked||poor||full, act:`train(selB,'${t}')`, tip:tipOf(d,d.cost,
            `❤${d.hp} ⚔${d.dmg} 🎯${d.rng} 👟${d.spd}`)});
      });
    }
    if(uiTab==='tech'&&hasR){
      selB.d.techs.forEach((id,i)=>{
        const tk=TECHS[id], cost=techCost(PLAYER,id), lv=T.lvl[id]||0;
        const ready=techReady(PLAYER,id), poor=!canPay(PLAYER,cost);
        c+=btn({n:tk.n+(tk.lvl?` ${lv}/${tk.lvl}`:''), key:TECHK[i], cost:costStr(cost)+' ⏱'+tk.t+'s',
          sub:!ready?`<span class="lock">${tk.agetech?'🔒 önceki çağ':'✔ tamam'}</span>`:'',
          off:!ready||poor||selB.rq, act:`research(selB,'${id}')`, tip:tipOf(tk,cost)});
      });
    }
    // ---- takas odası: her kaynak yiyecek karşılığı alınıp satılır
    if(selB.d.trade){
      for(const r of RESL){
        if(r.k==='f') continue;
        const rate=marketRate(r.k);
        c+=btn({n:'Al: 100 '+r.n, cost:'≈'+Math.round(100*rate*1.15)+' 🍃',
          off:P.res.f<100*rate*1.15, act:`marketBuy('${r.k}',100)`,
          tip:`<b>100 ${r.n} satın al</b><br>Kur arz-talebe göre değişir; stok azsa pahalanır.`});
        c+=btn({n:'Sat: 100 '+r.n, cost:'+'+Math.round(100*rate*0.85)+' 🍃',
          off:P.res[r.k]<100, act:`marketSell('${r.k}',100)`,
          tip:`<b>100 ${r.n} sat</b><br>Fazlanı yiyeceğe çevirir (%15 komisyon).`});
      }
    }
  } else if(workers.length || sel.length===0){        // inşa menüsü her zaman erişilebilir
    tb+=`<div class="tab ${uiTab==='cmd'?'on':''}" onclick="uiTab='cmd';refreshUI()">Komut</div>`;
    tb+=`<div class="tab ${uiTab==='build'?'on':''}" onclick="uiTab='build';refreshUI()">İnşa (B)</div>`;
    if(uiTab==='build'){
      for(const k in BLDS){
        const d=BLDS[k];
        if(k==='nest') continue;
        const locked=d.age>T.age, poor=!canPay(PLAYER,d.cost);
        c+=btn({n:d.n, key:d.key, cost:costStr(d.cost),
          sub:locked?`<span class="lock">🔒 ${AGES[d.age-1].n}</span>`:(d.pop?`<span class="c">👥+${d.pop}</span>`:''),
          off:locked||poor, on:buildMode===k, act:`startBuild('${k}')`, tip:tipOf(d,d.cost,'❤'+d.hp+' · '+d.w+'×'+d.h+' kare')});
      }
    } else if(sel.length) c+=cmdButtons();
    else {
      c+=btn({n:'Boş İşçi Bul', key:'.', act:'selectIdle()', tip:'Boştaki ilk işçiye git'});
      const nn=blds.find(b=>b.team===PLAYER&&b.type==='nest');
      if(nn) c+=btn({n:'Yuvaya Dön', key:'␣', act:`centerOn(${nn.x},${nn.y})`, tip:'Kamerayı Kraliçe Odasına taşı'});
      c+=btn({n:'Kraliçe Odası', key:'Y', act:"keys['y']=1;onKey({key:'y',preventDefault(){}})", tip:'Çağ yükseltme paneli'});
      c+=btn({n:'Yardım', key:'F1', act:'toggleHelp()', tip:'Kontroller ve kurallar'});
    }
  } else if(sel.length){
    tb+=`<div class="tab on">Komut</div>`;
    c+=cmdButtons();
  } else {
    tb+=`<div class="tab on">Koloni</div>`;
    c+=btn({n:'Boş İşçi Bul', key:'.', act:'selectIdle()', tip:'Boştaki ilk işçiye git'});
    const n=blds.find(b=>b.team===PLAYER&&b.type==='nest');
    if(n) c+=btn({n:'Yuvaya Dön', key:'␣', act:`centerOn(${n.x},${n.y})`, tip:'Kamerayı Kraliçe Odasına taşı'});
  }

  // ---------- yan panel
  sd=`<div class="mini-btn" onclick="st.paused=!st.paused;refreshUI()">${st.paused?'▶ Devam':'⏸ Duraklat'} <span style="opacity:.6">P</span></div>
      <div class="mini-btn" onclick="st.speed=st.speed===1?2:(st.speed===2?3:1);refreshUI()">⏩ Hız ×${st.speed} <span style="opacity:.6">F</span></div>`;
  if(sel.length){
    sd+=`<div style="font-size:11px;opacity:.7;margin-top:3px">Duruş</div>`;
    for(const [s,n2] of [['agg','⚔ Saldırgan'],['def','🛡 Savunma'],['pas','🕊 Pasif']])
      sd+=`<div class="mini-btn ${sel[0].stance===s?'on':''}" onclick="setStance('${s}')">${n2}</div>`;
    sd+=`<div class="mini-btn" onclick="stopSel()">✋ Dur</div>`;
    if(sel.some(u=>u.d.found))
      sd+=`<div class="mini-btn ${foundMode?'on':''}" onclick="foundMode=!foundMode;buildMode=null;refreshUI()">👑 Yuva Kur</div>`;
  }
  info.innerHTML=h; cmds.innerHTML=c; tabs.innerHTML=tb; side.innerHTML=sd;
}
function cmdButtons(){
  let c='';
  c+=btn({n:'Dur', key:'H', act:'stopSel()', tip:'Tüm emirleri iptal et'});
  c+=btn({n:'Saldır-Yürü', key:'A', act:"msg('Hedefe sağ tıkla')", tip:'Sağ tıkla: yol üstündeki düşmanlara saldırarak ilerle'});
  if(sel.some(u=>u.d.work)){
    c+=btn({n:'Kaz', key:'G', act:"msg('Toprağa sağ tık / sürükle')", tip:'Toprağa sağ tık ile kazma emri, sürükleyerek alan'});
    c+=btn({n:'Topla', key:'C', act:"msg('Kaynağa sağ tıkla')", tip:'Yaprak, bitki, mantar, leş veya yaprak bitine sağ tık'});
  }
  if(sel.some(u=>u.d.found))
    c+=btn({n:'Yeni Yuva Kur', key:'N', act:'foundMode=true;refreshUI()', tip:'Prenses yeni bir Kraliçe Odası kurar'});
  return c;
}

// ------------------------------------------------------------ HUD
function hud(dt){
  const T=P, R=T.res;
  trackIncome(dt);
  const idleN=units.filter(u=>u.team===PLAYER&&u.d.work&&!u.job).length;
  let s='';
  for(const r of RESL){
    const rate=incRate[r.k]||0;
    s+=`<div class="res" data-tip="${r.n} — dakikada ~${Math.round(rate)}">
      <span class="ic">${r.ic}</span><b>${Math.floor(R[r.k])}</b>
      <span style="font-size:11px;opacity:.6">${rate>0.5?'+'+Math.round(rate):''}</span></div>`;
  }
  const popFull=popOf(PLAYER)>=popCap(PLAYER);
  s+=`<div class="sep"></div><div class="res" data-tip="Nüfus — dolduğunda Yavru Odacığı kur">👥
     <b style="color:${popFull?'#e4645a':'#ffd98a'}">${popOf(PLAYER)}/${popCap(PLAYER)}</b></div>`;
  s+=`<div class="sep"></div><div class="res idlebtn" onclick="selectIdle()" data-tip="Boş işçiye git (.)"
      style="cursor:pointer;color:${idleN?'#ffd98a':'#7d6f5d'}">💤 <b>${idleN}</b></div>`;
  s+=`<div class="sep"></div><div id="ageBox" data-tip="Çağ atlamak için bu çağdan ${AGE_REQ} oda gerekli (${ageBuildingsOf(PLAYER)}/${AGE_REQ}) — Y tuşu">${AGES[T.age-1].n}</div>`;
  s+=`<div class="sep"></div><div class="res">⏱ <b>${fmtT(st.time)}</b></div>`;
  const ic=isNight()?'🌙':'☀';
  s+=`<div class="sep"></div><div id="envBox">${ic} ${isWinter()?'❄ Kış':(isNight()?'Gece':'Gündüz')}${env.rain>0?' · 🌧':''}</div>`;
  s+=`<div class="sep"></div><div id="envBox">⚔ Dalga ${ai.wave}</div>`;
  s+=`<div class="sep"></div><div class="res" onclick="toggleHelp()" style="cursor:pointer" data-tip="Yardım (F1)">❔</div>`;
  if(st.paused) s+=`<div class="sep"></div><div style="color:#ffd98a">⏸ DURAKLATILDI</div>`;
  $('top').innerHTML=s;

  let q='';
  for(const b of blds) if(b.team===PLAYER){
    if(b.rq) q+=`<div class="qi" data-tip="${TECHS[b.rq.id].n}"><i style="height:${b.rq.p*100}%;background:#4a7a9a"></i>🔬</div>`;
    for(const it of b.q) q+=`<div class="qi" data-tip="${ANTS[it.type].n}"><i style="height:${it.p*100}%"></i>${ANTS[it.type].n.slice(0,5)}</div>`;
  }
  $('queue').innerHTML=q;

  let a='';
  for(let i=alerts.length-1;i>=0;i--){ alerts[i].life-=dt;
    if(alerts[i].life<=0){ alerts.splice(i,1); continue; } }
  alerts.forEach((al,i)=>{ a+=`<div class="alert ${al.cls}" ${al.x!==undefined?`onclick="jumpAlert(${i})" style="cursor:pointer" title="Tıkla: olay yerine git"`:''}>${al.t}</div>`; });
  $('alerts').innerHTML=a;

  // --- hedef listesi (ilk oyunu kolaylaştırır)
  if(!st.goalsDone){
    let g='<div style="font-size:11px;letter-spacing:.1em;opacity:.6;margin-bottom:3px">HEDEFLER</div>';
    let all=true;
    for(const go of GOALS){
      const ok=go.ok();
      if(!ok) all=false;
      g+=`<div style="color:${ok?'#8fc45a':'#c9b894'};font-size:12.5px;line-height:1.5">${ok?'✔':'○'} ${go.t}</div>`;
    }
    if(all){ st.goalsDone=1; addAlert('Tüm başlangıç hedefleri tamam — artık kendi planın','ok'); }
    $('goals').innerHTML=g;
    $('goals').style.display='block';
  } else $('goals').style.display='none';

  if(msgT>0){ msgT-=dt; if(msgT<=0) $('msg').textContent=''; }
}
function toggleHelp(){ const h=$('intro'); h.style.display = (h.style.display==='none'||!h.style.display)?'flex':'none'; }
