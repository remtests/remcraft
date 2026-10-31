'use strict';

// ════════════════════════════════════════════════
// CHUNK MESH BUILDER — 1 passe : AO + lumière du ciel + lumière des torches
// ════════════════════════════════════════════════
// Région de meshing = 3×3 chunks + 1 colonne de bordure (sentinelle opaque) ; layout colonne : (rz*RW+rx)*RNY + y
const RW = CSIZ*3+2, RNY = CHH+2, RSX = RNY, RSZ = RNY*RW;
const R   = new Uint8Array(RW*RW*RNY).fill(255);
const RST = new Uint16Array(R.length);    // états de blocs de la région (même indexation que R) — lus par les modèles non cubiques (portes, plaques, fils…)
let _rstUsed = false;                     // vrai si le dernier mesh a copié des états : il faudra alors effacer les colonnes des chunks sans états
const LS  = new Uint8Array(R.length);     // lumière du ciel 0..15
const LB  = new Uint8Array(R.length);     // lumière des blocs 0..15
const HMR = new Uint8Array(RW*RW);        // 1er y (région) exposé au ciel
const BIO = new Uint8Array(RW*RW);        // biome par colonne
const TINTG = new Float32Array(CSIZ*CSIZ*3), TINTF = new Float32Array(CSIZ*CSIZ*3);   // teintes lissées (5×5)
const QMASK = (1<<20)-1, Q = new Int32Array(QMASK+1);
let _qh = 0, _qt = 0;
const LT8 = new Uint8Array(61);
for(let i=0;i<61;i++) LT8[i] = Math.round(255*Math.pow(0.8, 15 - i/4));

const FACES = [
  {n:[0,1,0], t:0, sh:1.00, off:RSX*0+1,  a1:0, a2:2, v:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]},
  {n:[0,-1,0],t:1, sh:0.40, off:-1,       a1:0, a2:2, v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
  {n:[1,0,0], t:2, sh:0.82, off:RSX,      a1:1, a2:2, v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
  {n:[-1,0,0],t:2, sh:0.68, off:-RSX,     a1:1, a2:2, v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},
  {n:[0,0,1], t:2, sh:0.92, off:RSZ,      a1:0, a2:1, v:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]},
  {n:[0,0,-1],t:2, sh:0.72, off:-RSZ,     a1:0, a2:1, v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]},
];
const LEAF_INSET = 0.03;   // retrait (en blocs) des faces de feuillage en contact avec un autre feuillage
const AXSTRIDE = [RSX, 1, RSZ];   // x, y, z
for(const F of FACES){
  F.d1 = []; F.d2 = [];
  for(const v of F.v){
    F.d1.push((v[F.a1] ? 1 : -1) * AXSTRIDE[F.a1]);   // voisin dans le plan de la face, côté du sommet
    F.d2.push((v[F.a2] ? 1 : -1) * AXSTRIDE[F.a2]);
  }
}
const QUV = [0,0, 0,1, 1,1, 1,0];
const FACE_DIRS = [[1,0],[-1,0],[0,1],[0,-1]];   // [nx,nz] de la face avant d'un coffre

// Buckets (tableaux typés extensibles)
function mkBucket(){ return {n:0, cap:0, pos:null, uv:null, col:null, lit:null, nrm:null, idx:null, minY:1e9, maxY:-1e9}; }
function bGrow(b){
  const nc = b.cap ? b.cap*2 : 256;
  const g = (old, per, T) => { const a = new T(nc*per); if(old) a.set(old); return a; };
  b.pos = g(b.pos,12,Float32Array); b.uv = g(b.uv,8,Float32Array);
  b.col = g(b.col,12,Uint8Array);   b.lit = g(b.lit,8,Uint8Array);
  b.nrm = g(b.nrm,12,Int8Array);    b.idx = g(b.idx,6,Uint32Array);
  b.cap = nc;
}
const CHUNK_MESH = new Map();     // key -> [Mesh]
const _ao = new Float32Array(4), _sk = new Float32Array(4), _bl = new Float32Array(4);

