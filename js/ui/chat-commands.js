'use strict';

// ════════════════════════════════════════════════
// CHAT & COMMANDES : T / Entrée ouvre le chat, « / » ouvre directement une commande
// /give /tp (coordonnées ou joueur) /time /fill (+ /help). Tab complète, ↑/↓ rappelle l'historique.
// ════════════════════════════════════════════════
let chatOpen = false;
const chatEl = document.getElementById('chat'), chatLog = document.getElementById('chat-log'), chatIn = document.getElementById('chat-input'), hintEl = document.getElementById('chat-hint');
const chatHist = []; let chatHistI = 0;
const CMD_INFO = {
  give:'Gives an item or block', tp:'Teleports you', time:'Sets, adds or reads the time of day',
  fill:'Fills a region with a block', gamemode:'Changes your game mode', locate:'Finds the nearest biome',
  kill:'Kills you', heal:'Restores your health and hunger', help:'Lists the commands'
};
const CMDS = Object.keys(CMD_INFO);
const CMD_ALIAS = {teleport:'tp', gm:'gamemode', '?':'help'};

function addChat(text, color){
  const d = document.createElement('div'); d.className = 'cl'; d.textContent = text;
  if(color) d.style.color = color;
  chatLog.appendChild(d);
  while(chatLog.children.length > 100) chatLog.removeChild(chatLog.firstChild);
  chatLog.scrollTop = chatLog.scrollHeight;
  setTimeout(()=>d.classList.add('old'), 9000);
}
const chatErr = t => { addChat(t, '#ff5555'); return false; };
const chatOk  = t => { addChat(t, '#aaffaa'); return true; };

function openChat(prefill){
  chatOpen = true; uiOn = true;
  for(const k in K) K[k] = false; mldown = false;
  document.exitPointerLock();
  chatEl.classList.add('open');
  chatIn.value = prefill || ''; chatHistI = chatHist.length;
  chatIn.focus();
  chatLog.scrollTop = chatLog.scrollHeight;
  updateHint();
}
function closeChat(){
  chatOpen = false; uiOn = false; hintState = null; renderHint();
  chatEl.classList.remove('open'); chatIn.blur();
  if(gameOn && !paused) lockPtr();
}
chatIn.addEventListener('keydown', e=>{
  e.stopPropagation();
  if(e.key==='Enter'){
    e.preventDefault();
    const txt = chatIn.value.trim();
    if(txt){
      chatHist.push(txt);
      if(txt[0]==='/') runCommand(txt); else { addChat('<'+MP.name+'> '+txt); if(MP.open) mpOut({t:'c', m:txt}); }
    }
    closeChat();
  } else if(e.key==='Escape'){ e.preventDefault(); closeChat(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); if(!hintNav(-1)){ if(chatHistI>0){ chatHistI--; chatIn.value = chatHist[chatHistI]; updateHint(); } } }
  else if(e.key==='ArrowDown'){ e.preventDefault(); if(!hintNav(1)){ chatHistI = Math.min(chatHist.length, chatHistI+1); chatIn.value = chatHist[chatHistI] || ''; updateHint(); } }
  else if(e.key==='Tab'){ e.preventDefault(); hintTab(); }
});
chatIn.addEventListener('input', ()=>updateHint());

