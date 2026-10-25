'use strict';

// ════════════════════════════════════════════════
// FEU — briquet (flint_and_steel) : clic droit pour allumer, clic gauche pour éteindre.
// Se propage au bois, aux feuillages, un peu à l'herbe et aux grass blocks.
// Le feu n'est PAS un bloc du monde : c'est une entité légère (sprite animé 32 images, 1 seul draw call).
// ════════════════════════════════════════════════
const FIRE_SPRITE = "assets/textures/effects/fire.webp";
const FIRE_FRAMES = 32, FIRE_FPS = 24, MAX_FIRE = 800, FIRE_TICK = 0.25, FIRE_GMAX = 3, FIRE_MAXLIT = 40;
const FIRES = new Map(), FIRE_LIST = [];
let _fMesh = null, _fPos, _fUv, _fTex = null, _fAcc = 0, _fTime = 0, _fLit = 0, _fLT = 0;
const _fLQ = [];   // relances d'éclairage (étalées dans le temps pour ne pas saccader)
// probabilité par seconde qu'un bloc voisin d'un feu soit consumé
const FIRE_BURN  = {6:0.07, 5:0.015, 28:0.015, 29:0.015, 7:0.025, 11:0.025, 17:0.04, 27:0.025};   // feuilles, bûche, planches, établi, bibliothèque, coffre
const FIRE_PLANT = {24:1, 25:1, 26:1};                                      // herbe courte, fleurs
const _FNB = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const fkey = (x,y,z) => x+','+y+','+z;

function _initFire(){
  _fTex = new THREE.TextureLoader().load(FIRE_SPRITE);
  _fTex.magFilter = _fTex.minFilter = THREE.NearestFilter;
  _fTex.generateMipmaps = false;
  const geo = new THREE.BufferGeometry();
  _fPos = new THREE.BufferAttribute(new Float32Array(MAX_FIRE*32*3), 3).setUsage(THREE.DynamicDrawUsage);
  _fUv  = new THREE.BufferAttribute(new Float32Array(MAX_FIRE*32*2), 2).setUsage(THREE.DynamicDrawUsage);
  const idx = new Uint16Array(MAX_FIRE*48);
  for(let q=0;q<MAX_FIRE*8;q++){ const b=q*4, i=q*6; idx[i]=b; idx[i+1]=b+1; idx[i+2]=b+2; idx[i+3]=b; idx[i+4]=b+2; idx[i+5]=b+3; }
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.setAttribute('position', _fPos); geo.setAttribute('uv', _fUv);
  geo.setDrawRange(0,0);
  _fMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map:_fTex, alphaTest:0.5, side:THREE.DoubleSide, toneMapped:false}));
  _fMesh.frustumCulled = false;
  scene.add(_fMesh);
}

function igniteAt(x,y,z,gen){
  if(y<Y_MIN || y>Y_MAX || FIRE_LIST.length>=MAX_FIRE) return null;
  const k = fkey(x,y,z);
  if(FIRES.has(k)) return null;
  const b = getB(x,y,z);
  if(b){
    const bd = BLOCKS[b];
    if(!bd || bd.isFluid) return null;
    if(!FIRE_PLANT[b]) return null;                 // seule une cellule d'air (ou une plante) peut brûler
    setB(x,y,z,0); markDirty(x,y,z,false);          // l'herbe / la fleur part en fumée
  }
  gen = gen||0;
  const f = {x,y,z,k,gen, life:(2.4+Math.random()*2.0)*Math.max(0.5,1-gen*0.15), off:(Math.random()*FIRE_FRAMES)|0, lit:false, dead:false, idx:FIRE_LIST.length};
  FIRES.set(k,f); FIRE_LIST.push(f);
  if(_fLit < FIRE_MAXLIT){ f.lit = true; _fLit++; LIGHTSRC.set('f:'+k,{x,y,z,lvl:13}); _fLQ.push([x,y,z]); }
  if(MP.open) mpFireMade(f);
  return f;
}

function removeFire(f){
  if(f.dead) return;
  f.dead = true;
  if(MP.open) mpFireGone(f);
  FIRES.delete(f.k);
  const last = FIRE_LIST.pop();
  if(last !== f){ FIRE_LIST[f.idx] = last; last.idx = f.idx; }
  if(f.lit){ LIGHTSRC.delete('f:'+f.k); _fLit--; _fLQ.push([f.x,f.y,f.z]); }
}
function removeFireAt(x,y,z){ const f = FIRES.get(fkey(x,y,z)); if(f) removeFire(f); }

