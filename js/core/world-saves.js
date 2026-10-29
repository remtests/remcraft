'use strict';

// ════════════════════════════════════════════════
// MONDES SAUVEGARDÉS (localStorage)
// ════════════════════════════════════════════════
// Le terrain est déterministe (graine + type de monde) : on ne stocke donc que ce que le joueur a changé.
//   · mc_worlds_v1_index   : liste des mondes [{id, name, seed, type, mode, bonus, cheats, created, played, size}]
//   · mc_world_v1_<id>     : état d'un monde — blocs modifiés (journal MP.edits), coffres, fours, joueur, heure
// Rien n'est sauvegardé pour un client multijoueur (le monde appartient à l'hôte).
const WS_INDEX = 'mc_worlds_v1_index', WS_PREFIX = 'mc_world_v1_';
const WS = {cur:null, pending:null, lastNotice:0};
const WS_AUTOSAVE_MS = 45000;

function wsReadIndex(){
  try{
    const a = JSON.parse(localStorage.getItem(WS_INDEX)||'[]');
    return Array.isArray(a) ? a.filter(w => w && typeof w.id==='string' && /^[a-z0-9]+$/.test(w.id)) : [];
  }catch(e){ return []; }
}
function wsWriteIndex(a){ try{ localStorage.setItem(WS_INDEX, JSON.stringify(a)); return true; }catch(e){ return false; } }
const wsNum = (v, d) => (typeof v==='number' && isFinite(v)) ? v : d;
const wsKeyOk = k => typeof k==='string' && /^-?\d+,-?\d+,-?\d+$/.test(k);

// Message : dans le jeu → chat ; sur l'écran de création → ligne d'état sous la liste
function wsNotice(msg){
  const now = Date.now();
  if(now - WS.lastNotice < 120000) return;   // l'autosave ne doit pas spammer
  WS.lastNotice = now;
  if(gameOn) addChat(msg, '#ff5555'); else wsListMsg(msg);
}
function wsListMsg(msg){ const el = document.getElementById('ws-msg'); if(el) el.textContent = msg||''; }

// ── Création d'un monde (appelé par createWorld après la lecture des réglages) ──
function wsNewWorld(name){
  const idx = wsReadIndex();
  name = (name||'').replace(/\s+/g,' ').trim().slice(0,32) || 'New World';
  let unique = name, n = 2;
  while(idx.some(w => w.name===unique)) unique = name+' ('+(n++)+')';
  const meta = {
    id: 'w'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36),
    name: unique, seed: WORLD_SEED|0, type: WORLD.type, mode: WORLD.baseMode||WORLD.mode,
    bonus: !!WORLD.bonus, cheats: !!WORLD.cheats, created: Date.now(), played: Date.now(), size: 0,
  };
  idx.push(meta);
  MP.edits.clear(); CHESTS.clear(); CHEST_DIR.clear(); FURNACES.clear();
  if(wsWriteIndex(idx)){ WS.cur = meta.id; }
  else { WS.cur = null; wsNotice('This world cannot be saved: browser storage is unavailable or full.'); }
}

