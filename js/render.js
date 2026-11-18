// ===================================================================
//  ÇİZİM — ön-render edilmiş toprak dokusu, ışık, anatomik karıncalar
// ===================================================================
"use strict";

let cv, ctx, mm, mmx, cam={x:0,y:0,z:1.4};
let terrCv, tg;                       // zemin dokusu (bir kez boyanır, kazdıkça güncellenir)
let rainDrops=[], stars=[], clouds=[], decals=[];

function renderInit(){
  cv=document.getElementById('game'); ctx=cv.getContext('2d');
  mm=document.getElementById('minimap'); mmx=mm.getContext('2d',{willReadFrequently:true});
  for(let i=0;i<160;i++) stars.push({x:Math.random(),y:Math.random()*0.65,s:Math.random()});
  for(let i=0;i<260;i++) rainDrops.push({x:Math.random(),y:Math.random(),v:rnd(.6,1.4)});
  for(let i=0;i<14;i++) clouds.push({x:Math.random(),y:rnd(0.05,0.5),s:rnd(0.5,1.6),v:rnd(0.2,0.6)});
  resizeCanvas();
}
function resizeCanvas(){ cv.width=innerWidth; cv.height=innerHeight; }

// ------------------------------------------------------------ deterministik gürültü
function nz(x,y,k){
  let h=(x*374761393 + y*668265263 + k*1442695040)|0;
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}

// ------------------------------------------------------------ toprak renkleri
const STRATA=[
  {y:0,  c:[104,76,44]},   // humus
  {y:10, c:[92,64,36]},
  {y:24, c:[78,54,31]},
  {y:40, c:[66,46,27]},
  {y:56, c:[58,41,25]},
  {y:64, c:[96,72,50]},    // kil bandı
  {y:88, c:[60,45,32]}
];
function soilRGB(y,n){
  let a=STRATA[0], b=STRATA[STRATA.length-1];
  for(let i=0;i<STRATA.length-1;i++) if(y>=STRATA[i].y&&y<STRATA[i+1].y){ a=STRATA[i]; b=STRATA[i+1]; }
  const t=clamp((y-a.y)/Math.max(1,(b.y-a.y)),0,1), d=(n-0.5)*22;
  return [clamp(a.c[0]+(b.c[0]-a.c[0])*t+d,0,255)|0,
          clamp(a.c[1]+(b.c[1]-a.c[1])*t+d,0,255)|0,
          clamp(a.c[2]+(b.c[2]-a.c[2])*t+d,0,255)|0];
}
const rgb=c=>'rgb('+c[0]+','+c[1]+','+c[2]+')';
function mix(c,amt){ return [clamp(c[0]+255*amt,0,255)|0,clamp(c[1]+255*amt,0,255)|0,clamp(c[2]+255*amt,0,255)|0]; }

// ------------------------------------------------------------ zemin dokusu
function buildTerrain(){
  terrCv=document.createElement('canvas');
  terrCv.width=MW*TS; terrCv.height=MH*TS;
  tg=terrCv.getContext('2d');
  for(let y=0;y<MH;y++) for(let x=0;x<MW;x++) paintTile(x,y);
  dirtyTiles.length=0;
}
function flushDirty(){
  if(!dirtyTiles.length) return;
  const set=new Set();
  for(const i of dirtyTiles){
    const x=i%MW, y=(i/MW)|0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const nx2=x+dx, ny2=y+dy; if(inB(nx2,ny2)) set.add(ny2*MW+nx2); }
  }
  dirtyTiles.length=0;
  for(const i of set) paintTile(i%MW,(i/MW)|0);
}
function paintTile(x,y){
  const i=ti(x,y), t=tiles[i], X=x*TS, Y=y*TS;
  tg.clearRect(X,Y,TS,TS);
  if(t===T_AIR||t===T_OPEN) return;                 // gökyüzü/yüzey canlı çizilir
  const n=nz(x,y,1);

  if(t===T_SOIL||t===T_CLAY||t===T_ROOT){
    let base=soilRGB(y,n);
    if(t===T_CLAY) base=[clamp(base[0]+26,0,255)|0,clamp(base[1]+12,0,255)|0,clamp(base[2]-2,0,255)|0];
    tg.fillStyle=rgb(base); tg.fillRect(X,Y,TS,TS);
    // piksel seviyesinde ikinci oktav: toprak tanesi (yalnız bir kez üretilir)
    for(let py=0;py<TS;py+=2) for(let px=0;px<TS;px+=2){
      const n1=nz(x*TS+px,y*TS+py,21), n2=nz(x*TS+px,y*TS+py,33);
      const v=(n1*0.65+n2*0.35-0.5);
      if(Math.abs(v)<0.12) continue;
      tg.fillStyle = v>0 ? 'rgba(255,238,210,'+(v*0.16)+')' : 'rgba(0,0,0,'+(-v*0.22)+')';
      tg.fillRect(X+px,Y+py,2,2);
    }
    // yönlü ışık: üst-sol kenar aydınlık, alt-sağ karanlık (hacim hissi)
    tg.fillStyle='rgba(255,236,205,.07)'; tg.fillRect(X,Y,TS,2);
    tg.fillStyle='rgba(255,236,205,.04)'; tg.fillRect(X,Y,2,TS);
    tg.fillStyle='rgba(0,0,0,.10)'; tg.fillRect(X,Y+TS-2,TS,2);
    tg.fillStyle='rgba(0,0,0,.06)'; tg.fillRect(X+TS-2,Y,2,TS);
    // yatay tortu çizgileri (katmanlı kesit hissi)
    for(let py=0;py<TS;py+=2){
      const s=nz(x,(y*TS+py)|0,7);
      if(s>0.72){ tg.fillStyle='rgba(0,0,0,'+(0.05+s*0.07)+')'; tg.fillRect(X,Y+py,TS,1); }
      else if(s<0.1){ tg.fillStyle='rgba(255,230,190,0.045)'; tg.fillRect(X,Y+py,TS,1); }
    }
    // taneler / çakıl
    for(let k=0;k<7;k++){
      const px=nz(x,y,10+k)*TS, py=nz(x,y,30+k)*TS, s=nz(x,y,50+k);
      if(s>0.87){                                   // çakıl taşı
        const rr=1+s*2.2, col=mix(base,0.1+s*0.1);
        tg.fillStyle=rgb(col); tg.beginPath(); tg.ellipse(X+px,Y+py,rr,rr*0.8,s*3,0,7); tg.fill();
        tg.fillStyle='rgba(255,240,215,.1)'; tg.beginPath();
        tg.ellipse(X+px-rr*0.25,Y+py-rr*0.3,rr*0.4,rr*0.3,0,0,7); tg.fill();
        tg.fillStyle='rgba(0,0,0,.22)'; tg.beginPath();
        tg.ellipse(X+px+rr*0.2,Y+py+rr*0.35,rr*0.5,rr*0.3,0,0,7); tg.fill();
      } else {
        tg.fillStyle = s>0.4?'rgba(0,0,0,.14)':'rgba(255,235,205,.06)';
        tg.fillRect(X+px,Y+py,1+ (s>0.6?1:0),1);
      }
    }
    if(t===T_CLAY){                                  // kil çatlakları
      tg.strokeStyle='rgba(60,40,26,.35)'; tg.lineWidth=1;
      tg.beginPath(); tg.moveTo(X+nz(x,y,61)*TS,Y);
      tg.lineTo(X+nz(x,y,62)*TS,Y+TS*0.55); tg.lineTo(X+nz(x,y,63)*TS,Y+TS); tg.stroke();
    }
    if(t===T_ROOT){                                  // kök: komşu karelere bağlanır
      const a=nz(x,y,71), b2=nz(x,y+1,71);
      tg.strokeStyle='rgb(94,64,32)'; tg.lineWidth=2.6+nz(x,y,72)*1.6; tg.lineCap='round';
      tg.beginPath(); tg.moveTo(X+2+a*(TS-4),Y);
      tg.quadraticCurveTo(X+TS*0.5+(a-0.5)*8,Y+TS*0.5,X+2+b2*(TS-4),Y+TS); tg.stroke();
      tg.strokeStyle='rgba(150,110,60,.4)'; tg.lineWidth=1;
      tg.beginPath(); tg.moveTo(X+2+a*(TS-4)-1,Y); tg.quadraticCurveTo(X+TS*0.5+(a-0.5)*8-1,Y+TS*0.5,X+2+b2*(TS-4)-1,Y+TS); tg.stroke();
      // saçak kökler
      tg.strokeStyle='rgba(110,78,40,.55)'; tg.lineWidth=1;
      for(let k=0;k<3;k++){ const yy=Y+TS*(0.2+k*0.3), xx=X+2+a*(TS-4);
        tg.beginPath(); tg.moveTo(xx,yy); tg.lineTo(xx+(nz(x,y,80+k)-0.5)*TS*0.9,yy+(nz(x,y,90+k)-0.5)*6); tg.stroke(); }
    }
  }
  else if(t===T_ROCK){
    const g=56+nz(x,y,2)*26;
    tg.fillStyle='rgb('+(g|0)+','+((g*0.96)|0)+','+((g*0.88)|0)+')'; tg.fillRect(X,Y,TS,TS);
    // kaya granülü (piksel seviyesinde, bir kez)
    for(let py=0;py<TS;py+=2) for(let px=0;px<TS;px+=2){
      const v=nz(x*TS+px,y*TS+py,41)*0.6+nz(x*TS+px,y*TS+py,53)*0.4-0.5;
      if(Math.abs(v)<0.14) continue;
      tg.fillStyle = v>0 ? 'rgba(255,255,255,'+(v*0.14)+')' : 'rgba(0,0,0,'+(-v*0.2)+')';
      tg.fillRect(X+px,Y+py,2,2);
    }
    // köşeli yüzeyler
    for(let k=0;k<3;k++){
      const a=nz(x,y,100+k), b2=nz(x,y,110+k);
      tg.fillStyle = a>0.5?'rgba(255,255,255,.07)':'rgba(0,0,0,.18)';
      tg.beginPath();
      tg.moveTo(X+a*TS,Y+b2*TS); tg.lineTo(X+a*TS+5+b2*5,Y+b2*TS+2);
      tg.lineTo(X+a*TS+2,Y+b2*TS+5+a*4); tg.closePath(); tg.fill();
    }
    tg.strokeStyle='rgba(0,0,0,.3)'; tg.lineWidth=1;
    tg.beginPath(); tg.moveTo(X,Y+nz(x,y,3)*TS); tg.lineTo(X+TS,Y+nz(x+1,y,3)*TS); tg.stroke();
  }
  else if(t===T_VEIN){
    const g=58+nz(x,y,2)*18;
    tg.fillStyle='rgb('+(g|0)+','+((g*1.02)|0)+','+((g*1.25)|0)+')'; tg.fillRect(X,Y,TS,TS);
    for(let k=0;k<4;k++){
      const px=X+nz(x,y,120+k)*TS, py=Y+nz(x,y,130+k)*TS, s=2+nz(x,y,140+k)*3;
      tg.fillStyle='rgba(150,220,245,'+(0.45+nz(x,y,150+k)*0.4)+')';
      tg.beginPath(); tg.moveTo(px,py-s); tg.lineTo(px+s*0.6,py); tg.lineTo(px,py+s); tg.lineTo(px-s*0.6,py);
      tg.closePath(); tg.fill();
      tg.fillStyle='rgba(255,255,255,.55)'; tg.fillRect(px-0.5,py-s*0.5,1,s*0.6);
    }
  }
  else if(t===T_WATER){
    tg.fillStyle='rgb(26,20,14)'; tg.fillRect(X,Y,TS,TS);
    tg.fillStyle='rgba(42,86,112,.85)'; tg.fillRect(X,Y+3,TS,TS-3);
  }
  else {                                            // ---------------- TÜNEL
    const base=soilRGB(y,n);
    const floor=[ (base[0]*0.52+10)|0, (base[1]*0.46+7)|0, (base[2]*0.40+5)|0 ];
    tg.fillStyle=rgb(floor); tg.fillRect(X,Y,TS,TS);
    // taban molozu
    for(let k=0;k<4;k++){
      const px=X+nz(x,y,160+k)*TS, py=Y+TS*(0.55+nz(x,y,170+k)*0.4), s=nz(x,y,180+k);
      tg.fillStyle = s>0.5?'rgba(255,220,170,.07)':'rgba(0,0,0,.25)';
      tg.fillRect(px,py,1+s,1);
    }
    // duvar gölgeleri (ambient occlusion) ve ışık alan alt kenar
    const solid=(dx,dy)=>!walk(x+dx,y+dy);
    const AO=7;
    if(solid(0,-1)){ const g=tg.createLinearGradient(0,Y,0,Y+AO);
      g.addColorStop(0,'rgba(0,0,0,.48)'); g.addColorStop(1,'rgba(0,0,0,0)');
      tg.fillStyle=g; tg.fillRect(X,Y,TS,AO); }
    if(solid(0,1)){ const g=tg.createLinearGradient(0,Y+TS,0,Y+TS-AO);
      g.addColorStop(0,'rgba(0,0,0,.45)'); g.addColorStop(1,'rgba(0,0,0,0)');
      tg.fillStyle=g; tg.fillRect(X,Y+TS-AO,TS,AO);
      tg.fillStyle='rgba(255,206,150,.10)'; tg.fillRect(X,Y+TS-2,TS,2); }
    if(solid(-1,0)){ const g=tg.createLinearGradient(X,0,X+AO,0);
      g.addColorStop(0,'rgba(0,0,0,.5)'); g.addColorStop(1,'rgba(0,0,0,0)');
      tg.fillStyle=g; tg.fillRect(X,Y,AO,TS); }
    if(solid(1,0)){ const g=tg.createLinearGradient(X+TS,0,X+TS-AO,0);
      g.addColorStop(0,'rgba(0,0,0,.5)'); g.addColorStop(1,'rgba(0,0,0,0)');
      tg.fillStyle=g; tg.fillRect(X+TS-AO,Y,AO,TS); }
  }

  // katı karenin tünele bakan kenarına ışık vurgusu (kazılmış duvar ağzı)
  if(t!==T_TUN&&t!==T_WATER){
    if(walk(x,y+1)){ tg.fillStyle='rgba(255,224,180,.14)'; tg.fillRect(X,Y+TS-2,TS,2); }
    if(walk(x,y-1)){ tg.fillStyle='rgba(0,0,0,.2)'; tg.fillRect(X,Y,TS,2); }
    if(walk(x-1,y)){ tg.fillStyle='rgba(255,224,180,.07)'; tg.fillRect(X,Y,2,TS); }
    if(walk(x+1,y)){ tg.fillStyle='rgba(255,224,180,.07)'; tg.fillRect(X+TS-2,Y,2,TS); }
  }
}

