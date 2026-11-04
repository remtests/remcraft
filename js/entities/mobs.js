'use strict';

// ════════════════════════════════════════════════
// MOBS — créatures (vache, cochon, mouton, poulet, villageois, zombie, squelette, creeper, araignée, enderman)
//  · modèles en boîtes texturées (mêmes UV que skinBox / armorBox, taille de texture variable)
//  · physique AABB sur les blocs (gravité, collisions, saut automatique d'un bloc, eau, chute)
//  · PROFILS D'IA (table MOB_AI) :
//      passive    : erre au hasard par intermittence, regarde le joueur de près, fuit quand on le frappe
//      aggressive : repère le joueur (distance + ligne de vue), le poursuit et l'attaque au corps à corps
//      neutral    : inoffensive tant qu'on ne la frappe pas (enderman), puis poursuit et attaque
//  · boîtes : g = gonflement en px (couche de laine), t = texture propre à la boîte (couche), glow = couche lumineuse (yeux)
//  · le joueur peut les frapper (clic gauche) : dégâts selon l'outil, coup critique en chute, recul
//
// Ajouter une créature = une entrée dans MOB_TYPES (+ sa texture dans MOB_TEX_DATA, texture-manifest.js).
// Ajouter un profil   = une entrée dans MOB_AI, puis `ai:'nom'` dans la créature.
// Les créatures ne sont pas sauvegardées ni synchronisées en multijoueur (invoquées avec /summon).
// ════════════════════════════════════════════════
const MOB_IMG = {};          // textures chargées (canvas à la taille d'origine), par clé de MOB_TEX_DATA
const MOBS = [];
const MOB_MAX = 64;          // plafond de créatures simultanées
const MOB_FAR = 160;         // au-delà de cette distance au joueur, la créature disparaît

// ── Profils d'IA ──
const MOB_AI = {
  passive:    { flee:true,  hunt:false },
  aggressive: { flee:false, hunt:true, sight:24, lose:32, memory:6, reach:1.7 },
  neutral:    { flee:false, hunt:true, prov:true, sight:0, lose:32, memory:30, reach:2.0 },   // prov : ne repère rien seule, ne poursuit qu'après avoir été frappée
  // sight : distance de détection (avec ligne de vue) · lose : distance à laquelle on abandonne la poursuite
  // memory : secondes de poursuite après avoir perdu le joueur de vue (ou après avoir été frappé) · reach : portée d'attaque
};

// 8 pattes d'araignée : angles de repos du modèle Minecraft (Z : écartement vers le bas, Y : balayage), inversés ici (axes y haut / z vers l'avant)
const SPIDER_LEGS = {};
const SPIDER_LEG_ORDER = [];
(function(){
  const q = Math.PI/4, Z = [-q, -q*0.74, -q*0.74, -q], Y = [q, q/2, -q/2, -q], ZS = [-2,-1,0,1];
  for(let i=0;i<4;i++) for(const side of [1,-1]){   // 1 = droite (x < 0), -1 = gauche
    const name = (side>0?'r':'l')+'Leg'+i;
    SPIDER_LEGS[name] = {p:[-4*side, 9, ZS[i]], r:[0, -side*Y[i], -side*Z[i]], boxes:[{s:[16,2,2], uv:[18,0], c:[-7*side,0,0]}]};
    SPIDER_LEG_ORDER.push({name, i, side});
  }
})();

