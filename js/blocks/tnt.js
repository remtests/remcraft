'use strict';

// ════════════════════════════════════════════════
// TNT — bloc explosif → entité amorcée (fusible 80 ticks) → explosion de puissance 4 (règles de Minecraft Java)
//  - Allumage : briquet (clic droit), feu voisin, lave voisine, explosion d'une autre TNT.
//    La redstone n'existe pas encore : un futur courant appellera simplement tntIgnite(x, y, z).
//  - Entité amorcée : gravité, frottement, courants d'eau / de lave, petite impulsion initiale, clignotement + gonflement.
//    Simulée à 20 ticks / s comme dans Minecraft (les vitesses sont donc en blocs / tick dans tout ce fichier).
//  - Explosion : 1352 rayons qui s'affaiblissent selon la résistance des blocs (cratère plus grand dans la terre que dans la pierre ;
//    obsidienne, bedrock, eau et lave arrêtent l'onde), dégâts + recul selon la distance et l'exposition, blocs lâchés avec 1 chance sur 4.
//  - Multijoueur : l'hôte (ou le solo) simule tout ; les clients reçoivent les entités ('tn' / 'tu'), l'explosion ('ex') et les blocs (journal normal).
//    Chaque joueur calcule lui-même ses dégâts et son recul à partir de l'événement 'ex'.
// ════════════════════════════════════════════════
const TNT_ID = 18;
const TNT_FUSE = 80;          // ticks (20 / s) : 4 s
const TNT_POWER = 4;
const TNT_DT = 1/20;          // un tick
const TNT_MAX = 512;          // entités amorcées simultanées (au-delà, les TNT d'une réaction en chaîne restent en place)
const TNT_HW = 0.49, TNT_H = 0.98;   // boîte de collision de l'entité
const TNTS = [];
const TNT_LAVAQ = [];         // blocs TNT collés à de la lave : [x, y, z, délai restant (s)]
let _tntAcc = 0, _tntSeq = 0, _tntSyncT = 0;
SV_CAUSE.explosion = 'blew up';   // message de mort (survival.js)

// ── Résistance aux explosions des blocs (valeurs de Minecraft) ──
const TNT_BLAST = new Float32Array(256);
(function(){
  const BY_SID = {
    grass_block:.6, snowy_grass_block:.6, dirt:.5, sand:.5, red_sand:.5, gravel:.6, clay:.6, stone:6, cobblestone:6, bedrock:3600000,
    oak_log:2, oak_log_x:2, oak_log_z:2, oak_leaves:.2, oak_planks:3, crafting_table:2.5, chest:2.5, furnace:3.5, bookshelf:1.5,
    glass:.3, white_wool:.8, cactus:.4, tnt:0, torch:0, short_grass:0, poppy:0, blue_orchid:0, water:100, lava:100,
    sandstone:.8, red_sandstone:.8, ice:.5, packed_ice:.5, blue_ice:2.8, snow_block:.2, powder_snow:.25, slime_block:0, dripstone_block:1,
    obsidian:1200, copper_block:6, exposed_copper:6, weathered_copper:6, oxidized_copper:6,
  };
  for(const id in BLOCKS){
    const bd = BLOCKS[id], s = bd.sid || '';
    let r;
    if(s in BY_SID) r = BY_SID[s];
    else if(bd.isFluid) r = 100;
    else if(bd.plant) r = 0;
    else if(/^pointed_dripstone/.test(s)) r = 3;
    else if(/_ore$/.test(s)) r = 3;
    else if(/_planks$/.test(s)) r = 3;
    else if(/_log(_[xz])?$/.test(s)) r = 2;
    else if(/_leaves$/.test(s)) r = .2;
    else if(/_terracotta$/.test(s)) r = 4.2;
    else if(/^(deepslate|cobbled_deepslate|andesite|diorite|granite|polished_|tuff)/.test(s) || /_block$/.test(s)) r = 6;
    else r = Math.max(.5, bd.hard || 0);
    TNT_BLAST[id] = r;
  }
})();