function fireReset(){
  for(const f of FIRE_LIST.slice()){ f.dead = true; LIGHTSRC.delete('f:'+f.k); }
  FIRES.clear(); FIRE_LIST.length = 0; _fLQ.length = 0; _fLit = 0;
}

// Un bloc inflammable est consumé : il disparaît (sans objet) et le feu prend sa place
function burnBlock(x,y,z,id){
  if(id===27){   // le contenu du coffre tombe au sol
    const kk = fkey(x,y,z), slots = CHESTS.get(kk);
    if(slots) for(const sl of slots) if(sl.id!==null && sl.n>0) spawnDrop(x+0.5, y+0.5, z+0.5, sl.id, sl.n);
    CHESTS.delete(kk); CHEST_DIR.delete(kk);
  }
  if(Math.random() < (id===6 ? 0.35 : 1)) spawnBreakParticles(x,y,z,id);
  setB(x,y,z,0); markDirty(x,y,z,false);
  igniteAt(x,y,z,0);
}

// Un bloc inflammable prend feu : il RESTE en place, enveloppé de flammes, puis est consumé à la fin de sa combustion
function igniteBlock(x,y,z,id){
  if(y<Y_MIN || y>Y_MAX || FIRE_LIST.length>=MAX_FIRE) return null;
  const k = fkey(x,y,z);
  if(FIRES.has(k)) return null;
  const dur = id===6 ? 1.2+Math.random()*1.6 : (id===5||id===28||id===29) ? 5+Math.random()*3 : 3+Math.random()*2.5;
  const f = {x,y,z,k,gen:0,block:id,life:dur,off:(Math.random()*FIRE_FRAMES)|0,lit:false,dead:false,idx:FIRE_LIST.length};
  FIRES.set(k,f); FIRE_LIST.push(f);
  if(_fLit < FIRE_MAXLIT){ f.lit = true; _fLit++; LIGHTSRC.set('f:'+k,{x,y,z,lvl:13}); _fLQ.push([x,y,z]); }
  if(MP.open) mpFireMade(f);
  return f;
}
function consumeBurning(f){
  const x=f.x, y=f.y, z=f.z, id=f.block;
  removeFire(f);
  if(getB(x,y,z)===id) burnBlock(x,y,z,id);
}

// Un pas de simulation pour un feu. Renvoie false si le feu doit s'éteindre.
function fireTick(f,dt){
  const x=f.x, y=f.y, z=f.z;
  const here = getB(x,y,z);
  if(f.block){ if(here!==f.block) return false; }   // le bloc qui brûlait a disparu
  else if(here && !FIRE_PLANT[here]) return false;  // un bloc a été posé dans la cellule
  // 1) combustibles collés au feu (6 voisins) : ils finissent par être consumés ; l'eau éteint
  let fuel = 0;
  for(const [dx,dy,dz] of _FNB){
    const nx=x+dx, ny=y+dy, nz=z+dz, nb=getB(nx,ny,nz);
    if(!nb) continue;
    if(BLOCKS[nb] && BLOCKS[nb].isFluid) return false;
    const r = FIRE_BURN[nb];
    if(r){ fuel++; if(Math.random() < r*dt) igniteBlock(nx,ny,nz,nb); }
  }
  if(f.block){ f.life -= dt; f.gen = 0; }
  else if(fuel>0){ f.life = Math.max(f.life, 2+Math.random()*2); f.gen = 0; }
  else f.life -= dt;
  // 2) saut vers un combustible en diagonale / à 1 bloc de distance (le feu passe de feuille en feuille, de branche en branche)
  for(let i=0;i<2;i++){
    const cx=x+((Math.random()*3)|0)-1, cy=y+((Math.random()*3)|0)-1, cz=z+((Math.random()*3)|0)-1;
    const r = FIRE_BURN[getB(cx,cy,cz)];
    if(r && !FIRES.has(fkey(cx,cy,cz)) && Math.random() < Math.min(1, r*1.6*dt/FIRE_TICK)) igniteBlock(cx,cy,cz,getB(cx,cy,cz));
  }
  // 3) herbe : le feu court un peu sur les grass blocks (cellule au-dessus) et dans l'herbe courte / les fleurs
  if(f.gen < FIRE_GMAX){
    for(let i=0;i<3;i++){
      const cx=x+((Math.random()*3)|0)-1, cy=y+((Math.random()*3)|0)-1, cz=z+((Math.random()*3)|0)-1;
      if(cx===x && cy===y && cz===z) continue;
      if(FIRES.has(fkey(cx,cy,cz))) continue;
      const cb = getB(cx,cy,cz);
      if(cb && !FIRE_PLANT[cb]) continue;
      if(getB(cx,cy-1,cz)!==1) continue;           // il faut un grass block dessous
      const lam = cb ? 0.2 : 0.04;                  // herbe courte : vite ; grass block nu : peu
      if(Math.random() < Math.min(1, lam*3.25*dt/FIRE_TICK)) igniteAt(cx,cy,cz, f.gen + (cb ? 0.6 : 1));
    }
  }
  return true;
}

