'use strict';

// ════════════════════════════════════════════════
// FLUIDES — eau et lave : simulation, courant, réactions, seaux
// ════════════════════════════════════════════════
// Modèle (automate cellulaire sur Z³, un fluide par case) :
//   · niveau N ∈ [0,7] (7 = SOURCE). État de bloc (data/block-states.js) : level = N, falling = vrai pour un fluide qui tombe.
//     Source ⇔ état 0. « Quantité » A = N+1 ∈ [1,8] ; un fluide qui tombe vaut A = 8 (visuellement plein, jamais une source).
//   · un bloc dérivé prend N = N_voisin_max − décroissance (eau : 1 → 8 blocs en tout ; lave du monde normal : 2 → 4 blocs en tout) ;
//     sans voisin assez fort il disparaît d'un cran à chaque tick (le fluide « se retire » quand la source est ôtée).
//   · chute : un fluide s'écoule d'abord vers le bas. Sinon (ou s'il est une source) il s'étend dans les 4 directions cardinales ;
//     s'il existe un trou à ≤ 1+SLOPE blocs (eau 4 → rayon 5), il ne va QUE vers le trou le plus proche.
//   · eau : 2 sources voisines (plan horizontal) + sol plein (ou source) dessous → nouvelle source (sources infinies).
//   · lave : eau au-dessus ou sur un côté → lave source = obsidienne ; lave dérivée + eau source = pierre ; lave dérivée + eau dérivée = pavé.
//     Lave qui tombe dans l'eau → pierre.
//   · cadence : tick de jeu = 50 ms ; eau = 5 ticks entre deux étapes, lave = 30 ticks (monde normal).
// Seul l'hôte (ou le solo) simule ; chaque case modifiée est un setB ordinaire → sauvegarde et multijoueur n'ont rien de spécial à faire.
const FLUID_DEF = {
  1: {name:'water', delay:5,  decay:1, slope:4, infinite:true},
  2: {name:'lava',  delay:30, decay:2, slope:2, infinite:false},   // Nether (absent du jeu) : delay 10, decay 1, slope 4
};
const FLUID_ID  = {1:23, 2:BID('lava')};
const OBSIDIAN_ID = BID('obsidian'), STONE_ID = BID('stone'), COBBLE_ID = BID('cobblestone');
const FLUID_MAX_PER_TICK = 500;   // cases traitées par tick de jeu (le reste est reporté au tick suivant)
const FLUID_DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const FLUID_FLOW_PUSH = 0.011;    // vitesse (blocs / pas physique de 1/60 s) ajoutée par le courant à un joueur

const fB = (x,y,z) => y < Y_MIN ? 10 : getB(x,y,z);                       // sous le monde : comme de la bedrock (le fluide ne s'écoule pas dans le vide)
const fAmt = s => (s & 8) ? 8 : 8 - (s & 7);                              // quantité A d'un état
const fRepl = b => !!(BLOCKS[b] && BLOCKS[b].noCollide && !BLOCKS[b].isFluid && !BLOCKS[b].portal);   // plantes, torche, stalactites… : remplacés (et lâchés) par un fluide
const fSolidSrc = b => !!(b && BLOCKS[b] && !BLOCKS[b].noCollide);        // « bloc plein » pour créer une source infinie

// ── Planificateur : file de ticks par date d'échéance (clé numérique x,y,z → plus de chaînes) ──
const FK_OFF = 1 << 21;
let FTICK = 0, fAcc = 0;
const FBUCKETS = new Map(), FDUE = new Map();
const fKey = (x,y,z) => ((x+FK_OFF)*4194304 + (z+FK_OFF))*256 + (y+Y_OFF);
function fUnkey(k){ const y = k % 256 - Y_OFF; k = Math.floor(k/256); const z = k % 4194304 - FK_OFF, x = Math.floor(k/4194304) - FK_OFF; return [x,y,z]; }
function fSchedKey(key, delay){
  const due = FTICK + Math.max(1, delay), cur = FDUE.get(key);
  if(cur !== undefined){ if(cur <= due) return; const ob = FBUCKETS.get(cur); if(ob) ob.delete(key); }
  FDUE.set(key, due);
  let b = FBUCKETS.get(due); if(!b){ b = new Set(); FBUCKETS.set(due, b); }
  b.add(key);
}
function fluidSchedule(x,y,z,delay){
  if(y < Y_MIN || y > Y_MAX || x >= FK_OFF || x < -FK_OFF || z >= FK_OFF || z < -FK_OFF) return;
  fSchedKey(fKey(x,y,z), delay);
}
function fluidReset(){ FBUCKETS.clear(); FDUE.clear(); fAcc = 0; }

