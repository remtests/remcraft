'use strict';

// ════════════════════════════════════════════════
// WORLD — INFINI, y de -60 (bedrock) à +89, biomes, grottes
// ════════════════════════════════════════════════
const CSIZ = 16;          // chunk XZ
const CHH  = 180;         // hauteur chunk = 180 blocs (−90 .. +89)
const Y_OFF = 90;         // local_y = world_y + Y_OFF
const Y_MIN = -60;        // plancher du monde = couche de bedrock
const Y_MAX =  89;
const BED_LY = Y_MIN + Y_OFF;   // index local de la couche de bedrock (y = -60) ; en dessous : rien n'est généré

// Données : Uint8Array(16*16*180), layout par COLONNE : (lx*16+lz)*CHH + ly (colonnes contiguës → copie rapide)
const CHUNK_DATA = new Map();
// Méta par chunk : hauteurs (bloc le plus haut / le plus haut qui bloque la lumière) + flag "modifié par le joueur"
const CHUNK_META = new Map();
// Sources de lumière posées par le joueur (torches) — évite tout scan 3D
const LIGHTSRC = new Map();

const ckey = (cx,cz) => (cx+32768)*65536 + (cz+32768);   // clé numérique (plus de strings)
const cKey = ckey;
const ckx = k => Math.floor(k/65536) - 32768;
const ckz = k => (k % 65536) - 32768;
function lIdx(lx,ly,lz){ return (lx*CSIZ+lz)*CHH+ly; }

// Tables de propriétés des blocs
const KNOWN  = new Uint8Array(256);   // id connu
const OPAQUE = new Uint8Array(256);   // bloc plein : cache les faces voisines et bloque la lumière
const HMB    = new Uint8Array(256);   // bloque la lumière du ciel pour la heightmap (opaque ou feuilles)
const BCLS   = new Uint8Array(256);   // classe de mesh : 0 solide, 1 cutout, 2 verre, 3 eau
const PLANT  = new Uint8Array(256);   // modèles en croix (herbe haute, fleurs, stalactites)
const AXIS   = new Uint8Array(256);   // bûches horizontales : 1 = axe X, 2 = axe Z
const HASFRONT = new Uint8Array(256); // blocs orientés avec une face avant (coffre, four)
for(const id in BLOCKS){
  const bd = BLOCKS[id], t = bd.tTop;
  KNOWN[id] = 1;
  const isCross = !!(bd.plant || bd.cross), isLeaf = !!bd.leaves, isGlass = !!bd.glass;   // flags posés dans blocks.js
  PLANT[id] = isCross ? 1 : 0;
  AXIS[id] = bd.axis==='x' ? 1 : bd.axis==='z' ? 2 : 0;
  HASFRONT[id] = bd.tFront ? 1 : 0;
  const transp = (isLeaf||isGlass||t==='torch_block'||t==='water'||isCross);
  OPAQUE[id] = transp ? 0 : 1;
  HMB[id]    = (OPAQUE[id] || isLeaf) ? 1 : 0;
  BCLS[id]   = isGlass ? 2 : t==='water' ? 3 : (isLeaf||t==='torch_block'||isCross) ? 1 : 0;
}
OPAQUE[27] = 0; HMB[27] = 1;   // coffre : bloc non plein (14×14×14) → les voisins gardent leurs faces, mais il bloque toujours le ciel
OPAQUE[22] = 0; HMB[22] = 1;   // cactus : bloc non plein (14×14×16) → les voisins gardent leurs faces, mais il bloque toujours le ciel
OPAQUE[255] = 1;   // sentinelle de la région de meshing

function recomputeColumn(d, m, col){
  const b = col*CHH;
  let top = 0, hm = 0;
  for(let y=CHH-1; y>=0; y--){
    const id = d[b+y];
    if(!id || !KNOWN[id]) continue;
    if(!top) top = y+1;
    if(HMB[id]){ hm = y+1; break; }
  }
  const oldHm = m.hmL[col];
  m.top[col] = top; m.hmL[col] = hm;
  return oldHm !== hm;
}

let _lcx = 1e9, _lcz = 1e9, _ld = null;   // cache du dernier chunk lu
function getChunkData(cx,cz){
  return CHUNK_DATA.get(ckey(cx,cz)) || generateChunk(cx,cz);
}
function getB(wx,wy,wz){
  wy = Math.floor(wy);
  if(wy<Y_MIN||wy>Y_MAX) return 0;
  wx = Math.floor(wx); wz = Math.floor(wz);
  const cx = wx>>4, cz = wz>>4;
  let d;
  if(cx===_lcx && cz===_lcz) d = _ld;
  else { d = CHUNK_DATA.get(ckey(cx,cz)) || generateChunk(cx,cz); _lcx=cx; _lcz=cz; _ld=d; }
  return d[((wx&15)*CSIZ+(wz&15))*CHH + wy + Y_OFF];
}
// Multijoueur (PeerJS) : état partagé, défini ici car setB / spawnDrop le consultent
const MP = {peer:null, role:null, pid:null, code:null, hostConn:null, conns:new Map(), players:new Map(),
            open:false, applying:false, fireApply:false, started:false, spawn:null,
            edits:new Map(), eq:[], pseq:0, dseq:0, chestSig:new Map(), chestKey:null, chestT:0, lastSend:0, tmT:0, armT:0, armSig:'',
            name:mpLoadName()};
const CACT_Q = [];   // cactus à vérifier (support) : alimentée par setB, traitée par updateCactus
let _hmChanged = false;
function setB(wx,wy,wz,v){
  wx=Math.floor(wx); wy=Math.floor(wy); wz=Math.floor(wz);
  _hmChanged = false;
  if(wy<Y_MIN||wy>Y_MAX) return false;
  const cx=wx>>4, cz=wz>>4, col=(wx&15)*CSIZ+(wz&15);
  const d = getChunkData(cx,cz), m = CHUNK_META.get(ckey(cx,cz));
  const i = col*CHH + wy + Y_OFF, old = d[i];
  if(old===v) return false;
  d[i] = v;
  m.edited = true;                       // ce chunk ne sera plus jamais purgé de la mémoire
  const lk = wx+','+wy+','+wz;
  if(old===20) LIGHTSRC.delete(lk);
  if(v===20)   LIGHTSRC.set(lk,{x:wx,y:wy,z:wz,lvl:14});
  _hmChanged = recomputeColumn(d,m,col);
  // cactus : si le bloc dessous disparaît (ou si on en pose un sur du vide), il devra se casser
  if(v===0 && wy+1<=Y_MAX && getB(wx,wy+1,wz)===22) CACT_Q.push([wx,wy+1,wz]);
  else if(v===22 && wy>Y_MIN && getB(wx,wy-1,wz)===0) CACT_Q.push([wx,wy,wz]);
  if(!MP.applying) mpSendEdit(wx,wy,wz,v);   // multijoueur : on journalise chaque modification (et on la diffuse si une partie est ouverte)
  return true;
}
