'use strict';

// ════════════════════════════════════════════════
// START — chargement réel (plus de faux timer de 6 s)
// ════════════════════════════════════════════════
const nextFrame = ()=>new Promise(r=>requestAnimationFrame(()=>r()));
// ── Écran « Create New World » ──
const CW = {mode:'survival', type:'default', bonus:false, cheats:false, cheatsTouched:false};
const CW_MODES = ['survival','creative'], CW_TYPES = ['default','flat','large'];
const CW_LABEL = {survival:'Survival', creative:'Creative', default:'Default', flat:'Superflat', large:'Large Biomes'};
const CW_DESC = {
  survival:'Mine resources, craft tools and build a shelter.',
  creative:'Unlimited blocks, free flying (double-tap Space) and instant block breaking.',
  default:'Standard terrain with biomes, caves, ores and trees.',
  flat:'A flat world: bedrock, two layers of dirt and grass.',
  large:'Like Default, but biomes are much larger.',
};
function cwRefresh(){
  document.getElementById('cw-mode').textContent = 'Game Mode: '+CW_LABEL[CW.mode];
  document.getElementById('cw-mode-desc').textContent = CW_DESC[CW.mode];
  document.getElementById('cw-type').textContent = 'World Type: '+CW_LABEL[CW.type];
  document.getElementById('cw-type-desc').textContent = CW_DESC[CW.type];
  document.getElementById('cw-bonus').textContent = 'Bonus Chest: '+(CW.bonus?'ON':'OFF');
  document.getElementById('cw-bonus-desc').textContent = 'Spawns a chest with starting items next to the spawn point.';
  document.getElementById('cw-cheats').textContent = 'Allow Commands: '+(CW.cheats?'ON':'OFF');
  document.getElementById('cw-cheats-desc').textContent = 'Enables /give, /tp, /time, /fill and /gamemode in this world (cheats).';
}
function cwCycle(k){
  if(k==='mode'){ CW.mode = CW_MODES[(CW_MODES.indexOf(CW.mode)+1)%CW_MODES.length]; if(!CW.cheatsTouched) CW.cheats = CW.mode==='creative'; }   // comme Minecraft : Creative active les commandes par défaut
  else if(k==='type') CW.type = CW_TYPES[(CW_TYPES.indexOf(CW.type)+1)%CW_TYPES.length];
  else if(k==='cheats'){ CW.cheats = !CW.cheats; CW.cheatsTouched = true; }
  else CW.bonus = !CW.bonus;
  cwRefresh();
}
// Play → liste des mondes (plein écran) ; « Create New World » en bas → écran de création ; Cancel → retour à la liste
function showWorldSelect(){
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('create-world').style.display = 'none';
  document.getElementById('world-select').style.display = 'flex';
  wsListMsg(''); wsRenderList();
}
function closeWorldSelect(){
  document.getElementById('world-select').style.display = 'none';
  document.getElementById('overlay').style.display = 'flex';
}
function showCreateWorld(){
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('world-select').style.display = 'none';
  document.getElementById('create-world').style.display = 'flex';
  cwRefresh();
}
function cancelCreateWorld(){
  document.getElementById('create-world').style.display = 'none';
  showWorldSelect();
}
function createWorld(){
  const txt = document.getElementById('cw-seed').value.trim();
  if(txt===''){ WORLD_SEED = (Math.random()*0x7fffffff)|0; }
  else if(/^-?\d+$/.test(txt)){ WORLD_SEED = parseInt(txt,10)|0; }
  else { let h = 0; for(let i=0;i<txt.length;i++) h = (Math.imul(31,h)+txt.charCodeAt(i))|0; WORLD_SEED = h; }   // comme String.hashCode() de Java
  WORLD.type = CW.type; WORLD.mode = WORLD.baseMode = CW.mode; WORLD.bonus = CW.bonus; WORLD.cheats = CW.cheats;
  BIOME_SCALE = CW.type==='large' ? 4 : 1;
  resetNoiseCaches();
  wsNewWorld(document.getElementById('cw-name').value);
  document.getElementById('create-world').style.display = 'none';
  handlePlayBtn().then(()=>wsAfterStart());   // première sauvegarde (position d'apparition comprise)
}