// Un bloc change (pose, casse, fluide…) : la case et ses 6 voisines fluides doivent être ré-évaluées ; une lave voisine d'une eau réagit tout de suite
const _N6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
BLOCK_LISTENERS.push((x,y,z,old,oldS,v,s) => {
  if(MP.role === 'client') return;
  const kv = FLUIDK[v];
  if(kv) fluidSchedule(x,y,z, FLUID_DEF[kv].delay);
  for(let i=0;i<6;i++){
    const nx = x+_N6[i][0], ny = y+_N6[i][1], nz = z+_N6[i][2];
    if(ny < Y_MIN || ny > Y_MAX) continue;
    const kn = FLUIDK[getB(nx,ny,nz)];
    if(!kn) continue;
    fluidSchedule(nx,ny,nz, (kn === 2 && kv === 1) ? 1 : FLUID_DEF[kn].delay);
    if(kv === 2 && kn === 1) fluidSchedule(x,y,z,1);   // lave qui apparaît contre de l'eau : réaction immédiate
  }
});

// ── Écriture d'une case (setB + reconstruction du mesh) ──
function fluidSet(x,y,z,id,s){
  const old = getB(x,y,z);
  if(setB(x,y,z,id,s)) markDirty(x,y,z, !!(EMIT[old] || EMIT[id]));
}

// ── État que devrait avoir une case de fluide dérivée (-1 = elle doit disparaître) ──
function fluidNewState(x,y,z,K){
  let maxA = 0, src = 0;
  for(const [dx,dz] of FLUID_DIRS){
    if(FLUIDK[fB(x+dx,y,z+dz)] !== K) continue;
    const s = getS(x+dx,y,z+dz), A = fAmt(s);
    if(s === 0) src++;
    if(A > maxA) maxA = A;
  }
  if(FLUID_DEF[K].infinite && src >= 2){   // source infinie : 2 sources voisines + sol plein (ou source) dessous
    const bb = fB(x,y-1,z);
    if(fSolidSrc(bb) || (FLUIDK[bb] === K && getS(x,y-1,z) === 0)) return 0;
  }
  if(FLUIDK[fB(x,y+1,z)] === K) return 8;   // fluide au-dessus → il tombe : N = 7, falling
  const A = maxA - FLUID_DEF[K].decay;
  return A <= 0 ? -1 : 8 - A;
}