const _tntKey = (x,y,z) => ((x+1048576)*2097152 + (z+1048576))*256 + (y+Y_OFF);
const _tntAuth = () => !(MP.open && MP.role === 'client');   // seul l'hôte (ou le solo) simule les blocs, les entités et les objets

// ════════════════════════════════════════════════
// ALLUMAGE
// ════════════════════════════════════════════════
// Allume le bloc TNT en (x,y,z) : le bloc disparaît et l'entité amorcée apparaît à sa place.
// Un client demande à l'hôte. fuse : ticks avant l'explosion (80 par défaut).
function tntIgnite(x, y, z, fuse){
  if(MP.open && MP.role === 'client'){ mpOut({t:'ti', x, y, z}); return null; }
  if(getB(x,y,z) !== TNT_ID || TNTS.length >= TNT_MAX) return null;
  updateBlock(x, y, z, 0, 0, false);
  return tntSpawn(x+0.5, y, z+0.5, fuse || TNT_FUSE);
}

// Lave voisine d'une TNT : elle finit par l'enflammer (quelques secondes, comme le feu que la lave allume autour d'elle)
function _tntNearLava(x,y,z){
  for(const [dx,dy,dz] of _FNB) if(FLUIDK[getB(x+dx,y+dy,z+dz)] === 2) return true;
  return false;
}
function _tntLavaQueue(x,y,z){
  for(const q of TNT_LAVAQ) if(q[0]===x && q[1]===y && q[2]===z) return;
  TNT_LAVAQ.push([x, y, z, 0.8 + Math.random()*2.7]);
}
BLOCK_LISTENERS.push((x,y,z,old,oldS,v,s) => {
  if(MP.role === 'client') return;
  if(v === TNT_ID){ if(_tntNearLava(x,y,z)) _tntLavaQueue(x,y,z); }                                          // TNT posée contre de la lave
  else if(FLUIDK[v] === 2){ for(const [dx,dy,dz] of _FNB) if(getB(x+dx,y+dy,z+dz) === TNT_ID) _tntLavaQueue(x+dx,y+dy,z+dz); }   // lave qui arrive contre une TNT
});

// ════════════════════════════════════════════════
// ENTITÉ AMORCÉE
// ════════════════════════════════════════════════
let _tntGeo = null, _tntFlashMat = null;
function _tntInitGfx(){
  if(_tntGeo) return;
  _tntGeo = new THREE.BoxGeometry(TNT_H, TNT_H, TNT_H);
  _tntFlashMat = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.85, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});
}

// (x,y,z) = centre de la base. o : {remote, uid, vx, vy, vz} (remote = copie d'affichage d'une TNT simulée par l'hôte)
function tntSpawn(x, y, z, fuse, o){
  if(!scene) return null;
  o = o || {};
  _tntInitGfx();
  const a = Math.random()*Math.PI*2;
  const t = {
    x, y, z, px:x, py:y, pz:z, tx:x, ty:y, tz:z,
    vx: o.vx !== undefined ? o.vx : -Math.sin(a)*0.02,   // petite impulsion vers le haut et sur le côté
    vy: o.vy !== undefined ? o.vy : 0.2,
    vz: o.vz !== undefined ? o.vz : -Math.cos(a)*0.02,
    fuse, onGround:false, remote:!!o.remote,
    uid: o.uid || ((MP.pid||'L')+'.t'+(++_tntSeq)),
    mesh:null, flash:null,
  };
  t.mesh = new THREE.Mesh(_tntGeo, blockDropMats(TNT_ID));   // mêmes matériaux que les objets au sol (lumière dynamique)
  t.flash = new THREE.Mesh(_tntGeo, _tntFlashMat); t.flash.scale.setScalar(1.02);
  t.mesh.add(t.flash);
  t.mesh.position.set(x, y+TNT_H/2, z);
  scene.add(t.mesh);
  TNTS.push(t);
  if(MP.open && !t.remote) mpOut({t:'tn', u:t.uid, x, y, z, vx:t.vx, vy:t.vy, vz:t.vz, f:fuse});
  return t;
}
function tntRemoveEnt(t){
  const i = TNTS.indexOf(t); if(i < 0) return;
  TNTS.splice(i, 1);
  scene.remove(t.mesh);
}