// ── Sauvegarde du monde en cours ──
function wsSave(){
  if(!WS.cur || !gameOn || MP.role==='client' || SV.dead) return false;
  const idx = wsReadIndex(), m = idx.find(w => w.id===WS.cur);
  if(!m) return false;   // monde supprimé entre-temps
  const flat = [], withDir = [];
  for(const e of MP.edits.values()){ if(e.length>4) withDir.push(e); else flat.push(e[0], e[1], e[2], e[3]); }
  const chests = []; for(const [k,s] of CHESTS) if(s.some(x => x.id!==null)) chests.push([k, s.map(x => [x.id, x.n])]);
  const fu = []; for(const k of FURNACES.keys()) fu.push(mpFurnaceMsg(k, true));
  const st = {
    v:1, e:flat, ed:withDir, cd:[...CHEST_DIR], chests, fu, dayT, dc:dayCount,
    mode:WORLD.mode, base:WORLD.baseMode||WORLD.mode,
    p:{x:P.x, y:P.y, z:P.z, yaw:P.yaw, pitch:P.pitch, hot:P.hotbar, fly:!!P.fly,
       inv:P.inv.map(s => ({...s})), off:{...P.offhand}, arm:P.armor.map(s => ({...s}))},
    sv:{hp:SV.hp, food:SV.food, sat:SV.sat, spawn:SV.spawn},
  };
  let json;
  try{ json = JSON.stringify(st); localStorage.setItem(WS_PREFIX+m.id, json); }
  catch(e){ wsNotice('World could not be saved: browser storage is full. Free some space or delete an old world.'); return false; }
  m.played = Date.now(); m.mode = st.base; m.size = json.length;
  wsWriteIndex(idx);
  return true;
}

// ── Chargement d'un monde (bouton Play de la liste) ──
function wsPlay(id){
  const m = wsReadIndex().find(w => w.id===id);
  if(!m){ wsListMsg('This world no longer exists.'); wsRenderList(); return; }
  let st = null;
  try{ st = JSON.parse(localStorage.getItem(WS_PREFIX+id)||'null'); }catch(e){ st = null; }
  if(st && (typeof st!=='object' || st.v!==1)) st = null;
  // st = null : monde jamais sauvegardé (fermé pendant le chargement) → régénéré depuis sa graine

  WORLD_SEED = m.seed|0; WORLD.type = ['default','flat','large'].includes(m.type) ? m.type : 'default';
  const mode = (st && typeof st.mode==='string' && st.mode.length<16) ? st.mode : m.mode;
  WORLD.mode = (typeof mode==='string' && mode.length<16) ? mode : 'survival';
  WORLD.baseMode = (st && typeof st.base==='string' && st.base.length<16) ? st.base : WORLD.mode;
  WORLD.bonus = !st && !!m.bonus; WORLD.cheats = !!m.cheats;   // le coffre bonus d'un monde déjà sauvegardé est dans ses blocs
  BIOME_SCALE = WORLD.type==='large' ? 4 : 1;
  resetNoiseCaches();
  MP.edits.clear(); CHESTS.clear(); CHEST_DIR.clear(); FURNACES.clear();
  WS.cur = id; WS.pending = st;
  document.getElementById('world-select').style.display = 'none';
  document.getElementById('create-world').style.display = 'none';
  handlePlayBtn().then(wsAfterStart);
}

// Appelé par handlePlayBtn avant la pré-construction des chunks : rejoue le journal des modifications
async function wsApplyPending(prog){
  const st = WS.pending; if(!st) return;
  for(const [k,d] of (Array.isArray(st.cd) ? st.cd : [])) if(wsKeyOk(k)) CHEST_DIR.set(k, d|0);
  const list = [], e = Array.isArray(st.e) ? st.e : [];
  for(let i=0;i+3<e.length;i+=4) list.push([e[i], e[i+1], e[i+2], e[i+3]]);
  for(const x of (Array.isArray(st.ed) ? st.ed : [])) if(Array.isArray(x)) list.push(x);
  let t0 = performance.now();
  for(let i=0;i<list.length;i++){
    const [x,y,z,v] = list[i];
    if(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && Number.isInteger(v) && (v===0 || BLOCKS[v])) setB(x, y, z, v);
    if(performance.now()-t0 > 30){
      prog(5+Math.round(5*i/list.length), 'Loading saved changes… '+i+' / '+list.length);
      await nextFrame(); t0 = performance.now();
    }
  }
  for(const [k,s] of (Array.isArray(st.chests) ? st.chests : [])){
    if(!wsKeyOk(k) || !Array.isArray(s)) continue;
    const slots = chestSlots(k);
    for(let i=0;i<27;i++){
      const a = s[i], n = a ? Math.max(0, Math.min(64, a[1]|0)) : 0;
      slots[i].n = n; slots[i].id = n>0 ? a[0] : null;
    }
  }
  for(const f of (Array.isArray(st.fu) ? st.fu : [])) mpSetFurnace(f);
}

