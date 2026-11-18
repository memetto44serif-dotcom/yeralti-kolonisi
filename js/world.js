// ===================================================================
//  DÜNYA — harita üretimi, kareler, yol bulma, sis, feromon, çevre
// ===================================================================
"use strict";

const TS=16, MW=200, MH=88;
const T_AIR=0, T_SOIL=1, T_TUN=2, T_ROCK=3, T_VEIN=4, T_OPEN=5, T_ROOT=6, T_CLAY=7, T_WATER=8;
const PLAYER=0, ENEMY=1, NEUTRAL=2;

let tiles, known, vis, tvar, surfH=[], waterT, galY=[];
// değişen kareler: zemin dokusu bu listeye göre yeniden boyanır
let dirtyTiles=[];
function setTile(x,y,t){ if(!inB(x,y))return; const i=y*MW+x; if(tiles[i]===t)return;
  tiles[i]=t; dirtyTiles.push(i); }
function setTileI(i,t){ if(tiles[i]===t)return; tiles[i]=t; dirtyTiles.push(i); }
const ti=(x,y)=>y*MW+x;
const inB=(x,y)=>x>=0&&y>=0&&x<MW&&y<MH;
const rnd=(a,b)=>a+Math.random()*(b-a);
const ri=(a,b)=>Math.floor(rnd(a,b+1));
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);

function walk(x,y){ if(!inB(x,y))return false; const t=tiles[ti(x,y)];
  return t===T_TUN||t===T_OPEN||t===T_WATER; }
function diggable(t){ return t===T_SOIL||t===T_VEIN||t===T_ROOT||t===T_CLAY; }
function digTime(t){ return t===T_CLAY?2.4:(t===T_VEIN?2.0:(t===T_ROOT?1.9:1.45)); }
function digYield(t){ return t===T_VEIN?{m:12}:(t===T_ROOT?{m:1,l:11}:{m:3}); }

// ------------------------------------------------------------ ÜRETİM
function genWorld(){
  tiles=new Uint8Array(MW*MH); known=new Uint8Array(MW*MH); vis=new Uint8Array(MW*MH);
  tvar=new Uint8Array(MW*MH); waterT=new Float32Array(MW*MH);
  for(let i=0;i<tvar.length;i++) tvar[i]=ri(0,255);

  // --- yüzey profili: yumuşak tepeler + geçilmez kaya mesaları
  let h=15, vel=0;
  const mesas=[Math.floor(MW*0.3), Math.floor(MW*0.5), Math.floor(MW*0.7)];
  for(let x=0;x<MW;x++){
    vel=clamp(vel+rnd(-0.3,0.3),-0.6,0.6); h=clamp(h+vel,6,22);
    let hh=h;
    for(const c of mesas) if(Math.abs(x-c)<8) hh-=(8-Math.abs(x-c))*1.1;
    surfH[x]=Math.round(clamp(hh,3,24));
  }
  for(let x=0;x<MW;x++){
    const s=surfH[x];
    for(let y=0;y<MH;y++){
      let t;
      if(y<s-1) t=T_AIR;
      else if(y===s-1) t=T_OPEN;
      else if(y>MH-4) t=T_ROCK;
      else if(y<s+3) t=T_SOIL;             // üst humus
      else if(y>MH*0.72) t=T_CLAY;         // derin kil: kazması zor
      else t=T_SOIL;
      tiles[ti(x,y)]=t;
    }
    // kökler yüzeye yakın
    if(Math.random()<0.17){ let ry=surfH[x]+1, rx=x;
      for(let k=0;k<ri(3,9);k++){ if(inB(rx,ry)&&tiles[ti(rx,ry)]===T_SOIL) tiles[ti(rx,ry)]=T_ROOT;
        ry++; rx+=ri(-1,1); } }
  }
  // --- kaya kümeleri ve mineral damarları
  for(let i=0;i<300;i++){
    const cx=ri(3,MW-4), cy=ri(26,MH-6), rr=rnd(1.4,4.4), vein=Math.random()<0.4;
    for(let y=Math.floor(cy-rr);y<=cy+rr;y++)for(let x=Math.floor(cx-rr);x<=cx+rr;x++)
      if(inB(x,y)&&(tiles[ti(x,y)]===T_SOIL||tiles[ti(x,y)]===T_CLAY)&&Math.hypot(x-cx,(y-cy)*1.5)<rr)
        tiles[ti(x,y)]=vein?T_VEIN:T_ROCK;
  }
  // mesaların altı tamamen kaya (yüzeyden kestirme yok)
  for(const c of mesas) for(let x=c-6;x<=c+6;x++) if(inB(x,0))
    for(let y=surfH[x];y<surfH[x]+8;y++) if(inB(x,y)) tiles[ti(x,y)]=T_ROCK;

  const carve=(x,y,r)=>{ for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++){
    if(!inB(xx,yy)||yy<surfH[xx]||yy>MH-4)continue;
    if(Math.hypot(xx-x,(yy-y)*1.22)<r) tiles[ti(xx,yy)]=T_TUN; } };

  // --- ana galeri (iki üssü birleştirir) + ikinci derin galeri
  let gy=50; galY=new Array(MW).fill(50);
  for(let x=10;x<MW-10;x++){ gy=clamp(gy+rnd(-1.1,1.1),36,62); galY[x]=Math.round(gy); carve(x,gy,rnd(1.3,2.4)); }
  for(let x=0;x<10;x++){ galY[x]=galY[10]; galY[MW-1-x]=galY[MW-11]; }
  let gy2=70;
  for(let x=26;x<MW-26;x++){ gy2=clamp(gy2+rnd(-0.9,0.9),64,MH-8); if(x%3) carve(x,gy2,rnd(1.1,1.9)); }

  // --- mağaralar
  const caves=[];
  for(let i=0;i<20;i++){
    const cx=ri(16,MW-16), cy=ri(30,MH-9), rr=rnd(3.2,5.6);
    carve(cx,cy,rr); caves.push({x:cx,y:cy,r:rr});
    let px=cx,py=cy; const ty=(cy>60?gy2:50);
    while(Math.abs(py-ty)>1){ py+=Math.sign(ty-py); carve(px,py,1.4); px=clamp(px+ri(-1,1),4,MW-5); }
  }
  // --- yeraltı su cepleri
  for(let i=0;i<10;i++){
    const cx=ri(10,MW-10), cy=ri(48,MH-7);
    for(let y=cy;y<cy+ri(1,3);y++)for(let x=cx-ri(2,5);x<cx+ri(2,5);x++)
      if(inB(x,y)&&tiles[ti(x,y)]!==T_ROCK){ tiles[ti(x,y)]=T_WATER; waterT[ti(x,y)]=1; }
  }
  return {caves, mesas};
}