// Déplacement avec collisions : Y, puis X, puis Z (pas de 0,4 bloc max)
function _tntMove(t, dx, dy, dz){
  t.onGround = false;
  if(mobHit(t.x, t.y, t.z, TNT_HW, TNT_H)){ t.y += 0.1; if(t.vy < 0) t.vy = 0; return; }   // coincée dans un bloc (posé dessus) : elle remonte
  if(dy){
    const n = Math.ceil(Math.abs(dy)/0.4), sd = dy/n;
    for(let i=0;i<n;i++){
      const ny = t.y + sd;
      if(mobHit(t.x, ny, t.z, TNT_HW, TNT_H)){
        if(dy < 0){ t.y = Math.floor(ny) + 1; t.onGround = true; } else t.y = Math.floor(ny + TNT_H) - TNT_H - 1e-4;
        t.vy = 0; break;
      }
      t.y = ny;
    }
  }
  if(dx){
    const n = Math.ceil(Math.abs(dx)/0.4), sd = dx/n;
    for(let i=0;i<n;i++){ const nx = t.x + sd; if(mobHit(nx, t.y, t.z, TNT_HW, TNT_H)){ t.vx = 0; break; } t.x = nx; }
  }
  if(dz){
    const n = Math.ceil(Math.abs(dz)/0.4), sd = dz/n;
    for(let i=0;i<n;i++){ const nz = t.z + sd; if(mobHit(t.x, t.y, nz, TNT_HW, TNT_H)){ t.vz = 0; break; } t.z = nz; }
  }
}

// Un tick (1/20 s) d'une TNT simulée ici
function _tntStep(t){
  t.px = t.x; t.py = t.y; t.pz = t.z;
  t.vy -= 0.04;
  _tntMove(t, t.vx, t.vy, t.vz);
  t.vx *= 0.98; t.vy *= 0.98; t.vz *= 0.98;
  if(t.onGround){ t.vx *= 0.7; t.vz *= 0.7; t.vy *= -0.5; }
  t.fuse--;
  if(t.fuse > 0){   // les courants d'eau et de lave la poussent
    const cx = Math.floor(t.x), cy = Math.floor(t.y + TNT_H/2), cz = Math.floor(t.z), k = FLUIDK[getB(cx,cy,cz)];
    if(k){ const fv = fluidFlowVec(cx,cy,cz); if(fv){ const sc = k === 1 ? 0.014 : 0.007; t.vx += fv[0]*sc; t.vz += fv[1]*sc; } }
  }
}

function _tntTick(){
  const boom = [], lost = [], near2 = 40*40;
  for(let i=0;i<TNTS.length;i++){
    const t = TNTS[i];
    if(t.remote){ if(t.fuse > 0) t.fuse--; }
    else {
      if(!CHUNK_DATA.has(ckey(Math.floor(t.x)>>4, Math.floor(t.z)>>4))) continue;   // chunk absent : l'entité attend
      if(t.y < Y_MIN-16){ lost.push(t); continue; }                                  // tombée dans le vide : elle disparaît
      _tntStep(t);
      if(t.fuse <= 0) boom.push(t);
    }
    if((t.fuse & 1) === 0){   // fumée au-dessus de la TNT, un tick sur deux (et seulement si on la voit de près)
      const dx = t.x-P.x, dz = t.z-P.z;
      if(dx*dx+dz*dz < near2) _fxAdd(TNT_FX.smkMat, t.x, t.y+TNT_H+0.1, t.z, 0, 0.5, 0, 0.32, 0.5);
    }
  }
  for(const t of lost) tntRemoveEnt(t);
  for(const t of boom){
    tntRemoveEnt(t);
    tntExplode(t.x, t.y + 0.06, t.z, TNT_POWER, t.uid);
  }
}