// ── Résolution des noms d'objets / de blocs ──
function _norm(s){ return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^minecraft:/,'').replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,''); }
let _itemTable = null;
function itemTable(){
  if(_itemTable) return _itemTable;
  const t = new Map(), add = (k,v)=>{ k=_norm(k); if(k && !t.has(k)) t.set(k,v); };
  const EN = {grass:1,dirt:2,stone:3,sand:4,log:5,oak_log:5,wood:5,leaves:6,planks:7,oak_planks:7,cobblestone:8,cobble:8,gravel:9,bedrock:10,
    crafting_table:11,iron_ore:12,coal_ore:13,glass:14,gold_ore:15,diamond_ore:16,bookshelf:17,tnt:18,wool:19,torch:'torch',
    furnace:21,cactus:22,water:23,tall_grass:24,short_grass:24,poppy:25,blue_orchid:26,chest:27,air:0};
  for(const k in EN) add(k, EN[k]);
  for(const id in BLOCKS){ const b = BLOCKS[id]; if(b.variantOf) continue; add(b.sid, id==20 ? 'torch' : +id); add(b.name, id==20 ? 'torch' : +id); }
  for(const k in ITEMS){ if(IMGS[k]){ add(k,k); add(ITEMS[k].name,k); } }
  return _itemTable = t;
}
// Anciens IDs numériques de Minecraft (≤ 1.12) → blocs du jeu
const LEGACY_IDS = {1:3,2:1,3:2,4:8,5:7,7:10,8:23,9:23,12:4,13:9,14:15,15:12,16:13,17:5,18:6,20:14,31:24,35:19,37:25,38:25,46:18,47:17,50:20,54:27,56:16,58:11,61:21,81:22};
function resolveItem(str){
  const n = _norm(str);
  if(/^\d+$/.test(n)) return LEGACY_IDS[+n]===20 ? 'torch' : (LEGACY_IDS[+n] ?? null);
  const v = itemTable().get(n);
  return (v===undefined || v===0) ? null : v;
}
function resolveBlock(str){   // pour /fill : id numérique de bloc (air = 0)
  const n = _norm(str);
  if(n==='air') return 0;
  if(/^\d+$/.test(n)) return LEGACY_IDS[+n] ?? null;
  const v = itemTable().get(n);
  if(v==='torch') return 20;
  return typeof v==='number' ? v : null;
}

