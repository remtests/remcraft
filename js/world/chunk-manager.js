'use strict';

// ════════════════════════════════════════════════
// GESTION DES CHUNKS (chargement progressif, file triée, purge mémoire)
// ════════════════════════════════════════════════
const dirty = new Set(), urgent = new Set();
let sortedQ = [], sortedI = 0, queueDirty = false;
let lastPCX = null, lastPCZ = null;


function unloadFarChunks(pcx,pcz){
  const U = S.renderDist+1.5, U2 = U*U;
  for(const [key,ms] of [...CHUNK_MESH]){
    const dx = ckx(key)-pcx, dz = ckz(key)-pcz;
    if(dx*dx+dz*dz > U2){ for(const m of ms){ m.geometry.dispose(); scene.remove(m); } CHUNK_MESH.delete(key); }
  }
  // FIX : les chunks MODIFIÉS par le joueur restent en mémoire (avant : constructions et blocs cassés perdus au retour)
  const D = S.renderDist+4, D2 = D*D;
  for(const key of [...CHUNK_DATA.keys()]){
    const dx = ckx(key)-pcx, dz = ckz(key)-pcz;
    if(dx*dx+dz*dz > D2 && !CHUNK_META.get(key).edited){ CHUNK_DATA.delete(key); CHUNK_META.delete(key); }
  }
  _lcx = 1e9; _ld = null;
}

function updateVisibleChunks(force=false){
  const pcx = Math.floor(P.x/CSIZ), pcz = Math.floor(P.z/CSIZ);
  if(!force && pcx===lastPCX && pcz===lastPCZ) return;
  lastPCX = pcx; lastPCZ = pcz;
  unloadFarChunks(pcx,pcz);
  const RD = S.renderDist, r2 = (RD+0.5)*(RD+0.5);
  for(let dx=-RD;dx<=RD;dx++) for(let dz=-RD;dz<=RD;dz++){
    if(dx*dx+dz*dz > r2) continue;
    const k = ckey(pcx+dx,pcz+dz);
    if(!CHUNK_MESH.has(k)) dirty.add(k);
  }
  queueDirty = true;
}

function rebuildAllChunks(){
  for(const k of CHUNK_MESH.keys()) dirty.add(k);
  queueDirty = true;
}

// Marque les chunks à reconstruire. Les voisins immédiats sont reconstruits tout de suite (pas de trou visible) ;
// ceux touchés seulement par la propagation de lumière sont étalés sur les frames suivantes.
function markDirty(wx,wy,wz,light){
  const cx = wx>>4, cz = wz>>4, lx = wx&15, lz = wz&15;
  urgent.add(ckey(cx,cz));
  if(lx===0)  urgent.add(ckey(cx-1,cz));
  if(lx===15) urgent.add(ckey(cx+1,cz));
  if(lz===0)  urgent.add(ckey(cx,cz-1));
  if(lz===15) urgent.add(ckey(cx,cz+1));
  const reach = light ? 14 : (_hmChanged ? 6 : 0);
  if(reach){
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
      if(!dx&&!dz) continue;
      const ddx = dx<0 ? lx+1 : dx>0 ? 16-lx : 0, ddz = dz<0 ? lz+1 : dz>0 ? 16-lz : 0;
      if(ddx+ddz <= reach){
        const k = ckey(cx+dx,cz+dz);
        if(CHUNK_MESH.has(k) && !urgent.has(k)){ dirty.add(k); queueDirty = true; }
      }
    }
  }
}

function processChunkQueue(){
  const t0 = performance.now();
  if(urgent.size){
    for(const k of urgent){ buildChunkMesh(ckx(k),ckz(k)); dirty.delete(k); }
    urgent.clear();
  }
  if(!dirty.size) return;
  if(queueDirty){
    const pcx = lastPCX, pcz = lastPCZ, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const score = k => { const dx = ckx(k)-pcx, dz = ckz(k)-pcz; return dx*dx+dz*dz + ((dx*fx+dz*fz) < -1 ? 14 : 0); };
    sortedQ = [...dirty].map(k=>[score(k),k]).sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
    sortedI = 0; queueDirty = false;
  }
  const RD1 = (S.renderDist+1)*(S.renderDist+1);
  let built = 0;
  while(sortedI < sortedQ.length){
    const k = sortedQ[sortedI++];
    if(!dirty.has(k)) continue;
    dirty.delete(k);
    const dx = ckx(k)-lastPCX, dz = ckz(k)-lastPCZ;
    if(dx*dx+dz*dz > RD1) continue;
    buildChunkMesh(ckx(k),ckz(k));
    built++;
    if(performance.now()-t0 >= CHUNK_BUDGET) break;
  }
}
