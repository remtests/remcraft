'use strict';

// ════════════════════════════════════════════════
// GÉNÉRATION DU NETHER — dérivée de la graine du monde (WORLD_SEED), comme l'Overworld
// ════════════════════════════════════════════════
// 1. Terrain : bruit 3D (3 octaves) + biais vertical (plein près du sol et du plafond) → grande caverne avec îles, piliers et voûtes en netherrack.
//    Plancher et plafond de bedrock irréguliers, océan de lave jusqu'à NETHER_LAVA_Y.
// 2. Biomes : 5 biomes tirés d'un climat (température, humidité) en bruit 2D, par proximité avec 5 points de référence (comme le multi-bruit de Minecraft).
//    Chacun modifie le relief (plaine de sable d'âmes, piliers de basalte…) puis la surface (voir plus bas).
// 3. Minerais : filons de quartz, d'or, et d'ancient debris (profond, jamais au contact de l'air ou de la lave).
// 4. Gros champignons (les « arbres » du Nether) dans les forêts cramoisie et biscornue : tige de 5 à 11 blocs (parfois épaisse), chapeau de verrues, shroomlights.
//    Un champignon ne dépend jamais des chunks voisins : son empreinte (rayon ≤ 4) tient dans son chunk.
// La densité est échantillonnée sur une grille grossière alignée sur les coordonnées du MONDE (4 en x/z, 8 en y) puis interpolée :
// les chunks voisins partagent leurs échantillons de bord → aucune couture, et c'est ~30× moins de bruit à calculer.
// Appelé par generateChunk() quand CUR_DIM === 'nether' ; remplit data/meta d'un chunk neuf. meta.bio reste à 0 : le biome du Nether se lit avec netherBiomeAt().
const NETHERRACK_ID = BID('netherrack'), NETHER_BEDROCK_ID = BID('bedrock'), NETHER_LAVA_ID = BID('lava');
const NG = {   // ids des blocs posés par la génération
  soulSand:BID('soul_sand'), soulSoil:BID('soul_soil'), basalt:BID('basalt'), blackstone:BID('blackstone'), gravel:BID('gravel'),
  crimsonNylium:BID('crimson_nylium'), warpedNylium:BID('warped_nylium'),
  crimsonRoots:BID('crimson_roots'), warpedRoots:BID('warped_roots'), sprouts:BID('nether_sprouts'), crimsonFungus:BID('crimson_fungus'), warpedFungus:BID('warped_fungus'),
  quartz:BID('nether_quartz_ore'), gold:BID('nether_gold_ore'), debris:BID('ancient_debris'),
  crimsonStem:BID('crimson_stem'), warpedStem:BID('warped_stem'), netherWart:BID('nether_wart_block'), warpedWart:BID('warped_wart_block'), shroomlight:BID('shroomlight'),
};
const NG_STEP_XZ = 4, NG_STEP_Y = 8;
const NG_NX = CSIZ/NG_STEP_XZ + 1, NG_NY = Math.ceil((Y_MAX - Y_MIN)/NG_STEP_Y) + 2;

// ── Biomes ──
const NETHER_BIOME_IDS   = ['nether_wastes', 'soul_sand_valley', 'crimson_forest', 'warped_forest', 'basalt_deltas'];
const NETHER_BIOME_NAMES = ['Nether Wastes', 'Soul Sand Valley', 'Crimson Forest', 'Warped Forest', 'Basalt Deltas'];
const NB_WASTES = 0, NB_SOUL = 1, NB_CRIMSON = 2, NB_WARPED = 3, NB_BASALT = 4;
const NB_REF = [[0, 0], [0.1, -0.65], [0.65, 0.15], [0.1, 0.7], [-0.65, 0.1]];   // (température, humidité) de chaque biome
const NETHER_FOG = [[0.20, 0.03, 0.03], [0.106, 0.278, 0.27], [0.20, 0.012, 0.03], [0.10, 0.02, 0.10], [0.41, 0.37, 0.44]];   // couleur du ciel / du brouillard
let _nFog = NETHER_FOG[0].slice();