// ── Aide à la saisie : suggestions + syntaxe de la commande affichées au-dessus du champ de chat ──
let _itemKeys = null, _blockKeys = null;
const itemKeys  = () => _itemKeys  || (_itemKeys  = [...itemTable().keys()].filter(k=>!/^\d/.test(k)).sort());
const blockKeys = () => _blockKeys || (_blockKeys = [...itemTable().entries()].filter(([k,v])=>!/^\d/.test(k) && (v==='torch' || (typeof v==='number' && v>0))).map(e=>e[0]).sort());
const _coordC = axis => ['~', String(Math.floor([P.x,P.y,P.z][axis]))];
// chaque entrée renvoie {tokens: syntaxe, cur: argument en cours (-1 = aucun), cands: suggestions, desc: explication}
const CMD_SPEC = {
  give(a,i){
    const sel = /^@/.test(a[0]||''), tokens = sel ? ['@s','<item>','[count]'] : ['[@s]','<item>','[count]'], k = sel ? i : i+1;
    return {tokens, cur: k<tokens.length ? k : -1,
      cands: k===0 ? ['@s','@p'] : k===1 ? itemKeys() : [],
      desc: k===0 ? 'Target: yourself' : k===1 ? 'Item or block, e.g. diamond_pickaxe' : k===2 ? 'Amount, 1 to 2304 (default 1)' : ''};
  },
  tp(a,i){
    const D = ['X coordinate (~ = relative to you)','Y coordinate (or Z when you only give X Z: teleports to the surface)','Z coordinate (~ = relative to you)','Yaw in degrees (~ = unchanged)','Pitch in degrees (~ = unchanged)'];
    const names = [...MP.players.values()].map(p=>p.name);
    if(i===0) return {tokens:['<x|player>','<y>','<z>','[yaw]','[pitch]'], cur:0, cands: names.concat(_coordC(0)), desc: 'Player to teleport to, or X coordinate (~ = relative to you)'};
    if(!/^[~\-\d.]/.test(a[0]||'')) return {tokens:['<player>'], cur:-1, cands:[], desc:''};   // /tp <joueur> : pas d'autres arguments
    return {tokens:['<x>','<y>','<z>','[yaw]','[pitch]'], cur: i<5 ? i : -1, cands: i<3 ? _coordC(i) : i<5 ? ['~'] : [], desc: D[i]||''};
  },
  time(a,i){
    const sub = (a[0]||'').toLowerCase(), on = i===1;
    if(i>0 && sub==='set')   return {tokens:['set','<time>'],  cur:on?1:-1, cands:on?['day','noon','night','midnight','sunrise','sunset']:[], desc:'A preset, or a number of ticks (24000 = one day)'};
    if(i>0 && sub==='add')   return {tokens:['add','<ticks>'], cur:on?1:-1, cands:[], desc:'Ticks to add (24000 = one day)'};
    if(i>0 && sub==='query') return {tokens:['query','<daytime|day>'], cur:on?1:-1, cands:on?['daytime','day']:[], desc:'Time of day, or the number of days played'};
    return {tokens:['<set|add|query>'], cur:0, cands:['set','add','query'], desc:'Set, add to, or read the time of day'};
  },
  fill(a,i){
    const mode = (a[7]||'').toLowerCase(), D = ['First corner X','First corner Y','First corner Z','Opposite corner X','Opposite corner Y','Opposite corner Z',
      'Block to fill with (air to clear)','replace · destroy · keep · hollow · outline','Only replace this block (with replace)'];
    const off = i===8 && mode!=='replace';
    return {tokens:['<x1>','<y1>','<z1>','<x2>','<y2>','<z2>','<block>','[mode]','[filter]'], cur: (i<9 && !off) ? i : -1,
      cands: i<6 ? _coordC(i%3) : i===6 ? blockKeys() : i===7 ? ['replace','destroy','keep','hollow','outline'] : (i===8 && mode==='replace') ? blockKeys() : [], desc: off ? '' : (D[i]||'')};
  },
  gamemode(a,i){ return {tokens:['<survival|creative>'], cur: i===0?0:-1, cands: i===0?['survival','creative']:[], desc:'Your new game mode'}; },
  locate(a,i){ return {tokens:['biome','<biome>'], cur: i<2 ? i : -1, cands: i===0 ? ['biome'] : i===1 ? BIOME_IDS : [], desc: i===0 ? 'What to look for' : i===1 ? 'Finds the nearest biome and tells you where it is' : ''}; },
  kill(){ return {tokens:[], cur:-1, cands:[], desc:'Kills you (your items drop)'}; },
  heal(){ return {tokens:[], cur:-1, cands:[], desc:'Restores health and hunger'}; },
  help(){ return {tokens:[], cur:-1, cands:[], desc:'Lists the commands'}; }
};
function cmdSyntax(v){
  const parts = v.split(' '), word = parts[0].slice(1).toLowerCase();
  if(parts.length===1){   // on tape encore le nom de la commande
    const list = CMDS.filter(n=>n.startsWith(word)), exact = CMD_ALIAS[word] || (CMD_INFO[word]!==undefined ? word : null);
    if(!list.length && !exact) return {bad:'Unknown command: /'+word, cands:[]};
    const sp = exact ? CMD_SPEC[exact]([], 0) : null;
    return {name: exact||'', tokens: sp ? sp.tokens : null, cur:-1, desc: exact ? CMD_INFO[exact] : '', base:'', last:parts[0],
      cands: (list.length===1 && '/'+list[0]===parts[0]) ? [] : list.map(n=>'/'+n), infos: list.map(n=>CMD_INFO[n]), more: !!(sp && sp.tokens.length)};
  }
  const cmd = CMD_ALIAS[word] || word;
  if(!CMD_SPEC[cmd]) return {bad:'Unknown command: /'+word, cands:[]};
  const args = parts.slice(1), i = args.length-1, last = args[i], lw = last.toLowerCase(), sp = CMD_SPEC[cmd](args, i);
  let c = sp.cands.filter(x=>x.toLowerCase().startsWith(lw));
  if(!c.length && lw.length>1) c = sp.cands.filter(x=>x.toLowerCase().includes(lw));
  if(c.length===1 && c[0].toLowerCase()===lw) c = [];
  return {name:cmd, tokens:sp.tokens, cur:sp.cur, desc:sp.desc, cands:c, infos:null, base:parts.slice(0,-1).join(' ')+' ', last, more: sp.cur>=0 && sp.cur<sp.tokens.length-1};
}
let hintState = null, hintSel = 0, hintTabbed = false;
function updateHint(){
  hintTabbed = false; hintSel = 0;
  hintState = (chatOpen && chatIn.value[0]==='/') ? cmdSyntax(chatIn.value) : null;
  renderHint();
}
function renderHint(){
  const st = hintState;
  hintEl.textContent = '';
  if(!st){ hintEl.style.display = 'none'; return; }
  const mk = (cls, txt)=>{ const d = document.createElement('div'); d.className = cls; if(txt!==undefined) d.textContent = txt; return d; };
  if(st.cands.length){
    const sg = mk('sg'), n = st.cands.length, W = 8, start = Math.max(0, Math.min(hintSel-3, n-W));
    for(let k=start; k<Math.min(n,start+W); k++){
      const r = mk('sr'+(k===hintSel ? ' sel' : ''), st.cands[k]);
      if(st.infos && st.infos[k]){ const s = document.createElement('i'); s.textContent = st.infos[k]; r.appendChild(s); }
      r.addEventListener('mousedown', ev=>{ ev.preventDefault(); hintSel = k; hintApply(k, true); });
      sg.appendChild(r);
    }
    if(n>W) sg.appendChild(mk('ds', n+' suggestions — ↑/↓ to browse, Tab to complete'));
    hintEl.appendChild(sg);
  }
  if(st.bad) hintEl.appendChild(mk('er', st.bad));
  else if(st.tokens){
    const u = mk('us'); u.appendChild(document.createTextNode('/'+st.name+' '));
    st.tokens.forEach((t,k)=>{ const s = document.createElement(k===st.cur ? 'b' : 'span'); s.textContent = t; u.appendChild(s); if(k<st.tokens.length-1) u.appendChild(document.createTextNode(' ')); });
    hintEl.appendChild(u);
    if(st.desc) hintEl.appendChild(mk('ds', st.desc));
  }
  if(!WORLD.cheats && chatIn.value[0]==='/') hintEl.appendChild(mk('er', 'Commands are disabled in this world ("Allow Commands" is OFF).'));
  hintEl.style.display = hintEl.childNodes.length ? 'block' : 'none';
}
function hintApply(k, spaceIfMore){
  const st = hintState; if(!st || !st.cands.length) return;
  chatIn.value = st.base + st.cands[k] + ((spaceIfMore && st.more) ? ' ' : '');
  chatIn.focus();
  if(spaceIfMore) updateHint(); else renderHint();
}
function hintNav(d){
  const st = hintState; if(!st || !st.cands.length) return false;
  hintSel = (hintSel+d+st.cands.length) % st.cands.length; hintTabbed = false; renderHint(); return true;
}
function hintTab(){
  const st = hintState; if(!st || !st.cands.length) return;
  if(st.cands.length===1){ hintApply(0, true); return; }
  let pre = st.cands[0];
  for(const c of st.cands) while(!c.toLowerCase().startsWith(pre.toLowerCase())) pre = pre.slice(0,-1);
  if(!hintTabbed && pre.length > st.last.length){ chatIn.value = st.base + pre; updateHint(); return; }   // préfixe commun
  if(hintTabbed) hintSel = (hintSel+1) % st.cands.length;   // Tab répété : on parcourt les suggestions
  hintTabbed = true; hintApply(hintSel, false);
}