// ------------------------------------------------------------ ANA ÇİZİM
function draw(){
  const W=cv.width, H=cv.height, z=cam.z, S=TS*z;
  const sx=x=>(x*TS-cam.x)*z, sy=y=>(y*TS-cam.y)*z;
  const x0=Math.max(0,Math.floor(cam.x/TS)-1), y0=Math.max(0,Math.floor(cam.y/TS)-1);
  const x1=Math.min(MW-1,Math.ceil((cam.x+W/z)/TS)), y1=Math.min(MH-1,Math.ceil((cam.y+H/z)/TS));
  const L=lightLevel();
  flushDirty();

  ctx.fillStyle='#05070a'; ctx.fillRect(0,0,W,H);
  drawSky(W,H,sy,L);

  // ---------- zemin (ön-render edilmiş doku)
  const srcX=Math.max(0,cam.x), srcY=Math.max(0,cam.y);
  const srcW=Math.min(terrCv.width-srcX, W/z), srcH=Math.min(terrCv.height-srcY, H/z);
  if(srcW>0&&srcH>0){
    ctx.imageSmoothingEnabled = z<1;
    ctx.drawImage(terrCv, srcX,srcY,srcW,srcH, (srcX-cam.x)*z,(srcY-cam.y)*z, srcW*z,srcH*z);
    ctx.imageSmoothingEnabled = true;
  }
  // bilinmeyen alanları karart (keşfedilmemiş toprak)
  for(let y=y0;y<=y1;y++){ let run=-1;
    for(let x=x0;x<=x1+1;x++){
      const unk = x<=x1 && !known[ti(x,y)];
      if(unk){ if(run<0) run=x; }
      else if(run>=0){ ctx.fillStyle='#05070a'; ctx.fillRect(sx(run),sy(y),(x-run)*S+1,S+1); run=-1; } } }

  // ---------- yüzey örtüsü (çimen, canlı ışıkla)
  drawSurface(x0,x1,sx,sy,S,L);
  // ---------- su animasyonu
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    if(tiles[ti(x,y)]!==T_WATER||!known[ti(x,y)])continue;
    const X=sx(x), Y=sy(y), w=0.5+0.5*Math.sin(st.time*2+x*0.8+y);
    ctx.fillStyle='rgba(120,190,225,'+(0.1+0.08*w)+')'; ctx.fillRect(X,Y+S*0.2,S+1,S*0.2);
    ctx.fillStyle='rgba(180,225,245,.22)'; ctx.fillRect(X,Y+S*0.22+w*2,S+1,1.5);
  }
  // ---------- feromon izleri
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    const i=ti(x,y); if(!vis[i]||tiles[i]!==T_TUN)continue;
    const ph=phero[i]; if(ph<=0.06)continue;
    ctx.fillStyle='rgba(226,186,104,'+Math.min(.10,ph*0.07)+')'; ctx.fillRect(sx(x),sy(y),S+1,S+1);
  }
  // ---------- oda ışıkları
  for(const b of blds){
    if(b.built<1||!seen(b.x|0,b.y|0))continue;
    const X=sx(b.x-0.5)+S/2, Y=sy(b.y-0.5)+S/2, R=S*(b.type==='nest'?7:5);
    if(X<-R||X>W+R||Y<-R||Y>H+R)continue;
    const g=ctx.createRadialGradient(X,Y,0,X,Y,R);
    const warm = b.team===PLAYER?'rgba(255,196,110,':'rgba(255,130,90,';
    g.addColorStop(0,warm+'0.20)'); g.addColorStop(0.5,warm+'0.08)'); g.addColorStop(1,warm+'0)');
    ctx.fillStyle=g; ctx.fillRect(X-R,Y-R,R*2,R*2);
  }

  // ---------- kazma işaretleri
  ctx.lineWidth=1.5;
  for(const d of digQ[PLAYER]){
    if(d.x<x0||d.x>x1||d.y<y0||d.y>y1)continue;
    ctx.strokeStyle='rgba(255,212,116,.75)'; ctx.setLineDash([4,3]);
    ctx.strokeRect(sx(d.x)+2,sy(d.y)+2,S-4,S-4); ctx.setLineDash([]);
    if(d.p){ ctx.fillStyle='rgba(255,212,116,.28)'; ctx.fillRect(sx(d.x)+2,sy(d.y)+S-3-(S-6)*d.p,S-4,(S-6)*d.p); }
  }
  // ---------- leş izleri
  for(const dc of decals){
    if(!seen(dc.x|0,dc.y|0))continue;
    const X=sx(dc.x-0.5)+S/2, Y=sy(dc.y-0.5)+S/2;
    if(X<-20||X>W+20||Y<-20||Y>H+20)continue;
    ctx.save(); ctx.globalAlpha=Math.min(0.55,dc.life/12); ctx.translate(X,Y); ctx.rotate(dc.ang);
    const r=dc.r*S/16;
    ctx.fillStyle=dc.col;
    ctx.beginPath(); ctx.ellipse(-r*0.9,0,r*0.7,r*0.5,0,0,7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,0,r*0.42,r*0.36,0,0,7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r*0.7,0,r*0.38,r*0.34,0,0,7); ctx.fill();
    ctx.strokeStyle=dc.col; ctx.lineWidth=Math.max(1,0.8*S/16);
    for(let i=0;i<3;i++){ const o=(i-1)*r*0.4;
      ctx.beginPath(); ctx.moveTo(o,0); ctx.lineTo(o+r*0.5,r*(0.9+i*0.1)); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha=1;
  }

  // ---------- kaynaklar
  for(const n of nodes){
    if(n.a<=0||!seen(n.x|0,n.y|0))continue;
    if(n.x<x0-2||n.x>x1+2||n.y<y0-2||n.y>y1+2)continue;
    drawNode(n,sx(n.x-0.5)+S/2,sy(n.y-0.5)+S/2,S);
  }
  // ---------- odalar
  for(const b of blds){ if(b.team!==PLAYER&&!seen(b.x|0,b.y|0))continue; drawBld(b,sx,sy,S); }
  // ---------- birimler
  for(const u of units){
    if(u.team!==PLAYER&&!lit(u.x|0,u.y|0))continue;
    if(u.x<x0-3||u.x>x1+3||u.y<y0-3||u.y>y1+3)continue;
    if(u.wild) drawWild(u,sx(u.x-0.5)+S/2,sy(u.y-0.5)+S/2,S);
    else drawAnt(u,sx(u.x-0.5)+S/2,sy(u.y-0.5)+S/2,S);
  }
  // ---------- mermi & parçacık
  for(const s of shots){
    const X=sx(s.x-0.5)+S/2+(sx(s.tx-0.5)-sx(s.x-0.5))*s.t;
    const Y=sy(s.y-0.5)+S/2+(sy(s.ty-0.5)-sy(s.y-0.5))*s.t - Math.sin(s.t*Math.PI)*S*0.45;
    const g=ctx.createRadialGradient(X,Y,0,X,Y,S*0.2);
    const c=s.team===PLAYER?'190,240,110':'245,165,105';
    g.addColorStop(0,'rgba('+c+',.95)'); g.addColorStop(1,'rgba('+c+',0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X,Y,S*0.2,0,7); ctx.fill();
  }
  for(const p of parts){ ctx.globalAlpha=Math.max(0,Math.min(1,p.l*1.8)); ctx.fillStyle=p.c;
    const s2=Math.max(1.5,S*0.1);
    ctx.fillRect(sx(p.x-0.5)+S/2,sy(p.y-0.5)+S/2,s2,s2); }
  ctx.globalAlpha=1;

  // ---------- hava
  if(env.rain>0) drawRain(W,H,sy);
  if(L<0.92){ const bot=Math.min(H,sy(26));
    if(bot>0){ ctx.fillStyle='rgba(8,12,30,'+(0.68*(1-L))+')'; ctx.fillRect(0,0,W,bot); } }

  // ---------- sis (keşfedilmiş ama görülmeyen)
  for(let y=y0;y<=y1;y++){ let run=-1;
    for(let x=x0;x<=x1+1;x++){
      const dark = x<=x1 && known[ti(x,y)] && !vis[ti(x,y)];
      if(dark){ if(run<0) run=x; }
      else if(run>=0){ ctx.fillStyle='rgba(5,8,12,.55)'; ctx.fillRect(sx(run),sy(y),(x-run)*S+1,S+1); run=-1; } } }

  postFX(W,H,sx,sy,S,L);
  if(window.TUT) TUT.drawArrow(sx,sy,S);
  drawCursor(sx,sy,S);
  drawMini();
}

// ------------------------------------------------------------ gökyüzü & yüzey
function drawSky(W,H,sy,L){
  const skyTop=sy(0), skyBot=sy(26);
  if(skyBot<=0) return;
  const top=Math.max(0,skyTop), bot=Math.min(H,skyBot);
  const g=ctx.createLinearGradient(0,skyTop,0,skyBot);
  const dawn=Math.max(0,1-Math.abs(env.day-0.06)*9)+Math.max(0,1-Math.abs(env.day-0.47)*9);
  g.addColorStop(0, `rgb(${(14+78*L+40*dawn)|0},${(20+104*L+10*dawn)|0},${(40+140*L)|0})`);
  g.addColorStop(0.7, `rgb(${(30+150*L+70*dawn)|0},${(34+116*L+20*dawn)|0},${(52+96*L)|0})`);
  g.addColorStop(1, `rgb(${(46+150*L+80*dawn)|0},${(44+110*L+30*dawn)|0},${(56+80*L)|0})`);
  ctx.fillStyle=g; ctx.fillRect(0,top,W,bot-top);
  const night=1-L;
  if(night>0.3){ ctx.fillStyle='rgba(255,255,255,'+Math.min(.85,(night-0.3)*1.6)+')';
    for(const s of stars){ const yy=top+s.y*(bot-top);
      ctx.fillRect(s.x*W, yy, 1+s.s, 1+s.s); } }
  // güneş / ay
  const ang=env.day*Math.PI*2-Math.PI/2;
  const cxp=W*0.5+Math.cos(ang)*W*0.45, cyp=top+(bot-top)*0.8+Math.sin(ang)*(bot-top)*0.7;
  const R=isNight()?10:16;
  const gg=ctx.createRadialGradient(cxp,cyp,0,cxp,cyp,R*4);
  gg.addColorStop(0,isNight()?'rgba(225,232,245,.9)':'rgba(255,238,170,.95)');
  gg.addColorStop(0.25,isNight()?'rgba(190,205,235,.35)':'rgba(255,220,130,.4)');
  gg.addColorStop(1,'rgba(255,220,130,0)');
  ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(cxp,cyp,R*4,0,7); ctx.fill();
  ctx.fillStyle=isNight()?'#e8edf7':'#fff3c4'; ctx.beginPath(); ctx.arc(cxp,cyp,R,0,7); ctx.fill();
  // bulutlar (paralaks)
  for(const c of clouds){
    const X=(((c.x + st.time*0.004*c.v - cam.x*0.00012)%1)+1)%1*(W+300)-150;
    const Y=top+(bot-top)*c.y;
    ctx.fillStyle='rgba(235,235,245,'+(0.08+0.12*L)+')';
    for(let k=0;k<4;k++){
      ctx.beginPath();
      ctx.ellipse(X+k*22*c.s,Y+Math.sin(k)*5*c.s,30*c.s,13*c.s,0,0,7); ctx.fill(); }
  }
}
function drawSurface(x0,x1,sx,sy,S,L){
  for(let x=x0;x<=x1;x++){
    const y=surfH[x]-1; if(!inB(x,y)||!known[ti(x,y)])continue;
    const X=sx(x), Y=sy(y);
    // toprak üstü çim örtüsü
    ctx.fillStyle='rgba(58,92,42,'+(0.45+0.4*L)+')';
    ctx.fillRect(X,Y+S*0.74,S+1,S*0.3);
    const sway=Math.sin(st.time*1.6+x*0.5)*(env.rain>0?2.4:1.1);
    ctx.lineWidth=Math.max(1,S*0.055);
    for(let k=0;k<3;k++){
      const gx=X+(nz(x,k,5))*S, h=S*(0.45+nz(x,k,6)*0.45);
      ctx.strokeStyle='rgba('+(78+nz(x,k,8)*40|0)+','+(126+nz(x,k,9)*50|0)+',54,'+(0.42+0.45*L)+')';
      ctx.beginPath(); ctx.moveTo(gx,Y+S);
      ctx.quadraticCurveTo(gx+sway*0.5,Y+S-h*0.6,gx+sway,Y+S-h); ctx.stroke();
    }
  }
}
function drawRain(W,H,sy){
  const t=st.time, lim=sy(28);
  ctx.strokeStyle='rgba(168,200,235,.42)'; ctx.lineWidth=1;
  ctx.beginPath();
  for(const d of rainDrops){
    const X=((d.x+t*0.03)%1)*W, Y=((d.y+t*d.v*0.55)%1)*H;
    if(Y>lim)continue;
    ctx.moveTo(X,Y); ctx.lineTo(X-3,Y+12);
  }
  ctx.stroke();
}
function drawCursor(sx,sy,S){
  if(mouse.down&&mouse.drag){
    const X=Math.min(mouse.sx,mouse.x), Y=Math.min(mouse.sy,mouse.y);
    ctx.strokeStyle='#9fd07a'; ctx.lineWidth=1.5;
    ctx.strokeRect(X,Y,Math.abs(mouse.x-mouse.sx),Math.abs(mouse.y-mouse.sy));
    ctx.fillStyle='rgba(159,208,122,.11)'; ctx.fillRect(X,Y,Math.abs(mouse.x-mouse.sx),Math.abs(mouse.y-mouse.sy));
  }
  if(mouse.rdown&&mouse.rdrag){
    const a=w2t(mouse.rsx,mouse.rsy), b=w2t(mouse.x,mouse.y);
    const X=Math.min(a.x,b.x),Y=Math.min(a.y,b.y),W2=Math.abs(a.x-b.x)+1,H2=Math.abs(a.y-b.y)+1;
    ctx.strokeStyle='#ffd27a'; ctx.lineWidth=2; ctx.strokeRect(sx(X),sy(Y),W2*S,H2*S);
    ctx.fillStyle='rgba(255,210,116,.12)'; ctx.fillRect(sx(X),sy(Y),W2*S,H2*S);
  }
  if(buildMode){
    const d=BLDS[buildMode], t=w2t(mouse.x,mouse.y);
    const tx=t.x-Math.floor(d.w/2), ty=t.y-Math.floor(d.h/2);
    const ok=canPlaceAt(tx,ty,d,PLAYER)&&canPay(PLAYER,d.cost);
    ctx.globalAlpha=.5; ctx.fillStyle=ok?'#6fae3f':'#c4453a'; ctx.fillRect(sx(tx),sy(ty),d.w*S,d.h*S);
    ctx.globalAlpha=1; ctx.strokeStyle=ok?'#9fd07a':'#e4645a'; ctx.lineWidth=2;
    ctx.strokeRect(sx(tx),sy(ty),d.w*S,d.h*S);
  }
  if(foundMode){
    const t=w2t(mouse.x,mouse.y), d=BLDS.nest;
    const tx=t.x-1, ty=t.y-1, ok=canPlaceAt(tx,ty,d,PLAYER);
    ctx.globalAlpha=.5; ctx.fillStyle=ok?'#e3bcdd':'#c4453a'; ctx.fillRect(sx(tx),sy(ty),d.w*S,d.h*S); ctx.globalAlpha=1;
  }
}

// ------------------------------------------------------------ kaynak çizimi
function drawNode(n,X,Y,S){
  const r=Math.max(3.5,S*0.32)*Math.min(1.25,0.55+n.a/260);
  ctx.save(); ctx.translate(X,Y);
  ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0,r*0.7,r*0.95,r*0.3,0,0,7); ctx.fill();
  if(n.kind==='leaf'){
    const g=ctx.createLinearGradient(-r,0,r,0);
    g.addColorStop(0,'#5d9c32'); g.addColorStop(1,'#8cc957');
    ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,r*1.25,r*0.62,-0.45,0,7); ctx.fill();
    ctx.strokeStyle='rgba(50,88,24,.85)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-r,r*0.42); ctx.lineTo(r,-r*0.42); ctx.stroke();
    for(let k=-2;k<=2;k++){ ctx.beginPath();
      ctx.moveTo(k*r*0.35,-k*r*0.15); ctx.lineTo(k*r*0.35-r*0.3,-k*r*0.15-r*0.35); ctx.stroke(); }
  } else if(n.kind==='plant'){
    ctx.strokeStyle='#4e8a30'; ctx.lineWidth=Math.max(1.4,S*0.07); ctx.lineCap='round';
    for(let k=-1;k<2;k++){ ctx.beginPath(); ctx.moveTo(0,r*0.8);
      ctx.quadraticCurveTo(k*r*0.9,-r*0.1,k*r*1.15,-r*1.15); ctx.stroke(); }
    for(let k=-1;k<2;k++){
      const g=ctx.createLinearGradient(k*r*1.15-r*0.5,-r*1.4,k*r*1.15+r*0.5,-r*0.9);
      g.addColorStop(0,'#6fae3f'); g.addColorStop(1,'#a8d86a');
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(k*r*1.15,-r*1.15,r*0.55,r*0.3,k*0.55,0,7); ctx.fill(); }
  } else if(n.kind==='mushroom'){
    for(let k=0;k<3;k++){ const px=(k-1)*r*0.8, sc=0.8+nz(k,n.x|0,3)*0.5;
      ctx.fillStyle='#8f7a9e'; ctx.fillRect(px-r*0.09*sc,-r*0.05,r*0.18*sc,r*0.7*sc);
      const g=ctx.createRadialGradient(px,-r*0.15,0,px,-r*0.15,r*0.55*sc);
      g.addColorStop(0,'#e3c0ee'); g.addColorStop(1,'#a97fba');
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(px,-r*0.12,r*0.5*sc,r*0.34*sc,0,Math.PI,0); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.ellipse(px-r*0.14,-r*0.24,r*0.12,r*0.07,0,0,7); ctx.fill(); }
  } else if(n.kind==='aphid'){
    for(let k=0;k<5;k++){
      const px=Math.cos(k*1.35)*r*0.75, py=Math.sin(k*1.35)*r*0.4;
      const g=ctx.createRadialGradient(px-r*0.1,py-r*0.1,0,px,py,r*0.4);
      g.addColorStop(0,'#c3e88f'); g.addColorStop(1,'#78ab46');
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(px,py,r*0.34,r*0.26,0,0,7); ctx.fill();
      ctx.strokeStyle='rgba(70,100,40,.8)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px,py+r*0.2); ctx.lineTo(px+1,py+r*0.42); ctx.stroke(); }
    ctx.fillStyle='rgba(240,190,80,.9)';
    ctx.beginPath(); ctx.arc(0,-r*0.7,r*0.22,0,7); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-r*0.07,-r*0.78,r*0.07,0,7); ctx.fill();
  } else {                                     // leş
    ctx.fillStyle='#7d5f42'; ctx.beginPath(); ctx.ellipse(0,0,r*0.95,r*0.52,0.3,0,7); ctx.fill();
    ctx.fillStyle='#8f7050'; ctx.beginPath(); ctx.ellipse(r*0.6,-r*0.1,r*0.4,r*0.32,0.3,0,7); ctx.fill();
    ctx.strokeStyle='#5a4432'; ctx.lineWidth=1.3; ctx.lineCap='round';
    for(let k=-1;k<2;k++){ ctx.beginPath(); ctx.moveTo(k*r*0.4,0);
      ctx.lineTo(k*r*0.75,r*0.85); ctx.stroke(); }
  }
  ctx.restore();
}