// Boucle principale : ticks fixes à 20 Hz, affichage interpolé
function updateTnt(dt){
  _fxUpdate(dt);
  if(!TNTS.length && !TNT_LAVAQ.length) return;
  if(_tntAuth() && TNT_LAVAQ.length){   // lave contre une TNT
    for(let i=TNT_LAVAQ.length-1;i>=0;i--){
      const q = TNT_LAVAQ[i]; q[3] -= dt;
      if(q[3] > 0) continue;
      TNT_LAVAQ.splice(i, 1);
      if(getB(q[0],q[1],q[2]) === TNT_ID && _tntNearLava(q[0],q[1],q[2])) tntIgnite(q[0], q[1], q[2]);
    }
  }
  _tntAcc += dt;
  let n = 0;
  while(_tntAcc >= TNT_DT && n < 6){ _tntAcc -= TNT_DT; _tntTick(); n++; }
  if(n === 6) _tntAcc = 0;
  const a = _tntAcc/TNT_DT, k = Math.min(1, dt*12);
  for(const t of TNTS){
    let ix, iy, iz;
    if(t.remote){ t.x += (t.tx-t.x)*k; t.y += (t.ty-t.y)*k; t.z += (t.tz-t.z)*k; ix = t.x; iy = t.y; iz = t.z; }
    else { ix = t.px+(t.x-t.px)*a; iy = t.py+(t.y-t.py)*a; iz = t.pz+(t.z-t.pz)*a; }
    t.mesh.position.set(ix, iy+TNT_H/2, iz);
    t.flash.visible = (Math.floor(t.fuse/5) % 2) === 0;   // clignote : 5 ticks blanc, 5 ticks normal
    const q = t.fuse - a + 1;                              // gonfle pendant les 10 derniers ticks
    let sc = 1;
    if(q < 10){ let g = Math.max(0, Math.min(1, 1 - q/10)); g *= g; g *= g; sc = 1 + g*0.3; }
    t.mesh.scale.setScalar(sc);
  }
  // multijoueur : l'hôte envoie les positions 10×/s
  if(MP.open && MP.role === 'host' && MP.conns.size && TNTS.length){
    _tntSyncT += dt;
    if(_tntSyncT >= 0.1){
      _tntSyncT = 0;
      const l = [];
      for(const t of TNTS){ if(t.remote) continue; l.push([t.uid, +t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3), t.fuse]); if(l.length >= 80) break; }
      if(l.length) mpOut({t:'tu', l});
    }
  }
}

function tntReset(){
  for(const t of TNTS) scene.remove(t.mesh);
  TNTS.length = 0; TNT_LAVAQ.length = 0; _tntAcc = 0; _tntSyncT = 0;
  _fxClear();
}

// ════════════════════════════════════════════════
// EXPLOSION
// ════════════════════════════════════════════════
// Rayons : grille 16×16×16 (faces du cube seulement = 1352 rayons), pas de 0,3 bloc ; chaque rayon part avec 0,7–1,3 × la puissance
// et perd (résistance + 0,3) × 0,3 par bloc traversé et 0,225 par pas. Renvoie [x,y,z, x,y,z, …] des cases atteintes (air compris).
function tntBlastSet(cx, cy, cz, power){
  const seen = new Set(), out = [], N = 16;
  for(let i=0;i<N;i++) for(let j=0;j<N;j++) for(let k=0;k<N;k++){
    if(i !== 0 && i !== N-1 && j !== 0 && j !== N-1 && k !== 0 && k !== N-1) continue;
    let dx = i/(N-1)*2-1, dy = j/(N-1)*2-1, dz = k/(N-1)*2-1;
    const l = Math.sqrt(dx*dx+dy*dy+dz*dz);
    dx = dx/l*0.3; dy = dy/l*0.3; dz = dz/l*0.3;
    let f = power*(0.7 + Math.random()*0.6), x = cx, y = cy, z = cz;
    for(; f > 0; f -= 0.225){
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      if(by < Y_MIN || by > Y_MAX) break;
      const b = getB(bx,by,bz);
      if(b) f -= (TNT_BLAST[b] + 0.3)*0.3;
      if(f > 0){
        const kk = _tntKey(bx,by,bz);
        if(!seen.has(kk)){ seen.add(kk); out.push(bx,by,bz); }
      }
      x += dx; y += dy; z += dz;
    }
  }
  return out;
}

