// ===================================================================
//  EĞİTİM — adım adım yönlendirme (oyun içi, atlanabilir)
// ===================================================================
"use strict";

const TUT = {
  on:false, i:0, t:0, done:false, flash:0,

  steps:[
    { id:'intro',
      head:'Hoş geldin',
      text:'Sen bir karınca kolonisinin kraliçesisin. Amaç: koloniyi büyütüp haritanın öbür ucundaki '+
           '<b>kızıl koloninin Kraliçe Odası</b>nı yıkmak.<br><br>Başlamak için <b>İleri</b>ye bas.',
      next:'manual' },

    { id:'camera',
      head:'1 · Kamerayı tanı',
      text:'<b>WASD</b> ya da ok tuşlarıyla kamerayı gezdir, <b>tekerlek</b> ile yakınlaş.<br>'+
           '<b>Boşluk</b> tuşu seni her zaman yuvaya geri getirir.',
      hint:'Kamerayı biraz oynat',
      ok:()=>TUT.camMoved>2 },

    { id:'dig',
      head:'2 · Tünel kaz',
      text:'Toprak katı — oyun alanını <b>sen açıyorsun</b>. Kahverengi toprağa <b>sağ tıklayıp sürükle</b>, '+
           'işçiler oraya gidip kazar.<br><br>Kazdıkça <b>mineral</b> çıkar, parlak mavi damarlar daha bol verir.',
      hint:'Yuvanın çevresinde 15 kare kaz',
      ok:()=>(st.dug||0)>=15,
      arrowTo:()=>{ const n=nestOf(); return n?{x:n.x+4,y:n.y+3}:null; } },

    { id:'food',
      head:'3 · Yiyecek ve lif',
      text:'İşçiler boş kaldığında işleri <b>kendileri</b> üstlenir: kazma, inşa, toplama.<br>'+
           '🍃 <b>Yiyecek</b> yapraklardan ve mantarlardan, 🍂 <b>Lif</b> yüzeydeki bitkilerden gelir '+
           '(lifi yalnız <b>Yaprak Kesen</b> toplar).',
      hint:'Depona 150 yiyecek biriktir',
      ok:()=>P.res.f>=150 },

    { id:'house',
      head:'4 · Nüfusu büyüt',
      text:'Nüfus sınırına takılırsan yeni karınca çıkmaz. <b>B</b> tuşuna bas, '+
           '<b>Yavru Odacığı</b>nı seç ve kazılmış bir boşluğa tıkla.<br><br>'+
           'Her odacık <b>+10 nüfus</b> verir (Age of Empires\'daki ev gibi).',
      hint:'Bir Yavru Odacığı kur',
      ok:()=>blds.some(b=>b.team===PLAYER&&b.type==='house'&&b.built>=1),
      press:'b' },

    { id:'worker',
      head:'5 · İşçi üret',
      text:'<b>Kuluçka Odası</b>na tıkla, açılan panelden <b>İşçi (Q)</b> ve <b>Yaprak Kesen (W)</b> üret.<br>'+
           'Ekonomi işçi sayısıdır: ilk dakikalarda durmadan işçi çıkar.',
      hint:'Toplam 12 işçi/kesen',
      ok:()=>units.filter(u=>u.team===PLAYER&&u.d.work).length>=12,
      arrowTo:()=>{ const b=blds.find(b=>b.team===PLAYER&&b.type==='brood'); return b?{x:b.x,y:b.y}:null; } },

    { id:'farm',
      head:'6 · Mantar çiftliği',
      text:'Gerçek karıncalar gibi mantar yetiştir: çiftlik <b>lif tüketip yiyecek üretir</b>.<br>'+
           'Nem ister — yüzeye yakın kurulamaz, <b>derine</b> kazman gerekir.',
      hint:'Derinde bir Mantar Çiftliği kur',
      ok:()=>blds.some(b=>b.team===PLAYER&&b.type==='farm'&&b.built>=1),
      press:'b' },

    { id:'age',
      head:'7 · Çağ atla',
      text:'<b>Y</b> tuşu seni Kraliçe Odasına götürür. Oradan <b>Çağ II</b>yi araştır.<br>'+
           'Koşul: bu çağdan en az <b>2 oda</b> dikilmiş olmalı ve kaynak yetmeli.',
      hint:'Çağ II: Büyüyen Koloni',
      ok:()=>P.age>=2,
      press:'y' },

    { id:'army',
      head:'8 · Ordunu kur',
      text:'Kızıl koloni, sen asker üretene kadar saldırmaz — ama sonsuza dek beklemez.<br>'+
           '<b>Savaş Odası</b> kur ve birkaç <b>Asker</b> çıkar. Dar tünel ağızları en iyi savunma hattındır.',
      hint:'Savaş Odası + 4 savaşçı',
      ok:()=>blds.some(b=>b.team===PLAYER&&b.type==='barracks'&&b.built>=1)
           && units.filter(u=>u.team===PLAYER&&!u.d.work&&u.type!=='queen').length>=4 },

    { id:'end',
      head:'Hazırsın',
      text:'Gerisi sende: teknolojiler, Takas Odası, duvarlar, asit kastları, kanatlı prenses...<br><br>'+
           '<b>F1</b> her an yardım ekranını açar. İyi şanslar — kızıl koloni seni bekliyor.',
      next:'manual' }
  ],

  start(){ this.on=true; this.i=0; this.done=false; this.camMoved=0; this.render(); },
  skip(){ this.on=false; this.done=true; this.render(); msg('Eğitim kapatıldı — F1 ile yardım açabilirsin'); },
  next(){
    if(this.i<this.steps.length-1){ this.i++; this.flash=1.2; this.render(); }
    else { this.on=false; this.done=true; this.render(); addAlert('Eğitim tamamlandı','ok'); }
  },

  update(dt){
    if(!this.on) return;
    this.t+=dt; if(this.flash>0) this.flash-=dt;
    const s=this.steps[this.i];
    if(s.ok && s.ok()){ this.next(); return; }
    if(this.t>0.4){ this.t=0; this.render(); }
  },

  render(){
    const el=$('tut');
    if(!this.on){ el.style.display='none'; return; }
    const s=this.steps[this.i];
    const prog=`${Math.min(this.i,this.steps.length-1)}/${this.steps.length-1}`;
    let hint='';
    if(s.hint){
      hint=`<div class="tut-goal">🎯 ${s.hint}</div>`;
    }
    el.style.display='block';
    el.innerHTML=`
      <div class="tut-head">${s.head}<span class="tut-prog">${prog}</span></div>
      <div class="tut-body">${s.text}</div>
      ${hint}
      <div class="tut-row">
        ${s.next==='manual'?'<button class="tut-btn" onclick="TUT.next()">İleri ▸</button>'
                           :'<button class="tut-btn ghost" onclick="TUT.next()">Atla ▸</button>'}
        <button class="tut-btn ghost" onclick="TUT.skip()">Eğitimi kapat</button>
      </div>`;
  },

  // dünya üzerinde yön oku
  drawArrow(sx,sy,S){
    if(!this.on) return;
    const s=this.steps[this.i];
    if(!s.arrowTo) return;
    const p=s.arrowTo(); if(!p) return;
    const X=sx(p.x-0.5)+S/2, Y=sy(p.y-0.5)+S/2;
    const bob=Math.sin(performance.now()/260)*S*0.22;
    ctx.save();
    ctx.globalAlpha=0.9;
    ctx.fillStyle='#ffd27a';
    ctx.beginPath();
    ctx.moveTo(X, Y-S*0.9+bob);
    ctx.lineTo(X-S*0.45, Y-S*1.7+bob);
    ctx.lineTo(X-S*0.18, Y-S*1.7+bob);
    ctx.lineTo(X-S*0.18, Y-S*2.4+bob);
    ctx.lineTo(X+S*0.18, Y-S*2.4+bob);
    ctx.lineTo(X+S*0.18, Y-S*1.7+bob);
    ctx.lineTo(X+S*0.45, Y-S*1.7+bob);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
};
function nestOf(){ return blds.find(b=>b.team===PLAYER&&b.type==='nest'); }

window.TUT = TUT;   // klasik script kapsamından global erişim