// ── Réactions eau + lave ──
function lavaReact(x,y,z){
  let water = false, waterSrc = false;
  for(const [dx,dy,dz] of [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){   // dessus et côtés (pas dessous)
    if(FLUIDK[fB(x+dx,y+dy,z+dz)] === 1){ water = true; if(getS(x+dx,y+dy,z+dz) === 0) waterSrc = true; }
  }
  if(!water) return false;
  const lavaSrc = getS(x,y,z) === 0;
  fluidSet(x,y,z, lavaSrc ? OBSIDIAN_ID : waterSrc ? STONE_ID : COBBLE_ID, 0);
  return true;
}

// ── Propagation ──
// case où le fluide K peut se poser latéralement : air, plante, ou fluide K dérivé (jamais une source)
function fPassable(x,y,z,K){
  const b = fB(x,y,z); if(b === 0) return true;
  const kk = FLUIDK[b]; if(kk) return kk === K && getS(x,y,z) !== 0;
  return fRepl(b);
}
// la case (x,y,z) peut recevoir du fluide venant d'en haut (= « trou » pour la case qui est au-dessus)
function fCanFallTo(x,y,z,K){ const b = fB(x,y,z); return b === 0 || FLUIDK[b] === K || fRepl(b); }
// distance jusqu'au trou le plus proche (≤ max) en partant de (x,y,z) sans revenir vers excl ; 1000 = aucun
function fSlope(x,y,z,dist,excl,K,max){
  let best = 1000;
  for(let d=0; d<4; d++){
    if(d === excl) continue;
    const nx = x+FLUID_DIRS[d][0], nz = z+FLUID_DIRS[d][1];
    if(!fPassable(nx,y,nz,K)) continue;
    if(fCanFallTo(nx,y-1,nz,K)) return dist;
    if(dist < max){ const j = fSlope(nx,y,nz,dist+1,d^1,K,max); if(j < best) best = j; }
  }
  return best;
}
function fDropReplaced(x,y,z,b){
  if(b && fRepl(b)){ const dr = BLOCKS[b].drop; if(dr !== null && dr !== undefined) spawnDrop(x+0.5,y+0.5,z+0.5,dr); }
  if(typeof removeFireAt === 'function') removeFireAt(x,y,z);
}
function fFlowSide(x,y,z,K,ns){
  const b = fB(x,y,z);
  if(b !== 0){
    if(FLUIDK[b] === K){ const es = getS(x,y,z); if(es === 0 || fAmt(ns) <= fAmt(es)) return; }
    else if(FLUIDK[b] || !fRepl(b)) return;
  }
  fDropReplaced(x,y,z,b);
  fluidSet(x,y,z,FLUID_ID[K],ns);
}
function fSides(x,y,z,K,s){
  const F = FLUID_DEF[K];
  let i = fAmt(s) - F.decay; if(s & 8) i = 7;          // un fluide qui tombe et se pose repart avec une quantité de 7
  if(i <= 0) return;
  const ns = 8 - i;
  let best = 1000, chosen = [];
  for(let d=0; d<4; d++){
    const nx = x+FLUID_DIRS[d][0], nz = z+FLUID_DIRS[d][1];
    if(!fPassable(nx,y,nz,K)) continue;
    const j = fCanFallTo(nx,y-1,nz,K) ? 0 : fSlope(nx,y,nz,1,d^1,K,F.slope);
    if(j < best){ chosen = []; best = j; }
    if(j <= best) chosen.push(d);
  }
  for(const d of chosen) fFlowSide(x+FLUID_DIRS[d][0], y, z+FLUID_DIRS[d][1], K, ns);
}
function fCanFlowDown(x,y,z,K){   // (x,y,z) = case du dessous
  const b = fB(x,y,z); if(b === 0) return true;
  const kk = FLUIDK[b];
  if(kk === K){ const es = getS(x,y,z); return es !== 0 && !(es & 8); }
  if(K === 2 && kk === 1) return true;                  // lave qui tombe dans l'eau
  if(kk) return false;
  return fRepl(b);
}
function fSpread(x,y,z,K,s){
  if(fCanFlowDown(x,y-1,z,K)){
    const b = fB(x,y-1,z);
    if(K === 2 && FLUIDK[b] === 1) fluidSet(x,y-1,z,STONE_ID,0);   // lave + eau : pierre
    else { fDropReplaced(x,y-1,z,b); fluidSet(x,y-1,z,FLUID_ID[K],8); }
    let n = 0; for(const [dx,dz] of FLUID_DIRS) if(FLUIDK[fB(x+dx,y,z+dz)] === K && getS(x+dx,y,z+dz) === 0) n++;
    if(n >= 3) fSides(x,y,z,K,s);
  } else if(s === 0 || !fCanFallTo(x,y-1,z,K)) fSides(x,y,z,K,s);
}

function fluidTick(x,y,z){
  const id = getB(x,y,z), K = FLUIDK[id]; if(!K) return;
  if(K === 2 && lavaReact(x,y,z)) return;
  let s = getS(x,y,z);
  if(s !== 0){
    const ns = fluidNewState(x,y,z,K);
    if(ns < 0){ fluidSet(x,y,z,0,0); return; }
    if(ns !== s){ fluidSet(x,y,z,id,ns); s = ns; }
  }
  fSpread(x,y,z,K,s);
}

function fluidRunTick(){
  FTICK++;
  const b = FBUCKETS.get(FTICK); if(!b) return;
  FBUCKETS.delete(FTICK);
  const pcx = Math.floor(P.x/CSIZ), pcz = Math.floor(P.z/CSIZ), R2 = Math.max(6, S.renderDist||8) + 1;
  let n = 0;
  for(const key of b){
    if(FDUE.get(key) !== FTICK) continue;
    FDUE.delete(key);
    if(n >= FLUID_MAX_PER_TICK){ fSchedKey(key, 1); continue; }
    const [x,y,z] = fUnkey(key);
    if(Math.abs((x>>4)-pcx) > R2 || Math.abs((z>>4)-pcz) > R2){ fSchedKey(key, 100); continue; }   // trop loin du joueur : on attend (pas de génération de terrain pour rien)
    n++;
    fluidTick(x,y,z);
  }
}
// Appelé à chaque frame par la boucle principale
function updateFluids(dt){
  if(!gameOn || MP.role === 'client') return;
  fAcc += dt;
  let n = 0;
  while(fAcc >= 0.05 && n < 4){ fAcc -= 0.05; fluidRunTick(); n++; }
  if(n === 4) fAcc = 0;
}
function updateFluidVisuals(){ updateFluidTextures(performance.now()); updateFluidOverlay(); }

// ════════════════════════════════════════════════
// LECTURE DES FLUIDES (physique, rendu de la caméra, objets, créatures)
// ════════════════════════════════════════════════
// Hauteur de surface (0..1) du fluide à cette case ; -1 s'il n'y en a pas
function fluidHeightAt(x,y,z){
  const K = FLUIDK[getB(x,y,z)]; if(!K) return -1;
  if(FLUIDK[getB(x,y+1,z)] === K) return 1;
  const s = getS(x,y,z);
  return (s & 8) ? 1 : (8 - (s & 7)) / 8;
}
// Vrai si le point (px,py,pz) est dans un fluide de type K (sous sa surface)
function inFluidAt(px,py,pz,K){
  const x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  if(FLUIDK[getB(x,y,z)] !== K) return false;
  return (py - y) < fluidHeightAt(x,y,z);
}
function fluidKindAtEye(){
  const x = Math.floor(P.x), z = Math.floor(P.z), ey = P.y + P.eyeH, y = Math.floor(ey);
  const K = FLUIDK[getB(x,y,z)]; if(!K) return 0;
  return (ey - y) < fluidHeightAt(x,y,z) ? K : 0;
}
// Vecteur de courant unitaire [vx,vz] à cette case (gradient des niveaux vers les voisins plus bas, attiré par les chutes) ; null si calme
function fluidFlowVec(x,y,z){
  const K = FLUIDK[getB(x,y,z)]; if(!K) return null;
  const hs = fluidHeightAt(x,y,z); let vx = 0, vz = 0;
  for(const [dx,dz] of FLUID_DIRS){
    const nx = x+dx, nz = z+dz, bn = getB(nx,y,nz); let g = 0;
    if(FLUIDK[bn] === K){ const hn = fluidHeightAt(nx,y,nz); if(hn > 0) g = hs - hn; }
    else if(!FLUIDK[bn] && !(BLOCKS[bn] && !BLOCKS[bn].noCollide)){   // case vide à côté : on suit le fluide qui est dessous (chute = attraction maximale)
      if(FLUIDK[getB(nx,y-1,nz)] === K){ const hb = fluidHeightAt(nx,y-1,nz); if(hb > 0) g = hs - (hb - 0.8888889); }
    }
    if(g){ vx += dx*g; vz += dz*g; }
  }
  const l = Math.hypot(vx,vz);
  return l < 1e-6 ? null : [vx/l, vz/l];
}

// ════════════════════════════════════════════════
// SEAUX
// ════════════════════════════════════════════════
const BUCKET_FULL = {water:'water_bucket', lava:'lava_bucket'};
const isBucketItem = id => id === 'bucket' || id === 'water_bucket' || id === 'lava_bucket';

// Clic droit avec un seau. Renvoie true si le clic est consommé (sinon doPlace poursuit : ouvrir un établi, etc.)
function useBucket(it){
  const creative = WORLD.mode === 'creative';
  if(it.id === 'bucket'){   // seau vide : ramasse la SOURCE visée (les fluides dérivés sont traversés par le rayon)
    const t = castRay(6, true); if(!t) return false;
    const bd = BLOCKS[t.bid]; if(!bd || !bd.isFluid) return false;
    const kind = bd.fluid, full = BUCKET_FULL[kind];
    setB(t.bx,t.by,t.bz,0); markDirty(t.bx,t.by,t.bz, kind === 'lava');
    if(!creative){
      if(it.n > 1){ it.n--; if(addInv(full,1) > 0) spawnDrop(P.x, P.y+1, P.z, full); }
      else { it.id = full; it.n = 1; }
    }
    drawHotbar();
    return true;
  }
  const kind = it.id === 'water_bucket' ? 'water' : 'lava', K = kind === 'water' ? 1 : 2;
  const t = castRay(); if(!t) return false;
  const bt = BLOCKS[t.bid]; if(bt && (bt.isCraft || bt.isFurnace || bt.isChest)) return false;   // un bloc interactif prime
  const tp = !!(bt && bt.plant);                                                                    // viser une plante : on la remplace
  const px = tp ? t.bx : t.pbx, py = tp ? t.by : t.pby, pz = tp ? t.bz : t.pbz;
  if(py < Y_MIN || py > Y_MAX) return true;
  const cur = getB(px,py,pz), kc = FLUIDK[cur];
  if(cur !== 0 && !kc && !fRepl(cur)) return true;                // case occupée par un bloc plein : rien ne se passe
  if(kc === K && getS(px,py,pz) === 0) return true;               // déjà une source du même fluide
  if(K === 1 && kc === 2){                                        // eau versée dans la lave : obsidienne (lave source) ou pierre (lave dérivée)
    setB(px,py,pz, getS(px,py,pz) === 0 ? OBSIDIAN_ID : STONE_ID, 0); markDirty(px,py,pz,true);
  } else {
    fDropReplaced(px,py,pz,cur);
    setB(px,py,pz,FLUID_ID[K],0); markDirty(px,py,pz, K === 2 || kc === 2);
  }
  if(!creative){
    if(it.n > 1){ it.n--; if(addInv('bucket',1) > 0) spawnDrop(P.x, P.y+1, P.z, 'bucket'); }
    else { it.id = 'bucket'; it.n = 1; }
  }
  drawHotbar();
  return true;
}