// Une fois le jeu démarré : joueur, inventaire, heure
function wsAfterStart(){
  const st = WS.pending; WS.pending = null;
  if(st){
    const p = st.p || {};
    if(isFinite(p.x) && isFinite(p.y) && isFinite(p.z) && Math.abs(p.x)<1e7 && Math.abs(p.z)<1e7){
      P.x = p.x; P.y = p.y; P.z = p.z; P.px = P.x; P.py = P.y; P.pz = P.z; P.vx = P.vy = P.vz = 0;
    }
    if(spawnSolid(getB(P.x, P.y, P.z)) || spawnSolid(getB(P.x, P.y+1, P.z))){   // position sauvegardée devenue solide (ex. génération du terrain modifiée)
      const safe = findSafeSpawn(Math.floor(P.x), Math.floor(P.z), 8);
      if(safe){ P.x = safe.x+0.5; P.z = safe.z+0.5; P.y = safe.y+0.05; P.px = P.x; P.py = P.y; P.pz = P.z; }
    }
    P.yaw = wsNum(p.yaw, P.yaw); P.pitch = wsNum(p.pitch, P.pitch);
    P.hotbar = Math.max(0, Math.min(8, wsNum(p.hot, 0)|0));
    const put = (slot, a) => {
      const n = (a && a.id!==null && a.id!==undefined) ? Math.max(0, Math.min(64, a.n|0)) : 0;
      slot.n = n; slot.id = n>0 ? a.id : null;
    };
    if(Array.isArray(p.inv)) for(let i=0;i<P.inv.length;i++) put(P.inv[i], p.inv[i]);
    if(p.off) put(P.offhand, p.off);
    if(Array.isArray(p.arm)) for(let i=0;i<P.armor.length;i++) put(P.armor[i], p.arm[i]);
    P.fly = !!p.fly && WORLD.mode==='creative';
    const sv = st.sv || {};
    SV.hp = Math.max(1, Math.min(SV_MAX, wsNum(sv.hp, SV_MAX))); SV.food = Math.max(0, Math.min(20, wsNum(sv.food, 20)));
    SV.sat = Math.max(0, Math.min(20, wsNum(sv.sat, 5)));
    if(sv.spawn && isFinite(sv.spawn.x) && isFinite(sv.spawn.z)) SV.spawn = {x:sv.spawn.x, z:sv.spawn.z};
    SV.dirty = true;
    if(isFinite(st.dayT)) dayT = ((+st.dayT)%1+1)%1;
    dayCount = Math.max(0, wsNum(st.dc, 0)|0);
    drawHotbar(); drawOffhand(); svDraw(true);
    updateVisibleChunks(true);
    const m = wsReadIndex().find(w => w.id===WS.cur);
    if(m) addChat('World "'+m.name+'" loaded.', '#ffff55');
  }
  wsSave();
}

// ── Renommer / supprimer ──
function wsRename(id, name){
  name = (name||'').replace(/\s+/g,' ').trim().slice(0,32);
  const idx = wsReadIndex(), m = idx.find(w => w.id===id);
  if(!m || !name) return false;
  if(idx.some(w => w.id!==id && w.name===name)){ wsListMsg('A world named "'+name+'" already exists.'); return false; }
  m.name = name;
  if(!wsWriteIndex(idx)){ wsListMsg('Could not rename: browser storage is full.'); return false; }
  wsListMsg(''); return true;
}
function wsDelete(id){
  try{ localStorage.removeItem(WS_PREFIX+id); }catch(e){}
  wsWriteIndex(wsReadIndex().filter(w => w.id!==id));
}

