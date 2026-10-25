'use strict';

// ════════════════════════════════════════════════
// PHYSICALLY-BASED DAY/NIGHT CYCLE
// ════════════════════════════════════════════════
let dayT=0.25;
const lerp=(a,b,t)=>a+(b-a)*t;
const lc=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];

// Rayleigh-inspired sky colour ramp — upgraded with richer Mie scattering
// Keyframes: [time 0..1] => [r,g,b sky], [r,g,b horizon], sunIntensity, ambIntensity, moonIntensity, exposure
const SKY_KEYS = [
  // midnight
  {t:0.00, sky:[2,3,20],   hor:[6,7,38],   sun:0.0, amb:1.0, moon:0.32, hem:[28,38,88],   hemGnd:[8,6,4],   exp:0.50},
  // pre-dawn
  {t:0.18, sky:[6,5,38],   hor:[30,12,55], sun:0.0, amb:1.0, moon:0.12, hem:[38,32,75],   hemGnd:[10,8,5],  exp:0.58},
  // sunrise (golden hour — richer Mie scattering)
  {t:0.25, sky:[55,75,175],hor:[255,135,45],sun:0.60,amb:1.0,moon:0.0, hem:[220,190,130], hemGnd:[65,48,22],exp:0.82},
  // morning
  {t:0.33, sky:[95,165,235],hor:[175,215,245],sun:1.2,amb:1.0,moon:0.0,hem:[185,215,245],hemGnd:[82,68,38],exp:1.02},
  // midday
  {t:0.50, sky:[85,158,240],hor:[155,205,245],sun:1.65,amb:1.0,moon:0.0,hem:[210,228,255],hemGnd:[92,78,42],exp:1.08},
  // afternoon
  {t:0.67, sky:[95,162,235],hor:[205,198,205],sun:1.2,amb:1.0,moon:0.0,hem:[185,205,235],hemGnd:[82,68,38],exp:1.02},
  // sunset (warm amber Mie)
  {t:0.75, sky:[50,65,160],hor:[255,100,25], sun:0.50,amb:1.0,moon:0.0,hem:[200,148,85],  hemGnd:[58,42,22], exp:0.82},
  // dusk
  {t:0.82, sky:[8,7,44],   hor:[44,18,60],  sun:0.0, amb:1.0, moon:0.20, hem:[48,42,85],  hemGnd:[14,11,7],  exp:0.58},
  // night
  {t:1.00, sky:[2,3,20],   hor:[6,7,38],    sun:0.0, amb:1.0, moon:0.32, hem:[28,38,88],  hemGnd:[8,6,4],    exp:0.50},
];

function sampleSky(t){
  // find surrounding keyframes
  let a=SKY_KEYS[0], b=SKY_KEYS[SKY_KEYS.length-1];
  for(let i=0;i<SKY_KEYS.length-1;i++){
    if(t>=SKY_KEYS[i].t && t<=SKY_KEYS[i+1].t){ a=SKY_KEYS[i]; b=SKY_KEYS[i+1]; break; }
  }
  const f=(b.t===a.t)?0:(t-a.t)/(b.t-a.t);
  return {
    sky: lc(a.sky,b.sky,f),
    hor: lc(a.hor,b.hor,f),
    sun: lerp(a.sun,b.sun,f),
    amb: lerp(a.amb,b.amb,f),
    moon: lerp(a.moon,b.moon,f),
    hem: lc(a.hem,b.hem,f),
    hemGnd: lc(a.hemGnd,b.hemGnd,f),
    exp: lerp(a.exp,b.exp,f),
  };
}

// Sun colour based on elevation — physically-inspired Rayleigh + Mie scattering
function sunColor(elevation){ // elevation 0..1
  // At horizon (0): deep orange-red (Mie scattering dominates)
  // At zenith (1): near-white with slight warmth
  const r = lerp(255, 255, elevation);
  const g = lerp(120,  252, Math.pow(elevation, 0.55));
  const b = lerp(30,   230, Math.pow(elevation, 0.40));
  return new THREE.Color(r/255, g/255, b/255);
}

const _skyC=new THREE.Color(), _horC=new THREE.Color(), _clr=new THREE.Color();
const _sd=new THREE.Vector3(), _sr=new THREE.Vector3(), _sv=new THREE.Vector3(), _tg=new THREE.Vector3(), _sup=new THREE.Vector3();
let torchLightTime=0;
const smoothstep01=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};

function updDay(dt){
  const prevT=dayT;
  dayT=(dayT+dt/300)%1;
  if(prevT<0.5 && dayT>=0.5) dayCount++;   // le jour change à midi : la nuit garde une seule phase de lune
  torchLightTime+=dt;
  const sk=sampleSky(dayT);

  _skyC.setRGB(sk.sky[0]/255,sk.sky[1]/255,sk.sky[2]/255);
  _horC.setRGB(sk.hor[0]/255,sk.hor[1]/255,sk.hor[2]/255);
  // fond proche de la couleur du brouillard → pas de "cassure" à l'horizon
  _clr.copy(_skyC).lerp(_horC,0.55);
  renderer.setClearColor(_clr);
  scene.fog.color.copy(_horC);

  const sunAng=(dayT-0.25)*Math.PI*2;
  const sunEl=Math.sin(sunAng);
  _sd.set(Math.cos(sunAng)*100,sunEl*100,25).normalize();


  // Lumière ambiante du ciel (précalculée dans les sommets × cette couleur) : jour clair, nuit bleutée
  const dayF=smoothstep01((sunEl+0.12)/0.42);
  const amb=lerp(0.16, 1.0, dayF);
  const mxc=Math.max(sk.hem[0],sk.hem[1],sk.hem[2],1);
  const tr=lerp(1,sk.hem[0]/mxc,0.6), tg=lerp(1,sk.hem[1]/mxc,0.6), tb=lerp(1,sk.hem[2]/mxc,0.6);
  LIGHT_UNI.uSkyCol.value.setRGB(tr*amb,tg*amb,tb*amb);
  hemisphereL.color.setRGB(tr,tg,tb); hemisphereL.groundColor.setRGB(tr*0.75,tg*0.75,tb*0.75);
  hemisphereL.intensity=amb;
  const fl=0.97+0.03*Math.sin(torchLightTime*9)+0.015*Math.sin(torchLightTime*23.7);
  LIGHT_UNI.uBlkCol.value.setRGB(1.0*fl,0.72*fl,0.42*fl);
  LIGHT_UNI.uMin.value=S.brightness*0.25;

  const h=dayT*24|0, m=((dayT*24-h)*60)|0;
  const ph=dayT<0.2?'🌙':dayT<0.27?'🌅':dayT<0.73?'☀️':dayT<0.80?'🌆':'🌙';
  const txt=`${ph} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  if(txt!==updDay._last){ updDay._last=txt; document.getElementById('clk').textContent=txt; }
}

// Torche tenue en main : un seul calcul dans le shader (aucune PointLight, aucun recompile)
function updateHeldLight(dt){
  const it=hotItem(), off=P.offhand;
  const isTorch=id=>id==='torch'||id===20;
  const on=(it&&isTorch(it.id))||(off&&isTorch(off.id));
  LIGHT_UNI.uHeld.value.set(P.x,P.y+1.3,P.z,on?13:0);
}
