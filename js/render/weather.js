'use strict';

// ════════════════════════════════════════════════
// MÉTÉO — temps clair / pluie / orage (comme Minecraft), neige dans les biomes froids, rien dans les déserts
// ════════════════════════════════════════════════
// États (logique de Minecraft) : raining / thundering + trois minuteries en ticks de 1/20 s :
//   clearTime  : temps clair imposé (/weather clear) ; tant qu'il court, ni pluie ni orage
//   rainTime   : temps restant avant que la pluie commence / s'arrête       thunderTime : idem pour l'orage
// Les niveaux visuels `rain` et `thunder` (0..1) rejoignent l'état à 0,2 / s (≈ 5 s de transition) : tout l'aspect (ciel, nuages, pluie) en dépend.
// Un jour du jeu dure 5 min (Minecraft : 20 min) : les durées NATURELLES sont multipliées par WX_NATURAL_SCALE ; /weather <type> <durée> est exact.
// Seul l'hôte (ou le solo) fait avancer les minuteries et déclenche les éclairs ; il diffuse l'état (« wx ») et les impacts (« lg »).
const WX_NATURAL_SCALE = 0.25;
const WX_RAIN_PNG = 'assets/textures/environment/rain.png', WX_SNOW_PNG = 'assets/textures/environment/snow.png';
const WX_R = 10;                 // rayon (blocs) des colonnes de précipitations autour de la caméra
const WX = {raining:false, thundering:false, clearTime:0, rainTime:0, thunderTime:0, rain:0, thunder:0, flash:0, acc:0, strikeT:8, sync:0};

const wxRand = (a,b) => Math.floor(a + Math.random()*(b-a+1));
const wxNat  = (a,b) => Math.max(40, Math.round(wxRand(a,b)*WX_NATURAL_SCALE));
function wxReset(){   // nouveau monde / chargement : temps clair
  WX.raining = WX.thundering = false; WX.clearTime = 0; WX.rain = WX.thunder = WX.flash = 0; WX.acc = 0; WX.strikeT = 8;
  WX.rainTime = wxNat(12000,180000); WX.thunderTime = wxNat(12000,180000);
  wxClearBolts();
}
// Équivalent de ServerLevel.setWeatherParameters
function wxSet(clearTime, weatherTime, raining, thundering){
  WX.clearTime = clearTime; WX.rainTime = weatherTime; WX.thunderTime = weatherTime; WX.raining = raining; WX.thundering = thundering;
}
function wxTick(){   // 1 tick de jeu (1/20 s) : minuteries (hôte / solo seulement)
  if(WX.clearTime > 0){
    WX.clearTime--;
    WX.thunderTime = WX.thundering ? 0 : 1; WX.rainTime = WX.raining ? 0 : 1;
    WX.thundering = false; WX.raining = false;
  } else {
    if(WX.thunderTime > 0){ if(--WX.thunderTime === 0) WX.thundering = !WX.thundering; }
    else WX.thunderTime = WX.thundering ? wxNat(3600,15600) : wxNat(12000,180000);
    if(WX.rainTime > 0){ if(--WX.rainTime === 0) WX.raining = !WX.raining; }
    else WX.rainTime = WX.raining ? wxNat(12000,24000) : wxNat(12000,180000);
  }
}
const wxThunderEff = () => WX.thunder * WX.rain;   // l'orage ne compte que s'il pleut

// ── Précipitations par biome : 0 aucune (désert, badlands), 1 pluie, 2 neige (taïga froide, montagnes en altitude) ──
function wxPrecip(x, z, topY){
  const t = rawBiomeType(x, z);
  if(t === 3 || t === 10) return 0;
  if(t === 6) return tempAt(x,z) < 0.41 ? 2 : 1;
  if(t === 2 || t === 9) return topY > 46 + (tempAt(x,z)-0.5)*40 ? 2 : 1;
  return 1;
}
function wxColTop(x, z){   // plan de surface (y monde) de la colonne : le haut du bloc le plus haut ; null si le chunk n'est pas chargé
  const m = CHUNK_META.get(ckey(x>>4, z>>4)); if(!m) return null;
  const t = m.top[(x&15)*CSIZ + (z&15)];
  return t ? t - Y_OFF : Y_MIN;
}
// Précipitation reçue en un point (0 = à l'abri, sans pluie, ou biome sec)
function wxPrecipAt(px, py, pz){
  if(WX.rain < 0.2) return 0;
  const x = Math.floor(px), z = Math.floor(pz), top = wxColTop(x,z);
  if(top === null || py + 1 < top) return 0;
  return wxPrecip(x, z, top);
}