// Un obstacle plein entre deux points ? (l'eau et la lave ne protègent pas les entités)
function _tntClear(ax, ay, az, bx, by, bz){
  const dx = bx-ax, dy = by-ay, dz = bz-az, n = Math.max(1, Math.ceil(Math.sqrt(dx*dx+dy*dy+dz*dz)/0.2));
  for(let i=0;i<=n;i++){ const t = i/n; if(solid(ax+dx*t, ay+dy*t, az+dz*t)) return false; }
  return true;
}
// Part (0..1) de la boîte (x0..x1, y0..y1, z0..z1) visible depuis le centre de l'explosion : grille de points, comme Minecraft
function tntSeen(cx, cy, cz, x0, y0, z0, x1, y1, z1){
  const dx = 1/((x1-x0)*2+1), dy = 1/((y1-y0)*2+1), dz = 1/((z1-z0)*2+1);
  const ox = (1-Math.floor(1/dx)*dx)/2, oz = (1-Math.floor(1/dz)*dz)/2;
  let hit = 0, tot = 0;
  for(let a=0;a<=1;a+=dx) for(let b=0;b<=1;b+=dy) for(let c=0;c<=1;c+=dz){
    if(_tntClear(x0+(x1-x0)*a+ox, y0+(y1-y0)*b, z0+(z1-z0)*c+oz, cx, cy, cz)) hit++;
    tot++;
  }
  return tot ? hit/tot : 0;
}
const _tntDmg = imp => Math.floor((imp*imp+imp)/2*7*TNT_POWER*2 + 1);   // dégâts Minecraft (Normal) : jusqu'à 57 à bout portant

// Effets sur CE joueur et SES créatures (chaque participant le calcule lui-même à partir de l'événement)
function tntBlastLocal(cx, cy, cz, power){
  const R = power*2;
  if(!SV.dead && WORLD.mode !== 'spectator'){
    const dist = Math.hypot(P.x-cx, P.y-cy, P.z-cz)/R;
    if(dist <= 1){
      const ex = P.x-cx, ey = P.y+P.eyeH-cy, ez = P.z-cz, l = Math.hypot(ex,ey,ez);
      if(l > 0){
        const imp = (1-dist)*tntSeen(cx, cy, cz, P.x-EXT, P.y, P.z-EXT, P.x+EXT, P.y+1.8, P.z+EXT);
        if(imp > 0){
          svDamage(_tntDmg(imp), 'explosion', {armor:true});
          if(!(WORLD.mode === 'creative' && P.fly)){
            // recul : blocs / tick → blocs / pas physique (÷3) ; ×1,8 en horizontal pour compenser le frottement de l'air plus fort du jeu
            P.sx = (P.sx||0) + ex/l*imp/3*1.8; P.sz = (P.sz||0) + ez/l*imp/3*1.8;
            P.vy += ey/l*imp/3; P.onGround = false;
          }
        }
      }
    }
  }
  for(const m of MOBS){
    if(m.deadT >= 0) continue;
    const dist = Math.hypot(m.x-cx, m.y-cy, m.z-cz)/R;
    if(dist > 1) continue;
    const hw = m.def.w/2, ex = m.x-cx, ey = m.y+m.def.h*0.85-cy, ez = m.z-cz, l = Math.hypot(ex,ey,ez);
    if(!l) continue;
    const imp = (1-dist)*tntSeen(cx, cy, cz, m.x-hw, m.y, m.z-hw, m.x+hw, m.y+m.def.h, m.z+hw);
    if(imp <= 0) continue;
    mobDamage(m, _tntDmg(imp), {x:cx, z:cz});
    m.vx += ex/l*imp*20; m.vy += ey/l*imp*20; m.vz += ez/l*imp*20;   // blocs / s
  }
}

