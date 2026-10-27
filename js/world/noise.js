'use strict';

// ══════════════════════════════════════════════════════════
// BRUIT DE PERLIN — tables de permutation seedées
// ══════════════════════════════════════════════════════════
function hash32(x,z,s){
  let n = (Math.imul(x,374761393) + Math.imul(z,668265263) + Math.imul(s,-2048144777))|0;
  n = Math.imul(n ^ (n>>>13), 1274126177);
  return n ^ (n>>>16);
}
function hash2(x,z,s){ return (hash32(x|0,z|0,(s||0)|0)>>>0)/4294967296; }
function lerpN(a,b,t){return a+(b-a)*t;}
function clamp01(v){return v<0?0:v>1?1:v;}
function fade(t){return t*t*t*(t*(t*6-15)+10);}

function makePerm(seed){
  const p = new Uint8Array(256);
  for(let i=0;i<256;i++) p[i]=i;
  let s = seed >>> 0;
  for(let i=255;i>0;i--){
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = (s>>>8) % (i+1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for(let i=0;i<512;i++) perm[i] = p[i & 255];
  // décalage aléatoire (propre à la graine) du domaine de bruit : sans lui, perlin(0,0) = 0 pour TOUTES les graines
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0; perm.ox = (s>>>8)/16777216*256;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0; perm.oy = (s>>>8)/16777216*256;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0; perm.oz = (s>>>8)/16777216*256;
  return perm;
}
// Cache par graine COMPLÈTE (l'ancien cache tronqué à 16 bits pouvait faire partager une table à deux graines)
const _permCache = new Map();
let _lpSeed = -1, _lpPerm = null;
function getPerm(seed){
  seed = seed>>>0;
  if(seed === _lpSeed) return _lpPerm;
  let p = _permCache.get(seed);
  if(!p){ p = makePerm(seed); _permCache.set(seed,p); }
  _lpSeed = seed; _lpPerm = p;
  return p;
}
const GRAD2 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
function grad2(hash, x, z){ const g = GRAD2[hash & 7]; return g[0]*x + g[1]*z; }
const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
];
function grad3(hash, x, y, z){ const g = GRAD3[hash % 12]; return g[0]*x + g[1]*y + g[2]*z; }

function perlin2(x, z, seed=0){
  const perm = getPerm(seed);
  x += perm.ox; z += perm.oz;
  const fxl = Math.floor(x), fzl = Math.floor(z);
  const ix = fxl & 255, iz = fzl & 255;
  const fx = x - fxl, fz = z - fzl;
  const ux = fade(fx), uz = fade(fz);
  const aa = perm[perm[ix  ] + iz], ab = perm[perm[ix  ] + iz+1];
  const ba = perm[perm[ix+1] + iz], bb = perm[perm[ix+1] + iz+1];
  return lerpN(
    lerpN(grad2(aa, fx,   fz  ), grad2(ba, fx-1, fz  ), ux),
    lerpN(grad2(ab, fx,   fz-1), grad2(bb, fx-1, fz-1), ux),
    uz
  );
}
function perlin3(x, y, z, seed=0){
  const perm = getPerm(seed);
  x += perm.ox; y += perm.oy; z += perm.oz;
  const fxl = Math.floor(x), fyl = Math.floor(y), fzl = Math.floor(z);
  const ix = fxl & 255, iy = fyl & 255, iz = fzl & 255;
  const fx = x-fxl, fy = y-fyl, fz = z-fzl;
  const ux = fade(fx), uy = fade(fy), uz = fade(fz);
  const a  = perm[ix  ]+iy, aa = perm[a  ]+iz, ab = perm[a+1]+iz;
  const b  = perm[ix+1]+iy, ba = perm[b  ]+iz, bb = perm[b+1]+iz;
  return lerpN(
    lerpN(
      lerpN(grad3(perm[aa  ],fx,  fy,  fz  ), grad3(perm[ba  ],fx-1,fy,  fz  ), ux),
      lerpN(grad3(perm[ab  ],fx,  fy-1,fz  ), grad3(perm[bb  ],fx-1,fy-1,fz  ), ux), uy),
    lerpN(
      lerpN(grad3(perm[aa+1],fx,  fy,  fz-1), grad3(perm[ba+1],fx-1,fy,  fz-1), ux),
      lerpN(grad3(perm[ab+1],fx,  fy-1,fz-1), grad3(perm[bb+1],fx-1,fy-1,fz-1), ux), uy),
    uz
  );
}
function noise2d(x, z, seed=0){ return perlin2(x, z, seed) * 0.5 + 0.5; }
function noise3d(x, y, z, seed=0){ return perlin3(x, y, z, seed) * 0.5 + 0.5; }
function octave2d(x,z,octs,seed=0,lac=2.0,pers=0.5){
  let v=0,a=1,f=1,m=0;
  for(let i=0;i<octs;i++){
    v += noise2d(x*f, z*f, (seed + i*97) & 0x7fffffff) * a;
    m += a; a *= pers; f *= lac;
  }
  return v/m;
}
function octave3d(x,y,z,octs,seed=0){
  let v=0,a=1,f=1,m=0;
  for(let i=0;i<octs;i++){
    v += noise3d(x*f, y*f, z*f, (seed + i*83) & 0x7fffffff) * a;
    m += a; a *= .5; f *= 2;
  }
  return v/m;
}
function warpedNoise2d(x,z,seed=0){
  const ox = perlin2(x*0.5+3.7, z*0.5+9.2, (seed+1) & 0x7fffffff) * 1.5;
  const oz = perlin2(x*0.5+8.1, z*0.5+2.4, (seed+2) & 0x7fffffff) * 1.5;
  return noise2d(x+ox, z+oz, seed);
}

// ══════════════════════════════════════════════════════════
// BRUITS DE RELIEF — pour croiser plusieurs familles de bruit (génération de terrain)
// ══════════════════════════════════════════════════════════
// « Ridged multifractal » (Musgrave) : crêtes vives là où le bruit de Perlin passe par zéro.
// Chaque octave est pondérée par la précédente → arêtes nettes en altitude, fonds plus calmes. Sortie ≈ 0..1.
function ridged2(x,z,octs,seed=0,lac=2.1,gain=2.0){
  let v=0, a=1, f=1, w=1, m=0;
  for(let i=0;i<octs;i++){
    let s = 1 - Math.abs(perlin2(x*f, z*f, (seed + i*61) & 0x7fffffff));
    s *= s; s *= w;
    w = s*gain; if(w>1) w=1;
    v += s*a; m += a; a *= 0.5; f *= lac;
  }
  return v/m;
}
// Bruit cellulaire (Voronoï) : distance au point le plus proche (_vF1, en unités de cellule) et
// hauteur aléatoire propre à la cellule (_vH, 0..1) → sert à planter des pics en forme de cône.
let _vF1 = 0, _vH = 0;
function voronoi2(x,z,seed=0){
  const ix = Math.floor(x), iz = Math.floor(z);
  let best = 9, bh = 0;
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
    const cx = ix+dx, cz = iz+dz;
    const px = cx + hash2(cx,cz,seed), pz = cz + hash2(cx,cz,seed+1);
    const ex = px-x, ez = pz-z, d = ex*ex + ez*ez;
    if(d < best){ best = d; bh = hash2(cx,cz,seed+2); }
  }
  _vF1 = Math.sqrt(best); _vH = bh;
  return _vF1;
}