// ------------------------------------------------------------ oda çizimi
function drawBld(b,sx,sy,S){
  const d=b.d, X=sx(b.tx), Y=sy(b.ty), W=d.w*S, H=d.h*S, pc=b.team===PLAYER, s=S/16;
  ctx.globalAlpha=b.built<1?0.45+b.built*0.5:1;
  // oyulmuş oda: zemin + kubbe gölgesi
  const g=ctx.createLinearGradient(0,Y,0,Y+H);
  g.addColorStop(0, pc?'#3a2d1a':'#3a1d1c'); g.addColorStop(1, pc?'#241b0f':'#271312');
  ctx.fillStyle=g; ctx.fillRect(X,Y,W,H);
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(X,Y,W,H*0.16);
  ctx.fillStyle='rgba(255,206,150,.12)'; ctx.fillRect(X,Y+H-Math.max(2,H*0.07),W,Math.max(2,H*0.07));
  ctx.strokeStyle=pc?'rgba(198,154,78,.95)':'rgba(196,85,58,.95)'; ctx.lineWidth=2;
  ctx.strokeRect(X+1,Y+1,W-2,H-2);

  ctx.save(); ctx.translate(X+W/2,Y+H/2);
  const col=pc?'#ffd98a':'#e59a8a';
  switch(b.type){
    case 'nest': {
      const gg=ctx.createRadialGradient(0,H*0.15,0,0,H*0.15,W*0.3);
      gg.addColorStop(0,pc?'#f3cfe8':'#f0aaa6'); gg.addColorStop(1,pc?'#c88fb8':'#c47672');
      ctx.fillStyle=gg; ctx.beginPath(); ctx.ellipse(0,H*0.16,W*0.27,H*0.18,0,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.ellipse(-W*0.08,H*0.08,W*0.1,H*0.05,-0.3,0,7); ctx.fill();
      for(let i=0;i<7;i++){
        const px=-W*0.3+i*W*0.1, py=-H*0.22+Math.sin(i*1.7)*H*0.04;
        const eg=ctx.createRadialGradient(px-s,py-1.5*s,0,px,py,4.6*s);
        eg.addColorStop(0,'#fffaf0'); eg.addColorStop(1,'#e4d4a8');
        ctx.fillStyle=eg; ctx.beginPath(); ctx.ellipse(px,py,3.2*s,4.4*s,0.1,0,7); ctx.fill(); }
      ctx.fillStyle=col; ctx.font=(7*s)+'px sans-serif'; ctx.textAlign='center'; ctx.fillText('♛',0,H*0.44);
      ctx.textAlign='start'; break; }
    case 'brood':
      for(let i=0;i<10;i++){
        const px=-W*0.33+(i%5)*W*0.165, py=-H*0.16+Math.floor(i/5)*H*0.33;
        const eg=ctx.createRadialGradient(px-s,py-s,0,px,py,4.6*s);
        eg.addColorStop(0,'#fffdf4'); eg.addColorStop(1,'#ddc99a');
        ctx.fillStyle=eg; ctx.beginPath(); ctx.ellipse(px,py,3.2*s,4.4*s,0.22,0,7); ctx.fill();
        ctx.strokeStyle='rgba(180,150,100,.5)'; ctx.lineWidth=0.7*s;
        ctx.beginPath(); ctx.ellipse(px,py,3.2*s,4.4*s,0.22,0,7); ctx.stroke(); }
      break;
    case 'depot': case 'winter':
      ctx.fillStyle='#7fb94e';
      for(let i=0;i<5;i++){ ctx.beginPath();
        ctx.ellipse(-W*0.3+i*W*0.15,H*0.1,4*s,2.4*s,-0.4,0,7); ctx.fill(); }
      ctx.fillStyle='#c8a24a';
      for(let i=0;i<4;i++) ctx.fillRect(-W*0.26+i*W*0.17,-H*0.3,3.4*s,5*s);
      ctx.fillStyle='rgba(255,255,255,.18)';
      for(let i=0;i<4;i++) ctx.fillRect(-W*0.26+i*W*0.17,-H*0.3,1.2*s,5*s);
      if(b.type==='winter'){ ctx.strokeStyle='#cfe8ff'; ctx.lineWidth=1.4*s;
        ctx.beginPath(); ctx.moveTo(-W*0.36,-H*0.36); ctx.lineTo(-W*0.24,-H*0.24);
        ctx.moveTo(-W*0.24,-H*0.36); ctx.lineTo(-W*0.36,-H*0.24); ctx.stroke(); }
      break;
    case 'farm':
      for(let i=0;i<6;i++){ const px=-W*0.34+i*W*0.136, sc=0.85+nz(i,b.id,2)*0.4;
        ctx.fillStyle='#8f7a9e'; ctx.fillRect(px-0.9*s,0,1.8*s,H*0.26);
        const gg=ctx.createRadialGradient(px,-1*s,0,px,0,4.2*s*sc);
        gg.addColorStop(0,b.acc?'#e3c0ee':'#9a8a9a'); gg.addColorStop(1,b.acc?'#a97fba':'#6e626e');
        ctx.fillStyle=gg; ctx.beginPath(); ctx.ellipse(px,0,3.9*s*sc,2.5*s*sc,0,Math.PI,0); ctx.fill(); }
      ctx.fillStyle='rgba(120,90,60,.5)'; ctx.fillRect(-W*0.4,H*0.26,W*0.8,H*0.1);
      break;
    case 'aphid':
      ctx.strokeStyle='#4e8a30'; ctx.lineWidth=1.5*s; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-W*0.32,H*0.32); ctx.quadraticCurveTo(-W*0.2,-H*0.1,-W*0.06,-H*0.32); ctx.stroke();
      for(let i=0;i<5;i++){ const px=-W*0.28+i*W*0.14, py=-H*0.08+Math.sin(i*1.9)*H*0.16;
        const gg=ctx.createRadialGradient(px-s,py-s,0,px,py,3.4*s);
        gg.addColorStop(0,'#c3e88f'); gg.addColorStop(1,'#78ab46');
        ctx.fillStyle=gg; ctx.beginPath(); ctx.ellipse(px,py,3*s,2.2*s,0,0,7); ctx.fill(); }
      ctx.fillStyle='rgba(240,190,80,.95)'; ctx.beginPath(); ctx.arc(W*0.27,H*0.2,3*s,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(W*0.25,H*0.17,1.1*s,0,7); ctx.fill();
      break;
    case 'barracks':
      ctx.strokeStyle=pc?'#dcae58':'#e07a5a'; ctx.lineWidth=2.6*s; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-W*0.26,H*0.26); ctx.lineTo(-W*0.04,-H*0.3);
      ctx.moveTo(W*0.26,H*0.26); ctx.lineTo(W*0.04,-H*0.3); ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.lineWidth=1*s;
      ctx.beginPath(); ctx.moveTo(-W*0.26,H*0.26); ctx.lineTo(-W*0.04,-H*0.3); ctx.stroke();
      ctx.strokeStyle=pc?'#dcae58':'#e07a5a'; ctx.lineWidth=2*s;
      ctx.beginPath(); ctx.arc(0,0,W*0.1,0,7); ctx.stroke();
      break;
    case 'chem': {
      const gg=ctx.createLinearGradient(0,-H*0.1,0,H*0.3);
      gg.addColorStop(0,'#cdf06a'); gg.addColorStop(1,'#6a9a24');
      ctx.fillStyle=gg; ctx.beginPath(); ctx.ellipse(0,H*0.16,W*0.21,H*0.15,0,0,7); ctx.fill();
      ctx.fillStyle='rgba(210,255,150,.55)';
      const bub=(st.time*2)%1;
      ctx.beginPath(); ctx.arc(-W*0.14,-H*0.1-bub*H*0.2,2.6*s,0,7);
      ctx.arc(W*0.17,-H*0.16-((bub+0.4)%1)*H*0.2,2*s,0,7); ctx.fill();
      break; }
    case 'swarm':
      for(let i=0;i<10;i++){ const a=i*0.68+st.time*0.3, rr=W*0.08+i*W*0.024;
        ctx.fillStyle=i%2?'#8a3a2a':'#6e2c20';
        ctx.beginPath(); ctx.ellipse(Math.cos(a)*rr,Math.sin(a)*rr*0.55,2.1*s,1.4*s,a,0,7); ctx.fill(); }
      break;
    case 'tower': {
      const gg=ctx.createLinearGradient(-W*0.3,0,W*0.3,0);
      gg.addColorStop(0,pc?'#8a6630':'#8a3a28'); gg.addColorStop(0.5,pc?'#c69a4e':'#c4553a');
      gg.addColorStop(1,pc?'#8a6630':'#8a3a28');
      ctx.fillStyle=gg;
      ctx.beginPath(); ctx.moveTo(-W*0.27,H*0.3); ctx.lineTo(-W*0.12,-H*0.3);
      ctx.lineTo(W*0.12,-H*0.3); ctx.lineTo(W*0.27,H*0.3); ctx.closePath(); ctx.fill();
      const pulse=0.6+0.4*Math.sin(st.time*3);
      ctx.fillStyle='rgba(200,240,100,'+pulse+')';
      ctx.beginPath(); ctx.arc(0,-H*0.22,2.9*s,0,7); ctx.fill();
      break; }
    case 'gate':
      ctx.fillStyle=pc?'#9a7a42':'#9a5242'; ctx.fillRect(-W*0.44,-H*0.46,W*0.88,H*0.92);
      ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=1.2*s;
      for(let i=-2;i<3;i++){ ctx.beginPath(); ctx.moveTo(-W*0.44,i*H*0.18); ctx.lineTo(W*0.44,i*H*0.18); ctx.stroke(); }
      ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fillRect(-W*0.44,-H*0.46,W*0.12,H*0.92);
      break;
    case 'midden':
      for(let i=0;i<7;i++){ const a=i*1.1, rr=W*0.2;
        ctx.fillStyle=i%2?'#6a5a42':'#55472f';
        ctx.beginPath(); ctx.ellipse(Math.cos(a)*rr,Math.sin(a)*rr*0.7,2.8*s,2*s,a,0,7); ctx.fill(); }
      ctx.fillStyle='rgba(120,160,90,.3)'; ctx.beginPath(); ctx.ellipse(0,0,W*0.3,H*0.25,0,0,7); ctx.fill();
      break;
    case 'pherom':
      ctx.strokeStyle='#caa2e8'; ctx.lineWidth=2*s; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0,H*0.4); ctx.lineTo(0,-H*0.3); ctx.stroke();
      for(let i=1;i<4;i++){
        ctx.globalAlpha=(b.built<1?0.45:1)*0.35/i*(0.55+0.45*Math.sin(st.time*2.4-i));
        ctx.beginPath(); ctx.arc(0,-H*0.3,i*3.6*s,0,7); ctx.stroke(); }
      ctx.globalAlpha=b.built<1?0.45+b.built*0.5:1;
      break;
    case 'house': {                                   // yavru odacığı (ev)
      ctx.fillStyle='#f3e6c0';
      for(let i=0;i<4;i++){ ctx.beginPath();
        ctx.ellipse(-W*0.22+(i%2)*W*0.44, -H*0.14+Math.floor(i/2)*H*0.3, 3.4*s,4.6*s,.2,0,7); ctx.fill(); }
      ctx.strokeStyle='rgba(200,170,120,.5)'; ctx.lineWidth=1*s;
      ctx.beginPath(); ctx.ellipse(0,0,W*0.36,H*0.34,0,0,7); ctx.stroke();
      break; }
    case 'wall': {                                    // toprak duvar
      const g2=ctx.createLinearGradient(-W*0.5,0,W*0.5,0);
      g2.addColorStop(0,pc?'#6a5330':'#6a3a30'); g2.addColorStop(0.5,pc?'#917244':'#91503f');
      g2.addColorStop(1,pc?'#6a5330':'#6a3a30');
      ctx.fillStyle=g2; ctx.fillRect(-W*0.5,-H*0.5,W,H);
      ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=1*s;
      for(let i=-1;i<2;i++){ ctx.beginPath(); ctx.moveTo(-W*0.5,i*H*0.3); ctx.lineTo(W*0.5,i*H*0.3); ctx.stroke(); }
      ctx.fillStyle='rgba(255,220,170,.12)'; ctx.fillRect(-W*0.5,-H*0.5,W,2*s);
      break; }
    case 'market': {                                  // takas odası
      ctx.fillStyle=pc?'#d8a24a':'#d87a4a';
      ctx.beginPath(); ctx.moveTo(-W*0.3,H*0.2); ctx.lineTo(0,-H*0.3); ctx.lineTo(W*0.3,H*0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#8fc45a'; ctx.beginPath(); ctx.ellipse(-W*0.2,H*0.26,3.4*s,2.2*s,0,0,7); ctx.fill();
      ctx.fillStyle='#79c6e8'; ctx.beginPath(); ctx.ellipse(0,H*0.3,3*s,2*s,0,0,7); ctx.fill();
      ctx.fillStyle='#e8b44a'; ctx.beginPath(); ctx.ellipse(W*0.2,H*0.26,3.2*s,2.1*s,0,0,7); ctx.fill();
      break; }
    case 'cistern': {
      const lvl=0.55+0.08*Math.sin(st.time*1.2);
      ctx.fillStyle='rgba(50,110,150,.85)'; ctx.fillRect(-W*0.32,H*0.32-H*0.62*lvl,W*0.64,H*0.62*lvl);
      ctx.fillStyle='rgba(170,220,245,.55)'; ctx.fillRect(-W*0.32,H*0.32-H*0.62*lvl,W*0.64,2*s);
      ctx.strokeStyle='#7a94a8'; ctx.lineWidth=1.5*s; ctx.strokeRect(-W*0.34,-H*0.32,W*0.68,H*0.66);
      break; }
  }
  ctx.restore(); ctx.globalAlpha=1;

  if(b.hp<b.mhp||b.built<1||b.q.length||b.rq){
    ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillRect(X,Y-8,W,5);
    ctx.fillStyle=b.built<1?'#d8a24a':(pc?'#6fae3f':'#c4453a');
    ctx.fillRect(X+1,Y-7,(W-2)*(b.built<1?b.built:b.hp/b.mhp),3);
    if(b.rq||b.q.length){ const p=b.rq?b.rq.p:b.q[0].p;
      ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillRect(X,Y-14,W,5);
      ctx.fillStyle=b.rq?'#9fd0e8':'#e8d26a'; ctx.fillRect(X+1,Y-13,(W-2)*p,3); }
  }
  if(S>=26){
    ctx.font=Math.round(Math.min(13,S*0.5))+'px "Segoe UI",sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillText(d.n,X+W/2+1,Y+H+4);
    ctx.fillStyle=pc?'rgba(255,217,138,.92)':'rgba(240,150,130,.92)';
    ctx.fillText(d.n,X+W/2,Y+H+3);
    ctx.textAlign='start'; ctx.textBaseline='alphabetic';
  }
  if(selB===b){ ctx.strokeStyle='#9fd07a'; ctx.lineWidth=2; ctx.strokeRect(X-3,Y-3,W+6,H+6); }
}