// ── Liste affichée à droite de l'écran de création ──
const WS_LABEL = {survival:'Survival', creative:'Creative', spectator:'Spectator', adventure:'Adventure', default:'Default', flat:'Superflat', large:'Large Biomes'};
function wsAgo(t){
  const s = Math.max(0, (Date.now()-t)/1000);
  if(s < 60) return 'just now';
  if(s < 3600) return Math.floor(s/60)+' min ago';
  if(s < 86400) return Math.floor(s/3600)+' h ago';
  return Math.floor(s/86400)+' d ago';
}
function wsMkBtn(label, cls, fn){
  const b = document.createElement('button'); b.className = 'ws-btn '+cls; b.textContent = label; b.onclick = fn; return b;
}
function wsRenderList(){
  const box = document.getElementById('ws-list'); if(!box) return;
  box.textContent = '';
  const worlds = wsReadIndex().sort((a,b) => (b.played||0)-(a.played||0));
  if(!worlds.length){
    const e = document.createElement('div'); e.className = 'ws-empty'; e.textContent = 'No saved worlds yet. Click "Create New World" below to start.'; box.appendChild(e); return;
  }
  for(const w of worlds){
    const item = document.createElement('div'); item.className = 'ws-item';
    const info = document.createElement('div'); info.className = 'ws-info';
    const nm = document.createElement('div'); nm.className = 'ws-name'; nm.textContent = w.name;
    const sub = document.createElement('div'); sub.className = 'ws-sub';
    sub.textContent = (WS_LABEL[w.mode]||w.mode)+' · '+(WS_LABEL[w.type]||w.type)+' · seed '+w.seed+' · '+wsAgo(w.played||0)+(w.size ? ' · '+Math.max(1,Math.round(w.size/1024))+' KB' : '');
    info.appendChild(nm); info.appendChild(sub);
    const btns = document.createElement('div'); btns.className = 'ws-btns';
    const play = wsMkBtn('Play', 'ws-play', () => wsPlay(w.id));
    const ren = wsMkBtn('Rename', '', () => {
      const inp = document.createElement('input'); inp.className = 'ws-input'; inp.maxLength = 32; inp.value = w.name;
      inp.onkeydown = ev => { ev.stopPropagation(); if(ev.key==='Enter'){ if(wsRename(w.id, inp.value)) wsRenderList(); } else if(ev.key==='Escape'){ wsRenderList(); } };
      inp.onkeyup = ev => ev.stopPropagation();
      nm.textContent = ''; nm.appendChild(inp); inp.focus(); inp.select();
      btns.textContent = '';
      btns.appendChild(wsMkBtn('OK', 'ws-play', () => { if(wsRename(w.id, inp.value)) wsRenderList(); }));
      btns.appendChild(wsMkBtn('Cancel', '', () => wsRenderList()));
    });
    const del = wsMkBtn('Delete', 'ws-del', () => {
      if(del.dataset.armed){ wsDelete(w.id); wsListMsg(''); wsRenderList(); return; }
      del.dataset.armed = '1'; del.textContent = 'Sure?';
      setTimeout(() => { if(del.isConnected){ del.dataset.armed = ''; del.textContent = 'Delete'; } }, 3000);   // double clic requis, pas de boîte de dialogue
    });
    btns.appendChild(play); btns.appendChild(ren); btns.appendChild(del);
    item.appendChild(info); item.appendChild(btns); box.appendChild(item);
  }
}

// ── Retour au titre : sauvegarde puis rechargement (l'état du moteur n'est pas conçu pour être réinitialisé à chaud) ──
function wsQuitToTitle(){
  if(WS.cur && MP.role!=='client' && !wsSave()){ WS.lastNotice = 0; wsNotice('Save failed: the game stays open so you do not lose your progress.'); return; }
  location.reload();
}

// ── Sauvegardes automatiques ──
setInterval(() => { if(gameOn && !paused) wsSave(); }, WS_AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => { if(document.hidden) wsSave(); });
window.addEventListener('pagehide', () => wsSave());