// ── Exécution ──
function runCommand(line){
  const a = line.slice(1).trim().split(/\s+/), cmd = (a.shift()||'').toLowerCase();
  addChat(line, '#bbbbbb');
  if(!WORLD.cheats) return chatErr('Commands are not allowed in this world ("Allow Commands" is OFF).');
  try{
    if(cmd==='give') cmdGive(a);
    else if(cmd==='tp' || cmd==='teleport') cmdTp(a);
    else if(cmd==='time') cmdTime(a);
    else if(cmd==='fill') cmdFill(a);
    else if(cmd==='gamemode' || cmd==='gm') cmdGamemode(a);
    else if(cmd==='locate') cmdLocate(a);
    else if(cmd==='kill'){ if(SV.dead) return chatErr('You are already dead.'); svDamage(1e9,'kill',{force:true}); }
    else if(cmd==='heal'){ SV.hp = SV_MAX; SV.food = 20; SV.sat = 5; SV.exh = 0; SV.burn = 0; SV.dirty = true; chatOk('Health and hunger restored'); }
    else if(cmd==='help' || cmd==='?') cmdHelp();
    else chatErr('Unknown command: /'+cmd+' (try /help)');
  }catch(err){ console.error(err); chatErr('Error: '+err.message); }
}

// ── /locate biome <biome> : recherche par anneaux carrés autour du joueur, découpée en tranches de ~8 ms ──
let _locateJob = 0;
function* locateGen(id, px, pz, step, maxK){
  let best = null;
  for(let k=1;k<=maxK;k++){
    const r = k*step;
    if(best && r > best.d) break;
    for(let t=-k;t<=k;t++){
      for(const [dx,dz] of [[t*step,-r],[t*step,r],[-r,t*step],[r,t*step]]){
        const d = Math.hypot(dx,dz);
        if(best && d >= best.d) continue;
        const x = px+dx, z = pz+dz;
        if(rawBiomeType(x,z)!==id) continue;           // test rapide sur le bruit brut…
        if(getBiomeData(x,z).type!==id) continue;      // …puis confirmation sur le vrai biome (lissé)
        best = {x, z, d};
      }
      if((t&63)===0) yield;
    }
  }
  return best;
}
function locateReport(name, x, z, d){
  chatOk('The nearest '+name+' is at ['+x+', ~, '+z+'] ('+Math.round(d)+' blocks away)');
  addChat('→ click here to prepare /tp '+x+' '+z, '#99bbcc');
  const el = chatLog.lastChild; el.style.cursor = 'pointer'; el.style.textDecoration = 'underline';
  el.addEventListener('click', ()=>{ const c = '/tp '+x+' '+z; if(chatOpen){ chatIn.value = c; chatIn.focus(); updateHint(); } else openChat(c); });
}
function cmdLocate(a){
  const args = a.slice();
  if(args[0] && _norm(args[0])==='biome') args.shift();
  if(!args.length) return chatErr('Usage: /locate biome <biome>');
  const id = BIOME_IDS.indexOf(_norm(args.join(' ')));
  if(id<0) return chatErr('Unknown biome: '+args.join(' ')+' (Tab shows the list)');
  const name = BIOME_NAMES[id], px = Math.floor(P.x), pz = Math.floor(P.z);
  if(WORLD.type==='flat') return id===0 ? locateReport(name, px, pz, 0) : chatErr('Superflat worlds only contain Plains.');
  if(getBiomeData(px,pz).type===id) return locateReport(name, px, pz, 0);
  const job = ++_locateJob, step = 24*BIOME_SCALE, maxK = 280, gen = locateGen(id, px, pz, step, maxK);
  addChat('Looking for the nearest '+name+'…', '#bbbbbb');
  const tick = ()=>{
    if(job!==_locateJob || !gameOn) return;
    const t0 = performance.now(); let r;
    do { r = gen.next(); } while(!r.done && performance.now()-t0 < 8);
    if(!r.done) return void setTimeout(tick, 0);
    if(r.value) locateReport(name, r.value.x, r.value.z, r.value.d);
    else chatErr('Could not find a '+name+' within '+(step*maxK)+' blocks.');
  };
  tick();
}
function cmdGamemode(a){
  const m = {survival:'survival', s:'survival', 0:'survival', creative:'creative', c:'creative', 1:'creative'}[(a[0]||'').toLowerCase()];
  if(!m) return chatErr('Usage: /gamemode <survival|creative>');
  WORLD.mode = m; if(m==='survival') P.fly = false;
  svRefreshMode();
  chatOk('Game mode set to '+(m==='creative' ? 'Creative' : 'Survival')+(m==='creative' ? ' (double-tap Space to fly)' : ''));
}
function cmdHelp(){
  for(const l of [
    '/give [@s] <item> [count]  — gives an item or block (Tab: autocomplete)',
    '/tp <player>  — teleports you to another player (multiplayer)',
    '/tp <x> <y> <z> [yaw] [pitch]  — teleport (~ = relative, e.g. /tp ~ ~10 ~); /tp <x> <z> = to the surface',
    '/time set <day|noon|night|midnight|sunrise|sunset|ticks> · /time add <ticks> · /time query <daytime|day>',
    '/gamemode <survival|creative>  — changes your game mode',
    '/kill  — kills you · /heal  — restores health and hunger',
    '/locate biome <biome>  — finds the nearest biome (Tab: list of biomes)',
    '/fill <x1 y1 z1> <x2 y2 z2> <block> [replace [filter]|destroy|keep|hollow|outline]  (max 32768 blocks)'
  ]) addChat(l, '#ffff55');
}

