// ===================================================================
//  BAŞLATMA VE ANA DÖNGÜ
// ===================================================================
"use strict";

let started=false, last=performance.now(), uiT=0;

function initGame(){
  bgrid=new Int32Array(MW*MH);
  pfInit(); pheroInit();
  const info=genWorld();
  P=st.teams[PLAYER]; E=st.teams[ENEMY];

  const bases=[{x:20,y:46,t:PLAYER},{x:MW-21,y:46,t:ENEMY}];
  for(const b of bases){
    carveBase(b.x,b.y,b.t);
    const nx=Math.floor(b.x-1), ny=Math.floor(b.y-1);
    mkBld('nest',b.t,nx,ny,true);
    const bx=b.t===PLAYER?nx+5:nx-5;
    mkBld('brood',b.t,bx,ny,true);
    mkUnit('queen',b.t,b.x,b.y+0.3);
    for(let i=0;i<6;i++) mkUnit('worker',b.t,b.x+rnd(-3,3),b.y+rnd(-2,2));
    for(let i=0;i<2;i++) mkUnit('cutter',b.t,b.x+rnd(-3,3),b.y+rnd(-2,2));
    if(b.t===ENEMY) for(let i=0;i<2;i++) mkUnit('soldier',ENEMY,b.x+rnd(-2,2),b.y+rnd(-2,2));
  }
  regrid();
  // iki koloni birbirine ulaşabiliyor mu? değilse koridor aç
  if(ensureConnected(bases[0].x,bases[0].y,bases[1].x,bases[1].y))
    console.log('bağlantı koridoru açıldı');

  // başlangıç kaynakları: yüzey yaprakları/bitkileri, mağara mantarları, bit kolonileri
  for(let i=0;i<70;i++){ const x=ri(3,MW-4), y=surfH[x]-1;
    if(walk(x,y)){ const plant=Math.random()<0.58;
      mkNode(x+0.5,y+0.5, plant?'l':'f', plant?'plant':'leaf', rnd(100,210)); } }
  for(const c of info.caves) for(let i=0;i<ri(1,3);i++){
    const x=Math.floor(c.x+rnd(-3,3)), y=Math.floor(c.y+rnd(-2,2));
    if(walk(x,y)) mkNode(x+0.5,y+0.5,'f','mushroom',rnd(160,320)); }
  for(let i=0;i<10;i++){ const x=ri(3,MW-4), y=surfH[x]-1;
    if(walk(x,y)) mkNode(x+0.5,y+0.5,'d','aphid',rnd(160,280)); }
  nodes=nodes.filter(n=>walk(n.x|0,n.y|0));

  const n=blds.find(b=>b.team===PLAYER&&b.type==='nest');
  centerOn(n.x,n.y);
  buildTerrain();
  buildTerrain();
  updateFog(1); refreshUI();
  addAlert('Koloni kuruldu — tünel kaz ve oda inşa et','ok');
  msg('Toprağa sağ tıklayarak kazmaya başla · B ile oda kur');
}

function loop(now){
  let dt=Math.min(0.05,(now-last)/1000); last=now;
  st.fps = st.fps ? st.fps*0.92 + (1/Math.max(0.001,dt))*0.08 : 60;
  if(started){
    camUpdate(dt);
    if(!st.paused&&!st.over) for(let i=0;i<st.speed;i++) simulate(dt);
    draw(); hud(dt);
    uiT-=dt; if(uiT<=0){ uiT=0.4; refreshUI(); }
  }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------ açılış ekranı
function bootUI(){
  renderInit(); inputInit();
  const ds=$('diffSel');
  ds.innerHTML=DIFFS.map((d,i)=>`<div class="${i===1?'on':''}" data-i="${i}">${d.n}</div>`).join('');
  ds.querySelectorAll('div').forEach(el=>el.onclick=()=>{
    ds.querySelectorAll('div').forEach(x=>x.classList.remove('on'));
    el.classList.add('on'); st.diff=+el.dataset.i;
  });
  $('startBtn').onclick=()=>{
    $('intro').style.display='none';
    initGame(); started=true;
  };
}
bootUI();
requestAnimationFrame(loop);

// ------------------------------------------------------------ hata ayıklama köprüsü
window.G={
  get units(){return units}, get blds(){return blds}, get nodes(){return nodes},
  get st(){return st}, get P(){return P}, get E(){return E}, get ai(){return ai},
  get digQ(){return digQ}, get sel(){return sel}, get selB(){return selB},
  get buildMode(){return buildMode}, get env(){return env}, cam,
  start:(diff)=>{ if(started)return 'zaten'; st.diff=diff||1; $('intro').style.display='none';
    initGame(); started=true; return 'ok'; },
  speed:v=>{ st.speed=v; }, tiles:(x,y)=>tiles[ti(x,y)], addDig, canPlaceAt, mkBld, mkUnit, mkWild,
  train, research, order, popOf, popCap, techReady, techCost, centerOn, BLDS, ANTS, TECHS,
  time:()=>st.time, over:()=>st.over
};