// Climat en (x,z) : [température, humidité], environ dans [-1, 1]
function netherClimate(wx, wz){
  const sd = WORLD_SEED;
  return [
    (perlin2(wx*0.0015, wz*0.0015, sd^0x4e455437) + perlin2(wx*0.0045, wz*0.0045, sd^0x4e455438)*0.25)*1.7,
    (perlin2(wx*0.0015, wz*0.0015, sd^0x4e455439) + perlin2(wx*0.0045, wz*0.0045, sd^0x4e45543a)*0.25)*1.7,
  ];
}
// Biome en (x,z) : indice de NETHER_BIOME_IDS (le plus proche en climat)
function netherBiomeAt(wx, wz){
  const c = netherClimate(wx, wz);
  let best = 0, bd = Infinity;
  for(let i = 0; i < 5; i++){ const d = (c[0]-NB_REF[i][0])**2 + (c[1]-NB_REF[i][1])**2; if(d < bd){ bd = d; best = i; } }
  return best;
}
// Poids de chaque biome en (x,z) (somme 1) : mélange progressif du relief aux frontières
function netherBiomeWeights(wx, wz, out){
  const c = netherClimate(wx, wz); let sum = 0;
  for(let i = 0; i < 5; i++){ out[i] = Math.exp(-((c[0]-NB_REF[i][0])**2 + (c[1]-NB_REF[i][1])**2)/0.07); sum += out[i]; }
  for(let i = 0; i < 5; i++) out[i] /= sum;
  return out;
}
// Appelé à chaque frame par l'ambiance (day-night-cycle.js) : fond le brouillard vers la couleur du biome du joueur
function netherFogStep(){
  const t = NETHER_FOG[netherBiomeAt(P.x, P.z)];
  for(let i = 0; i < 3; i++) _nFog[i] += (t[i] - _nFog[i])*0.04;
}

// Densité en un point : > 0 = bloc plein. w = poids des biomes de la colonne, pil = bruit des piliers de basalte.
// (La plaine de la vallée des âmes n'est pas ici : trop fine pour la grille grossière, elle est construite colonne par colonne dans generateNetherChunk.)
function netherDensity(wx, wy, wz, sd, w, pil){
  const n = perlin3(wx*0.022, wy*0.034, wz*0.022, sd^0x4e455431)*0.62
          + perlin3(wx*0.050, wy*0.070, wz*0.050, sd^0x4e455432)*0.28
          + perlin3(wx*0.110, wy*0.130, wz*0.110, sd^0x4e455433)*0.10;
  const floorBias = Math.max(0, (Y_MIN + 22 - wy)/22), ceilBias = Math.max(0, (wy - (Y_MAX - 32))/32);
  let d = n + (floorBias + ceilBias)*1.6 - 0.07;
  const rise = Math.min(1, Math.max(0, (wy - (NETHER_LAVA_Y - 8))/6))*Math.min(1, Math.max(0, (NETHER_LAVA_Y + 34 - wy)/10));
  d += w[NB_BASALT]*pil*rise*2.2;                                              // deltas : piliers qui sortent de la lave
  d += (w[NB_CRIMSON] + w[NB_WARPED])*0.04;                                    // forêts : un peu plus de matière
  return d;
}

// Filon : marche aléatoire dans la netherrack du chunk ; noAir : retire les cases en contact avec l'air, la lave ou le bord du chunk
function netherVein(data, rng, id, size, ylo, yhi, noAir){
  let x = (rng()*CSIZ)|0, z = (rng()*CSIZ)|0, y = ylo + ((rng()*(yhi - ylo + 1))|0);
  const placed = [];
  for(let n = 0; n < size; n++){
    if(x >= 0 && x < CSIZ && z >= 0 && z < CSIZ && y >= Y_MIN + 4 && y <= Y_MAX - 4){
      const i = (x*CSIZ + z)*CHH + y + Y_OFF;
      if(data[i] === NETHERRACK_ID){ data[i] = id; placed.push(x, y, z); }
    }
    const r = (rng()*6)|0;
    if(r === 0) x++; else if(r === 1) x--; else if(r === 2) z++; else if(r === 3) z--; else if(r === 4) y++; else y--;
  }
  if(!noAir) return;
  for(let k = 0; k < placed.length; k += 3){
    const px = placed[k], py = placed[k+1], pz = placed[k+2];
    let exposed = false;
    for(let f = 0; f < 6 && !exposed; f++){
      const nx = px + (f === 0) - (f === 1), ny = py + (f === 2) - (f === 3), nz = pz + (f === 4) - (f === 5);
      if(nx < 0 || nx >= CSIZ || nz < 0 || nz >= CSIZ){ exposed = true; break; }
      const v = data[(nx*CSIZ + nz)*CHH + ny + Y_OFF];
      if(v === 0 || v === NETHER_LAVA_ID) exposed = true;
    }
    if(exposed) data[(px*CSIZ + pz)*CHH + py + Y_OFF] = NETHERRACK_ID;
  }
}