function cmdGive(a){
  if(a[0] && /^@[sp]$/.test(a[0])) a.shift();
  if(!a.length) return chatErr('Usage: /give [@s] <item> [count]');
  const id = resolveItem(a[0]); if(id===null) return chatErr('Unknown item: '+a[0]);
  let n = 1;
  if(a[1]!==undefined){ n = parseInt(a[1],10); if(!(n>=1) || n>2304) return chatErr('Invalid count (1 to 2304)'); }
  const rest = addInv(id, n);
  if(rest>0) spawnDrop(P.x, P.y+1.2, P.z, id, rest);
  drawHotbar();
  chatOk('Gave '+n+' × '+itemName(id) + (rest>0 ? ' ('+rest+' dropped on the ground, inventory full)' : ''));
}

function _coord(sv, base, center){
  if(sv[0]==='~'){ const o = sv.length>1 ? parseFloat(sv.slice(1)) : 0; return isNaN(o) ? NaN : base+o; }
  const v = parseFloat(sv); if(isNaN(v)) return NaN;
  return (center && /^-?\d+$/.test(sv)) ? v+0.5 : v;
}
function _tpTo(x, y, z){
  // on ressort du terrain si on a visé l'intérieur d'un bloc
  let guard = 0;
  while(guard++<400 && y<Y_MAX-2 && (solid(x,y,z) || solid(x,y+1,z))) y = Math.floor(y)+1;
  P.x = P.px = x; P.y = P.py = y; P.z = P.pz = z;
  P.vx = P.vy = P.vz = 0; P.sx = P.sz = 0; P.onGround = false; SV.fall = 0;
  if(lastPCX!==null) updateVisibleChunks(true);
}
function cmdTpPlayer(name){
  const q = name.toLowerCase();
  const list = MP.open ? [...MP.players.values()] : [];
  const t = list.find(p=>p.name.toLowerCase()===q) || list.find(p=>p.name.toLowerCase().startsWith(q));
  if(!t){
    if(!MP.open) return chatErr('Unknown target "'+name+'": you are not in a multiplayer game.');
    if(name.toLowerCase()===String(MP.name).toLowerCase()) return chatErr('You cannot teleport to yourself.');
    return chatErr('Player not found: '+name);
  }
  const d = t.rm || t.rp;   // position lissée si disponible, sinon dernière position reçue
  if(!d || isNaN(d.x) || isNaN(d.y) || isNaN(d.z)) return chatErr(t.name+' has not sent a position yet.');
  _tpTo(d.x, d.y, d.z);
  chatOk('Teleported to '+t.name);
}
function cmdTp(a){
  if(a[0] && /^@[sp]$/.test(a[0])) a.shift();
  // /tp <joueur> (le pseudo peut contenir des espaces) : tout ce qui ne commence pas par une coordonnée
  if(a.length && !/^[~\-\d.]/.test(a[0])) return cmdTpPlayer(a.join(' '));
  if(a.length===1 && MP.open && [...MP.players.values()].some(p=>p.name.toLowerCase()===a[0].toLowerCase())) return cmdTpPlayer(a[0]);   // pseudo commençant par un chiffre
  if(a.length!==2 && a.length!==3 && a.length!==5) return chatErr('Usage: /tp <player>   or   /tp <x> <y> <z> [yaw] [pitch]   or   /tp <x> <z>');
  let x, y, z;
  if(a.length===2){
    x = _coord(a[0], P.x, true); z = _coord(a[1], P.z, true);
    if(isNaN(x)||isNaN(z)) return chatErr('Invalid coordinates');
    y = getBiomeData(Math.floor(x), Math.floor(z)).h + 3;
  } else {
    x = _coord(a[0], P.x, true); y = _coord(a[1], P.y, false); z = _coord(a[2], P.z, true);
    if(isNaN(x)||isNaN(y)||isNaN(z)) return chatErr('Invalid coordinates');
  }
  if(Math.abs(x)>3e7 || Math.abs(z)>3e7) return chatErr('Coordinates too far away');
  if(y<=Y_MIN || y>=Y_MAX-1) return chatErr('Height out of the world ('+Y_MIN+' to '+(Y_MAX-2)+')');
  _tpTo(x, y, z);
  if(a.length===5){
    const yaw = parseFloat(a[3]), pit = parseFloat(a[4]);
    if(!isNaN(yaw)) P.yaw = Math.PI - yaw*Math.PI/180;
    if(!isNaN(pit)) P.pitch = Math.max(-1.55, Math.min(1.55, -pit*Math.PI/180));
  }
  chatOk('Teleported to '+x.toFixed(1)+' '+y.toFixed(1)+' '+z.toFixed(1));
}

