'use strict';

// ════════════════════════════════════════════════
// RENDU DES FLUIDES — textures animées, hauteur des surfaces, courant, voile de caméra
// ════════════════════════════════════════════════
// Les fluides n'utilisent PAS l'atlas : une petite texture dédiée (FLUID_TEX, 96×32) est ré-écrite à chaque changement d'image d'animation,
// ce qui évite de renvoyer les 512×512 de l'atlas au GPU. Disposition de FLUID_CV :
//     x 0..15  : eau (still 16×16)      x 16..31 : lave (still 16×16)
//     x 32..63 : eau (flow 32×32)       x 64..95 : lave (flow 32×32)
// La géométrie suit Minecraft : la hauteur de chaque COIN du dessus est la moyenne pondérée des 4 blocs qui le partagent
// (fluide au-dessus → 1 ; source ou niveau ≥ 0,8 → poids 10 ; air → hauteur 0 / poids 1 ; bloc plein → ignoré).
const FLUID_SPR = {};            // feuilles d'animation chargées (voir texture-loader.js)
let FLUID_CV = null, FLUID_TEX = null;
const FT_W = 96, FT_H = 32;
const FT_CELL = {1:{still:[0,0,16], flow:[32,0,32]}, 2:{still:[16,0,16], flow:[64,0,32]}};   // [x, y, taille] dans FLUID_CV
// Animation : une entrée par cellule. `ticks` = durée d'une image en ticks de 50 ms
const FLUID_ANIM = [
  {spr:'water_still', sz:16, ticks:2, cell:FT_CELL[1].still, f:-1},
  {spr:'water_flow',  sz:32, ticks:2, cell:FT_CELL[1].flow,  f:-1},
  {spr:'lava_still',  sz:16, ticks:3, cell:FT_CELL[2].still, f:-1},
  {spr:'lava_flow',   sz:32, ticks:3, cell:FT_CELL[2].flow,  f:-1},
];
const WATER_TINT = [70, 130, 255];   // les textures d'eau sont grises (comme dans Minecraft) : teinte bleue appliquée sur les sommets

// Copie d'une image de feuille, éventuellement teintée (icône / tuile d'atlas)
function fluidFrameCanvas(sheet, frame, sz, tint){
  const cv = document.createElement('canvas'); cv.width = cv.height = sz;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  c.drawImage(sheet, 0, frame*sz, sz, sz, 0, 0, sz, sz);
  if(tint){
    const im = c.getImageData(0,0,sz,sz), d = im.data;
    for(let i=0;i<d.length;i+=4){ d[i] = d[i]*tint[0]/255; d[i+1] = d[i+1]*tint[1]/255; d[i+2] = d[i+2]*tint[2]/255; }
    c.putImageData(im,0,0);
  }
  return cv;
}

// Appelé une fois, quand toutes les images sont chargées (avant initThree)
function buildFluidTextures(){
  FLUID_CV = document.createElement('canvas'); FLUID_CV.width = FT_W; FLUID_CV.height = FT_H;
  FLUID_CV.getContext('2d').imageSmoothingEnabled = false;
  FLUID_TEX = new THREE.CanvasTexture(FLUID_CV);
  FLUID_TEX.magFilter = THREE.NearestFilter; FLUID_TEX.minFilter = THREE.NearestFilter;
  FLUID_TEX.generateMipmaps = false; FLUID_TEX.anisotropy = 1;
  updateFluidTextures(0, true);
  // tuiles 'water' / 'lava' de l'atlas (icônes, objets au sol) = 1re image
  if(FLUID_SPR.water_still) IMGS['water'] = fluidFrameCanvas(FLUID_SPR.water_still, 0, 16, WATER_TINT);
  if(FLUID_SPR.lava_still)  IMGS['lava']  = fluidFrameCanvas(FLUID_SPR.lava_still, 0, 16, null);
  initFluidOverlay();
}

