// ===================================================================
//  VERİ TABLOLARI — kastlar, odalar, teknolojiler, çağlar, yaban hayatı
// ===================================================================
"use strict";

const RESL = [
  {k:'f', n:'Yiyecek',      ic:'🍃', col:'#8fc45a'},
  {k:'l', n:'Lif',          ic:'🍂', col:'#c8a24a'},
  {k:'m', n:'Mineral',      ic:'💎', col:'#79c6e8'},
  {k:'d', n:'Bal Şebnemi',  ic:'🍯', col:'#e8b44a'}
];

// ---------------------------------------------------------------- ÇAĞLAR
const AGES = [
  {n:'Yavru Koloni',        cost:null,                            t:0},
  {n:'Büyüyen Koloni',      cost:{f:300,l:160},                   t:40},
  {n:'Olgun Koloni',        cost:{f:650,l:360,m:260},             t:55},
  {n:'İmparatorluk Yuvası', cost:{f:1250,l:650,m:500,d:300},      t:75}
];

// ---------------------------------------------------------------- KASTLAR
// res: toplayabildiği kaynaklar (öncelik sırası) · work: kazma/inşa yapabilir
const ANTS = {
  worker:  {n:'İşçi', sp:'Formica minor', hp:52, dmg:4, rng:1.0, spd:48, cd:1.0,
            cost:{f:25}, t:5, vis:7, r:4.0, col:'#d2a05e', age:1, work:1, res:['f','l'], carry:18,
            desc:'Kazar, inşa eder, yiyecek taşır. Koloninin beli.'},
  cutter:  {n:'Yaprak Kesen', sp:'Atta cephalotes', hp:62, dmg:6, rng:1.0, spd:56, cd:1.0,
            cost:{f:35,l:5}, t:7, vis:7, r:4.5, col:'#9ec46a', age:1, work:1, res:['l','f'], carry:24,
            desc:'Yüzeydeki bitkilerden lif keser. Mantar çiftliğini besler.'},
  herder:  {n:'Bitli Çobanı', sp:'Lasius niger', hp:66, dmg:5, rng:1.0, spd:50, cd:1.0,
            cost:{f:40,l:15}, t:8, vis:9, r:4.3, col:'#caa86a', age:2, work:1, res:['d','f'], carry:18,
            desc:'Yaprak bitlerini sağar, bal şebnemi getirir. Ahırda çalışır.'},
  scout:   {n:'Çöl Koşucusu', sp:'Cataglyphis bicolor', hp:46, dmg:7, rng:1.0, spd:96, cd:0.7,
            cost:{f:30,m:5}, t:6, vis:15, r:3.7, col:'#e8d26a', age:1, res:[],
            desc:'Çok hızlı, geniş görüşlü kâşif. Dövüşte zayıf.'},
  soldier: {n:'Asker', sp:'Camponotus ligniperda', hp:145, dmg:15, rng:1.1, spd:54, cd:0.9,
            cost:{f:50,l:20,m:10}, t:12, vis:8, r:4.9, col:'#c4683a', age:2, res:[],
            desc:'Güçlü çeneli ana savaş kastı. Dengeli ve ucuz.'},
  trapjaw: {n:'Kıskaç Çene', sp:'Odontomachus bauri', hp:115, dmg:24, rng:1.1, spd:64, cd:1.7,
            cost:{f:60,l:10,m:30}, t:14, vis:9, r:4.5, col:'#b8863a', age:3, stun:1.0, res:[],
            desc:'Yıldırım çenesi: ağır vurur ve hedefi sersemletir.'},
  spitter: {n:'Asitçi', sp:'Formica rufa', hp:82, dmg:17, rng:5.4, spd:46, cd:1.3,
            cost:{f:55,m:35,d:15}, t:15, vis:10, r:4.3, col:'#8fbf4a', age:3, vsBld:1.7, res:[],
            desc:'Uzaktan formik asit püskürtür. Odalara karşı çok etkili.'},
  major:   {n:'Koca Kafa', sp:'Pheidole major', hp:330, dmg:27, rng:1.2, spd:36, cd:1.4,
            cost:{f:95,l:35,m:60}, t:22, vis:7, r:6.3, col:'#9a4a2e', age:3, arm:.2, res:[],
            desc:'Devasa kafalı tank. Yavaş ama çok dayanıklı.'},
  doorhead:{n:'Tıkaç Kafa', sp:'Cephalotes varians', hp:430, dmg:9, rng:1.0, spd:30, cd:1.2,
            cost:{f:70,m:85}, t:18, vis:6, r:5.7, col:'#8a7a56', age:3, arm:.45, block:1, res:[],
            desc:'Kafasıyla tüneli tıkar: yanındaki düşmanları yavaşlatır, zırhı kalkan gibidir.'},
  armyant: {n:'Sürü Askeri', sp:'Eciton burchellii', hp:78, dmg:12, rng:1.0, spd:74, cd:0.65,
            cost:{f:35,d:12}, t:7, vis:8, r:3.9, col:'#8a3a2a', age:4, res:[],
            desc:'Ucuz, hızlı, kalabalık. Sayıyla ezer.'},
  bullet:  {n:'Kurşun Karınca', sp:'Paraponera clavata', hp:260, dmg:40, rng:1.1, spd:48, cd:1.5,
            cost:{f:120,m:40,d:60}, t:20, vis:8, r:5.4, col:'#5e3a2a', age:4, poison:6, res:[],
            desc:'Zehirli iğnesi yakıcıdır: vurduğu hedef kanamaya devam eder.'},
  princess:{n:'Kanatlı Prenses', sp:'Gyne alata', hp:230, dmg:6, rng:1.0, spd:62, cd:1.2,
            cost:{f:220,l:120,d:160}, t:30, vis:11, r:6.6, col:'#e3bcdd', age:4, found:1, res:[],
            desc:'Yeni bir Kraliçe Odası kurabilir — ikinci bir yuva aç.'},
  queen:   {n:'Kraliçe', sp:'Regina', hp:650, dmg:11, rng:1.0, spd:20, cd:1.2,
            cost:{}, t:0, vis:10, r:7.8, col:'#e0b7d8', age:1, res:[],
            desc:'Koloninin anası. Odasından çıkmaz, son ana kadar savaşır.'}
};