function carveBase(bx,by,team){
  const carve=(x,y,r)=>{ for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++){
    if(!inB(xx,yy)||yy<surfH[xx]||yy>MH-4)continue;
    if(Math.hypot(xx-x,(yy-y)*1.22)<r) tiles[ti(xx,yy)]=T_TUN; } };
  carve(bx,by,6.0); carve(bx+(team?-5:5),by-6,3.6); carve(bx+(team?5:-5),by+4,3.2);
  let sy=by; while(sy>surfH[bx]){ carve(bx,sy,1.6); sy--; }            // yüzeye şaft
  // ana galeriye bağlantı (galerinin o sütundaki gerçek derinliğine)
  const cx=bx+(team?-3:3), ty=galY[clamp(cx,0,MW-1)]||50;
  let gy=by;
  while(gy!==ty){ gy+=Math.sign(ty-gy); carve(cx,gy,1.6); }
  carve(cx,ty,2.0);
}

// iki üs arasında yol yoksa doğrudan bir koridor aç (harita garantisi)
function ensureConnected(ax,ay,bx,by){
  pfBudget=5;
  if(findPath(ax,ay,bx,by,true,PLAYER)) return false;
  const carve=(x,y,r)=>{ for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++){
    if(!inB(xx,yy)||yy<surfH[xx]||yy>MH-4)continue;
    if(Math.hypot(xx-x,(yy-y)*1.22)<r) tiles[ti(xx,yy)]=T_TUN; } };
  const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const x=ax+(bx-ax)*t, y=ay+(by-ay)*t+Math.sin(t*Math.PI*3)*4;
    carve(x,clamp(y,surfH[clamp(x|0,0,MW-1)]+2,MH-6),1.7);
  }
  return true;
}

// ------------------------------------------------------------ YOL BULMA
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
let pfBudget=0, pfPrev=null, pfSeen=null, pfQ=null, pfStamp=0;
function pfInit(){ pfPrev=new Int32Array(MW*MH); pfSeen=new Int32Array(MW*MH); pfQ=new Int32Array(MW*MH); }