// Anime les textures (appelé à chaque frame ; ne redessine que les cellules dont l'image a changé)
function updateFluidTextures(nowMs, force){
  if(!FLUID_CV) return;
  const tick = Math.floor(nowMs/50), c = FLUID_CV.getContext('2d');
  let changed = false;
  for(const a of FLUID_ANIM){
    const sheet = FLUID_SPR[a.spr]; if(!sheet) continue;
    const n = Math.max(1, Math.floor(sheet.height/a.sz)), f = Math.floor(tick/a.ticks) % n;
    if(f === a.f && !force) continue;
    a.f = f; changed = true;
    c.clearRect(a.cell[0], a.cell[1], a.sz, a.sz);   // les images ont de la transparence (eau) : on efface avant de redessiner
    c.drawImage(sheet, 0, f*a.sz, a.sz, a.sz, a.cell[0], a.cell[1], a.sz, a.sz);
  }
  if(changed) FLUID_TEX.needsUpdate = true;
}

// ── Voile affiché quand les yeux sont dans un fluide ──
let _ovKind = -1, FLUID_OV = {water:null, lava:null};
function initFluidOverlay(){
  try{
    if(FLUID_SPR.water_overlay){   // image grise à demi transparente → teintée en bleu
      const o = FLUID_SPR.water_overlay, cv = document.createElement('canvas'); cv.width = o.width; cv.height = o.height;
      const c = cv.getContext('2d'); c.drawImage(o,0,0);
      const im = c.getImageData(0,0,cv.width,cv.height), d = im.data;
      for(let i=0;i<d.length;i+=4){ d[i] = d[i]*WATER_TINT[0]/255; d[i+1] = d[i+1]*WATER_TINT[1]/255; d[i+2] = d[i+2]*WATER_TINT[2]/255; }
      c.putImageData(im,0,0); FLUID_OV.water = cv.toDataURL();
    }
    if(FLUID_SPR.lava_still) FLUID_OV.lava = fluidFrameCanvas(FLUID_SPR.lava_still, 0, 16, null).toDataURL();
  }catch(e){ /* canvas "tainted" (file://) : on garde les couleurs unies */ }
}
function updateFluidOverlay(){
  const el = document.getElementById('fluid-ov'); if(!el) return;
  const kind = (typeof SV!=='undefined' && SV.dead) ? 0 : fluidKindAtEye();
  if(kind === _ovKind) return;
  _ovKind = kind;
  if(!kind){ el.style.display = 'none'; return; }
  const url = kind===1 ? FLUID_OV.water : null;   // lave : simple masque orange, sans texture
  el.style.backgroundColor = kind===1 ? 'rgba(25,60,200,0.38)' : 'rgba(215,70,0,0.5)';
  el.style.backgroundImage = url ? 'url('+url+')' : 'none';
  el.style.display = 'block';
}

// ════════════════════════════════════════════════
// MESH DES FLUIDES (appelé par buildChunkMesh)
// ════════════════════════════════════════════════
// Coordonnées dans une cellule de FLUID_CV : fx, fy ∈ [0,1] (fy vers le bas) → [u,v] de la texture. Marge de 0,02 px : jamais d'échantillon voisin.
function fuv(cell, fx, fy){
  const sz = cell[2], e = 0.02;
  const px = Math.min(sz-e, Math.max(e, fx*sz)), py = Math.min(sz-e, Math.max(e, fy*sz));
  return [(cell[0]+px)/FT_W, 1-(cell[1]+py)/FT_H];
}