// ── Créatures ──
// Modèle en pixels (1 px = 1/16 bloc), y vers le haut depuis les pieds, la créature regarde vers +z.
// part : p = pivot, r = rotation de base, boxes[] : s = taille (w,h,d), uv = (u,v) dans la texture, c = centre de la boîte / pivot, m = miroir (membres gauches des anciennes textures)
const MOB_TYPES = {
  cow: {
    name:'Cow', tex:'cow', ai:'passive', gait:'quad',
    w:0.9, h:1.4, hp:10, scale:1/16,
    speed:1.4, fleeSpeed:3.0, turn:5, look:6,
    parts:{
      head:   {p:[0,20,8],  boxes:[{s:[8,8,6], uv:[0,0],  c:[0,0,3]},
                                   {s:[1,3,1], uv:[22,0], c:[-4.5,3.5,3.5]},    // cornes
                                   {s:[1,3,1], uv:[22,0], c:[4.5,3.5,3.5]}]},
      // corps couché : la boîte 12×18×10 est tournée de 90° autour de X (comme dans Minecraft), pis compris
      body:   {p:[0,19,-2], r:[Math.PI/2,0,0], boxes:[{s:[12,18,10], uv:[18,4], c:[0,1,2]},
                                                       {s:[4,6,1],   uv:[52,0], c:[0,-5,7.5]}]},
      hindR:  {p:[-3,12,-7], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}]},
      hindL:  {p:[ 3,12,-7], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}]},
      frontR: {p:[-3,12, 5], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}]},
      frontL: {p:[ 3,12, 5], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}]},
    }
  },
  zombie: {
    name:'Zombie', tex:'zombie', ai:'aggressive', gait:'biped',
    w:0.6, h:1.95, hp:20, scale:1/16, damage:3,
    speed:1.6, chaseSpeed:3.3, turn:7, look:0,
    parts:{
      head: {p:[0,24,0],  boxes:[{s:[8,8,8],  uv:[0,0],   c:[0,4,0]}]},
      body: {p:[0,24,0],  boxes:[{s:[8,12,4], uv:[16,16], c:[0,-6,0]}]},
      rArm: {p:[-6,22,0], boxes:[{s:[4,12,4], uv:[40,16], c:[0,-4,0]}]},
      lArm: {p:[ 6,22,0], boxes:[{s:[4,12,4], uv:[40,16], c:[0,-4,0], m:true}]},
      rLeg: {p:[-2,12,0], boxes:[{s:[4,12,4], uv:[0,16],  c:[0,-6,0]}]},
      lLeg: {p:[ 2,12,0], boxes:[{s:[4,12,4], uv:[0,16],  c:[0,-6,0], m:true}]},
    }
  },
  pig: {
    name:'Pig', tex:'pig', ai:'passive', gait:'quad',
    w:0.9, h:0.9, hp:10, scale:1/16,
    speed:1.4, fleeSpeed:2.8, turn:5, look:6,
    parts:{
      head:   {p:[0,12,6], boxes:[{s:[8,8,8], uv:[0,0],   c:[0,0,4]},
                                  {s:[4,3,1], uv:[16,16], c:[0,-1.5,8.5]}]},   // groin
      body:   {p:[0,13,-2], r:[Math.PI/2,0,0], boxes:[{s:[10,16,8], uv:[28,8], c:[0,2,3]}]},
      hindR:  {p:[-3,6,-7], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
      hindL:  {p:[ 3,6,-7], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
      frontR: {p:[-3,6, 5], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
      frontL: {p:[ 3,6, 5], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
    }
  },
  sheep: {
    name:'Sheep', tex:'sheep', ai:'passive', gait:'quad',
    w:0.9, h:1.3, hp:8, scale:1/16,
    speed:1.4, fleeSpeed:2.9, turn:5, look:6,
    parts:{
      head:   {p:[0,18,8], boxes:[{s:[6,6,8], uv:[0,0], c:[0,1,2]},
                                  {s:[6,6,6], uv:[0,0], c:[0,1,1], g:0.6, t:'sheep_fur'}]},
      body:   {p:[0,19,-2], r:[Math.PI/2,0,0], boxes:[{s:[8,16,6], uv:[28,8], c:[0,2,4]},
                                                      {s:[8,16,6], uv:[28,8], c:[0,2,4], g:1.75, t:'sheep_fur'}]},
      hindR:  {p:[-3,12,-7], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}, {s:[4,6,4], uv:[0,16], c:[0,-3,0], g:0.5, t:'sheep_fur'}]},
      hindL:  {p:[ 3,12,-7], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}, {s:[4,6,4], uv:[0,16], c:[0,-3,0], g:0.5, t:'sheep_fur'}]},
      frontR: {p:[-3,12, 5], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}, {s:[4,6,4], uv:[0,16], c:[0,-3,0], g:0.5, t:'sheep_fur'}]},
      frontL: {p:[ 3,12, 5], boxes:[{s:[4,12,4], uv:[0,16], c:[0,-6,0]}, {s:[4,6,4], uv:[0,16], c:[0,-3,0], g:0.5, t:'sheep_fur'}]},
    }
  },
  chicken: {
    name:'Chicken', tex:'chicken', ai:'passive', gait:'chicken', slowFall:true,
    w:0.4, h:0.7, hp:4, scale:1/16,
    speed:1.2, fleeSpeed:2.6, turn:6, look:5,
    parts:{
      head:  {p:[0,9,4], boxes:[{s:[4,6,3], uv:[0,0],   c:[0,3,0.5]},
                                {s:[4,2,2], uv:[14,0],  c:[0,3,3]},      // bec
                                {s:[2,2,2], uv:[14,4],  c:[0,1,2]}]},    // caroncule
      body:  {p:[0,8,0], r:[Math.PI/2,0,0], boxes:[{s:[6,8,6], uv:[0,9], c:[0,0,0]}]},
      rLeg:  {p:[-2,5,-1], boxes:[{s:[3,5,3], uv:[26,0], c:[0.5,-2.5,1.5]}]},
      lLeg:  {p:[ 1,5,-1], boxes:[{s:[3,5,3], uv:[26,0], c:[0.5,-2.5,1.5]}]},
      rWing: {p:[-4,11,0], boxes:[{s:[1,4,6], uv:[24,13], c:[0.5,-2,0]}]},
      lWing: {p:[ 4,11,0], boxes:[{s:[1,4,6], uv:[24,13], c:[-0.5,-2,0]}]},
    }
  },
  villager: {
    name:'Villager', tex:'villager', ai:'passive', gait:'biped',
    w:0.6, h:1.95, hp:20, scale:0.9375/16,
    speed:1.2, fleeSpeed:2.6, turn:6, look:6,
    parts:{
      head: {p:[0,24,0], boxes:[{s:[8,10,8], uv:[0,0],  c:[0,5,0]},
                                {s:[2,4,2],  uv:[24,0], c:[0,1,5]}]},     // nez
      body: {p:[0,24,0], boxes:[{s:[8,12,6], uv:[16,20], c:[0,-6,0]},
                                {s:[8,18,6], uv:[0,38],  c:[0,-9,0], g:0.5}]},   // robe
      arms: {p:[0,21,1], r:[-0.75,0,0], boxes:[{s:[4,8,4], uv:[44,22], c:[-6,-2,1]},
                                               {s:[4,8,4], uv:[44,22], c:[6,-2,1], m:true},
                                               {s:[8,4,4], uv:[40,38], c:[0,-4,0]}]},   // bras croisés
      rLeg: {p:[-2,12,0], boxes:[{s:[4,12,4], uv:[0,22], c:[0,-6,0]}]},
      lLeg: {p:[ 2,12,0], boxes:[{s:[4,12,4], uv:[0,22], c:[0,-6,0], m:true}]},
    }
  },
  skeleton: {
    name:'Skeleton', tex:'skeleton', ai:'aggressive', gait:'biped', arms:'raised',
    w:0.6, h:1.99, hp:20, scale:1/16, damage:3,
    speed:1.6, chaseSpeed:3.3, turn:7, look:0,
    parts:{
      head: {p:[0,24,0],  boxes:[{s:[8,8,8],  uv:[0,0],   c:[0,4,0]}]},
      body: {p:[0,24,0],  boxes:[{s:[8,12,4], uv:[16,16], c:[0,-6,0]}]},
      rArm: {p:[-5,22,0], boxes:[{s:[2,12,2], uv:[40,16], c:[0,-4,0]}]},
      lArm: {p:[ 5,22,0], boxes:[{s:[2,12,2], uv:[40,16], c:[0,-4,0], m:true}]},
      rLeg: {p:[-2,12,0], boxes:[{s:[2,12,2], uv:[0,16],  c:[0,-6,0]}]},
      lLeg: {p:[ 2,12,0], boxes:[{s:[2,12,2], uv:[0,16],  c:[0,-6,0], m:true}]},
    }
  },
  creeper: {
    name:'Creeper', tex:'creeper', ai:'aggressive', gait:'quad', explode:3,
    w:0.6, h:1.7, hp:20, scale:1/16,
    speed:1.6, chaseSpeed:3.3, turn:7, look:0,
    parts:{
      head:   {p:[0,18,0], boxes:[{s:[8,8,8],  uv:[0,0],   c:[0,4,0]}]},
      body:   {p:[0,18,0], boxes:[{s:[8,12,4], uv:[16,16], c:[0,-6,0]}]},
      hindR:  {p:[-2,6,-4], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
      hindL:  {p:[ 2,6,-4], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
      frontR: {p:[-2,6, 4], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
      frontL: {p:[ 2,6, 4], boxes:[{s:[4,6,4], uv:[0,16], c:[0,-3,0]}]},
    }
  },
  spider: {
    name:'Spider', tex:'spider', ai:'aggressive', gait:'spider',
    w:1.4, h:0.9, hp:16, scale:1/16, damage:2, climb:true,   // climb : grimpe aux murs
    speed:1.8, chaseSpeed:4.4, turn:8, look:0,
    parts:Object.assign({
      head:  {p:[0,9,3],  boxes:[{s:[8,8,8], uv:[32,4], c:[0,0,4]},
                                 {s:[8,8,8], uv:[32,4], c:[0,0,4], g:0.02, t:'spider_eyes', glow:true}]},
      neck:  {p:[0,9,0],  boxes:[{s:[6,6,6],   uv:[0,0],  c:[0,0,0]}]},
      abdomen:{p:[0,9,-9], boxes:[{s:[10,8,12], uv:[0,12], c:[0,0,0]}]},
    }, SPIDER_LEGS)
  },
  enderman: {
    name:'Enderman', tex:'enderman', ai:'neutral', gait:'biped', arms:'swing',
    w:0.6, h:2.9, hp:40, scale:1/16, damage:4, teleport:true,   // teleport : se téléporte (touchée, dans l'eau, loin de sa cible)
    speed:1.6, chaseSpeed:5.0, turn:8, look:0,
    parts:{
      head: {p:[0,38,0], boxes:[{s:[8,8,8], uv:[0,0], c:[0,4,0]},
                                {s:[8,8,8], uv:[0,0], c:[0,4,0], g:0.02, t:'enderman_eyes', glow:true}]},
      body: {p:[0,38,0], boxes:[{s:[8,12,4], uv:[32,16], c:[0,-6,0]}]},
      rArm: {p:[-5,36,0], boxes:[{s:[2,30,2], uv:[56,0], c:[0,-13,0]}]},
      lArm: {p:[ 5,36,0], boxes:[{s:[2,30,2], uv:[56,0], c:[0,-13,0], m:true}]},
      rLeg: {p:[-2,30,0], boxes:[{s:[2,30,2], uv:[56,0], c:[0,-15,0]}]},
      lLeg: {p:[ 2,30,0], boxes:[{s:[2,30,2], uv:[56,0], c:[0,-15,0], m:true}]},
    }
  },
};
for(const id in MOB_TYPES) SV_CAUSE['mob_'+id] = 'was slain by '+MOB_TYPES[id].name;   // message de mort (survival.js)

// ════════════════════════════════════════════════
// MODÈLE
// ════════════════════════════════════════════════
const _mobGeos = new Map(), _mobTex = {};
function mobBoxGeo(w,h,d,u,v,tw,th,mirror,grow){
  grow = grow || 0;
  const key = [w,h,d,u,v,tw,th,mirror?1:0,grow].join(',');
  let g = _mobGeos.get(key); if(g) return g;
  g = new THREE.BoxGeometry(w+2*grow,h+2*grow,d+2*grow);   // les UV gardent la taille d'origine de la boîte
  const uv = g.attributes.uv;
  // ordre three.js : +x, -x, +y, -y, +z, -z (la créature regarde vers +z ; sa droite est -x)
  const faces = [
    [u+d+w, v+d, d, h, 0], [u, v+d, d, h, 0], [u+d, v, w, d, 0],
    [u+d+w, v, w, d, 1],   [u+d, v+d, w, h, 0], [u+2*d+w, v+d, w, h, 0]
  ];
  if(mirror){ const t = faces[0]; faces[0] = faces[1]; faces[1] = t; }
  faces.forEach((f,i)=>{
    let u0 = f[0]/tw, u1 = (f[0]+f[2])/tw;
    if(mirror){ const t = u0; u0 = u1; u1 = t; }
    let vt = 1-f[1]/th, vb = 1-(f[1]+f[3])/th;
    if(f[4]){ const t = vt; vt = vb; vb = t; }
    uv.setXY(i*4, u0, vt); uv.setXY(i*4+1, u1, vt); uv.setXY(i*4+2, u0, vb); uv.setXY(i*4+3, u1, vb);
  });
  uv.needsUpdate = true;
  _mobGeos.set(key, g);
  return g;
}
// Un matériau par créature ET par texture (la teinte de dégât est individuelle) ; textures et programme de shader partagés.
// Éclairage dynamique (torche en main, feux) comme les objets au sol ; léger plancher émissif pour rester visible la nuit.
// glow : couche lumineuse (yeux de l'enderman / de l'araignée), non éclairée.
function mobTexture(key){
  let tex = _mobTex[key];
  if(!tex){
    tex = _mobTex[key] = new THREE.CanvasTexture(MOB_IMG[key]);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  }
  return tex;
}
function mobMaterial(key, glow){
  const tex = mobTexture(key);
  if(glow) return new THREE.MeshBasicMaterial({map:tex, alphaTest:0.5, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  const mat = new THREE.MeshLambertMaterial({map:tex, emissive:0x222222, emissiveMap:tex, alphaTest:0.5});
  mat.onBeforeCompile = patchDropShader;
  return mat;
}
function mobBuildModel(m){
  const def = m.def;
  const root = new THREE.Group(), inner = new THREE.Group();
  inner.scale.setScalar(def.scale); root.add(inner);
  m.parts = {}; m.mats = [];
  const cache = {};
  const matFor = (key, glow) => {
    const k = key+(glow?'*':'');
    if(!cache[k]){ cache[k] = mobMaterial(key, glow); if(!glow) m.mats.push(cache[k]); else (m.glowMats = m.glowMats || []).push(cache[k]); }
    return cache[k];
  };
  m.mat = matFor(def.tex, false);
  for(const name in def.parts){
    const ps = def.parts[name], piv = new THREE.Group();
    piv.position.set(ps.p[0], ps.p[1], ps.p[2]);
    if(ps.r) piv.rotation.set(ps.r[0], ps.r[1], ps.r[2]);
    for(const b of ps.boxes){
      const tk = b.t || def.tex, img = MOB_IMG[tk];
      if(!img) continue;   // texture de couche absente : la couche est simplement omise
      const mesh = new THREE.Mesh(mobBoxGeo(b.s[0],b.s[1],b.s[2], b.uv[0],b.uv[1], img.width, img.height, !!b.m, b.g), matFor(tk, !!b.glow));
      mesh.position.set(b.c[0], b.c[1], b.c[2]);
      piv.add(mesh);
    }
    inner.add(piv); m.parts[name] = piv;
  }
  m.parts.head.rotation.order = 'YXZ';   // d'abord pivoter sur l'axe vertical, puis lever/baisser la tête
  if(def.gait==='spider') for(const L of SPIDER_LEG_ORDER) m.parts[L.name].rotation.order = 'ZYX';   // ordre des rotations des pattes (comme le modèle d'origine)
  m.root = root;
  scene.add(root);
}

// ════════════════════════════════════════════════
// CRÉATION / SUPPRESSION
// ════════════════════════════════════════════════
function spawnMob(id, x, y, z){
  const def = MOB_TYPES[id];
  if(!def || !MOB_IMG[def.tex] || MOBS.length >= MOB_MAX) return null;
  let g = 0; while(g++ < 16 && mobHit(x,y,z,def.w/2,def.h)) y += 1;   // ne pas apparaître dans un bloc
  const a = Math.random()*Math.PI*2;
  const m = {
    type:id, def, x, y, z, vx:0, vy:0, vz:0, wx:0, wz:0,
    yaw:a, heading:a, hp:def.hp, age:0, deadT:-1,
    onGround:false, inWater:false, blocked:false, stuck:false, airPeak:null,
    invul:0, lastDmg:0, hurtT:0, atkCool:0.5, swingT:0, sideT:0,
    look:false, hy:0, hx:0, lx:x, lz:z, phase:0, swing:0,
    ai:{state:'idle', t:1+Math.random()*3, panic:0, threat:null, jitT:0, fleeAng:0, memory:0, see:false,
        sightT:Math.random()*0.25, lookT:0, side:1, tx:0, tz:0},
    parts:null, root:null, mat:null
  };
  mobBuildModel(m);
  MOBS.push(m);
  mobAnimate(m, 0);
  return m;
}
function mobRemove(i){
  const m = MOBS[i];
  scene.remove(m.root); for(const x of m.mats) x.dispose(); if(m.glowMats) for(const x of m.glowMats) x.dispose();
  MOBS.splice(i,1);
}
function mobKillAll(typeId){   // /kill @e : renvoie le nombre de créatures retirées
  let n = 0;
  for(let i=MOBS.length-1;i>=0;i--) if(!typeId || MOBS[i].type===typeId){ mobRemove(i); n++; }
  return n;
}
function mobsClear(){ mobKillAll(); }

// ════════════════════════════════════════════════
// TÉLÉPORTATION (enderman)
// ════════════════════════════════════════════════
// Cherche un endroit libre (sol plein dessous, place pour la créature, hors fluide) autour de (cx,cz) dans un rayon r, en balayant de haut en bas.
function mobFindSpot(m, cx, cz, r, minPlayerDist){
  const hw = m.def.w/2, h = m.def.h;
  for(let k=0;k<24;k++){
    const x = Math.floor(cx+(Math.random()*2-1)*r)+0.5, z = Math.floor(cz+(Math.random()*2-1)*r)+0.5;
    if(!CHUNK_DATA.has(ckey(Math.floor(x)>>4, Math.floor(z)>>4))) continue;
    if(minPlayerDist && Math.hypot(x-P.x, z-P.z) < minPlayerDist) continue;
    for(let y=Math.floor(Math.min(Y_MAX-4, m.y+12)); y>Math.max(Y_MIN+1, m.y-24); y--){
      if(!solid(x,y-1,z)) continue;
      const b = getB(Math.floor(x), y, Math.floor(z));
      if(b && FLUIDK[b]) break;                  // pas dans un fluide
      if(mobHit(x,y,z,hw,h)) break;              // pas assez de place : on essaie une autre colonne
      return [x,y,z];
    }
  }
  return null;
}
const mobTpReady = m => (m.tpCool||0) <= 0;
function mobTeleportTo(m, spot){
  m.x = spot[0]; m.y = spot[1]; m.z = spot[2];
  m.vx = m.vy = m.vz = 0; m.lx = m.x; m.lz = m.z; m.airPeak = null; m.tpCool = 0.6;
  m.ai.state = 'idle'; m.ai.t = 0.5+Math.random();
}
function mobTeleportRandom(m){   // au hasard dans un rayon de 32 blocs
  const sp = mobFindSpot(m, m.x, m.z, 32); if(!sp) return false;
  mobTeleportTo(m, sp); return true;
}
function mobTeleportToPlayer(m){   // à 4–8 blocs du joueur
  const sp = mobFindSpot(m, P.x, P.z, 8, 4); if(!sp) return false;
  mobTeleportTo(m, sp); return true;
}

// ════════════════════════════════════════════════
// PHYSIQUE (boîte alignée sur les axes, pieds au centre de la base)
// ════════════════════════════════════════════════
function mobHit(x,y,z,hw,h){
  const x0 = Math.floor(x-hw), x1 = Math.floor(x+hw-1e-4), y0 = Math.floor(y), y1 = Math.floor(y+h-1e-4), z0 = Math.floor(z-hw), z1 = Math.floor(z+hw-1e-4);
  for(let bx=x0;bx<=x1;bx++) for(let by=y0;by<=y1;by++) for(let bz=z0;bz<=z1;bz++) if(solid(bx,by,bz)) return true;
  return false;
}
// Déplace la créature sur un axe (0 = x, 1 = y, 2 = z) par pas ≤ 0,4 bloc ; renvoie true si un bloc arrête le mouvement
function mobSweep(m, axis, d){
  if(!d) return false;
  const hw = m.def.w/2, h = m.def.h, n = Math.ceil(Math.abs(d)/0.4), s = d/n;
  for(let i=0;i<n;i++){
    const nx = m.x+(axis===0?s:0), ny = m.y+(axis===1?s:0), nz = m.z+(axis===2?s:0);
    if(mobHit(nx,ny,nz,hw,h)){
      if(axis===1){
        if(s<0){ m.y = Math.floor(ny)+1; m.onGround = true; }
        else m.y = Math.floor(ny+h)-h-0.001;   // plafond
        m.vy = 0;
      }
      return true;
    }
    m.x = nx; m.y = ny; m.z = nz;
  }
  return false;
}
// Sol sous les pas 0,7 bloc plus loin ? (chute de 2 blocs max tolérée : une créature qui erre ne saute pas d'une falaise)
function mobGroundAhead(m, dx, dz){
  const ax = m.x+dx*0.7, az = m.z+dz*0.7;
  for(let k=0;k<3;k++) if(solid(ax, m.y-0.5-k, az)) return true;
  return false;
}
function mobLOS(m){   // ligne de vue entre les yeux de la créature et ceux du joueur
  const ex = m.x, ey = m.y+m.def.h*0.85, ez = m.z, tx = P.x, ty = P.y+P.eyeH, tz = P.z;
  const dx = tx-ex, dy = ty-ey, dz = tz-ez, dist = Math.hypot(dx,dy,dz), n = Math.ceil(dist/0.4);
  for(let i=1;i<n;i++){ const t = i/n; if(solid(ex+dx*t, ey+dy*t, ez+dz*t)) return false; }
  return true;
}
function mobPhysics(m, dt){
  const hw = m.def.w/2, h = m.def.h, grounded = m.onGround;
  m.onGround = false; m.climbing = false;
  const bw = getB(m.x, m.y+0.3, m.z), fk = bw ? FLUIDK[bw] : 0, inW = fk > 0;   // eau ou lave : la créature flotte
  m.inWater = inW;
  if(fk === 2 && m.deadT < 0){ m.lavaT = (m.lavaT||0) + dt; if(m.lavaT >= 0.5){ m.lavaT = 0; mobDamage(m, 4, null); } }   // lave : 4 PV / 0,5 s
  if(fk === 1 && m.deadT < 0){ const fv = fluidFlowVec(Math.floor(m.x), Math.floor(m.y+0.3), Math.floor(m.z)); if(fv){ m.vx += fv[0]*0.6; m.vz += fv[1]*0.6; } }
  // vitesse horizontale : rejoint la vitesse voulue par l'IA (accélération vive au sol, molle en l'air) ; un recul s'estompe de la même façon
  const k = Math.min(1, dt*(grounded ? 10 : inW ? 4 : 1.5)), wf = inW ? 0.6 : 1;
  m.vx += (m.wx*wf - m.vx)*k; m.vz += (m.wz*wf - m.vz)*k;
  if(inW) m.vy += (1.4 - m.vy)*Math.min(1, dt*3);   // elle flotte
  else { m.vy = Math.max(-45, m.vy - 32*dt); if(m.def.slowFall) m.vy = Math.max(-2.5, m.vy); }   // poulet : chute ralentie
  const bX = mobSweep(m, 0, m.vx*dt), bZ = mobSweep(m, 2, m.vz*dt);
  if(bX) m.vx = 0; if(bZ) m.vz = 0;
  m.blocked = bX || bZ;
  if(m.blocked && (m.wx || m.wz) && m.deadT<0){   // obstacle d'un bloc : on saute si la place au-dessus est libre, sinon on est coincé
    if(m.def.climb && !inW){ m.vy = Math.max(m.vy, 3.4); m.climbing = true; }   // araignée : escalade le mur contre lequel elle avance
    else if(grounded){
      const l = Math.hypot(m.wx,m.wz), ex = m.wx/l*0.35, ez = m.wz/l*0.35;
      if(!mobHit(m.x+ex, m.y+1.05, m.z+ez, hw, h)) m.vy = 8.6; else m.stuck = true;
    }
  }
  mobSweep(m, 1, m.vy*dt);
  // dégâts de chute (> 3 blocs), annulés dans l'eau
  if(m.onGround){
    if(m.airPeak!==null){ const fall = m.airPeak - m.y; if(fall > 3 && !inW && !m.def.slowFall) mobDamage(m, Math.floor(fall-3), null); m.airPeak = null; }
  } else if(inW) m.airPeak = null;
  else m.airPeak = (m.airPeak===null) ? m.y : Math.max(m.airPeak, m.y);
  if(m.climbing) m.airPeak = null;   // accrochée au mur : pas de chute
  if(m.def.teleport && fk===1 && m.deadT<0 && mobTpReady(m)) mobTeleportRandom(m);   // l'eau fait fuir l'enderman
}

// ════════════════════════════════════════════════
// IA
// ════════════════════════════════════════════════
function mobHitPlayer(m){
  if(!svOn()) return;
  if(svDamage(m.def.damage, 'mob_'+m.type, {armor:true})){
    const dx = P.x-m.x, dz = P.z-m.z, l = Math.hypot(dx,dz) || 1;   // recul du joueur (vitesse lissée de physStep)
    P.sx = (P.sx||0) + dx/l*0.14; P.sz = (P.sz||0) + dz/l*0.14;
    if(P.onGround && !P.fly){ P.vy = 0.1; P.onGround = false; }
  }
}
function mobExplode(m){   // creeper : explosion de puissance 3 (même moteur que la TNT : blocs, dégâts, recul, effets)
  m.deadT = 2; m.gone = true; m.root.visible = false;   // deadT ≥ 0 : ignoré par les dégâts de l'explosion, retiré à la prochaine mise à jour
  const x = m.x, y = m.y+m.def.h*0.5, z = m.z;
  if(typeof _tntAuth==='function' && _tntAuth()) tntExplode(x, y, z, m.def.explode+1, undefined);
  else { tntBlastLocal(x, y, z, m.def.explode+1); tntFx(x, y, z, m.def.explode+1); }
}

function mobThink(m, dt){
  const def = m.def, ai = MOB_AI[def.ai], A = m.ai;
  m.invul = Math.max(0, m.invul-dt); m.hurtT = Math.max(0, m.hurtT-dt);
  m.atkCool = Math.max(0, m.atkCool-dt); m.swingT = Math.max(0, m.swingT-dt); m.sideT = Math.max(0, m.sideT-dt);
  m.look = false; if(m.tpCool>0) m.tpCool -= dt;
  const dx = P.x-m.x, dz = P.z-m.z, hd = Math.hypot(dx,dz), dyp = P.y-m.y;

  // ── perception (profils qui chassent) ──
  if(ai.hunt){
    A.sightT -= dt;
    if(A.sightT<=0){
      A.sightT = 0.25;
      const rng = ai.prov ? (A.memory>0 ? ai.lose : 0) : ai.sight;   // profil « neutre » : ne voit le joueur qu'une fois provoquée
      A.see = svOn() && hd<rng && Math.abs(dyp)<12 && mobLOS(m);
      if(A.see) A.memory = ai.memory;
    }
    A.memory = Math.max(0, A.memory-dt);
  }
  // ── choix du comportement ──
  let mode = 'roam';
  if(ai.flee && A.panic>0) mode = 'flee';
  else if(ai.hunt && svOn() && A.memory>0 && hd<ai.lose) mode = 'chase';

  // coincé contre un obstacle trop haut : on change de cap
  if(m.stuck){
    m.stuck = false;
    if(mode==='chase'){ A.side = Math.random()<0.5 ? -1 : 1; m.sideT = 0.7; }
    else if(mode==='flee') A.jitT = 0;
    else if(A.state==='wander'){ A.state = 'idle'; A.t = 0.5+Math.random(); }
  }

  let dirx = 0, dirz = 0, spd = 0;
  if(mode==='flee'){
    A.state = 'flee'; A.panic -= dt; A.jitT -= dt;
    if(A.jitT<=0){
      A.jitT = 0.8+Math.random()*0.8;
      const base = A.threat ? Math.atan2(m.x-A.threat.x, m.z-A.threat.z) : A.fleeAng;
      A.fleeAng = base + (Math.random()-0.5)*1.2;
    }
    dirx = Math.sin(A.fleeAng); dirz = Math.cos(A.fleeAng); spd = def.fleeSpeed;
  } else if(mode==='chase'){
    A.state = 'chase'; m.look = true;
    m.heading = Math.atan2(dx,dz);   // face toujours au joueur
    if(def.teleport){   // enderman : trop loin de sa cible depuis 1,5 s → se téléporte près d'elle
      if(hd>16){ m.tpT = (m.tpT||0)+dt; if(m.tpT>=1.5 && mobTpReady(m)){ m.tpT = 0; if(mobTeleportToPlayer(m)) return; } }
      else m.tpT = 0;
    }
    if(def.explode){   // creeper : mèche de 1,5 s à moins de 3 blocs (annulée au-delà de 7), il s'arrête pour gonfler puis explose
      if(A.see && hd<3) m.fuse = (m.fuse||0) + dt;
      else if(hd>7 || !A.see) m.fuse = Math.max(0, (m.fuse||0) - dt);
      if(m.fuse >= 1.5){ mobExplode(m); return; }
    }
    if(hd > 1.0 && !(m.fuse>0)){
      let a = m.heading; if(m.sideT>0) a += A.side*1.0;
      dirx = Math.sin(a); dirz = Math.cos(a); spd = def.chaseSpeed;
    }
    if(!def.explode && A.see && hd<=ai.reach && dyp>-1.6 && dyp<def.h+0.3 && m.atkCool<=0){   // attaque au corps à corps
      m.atkCool = 1.0; m.swingT = 0.4;
      mobHitPlayer(m);
    }
  } else {   // roam : alternance pause / petite balade
    if(def.explode) m.fuse = Math.max(0, (m.fuse||0) - dt);
    if(A.state==='flee' || A.state==='chase'){ A.state = 'idle'; A.t = 1+Math.random()*2; }
    if(A.state==='idle'){
      A.t -= dt;
      if(A.lookT>0){ A.lookT -= dt; m.look = true; }
      else if(def.look>0 && hd<def.look && Math.random()<dt*0.5) A.lookT = 2+Math.random()*2;   // regarde le joueur de temps en temps
      if(A.t<=0){
        const a = Math.random()*Math.PI*2, r = 3+Math.random()*6;
        A.tx = m.x+Math.sin(a)*r; A.tz = m.z+Math.cos(a)*r; A.state = 'wander'; A.t = 8;
      }
    } else {   // wander
      A.t -= dt;
      const tx = A.tx-m.x, tz = A.tz-m.z, td = Math.hypot(tx,tz);
      if(td<0.6 || A.t<=0){ A.state = 'idle'; A.t = 2+Math.random()*5; }
      else { dirx = tx/td; dirz = tz/td; spd = def.speed; }
    }
  }
  // pas de falaise : on s'arrête (errance) ou on change de cap (fuite)
  if(spd>0 && m.onGround && !mobGroundAhead(m, dirx, dirz)){
    spd = 0;
    if(mode==='roam'){ A.state = 'idle'; A.t = 1+Math.random()*2; }
    else if(mode==='flee') A.jitT = 0;
  }
  m.wx = dirx*spd; m.wz = dirz*spd;
  if(spd>0 && mode!=='chase') m.heading = Math.atan2(dirx,dirz);
}

// ════════════════════════════════════════════════
// DÉGÂTS / MORT
// ════════════════════════════════════════════════
// src : {x,z} de l'agresseur (recul + fuite) ; src.player = true → les profils agressifs se retournent contre le joueur
function mobDamage(m, amount, src){
  if(m.deadT>=0 || amount<=0) return false;
  if(m.invul>0){   // 0,5 s d'invulnérabilité : seul un coup plus fort que le précédent passe (la différence)
    if(amount <= m.lastDmg) return false;
    const diff = amount-m.lastDmg; m.lastDmg = amount; amount = diff;
  } else { m.lastDmg = amount; m.invul = 0.5; }
  m.hp -= amount; m.hurtT = 0.4;
  if(src){
    const dx = m.x-src.x, dz = m.z-src.z, l = Math.hypot(dx,dz) || 1;
    m.vx += dx/l*5; m.vz += dz/l*5;
    if(m.onGround || m.inWater) m.vy = 5;
  }
  const ai = MOB_AI[m.def.ai], A = m.ai;
  if(ai.flee){ A.panic = 4; A.threat = src ? {x:src.x, z:src.z} : null; A.fleeAng = Math.random()*Math.PI*2; A.jitT = 0; }
  if(ai.hunt && src && src.player) A.memory = ai.memory;
  if(m.def.teleport && m.hp>0 && Math.random()<0.9 && mobTpReady(m)) mobTeleportRandom(m);   // touché : s'esquive (9 fois sur 10)
  if(m.hp<=0) mobDie(m);
  return true;
}
function mobDie(m){
  m.deadT = 0; m.wx = m.wz = 0; m.look = false;
  // (pas de butin : les objets correspondants — cuir, viande, chair putréfiée — n'existent pas encore dans le jeu)
}

// ── Frappe du joueur ──
function mobRayTarget(reach){   // créature visée (boîte élargie de 0,1), non masquée par un bloc
  const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch), cyw = Math.cos(P.yaw), syw = Math.sin(P.yaw);
  const dx = -cp*syw, dy = sp, dz = -cp*cyw, ox = P.x, oy = P.y+P.eyeH, oz = P.z;
  const o = [ox,oy,oz], d = [dx,dy,dz];
  let best = null, bt = reach;
  for(const m of MOBS){
    if(m.deadT>=0) continue;
    const hw = m.def.w/2+0.1, lo = [m.x-hw, m.y-0.1, m.z-hw], hi = [m.x+hw, m.y+m.def.h+0.1, m.z+hw];
    let t0 = 0, t1 = bt, ok = true;
    for(let i=0;i<3;i++){
      if(Math.abs(d[i])<1e-9){ if(o[i]<lo[i] || o[i]>hi[i]){ ok = false; break; } continue; }
      let a = (lo[i]-o[i])/d[i], b = (hi[i]-o[i])/d[i];
      if(a>b){ const c = a; a = b; b = c; }
      if(a>t0) t0 = a; if(b<t1) t1 = b;
      if(t0>t1){ ok = false; break; }
    }
    if(!ok || t0>=bt) continue;
    let hidden = false;
    for(let s=0.1;s<t0;s+=0.1) if(solid(ox+dx*s, oy+dy*s, oz+dz*s)){ hidden = true; break; }
    if(hidden) continue;
    best = m; bt = t0;
  }
  return best;
}
function mobPlayerDamage(){   // dégâts Minecraft Java selon l'outil tenu (à mains nues : 1), critique ×1,5 en chute
  const {type, tier} = getToolInfo();
  const T = {sword:[4,5,6,4,7], axe:[7,9,9,7,9], pick:[2,3,4,2,5], shovel:[2.5,3.5,4.5,2.5,5.5], hoe:[1,1,1,1,1]};   // bois, pierre, fer, or, diamant
  let dmg = (type && T[type] && tier>0) ? T[type][tier-1] : 1;
  if(!P.onGround && P.vy<0 && !P.fly && !SV.inWater) dmg *= 1.5;
  return dmg;
}
// Appelée au clic gauche : renvoie true si une créature a été frappée (le clic ne casse alors pas de bloc)
function mobPlayerAttack(){
  if(!MOBS.length || SV.dead) return false;
  const m = mobRayTarget(WORLD.mode==='creative' ? 5 : 3);
  if(!m) return false;
  mobDamage(m, mobPlayerDamage(), {x:P.x, z:P.z, player:true});
  svExhaust(0.1);
  return true;
}

// ════════════════════════════════════════════════
// ANIMATION / AFFICHAGE
// ════════════════════════════════════════════════
const _mobWrap = a => { a = (a+Math.PI)%(2*Math.PI); if(a<0) a += 2*Math.PI; return a-Math.PI; };
function mobAnimate(m, dt){
  const def = m.def, pt = m.parts;
  // corps : tourne vers le cap avec une vitesse limitée
  const df = _mobWrap(m.heading-m.yaw), mx = def.turn*dt;
  m.yaw += Math.max(-mx, Math.min(mx, df));
  // marche
  const dist = Math.hypot(m.x-m.lx, m.z-m.lz); m.lx = m.x; m.lz = m.z;
  const spd = dt>0 ? dist/dt : 0;
  m.swing += (Math.min(1, spd/2.2) - m.swing)*Math.min(1, dt*10);
  m.phase += dist*(def.gait==='quad' ? 4.2 : def.gait==='spider' ? 2.2 : def.gait==='chicken' ? 4.5 : 2.7);
  if(def.gait==='quad'){
    const a = Math.cos(m.phase)*0.9*m.swing;   // allure diagonale
    pt.hindR.rotation.x = a; pt.frontL.rotation.x = a; pt.hindL.rotation.x = -a; pt.frontR.rotation.x = -a;
  } else if(def.gait==='spider'){
    const sw = m.swing;
    for(const L of SPIDER_LEG_ORDER){   // marche : balayage (Y) et soulèvement (Z) déphasés par paire, comme le modèle d'origine
      const off = [0, Math.PI, Math.PI/2, Math.PI*1.5][L.i];
      const fy = -(Math.cos(m.phase*2+off)*0.4)*sw, fz = Math.abs(Math.sin(m.phase+off)*0.4)*sw, base = def.parts[L.name].r;
      pt[L.name].rotation.set(0, base[1] + L.side*fy, base[2] + L.side*fz);
    }
  } else {   // bipède / poulet
    const a = Math.sin(m.phase)*1.2*m.swing;
    pt.rLeg.rotation.x = a; pt.lLeg.rotation.x = -a;
    if(def.gait==='chicken'){
      const fl = m.onGround ? 0 : 0.5+0.5*Math.sin(m.age*30), z = 0.05 + fl*1.1;   // en l'air : il bat des ailes
      pt.rWing.rotation.z = -z; pt.lWing.rotation.z = z;
    } else if(pt.rArm){
      if(def.arms==='raised'){
        const sw = m.swingT>0 ? Math.sin((1-m.swingT/0.4)*Math.PI) : 0;   // coup : les bras s'abaissent puis remontent
        const base = -1.5 + Math.sin(m.age*2)*0.04 + sw*0.9;
        pt.rArm.rotation.x = base - a*0.1; pt.lArm.rotation.x = base + a*0.1;
      } else { pt.rArm.rotation.x = -a*0.8; pt.lArm.rotation.x = a*0.8; }
    }
  }
  // tête : suit le joueur quand la créature le regarde
  let ty = 0, tp = 0;
  if(m.look && m.deadT<0){
    const dx = P.x-m.x, dz = P.z-m.z, hd = Math.hypot(dx,dz);
    ty = Math.max(-1.1, Math.min(1.1, _mobWrap(Math.atan2(dx,dz)-m.yaw)));
    tp = Math.max(-0.7, Math.min(0.7, Math.atan2((P.y+P.eyeH)-(m.y+def.h*0.9), hd)));
  }
  const kh = Math.min(1, dt*8);
  m.hy += (ty-m.hy)*kh; m.hx += (tp-m.hx)*kh;
  pt.head.rotation.y = m.hy; pt.head.rotation.x = -m.hx;
  // position, chute sur le côté à la mort, teinte rouge de dégât
  m.root.position.set(m.x, m.y, m.z);
  m.root.rotation.y = m.yaw;
  if(m.deadT>=0){
    const t = Math.min(1, m.deadT/0.6), a = t*t*(3-2*t)*Math.PI/2;
    m.root.rotation.z = a; m.root.position.y += Math.sin(a)*def.w*0.5;
  }
  const f = m.deadT>=0 ? 1 : (m.hurtT>0 ? m.hurtT/0.4 : 0);
  let er = 0.13+0.55*f, eg = 0.13*(1-f)+0.02, eb = eg;
  if(def.explode){   // creeper : gonfle et clignote en blanc pendant que la mèche brûle
    const p = Math.min(1, (m.fuse||0)/1.5);
    const w = 1 + p*p*0.4 + Math.sin(p*100)*p*0.01, hh = 1 + p*p*0.1;
    m.root.scale.set(w, hh, w);
    if(p>0 && Math.floor((m.fuse||0)*10)%2===0){ er = eg = eb = 0.9; }
  }
  for(const x of m.mats) x.emissive.setRGB(er, eg, eb);
}

function updateMobs(dt){
  if(!MOBS.length) return;
  const sub = dt>0.05 ? 2 : 1, sdt = dt/sub, far2 = MOB_FAR*MOB_FAR, vis = ((typeof S!=='undefined' && S.renderDist) || 8)*16+16;
  for(let i=MOBS.length-1;i>=0;i--){
    const m = MOBS[i], dx = P.x-m.x, dz = P.z-m.z, d2 = dx*dx+dz*dz;
    if(m.gone || d2>far2 || m.y<Y_MIN-32){ mobRemove(i); continue; }
    if(!CHUNK_DATA.has(ckey(Math.floor(m.x)>>4, Math.floor(m.z)>>4))){ m.root.visible = false; continue; }   // chunk absent : la créature attend
    if(m.deadT>=0){
      m.deadT += dt;
      if(m.deadT>1.0){ mobRemove(i); continue; }
      for(let s=0;s<sub;s++) mobPhysics(m, sdt);
    } else {
      m.age += dt;
      for(let s=0;s<sub;s++){ mobThink(m, sdt); mobPhysics(m, sdt); }
    }
    mobAnimate(m, dt);
    m.root.visible = d2 < vis*vis;
  }
}

// ════════════════════════════════════════════════
// ŒUFS D'APPARITION (item « <mob>_spawn_egg », couleurs : SPAWN_EGGS dans data/blocks.js)
// ════════════════════════════════════════════════
const isSpawnEgg = id => typeof id==='string' && id.endsWith('_spawn_egg') && !!MOB_TYPES[id.slice(0,-10)];
// Clic droit sur un bloc : la créature apparaît sur la face visée (sur la plante visée si le bloc est remplaçable). Consomme l'œuf hors créatif.
function useSpawnEgg(it, t){
  const id = it.id.slice(0,-10);
  if(MOBS.length >= MOB_MAX){ if(typeof chatErr==='function') chatErr('Too many mobs ('+MOB_MAX+' max). Use /kill @e to remove them.'); return false; }
  const tp = !!(BLOCKS[t.bid] && BLOCKS[t.bid].plant);
  const x = (tp ? t.bx : t.pbx)+0.5, y = tp ? t.by : t.pby, z = (tp ? t.bz : t.pbz)+0.5;
  if(!spawnMob(id, x, y, z)) return false;
  if(WORLD.mode!=='creative'){ it.n--; if(it.n<=0){ it.id = null; it.n = 0; } drawHotbar(); }
  return true;
}