// Gros champignon dont la tige part du sol (lx, wy, lz) ; renvoie false si la place manque (colonne ou chapeau bloqués). Toute l'empreinte (rayon ≤ 4) reste dans le chunk
// → pas de dépendance entre chunks voisins, génération déterministe. Chapeau : verrues posées uniquement dans l'air ; shroomlights enregistrés dans meta.esrc (lumière).
function netherHugeFungus(data, meta, rng, lx, wy, lz, crimson){
  const h = 5 + ((rng()*7)|0), ty = wy + h;
  const solidAt = (x, z) => { const v = data[(x*CSIZ + z)*CHH + wy + Y_OFF]; return v !== 0 && v !== NETHER_LAVA_ID && !(v === NG.crimsonRoots || v === NG.warpedRoots || v === NG.sprouts || v === NG.crimsonFungus || v === NG.warpedFungus); };
  const thick = rng() < 0.15 && solidAt(lx+1, lz) && solidAt(lx, lz+1) && solidAt(lx+1, lz+1);   // tige épaisse (2×2) seulement si les 4 colonnes reposent sur du plein
  const stem = crimson ? NG.crimsonStem : NG.warpedStem, wart = crimson ? NG.netherWart : NG.warpedWart;
  const free = v => v === 0 || v === NG.crimsonRoots || v === NG.warpedRoots || v === NG.sprouts || v === NG.crimsonFungus || v === NG.warpedFungus;
  const cols = thick ? [[0,0],[1,0],[0,1],[1,1]] : [[0,0]];
  for(const [dx,dz] of cols) for(let y = wy + 1; y <= ty + 1; y++) if(!free(data[((lx+dx)*CSIZ + lz+dz)*CHH + y + Y_OFF])) return false;   // la tige et le haut du chapeau passent
  const cx = lx + (thick ? 0.5 : 0), cz = lz + (thick ? 0.5 : 0), es = meta.esrc || (meta.esrc = []);
  for(const [dx,dz] of cols) for(let y = wy + 1; y <= ty; y++) data[((lx+dx)*CSIZ + lz+dz)*CHH + y + Y_OFF] = stem;
  // chapeau : 4 couches (haut → bas) ; d2 = distance² au centre de la tige
  const layers = [[1, 0, 1.5, 0.00], [0, 0, 6.5, crimson ? 0.04 : 0.14], [-1, 0, 10.5, crimson ? 0.08 : 0.06], [-2, 5.5, 10.5, crimson ? 0.38 : 0.26]];   // [dy, d2 min, d2 max, proba de shroomlight]
  for(const [dy, lo, hi, pLight] of layers){
    for(let x = Math.floor(cx) - 4; x <= Math.ceil(cx) + 4; x++) for(let z = Math.floor(cz) - 4; z <= Math.ceil(cz) + 4; z++){
      if(x < 0 || x >= CSIZ || z < 0 || z >= CSIZ) continue;
      const d2 = (x - cx)*(x - cx) + (z - cz)*(z - cz);
      if(d2 > hi || d2 < lo) continue;
      const i = (x*CSIZ + z)*CHH + ty + dy + Y_OFF;
      if(!free(data[i])) continue;
      const light = pLight > 0 && rng() < pLight;
      data[i] = light ? NG.shroomlight : wart;
      if(light) es.push(meta.x0 + x, ty + dy, meta.z0 + z);
    }
  }
  return true;
}