// Effets sur les entités gérées par l'hôte : autres TNT amorcées (poussées) et objets au sol (détruits ou projetés)
function tntBlastWorld(cx, cy, cz, power){
  const R = power*2;
  for(const t of TNTS){
    if(t.remote) continue;
    const dist = Math.hypot(t.x-cx, t.y-cy, t.z-cz)/R;
    if(dist > 1) continue;
    const ex = t.x-cx, ey = t.y-cy, ez = t.z-cz, l = Math.hypot(ex,ey,ez);
    if(!l) continue;
    const imp = (1-dist)*tntSeen(cx, cy, cz, t.x-TNT_HW, t.y, t.z-TNT_HW, t.x+TNT_HW, t.y+TNT_H, t.z+TNT_HW);
    t.vx += ex/l*imp; t.vy += ey/l*imp; t.vz += ez/l*imp;   // blocs / tick
  }
  for(let i=drops.length-1;i>=0;i--){
    const d = drops[i];
    if(d.collecting) continue;
    const dist = Math.hypot(d.wx-cx, d.wy-cy, d.wz-cz)/R;
    if(dist > 1) continue;
    const ex = d.wx-cx, ey = d.wy-cy, ez = d.wz-cz, l = Math.hypot(ex,ey,ez);
    if(!l) continue;
    const imp = (1-dist)*tntSeen(cx, cy, cz, d.wx-0.125, d.wy-0.125, d.wz-0.125, d.wx+0.125, d.wy+0.125, d.wz+0.125);
    if(imp <= 0) continue;
    if(_tntDmg(imp) >= 5){ if(MP.open) mpOut({t:'dk', u:d.uid}); removeDrop(i); }   // 5 PV : un objet ne survit pas à un coup franc
    else { d.vx += ex/l*imp*20; d.vy += ey/l*imp*20; d.vz += ez/l*imp*20; d.onGround = false; }
  }
}

// Destruction des blocs de la liste : contenu des coffres / fours, objets lâchés (1 chance sur 4), TNT voisines amorcées
function tntDestroy(list, power){
  const chance = 1/power, chain = [], n = list.length/3, pBudget = 48;
  const pProb = Math.min(1, pBudget/Math.max(1, n));
  for(let i=0;i<list.length;i+=3){
    const x = list[i], y = list[i+1], z = list[i+2];
    removeFireAt(x,y,z);
    const id = getB(x,y,z);
    if(!id) continue;
    const bd = BLOCKS[id]; if(!bd || bd.isFluid) continue;
    if(id === TNT_ID && TNTS.length + chain.length >= TNT_MAX) continue;
    const k = x+','+y+','+z; let lit = false;
    if(id === 27){   // le contenu du coffre tombe au sol
      const slots = CHESTS.get(k);
      if(slots) for(const sl of slots) if(sl.id !== null && sl.n > 0) spawnDrop(x+0.5, y+0.5, z+0.5, sl.id, sl.n);
      CHESTS.delete(k); CHEST_DIR.delete(k);
    }
    if(id === 21){   // idem pour le four ; son état disparaît avec le bloc
      const F = FURNACES.get(k);
      if(F){ lit = F.active; for(const sl of [F.input, F.fuel, F.output]) if(sl.id !== null && sl.n > 0) spawnDrop(x+0.5, y+0.5, z+0.5, sl.id, sl.n); FURNACES.delete(k); }
      if(FURNACE_CUR === k) FURNACE_CUR = null;
    }
    if(Math.random() < pProb) spawnBreakParticles(x,y,z,id);
    if(id === TNT_ID) chain.push(x,y,z);
    else {
      let dropId = (bd.drop !== undefined) ? bd.drop : id;
      if(bd.needsTier) dropId = null;
      if(dropId !== null && dropId !== undefined && Math.random() < chance) spawnDrop(x+0.5, y+0.5, z+0.5, dropId);
    }
    updateBlock(x, y, z, 0, 0, !!EMIT[id] || lit);
  }
  // une plante dont le support a sauté se détache
  for(let i=0;i<list.length;i+=3){
    const x = list[i], y = list[i+1]+1, z = list[i+2], b = getB(x,y,z);
    if(!b || !BLOCKS[b] || !BLOCKS[b].plant) continue;
    spawnBreakParticles(x,y,z,b);
    updateBlock(x, y, z, 0, 0, false);
    const ad = BLOCKS[b].drop; if(ad !== null && ad !== undefined) spawnDrop(x+0.5, y+0.5, z+0.5, ad);
  }
  // réaction en chaîne : fusible aléatoire de 10 à 29 ticks (0,5 à 1,5 s)
  for(let i=0;i<chain.length;i+=3) tntSpawn(chain[i]+0.5, chain[i+1], chain[i+2]+0.5, 10 + Math.floor(Math.random()*20));
}