// ---------------------------------------------------------------- ODALAR
const BLDS = {
  nest:    {n:'Kraliçe Odası', w:3,h:3, hp:1000, cost:{f:350,l:250,m:150}, bt:35, pop:10, age:1, key:'Y',
            trains:['worker'], techs:['age2','age3','age4'], store:1,
            desc:'Koloninin kalbi. Çağ yükseltmeleri burada yapılır. Yıkılırsa koloni biter.'},
  house:   {n:'Yavru Odacığı', w:2,h:2, hp:240, cost:{f:50,l:30}, bt:8, pop:10, age:1, key:'1',
            desc:'Küçük yavru hücresi. Nüfus sınırını +10 artırır (Age of Empires\'daki ev gibi).'},
  brood:   {n:'Kuluçka Odası', w:3,h:2, hp:420, cost:{f:120,l:60}, bt:14, pop:4, age:1, key:'Q',
            trains:['worker','cutter','scout','herder'], techs:['larva','carry'],
            desc:'Yavru kastları yetiştirir. +10 nüfus.'},
  depot:   {n:'Erzak Deposu', w:2,h:2, hp:340, cost:{f:60,l:40}, bt:10, age:1, key:'W', store:1,
            techs:['porter'],
            desc:'Yakın teslim noktası — taşıma yollarını kısaltır.'},
  farm:    {n:'Mantar Çiftliği', w:3,h:2, hp:320, cost:{f:70,l:90}, bt:15, age:1, key:'E',
            yield:{f:1.35}, needs:'l', techs:['fungus','compost'],
            desc:'Lif tüketip yiyecek üretir. Bahçıvan gerektirmez.'},
  aphid:   {n:'Yaprak Biti Ahırı', w:3,h:2, hp:300, cost:{f:110,l:120}, bt:16, age:2, key:'R',
            yield:{d:0.85}, techs:['milk'], herd:1,
            desc:'Yaprak bitlerini barındırır: bal şebnemi üretir. Çobanlar üretimi artırır.'},
  barracks:{n:'Savaş Odası', w:3,h:2, hp:560, cost:{f:160,l:120,m:60}, bt:20, pop:4, age:2, key:'A',
            trains:['soldier','trapjaw','major','bullet'], techs:['mandible','chitin'],
            desc:'Dövüşçü kastları yetiştirir ve silahlandırır.'},
  chem:    {n:'Asit Odası', w:2,h:2, hp:380, cost:{f:140,m:130,d:40}, bt:18, pop:2, age:3, key:'S',
            trains:['spitter'], techs:['acid','sticky'],
            desc:'Formik asit üretir: Asitçi kastı ve asit yükseltmeleri.'},
  swarm:   {n:'Sürü Çukuru', w:3,h:2, hp:480, cost:{f:200,l:80,d:120}, bt:22, pop:6, age:4, key:'D',
            trains:['armyant','princess'], techs:['swarmcall'],
            desc:'Geç çağ: sürü askerleri ve kanatlı prensesler.'},
  tower:   {n:'Nöbetçi Yuvası', w:2,h:2, hp:680, cost:{f:70,l:60,m:110}, bt:12, age:2, key:'Z',
            atk:{dmg:19,rng:7.2,cd:0.95}, desc:'Otomatik savunma: menzilli asit atar.'},
  gate:    {n:'Tünel Kapısı', w:1,h:2, hp:520, cost:{l:70,m:60}, bt:8, age:2, key:'X', gate:1,
            desc:'Tüneli kapatır. Kendi karıncaların geçer, düşman kırmak zorunda kalır.'},
  wall:    {n:'Toprak Duvar', w:1,h:1, hp:360, cost:{l:20,m:25}, bt:4, age:2, key:'K', solid:1,
            desc:'Tüneli tamamen tıkar — kimse geçemez. Ucuzdur, sıra sıra örülür (AoE duvarı gibi).'},
  market:  {n:'Takas Odası', w:3,h:2, hp:400, cost:{f:150,l:120}, bt:16, age:2, key:'J', trade:1,
            desc:'Kaynak takası: elindeki bolluğu ihtiyacın olana çevirir. Kur arz-talebe göre kayar.'},
  midden:  {n:'Çöplük Odası', w:2,h:2, hp:280, cost:{f:60,l:70}, bt:12, age:2, key:'C',
            techs:['hygiene','recycle'], desc:'Atık ve leş yönetimi. Hijyen ve geri dönüşüm araştırmaları.'},
  pherom:  {n:'Feromon Direği', w:1,h:2, hp:260, cost:{f:90,m:50,d:30}, bt:10, age:3, key:'V',
            aura:{spd:0.22,dmg:0.12,r:9}, techs:['trail','alarm'],
            desc:'Çevresindeki karıncaları hızlandırır ve öfkelendirir.'},
  cistern: {n:'Su Odası', w:2,h:2, hp:340, cost:{l:60,m:90}, bt:14, age:2, key:'G',
            techs:['humid'], desc:'Yağmur suyunu toplar: sel hasarını önler, üretimi hızlandırır.'},
  winter:  {n:'Kışlık Oda', w:3,h:2, hp:400, cost:{f:80,l:100,m:40}, bt:15, age:3, key:'H',
            store:1, techs:['hoard'], desc:'Kış aylarında yiyecek kaybını önler, teslim noktasıdır.'}
};

