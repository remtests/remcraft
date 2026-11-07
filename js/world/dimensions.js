'use strict';

// ════════════════════════════════════════════════
// DIMENSIONS — Overworld / Nether, chacune avec son propre état
// ════════════════════════════════════════════════
// Tout ce qui est rangé par coordonnées appartient à une dimension : chunks, lumières, coffres (et leur orientation), fours, feux, fluides programmés,
// TNT, créatures, objets au sol, journal des blocs modifiés (sauvegarde + multijoueur), registre des portails.
// L'état d'une dimension = un objet {…} ; « lier » une dimension (dimBind) réaffecte les variables globales vers ses objets (O(1), aucune copie).
// Le reste du code ne change pas : il lit et écrit toujours « le monde courant ». CUR_DIM dit lequel.
//   dimSwitch(id)  : le joueur change de dimension (retire l'affichage de l'ancienne, lie la nouvelle, relance le chargement des chunks)
//   withDim(id, f) : exécute f dans une autre dimension sans toucher à l'affichage (messages réseau, sauvegarde)
const DIM_IDS = ['overworld', 'nether'];
const DIMS = {};

function _dimFresh(){
  return {
    chunkData:new Map(), chunkMeta:new Map(), lightsrc:new Map(), cactQ:[], mesh:new Map(), dirty:new Set(), urgent:new Set(),
    chests:new Map(), chestDir:new Map(), furnaces:new Map(), furSig:new Map(), chestSig:new Map(),
    fires:new Map(), fireList:[], fireLQ:[], fbuckets:new Map(), fdue:new Map(), ftickLeft:null,
    tnts:[], tntLava:[], drops:[], mobs:[], portalCells:new Map(), edits:new Map(),
  };
}
// L'Overworld est l'état déjà créé par les autres scripts au chargement
DIMS.overworld = {
  chunkData:CHUNK_DATA, chunkMeta:CHUNK_META, lightsrc:LIGHTSRC, cactQ:CACT_Q, mesh:CHUNK_MESH, dirty:dirty, urgent:urgent,
  chests:CHESTS, chestDir:CHEST_DIR, furnaces:FURNACES, furSig:MP_FUR.sig, chestSig:MP.chestSig,
  fires:FIRES, fireList:FIRE_LIST, fireLQ:_fLQ, fbuckets:FBUCKETS, fdue:FDUE, ftickLeft:null,
  tnts:TNTS, tntLava:TNT_LAVAQ, drops:drops, mobs:MOBS, portalCells:PORTAL_CELLS, edits:MP.edits,
};
DIMS.nether = _dimFresh();

// Réaffecte les variables globales vers l'état de la dimension (sans toucher à la scène)
function dimBind(id){
  const s = DIMS[id];
  if(!s) throw new Error('Dimension inconnue : ' + id);
  CHUNK_DATA = s.chunkData; CHUNK_META = s.chunkMeta; LIGHTSRC = s.lightsrc; CACT_Q = s.cactQ;
  CHUNK_MESH = s.mesh; dirty = s.dirty; urgent = s.urgent;
  CHESTS = s.chests; CHEST_DIR = s.chestDir; FURNACES = s.furnaces; MP_FUR.sig = s.furSig; MP.chestSig = s.chestSig;
  FIRES = s.fires; FIRE_LIST = s.fireList; _fLQ = s.fireLQ; FBUCKETS = s.fbuckets; FDUE = s.fdue;
  TNTS = s.tnts; TNT_LAVAQ = s.tntLava; drops = s.drops; MOBS = s.mobs; PORTAL_CELLS = s.portalCells; MP.edits = s.edits;
  CUR_DIM = id;
  _lcx = 1e9; _lcz = 1e9; _ld = null;   // cache du dernier chunk lu (world-state.js)
}

// Exécute f dans la dimension `id` puis rend la main à la dimension courante (aucun effet sur l'affichage)
function withDim(id, f){
  if(id === CUR_DIM) return f();
  const prev = CUR_DIM;
  dimBind(id);
  try{ return f(); } finally { dimBind(prev); }
}

// Le joueur passe dans la dimension `id` : l'ancienne n'est plus affichée (ses données restent en mémoire), la nouvelle prend sa place.
// Le placement du joueur et la construction des chunks d'arrivée sont faits par l'appelant (voir portalTravel).
function dimSwitch(id){
  if(id === CUR_DIM) return;
  if(MP.open && MP.eq.length){ const e = MP.eq; MP.eq = []; mpOut({t:'b', e}); }   // modifications en attente : elles partent avec la bonne dimension
  if(typeof CHEST_CUR !== 'undefined' && CHEST_CUR && typeof closeUI === 'function'){ try{ closeUI(); }catch(e){} }
  const old = DIMS[CUR_DIM];
  // affichage de l'ancienne dimension
  for(const ms of CHUNK_MESH.values()) for(const m of ms){ m.geometry.dispose(); scene.remove(m); }
  CHUNK_MESH.clear();
  for(const d of drops) scene.remove(d.mesh);
  for(const m of MOBS) scene.remove(m.root);
  for(const t of TNTS) scene.remove(t.mesh);
  // mémoire : les chunks non modifiés se régénèrent à l'identique, on ne garde que ceux que le joueur a touchés
  for(const k of [...CHUNK_DATA.keys()]){ const m = CHUNK_META.get(k); if(!m || !m.edited){ CHUNK_DATA.delete(k); CHUNK_META.delete(k); } }
  old.ftickLeft = FTICK;
  dirty.clear(); urgent.clear();

  dimBind(id);
  const s = DIMS[id];
  // les fluides programmés l'ont été pour une date de tick : on les décale du temps passé ailleurs
  if(s.ftickLeft !== null && FTICK !== s.ftickLeft){
    const delta = FTICK - s.ftickLeft, nb = new Map(), nd = new Map();
    for(const [due, set] of FBUCKETS) nb.set(due + delta, set);
    for(const [k, due] of FDUE) nd.set(k, due + delta);
    FBUCKETS.clear(); FDUE.clear();
    for(const [due, set] of nb) FBUCKETS.set(due, set);
    for(const [k, due] of nd) FDUE.set(k, due);
  }
  s.ftickLeft = null;
  _fLit = 0; for(const f of FIRE_LIST) if(f.lit) _fLit++;
  for(const d of drops) scene.add(d.mesh);
  for(const m of MOBS) scene.add(m.root);
  for(const t of TNTS) scene.add(t.mesh);
  lastPCX = lastPCZ = null; sortedQ = []; sortedI = 0; queueDirty = true;
}