// Explosion « autoritaire » (hôte / solo) en (cx,cy,cz). Les entités sont traitées AVANT la destruction des blocs (les blocs les protègent).
function tntExplode(cx, cy, cz, power, uid){
  if(MP.open) mpOut({t:'ex', x:cx, y:cy, z:cz, p:power, u:uid});
  const list = tntBlastSet(cx, cy, cz, power);
  tntBlastLocal(cx, cy, cz, power);
  tntBlastWorld(cx, cy, cz, power);
  tntFx(cx, cy, cz, power);
  tntDestroy(list, power);
}

// ════════════════════════════════════════════════
// EFFETS VISUELS — sprites animés (assets/textures/particles/explosion_N, big_smoke_N), 1 sprite = 1 particule, réserve réutilisée
// ════════════════════════════════════════════════
const TNT_FX = {ready:false, expMat:[], smkMat:[], pool:[], live:[]};
const TNT_FX_MAX = 220;
function _fxInit(){
  if(TNT_FX.ready || !scene) return;
  TNT_FX.ready = true;
  const L = new THREE.TextureLoader();
  const mk = (name, color) => {
    const t = L.load('assets/textures/particles/'+name+'.png');
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return new THREE.SpriteMaterial({map:t, color, transparent:true, depthWrite:false, fog:false});
  };
  for(let i=0;i<16;i++) TNT_FX.expMat.push(mk('explosion_'+i, 0xffffff));
  for(let i=0;i<12;i++) TNT_FX.smkMat.push(mk('big_smoke_'+i, 0x8a8a8a));
}
function _fxAdd(mats, x, y, z, vx, vy, vz, size, life, delay){
  if(!TNT_FX.ready) _fxInit();
  if(!TNT_FX.ready || TNT_FX.live.length >= TNT_FX_MAX) return;
  let s = TNT_FX.pool.pop();
  if(!s){ s = new THREE.Sprite(mats[0]); scene.add(s); }
  s.material = mats[0]; s.position.set(x,y,z); s.scale.set(size,size,1); s.visible = false;
  TNT_FX.live.push({s, mats, x, y, z, vx, vy, vz, size, age:-(delay||0), life});
}
function _fxFree(i){ const p = TNT_FX.live[i]; p.s.visible = false; TNT_FX.pool.push(p.s); TNT_FX.live.splice(i, 1); }
function _fxUpdate(dt){
  const live = TNT_FX.live;
  for(let i=live.length-1;i>=0;i--){
    const p = live[i];
    p.age += dt;
    if(p.age < 0) continue;
    if(p.age >= p.life){ _fxFree(i); continue; }
    const u = p.age/p.life, dr = Math.exp(-2.5*dt);
    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.vx *= dr; p.vy *= dr; p.vz *= dr;
    p.s.material = p.mats[Math.min(p.mats.length-1, (u*p.mats.length)|0)];
    p.s.position.set(p.x, p.y, p.z);
    const sc = p.size*(p.mats === TNT_FX.smkMat ? 1 + u*0.6 : 1);
    p.s.scale.set(sc, sc, 1);
    p.s.visible = true;
  }
}
function _fxClear(){ for(let i=TNT_FX.live.length-1;i>=0;i--) _fxFree(i); }