function resetNoiseCaches(){ _permCache.clear(); _lpSeed = -1; _lpPerm = null; _rawCache.clear(); _nodeCache.clear(); }

// Coffre bonus : à 2-3 blocs du point d'apparition, face tournée vers lui
function placeBonusChest(sx, sz, sbm){
  const offs = [[2,0],[-2,0],[0,2],[0,-2],[2,2],[-2,2],[2,-2],[-2,-2],[3,1],[-3,1],[1,3],[1,-3]];
  for(const [ox,oz] of offs){
    const x = sx+ox, z = sz+oz;
    let y = null;
    for(let yy=sbm.h+10; yy>sbm.h-6; yy--){
      const below = getB(x,yy-1,z);
      if(getB(x,yy,z)===0 && getB(x,yy+1,z)===0 && (below===1||below===2||below===3||below===4||below===8||below===9)){ y = yy; break; }
    }
    if(y===null) continue;
    const key = x+','+y+','+z, ddx = sx-x, ddz = sz-z;
    CHEST_DIR.set(key, Math.abs(ddx)>Math.abs(ddz) ? (ddx>0?0:1) : (ddz>0?2:3));
    CHESTS.delete(key);
    setB(x,y,z,27); markDirty(x,y,z,false);
    const r = (a,b)=>a+Math.floor(Math.random()*(b-a+1)), pick = a=>a[Math.floor(Math.random()*a.length)];
    const loot = [
      [pick(['stone_axe','wooden_axe']),1], [pick(['stone_pickaxe','wooden_pickaxe']),1],
      ['apple',r(1,3)], ['bread',r(1,2)], [7,r(4,12)], ['stick',r(2,12)], [5,r(1,3)], [5,r(1,3)],
    ];
    const slots = chestSlots(key), free = [...Array(27).keys()];
    for(const [id,n] of loot){
      const i = free.splice(Math.floor(Math.random()*free.length),1)[0];
      slots[i].id = id; slots[i].n = n;
    }
    return true;
  }
  return false;
}

// ── Apparition sûre : jamais dans un bloc solide (tronc, feuillage, construction…) ──
// Solide = tout bloc qui collisionne (l'eau, l'herbe haute, les torches… ne comptent pas)
const spawnSolid = id => id!==0 && !(BLOCKS[id] && BLOCKS[id].noCollide);
// y = bloc sur lequel se tient le joueur : sol réel (ni feuilles, ni tronc, ni cactus), puis 2 blocs libres et hors de l'eau
function spawnGroundOk(x, y, z){
  const g = getB(x,y,z), gb = BLOCKS[g];
  if(!spawnSolid(g) || (gb && (gb.leaves || gb.log)) || g===22) return false;
  const a = getB(x,y+1,z), b = getB(x,y+2,z);
  return !spawnSolid(a) && !spawnSolid(b) && a!==23 && b!==23;
}
// Cherche, en spirale autour de (x,z) sur maxR blocs, la colonne libre la plus proche ; renvoie {x,z,y} (y = bloc libre où poser les pieds) ou null
function findSafeSpawn(x, z, maxR){
  for(let r=0; r<=maxR; r++){
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = x+dx, cz = z+dz, h = getBiomeData(cx,cz).h;
      for(let y=Math.min(Y_MAX-3, h+14); y>=Math.max(Y_MIN+1, h-6); y--) if(spawnGroundOk(cx,y,cz)) return {x:cx, z:cz, y:y+1};
    }
  }
  return null;
}