// Hauteur (0..1) d'un bloc de fluide de type k à l'indice de région i ; -1 si ce n'est pas du fluide k
function fluidCellH(i, k){
  if(FLUIDK[R[i]] !== k) return -1;
  if(FLUIDK[R[i+1]] === k) return 1;                       // fluide au-dessus : plein
  const s = _rstCur ? RST[i] : 0;
  return (s & 8) ? 1 : (8 - (s & 7)) / 8;                  // tombant : plein ; sinon (N+1)/8
}
// Hauteur du coin (dx,dz ∈ {0,1}) du dessus du bloc ri
function fluidCorner(ri, dx, dz, k){
  let sum = 0, wt = 0;
  for(let a=dx-1; a<=dx; a++) for(let c=dz-1; c<=dz; c++){
    const i = ri + a*RSX + c*RSZ;
    if(FLUIDK[R[i]] === k){
      if(FLUIDK[R[i+1]] === k) return 1;
      const h = fluidCellH(i, k);
      if(h >= 0.8){ sum += h*10; wt += 10; } else { sum += h; wt += 1; }
    } else if(!OPAQUE[R[i]]) wt += 1;                      // air / plante : hauteur 0
  }
  return wt ? sum/wt : 0;
}
// Vecteur de courant (plan XZ) d'un bloc : gradient des hauteurs vers les voisins plus bas ; une chute (air au-dessus d'un fluide voisin) attire
const _FLD = [[1,0,RSX],[-1,0,-RSX],[0,1,RSZ],[0,-1,-RSZ]];
function fluidFlowMesh(ri, k){
  const hs = fluidCellH(ri, k); let vx = 0, vz = 0;
  for(const [dx,dz,off] of _FLD){
    const n = ri+off, hn = fluidCellH(n, k); let g = 0;
    if(hn > 0) g = hs - hn;
    else if(hn < 0 && !OPAQUE[R[n]] && FLUIDK[R[n]] === 0){
      const hb = fluidCellH(n-1, k);                       // case voisine vide : on suit le fluide qui se trouve sous elle
      if(hb > 0) g = hs - (hb - 0.8888889);
    }
    if(g){ vx += dx*g; vz += dz*g; }
  }
  return (Math.abs(vx) + Math.abs(vz) < 1e-6) ? null : [vx, vz];
}

function fluidQuad(b, pts, uvs, cr, cg, cb, sk, bl, nx, ny, nz, wy){
  if(b.n >= b.cap) bGrow(b);
  const q = b.n++, p = q*12, u = q*8, c = q*12, l = q*8;
  for(let k=0;k<12;k++) b.pos[p+k] = pts[k];
  for(let k=0;k<8;k++) b.uv[u+k] = uvs[k];
  for(let k=0;k<4;k++){
    b.col[c+k*3] = cr; b.col[c+k*3+1] = cg; b.col[c+k*3+2] = cb;
    b.lit[l+k*2] = sk; b.lit[l+k*2+1] = bl;
    b.nrm[q*12+k*3] = nx*127; b.nrm[q*12+k*3+1] = ny*127; b.nrm[q*12+k*3+2] = nz*127;
  }
  const bi = q*4, ix = q*6;
  b.idx[ix]=bi; b.idx[ix+1]=bi+1; b.idx[ix+2]=bi+2; b.idx[ix+3]=bi; b.idx[ix+4]=bi+2; b.idx[ix+5]=bi+3;
  if(wy < b.minY) b.minY = wy; if(wy+1 > b.maxY) b.maxY = wy+1;
}