// ---------------------------------------------------------------- TEKNOLOJİLER
// eff: oyun durumuna uygulanan etki anahtarı
const TECHS = {
  age2:    {n:'Çağ II: Büyüyen Koloni', cost:AGES[1].cost, t:AGES[1].t, age:1, key:'1', agetech:2,
            desc:'Çoban, Savaş Odası, Ahır, Kapı, Kule, Su ve Çöplük odalarını açar.'},
  age3:    {n:'Çağ III: Olgun Koloni',  cost:AGES[2].cost, t:AGES[2].t, age:2, key:'2', agetech:3,
            desc:'Asit Odası, Kıskaç, Koca Kafa, Tıkaç Kafa, Feromon ve Kışlık odayı açar.'},
  age4:    {n:'Çağ IV: İmparatorluk',   cost:AGES[3].cost, t:AGES[3].t, age:3, key:'3', agetech:4,
            desc:'Sürü Çukuru, Sürü Askeri, Kurşun Karınca ve Kanatlı Prensesi açar.'},
  larva:   {n:'Larva Bakımı', cost:{f:150,l:60}, t:25, key:'Z', eff:'trainSpd', val:.25,
            desc:'Tüm kuluçka üretimi %25 hızlanır.'},
  carry:   {n:'Güçlü Mandibula', cost:{f:120,m:60}, t:22, key:'X', eff:'carry', val:.5,
            desc:'Toplayıcılar sefer başına %50 daha çok taşır.'},
  porter:  {n:'Taşıyıcı Zinciri', cost:{f:140,l:90}, t:25, key:'Z', eff:'gatherSpd', val:.3,
            desc:'Toplama hızı %30 artar.'},
  fungus:  {n:'Mantar Seçimi', cost:{f:120,l:120}, t:28, key:'Z', eff:'farm', val:.5,
            desc:'Mantar çiftlikleri %50 daha çok yiyecek verir.'},
  compost: {n:'Yaprak Gübresi', cost:{f:200,l:200,m:60}, t:35, key:'X', eff:'farm', val:.6, req:'fungus',
            desc:'Çiftlik verimi bir kat daha artar.'},
  milk:    {n:'İnce Sağım', cost:{f:160,d:60}, t:28, key:'Z', eff:'aphid', val:.6,
            desc:'Ahırlar %60 daha çok bal şebnemi üretir.'},
  mandible:{n:'Çelik Çene', cost:{f:180,m:120}, t:30, key:'Z', eff:'dmg', val:.18, lvl:3,
            desc:'Tüm birimlerin hasarı %18 artar (3 kademe).'},
  chitin:  {n:'Sert Kitin', cost:{f:160,m:140,l:60}, t:30, key:'X', eff:'arm', val:.12, lvl:3,
            desc:'Tüm birimlerin canı ve zırhı artar (3 kademe).'},
  acid:    {n:'Yoğun Asit', cost:{f:180,m:120,d:60}, t:30, key:'Z', eff:'acid', val:.3,
            desc:'Asitçilerin menzili ve hasarı artar.'},
  sticky:  {n:'Yapışkan Asit', cost:{f:200,d:120}, t:32, key:'X', eff:'slow', val:1, req:'acid',
            desc:'Asit isabet eden düşmanı 2 sn yavaşlatır.'},
  swarmcall:{n:'Sürü Çağrısı', cost:{f:300,d:200}, t:40, key:'Z', eff:'swarm', val:.3,
            desc:'Sürü askerleri %30 daha hızlı ve ucuz çıkar.'},
  hygiene: {n:'Koloni Hijyeni', cost:{f:120,l:80}, t:25, key:'Z', eff:'regen', val:1,
            desc:'Yuvaya yakın karıncalar yavaşça iyileşir.'},
  recycle: {n:'Geri Dönüşüm', cost:{f:160,m:80}, t:28, key:'X', eff:'recycle', val:1,
            desc:'Ölen her düşman ve yaratık leş olarak yiyecek bırakır.'},
  trail:   {n:'İz Feromonu', cost:{f:150,d:70}, t:26, key:'Z', eff:'spd', val:.15,
            desc:'Tüm karıncalar %15 hızlanır.'},
  alarm:   {n:'Alarm Feromonu', cost:{f:180,d:110}, t:30, key:'X', eff:'rage', val:1,
            desc:'Yuvası saldırı altındayken tüm birimler %25 fazla hasar verir.'},
  humid:   {n:'Nem Kontrolü', cost:{l:120,m:100}, t:26, key:'Z', eff:'flood', val:1,
            desc:'Yağmur sellerinin verdiği hasarı tamamen keser.'},
  hoard:   {n:'Kış Stoğu', cost:{f:200,l:140}, t:30, key:'Z', eff:'winter', val:1,
            desc:'Kış mevsiminde yiyecek kaybı olmaz.'}
};