// ------------------------------------------------------------ KARINCA (anatomik)
const antGrad=new Map();
function antGradients(u,r,body,light,dark,gx,gw,gh,hx,hs){
  const key=u.type+'_'+u.team+'_'+r.toFixed(2);
  let g=antGrad.get(key);
  if(!g){
    const gaster=ctx.createRadialGradient(gx-gw*0.3,-gh*0.35,0,gx,0,gw*1.2);
    gaster.addColorStop(0,light); gaster.addColorStop(0.55,body); gaster.addColorStop(1,dark);
    const thorax=ctx.createLinearGradient(0,-r*0.4,0,r*0.4);
    thorax.addColorStop(0,light); thorax.addColorStop(1,dark);
    const head=ctx.createRadialGradient(hx+r*0.1,-r*0.12,0,hx,0,r*0.55*hs);
    head.addColorStop(0,light); head.addColorStop(1,body);
    g={gaster,thorax,head}; antGrad.set(key,g);
    if(antGrad.size>400) antGrad.clear();
  }
  return g;
}
// ---------------- KARINCA: yüksek çözünürlüklü ön-render + ekrana basma
const REF_R = 9;            // referans karınca yarıçapı (piksel)
const SS    = 3;            // süper örnekleme (kenar yumuşatma)
const antAtlas = new Map();