// kapılar: kendi takımının kapısı geçilir, düşmanınki engeldir
function passable(x,y,team){
  if(!walk(x,y)) return false;
  const b=bldAt(x,y);
  if(b && b.hp>0 && b.built>=1){
    if(b.d.solid) return false;                  // duvar: kimse geçemez
    if(b.d.gate && b.team!==team) return false;  // kapı: yalnız sahibi geçer
  }
  return true;
}
function findPath(sx,sy,gx,gy,adj,team){
  st.pfReq=(st.pfReq||0)+1;
  if(pfBudget<=0){ st.pfStarve=(st.pfStarve||0)+1; return null; } pfBudget--;
  sx|=0;sy|=0;gx|=0;gy|=0;
  if(!passable(sx,sy,team)){
    let best=null,bd=9;
    for(let y=sy-2;y<=sy+2;y++)for(let x=sx-2;x<=sx+2;x++) if(passable(x,y,team)){
      const d=Math.hypot(x-sx,y-sy); if(d<bd){bd=d;best=[x,y];} }
    if(!best) return null; sx=best[0]; sy=best[1];
  }
  const goalOK = adj ? (x,y)=>Math.max(Math.abs(x-gx),Math.abs(y-gy))<=1 : (x,y)=>x===gx&&y===gy;
  if(!adj && !passable(gx,gy,team)) return null;
  const stamp=++pfStamp;
  let qh=0,qt=0; pfQ[qt++]=ti(sx,sy); pfSeen[ti(sx,sy)]=stamp; pfPrev[ti(sx,sy)]=-1;
  let found=-1, steps=0;
  while(qh<qt && steps<26000){
    const c=pfQ[qh++]; steps++;
    const cx=c%MW, cy=(c/MW)|0;
    if(goalOK(cx,cy)){ found=c; break; }
    for(let i=0;i<8;i++){
      const nx=cx+DIRS[i][0], ny=cy+DIRS[i][1];
      if(!passable(nx,ny,team))continue;
      if(DIRS[i][0]&&DIRS[i][1]&&!(passable(cx+DIRS[i][0],cy,team)||passable(cx,cy+DIRS[i][1],team)))continue;
      const n=ti(nx,ny); if(pfSeen[n]===stamp)continue;
      pfSeen[n]=stamp; pfPrev[n]=c; pfQ[qt++]=n;
    }
  }
  if(found<0){ st.pfFail=(st.pfFail||0)+1; return null; }
  const out=[]; let c=found;
  while(c>=0){ out.push({x:(c%MW)+0.5, y:((c/MW)|0)+0.5}); c=pfPrev[c]; }
  out.reverse(); return out;
}

// ------------------------------------------------------------ FEROMON
let phero;                       // toplayıcı izleri (görsel + hız)
function pheroInit(){ phero=new Float32Array(MW*MH); }
function pheroDrop(x,y,a){ const i=ti(x|0,y|0); if(i>=0&&i<phero.length) phero[i]=Math.min(1.6,phero[i]+a); }
function pheroDecay(dt){ for(let i=0;i<phero.length;i++) if(phero[i]>0) phero[i]=Math.max(0,phero[i]-dt*0.035); }

// ------------------------------------------------------------ SİS
let fogT=0;
function updateFog(dt){
  fogT-=dt; if(fogT>0) return; fogT=0.2;
  vis.fill(0);
  const mark=(cx,cy,r)=>{ const r2=r*r;
    for(let y=Math.floor(cy-r);y<=cy+r;y++){ if(y<0||y>=MH)continue;
      for(let x=Math.floor(cx-r);x<=cx+r;x++){ if(x<0||x>=MW)continue;
        if((x-cx)**2+(y-cy)**2>r2)continue; const i=ti(x,y); vis[i]=1; known[i]=1; } } };
  for(const u of units) if(u.team===PLAYER) mark(u.x,u.y,u.d.vis+P.eff.vision);
  for(const b of blds) if(b.team===PLAYER) mark(b.x,b.y,b.built>=1?9:6);
}
const seen=(x,y)=>inB(x,y)&&known[ti(x,y)]===1;
const lit=(x,y)=>inB(x,y)&&vis[ti(x,y)]===1;

// ------------------------------------------------------------ ÇEVRE (gün/gece, yağmur, mevsim)
const env={ t:0, day:0.25, rain:0, rainT:70, season:0, flood:[] };
function updateEnv(dt){
  env.t+=dt;
  env.day=(env.day+dt/300)%1;                     // 5 dakikalık gün döngüsü
  env.season=(env.t/420)%1;                       // ~7 dakikalık mevsim döngüsü (0.75-1 = kış)
  env.rainT-=dt;
  if(env.rain>0){
    env.rain-=dt;
    // yağmur yüzeye yakın tünelleri su basar
    if(Math.random()<dt*3.5){
      const x=ri(2,MW-3); let y=surfH[x];
      while(y<MH-5 && tiles[ti(x,y)]!==T_TUN) y++;
      if(y<MH-5 && tiles[ti(x,y)]===T_TUN && y<surfH[x]+16){ setTile(x,y,T_WATER); waterT[ti(x,y)]=rnd(6,16); }
    }
    if(env.rain<=0) addAlert('Yağmur dindi','ok');
  } else if(env.rainT<=0){
    env.rain=rnd(22,40); env.rainT=rnd(150,260);
    addAlert('⛈ Yağmur başladı — yüzeye dikkat');
  }
  // su kareleri zamanla çekilir
  if(Math.random()<dt*6){
    const i=ri(0,MW*MH-1);
    if(tiles[i]===T_WATER && waterT[i]>0){ waterT[i]-=1;
      if(waterT[i]<=0 && (i/MW|0)<MH-6){ setTileI(i,T_TUN); } }
  }
}
const isNight=()=>env.day>0.5;
const isWinter=()=>env.season>0.72;
const lightLevel=()=>{ // 0 gece, 1 öğlen
  const d=env.day; return clamp(1-Math.abs(d-0.25)*3.2,0.12,1); };
