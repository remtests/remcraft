'use strict';

// ════════════════════════════════════════════════
// PORTAIL DU NETHER — activation et cohérence du cadre
// ════════════════════════════════════════════════
// Contenu : le bloc (activation, cohérence du cadre) et la téléportation Overworld ↔ Nether (liaison des portails, voile violet).
// Pas de particules ni de sons. La dimension Nether est provisoire : une couche de netherrack (js/world/dimensions.js pour la mécanique de dimensions).
//  - Activation : briquet (clic droit) sur un cadre d'obsidienne complet → l'intérieur se remplit de blocs `nether_portal` (état axis selon l'orientation du cadre).
//  - Cohérence : si un bloc du cadre (ou un bloc du portail) disparaît, tout le portail connecté disparaît, comme dans Minecraft.
// Un portail posé à la main (/setblock, /fill) reste tel quel tant qu'aucun voisin ne disparaît : pratique pour tester le rendu sans cadre.
// Rendu : render/portal-render.js. États : data/block-states.js. Éclairage : niveau 11 (flag emit du bloc).
const PORTAL_ID = BID('nether_portal'), PORTAL_FRAME_ID = BID('obsidian');
const PORTAL_MIN_W = 2, PORTAL_MAX_W = 21, PORTAL_MIN_H = 3, PORTAL_MAX_H = 21;   // intérieur du cadre, en blocs (les 4 coins du cadre ne sont pas exigés)

const _pAir = (x,y,z) => getB(x,y,z) === 0;
const _pObs = (x,y,z) => getB(x,y,z) === PORTAL_FRAME_ID;

// Cadre d'obsidienne contenant la case d'air (x,y,z), dans le plan d'axe `axis` ('x' : largeur le long de X ; 'z' : le long de Z).
// Renvoie {axis, x, y, z (coin bas de l'intérieur côté −axe), w, h, dx, dz} ou null.
function portalFrameAt(x, y, z, axis){
  const dx = axis === 'x' ? 1 : 0, dz = axis === 'z' ? 1 : 0;
  if(!_pAir(x,y,z)) return null;
  // 1. descendre jusqu'à l'obsidienne du bas
  let y0 = y, n = 0;
  while(_pAir(x,y0-1,z)){ y0--; if(++n > PORTAL_MAX_H) return null; }
  if(!_pObs(x,y0-1,z)) return null;
  // 2. largeur de la rangée du bas : des cases d'air posées sur de l'obsidienne, bornées de chaque côté par un montant d'obsidienne
  let l = 0, r = 0;
  while(_pAir(x-dx*(l+1),y0,z-dz*(l+1)) && _pObs(x-dx*(l+1),y0-1,z-dz*(l+1))){ if(++l >= PORTAL_MAX_W) return null; }
  while(_pAir(x+dx*(r+1),y0,z+dz*(r+1)) && _pObs(x+dx*(r+1),y0-1,z+dz*(r+1))){ if(++r >= PORTAL_MAX_W) return null; }
  if(!_pObs(x-dx*(l+1),y0,z-dz*(l+1)) || !_pObs(x+dx*(r+1),y0,z+dz*(r+1))) return null;
  const w = l+r+1;
  if(w < PORTAL_MIN_W || w > PORTAL_MAX_W) return null;
  const xl = x-dx*l, zl = z-dz*l;
  // 3. hauteur : rangées d'air entre deux montants, jusqu'à une rangée entièrement d'obsidienne
  for(let h = 0; h <= PORTAL_MAX_H; h++){
    const yy = y0+h;
    let air = 0, obs = 0;
    for(let i = 0; i < w; i++){ const b = getB(xl+dx*i, yy, zl+dz*i); if(b === 0) air++; else if(b === PORTAL_FRAME_ID) obs++; }
    if(obs === w) return h >= PORTAL_MIN_H ? {axis, x:xl, y:y0, z:zl, w, h, dx, dz} : null;   // linteau
    if(air !== w) return null;                                                                   // autre chose que de l'air dans le cadre
    if(!_pObs(xl-dx,yy,zl-dz) || !_pObs(xl+dx*w,yy,zl+dz*w)) return null;                      // montants
  }
  return null;
}

// Remplit l'intérieur d'un cadre de blocs de portail
function portalFill(fr){
  const st = BS.encode(PORTAL_ID, {axis: fr.axis});
  for(let j = 0; j < fr.h; j++) for(let i = 0; i < fr.w; i++){
    const px = fr.x+fr.dx*i, py = fr.y+j, pz = fr.z+fr.dz*i;
    removeFireAt(px,py,pz);                       // une flamme dans le cadre s'éteint
    updateBlock(px,py,pz, PORTAL_ID, st, true);   // true : l'éclairage (niveau 11) est recalculé
  }
}

// Briquet utilisé sur la case d'air (x,y,z) : allume le portail si elle est dans un cadre complet (renvoie true) ; sinon false (le feu se pose normalement)
function lightPortalAt(x, y, z){
  if(y < Y_MIN || y > Y_MAX) return false;
  const fr = portalFrameAt(x,y,z,'x') || portalFrameAt(x,y,z,'z');
  if(!fr) return false;
  portalFill(fr);
  return true;
}