function nz2(a,b){ const h=Math.sin(a*127.1+b*311.7)*43758.5453; return h-Math.floor(h); }

function antSprite(type,team,frame){
  const key=type+'_'+team+'_'+frame;
  let c=antAtlas.get(key);
  if(c) return c;
  const d=ANTS[type];
  const r=REF_R*(d.r/5.0);
  const size=Math.ceil(r*4.4*SS);
  c=document.createElement('canvas'); c.width=c.height=size;
  const g=c.getContext('2d');
  g.scale(SS,SS);
  paintAnt(g,(size/SS)/2,(size/SS)/2,r,d,type,team,frame);
  c._r=r;
  antAtlas.set(key,c);
  return c;
}

// tek karınca gövdesi — yalnız sprite üretilirken çalışır, her karede değil
function paintAnt(g,cx,cy,r,d,type,team,frame){
  const body = team===PLAYER ? d.col : enemyCol(d.col);
  const dark = shade(body,-0.34), deep = shade(body,-0.52),
        light = shade(body,0.22), hot = shade(body,0.42);
  const ph = frame/8*Math.PI*2;

  g.save(); g.translate(cx,cy);

  // yumuşak zemin gölgesi
  const sh=g.createRadialGradient(0,r*0.55,0,0,r*0.55,r*1.5);
  sh.addColorStop(0,'rgba(0,0,0,.40)'); sh.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=sh; g.beginPath(); g.ellipse(0,r*0.55,r*1.5,r*0.6,0,0,7); g.fill();

  // bacaklar — üçayak yürüyüşü, eklemli ve konik
  g.lineCap='round';
  for(let i=0;i<3;i++){
    for(const side of [-1,1]){
      const tri=((i+(side>0?1:0))%2)*Math.PI;
      const p=ph+tri;
      const swing=Math.sin(p)*0.45, lift=Math.max(0,Math.cos(p))*0.3;
      const bx=(i-1)*r*0.34, by=side*r*0.3;
      const kx=bx+swing*r*0.5+(i-1)*r*0.12, ky=by+side*r*0.55*(1-lift*0.4);
      const tx=bx+swing*r*0.85+(i-1)*r*0.25, ty=by+side*r*1.25*(0.95-lift*0.45);
      g.strokeStyle=deep; g.lineWidth=r*0.17;
      g.beginPath(); g.moveTo(bx,by); g.lineTo(kx,ky); g.stroke();
      g.strokeStyle=dark; g.lineWidth=r*0.12;
      g.beginPath(); g.moveTo(kx,ky); g.lineTo(tx,ty); g.stroke();
      g.strokeStyle='rgba(255,235,200,.22)'; g.lineWidth=r*0.05;
      g.beginPath(); g.moveTo(bx,by-r*0.04); g.lineTo(kx,ky-r*0.04); g.stroke();
    }
  }

  // karın (gaster)
  const abd=(type==='queen')?1.6:(type==='princess'?1.4:((type==='major'||type==='doorhead')?0.95:1));
  const gx=-r*1.02, gw=r*0.8*abd, gh=r*0.62*abd;
  let grd=g.createRadialGradient(gx-gw*0.35,-gh*0.4,r*0.05,gx,gh*0.15,gw*1.25);
  grd.addColorStop(0,hot); grd.addColorStop(0.35,light);
  grd.addColorStop(0.72,body); grd.addColorStop(1,deep);
  g.fillStyle=grd; g.beginPath(); g.ellipse(gx,0,gw,gh,0,0,7); g.fill();

  g.strokeStyle='rgba(0,0,0,.30)'; g.lineWidth=r*0.07;
  for(let k=1;k<=3;k++){
    g.beginPath(); g.ellipse(gx+gw*0.12*k,0,gw*(1-0.2*k),gh*(1-0.1*k),0,-1.25,1.25); g.stroke();
  }
  for(let k=0;k<26;k++){                              // kitin pütürü
    const a=nz2(k,1)*Math.PI*2, rr=Math.sqrt(nz2(k,2));
    const px=gx+Math.cos(a)*gw*rr*0.88, py=Math.sin(a)*gh*rr*0.88;
    g.fillStyle = nz2(k,3)>0.5 ? 'rgba(255,240,215,.13)' : 'rgba(0,0,0,.16)';
    g.fillRect(px,py,r*0.07,r*0.07);
  }
  g.fillStyle='rgba(255,255,255,.34)';
  g.beginPath(); g.ellipse(gx-gw*0.33,-gh*0.45,gw*0.30,gh*0.17,-0.45,0,7); g.fill();
  g.fillStyle='rgba(255,255,255,.16)';
  g.beginPath(); g.ellipse(gx-gw*0.05,-gh*0.6,gw*0.16,gh*0.08,-0.3,0,7); g.fill();

  // petiol düğümleri
  g.fillStyle=deep;
  g.beginPath(); g.arc(-r*0.46,0,r*0.14,0,7); g.fill();
  g.beginPath(); g.arc(-r*0.3,0,r*0.12,0,7); g.fill();

  // göğüs
  grd=g.createLinearGradient(0,-r*0.45,0,r*0.45);
  grd.addColorStop(0,hot); grd.addColorStop(0.45,body); grd.addColorStop(1,deep);
  g.fillStyle=grd; g.beginPath(); g.ellipse(r*0.02,0,r*0.5,r*0.42,0,0,7); g.fill();
  g.strokeStyle='rgba(0,0,0,.22)'; g.lineWidth=r*0.05;
  g.beginPath(); g.ellipse(r*0.02,0,r*0.5,r*0.42,0,0,7); g.stroke();

  // kafa
  const hs=(type==='major'||type==='doorhead')?1.55:(type==='bullet'?1.22:1);
  const hx=r*0.8;
  grd=g.createRadialGradient(hx+r*0.12,-r*0.16,r*0.03,hx,0,r*0.6*hs);
  grd.addColorStop(0,hot); grd.addColorStop(0.5,light); grd.addColorStop(1,body);
  g.fillStyle=grd; g.beginPath(); g.ellipse(hx,0,r*0.44*hs,r*0.4*hs,0,0,7); g.fill();
  g.strokeStyle='rgba(0,0,0,.25)'; g.lineWidth=r*0.05;
  g.beginPath(); g.ellipse(hx,0,r*0.44*hs,r*0.4*hs,0,0,7); g.stroke();
  if(type==='doorhead'){
    g.fillStyle=shade(body,0.28);
    g.beginPath(); g.ellipse(hx+r*0.3,0,r*0.3,r*0.6,0,0,7); g.fill();
    g.strokeStyle='rgba(0,0,0,.3)'; g.stroke();
  }
  for(const side of [-1,1]){                           // bileşik gözler
    const ex=hx+r*0.1*hs, ey=side*r*0.26*hs;
    g.fillStyle='rgba(18,12,8,.92)';
    g.beginPath(); g.ellipse(ex,ey,r*0.13*hs,r*0.1*hs,0,0,7); g.fill();
    g.fillStyle='rgba(255,255,255,.5)';
    g.beginPath(); g.ellipse(ex+r*0.04,ey-r*0.03,r*0.045*hs,r*0.03*hs,0,0,7); g.fill();
  }
  const asw=Math.sin(ph*0.5)*0.12;                     // antenler
  for(const side of [-1,1]){
    const e1x=hx+r*0.42*hs, e1y=side*r*0.2*hs;
    const e2x=e1x+r*0.45, e2y=side*(r*0.5+asw*r);
    g.strokeStyle=deep;
    g.lineWidth=r*0.09; g.beginPath(); g.moveTo(e1x,e1y); g.lineTo(e2x,e2y); g.stroke();
    g.lineWidth=r*0.06; g.beginPath(); g.moveTo(e2x,e2y);
    g.lineTo(e2x+r*0.42,e2y+side*(r*0.12+asw*r*0.6)); g.stroke();
  }
  const fighter=['soldier','major','trapjaw','armyant','bullet','doorhead','queen'].indexOf(type)>=0;
  if(fighter){
    g.strokeStyle='#f3e6c6'; g.lineWidth=r*0.17*hs;
    for(const side of [-1,1]){
      g.beginPath();
      g.moveTo(hx+r*0.4*hs, side*r*0.26*hs);
      g.quadraticCurveTo(hx+r*0.95*hs, side*r*0.34*hs, hx+r*1.25*hs, side*r*0.06);
      g.stroke();
    }
    g.strokeStyle='rgba(120,90,50,.45)'; g.lineWidth=r*0.05;
    for(const side of [-1,1]){
      g.beginPath();
      g.moveTo(hx+r*0.45*hs, side*r*0.3*hs);
      g.quadraticCurveTo(hx+r*0.95*hs, side*r*0.38*hs, hx+r*1.2*hs, side*r*0.1);
      g.stroke();
    }
  } else {
    g.strokeStyle=dark; g.lineWidth=r*0.09;
    for(const side of [-1,1]){
      g.beginPath(); g.moveTo(hx+r*0.38,side*r*0.2); g.lineTo(hx+r*0.72,side*r*0.12); g.stroke();
    }
  }
  if(type==='princess'||type==='queen'){               // kanatlar
    const wf=type==='princess'?1:0.55;
    for(const side of [-1,1]){
      const wg=g.createLinearGradient(-r*1.3*wf,0,r*0.7*wf,0);
      wg.addColorStop(0,'rgba(255,255,255,.07)');
      wg.addColorStop(0.5,'rgba(230,245,255,.30)');
      wg.addColorStop(1,'rgba(255,255,255,.10)');
      g.fillStyle=wg;
      g.beginPath(); g.ellipse(-r*0.28,side*r*0.72,r*1.25*wf,r*0.32*wf,side*0.32,0,7); g.fill();
      g.strokeStyle='rgba(255,255,255,.28)'; g.lineWidth=r*0.04;
      g.beginPath(); g.moveTo(-r*1.3*wf,side*r*0.72); g.lineTo(r*0.6*wf,side*r*0.66); g.stroke();
      g.beginPath(); g.moveTo(-r*1.1*wf,side*r*0.82); g.lineTo(r*0.4*wf,side*r*0.72); g.stroke();
    }
  }
  g.restore();
}

