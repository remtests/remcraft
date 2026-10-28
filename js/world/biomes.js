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
// température seule (même bruit que _bT) : sert à placer la neige (taïga enneigée, ligne des neiges des montagnes) sans recalculer tout le climat
function tempAt(wx, wz){ const sc = BIOME_SCALE; return octave2d(wx/(520*sc)-71.3, wz/(520*sc)+23.9, 3, WORLD_SEED^808, 2.0, 0.55); }
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
    // montagnes : seulement la masse large (lissée sur les nœuds). Crêtes, pics et ravins sont ajoutés
    // ensuite colonne par colonne dans terrainRelief(), sans lissage, pour rester vifs.
    const massif = octave2d(wx/350, wz/350, 4, S0^400, 2.05, 0.60);
    h = 16 + massif*34 + base*12 + detail*3;
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

// ══════════════════════════════════════════════════════════
// RELIEF PAR COLONNE — croise plusieurs bruits, non lissés (donc vifs) :
//   · déformation de domaine (warp) à deux échelles → tout est tordu, rien n'est aligné sur la grille
//   · collines « lump » : fbm anisotrope (étiré) → bosses allongées et difformes
//   · crêtes « ridged » multifractales, modulées par les bosses → arêtes irrégulières
//   · pics de Voronoï en cône, de hauteurs variées → aiguilles isolées
//   · ravins : |Perlin| (fond en V) · micro-relief : deux fréquences hautes
//   · masque de chaos (grande échelle) : zones tourmentées / zones calmes
// Chaque contribution est dosée par les poids de biome de la colonne (interpolés → transitions douces).
// ══════════════════════════════════════════════════════════
//                     plaines forêt  mont.  désert  centen. savane taïga jungle fleurie venteux badlands
const R_RIDGE = [      0,     2.5,   30,    2.5,    2.5,    0,     5,    5,     1.5,   15,     5   ];
const R_GULLY = [      1,     2.5,   5,     0,      2.5,    0.6,   3,    4,     2,     7,      3   ];
const R_SPIRE = [      0,     0,     22,    0,      0,      0,     0,    0,     0,     8,      3   ];
const R_LUMP  = [      3.5,   8,     11,    3.5,    7,      3.5,   9,    10,    7,     15,     6   ];
const R_MICRO = [      0.8,   1.3,   2.6,   0.7,    1.1,    0.7,   1.5,  2.0,   1.1,   3.0,    0.9 ];
const RIDGE_MEAN = 0.33;     // moyenne empirique de ridged2 : recentre la contribution pour ne pas décaler l'altitude moyenne
const _W = new Float32Array(NB);
function terrainRelief(wx, wz, hm){
  let cR=0, cG=0, cS=0, cL=0, cM=0;
  for(let k=0;k<NB;k++){
    const w = _W[k]; if(w < 0.004) continue;
    cR += w*R_RIDGE[k]; cG += w*R_GULLY[k]; cS += w*R_SPIRE[k]; cL += w*R_LUMP[k]; cM += w*R_MICRO[k];
  }
  const S0 = WORLD_SEED;
  // plus on est haut, plus le relief est marqué ; le masque de chaos fait varier l'intensité d'une région à l'autre
  const env   = 0.55 + 0.9*clamp01((hm-6)/42);
  const chaos = 0.35 + 1.3*octave2d(wx/260+19.3, wz/260-7.1, 2, S0^1101, 2.0, 0.5);
  const amp   = env*chaos;
  // déformation de domaine
  const qx = wx + perlin2(wx/72,      wz/72,      S0^1201)*24 + perlin2(wx/21+5.3, wz/21-2.9, S0^1202)*4.5;
  const qz = wz + perlin2(wx/72+41.7, wz/72-13.1, S0^1203)*24 + perlin2(wx/21-8.8, wz/21+6.4, S0^1204)*4.5;
  let r = 0, lv = 0.5;
  if(cL > 0.05 || cR > 0.05){
    lv = octave2d(qx/64, qz/105, 3, S0^1301, 2.15, 0.5);        // bosses allongées (étirées selon Z)
    r += cL * 2.6 * (lv - 0.5);
  }
  if(cR > 0.05) r += cR * (ridged2(qx/95, qz/95, 4, S0^1401, 2.1, 2.0) - RIDGE_MEAN) * (0.6 + 0.8*lv);
  if(cS > 0.05){
    voronoi2(qx/44, qz/44, S0^1501);
    const cone = 1 - _vF1/0.8;
    if(cone > 0) r += cS * Math.pow(cone, 1.35) * (0.4 + 0.6*_vH);
  }
  if(cG > 0.05) r += cG * 2 * (Math.abs(perlin2(qx/38, qz/38, S0^1601)) - 0.3);
  r += cM * (perlin2(wx/9+11.1, wz/9-3.7, S0^1701)*0.7 + perlin2(wx/4.3-6.2, wz/4.3+9.9, S0^1702)*0.3);
  let h = hm + r*amp;
  if(h > 56) h = 56 + 22*Math.tanh((h-56)/22);   // plafond doux (≈ 78) : les pics restent pointus au lieu d'être écrêtés en plateau
  if(h < 4) h = 4;
  return h;
}
function colInfo(wx,wz){
  if(WORLD.type==='flat'){ _ch = FLAT_H; _ct = 0; return; }
  const fx = wx/NODE_G, fz = wz/NODE_G;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx-i, tz = fz-j;
  const a = biomeNode(i,j), b = biomeNode(i+1,j), c = biomeNode(i,j+1), d = biomeNode(i+1,j+1);
  const w00=(1-tx)*(1-tz), w10=tx*(1-tz), w01=(1-tx)*tz, w11=tx*tz;
  const hm = a[0]*w00+b[0]*w10+c[0]*w01+d[0]*w11;   // hauteur macro (lissée)
  let best = 0, bv = -1;
  for(let k=1;k<=NB;k++){
    const v = a[k]*w00+b[k]*w10+c[k]*w01+d[k]*w11;
    _W[k-1] = v;
    if(v > bv){ bv = v; best = k-1; }
  }
  _ct = best;
  _ch = Math.round(terrainRelief(wx, wz, hm));
  if(best === 10) _ch = Math.round(_ch/3)*3;   // Badlands : relief en paliers de 3 blocs
}
function getBiomeData(wx, wz){
  colInfo(Math.floor(wx), Math.floor(wz));
  return {type:_ct, h:_ch};
}