const _ngS = new Float32Array(NG_NX*NG_NX*NG_NY), _ngW = new Float32Array(5), _ngBi = new Uint8Array(CSIZ*CSIZ);
function generateNetherChunk(data, meta, cx, cz){
  const SD = WORLD_SEED, x0 = cx*CSIZ, z0 = cz*CSIZ;
  // 1. terrain : densité aux nœuds de la grille (le climat et le bruit des piliers ne dépendent que de (x,z) : une fois par colonne de nœuds)
  for(let i = 0; i < NG_NX; i++) for(let k = 0; k < NG_NX; k++){
    const wx = x0 + i*NG_STEP_XZ, wz = z0 + k*NG_STEP_XZ;
    netherBiomeWeights(wx, wz, _ngW);
    const pil = Math.max(0, perlin2(wx*0.06, wz*0.06, SD^0x4e45543b) - 0.05)*3.5;
    for(let j = 0; j < NG_NY; j++) _ngS[(i*NG_NX + k)*NG_NY + j] = netherDensity(wx, Y_MIN + j*NG_STEP_Y, wz, SD, _ngW, pil);
  }
  const at = (i,k,j) => _ngS[(i*NG_NX + k)*NG_NY + j];
  for(let lx = 0; lx < CSIZ; lx++) for(let lz = 0; lz < CSIZ; lz++) _ngBi[lx*CSIZ + lz] = netherBiomeAt(x0 + lx, z0 + lz);
  for(let lx = 0; lx < CSIZ; lx++){
    const ix = (lx/NG_STEP_XZ)|0, fx = (lx%NG_STEP_XZ)/NG_STEP_XZ, wx = x0 + lx;
    for(let lz = 0; lz < CSIZ; lz++){
      const iz = (lz/NG_STEP_XZ)|0, fz = (lz%NG_STEP_XZ)/NG_STEP_XZ, wz = z0 + lz, col = lx*CSIZ + lz, base = col*CHH;
      for(let wy = Y_MIN; wy <= Y_MAX; wy++){
        const j = ((wy - Y_MIN)/NG_STEP_Y)|0, fy = ((wy - Y_MIN)%NG_STEP_Y)/NG_STEP_Y;
        const a = at(ix,iz,j)     + (at(ix+1,iz,j)     - at(ix,iz,j))*fx,     b = at(ix,iz+1,j)     + (at(ix+1,iz+1,j)     - at(ix,iz+1,j))*fx;
        const c = at(ix,iz,j+1)   + (at(ix+1,iz,j+1)   - at(ix,iz,j+1))*fx,   d = at(ix,iz+1,j+1)   + (at(ix+1,iz+1,j+1)   - at(ix,iz+1,j+1))*fx;
        const lo = a + (b - a)*fz, hi = c + (d - c)*fz, dens = lo + (hi - lo)*fy;
        let id = 0;
        if(wy <= Y_MIN + 3 && (wy === Y_MIN || hash2(wx, wz + wy*131, SD^0x4e455434) < (3 - (wy - Y_MIN))/4)) id = NETHER_BEDROCK_ID;          // plancher
        else if(wy >= Y_MAX - 3 && (wy === Y_MAX || hash2(wx, wz + wy*131, SD^0x4e455435) < (3 - (Y_MAX - wy))/4)) id = NETHER_BEDROCK_ID;   // plafond
        else if(dens > 0) id = NETHERRACK_ID;
        else if(wy <= NETHER_LAVA_Y) id = NETHER_LAVA_ID;
        data[base + wy + Y_OFF] = id;
      }
      meta.bio[col] = 0;
      if(_ngBi[col] === NB_SOUL && perlin2(wx*0.035, wz*0.035, SD^0x4e45543f) <= 0.5){   // vallée des âmes : plaine à quelques blocs au-dessus de la lave, avec des mares de lave
        const top = NETHER_LAVA_Y + 3 + Math.round(perlin2(wx*0.05, wz*0.05, SD^0x4e45543e)*1.5);
        for(let wy = Y_MIN + 5; wy <= top; wy++){ const i = base + wy + Y_OFF; if(data[i] === 0 || data[i] === NETHER_LAVA_ID) data[i] = NETHERRACK_ID; }
      }
    }
  }

  // 2. minerais (avant la surface : seules les cases de netherrack sont remplacées)
  const rng = mkRng(((SD^0x4e455440) + Math.imul(cx, 374761393) + Math.imul(cz, 668265263))|0);
  for(let n = 0; n < 8; n++) netherVein(data, rng, NG.quartz, 10, Y_MIN + 6, Y_MAX - 6, false);
  for(let n = 0; n < 4; n++) netherVein(data, rng, NG.gold, 8, Y_MIN + 6, Y_MAX - 6, false);
  if(rng() < 0.6) netherVein(data, rng, NG.debris, 3, Y_MIN + 6, NETHER_LAVA_Y + 8, true);

  // 3. surface selon le biome de la colonne : seules les cases de netherrack qui ont de l'air au-dessus changent (les parois et plafonds restent en netherrack)
  for(let lx = 0; lx < CSIZ; lx++) for(let lz = 0; lz < CSIZ; lz++){
    const wx = x0 + lx, wz = z0 + lz, base = (lx*CSIZ + lz)*CHH, bi = _ngBi[lx*CSIZ + lz];
    const patch = perlin2(wx*0.07, wz*0.07, SD^0x4e45543c);
    for(let wy = Y_MAX - 4; wy > Y_MIN + 3; wy--){
      const i = base + wy + Y_OFF;
      if(data[i] !== NETHERRACK_ID || data[i+1] !== 0) continue;
      const r = hash2(wx, wz + wy*131, SD^0x4e45543d);
      let top = NETHERRACK_ID, plant = 0;
      if(bi === NB_WASTES){
        if(wy <= NETHER_LAVA_Y + 6 && patch > 0.25) top = NG.soulSand;
        else if(patch < -0.45) top = NG.gravel;
      } else if(bi === NB_SOUL){
        top = patch > 0.05 ? NG.soulSand : NG.soulSoil;
        if(data[i-1] === NETHERRACK_ID) data[i-1] = top;   // deux couches
      } else if(bi === NB_CRIMSON){
        top = NG.crimsonNylium;
        plant = r < 0.16 ? NG.crimsonRoots : r < 0.19 ? NG.crimsonFungus : 0;
      } else if(bi === NB_WARPED){
        top = NG.warpedNylium;
        plant = r < 0.14 ? NG.warpedRoots : r < 0.24 ? NG.sprouts : r < 0.26 ? NG.warpedFungus : 0;
      } else {
        top = patch > 0.15 ? NG.blackstone : NG.basalt;
      }
      data[i] = top;
      if(plant) data[i+1] = plant;
    }
  }

  // 4. gros champignons : au plus 22 essais par chunk, sur le premier sol de nylium (du bas vers le haut) qui offre assez de hauteur libre ; espacement minimum de 4 blocs
  meta.x0 = x0; meta.z0 = z0;
  const trng = mkRng(((SD^0x4e455441) + Math.imul(cx, 668265263) + Math.imul(cz, 374761393))|0), placed = [];
  for(let n = 0; n < 22; n++){
    const lx = 3 + ((trng()*9)|0), lz = 3 + ((trng()*9)|0), bi = _ngBi[lx*CSIZ + lz];   // 3..11 : l'empreinte (rayon 4 + tige épaisse) reste dans le chunk
    if(bi !== NB_CRIMSON && bi !== NB_WARPED) continue;
    if(placed.some(p => (p[0]-lx)*(p[0]-lx) + (p[1]-lz)*(p[1]-lz) < 16)) continue;
    const nylium = bi === NB_CRIMSON ? NG.crimsonNylium : NG.warpedNylium, base = (lx*CSIZ + lz)*CHH;
    for(let wy = NETHER_LAVA_Y + 1; wy <= Y_MAX - 16; wy++){   // du bas vers le haut : le premier sol de nylium qui offre assez de hauteur libre
      if(data[base + wy + Y_OFF] !== nylium) continue;
      if(netherHugeFungus(data, meta, trng, lx, wy, lz, bi === NB_CRIMSON)){ placed.push([lx, lz]); break; }
    }
  }

  // lumière de la lave : quelques cases de surface par chunk éclairent la caverne (meta.lsrc lu par le mesher, comme pour la lave de l'Overworld)
  for(let lx = 1; lx < CSIZ; lx += 4) for(let lz = 1; lz < CSIZ; lz += 4){
    const base = (lx*CSIZ + lz)*CHH, ly = NETHER_LAVA_Y + Y_OFF;
    if(data[base + ly] === NETHER_LAVA_ID && data[base + ly + 1] === 0) (meta.lsrc || (meta.lsrc = [])).push(x0 + lx, NETHER_LAVA_Y, z0 + lz);
  }
  for(let col = 0; col < CSIZ*CSIZ; col++) recomputeColumn(data, meta, col);
}