function drawAnt(u,X,Y,S){
  const z=S/16, r=u.d.r*z*0.95;
  const frame=((u.leg*0.8)|0)&7;
  const spr=antSprite(u.type,u.team,frame);
  const drawW=(spr.width/SS)*(r/spr._r);
  ctx.save(); ctx.translate(X,Y); ctx.rotate(u.ang);
  ctx.drawImage(spr,-drawW/2,-drawW/2,drawW,drawW);
  ctx.restore();

  if(u.carry>0){                                       // çenede taşınan yük
    const rc=RESL.find(x=>x.k===u.cres);
    const cx=X+Math.cos(u.ang)*r*1.5, cy=Y+Math.sin(u.ang)*r*1.5;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(u.ang+0.4);
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(1,2,r*0.52,r*0.3,0,0,7); ctx.fill();
    const cg=ctx.createRadialGradient(-r*0.15,-r*0.12,0,0,0,r*0.6);
    cg.addColorStop(0,'rgba(255,255,255,.55)');
    cg.addColorStop(0.35,rc?rc.col:'#8fc45a');
    cg.addColorStop(1,'rgba(0,0,0,.35)');
    ctx.fillStyle=cg; ctx.beginPath(); ctx.ellipse(0,0,r*0.54,r*0.32,0,0,7); ctx.fill();
    ctx.restore();
  }
  if(u.stun>0){ ctx.strokeStyle='#ffe36a'; ctx.lineWidth=1.4;
    for(let k=0;k<3;k++){ const a=st.time*6+k*2.1;
      ctx.beginPath(); ctx.arc(X+Math.cos(a)*r*0.8,Y-r*1.5+Math.sin(a)*r*0.25,1.6,0,7); ctx.stroke(); } }
  if(u.poison>0){ ctx.fillStyle='rgba(150,220,90,.85)';
    ctx.beginPath(); ctx.arc(X+r*0.6,Y-r*1.4,2,0,7); ctx.fill(); }
  if(u.slow>0){ ctx.strokeStyle='rgba(140,200,240,.7)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.arc(X,Y,r*1.5,0,7); ctx.stroke(); }
  if(sel.includes(u)){ ctx.strokeStyle='rgba(159,208,122,.95)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.ellipse(X,Y+r*0.4,r*1.7,r*0.78,0,0,7); ctx.stroke(); }
  if(u.hp<u.mhp){ const w2=r*2.5;
    ctx.fillStyle='rgba(0,0,0,.75)'; ctx.fillRect(X-w2/2,Y-r*1.95,w2,3.8);
    ctx.fillStyle=u.team===PLAYER?'#6fae3f':'#c4453a';
    ctx.fillRect(X-w2/2+0.6,Y-r*1.95+0.6,(w2-1.2)*u.hp/u.mhp,2.6); }
}

function drawWild(u,X,Y,S){
  const z=S/16, r=u.d.r*z*0.92, c=u.d.col;
  ctx.fillStyle='rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(X,Y+r*0.45,r*1.1,r*0.4,0,0,7); ctx.fill();
  ctx.save(); ctx.translate(X,Y); ctx.rotate(u.ang);
  switch(u.type){
    case 'aphid': {
      const g=ctx.createRadialGradient(-r*0.2,-r*0.25,0,0,0,r);
      g.addColorStop(0,'#cdf0a0'); g.addColorStop(1,'#6f9f42');
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,r*0.92,r*0.72,0,0,7); ctx.fill();
      ctx.strokeStyle='#4f7a32'; ctx.lineWidth=1;
      for(let i=-1;i<2;i++){ ctx.beginPath(); ctx.moveTo(i*r*0.4,r*0.5); ctx.lineTo(i*r*0.5,r*0.98); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(r*0.7,-r*0.2); ctx.lineTo(r*1.2,-r*0.5); ctx.stroke();
      break; }
    case 'larvaeW':
      for(let i=0;i<6;i++){
        const px=-i*r*0.4+r*0.9, py=Math.sin(u.leg*0.8+i*0.7)*r*0.12, sc=1-Math.abs(i-2)*0.06;
        const g=ctx.createRadialGradient(px,py-r*0.2,0,px,py,r*0.5);
        g.addColorStop(0,'#eccf8c'); g.addColorStop(1,'#b8954f');
        ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(px,py,r*0.43*sc,r*0.4*sc,0,0,7); ctx.fill();
        ctx.strokeStyle='rgba(120,90,40,.35)'; ctx.lineWidth=0.8;
        ctx.beginPath(); ctx.arc(px,py,r*0.43*sc,-1,1); ctx.stroke(); }
      ctx.fillStyle='#2b2118'; ctx.beginPath(); ctx.arc(r*1.05,-r*0.14,r*0.09,0,7); ctx.fill();
      break;
    case 'beetle': {
      const g=ctx.createLinearGradient(0,-r,0,r);
      g.addColorStop(0,shade(c,0.22)); g.addColorStop(1,shade(c,-0.22));
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(-r*0.05,0,r*1.0,r*0.78,0,0,7); ctx.fill();
      ctx.strokeStyle='rgba(20,14,10,.8)'; ctx.lineWidth=1.3;
      ctx.beginPath(); ctx.moveTo(-r*0.95,0); ctx.lineTo(r*0.7,0); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.ellipse(-r*0.3,-r*0.35,r*0.5,r*0.18,-0.2,0,7); ctx.fill();
      ctx.fillStyle=shade(c,-0.1); ctx.beginPath(); ctx.ellipse(r*0.95,0,r*0.36,r*0.4,0,0,7); ctx.fill();
      ctx.strokeStyle=shade(c,-0.3); ctx.lineWidth=1.6;
      for(const s2 of[-1,1]){ ctx.beginPath(); ctx.moveTo(r*1.2,s2*r*0.2); ctx.lineTo(r*1.7,s2*r*0.35); ctx.stroke(); }
      break; }
    case 'spider':
      ctx.strokeStyle=shade(c,0.18); ctx.lineWidth=Math.max(1.3,1.4*z); ctx.lineCap='round'; ctx.lineJoin='round';
      for(let i=0;i<4;i++){ for(const s2 of[-1,1]){
        const a=(0.45+i*0.42)*s2, sw=Math.sin(u.leg*0.9+i+(s2>0?1.5:0))*0.18;
        const kx=Math.cos(a+sw)*r*0.85, ky=Math.sin(a+sw)*r*0.85;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(kx,ky*1.1);
        ctx.lineTo(kx*1.5,ky*1.75); ctx.stroke(); } }
      { const g=ctx.createRadialGradient(-r*0.45,-r*0.2,0,-r*0.3,0,r*0.9);
        g.addColorStop(0,shade(c,0.2)); g.addColorStop(1,shade(c,-0.2));
        ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(-r*0.32,0,r*0.78,r*0.64,0,0,7); ctx.fill(); }
      ctx.fillStyle=shade(c,0.05); ctx.beginPath(); ctx.ellipse(r*0.55,0,r*0.42,r*0.36,0,0,7); ctx.fill();
      ctx.fillStyle='#e8d26a';
      ctx.beginPath(); ctx.arc(r*0.78,-r*0.14,r*0.09,0,7); ctx.arc(r*0.78,r*0.14,r*0.09,0,7);
      ctx.arc(r*0.62,-r*0.26,r*0.06,0,7); ctx.arc(r*0.62,r*0.26,r*0.06,0,7); ctx.fill();
      break;
    case 'centi':
      for(let i=0;i<9;i++){
        const px=-i*r*0.34+r*1.2, py=Math.sin(u.leg*0.5+i*0.7)*r*0.25;
        ctx.strokeStyle=shade(c,-0.3); ctx.lineWidth=1.4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(px,py-r*0.28); ctx.lineTo(px+r*0.12,py-r*0.66);
        ctx.moveTo(px,py+r*0.28); ctx.lineTo(px+r*0.12,py+r*0.66); ctx.stroke();
        const g=ctx.createLinearGradient(px,py-r*0.3,px,py+r*0.3);
        g.addColorStop(0,shade(c,0.16)); g.addColorStop(1,shade(c,-0.16));
        ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(px,py,r*0.3,r*0.31,0,0,7); ctx.fill(); }
      ctx.fillStyle='#d8703a'; ctx.beginPath(); ctx.ellipse(r*1.48,0,r*0.3,r*0.28,0,0,7); ctx.fill();
      ctx.strokeStyle='#8a2a18'; ctx.lineWidth=1.6;
      for(const s2 of[-1,1]){ ctx.beginPath(); ctx.moveTo(r*1.7,s2*r*0.12); ctx.lineTo(r*2.1,s2*r*0.3); ctx.stroke(); }
      break;
    case 'mole': {
      const g=ctx.createRadialGradient(-r*0.2,-r*0.3,0,0,0,r*1.2);
      g.addColorStop(0,shade(c,0.22)); g.addColorStop(1,shade(c,-0.15));
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,r*1.12,r*0.8,0,0,7); ctx.fill();
      ctx.fillStyle=shade(c,0.12); ctx.beginPath(); ctx.ellipse(r*0.95,0,r*0.5,r*0.46,0,0,7); ctx.fill();
      ctx.fillStyle='#f0b8b8'; ctx.beginPath(); ctx.arc(r*1.42,0,r*0.17,0,7); ctx.fill();
      ctx.fillStyle='#e8e0d0';
      for(const s2 of[-1,1]){ ctx.beginPath(); ctx.moveTo(r*0.85,s2*r*0.3);
        ctx.lineTo(r*1.55,s2*r*0.6); ctx.lineTo(r*0.95,s2*r*0.08); ctx.closePath(); ctx.fill(); }
      break; }
    case 'bird': {
      const flap=Math.sin(u.leg*1.6)*r*0.4;
      ctx.fillStyle=shade(c,0.3);
      ctx.beginPath(); ctx.ellipse(-r*0.1,-r*0.25+flap,r*0.85,r*0.22,-0.25,0,7); ctx.fill();
      const g=ctx.createLinearGradient(0,-r*0.5,0,r*0.5);
      g.addColorStop(0,shade(c,0.2)); g.addColorStop(1,shade(c,-0.2));
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,r*0.95,r*0.55,0,0,7); ctx.fill();
      ctx.fillStyle=shade(c,0.35); ctx.beginPath(); ctx.ellipse(r*0.85,-r*0.2,r*0.34,r*0.3,0,0,7); ctx.fill();
      ctx.fillStyle='#e8a44a'; ctx.beginPath(); ctx.moveTo(r*1.1,-r*0.2);
      ctx.lineTo(r*1.65,-r*0.06); ctx.lineTo(r*1.1,r*0.04); ctx.fill();
      ctx.fillStyle='#2b2118'; ctx.beginPath(); ctx.arc(r*0.92,-r*0.28,r*0.07,0,7); ctx.fill();
      break; }
  }
  ctx.restore();
  if(u.hp<u.mhp){ const w=r*2.3;
    ctx.fillStyle='rgba(0,0,0,.75)'; ctx.fillRect(X-w/2,Y-r*1.45,w,3.6);
    ctx.fillStyle='#d8a24a'; ctx.fillRect(X-w/2+0.5,Y-r*1.45+0.5,(w-1)*u.hp/u.mhp,2.6); }
  if(sel.includes(u)){ ctx.strokeStyle='#e8d26a'; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.ellipse(X,Y+r*0.3,r*1.5,r*0.7,0,0,7); ctx.stroke(); }
}