async function handlePlayBtn(){
  document.getElementById('overlay').style.display='none';
  const ls = document.getElementById('loadscreen');
  ls.style.display='flex';
  const bar = document.getElementById('load-bar'), txt = document.getElementById('load-text');
  const prog = (p,m)=>{ bar.style.width=p+'%'; txt.textContent=m; };
  prog(5,'Initializing engine…'); await nextFrame();

  // point d'apparition : ni océan ni montagne
  let sx, sz, sbm, sy;   // sy : hauteur d'apparition sûre (undefined = ancienne méthode, terrain + 3)
  if(MP.spawn){   // multijoueur : on apparaît au même endroit que l'hôte (ou au plus près si l'endroit est occupé)
    sx = MP.spawn.sx; sz = MP.spawn.sz;
    const safe = findSafeSpawn(sx, sz, 8);
    if(safe){ sx = safe.x; sz = safe.z; sy = safe.y+0.05; }
    sbm = getBiomeData(sx, sz);
  }
  else if(WS.pending && isFinite(WS.pending.p && WS.pending.p.x) && isFinite(WS.pending.p && WS.pending.p.z)){ sx = Math.floor(WS.pending.p.x); sz = Math.floor(WS.pending.p.z); sbm = getBiomeData(sx, sz); }   // monde sauvegardé : on revient où on s'était arrêté
  else {
    let safe = null;
    do {
      sx = Math.floor((Math.random()-0.5)*800);
      sz = Math.floor((Math.random()-0.5)*800);
      sbm = getBiomeData(sx, sz);
      safe = (sbm.h < 4 || sbm.type === 2) ? null : findSafeSpawn(sx, sz, 4);   // ni océan ni montagne, et pas dans un arbre
    } while(!safe);
    sx = safe.x; sz = safe.z; sy = safe.y+0.05; sbm = getBiomeData(sx, sz);
  }
  const scx = Math.floor(sx/CSIZ), scz = Math.floor(sz/CSIZ);

  // pré-construction des chunks proches (du plus proche au plus loin), avec vraie progression
  const R0 = Math.min(S.renderDist, 3), list = [];
  for(let dx=-R0;dx<=R0;dx++) for(let dz=-R0;dz<=R0;dz++) if(dx*dx+dz*dz<=(R0+0.5)*(R0+0.5)) list.push([dx,dz]);
  list.sort((a,b)=>(a[0]*a[0]+a[1]*a[1])-(b[0]*b[0]+b[1]*b[1]));
  await wsApplyPending(prog);   // monde sauvegardé : rejoue les blocs modifiés, coffres et fours
  prog(10,'Generating terrain…'); await nextFrame();
  let t0 = performance.now();
  for(let i=0;i<list.length;i++){
    buildChunkMesh(scx+list[i][0], scz+list[i][1]);
    if(performance.now()-t0 > 30){
      prog(10+Math.round(85*i/list.length), i<list.length/2 ? 'Generating terrain…' : 'Calculating lighting…');
      await nextFrame(); t0 = performance.now();
    }
  }
  prog(100,'Ready!'); await nextFrame();
  ls.style.display='none';
  startGame(sx, sz, sbm, sy);
}

function startGame(sx, sz, sbm, sy){
  fireReset();
  gameOn=true; addChat(WORLD.cheats ? 'Press T to chat, / to type a command (/help).' : 'Press T to chat.', '#ffff55');
  P.x = sx+0.5; P.z = sz+0.5; P.y = (sy!==undefined) ? sy : sbm.h+3;
  P.px = P.x; P.py = P.y; P.pz = P.z;
  svInit(P.x, P.z);   // vie, faim, point de réapparition
  document.getElementById('cross').style.display='block';
  document.getElementById('hud').style.display='flex';
  document.getElementById('clk').style.display='block';
  drawHotbar();
  setupCraftSlots();
  setupFurnaceSlots();
  updateVisibleChunks(true);
  lockPtr();
  P.fly = false;
  if(WORLD.bonus) placeBonusChest(sx, sz, sbm);
  if(WORLD.mode==='creative') addChat('Creative mode: double-tap Space to fly, E for the creative inventory.', '#ffff55');
  drawHotbar();
  if(MP.open && MP.role==='host') mpHello();
}