// ── Cohérence : un portail ne survit que contre de l'obsidienne ou d'autres blocs de portail (au-dessus, en dessous et le long de son plan) ──
function portalSupported(x, y, z){
  const dx = BS.get(PORTAL_ID, getS(x,y,z), 'axis') === 'x' ? 1 : 0, dz = 1-dx;
  const ok = (a,b,c) => { const v = getB(a,b,c); return v === PORTAL_ID || v === PORTAL_FRAME_ID; };
  return ok(x,y+1,z) && ok(x,y-1,z) && ok(x+dx,y,z+dz) && ok(x-dx,y,z-dz);
}
let PORTAL_CELLS = new Map();   // « x,y,z » → [x,y,z] : blocs de portail connus de la dimension liée (se remplit via setB, donc aussi au chargement d'une sauvegarde)
const _pQ = [], _PN6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
let _pBusy = false;
BLOCK_LISTENERS.push((x,y,z,old,oldS,v,s) => {
  if(v === PORTAL_ID && old !== PORTAL_ID) PORTAL_CELLS.set(x+','+y+','+z, [x,y,z]);          // registre pour la recherche d'un portail d'arrivée
  else if(old === PORTAL_ID && v !== PORTAL_ID) PORTAL_CELLS.delete(x+','+y+','+z);
  if(old === v || v === PORTAL_ID) return;   // simple changement d'état, ou portail posé : rien à vérifier
  for(const [a,b,c] of _PN6) if(getB(x+a,y+b,z+c) === PORTAL_ID) _pQ.push(x+a,y+b,z+c);
  if(_pBusy || !_pQ.length) return;
  _pBusy = true;   // les retraits ci-dessous redéclenchent cet écouteur : ils ne font qu'alimenter la file (pas de récursion profonde)
  try{
    while(_pQ.length){
      const z2 = _pQ.pop(), y2 = _pQ.pop(), x2 = _pQ.pop();
      if(getB(x2,y2,z2) === PORTAL_ID && !portalSupported(x2,y2,z2)) updateBlock(x2,y2,z2, 0, 0, true);
    }
  } finally { _pBusy = false; }
});

// ════════════════════════════════════════════════
// TÉLÉPORTATION OVERWORLD ↔ NETHER
// ════════════════════════════════════════════════
// Rester ~4 s dans un portail (instantané en créatif) → arrivée dans l'autre dimension, à l'échelle 1:8 (1 bloc du Nether = 8 blocs de l'Overworld).
// Destination : le portail existant le plus proche (rayon 16 vers le Nether, 128 vers l'Overworld), sinon un portail neuf (cadre 4×5, plateforme d'obsidienne).
// Après l'arrivée on est dans un portail : il faut en sortir avant de pouvoir le reprendre.
const PORTAL_DELAY = 4;                                  // secondes à passer dans le portail (survie)
const PORTAL_SCALE = 8;                                  // échelle Overworld / Nether
const PORTAL_RANGE_NETHER = 16, PORTAL_RANGE_OVERWORLD = 128;   // rayons de recherche d'un portail existant, en blocs du monde de destination
let _ptT = 0, _ptLock = false, _ptFade = 0, _ptEl = null;

// Position d'arrivée correspondante (x, z) dans l'autre monde
function portalDestination(x, z, toNether){
  return toNether ? {x: Math.floor(x/PORTAL_SCALE), z: Math.floor(z/PORTAL_SCALE)} : {x: Math.floor(x*PORTAL_SCALE), z: Math.floor(z*PORTAL_SCALE)};
}

// Bloc de portail dont la fine plaque (4/16 d'épaisseur, comme le rendu) touche le joueur, ou null
function portalCellAtPlayer(){
  const x0 = Math.floor(P.x-EXT), x1 = Math.floor(P.x+EXT), z0 = Math.floor(P.z-EXT), z1 = Math.floor(P.z+EXT);
  for(let y = Math.floor(P.y); y <= Math.floor(P.y+1.79); y++)
    for(let x = x0; x <= x1; x++) for(let z = z0; z <= z1; z++){
      if(getB(x,y,z) !== PORTAL_ID) continue;
      const axis = BS.get(PORTAL_ID, getS(x,y,z), 'axis');
      const ax0 = axis === 'x' ? x : x+PORTAL_T0, ax1 = axis === 'x' ? x+1 : x+PORTAL_T1;
      const az0 = axis === 'x' ? z+PORTAL_T0 : z, az1 = axis === 'x' ? z+PORTAL_T1 : z+1;
      if(P.x+EXT > ax0 && P.x-EXT < ax1 && P.z+EXT > az0 && P.z-EXT < az1) return {x, y, z, axis};
    }
  return null;
}