// Cactus sans support : il se casse et lâche son objet (en cascade vers le haut). Rien au sol en créatif.
function updateCactus(){
  let guard = 0;
  while(CACT_Q.length && guard++ < 256){
    const [x,y,z] = CACT_Q.shift();
    if(getB(x,y,z)!==22 || getB(x,y-1,z)!==0) continue;
    spawnBreakParticles(x,y,z,22);
    setB(x,y,z,0); markDirty(x,y,z,false);
    if(WORLD.mode!=='creative') spawnDrop(x+0.5,y+0.5,z+0.5,22);
  }
}

function updateFire(dt){
  if(!_fMesh){ if(!scene) return; _initFire(); }
  _fTime += dt;
  _fAcc += dt;
  if(MP.open && MP.role!=='host') _fAcc = 0;   // multijoueur : seul l'hôte simule la propagation, les clients reçoivent ses événements
  else if(_fAcc >= FIRE_TICK){
    const step = _fAcc; _fAcc = 0;
    for(const f of FIRE_LIST.slice()){
      if(f.dead) continue;
      const d2 = mpFireD2(f.x+0.5, f.z+0.5);
      if(d2 > 96*96){ removeFire(f); continue; }    // trop loin : oublié
      if(d2 > 64*64) continue;                      // loin : figé
      if(!fireTick(f,step)){ removeFire(f); continue; }
      if(f.life<=0){ if(f.block) consumeBurning(f); else removeFire(f); }
    }
  }
  // éclairage des feux : recalcul des chunks étalé (8 cellules / 0,3 s)
  _fLT += dt;
  if(_fLQ.length && _fLT > 0.3){
    _fLT = 0;
    for(let i=0;i<8 && _fLQ.length;i++){ const c = _fLQ.shift(); markDirty(c[0],c[1],c[2],true); }
  }
  // lumière dynamique : les 6 feux les plus proches éclairent en temps réel (scintillement par feu)
  {
    const U = LIGHT_UNI.uFire.value, K = 6, bd = new Float32Array(K).fill(1e9), bi = new Array(K).fill(null);   // les 6 premiers emplacements seulement
    for(let i=0;i<FIRE_LIST.length;i++){
      const f = FIRE_LIST[i], dx=f.x+0.5-P.x, dy=f.y+0.5-P.y, dz=f.z+0.5-P.z, d2=dx*dx+dy*dy+dz*dz;
      if(d2 > 48*48) continue;
      let j = K; while(j>0 && d2 < bd[j-1]) j--;
      if(j>=K) continue;
      for(let m=K-1;m>j;m--){ bd[m]=bd[m-1]; bi[m]=bi[m-1]; }
      bd[j]=d2; bi[j]=f;
    }
    for(let k=0;k<K;k++){
      const f = bi[k];
      if(!f){ U[k].set(0,-9999,0,0); continue; }
      const fl = 0.90 + 0.06*Math.sin(_fTime*11+f.off*1.7) + 0.04*Math.sin(_fTime*27+f.off*0.9);
      U[k].set(f.x+0.5, f.y+0.5, f.z+0.5, (f.block ? 11 : 10)*fl);
    }
  }
  // géométrie. Feu en l'air (comme Minecraft) : 4 plans centraux inclinés + 4 murs de bord.
  // Bloc qui brûle : une enveloppe de flammes sur chacune de ses faces visibles.
  const n = FIRE_LIST.length, fi = Math.floor(_fTime*FIRE_FPS), E = 0.02, O = 0.02, S0 = 0.05, S1 = 0.95, B0 = 0.3, B1 = 0.7, T0 = 0.08, T1 = 0.92, pa = _fPos.array, ua = _fUv.array;
  let qn = 0;
  const quad = (q, fr) => {
    const v0 = 1-(fr+1)/FIRE_FRAMES+0.00015, v1 = 1-fr/FIRE_FRAMES-0.00015, u0 = 0.0008, u1 = 0.9992;
    let p = qn*12, u = qn*8;
    for(let k=0;k<12;k++) pa[p++] = q[k];
    ua[u++]=u0;ua[u++]=v0; ua[u++]=u1;ua[u++]=v0; ua[u++]=u1;ua[u++]=v1; ua[u++]=u0;ua[u++]=v1;
    qn++;
  };
  for(let i=0;i<n;i++){
    const f = FIRE_LIST[i], fr = (fi+f.off)%FIRE_FRAMES;
    const X=f.x, Y=f.y, Z=f.z;
    if(f.block){
      const ex = (dx,dy,dz) => !OPAQUE[getB(X+dx,Y+dy,Z+dz)];
      if(ex(-1,0,0)) quad([X-O,Y,Z, X-O,Y,Z+1, X-O,Y+1,Z+1, X-O,Y+1,Z], fr);
      if(ex( 1,0,0)) quad([X+1+O,Y,Z, X+1+O,Y,Z+1, X+1+O,Y+1,Z+1, X+1+O,Y+1,Z], (fr+6)%FIRE_FRAMES);
      if(ex(0,0,-1)) quad([X,Y,Z-O, X+1,Y,Z-O, X+1,Y+1,Z-O, X,Y+1,Z-O], (fr+12)%FIRE_FRAMES);
      if(ex(0,0, 1)) quad([X,Y,Z+1+O, X+1,Y,Z+1+O, X+1,Y+1,Z+1+O, X,Y+1,Z+1+O], (fr+18)%FIRE_FRAMES);
      if(ex(0, 1,0)) quad([X,Y+1+O,Z, X+1,Y+1+O,Z, X+1,Y+1+O,Z+1, X,Y+1+O,Z+1], (fr+24)%FIRE_FRAMES);
      if(ex(0,-1,0)) quad([X,Y-O,Z, X+1,Y-O,Z, X+1,Y-O,Z+1, X,Y-O,Z+1], (fr+3)%FIRE_FRAMES);
    } else {
      const x0=X+E, x1=X+1-E, z0=Z+E, z1=Z+1-E, y0=Y, y1=Y+1;
      quad([X+B0,y0,Z+S0, X+B0,y0,Z+S1, X+T1,y1,Z+S1, X+T1,y1,Z+S0], fr);
      quad([X+B1,y0,Z+S0, X+B1,y0,Z+S1, X+T0,y1,Z+S1, X+T0,y1,Z+S0], fr);
      quad([X+S0,y0,Z+B0, X+S1,y0,Z+B0, X+S1,y1,Z+T1, X+S0,y1,Z+T1], fr);
      quad([X+S0,y0,Z+B1, X+S1,y0,Z+B1, X+S1,y1,Z+T0, X+S0,y1,Z+T0], fr);
      quad([x0,y0,z0, x1,y0,z0, x1,y1,z0, x0,y1,z0], fr);
      quad([x1,y0,z1, x0,y0,z1, x0,y1,z1, x1,y1,z1], fr);
      quad([x0,y0,z1, x0,y0,z0, x0,y1,z0, x0,y1,z1], fr);
      quad([x1,y0,z0, x1,y0,z1, x1,y1,z1, x1,y1,z0], fr);
    }
  }
  _fMesh.geometry.setDrawRange(0, qn*6);
  _fPos.needsUpdate = true; _fUv.needsUpdate = true;
}

