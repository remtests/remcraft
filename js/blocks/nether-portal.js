'use strict';

// ════════════════════════════════════════════════
// PORTAIL DU NETHER — activation et cohérence du cadre
// ════════════════════════════════════════════════
// Volontairement LIMITÉ au bloc : pas de dimension, pas de téléportation, pas de voile d'écran, pas de particules ni de sons.
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
const _pQ = [], _PN6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
let _pBusy = false;
BLOCK_LISTENERS.push((x,y,z,old,oldS,v,s) => {
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