// Portail connu le plus proche de (tx,tz), dans la dimension liée et le rayon donné : {x,y,z,axis} (case du bas du portail) ou null
function portalFind(tx, tz, range){
  let best = null, bd = Infinity;
  for(const [k, c] of PORTAL_CELLS){
    const d = (c[0]-tx)*(c[0]-tx) + (c[2]-tz)*(c[2]-tz);
    if(d > range*range || d > bd || (d === bd && best && c[1] >= best[1])) continue;
    if(getB(c[0],c[1],c[2]) !== PORTAL_ID){ PORTAL_CELLS.delete(k); continue; }   // vestige (monde précédent…)
    best = c; bd = d;
  }
  if(!best) return null;
  let [x,y,z] = best;
  while(getB(x,y-1,z) === PORTAL_ID) y--;
  return {x, y, z, axis: BS.get(PORTAL_ID, getS(x,y,z), 'axis')};
}

// Sol de l'Overworld en (x,z) : premier bloc plein en descendant (plantes, feuilles et troncs ignorés ; la surface de l'eau compte)
function portalGroundY(x, z){
  for(let y = Y_MAX-6; y > Y_MIN; y--){
    const b = getB(x,y,z);
    if(!b) continue;
    const d = BLOCKS[b];
    if(d && ((d.noCollide && !d.isFluid) || d.leaves || d.log)) continue;
    return y;
  }
  return 63;
}

// Construit un portail neuf dont la case intérieure du bas est (ox,oy,oz) : plateforme d'obsidienne 4×3, espace dégagé, cadre 4×5 (intérieur 2×3), allumage
function portalBuild(ox, oy, oz, axis){
  const dx = axis === 'x' ? 1 : 0, dz = 1 - dx;
  const at = (i,k) => [ox + dx*i + dz*k, oz + dz*i + dx*k];   // i : le long du portail, k : en profondeur
  for(let i = -1; i <= 2; i++) for(let k = -1; k <= 1; k++){
    const [x,z] = at(i,k);
    updateBlock(x, oy-1, z, PORTAL_FRAME_ID, 0, true);
    for(let j = 0; j <= 3; j++) updateBlock(x, oy+j, z, 0, 0, true);
  }
  for(let j = 0; j <= 2; j++) for(const i of [-1,2]){ const [x,z] = at(i,0); updateBlock(x, oy+j, z, PORTAL_FRAME_ID, 0, true); }
  for(const i of [0,1]){ const [x,z] = at(i,0); updateBlock(x, oy+3, z, PORTAL_FRAME_ID, 0, true); }
  const fr = portalFrameAt(ox, oy, oz, axis);
  if(fr) portalFill(fr);
  return {x: ox, y: oy, z: oz, axis};
}

// Téléporte le joueur ; c = bloc de portail qu'il occupe
function portalTravel(c){
  const toNether = !inNether();
  const d = portalDestination(P.x, P.z, toNether);
  dimSwitch(toNether ? 'nether' : 'overworld');   // à partir d'ici, getB / setB / portalFind… parlent de la dimension d'arrivée
  let dest = portalFind(d.x, d.z, toNether ? PORTAL_RANGE_NETHER : PORTAL_RANGE_OVERWORLD);
  if(!dest) dest = portalBuild(d.x, (toNether ? NETHER_FLOOR_Y : portalGroundY(d.x, d.z)) + 1, d.z, c.axis);
  P.x = dest.x + 0.5; P.z = dest.z + 0.5; P.y = dest.y + 0.01;
  P.px = P.x; P.py = P.y; P.pz = P.z; P.vx = P.vy = P.vz = 0; P.sx = P.sz = 0;
  SV.fall = 0;
  const pcx = Math.floor(P.x/CSIZ), pcz = Math.floor(P.z/CSIZ);
  for(let dx = -2; dx <= 2; dx++) for(let dz = -2; dz <= 2; dz++) buildChunkMesh(pcx+dx, pcz+dz);   // pas de trou à l'arrivée
  updateVisibleChunks(true);
}

// Appelé à chaque frame (main-loop.js) : attente dans le portail, voile violet, téléportation
function updatePortalTravel(dt){
  if(!_ptEl){
    _ptEl = document.createElement('div');
    _ptEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:95;display:none;background:radial-gradient(ellipse at center,rgba(140,60,220,0.2) 0%,rgba(80,20,170,0.9) 100%);';
    document.body.appendChild(_ptEl);
  }
  const need = WORLD.mode === 'creative' ? 0 : PORTAL_DELAY;
  const c = SV.dead ? null : portalCellAtPlayer();
  if(c){
    if(!_ptLock){
      _ptT += dt;
      if(_ptT >= need){ _ptT = 0; _ptLock = true; _ptFade = 1; portalTravel(c); }
    }
  } else { _ptLock = false; _ptT = Math.max(0, _ptT - dt*2); }
  _ptFade = Math.max(0, _ptFade - dt*1.2);
  const o = Math.max(need > 0 ? Math.min(1, _ptT/need)*0.75 : 0, _ptFade*0.75);
  if(o > 0.005){ _ptEl.style.display = 'block'; _ptEl.style.opacity = o.toFixed(3); } else if(_ptEl.style.display !== 'none') _ptEl.style.display = 'none';
}
