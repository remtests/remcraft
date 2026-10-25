'use strict';

// ══════════════════════════════════════════════════════════
// BIOMES : 0 = Plaines, 1 = Forêt, 2 = Montagne
// ══════════════════════════════════════════════════════════
let WORLD_SEED = (Math.random() * 0x7fffffff) | 0;
// Réglages choisis à l'écran « Create New World » : type de monde, mode de jeu, coffre bonus
const WORLD = {type:'default', mode:'survival', bonus:false, cheats:false};   // type : default | flat | large
let BIOME_SCALE = 1;      // « Large Biomes » : biomes 4× plus grands
const FLAT_H = 4;         // Superflat : surface (herbe) à y = 4, bedrock à y = 1

// 0 Plaines, 1 Forêt, 2 Montagne, 3 Désert, 4 Forêt centenaire, 5 Savane, 6 Taïga, 7 Jungle, 8 Forêt fleurie, 9 Collines venteuses, 10 Badlands
const BIOME_IDS   = ['plains','forest','mountains','desert','old_growth_forest','savanna','taiga','jungle','flower_forest','windswept_hills','badlands'];
const BIOME_NAMES = ['Plains','Forest','Mountains','Desert','Old Growth Forest','Savanna','Taiga','Jungle','Flower Forest','Windswept Hills','Badlands'];
const NB = BIOME_IDS.length;
const TREE_P   = [0.016,0.080,0,0,0,0.012,0.10,0.06,0.03,0.012,0];   // densité d'arbres par biome
const BAD_BAND = [4,4,9,4,3,4];                                       // strates des Badlands (sable / gravier / pierre)
// trois bruits climatiques : relief (biomeN), humidité (clim), température (temp)
let _bN = 0, _bC = 0, _bT = 0;
function biomeNoise(wx, wz){
  const S0 = WORLD_SEED, sc = BIOME_SCALE;
  _bN = octave2d(wx/(600*sc), wz/(600*sc), 3, S0^101, 2.0, 0.55);
  _bC = octave2d(wx/(450*sc)+37.1, wz/(450*sc)-12.7, 3, S0^707, 2.0, 0.55);
  _bT = octave2d(wx/(520*sc)-71.3, wz/(520*sc)+23.9, 3, S0^808, 2.0, 0.55);
}
// seuils calés sur la distribution du bruit (moyenne 0,5 ; quartiles 0,442 / 0,558)
function classifyBiome(n, c, t){
  if(n >= 0.585) return 2;                                   // montagnes
  if(n >= 0.552) return 9;                                   // collines venteuses (transition vers les montagnes)
  if(n < 0.455){                                             // basses terres
    if(t > 0.50) return c > 0.54 ? 3 : (c < 0.45 ? 10 : 5);  // chaud : désert / badlands / savane
    return c > 0.55 ? 8 : 0;                                 // tempéré : forêt fleurie / plaines
  }
  if(t < 0.45) return 6;                                     // taïga
  if(t > 0.55 && c > 0.49) return 7;                         // jungle
  return c < 0.48 ? 4 : 1;                                   // forêt centenaire / forêt
}
function rawBiomeType(wx, wz){ biomeNoise(wx, wz); return classifyBiome(_bN, _bC, _bT); }
function getRawBiome(wx, wz){
  const S0 = WORLD_SEED;
  biomeNoise(wx, wz);
  const biomeN = _bN, clim = _bC, temp = _bT;
  const base   = octave2d(wx/220, wz/220, 5, S0,     2.0, 0.52);
  const detail = octave2d(wx/55,  wz/55,  4, S0^111, 2.1, 0.46);
  const type = classifyBiome(biomeN, clim, temp);

  let h;
  if(type === 0){
    const flatN = octave2d(wx/400, wz/400, 2, S0^55, 2.0, 0.4);
    const flatness = clamp01(flatN * 1.5);
    h = 5 + base*12*(1.0 - flatness*0.75) + detail*3*(1.0 - flatness*0.60);
  } else if(type === 1){
    const w = warpedNoise2d(wx/100, wz/100, S0^100);
    h = 8 + w*18 + base*8 + detail*4;
  } else if(type === 3){
    const dune = octave2d(wx/28, wz/28, 2, S0^909, 2.0, 0.5);
    h = 5 + base*8 + detail*3 + dune*5;
  } else if(type === 4){
    const w = warpedNoise2d(wx/120, wz/120, S0^100);
    h = 9 + w*12 + base*6 + detail*2;
  } else if(type === 5){          // savane : grandes plaines presque plates
    const fl = clamp01(octave2d(wx/400, wz/400, 2, S0^55, 2.0, 0.4) * 1.5);
    h = 6 + base*10*(1.0 - fl*0.6) + detail*2;
  } else if(type === 6){          // taïga : relief de forêt, un peu plus marqué
    const w = warpedNoise2d(wx/110, wz/110, S0^100);
    h = 9 + w*15 + base*8 + detail*3;
  } else if(type === 7){          // jungle
    const w = warpedNoise2d(wx/100, wz/100, S0^100);
    h = 8 + w*14 + base*7 + detail*3;
  } else if(type === 8){          // forêt fleurie
    h = 6 + base*10 + detail*3;
  } else if(type === 9){          // collines venteuses
    const massif = octave2d(wx/300, wz/300, 3, S0^400, 2.05, 0.60);
    h = 12 + massif*24 + base*14 + detail*6;
  } else if(type === 10){         // badlands : mesas (les paliers sont appliqués dans colInfo)
    const massif = octave2d(wx/260, wz/260, 3, S0^450, 2.0, 0.55);
    h = 10 + base*18 + massif*16 + detail*2;
  } else {
    const ridgeRaw = perlin2(wx/180, wz/180, S0^202);
    const ridge2   = perlin2(wx/80,  wz/80,  S0^303);
    const ridgeA = Math.pow(1.0 - Math.abs(ridgeRaw), 2.5);
    const ridgeB = Math.pow(1.0 - Math.abs(ridge2),   2.2);
    const massif = octave2d(wx/350, wz/350, 4, S0^400, 2.05, 0.60);
    h = 20 + massif*30 + base*20 + ridgeA*28 + ridgeB*12 + detail*6;
    if(h > 70) h = 70 + (h-70)*0.3;
  }
  if(h > Y_MAX-10) h = Y_MAX-10;
  return {type, h};
}