function shade(hex,amt){
  if(hex[0]!=='#') return hex;
  const n=parseInt(hex.slice(1),16);
  return 'rgb('+clamp(((n>>16)&255)+255*amt,0,255).toFixed(0)+','
               +clamp(((n>>8)&255)+255*amt,0,255).toFixed(0)+','
               +clamp((n&255)+255*amt,0,255).toFixed(0)+')';
}
const ENEMY_COL={'#d2a05e':'#c4604a','#9ec46a':'#c48a4a','#caa86a':'#c47a5a','#e8d26a':'#e0845a',
  '#c4683a':'#b43a2a','#b8863a':'#b05a2a','#8fbf4a':'#bf7a4a','#9a4a2e':'#7a2a1e','#8a7a56':'#8a5a46',
  '#8a3a2a':'#6a2018','#5e3a2a':'#4a2018','#e3bcdd':'#e38a8a','#e0b7d8':'#e08a8a'};
function enemyCol(c){ return ENEMY_COL[c]||'#c4453a'; }

// ---------------- EKRAN SONRASI EFEKTLER (fotogerçekçi his)
let _vig=null, _vigW=0, _vigH=0, _grain=null, _grainT=0;

function grainTile(){
  if(_grain) return _grain;
  const n=128;
  _grain=document.createElement('canvas'); _grain.width=_grain.height=n;
  const g=_grain.getContext('2d');
  const img=g.createImageData(n,n);
  for(let i=0;i<n*n;i++){
    const v=200+Math.random()*55;
    img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=v;
    img.data[i*4+3]=Math.random()*26;          // çok hafif
  }
  g.putImageData(img,0,0);
  return _grain;
}
function vignette(W,H){
  if(_vig&&_vigW===W&&_vigH===H) return _vig;
  _vig=document.createElement('canvas'); _vig.width=W; _vig.height=H; _vigW=W; _vigH=H;
  const g=_vig.getContext('2d');
  const grd=g.createRadialGradient(W/2,H*0.46,Math.min(W,H)*0.28,W/2,H*0.5,Math.max(W,H)*0.78);
  grd.addColorStop(0,'rgba(0,0,0,0)');
  grd.addColorStop(0.65,'rgba(0,0,0,.12)');
  grd.addColorStop(1,'rgba(0,0,0,.36)');
  g.fillStyle=grd; g.fillRect(0,0,W,H);
  return _vig;
}

