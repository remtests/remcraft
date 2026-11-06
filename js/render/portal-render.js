'use strict';

// ════════════════════════════════════════════════
// RENDU DU PORTAIL DU NETHER — texture animée, modèle de 2 plans fins
// ════════════════════════════════════════════════
// Comme les fluides, le portail n'utilise PAS l'atlas : une texture dédiée (PORTAL_TEX) est ré-écrite à chaque changement d'image d'animation.
// La feuille (assets/textures/nether/portal) empile ses images verticalement : taille d'une image = largeur de la feuille, nombre d'images = hauteur / largeur
// (la feuille actuelle fait 6×192 = 32 images de 6×6 ; une version 160×5120 fonctionnera sans rien changer).
// Modèle (comme Minecraft) : 2 plans de 16×16 px séparés de 4 px, au milieu du bloc (de 6/16 à 10/16), sans bords ni dessus.
// État `axis` (data/block-states.js) : 'x' → plans perpendiculaires à Z (portail dans le plan XY) ; 'z' → plans perpendiculaires à X (plan ZY).
const PORTAL_SPR = {};            // feuilles d'animation chargées (voir texture-loader.js)
let PORTAL_CV = null, PORTAL_TEX = null, _portalF = -1;
const PORTAL_TICKS = 2;           // durée d'une image, en ticks de 50 ms (à ajuster pour accélérer / ralentir le tourbillon)
const PORTAL_T0 = 6/16, PORTAL_T1 = 10/16;   // position des 2 plans dans le bloc
const PORTAL_UV = [0,0, 0,1, 1,1, 1,0];      // toute l'image sur chaque plan

// Appelé une fois, quand toutes les images sont chargées (avant initThree, qui crée les matériaux)
function buildPortalTextures(){
  const sheet = PORTAL_SPR.nether_portal, sz = sheet ? sheet.width : 16;
  PORTAL_CV = document.createElement('canvas'); PORTAL_CV.width = PORTAL_CV.height = sz;
  PORTAL_CV.getContext('2d').imageSmoothingEnabled = false;
  PORTAL_TEX = new THREE.CanvasTexture(PORTAL_CV);
  PORTAL_TEX.magFilter = THREE.NearestFilter; PORTAL_TEX.minFilter = THREE.NearestFilter;
  PORTAL_TEX.generateMipmaps = false; PORTAL_TEX.anisotropy = 1;
  updatePortalTexture(0, true);
}

// Anime la texture (appelé à chaque frame ; ne redessine que si l'image a changé)
function updatePortalTexture(nowMs, force){
  const sheet = PORTAL_SPR.nether_portal;
  if(!PORTAL_CV || !sheet) return;
  const sz = sheet.width, n = Math.max(1, Math.floor(sheet.height/sz)), f = Math.floor(nowMs/50/PORTAL_TICKS) % n;
  if(f === _portalF && !force) return;
  _portalF = f;
  const c = PORTAL_CV.getContext('2d');
  c.clearRect(0, 0, sz, sz);   // l'image a de la transparence : on efface avant de redessiner
  c.drawImage(sheet, 0, f*sz, sz, sz, 0, 0, sz, sz);
  PORTAL_TEX.needsUpdate = true;
}

// Géométrie d'un bloc de portail (appelé par buildChunkMesh) : ri = indice de région, bk = seaux de géométrie du chunk (n°5 = portail)
function meshPortal(ri, wx, wy, wz, bk){
  const bid = R[ri], b = bk[5], zAxis = BS.get(bid, _rstCur ? RST[ri] : 0, 'axis') === 'z';
  for(const t of [PORTAL_T0, PORTAL_T1]){
    if(zAxis) fluidQuad(b, [wx+t,wy,wz,  wx+t,wy+1,wz,  wx+t,wy+1,wz+1,  wx+t,wy,wz+1], PORTAL_UV, 255,255,255, 255,255, 1,0,0, wy);
    else      fluidQuad(b, [wx,wy,wz+t,  wx,wy+1,wz+t,  wx+1,wy+1,wz+t,  wx+1,wy,wz+t], PORTAL_UV, 255,255,255, 255,255, 0,0,1, wy);
  }
}