// bid : bloc de fluide à l'indice de région ri, en (wx,wy,wz) ; bk : seaux de géométrie du chunk
function meshFluid(bid, ri, wx, wy, wz, bk){
  const k = FLUIDK[bid], lava = k === 2, b = bk[lava ? 4 : 3], cells = FT_CELL[k], tint = lava ? [255,255,255] : WATER_TINT;
  // cellule noyée dans sa masse de fluide (océan, lac) : aucune face visible → on évite le calcul des coins
  { const hid = n => FLUIDK[n] === k || OPAQUE[n];
    if(hid(R[ri+1]) && hid(R[ri-1]) && hid(R[ri+RSX]) && hid(R[ri-RSX]) && hid(R[ri+RSZ]) && hid(R[ri-RSZ])) return; }
  const H = [[fluidCorner(ri,0,0,k), fluidCorner(ri,0,1,k)], [fluidCorner(ri,1,0,k), fluidCorner(ri,1,1,k)]];   // H[x][z]
  const lit = (idx) => lava ? [255,255] : [LT8[Math.round(LS[idx]*4)], LT8[Math.round(LB[idx]*4)]];
  const col = sh => [Math.round(tint[0]*sh), Math.round(tint[1]*sh), Math.round(tint[2]*sh)];

  // ── dessus ──
  const up = R[ri+1];
  if(FLUIDK[up] !== k && !OPAQUE[up]){
    const fl = fluidFlowMesh(ri, k), still = cells.still, flow = cells.flow;
    let uv;
    if(!fl){   // eau calme : texture 16×16 entière
      const a = fuv(still,0,0), c2 = fuv(still,0,1), d = fuv(still,1,1), e = fuv(still,1,0);
      uv = [a[0],a[1], c2[0],c2[1], d[0],d[1], e[0],e[1]];
    } else {   // courant : fenêtre de 16×16 (moitié de l'image 32×32) tournée dans le sens du flux, comme Minecraft
      const ang = Math.atan2(fl[1], fl[0]) - Math.PI/2, o = Math.sin(ang)*0.25, p = Math.cos(ang)*0.25;
      const a = fuv(flow, (8+(-p-o)*16)/16, (8+(-p+o)*16)/16), c2 = fuv(flow, (8+(-p+o)*16)/16, (8+(p+o)*16)/16),
            d = fuv(flow, (8+(p+o)*16)/16,  (8+(p-o)*16)/16),  e = fuv(flow, (8+(p-o)*16)/16,  (8+(-p-o)*16)/16);
      uv = [a[0],a[1], c2[0],c2[1], d[0],d[1], e[0],e[1]];
    }
    const [sk, bl] = lit(ri+1), c = col(1.0);
    fluidQuad(b, [wx,wy+H[0][0],wz,  wx,wy+H[0][1],wz+1,  wx+1,wy+H[1][1],wz+1,  wx+1,wy+H[1][0],wz], uv, c[0],c[1],c[2], sk, bl, 0,1,0, wy);
  }
  // ── dessous (visible seulement au-dessus du vide ou d'un bloc transparent) ──
  const dn = R[ri-1];
  if(FLUIDK[dn] !== k && !OPAQUE[dn]){
    const a = fuv(cells.still,0,0), c2 = fuv(cells.still,1,0), d = fuv(cells.still,1,1), e = fuv(cells.still,0,1);
    const [sk, bl] = lit(ri-1), c = col(0.5);
    fluidQuad(b, [wx,wy,wz,  wx+1,wy,wz,  wx+1,wy,wz+1,  wx,wy,wz+1], [a[0],a[1], c2[0],c2[1], d[0],d[1], e[0],e[1]], c[0],c[1],c[2], sk, bl, 0,-1,0, wy);
  }
  // ── côtés : de y à la hauteur des deux coins ; texture « flow » (moitié gauche de l'image, hauteur × 0,5 comme Minecraft) ──
  for(let f=2; f<6; f++){
    const F = FACES[f], nbi = ri + F.off, nb = R[nbi];
    if(FLUIDK[nb] === k || OPAQUE[nb]) continue;
    const pts = [], uvs = [];
    for(let q=0;q<4;q++){
      const v = F.v[q]; let y, vv;
      if(v[1]){ const h = H[v[0]][v[2]]; y = wy + h; vv = (1-h)*0.5; } else { y = wy; vv = 0.5; }
      pts.push(wx+v[0], y, wz+v[2]);
      const t = fuv(cells.flow, q < 2 ? 0 : 0.5, vv); uvs.push(t[0], t[1]);
    }
    const [sk, bl] = lit(nbi), c = col(F.sh);
    fluidQuad(b, pts, uvs, c[0],c[1],c[2], sk, bl, F.n[0],F.n[1],F.n[2], wy);
  }
}