function postFX(W,H,sx,sy,S,L){
  // --- sıcak bloom: ışıklı odaların çevresine ekran karışımıyla hafif parlama
  ctx.save();
  ctx.globalCompositeOperation='screen';
  for(const b of blds){
    if(b.built<1||b.team!==PLAYER||!vis[ti(b.x|0,b.y|0)]) continue;
    const X=sx(b.x-0.5)+S/2, Y=sy(b.y-0.5)+S/2, R=S*(b.type==='nest'?3.6:2.4);
    if(X<-R||X>W+R||Y<-R||Y>H+R) continue;
    const g=ctx.createRadialGradient(X,Y,0,X,Y,R);
    g.addColorStop(0,'rgba(255,186,96,.17)');
    g.addColorStop(0.5,'rgba(255,150,70,.06)');
    g.addColorStop(1,'rgba(255,150,70,0)');
    ctx.fillStyle=g; ctx.fillRect(X-R,Y-R,R*2,R*2);
  }
  ctx.restore();

  // --- renk derecelendirme: yeraltında sıcak-kahve, yüzeyde soğuk
  ctx.save();
  ctx.globalCompositeOperation='overlay';
  const grade=ctx.createLinearGradient(0,0,0,H);
  grade.addColorStop(0,`rgba(90,120,190,${0.05+0.07*L})`);
  grade.addColorStop(0.45,'rgba(120,80,40,.05)');
  grade.addColorStop(1,'rgba(150,95,40,.10)');
  ctx.fillStyle=grade; ctx.fillRect(0,0,W,H);
  ctx.restore();

  // --- vinyet
  ctx.drawImage(vignette(W,H),0,0);

  // --- film grain (hafif, kayan)
  _grainT+=0.016;
  const gt=grainTile();
  ctx.save();
  ctx.globalAlpha=0.5;
  const ox=(Math.sin(_grainT*7.3)*64)|0, oy=(Math.cos(_grainT*5.7)*64)|0;
  const pat=ctx.createPattern(gt,'repeat');
  ctx.translate(ox,oy);
  ctx.fillStyle=pat; ctx.fillRect(-ox,-oy,W,H);
  ctx.restore();
}

// ------------------------------------------------------------ mini harita
let mmImg=null, mmT=0, mmCache=null;
function drawMini(){
  const sxm=mm.width/MW, sym=mm.height/MH;
  mmT-=1/60;
  if(mmT<=0){
    mmT=0.35;
    if(!mmImg) mmImg=mmx.createImageData(mm.width,mm.height);
    const dta=mmImg.data;
    for(let y=0;y<mm.height;y++)for(let x=0;x<mm.width;x++){
      const tx=Math.floor(x/sxm), ty=Math.floor(y/sym), i=ti(tx,ty);
      let r=5,g=7,b=10;
      if(known[i]){ const t=tiles[i];
        if(t===T_SOIL){r=78;g=54;b=32;} else if(t===T_CLAY){r=104;g=78;b=56;}
        else if(t===T_ROCK){r=58;g=55;b=50;} else if(t===T_VEIN){r=78;g=86;b=110;}
        else if(t===T_ROOT){r=92;g=64;b=32;} else if(t===T_WATER){r=42;g=86;b=116;}
        else if(t===T_TUN){r=26;g=18;b=11;} else if(t===T_OPEN){r=52;g=84;b=44;}
        if(!vis[i]){r*=.6;g*=.6;b*=.6;} }
      const o=(y*mm.width+x)*4; dta[o]=r; dta[o+1]=g; dta[o+2]=b; dta[o+3]=255;
    }
    mmx.putImageData(mmImg,0,0);
    for(const b of blds){ if(b.team!==PLAYER&&!known[ti(b.x|0,b.y|0)])continue;
      mmx.fillStyle=b.team===PLAYER?'#9fd07a':'#e4645a';
      mmx.fillRect(b.tx*sxm-1,b.ty*sym-1,b.d.w*sxm+2,b.d.h*sym+2); }
    for(const u of units){ if(u.team!==PLAYER&&!vis[ti(u.x|0,u.y|0)])continue;
      mmx.fillStyle=u.team===PLAYER?'#d8f0a0':(u.team===NEUTRAL?'#c8a0e0':'#ff8a6a');
      mmx.fillRect(u.x*sxm-1,u.y*sym-1,2.4,2.4); }
    mmCache=mmx.getImageData(0,0,mm.width,mm.height);
  } else if(mmCache) mmx.putImageData(mmCache,0,0);
  mmx.strokeStyle='#ffd98a'; mmx.lineWidth=1;
  mmx.strokeRect(cam.x/TS*sxm, cam.y/TS*sym, cv.width/cam.z/TS*sxm, cv.height/cam.z/TS*sym);
}