// ════════════════════════════════════════════════
// RENDU : colonnes de pluie / neige (billboards dans le vertex shader, géométrie reconstruite quand on bouge ou toutes les 0,5 s)
// ════════════════════════════════════════════════
const WX_MAXQ = (2*WX_R+1)*(2*WX_R+1);
let _wxLayers = null, _wxT = 0, _wxKey = '', _wxRebT = 9;
function _wxMakeLayer(png, speedV, driftU){
  const tex = new THREE.TextureLoader().load(png);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(WX_MAXQ*12), 3).setUsage(THREE.DynamicDrawUsage);
  const aD  = new THREE.BufferAttribute(new Float32Array(WX_MAXQ*12), 3).setUsage(THREE.DynamicDrawUsage);   // (côté ±1, v, décalage u)
  const idx = new Uint16Array(WX_MAXQ*6);
  for(let q=0;q<WX_MAXQ;q++){ const b=q*4, i=q*6; idx[i]=b; idx[i+1]=b+1; idx[i+2]=b+2; idx[i+3]=b; idx[i+4]=b+2; idx[i+5]=b+3; }
  geo.setIndex(new THREE.BufferAttribute(idx,1)); geo.setAttribute('position', pos); geo.setAttribute('aD', aD); geo.setDrawRange(0,0);
  const mat = new THREE.ShaderMaterial({
    uniforms:{map:{value:tex}, uCam:{value:new THREE.Vector3()}, uScroll:{value:new THREE.Vector2()}, uLevel:{value:0}, uBright:{value:1}, uR2:{value:WX_R*WX_R}},
    vertexShader:`attribute vec3 aD; uniform vec3 uCam; uniform vec2 uScroll; uniform float uR2; varying vec2 vUv; varying float vFade;
      void main(){
        vec2 d = uCam.xz - position.xz; float l = max(length(d), 0.001);
        vec2 perp = vec2(-d.y, d.x)/l;                                           // le plan fait toujours face à la caméra (autour de Y)
        vec3 p = vec3(position.x + perp.x*aD.x*0.5, position.y, position.z + perp.y*aD.x*0.5);
        vUv = vec2(aD.x*0.5 + 0.5 + aD.z + uScroll.x, aD.y + uScroll.y);
        vFade = (1.0 - min(dot(d,d)/uR2, 1.0))*0.5 + 0.5;
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`uniform sampler2D map; uniform float uLevel, uBright; varying vec2 vUv; varying float vFade;
      void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb*uBright, t.a*uLevel*vFade); }`,
    transparent:true, depthWrite:false, side:THREE.DoubleSide});
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; scene.add(mesh);
  return {mesh, mat, pos, aD, n:0, speedV, driftU};
}
function _wxRebuild(){
  const px = Math.floor(P.x), pz = Math.floor(P.z), cy = camera.position.y, y1 = Math.floor(cy - WX_R), y2 = Math.floor(cy + WX_R);
  const L = [_wxLayers.rain, _wxLayers.snow]; L[0].n = L[1].n = 0;
  for(let dz=-WX_R; dz<=WX_R; dz++) for(let dx=-WX_R; dx<=WX_R; dx++){
    if(dx*dx + dz*dz > WX_R*WX_R) continue;
    const x = px+dx, z = pz+dz, top = wxColTop(x,z);
    if(top === null) continue;
    const ymin = Math.max(y1, top);
    if(ymin >= y2) continue;                                     // sol (ou toit) plus haut que la zone : à l'abri
    const kind = wxPrecip(x, z, top); if(!kind) continue;
    const l = L[kind-1], q = l.n++, p = q*12;
    const h = (Math.imul(x*x*3121 + x*45238971, 1) ^ (z*z*418711 + z*13761)) | 0;
    const uo = ((h>>>0) & 31)/32, vo = (((h>>>5)>>>0) & 255)/255;
    const cx = x+0.5, cz = z+0.5, v0 = ymin*0.25 + vo, v1 = y2*0.25 + vo;
    const pa = l.pos.array, da = l.aD.array;
    pa.set([cx,ymin,cz, cx,ymin,cz, cx,y2,cz, cx,y2,cz], p);
    da.set([-1,v0,uo, 1,v0,uo, 1,v1,uo, -1,v1,uo], p);
  }
  for(const l of L){ l.pos.needsUpdate = l.aD.needsUpdate = true; l.mesh.geometry.setDrawRange(0, l.n*6); }
}
function _wxUpdateVisual(dt){
  if(!scene || !camera) return;
  if(!_wxLayers) _wxLayers = {rain:_wxMakeLayer(WX_RAIN_PNG, 3.6, 0), snow:_wxMakeLayer(WX_SNOW_PNG, 0.5, 0.04)};
  const on = WX.rain > 0.01;
  _wxLayers.rain.mesh.visible = _wxLayers.snow.mesh.visible = on;
  if(!on){ _wxKey = ''; return; }
  _wxRebT += dt; _wxT += dt;
  const key = Math.floor(P.x)+','+Math.floor(P.z)+','+Math.floor(camera.position.y);
  if(key !== _wxKey || _wxRebT > 0.5){ _wxKey = key; _wxRebT = 0; _wxRebuild(); }
  const sc = LIGHT_UNI.uSkyCol.value, br = 0.25 + 0.75*Math.max(sc.r, sc.g, sc.b);   // pluie plus sombre la nuit
  for(const l of [_wxLayers.rain, _wxLayers.snow]){
    const u = l.mat.uniforms;
    u.uCam.value.copy(camera.position);
    u.uScroll.value.set(Math.sin(_wxT*0.7)*l.driftU, _wxT*l.speedV);   // v : vitesse en « répétitions du motif » / s (le motif couvre 4 blocs : 3,6 → ≈ 14 blocs/s)
    u.uLevel.value = WX.rain; u.uBright.value = br;
  }
}

// ── Éclairs : ruban lumineux en zigzag (2 plans croisés), flash du ciel, feu, dégâts ──
const _wxBolts = [];
function wxClearBolts(){ for(const b of _wxBolts){ scene && scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); } _wxBolts.length = 0; }
function _wxBoltMesh(x, yBot, z){
  const yTop = Math.max(CL_Y, yBot + 60), seg = Math.max(8, Math.round((yTop - yBot)/5)), pts = [];
  let bx = x + (Math.random()-0.5)*6, bz = z + (Math.random()-0.5)*6;
  for(let i=0;i<=seg;i++){
    const f = i/seg, y = yTop + (yBot - yTop)*f, j = (1-f)*2.4 + 0.2;
    if(i === seg){ bx = x; bz = z; } else { bx += (Math.random()-0.5)*j*2; bz += (Math.random()-0.5)*j*2; }
    pts.push([bx, y, bz]);
  }
  const pos = [], ind = [], W = 0.22;
  const ribbon = (ox, oz) => {
    const b0 = pos.length/3;
    for(const [px,py,pz] of pts) pos.push(px-ox*W, py, pz-oz*W, px+ox*W, py, pz+oz*W);
    for(let i=0;i<pts.length-1;i++){ const a = b0+i*2; ind.push(a,a+1,a+2, a+1,a+3,a+2); }
  };
  ribbon(1,0); ribbon(0,1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos),3)); g.setIndex(ind);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:0xdde4ff, transparent:true, opacity:1, blending:THREE.AdditiveBlending,
    depthWrite:false, side:THREE.DoubleSide, fog:false, toneMapped:false}));
  m.frustumCulled = false; m.renderOrder = 7; scene.add(m);
  return m;
}
// Impact en (x,y,z) (y = case d'air au-dessus du sol). remote : événement reçu de l'hôte (le feu et les créatures sont gérés par l'hôte)
function wxStrike(x, y, z, remote){
  if(scene) _wxBolts.push({mesh:_wxBoltMesh(x, y, z), t:0});
  WX.flash = 1;
  const dp = Math.hypot(P.x - x, P.z - z);
  if(dp < 3.5 && Math.abs(P.y - y) < 6 && typeof svDamage === 'function'){ svDamage(5, 'lightning'); SV.burn = Math.max(SV.burn, 8); }
  if(remote) return;
  if(typeof igniteAt === 'function') igniteAt(Math.floor(x), Math.floor(y), Math.floor(z), 0);   // le sol prend feu si c'est inflammable
  for(const m of MOBS) if(m.deadT < 0 && Math.hypot(m.x - x, m.z - z) < 4 && Math.abs(m.y - y) < 6) mobDamage(m, 5, {x, z});
  if(MP.role === 'host') mpBroadcast({t:'lg', x, y, z}, null);
}
function _wxUpdateBolts(dt){
  for(let i=_wxBolts.length-1;i>=0;i--){
    const b = _wxBolts[i]; b.t += dt;
    b.mesh.material.opacity = b.t < 0.1 ? 1 : b.t < 0.17 ? 0.15 : b.t < 0.28 ? 1 : Math.max(0, 1 - (b.t-0.28)/0.2);   // scintillement puis extinction
    if(b.t > 0.5){ scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); _wxBolts.splice(i,1); }
  }
  WX.flash = Math.max(0, WX.flash - dt*3.5);
}
function _wxRandomStrike(dt){
  if(wxThunderEff() < 0.5) return;
  WX.strikeT -= dt;
  if(WX.strikeT > 0) return;
  WX.strikeT = 3 + Math.random()*13;
  const a = Math.random()*Math.PI*2, d = 14 + Math.random()*60, x = Math.floor(P.x + Math.cos(a)*d), z = Math.floor(P.z + Math.sin(a)*d);
  const top = wxColTop(x, z);
  if(top === null || FLUIDK[getB(x, top-1, z)] === 1) return;   // chunk non chargé / impact sur l'eau : on ne tire pas
  wxStrike(x + 0.5, top, z + 0.5, false);
}

// ════════════════════════════════════════════════
// BOUCLE : appelée à chaque frame avant updDay()
// ════════════════════════════════════════════════
function updateWeather(dt){
  const client = MP.role === 'client';
  if(!client){
    WX.acc += dt*20;
    let n = 0; while(WX.acc >= 1 && n < 400){ WX.acc -= 1; wxTick(); n++; }
    if(n === 400) WX.acc = 0;
  }
  const s = 0.2*dt;   // 0,01 par tick
  WX.rain    = Math.max(0, Math.min(1, WX.rain    + (WX.raining    ? s : -s)));
  WX.thunder = Math.max(0, Math.min(1, WX.thunder + (WX.thundering ? s : -s)));
  if(!client) _wxRandomStrike(dt);
  _wxUpdateBolts(dt);
  _wxUpdateVisual(dt);
  if(MP.role === 'host'){ WX.sync += dt; if(WX.sync > 1){ WX.sync = 0; mpBroadcast(wxNetState(), null); } }
}
// Ciel : mélange vers un gris sombre (formule de Minecraft) + éclair
function wxTintSky(c){
  const lum = c.r*0.3 + c.g*0.59 + c.b*0.11;
  if(WX.rain > 0){ const g = lum*0.6, h = 1 - WX.rain*0.75; c.setRGB(c.r*h + g*(1-h), c.g*h + g*(1-h), c.b*h + g*(1-h)); }
  const th = wxThunderEff();
  if(th > 0){ const l2 = c.r*0.3 + c.g*0.59 + c.b*0.11, g = l2*0.2, h = 1 - th*0.75; c.setRGB(c.r*h + g*(1-h), c.g*h + g*(1-h), c.b*h + g*(1-h)); }
  if(WX.flash > 0){ const f = WX.flash*0.75; c.setRGB(c.r*(1-f)+f, c.g*(1-f)+f, c.b*(1-f)+f); }
}
// Lumière ambiante : la pluie assombrit (-25 %), l'orage encore (-20 %) ; un éclair l'éclaire d'un coup
function wxAmbient(amb){
  amb *= 1 - 0.25*WX.rain - 0.20*wxThunderEff();
  return Math.min(1, amb + WX.flash*0.7);
}
// Pictogramme pour l'horloge
function wxIcon(){ return WX.rain < 0.5 ? '' : (wxThunderEff() > 0.5 ? ' ⛈️' : ' 🌧️'); }

// ════════════════════════════════════════════════
// RÉSEAU / SAUVEGARDE
// ════════════════════════════════════════════════
function wxNetState(){ return {t:'wx', r:WX.raining?1:0, th:WX.thundering?1:0, rl:WX.rain, tl:WX.thunder}; }
function wxApplyNet(m, snap){
  WX.raining = !!m.r; WX.thundering = !!m.th;
  if(snap){ WX.rain = +m.rl || 0; WX.thunder = +m.tl || 0; }
}
function wxSave(){ return {r:WX.raining?1:0, th:WX.thundering?1:0, ct:WX.clearTime, rt:WX.rainTime, tt:WX.thunderTime}; }
function wxLoad(o){
  wxReset();
  if(!o || typeof o !== 'object') return;
  const n = (v, d) => (isFinite(v) && v >= 0) ? Math.min(1e7, Math.floor(v)) : d;
  WX.raining = !!o.r; WX.thundering = !!o.th; WX.clearTime = n(o.ct, 0); WX.rainTime = n(o.rt, WX.rainTime); WX.thunderTime = n(o.tt, WX.thunderTime);
  WX.rain = WX.raining ? 1 : 0; WX.thunder = WX.thundering ? 1 : 0;
}

// ════════════════════════════════════════════════
// /weather <clear|rain|thunder|query> [durée]   (durée : ticks, ou suffixe t / s / d ; 1 à 1 000 000 ticks)
// ════════════════════════════════════════════════
function cmdWeather(a){
  const sub = (a[0]||'').toLowerCase();
  if(MP.role === 'client') return chatErr('Only the host can change the weather.');
  if(sub === 'query'){
    const state = WX.raining ? (WX.thundering ? 'thundering' : 'raining') : 'clear';
    return chatOk('The weather is '+state+(WX.clearTime>0 ? ' (clear weather forced for '+WX.clearTime+' more ticks)' : ''));
  }
  if(!['clear','rain','thunder'].includes(sub)) return chatErr('Usage: /weather <clear|rain|thunder|query> [duration]');
  let dur = null;
  if(a[1] !== undefined){
    const m = /^(\d+)([tsd]?)$/i.exec(a[1]);
    if(!m) return chatErr('Invalid duration: '+a[1]+' (use ticks, or a suffix t / s / d)');
    dur = parseInt(m[1],10) * ({t:1, s:20, d:24000}[(m[2]||'t').toLowerCase()]);
    if(dur < 1 || dur > 1000000) return chatErr('Duration must be between 1 and 1000000 ticks');
  }
  if(sub === 'clear') wxSet(dur !== null ? dur : wxNat(12000,180000), 0, false, false);
  else if(sub === 'rain') wxSet(0, dur !== null ? dur : wxNat(12000,24000), true, false);
  else wxSet(0, dur !== null ? dur : wxNat(3600,15600), true, true);
  if(MP.role === 'host') mpBroadcast(wxNetState(), null);
  chatOk('Set the weather to '+sub);
}