// Briquet : allume la cellule contre la face visée (ou remplace l'herbe visée)
function useLighter(t){
  if(FIRE_BURN[t.bid]){ const bf = igniteBlock(t.bx,t.by,t.bz,t.bid); if(bf) bf.life += 1; return; }   // bloc inflammable : il brûle lui-même
  const tp = !!FIRE_PLANT[t.bid];
  const f = igniteAt(tp?t.bx:t.pbx, tp?t.by:t.pby, tp?t.bz:t.pbz, 0);
  if(f) f.life = 4 + Math.random()*2;
}

// Clic gauche sur une flamme : on l'éteint (renvoie true si une flamme a été frappée)
function punchFire(){
  if(!FIRE_LIST.length) return false;
  const cp=Math.cos(P.pitch), sp=Math.sin(P.pitch), cyw=Math.cos(P.yaw), syw=Math.sin(P.yaw);
  const dx=-cp*syw, dy=sp, dz=-cp*cyw, ox=P.x, oy=P.y+P.eyeH, oz=P.z;
  for(let t=0.2;t<5;t+=0.1){
    const x=Math.floor(ox+dx*t), y=Math.floor(oy+dy*t), z=Math.floor(oz+dz*t);
    const f = FIRES.get(fkey(x,y,z));
    if(f){ removeFire(f); return true; }
    const b = getB(x,y,z);
    if(b && !FIRE_PLANT[b] && !(BLOCKS[b] && BLOCKS[b].isFluid)) return false;
  }
  return false;
}