// ---------------------------------------------------------------- YABAN HAYATI
const WILD = {
  aphid:   {n:'Yaprak Biti', hp:18,  dmg:0,  spd:4,  r:3.0, col:'#9bd06a', surf:1, passive:1, food:8,
            desc:'Sağılabilir. Ahır yakınında bal şebnemi verir.'},
  larvaeW: {n:'Tırtıl', hp:120, dmg:0,  spd:7,  r:6.0, col:'#d8b86a', surf:1, passive:1, food:120,
            desc:'Yavaş ve savunmasız: öldürülünce bol yiyecek bırakır.'},
  beetle:  {n:'Gömücü Böcek', hp:180, dmg:11, spd:22, r:5.5, col:'#6a5a46', passive:0, food:90,
            desc:'Tünellerde dolaşır, yalnız karıncalara saldırır.'},
  spider:  {n:'Mağara Örümceği', hp:300, dmg:26, spd:34, r:7.5, col:'#4a3a4a', passive:0, food:150,
            desc:'Mağaralarda pusu kurar. Tehlikeli.'},
  centi:   {n:'Kırkayak', hp:520, dmg:34, spd:40, r:9.0, col:'#8a4a2a', passive:0, food:260,
            desc:'Yeraltının canavarı. Küçük gruplar ona yem olur.'},
  mole:    {n:'Köstebek', hp:900, dmg:48, spd:30, r:12.0, col:'#3a3038', passive:0, food:400, digs:1,
            desc:'Toprağı delerek ilerler ve yuvaları basar. Kaçın ya da kalabalıkla çevir.'},
  bird:    {n:'Kuş', hp:220, dmg:30, spd:70, r:9.0, col:'#6a7a8a', surf:1, passive:0, food:180, day:1,
            desc:'Gündüz yüzeydeki karıncaları avlar. Yeraltına inemez.'}
};

const DIFFS = [
  {n:'Kolay',  inc:0.70, wave:1.35, cap:0.7},
  {n:'Normal', inc:1.00, wave:1.00, cap:1.0},
  {n:'Zor',    inc:1.40, wave:0.75, cap:1.3}
];