const TIME_PRESETS = {day:1000, noon:6000, sunset:12000, night:13000, midnight:18000, sunrise:23000};
function cmdTime(a){
  const sub = (a[0]||'').toLowerCase();
  const curTicks = () => Math.round((((dayT-0.25)%1)+1)%1*24000) % 24000;
  const setTicks = t => { dayT = (0.25 + (((t%24000)+24000)%24000)/24000) % 1; updDay(0); };
  if(sub==='set' || sub==='add'){
    if(a[1]===undefined) return chatErr('Usage: /time '+sub+' <value>');
    let v;
    if(sub==='set' && TIME_PRESETS[a[1].toLowerCase()]!==undefined) v = TIME_PRESETS[a[1].toLowerCase()];
    else { v = parseInt(a[1],10); if(isNaN(v) || !/^-?\d+t?$/.test(a[1])) return chatErr('Invalid value: '+a[1]); }
    const t = sub==='set' ? v : curTicks()+v;
    setTicks(t);
    chatOk(sub==='set' ? 'Set the time to '+curTicks()+' ('+document.getElementById('clk').textContent+')' : 'Added '+v+' ticks (time: '+curTicks()+')');
  } else if(sub==='query'){
    const q = (a[1]||'').toLowerCase();
    if(q==='daytime') chatOk('The day time is '+curTicks());
    else if(q==='day') chatOk('The day is '+dayCount);
    else chatErr('Usage: /time query <daytime|day>');
  } else chatErr('Usage: /time set <value> | /time add <ticks> | /time query <daytime|day>');
}