// Lissage gaussien 5×5 calculé sur une grille de nœuds (pas de 4 blocs, mis en cache)
// puis interpolé bilinéairement par colonne : ~10× moins de bruit à évaluer que par bloc.
const NODE_G = 6;   // = pas de l'échantillonnage du lissage → chaque point brut est calculé une seule fois (cache)
const GW = new Float32Array(25);
for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) GW[(dx+2)*5+dz+2] = Math.exp(-(dx*dx+dz*dz)*0.35);
const _rawCache = new Map(), _nodeCache = new Map();
function rawAt(i,j){
  const k = (i+0x8000)*65536 + (j+0x8000);
  let r = _rawCache.get(k);
  if(!r){
    const d = getRawBiome(i*NODE_G, j*NODE_G);
    r = new Float32Array([d.h, d.type]);
    if(_rawCache.size > 120000) _rawCache.clear();
    _rawCache.set(k,r);
  }
  return r;
}
function biomeNode(i,j){
  const k = (i+0x8000)*65536 + (j+0x8000);
  let n = _nodeCache.get(k);
  if(n) return n;
  let hs=0, wt=0;
  const v = new Array(NB).fill(0);
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
    const r = rawAt(i+dx, j+dz);
    const w = GW[(dx+2)*5+dz+2];
    hs += r[0]*w; wt += w;
    v[r[1]] += w;
  }
  n = new Float32Array(NB+1); n[0] = hs/wt; for(let k=0;k<NB;k++) n[k+1] = v[k]/wt;
  if(_nodeCache.size > 60000) _nodeCache.clear();
  _nodeCache.set(k,n);
  return n;
}
let _ch = 0, _ct = 0;
function colInfo(wx,wz){
  if(WORLD.type==='flat'){ _ch = FLAT_H; _ct = 0; return; }
  const fx = wx/NODE_G, fz = wz/NODE_G;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx-i, tz = fz-j;
  const a = biomeNode(i,j), b = biomeNode(i+1,j), c = biomeNode(i,j+1), d = biomeNode(i+1,j+1);
  const w00=(1-tx)*(1-tz), w10=tx*(1-tz), w01=(1-tx)*tz, w11=tx*tz;
  _ch = Math.round(a[0]*w00+b[0]*w10+c[0]*w01+d[0]*w11);
  let best = 0, bv = -1;
  for(let k=1;k<=NB;k++){
    const v = a[k]*w00+b[k]*w10+c[k]*w01+d[k]*w11;
    if(v > bv){ bv = v; best = k-1; }
  }
  _ct = best;
  if(best === 10) _ch = Math.round(_ch/3)*3;   // Badlands : relief en paliers de 3 blocs
}
function getBiomeData(wx, wz){
  colInfo(Math.floor(wx), Math.floor(wz));
  return {type:_ct, h:_ch};
}