function floodLight(A){
  while(_qh < _qt){
    const i = Q[_qh++ & QMASK], L = A[i]-1;
    if(L <= 0) continue;
    let n;
    n=i+1;   if(!OPAQUE[R[n]] && A[n]<L){ A[n]=L; Q[_qt++&QMASK]=n; }
    n=i-1;   if(!OPAQUE[R[n]] && A[n]<L){ A[n]=L; Q[_qt++&QMASK]=n; }
    n=i+RSX; if(!OPAQUE[R[n]] && A[n]<L){ A[n]=L; Q[_qt++&QMASK]=n; }
    n=i-RSX; if(!OPAQUE[R[n]] && A[n]<L){ A[n]=L; Q[_qt++&QMASK]=n; }
    n=i+RSZ; if(!OPAQUE[R[n]] && A[n]<L){ A[n]=L; Q[_qt++&QMASK]=n; }
    n=i-RSZ; if(!OPAQUE[R[n]] && A[n]<L){ A[n]=L; Q[_qt++&QMASK]=n; }
  }
}

function disposeChunkMesh(key){
  const ms = CHUNK_MESH.get(key);
  if(ms){ for(const m of ms){ m.geometry.dispose(); scene.remove(m); } }
  CHUNK_MESH.delete(key);
}

function buildChunkMesh(cx,cz){
  const key = ckey(cx,cz);
  const old = CHUNK_MESH.get(key);
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) getChunkData(cx+dx,cz+dz);
  const meta = CHUNK_META.get(key);
  const x0 = cx*CSIZ, z0 = cz*CSIZ;

  // 1) copie des 3×3 chunks dans la région
  let rstNow = false;
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
    const k2 = ckey(cx+dx,cz+dz), d = CHUNK_DATA.get(k2), m = CHUNK_META.get(k2);
    const rx0 = (dx+1)*CSIZ+1, rz0 = (dz+1)*CSIZ+1;
    const st = m.st;
    if(st) rstNow = true;
    for(let lx=0;lx<CSIZ;lx++) for(let lz=0;lz<CSIZ;lz++){
      const col = lx*CSIZ+lz, rc = (rz0+lz)*RW+(rx0+lx);
      R.set(d.subarray(col*CHH, col*CHH+CHH), rc*RNY+1);
      if(st) RST.set(st.subarray(col*CHH, col*CHH+CHH), rc*RNY+1);
      else if(_rstUsed) RST.fill(0, rc*RNY+1, rc*RNY+1+CHH);
      HMR[rc] = m.hmL[col]+1;
      BIO[rc] = m.bio[col];
    }
  }
  _rstUsed = rstNow;   // si aucun chunk de la région n'a d'états, RST n'est pas touché (et reste valide pour ce mesh : plus personne ne le lit)

  // 1b) teinte d'herbe / feuillage lissée sur 5×5 colonnes (comme le fondu de biomes de Minecraft)
  for(let lx=0;lx<CSIZ;lx++) for(let lz=0;lz<CSIZ;lz++){
    let gr=0,gg=0,gb=0,fr=0,fg=0,fb=0;
    for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
      const bi = BIO[(lz+17+dz)*RW+(lx+17+dx)], g = GRASS_TINT[bi], f = FOLIAGE_TINT[bi];
      gr+=g[0]; gg+=g[1]; gb+=g[2]; fr+=f[0]; fg+=f[1]; fb+=f[2];
    }
    const o = (lx*CSIZ+lz)*3, k = 1/(25*255);
    TINTG[o]=gr*k; TINTG[o+1]=gg*k; TINTG[o+2]=gb*k;
    TINTF[o]=fr*k; TINTF[o+1]=fg*k; TINTF[o+2]=fb*k;
  }

  // 2) lumière du ciel : plein soleil au-dessus de la heightmap, puis propagation latérale dans les grottes/surplombs
  LS.fill(0); LB.fill(0);
  _qh = _qt = 0;
  for(let rz=1;rz<=48;rz++) for(let rx=1;rx<=48;rx++){
    const c = rz*RW+rx, base = c*RNY;
    LS.fill(15, base+HMR[c], base+RNY);
  }
  for(let rz=1;rz<=48;rz++) for(let rx=1;rx<=48;rx++){
    const c = rz*RW+rx, base = c*RNY, hc = HMR[c];
    for(let nbi=0; nbi<4; nbi++){
      const nrx = rx + (nbi===0?1:nbi===1?-1:0), nrz = rz + (nbi===2?1:nbi===3?-1:0);
      if(nrx<1||nrx>48||nrz<1||nrz>48) continue;
      const hn = HMR[nrz*RW+nrx];
      for(let y=hn; y<hc; y++){
        const i = base+y;
        if(!OPAQUE[R[i]] && LS[i]<14){ LS[i]=14; Q[_qt++&QMASK]=i; }
      }
    }
  }
  floodLight(LS);

  // 3) lumière des blocs (torches du registre + four actif), propagation BFS
  _qh = _qt = 0;
  for(const s of LIGHTSRC.values()){
    const rx = s.x-x0+17, rz = s.z-z0+17;
    if(rx<1||rx>48||rz<1||rz>48) continue;
    const i = (rz*RW+rx)*RNY + s.y+Y_OFF+1;
    if(LB[i] < s.lvl){ LB[i] = s.lvl; Q[_qt++&QMASK] = i; }
  }
  if(typeof FURNACES!=='undefined') for(const [fk, F] of FURNACES){   // chaque four allumé éclaire (niveau 13)
    if(!F.active) continue;
    const fc = fk.split(','), px = +fc[0], py = +fc[1], pz = +fc[2], rx = px-x0+17, rz = pz-z0+17;
    if(rx>=1&&rx<=48&&rz>=1&&rz<=48){
      const i = (rz*RW+rx)*RNY + py+Y_OFF+1;
      if(LB[i] < 13){ LB[i] = 13; Q[_qt++&QMASK] = i; }
    }
  }
  floodLight(LB);

  // 4) géométrie
  const bk = [mkBucket(), mkBucket(), mkBucket(), mkBucket()];
  // Éclairage doux (Minecraft) : 0 = désactivé (lumière plate par face), 1 = minimum, 2 = maximum
  const useSmooth = S.smooth > 0, useAO = useSmooth, aoStep = S.smooth === 1 ? 0.07 : 0.14;
  for(let lx=0;lx<CSIZ;lx++) for(let lz=0;lz<CSIZ;lz++){
    const col = lx*CSIZ+lz, top = meta.top[col];
    const rcol = ((lz+17)*RW+(lx+17))*RNY + 1;
    const wx = x0+lx, wz = z0+lz;
    for(let ly=0; ly<top; ly++){
      const ri = rcol+ly, bid = R[ri];
      if(!bid || !KNOWN[bid]) continue;
      const wy = ly - Y_OFF;
      const isOpq = OPAQUE[bid];

      if(bid === 20){   // torche : tige fine, toujours pleine lumière
        const b = bk[1];
        const sk = LT8[Math.min(60, LS[ri]*4)];
        const x0t=wx+7/16, x1t=wx+9/16, z0t=wz+7/16, z1t=wz+9/16, y0t=wy, y1t=wy+10/16;
        const u0=7/16, u1=9/16, v0=0, v1=10/16;   // tige : colonnes 7-8 et lignes 6-15 de la tuile (v vers le haut : bas de la tige = bas de la tuile)
        const sides = [
          [x1t,y0t,z0t, x1t,y1t,z0t, x1t,y1t,z1t, x1t,y0t,z1t, 1,0,0],
          [x0t,y0t,z1t, x0t,y1t,z1t, x0t,y1t,z0t, x0t,y0t,z0t, -1,0,0],
          [x1t,y0t,z1t, x1t,y1t,z1t, x0t,y1t,z1t, x0t,y0t,z1t, 0,0,1],
          [x0t,y0t,z0t, x0t,y1t,z0t, x1t,y1t,z0t, x1t,y0t,z0t, 0,0,-1],
        ];
        const tile = TILE_IDX['torch_block'], tu = TILE_U0[tile], tv = TILE_V0[tile];
        for(let s=0;s<5;s++){
          if(b.n >= b.cap) bGrow(b);
          const q = b.n++, p = q*12, u = q*8, c = q*12, l = q*8;
          let uvs, quad, nx=0,ny=0,nz=0, cb=[255,255,255, 255,255,255, 255,255,255, 255,255,255];
          if(s<4){
            quad = sides[s]; nx=quad[12]; ny=quad[13]; nz=quad[14];
            uvs = [u0,v0, u0,v1, u1,v1, u1,v0];
            cb = [178,178,178, 255,255,255, 255,255,255, 178,178,178];
          } else {
            quad = [x0t,y1t,z0t, x0t,y1t,z1t, x1t,y1t,z1t, x1t,y1t,z0t]; ny = 1;
            uvs = [u0,10/16, u0,8/16, u1,8/16, u1,10/16];   // dessus : pointe de la flamme (lignes 6-7)
          }
          for(let k=0;k<12;k++){ b.pos[p+k] = quad[k]; b.col[c+k] = cb[k]; }
          for(let k=0;k<4;k++){
            b.uv[u+k*2]   = tu + uvs[k*2]*TILE_W;
            b.uv[u+k*2+1] = tv + uvs[k*2+1]*TILE_W;
            b.lit[l+k*2] = sk; b.lit[l+k*2+1] = 255;
            b.nrm[q*12+k*3] = nx*127; b.nrm[q*12+k*3+1] = ny*127; b.nrm[q*12+k*3+2] = nz*127;
          }
          const bi = q*4, ix = q*6;
          b.idx[ix]=bi; b.idx[ix+1]=bi+1; b.idx[ix+2]=bi+2; b.idx[ix+3]=bi; b.idx[ix+4]=bi+2; b.idx[ix+5]=bi+3;
          if(wy < b.minY) b.minY = wy; if(wy+1 > b.maxY) b.maxY = wy+1;
        }
        continue;
      }

      if(PLANT[bid]){   // plante en croix (2 plans diagonaux, double face)
        const b = bk[1], tile = TILE_SIDE[bid], tu = TILE_U0[tile], tv = TILE_V0[tile];
        const o = col*3, tnt = TILE_TINT[tile]===1;
        const cr = Math.round(255*0.95*(tnt?TINTG[o]:1)), cg = Math.round(255*0.95*(tnt?TINTG[o+1]:1)), cb = Math.round(255*0.95*(tnt?TINTG[o+2]:1));
        const sk = LT8[Math.min(60, LS[ri]*4)], bl = LT8[Math.min(60, LB[ri]*4)];
        const hang = DRIP[bid] && OPAQUE[R[ri+1]] && !OPAQUE[R[ri-1]];   // stalactite : suspendue à un plafond → texture retournée (les textures sont dessinées pointe en haut)
        const jh = hash32(wx,wz,5), jx = ((jh&15)-7.5)/50, jz = (((jh>>4)&15)-7.5)/50;
        const x0p = wx+0.15+jx, x1p = wx+0.85+jx, z0p = wz+0.15+jz, z1p = wz+0.85+jz, y0p = wy, y1p = wy+1;
        const quads = [
          [x0p,y0p,z0p, x0p,y1p,z0p, x1p,y1p,z1p, x1p,y0p,z1p],
          [x1p,y0p,z0p, x1p,y1p,z0p, x0p,y1p,z1p, x0p,y0p,z1p],
        ];
        for(let s=0;s<2;s++){
          if(b.n >= b.cap) bGrow(b);
          const q = b.n++, p = q*12, u = q*8, c = q*12, l = q*8;
          for(let k=0;k<12;k++){ b.pos[p+k] = quads[s][k]; }
          for(let k=0;k<4;k++){
            b.uv[u+k*2]   = tu + QUV[k*2]*TILE_W;
            b.uv[u+k*2+1] = tv + (hang ? 1-QUV[k*2+1] : QUV[k*2+1])*TILE_W;
            b.col[c+k*3] = cr; b.col[c+k*3+1] = cg; b.col[c+k*3+2] = cb;
            b.lit[l+k*2] = sk; b.lit[l+k*2+1] = bl;
            b.nrm[q*12+k*3] = 0; b.nrm[q*12+k*3+1] = 127; b.nrm[q*12+k*3+2] = 0;
          }
          const bi = q*4, ix = q*6;
          b.idx[ix]=bi; b.idx[ix+1]=bi+1; b.idx[ix+2]=bi+2; b.idx[ix+3]=bi; b.idx[ix+4]=bi+2; b.idx[ix+5]=bi+3;
        }
        if(wy < b.minY) b.minY = wy; if(wy+1 > b.maxY) b.maxY = wy+1;
        continue;
      }

      const b = bk[BCLS[bid]];
      const isCact = bid === 22, isChestB = bid === 27;
      for(let f=0; f<6; f++){
        const F = FACES[f];
        const f0 = ri + F.off, nb = R[f0];
        if(isCact){ if(F.t!==2 && (OPAQUE[nb] || nb===22)) continue; }   // cactus : faces latérales (en retrait) toujours dessinées
        else if(isChestB){ if(F.t===1 && OPAQUE[nb]) continue; }          // coffre : toutes les faces en retrait, sauf le dessous posé sur un bloc plein
        else {
          if(OPAQUE[nb]) continue;
          if(nb===bid && !isOpq && !IS_LEAF[bid]) continue;       // verre/eau contre le même bloc ; EXCEPTION feuillage : toutes les faces sont gardées entre deux feuilles adjacentes (donne du volume aux arbres)
        }
        let tile = F.t===0 ? TILE_TOP[bid] : F.t===1 ? TILE_BOT[bid] : TILE_SIDE[bid];
        if(AXIS[bid]){   // bûche horizontale (tous les bois) : extrémités = anneaux ; écorce tournée pour que les fibres suivent l'axe
          const ax = AXIS[bid], endFace = ax===1 ? (f===2 || f===3) : (f===4 || f===5);
          tile = endFace ? TILE_TOP[bid] : (ax===2 && f<2) ? TILE_SIDE[bid] : TILE_SIDE_R[bid];
        }
        if(HASFRONT[bid] && F.t===2){   // coffre / four : la face avant regarde dans la direction mémorisée à la pose
          const dr = FACE_DIRS[CHEST_DIR.get(wx+','+wy+','+wz) ?? 3];
          if(dr[0]===F.n[0] && dr[1]===F.n[2]){
            const bf = BLOCKS[bid];
            tile = (bf.tFrontOn && typeof FURNACES!=='undefined' && FURNACES.get(wx+','+wy+','+wz)?.active) ? TILE_IDX[bf.tFrontOn] : TILE_IDX[bf.tFront];   // four allumé : face avant en feu
          }
        }

        // AO + lumière lissée par sommet (cases dans le plan de la face, du bon côté du sommet)
        for(let k=0;k<4;k++){
          const d1 = F.d1[k], d2 = F.d2[k];
          const a = f0+d1, bb = f0+d2, c = f0+d1+d2;
          const oa = OPAQUE[R[a]], ob = OPAQUE[R[bb]], oc = OPAQUE[R[c]];
          _ao[k] = useAO ? 1 - ((oa&&ob) ? 3 : (oa+ob+oc))*aoStep : 1;
          if(useSmooth){
            let s = LS[f0], bl = LB[f0], n = 1;
            if(!oa){ s+=LS[a];  bl+=LB[a];  n++; }
            if(!ob){ s+=LS[bb]; bl+=LB[bb]; n++; }
            if(!oc && !(oa&&ob)){ s+=LS[c]; bl+=LB[c]; n++; }
            _sk[k] = s/n; _bl[k] = bl/n;
          } else { _sk[k] = LS[f0]; _bl[k] = LB[f0]; }
        }
        if(b.n >= b.cap) bGrow(b);
        const q = b.n++, p = q*12, u = q*8, c = q*12, l = q*8;
        const tu = TILE_U0[tile], tv = TILE_V0[tile], sh = F.sh;
        const tk = TILE_TINT[tile], to = col*3;
        const tr = tk===1 ? TINTG[to]   : tk===2 ? TINTF[to]   : 1;
        const tg = tk===1 ? TINTG[to+1] : tk===2 ? TINTF[to+1] : 1;
        const tb = tk===1 ? TINTG[to+2] : tk===2 ? TINTF[to+2] : 1;
        const ins = (IS_LEAF[bid] && IS_LEAF[nb]) ? LEAF_INSET : 0;   // face entre deux feuilles : légèrement rentrée dans son bloc → les deux faces coïncidentes ne sont plus dans le même plan (plus de Z-fighting)
        for(let k=0;k<4;k++){
          const v = F.v[k];
          let qu = QUV[k*2], qv = QUV[k*2+1];
          if(isCact){   // 1/16 de retrait de chaque côté ; les UV suivent (colonnes 1..15 sur les côtés, 1..15 × 1..15 sur le dessus)
            b.pos[p+k*3] = wx+(v[0]?0.9375:0.0625); b.pos[p+k*3+1] = wy+v[1]; b.pos[p+k*3+2] = wz+(v[2]?0.9375:0.0625);
            qu = qu?0.9375:0.0625; if(F.t!==2) qv = qv?0.9375:0.0625;
          } else if(isChestB){   // coffre : boîte 14×14×14 px (retrait de 1/16 sur les côtés, hauteur 14/16) ; cas particulier : la tuile 16×16 ENTIÈRE est plaquée sur chaque face (UV 0..1, pas de recadrage)
            b.pos[p+k*3] = wx+(v[0]?0.9375:0.0625); b.pos[p+k*3+1] = wy+v[1]*0.875; b.pos[p+k*3+2] = wz+(v[2]?0.9375:0.0625);
          } else { b.pos[p+k*3] = wx+v[0]-F.n[0]*ins; b.pos[p+k*3+1] = wy+v[1]-F.n[1]*ins; b.pos[p+k*3+2] = wz+v[2]-F.n[2]*ins; }
          b.uv[u+k*2]   = tu + qu*TILE_W;
          b.uv[u+k*2+1] = tv + qv*TILE_W;
          const cc = 255*sh*_ao[k];
          b.col[c+k*3] = Math.round(cc*tr); b.col[c+k*3+1] = Math.round(cc*tg); b.col[c+k*3+2] = Math.round(cc*tb);
          b.lit[l+k*2]   = LT8[Math.round(_sk[k]*4)];
          b.lit[l+k*2+1] = LT8[Math.round(_bl[k]*4)];
          b.nrm[q*12+k*3] = F.n[0]*127; b.nrm[q*12+k*3+1] = F.n[1]*127; b.nrm[q*12+k*3+2] = F.n[2]*127;
        }
        const bi = q*4, ix = q*6;
        if(_ao[0]+_ao[2] >= _ao[1]+_ao[3]){   // diagonale choisie pour éviter les artefacts d'AO
          b.idx[ix]=bi; b.idx[ix+1]=bi+1; b.idx[ix+2]=bi+2; b.idx[ix+3]=bi; b.idx[ix+4]=bi+2; b.idx[ix+5]=bi+3;
        } else {
          b.idx[ix]=bi+1; b.idx[ix+1]=bi+2; b.idx[ix+2]=bi+3; b.idx[ix+3]=bi+1; b.idx[ix+4]=bi+3; b.idx[ix+5]=bi;
        }
        if(wy < b.minY) b.minY = wy; if(wy+1 > b.maxY) b.maxY = wy+1;
      }
    }
  }

  // 5) création des meshes (puis libération des anciens : pas de clignotement)
  const meshes = [];
  for(let cls=0; cls<4; cls++){
    const b = bk[cls];
    if(!b.n) continue;
    const nv = b.n*4;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(nv>65535 ? b.idx.slice(0,b.n*6) : new Uint16Array(b.idx.subarray(0,b.n*6)), 1));
    geo.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0,nv*3),3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(b.uv.slice(0,nv*2),2));
    geo.setAttribute('color',    new THREE.BufferAttribute(b.col.slice(0,nv*3),3,true));
    geo.setAttribute('aLight',   new THREE.BufferAttribute(b.lit.slice(0,nv*2),2,true));
    geo.setAttribute('normal',   new THREE.BufferAttribute(b.nrm.slice(0,nv*3),3,true));
    const hy = (b.maxY-b.minY)/2;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0+8,(b.minY+b.maxY)/2,z0+8), Math.sqrt(128+hy*hy)+1);
    const m = new THREE.Mesh(geo, CMATS[cls]);
    m.userData.cls = cls; m.userData.cx = cx; m.userData.cz = cz;
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
  }
  if(old){ for(const m of old){ m.geometry.dispose(); scene.remove(m); } }
  CHUNK_MESH.set(key, meshes);
}