function cmdFill(a){
  if(a.length<7) return chatErr('Usage: /fill <x1 y1 z1> <x2 y2 z2> <block> [replace [filter]|destroy|keep|hollow|outline]');
  const base = [P.x, P.y, P.z], c = [];
  for(let i=0;i<6;i++){
    const v = _coord(a[i], base[i%3], false);
    if(isNaN(v)) return chatErr('Invalid coordinate: '+a[i]);
    c.push(Math.floor(v));
  }
  const id = resolveBlock(a[6]); if(id===null) return chatErr('Unknown block: '+a[6]);
  const mode = (a[7]||'replace').toLowerCase();
  if(!['replace','destroy','keep','hollow','outline'].includes(mode)) return chatErr('Unknown mode: '+a[7]);
  let filter;
  if(a[8]!==undefined){
    if(mode!=='replace') return chatErr('A filter is only possible with "replace"');
    filter = resolveBlock(a[8]); if(filter===null) return chatErr('Unknown block: '+a[8]);
  }
  const x0=Math.min(c[0],c[3]), x1=Math.max(c[0],c[3]), y0=Math.min(c[1],c[4]), y1=Math.max(c[1],c[4]), z0=Math.min(c[2],c[5]), z1=Math.max(c[2],c[5]);
  if(y0<Y_MIN || y1>Y_MAX) return chatErr('Height out of the world ('+Y_MIN+' to '+Y_MAX+')');
  const vol = (x1-x0+1)*(y1-y0+1)*(z1-z0+1);
  if(vol>32768) return chatErr('Region too big ('+vol+' blocks, maximum 32768)');
  let n = 0;
  for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++){
    const edge = x===x0||x===x1||y===y0||y===y1||z===z0||z===z1;
    let target = id;
    if(mode==='hollow' && !edge) target = 0;
    else if(mode==='outline' && !edge) continue;
    const cur = getB(x,y,z);
    if(cur===target) continue;
    if(mode==='keep' && cur!==0) continue;
    if(mode==='replace' && filter!==undefined && cur!==filter) continue;
    if(cur===27){   // un coffre remplacé : son contenu tombe au sol (destroy) ou est perdu
      const k = x+','+y+','+z, sl = CHESTS.get(k);
      if(sl && mode==='destroy') for(const it of sl) if(it.id!==null && it.n>0) spawnDrop(x+0.5,y+0.5,z+0.5,it.id,it.n);
      CHESTS.delete(k); CHEST_DIR.delete(k);
    }
    if(setB(x,y,z,target)) n++;
  }
  if(!n) return chatErr('No blocks were changed');
  // rechargement des meshes touchés (+ anneau voisin pour la lumière)
  const cx0=x0>>4, cx1=x1>>4, cz0=z0>>4, cz1=z1>>4;
  for(let cx=cx0-1;cx<=cx1+1;cx++) for(let cz=cz0-1;cz<=cz1+1;cz++){
    const k = ckey(cx,cz); if(!CHUNK_MESH.has(k)) continue;
    if(cx>=cx0&&cx<=cx1&&cz>=cz0&&cz<=cz1) urgent.add(k); else { dirty.add(k); queueDirty = true; }
  }
  chatOk('Changed '+n+' block'+(n>1?'s':''));
}