// Boule de feu (8 ticks × 3 sprites autour du centre) + nuage de fumée projeté vers l'extérieur
function tntFx(cx, cy, cz, power){
  _fxInit();
  for(let tick=0;tick<8;tick++) for(let j=0;j<3;j++){
    const p = tick/8;
    _fxAdd(TNT_FX.expMat,
      cx+(Math.random()-Math.random())*power, cy+(Math.random()-Math.random())*power*0.8, cz+(Math.random()-Math.random())*power,
      0, 0, 0, (3.4+Math.random()*1.6)*(1-p*0.5), 0.3+Math.random()*0.2, tick*TNT_DT);
  }
  for(let i=0;i<28;i++){
    let dx = Math.random()-0.5, dy = Math.random()-0.35, dz = Math.random()-0.5;
    const l = Math.hypot(dx,dy,dz) || 1, sp = 2+Math.random()*5;
    dx = dx/l; dy = dy/l; dz = dz/l;
    const r = Math.random()*power*0.6;
    _fxAdd(TNT_FX.smkMat, cx+dx*r, cy+dy*r, cz+dz*r, dx*sp, dy*sp+0.8, dz*sp, 0.8+Math.random()*0.7, 0.6+Math.random()*0.6, Math.random()*0.15);
  }
}

// ════════════════════════════════════════════════
// MULTIJOUEUR (voir aussi network.js : routage des messages 'ti', 'tn', 'tu', 'ex')
// ════════════════════════════════════════════════
const _fin = (...a) => a.every(Number.isFinite);
function mpTntReq(m){   // hôte : un client a allumé une TNT
  if(MP.role !== 'host') return;
  const x = m.x|0, y = m.y|0, z = m.z|0;
  if(getB(x,y,z) === TNT_ID) tntIgnite(x, y, z);
}
function mpTntSpawn(m){   // client : une TNT vient d'être amorcée
  if(MP.role !== 'client' || !gameOn || TNTS.length >= TNT_MAX || TNTS.some(t => t.uid === m.u)) return;
  const x = +m.x, y = +m.y, z = +m.z; if(!_fin(x,y,z)) return;
  tntSpawn(x, y, z, m.f|0, {remote:true, uid:String(m.u), vx:+m.vx||0, vy:+m.vy||0, vz:+m.vz||0});
}
function mpTntUpdate(m){   // client : positions et fusibles envoyés par l'hôte
  if(MP.role !== 'client' || !Array.isArray(m.l)) return;
  const by = new Map(); for(const t of TNTS) by.set(t.uid, t);
  for(const a of m.l){
    const t = by.get(a[0]); if(!t) continue;
    const x = +a[1], y = +a[2], z = +a[3]; if(!_fin(x,y,z)) continue;
    t.tx = x; t.ty = y; t.tz = z; t.fuse = a[4]|0;
  }
}
function mpTntBoom(m){   // client : explosion → l'entité disparaît, effets + dégâts locaux (les blocs arrivent par le journal normal)
  if(MP.role !== 'client' || !gameOn) return;
  const x = +m.x, y = +m.y, z = +m.z, p = +m.p || TNT_POWER; if(!_fin(x,y,z)) return;
  const t = TNTS.find(e => e.uid === m.u); if(t) tntRemoveEnt(t);
  tntBlastLocal(x, y, z, p);
  tntFx(x, y, z, p);
}
