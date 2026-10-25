'use strict';

// ════════════════════════════════════════════════
// MULTIJOUEUR — PeerJS (WebRTC) : un code de partie court (ex. K7QX2P), topologie en étoile (l'hôte relaie).
// Synchronisé : joueurs (position, pseudo, skin, objet en main, coup de bras), blocs, feu (simulé par l'hôte),
// coffres (contenu + orientation), objets au sol (dont ceux jetés avec la touche A), chat, cycle jour/nuit.
// Non synchronisé : inventaires, armures visibles, four (état global unique dans ce jeu).
// ════════════════════════════════════════════════
const mpEl = id => document.getElementById(id);
const MP_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MP_RELAY = new Set(['p','c','b','dr','dk','du','ch']);   // messages de jeu que l'hôte retransmet tels quels

// ── Pseudo (modifiable dans le menu principal et dans le menu pause) ──
function setUsername(v, fromEl){
  const n = mpCleanName(v); if(!n) return;
  MP.name = n; try{ localStorage.setItem('mc_username', n); }catch(e){}
  for(const id of ['username-in','pause-username']){ const el = mpEl(id); if(el && el!==fromEl) el.value = n; }
  mpSendId(); mpRefreshPause();
}
function mpCleanSkin(u){ return (typeof u==='string' && u.indexOf('data:image/png;base64,')===0 && u.length<300000) ? u : null; }
function mpPlayer(pid){ let p = MP.players.get(pid); if(!p){ p = {pid, name:'Player', skin:null, rp:null, rm:null}; MP.players.set(pid, p); } return p; }
function mpSendId(){ if(MP.open && MP.pid) mpOut({t:'id', n:MP.name, u:currentSkinUri()}); }

// ── Panneau du menu ──
function mpStatus(t, err){ const e = mpEl('mp-status'); if(!e) return; e.textContent = t; e.style.color = err ? '#ff5555' : '#a0a0a0'; }
function mpShow(){
  mpEl('overlay').style.display = 'none'; mpEl('mp-panel').style.display = 'flex';
  const ch = mpEl('mp-choose'), h = mpEl('mp-host'), j = mpEl('mp-join');
  if(MP.role==='host'){ ch.style.display = 'none'; h.style.display = 'block'; j.style.display = 'none'; mpShowCode(); }
  else if(MP.role==='client' && MP.open){ ch.style.display = 'none'; h.style.display = 'none'; j.style.display = 'block'; }
  else { ch.style.display = 'block'; h.style.display = j.style.display = 'none'; mpStatus(''); }
}
function mpBack(){ mpEl('mp-panel').style.display = 'none'; mpEl('overlay').style.display = 'flex'; }
function mpShowCode(){ mpEl('mp-code').textContent = MP.code || '······'; }
function mpCopy(){ const c = MP.code||''; try{ navigator.clipboard.writeText(c); mpStatus('Code copied!'); }catch(e){ mpStatus('Game code: '+c); } }
function mpHost(){ mpEl('mp-choose').style.display = 'none'; mpEl('mp-host').style.display = 'block'; mpOpenHost(); }
function mpJoin(){ mpEl('mp-choose').style.display = 'none'; mpEl('mp-join').style.display = 'block'; mpStatus(''); mpEl('mp-code-in').focus(); }
function mpHostStart(){ mpEl('mp-panel').style.display = 'none'; showCreateWorld(); }

// ── Hôte : ouvre une partie avec un code court ──
function mpOpenHost(){
  if(typeof Peer==='undefined') return mpStatus('PeerJS could not be loaded (are you offline?).', true);
  if(MP.role==='host' && MP.peer){ mpShowCode(); return; }
  mpStatus('Opening the game…');
  const attempt = n=>{
    const code = Array.from({length:6}, ()=>MP_ALPHA[Math.floor(Math.random()*MP_ALPHA.length)]).join('');
    const peer = new Peer('mcweb-'+code);
    peer.on('open', ()=>{
      MP.peer = peer; MP.role = 'host'; MP.pid = 'H'; MP.code = code; MP.open = true;
      mpShowCode(); mpStatus('Game open! Share the code with your friends.');
      mpEl('mp-go').style.display = gameOn ? 'none' : 'block';
      if(gameOn) addChat('Game code: '+code+'  (share it with your friends)', '#ffff55');
      mpRefreshPause();
    });
    peer.on('connection', conn=>mpHostAccept(conn));
    peer.on('disconnected', ()=>{ try{ peer.reconnect(); }catch(e){} });   // signalisation perdue : les liaisons existantes continuent
    peer.on('error', err=>{
      if(err.type==='unavailable-id' && n<6){ try{ peer.destroy(); }catch(e){} attempt(n+1); }
      else if(!MP.open) mpStatus('Network error: '+err.type, true);
    });
  };
  attempt(0);
}
function mpHostAccept(conn){
  if(MP.conns.size >= 7){ conn.on('open', ()=>{ try{ conn.send({t:'full'}); }catch(e){} setTimeout(()=>{ try{ conn.close(); }catch(e){} }, 300); }); return; }
  const c = {pid:'P'+(++MP.pseq), conn, ready:false, hello:false};
  MP.conns.set(c.pid, c);
  conn.on('data', m=>{ try{ mpHostRecv(c, m); }catch(e){ console.error('MP host', e); } });
  conn.on('close', ()=>mpHostDrop(c));
  conn.on('error', ()=>mpHostDrop(c));
}
function mpHostDrop(c){
  if(!MP.conns.has(c.pid)) return;
  MP.conns.delete(c.pid);
  const p = MP.players.get(c.pid);
  if(p){ addChat(p.name+' left the game', '#ffff55'); mpRemoveRemote(p); MP.players.delete(c.pid); }
  mpBroadcast({t:'pl', pid:c.pid}, null); mpRefreshPause();
}
function mpBroadcast(m, exceptPid){   // hôte → tous les clients prêts (sauf l'expéditeur d'origine)
  for(const c of MP.conns.values()) if(c.ready && c.pid!==exceptPid && c.conn.open){ try{ c.conn.send(m); }catch(e){} }
}
function mpOut(m){   // message de jeu sortant : l'hôte diffuse, un client écrit à l'hôte (qui retransmet)
  m.f = MP.pid;
  if(MP.role==='host') mpBroadcast(m, null);
  else if(MP.hostConn && MP.hostConn.open){ try{ MP.hostConn.send(m); }catch(e){} }
}
function mpHostRecv(c, m){
  if(!m || typeof m!=='object') return;
  m.f = c.pid;
  if(m.t==='id'){
    const first = !c.ready; c.ready = true;
    const p = mpPlayer(c.pid); p.name = mpCleanName(m.n) || 'Player'; p.skin = mpCleanSkin(m.u); mpRemoveRemote(p);
    if(first){
      const list = [{pid:'H', n:MP.name, u:currentSkinUri()}];
      for(const q of MP.players.values()) if(q.pid!==c.pid) list.push({pid:q.pid, n:q.name, u:q.skin});
      c.conn.send({t:'wl', pid:c.pid, players:list});
      mpBroadcast({t:'pj', pid:c.pid, n:p.name, u:p.skin}, c.pid);
      addChat(p.name+' joined the game', '#ffff55'); mpRefreshPause();
      if(gameOn) mpHelloTo(c);
    } else mpBroadcast({t:'id', f:c.pid, n:p.name, u:p.skin}, c.pid);
  }
  else if(m.t==='fi') mpFireReq(m);
  else if(m.t==='fx') removeFireAt(m.x|0, m.y|0, m.z|0);
  else if(MP_RELAY.has(m.t)){ mpRecvGame(m); mpBroadcast(m, c.pid); }
}

// ── Client : rejoint avec le code ──
function mpJoinConnect(){
  const code = mpEl('mp-code-in').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(code.length<4) return mpStatus('Enter the game code.', true);
  if(typeof Peer==='undefined') return mpStatus('PeerJS could not be loaded (are you offline?).', true);
  mpClose(); mpStatus('Connecting…');
  const peer = new Peer(); MP.peer = peer; MP.role = 'client';
  let done = false;
  const fail = msg=>{ if(done) return; done = true; mpStatus(msg, true); mpClose(); };
  const to = setTimeout(()=>fail('No answer: check the code (and that the host is online).'), 15000);
  peer.on('error', e=>{ clearTimeout(to); fail(e.type==='peer-unavailable' ? 'No game found with this code.' : 'Network error: '+e.type); });
  peer.on('open', ()=>{
    const conn = peer.connect('mcweb-'+code, {reliable:true});
    conn.on('open', ()=>{
      clearTimeout(to); done = true; MP.hostConn = conn; MP.open = true;
      conn.send({t:'id', n:MP.name, u:currentSkinUri()});
      mpStatus('Connected! Waiting for the host to start the world…');
    });
    conn.on('data', m=>{ try{ mpClientRecv(m); }catch(e){ console.error('MP client', e); } });
    conn.on('close', mpLost);
  });
}
function mpClientRecv(m){
  if(!m || typeof m!=='object') return;
  switch(m.t){
    case 'full': mpStatus('This game is full.', true); mpClose(); break;
    case 'wl':
      MP.pid = m.pid;
      for(const q of m.players){ const p = mpPlayer(q.pid); p.name = mpCleanName(q.n)||'Player'; p.skin = mpCleanSkin(q.u); }
      mpRefreshPause(); break;
    case 'pj': { const p = mpPlayer(m.pid); p.name = mpCleanName(m.n)||'Player'; p.skin = mpCleanSkin(m.u); addChat(p.name+' joined the game', '#ffff55'); mpRefreshPause(); break; }
    case 'pl': { const p = MP.players.get(m.pid); if(p){ addChat(p.name+' left the game', '#ffff55'); mpRemoveRemote(p); MP.players.delete(m.pid); mpRefreshPause(); } break; }
    case 'id': { const p = mpPlayer(m.f); p.name = mpCleanName(m.n)||'Player'; p.skin = mpCleanSkin(m.u); mpRemoveRemote(p); mpRefreshPause(); break; }
    case 'hello': mpOnHello(m); break;
    case 'tm': dayT = +m.d; dayCount = m.c|0; break;
    case 'fi': mpApplyFires([[m.x|0, m.y|0, m.z|0, m.g|0, m.b|0]]); break;
    case 'fx': MP.fireApply = true; try{ removeFireAt(m.x|0, m.y|0, m.z|0); }finally{ MP.fireApply = false; } break;
    default: mpRecvGame(m);
  }
}

// ── Monde : l'hôte envoie l'état complet à chaque nouveau joueur ──
function mpMakeHello(){
  const chests = [], cd = [];
  for(const [k,s] of CHESTS) chests.push([k, s.map(x=>[x.id, x.n])]);
  for(const [k,d] of CHEST_DIR) cd.push([k, d]);
  return {t:'hello', seed:WORLD_SEED, type:WORLD.type, mode:WORLD.mode, sx:Math.floor(P.x), sz:Math.floor(P.z), dayT, dc:dayCount,
    edits:[...MP.edits.values()], cd, chests,
    fire:FIRE_LIST.map(f=>[f.x, f.y, f.z, f.gen||0, f.block||0]),
    drops:drops.filter(d=>!d.collecting).map(d=>[d.uid, d.wx, d.wy, d.wz, d.id, d.n])};
}
function mpHelloTo(c){ c.hello = true; try{ c.conn.send(mpMakeHello()); }catch(e){ console.error(e); } }
function mpHello(){ for(const c of MP.conns.values()) if(c.ready && !c.hello) mpHelloTo(c); }   // appelé quand l'hôte démarre son monde
function mpOnHello(m){
  if(MP.role!=='client' || MP.started || gameOn) return;
  MP.started = true;
  WORLD_SEED = m.seed|0; WORLD.type = m.type; WORLD.mode = m.mode; WORLD.bonus = false; WORLD.cheats = false;
  BIOME_SCALE = m.type==='large' ? 4 : 1; resetNoiseCaches();
  MP.spawn = {sx:m.sx|0, sz:m.sz|0};
  for(const [k,d] of (m.cd||[])) CHEST_DIR.set(k, d);
  mpEl('mp-panel').style.display = 'none'; mpEl('overlay').style.display = 'none';
  handlePlayBtn().then(()=>{
    for(const e of (m.edits||[])) mpApplyEdit(e[0], e[1], e[2], e[3], e[4]);
    for(const [k,s] of (m.chests||[])) mpSetChest(k, s);
    mpApplyFires(m.fire||[]);
    for(const a of (m.drops||[])) spawnDrop(a[1], a[2], a[3], a[4], a[5], {remote:true, uid:a[0], vx:0, vy:0, vz:0});
    dayT = +m.dayT; dayCount = m.dc|0;
    addChat('Connected to the game. Welcome, '+MP.name+'!', '#ffff55'); mpRefreshPause();
  });
}

// ── Messages de jeu (communs hôte / clients) ──
function mpRecvGame(m){
  switch(m.t){
    case 'p': { const pl = mpPlayer(m.f); pl.rp = m; if(m.ar) pl.ar = m.ar; break; }
    case 'c': addChat('<'+mpPlayer(m.f).name+'> '+String(m.m).slice(0,256)); break;
    case 'b': if(gameOn) for(const e of (m.e||[])) mpApplyEdit(e[0], e[1], e[2], e[3], e[4]); break;
    case 'dr': if(gameOn && !drops.some(d=>d.uid===m.u)) spawnDrop(m.x, m.y, m.z, m.i, m.n, {remote:true, uid:m.u, vx:m.vx, vy:m.vy, vz:m.vz, age:m.a||0}); break;
    case 'dk': { const i = drops.findIndex(d=>d.uid===m.u); if(i>=0) removeDrop(i); break; }
    case 'du': { const d = drops.find(d=>d.uid===m.u); if(d) d.n = m.n|0; break; }
    case 'ch': mpSetChest(m.k, m.s); break;
  }
}

// ── Blocs ──
function mpSendEdit(x,y,z,v){
  const k = x+','+y+','+z, e = (v===27 && CHEST_DIR.has(k)) ? [x,y,z,v,CHEST_DIR.get(k)] : [x,y,z,v];
  MP.edits.set(k, e);          // journal complet : sert à synchroniser les joueurs qui arrivent plus tard
  if(MP.open) MP.eq.push(e);   // envoyé en lot dans mpTick
}
function mpApplyEdit(x,y,z,v,d){
  const k = x+','+y+','+z;
  MP.edits.set(k, d===undefined ? [x,y,z,v] : [x,y,z,v,d]);
  if(v===27 && d!==undefined) CHEST_DIR.set(k, d);
  else if(v!==27 && getB(x,y,z)===27){ CHESTS.delete(k); CHEST_DIR.delete(k); }
  MP.applying = true;
  try{ if(setB(x,y,z,v)) markDirty(x,y,z,true); }finally{ MP.applying = false; }
}

// ── Coffres : on envoie le contenu dès qu'il change pendant que le coffre est ouvert (et à la fermeture) ──
const mpChestSig = k => { const s = CHESTS.get(k); return s ? JSON.stringify(s.map(x=>[x.id, x.n])) : null; };
function mpSetChest(k, s){
  const slots = (s||[]).slice(0,27).map(a=>({id: a[0]===undefined ? null : a[0], n: a[1]|0}));
  while(slots.length<27) slots.push({id:null, n:0});
  CHESTS.set(k, slots); MP.chestSig.set(k, mpChestSig(k));
  if(CHEST_CUR===k && mpEl('chest-ui').classList.contains('open')) drawChestUI();
}
function mpChestPoll(dt){
  const isOpen = mpEl('chest-ui').classList.contains('open');
  if(isOpen && CHEST_CUR && MP.chestKey!==CHEST_CUR){ MP.chestKey = CHEST_CUR; MP.chestSig.set(CHEST_CUR, mpChestSig(CHEST_CUR)); MP.chestT = 0; return; }
  if(!MP.chestKey) return;
  MP.chestT += dt;
  if(isOpen && MP.chestT < 0.15) return;
  MP.chestT = 0;
  const k = MP.chestKey, sig = mpChestSig(k);
  if(sig && MP.chestSig.get(k)!==sig){ MP.chestSig.set(k, sig); mpOut({t:'ch', k, s:CHESTS.get(k).map(x=>[x.id, x.n])}); }
  if(!isOpen) MP.chestKey = null;
}

// ── Feu : l'hôte simule, les clients affichent ; un client qui allume / éteint envoie une demande à l'hôte ──
function mpFireMade(f){ if(MP.open && !MP.fireApply) mpOut({t:'fi', x:f.x, y:f.y, z:f.z, g:f.gen||0, b:f.block||0}); }
function mpFireGone(f){ if(MP.open && !MP.fireApply) mpOut({t:'fx', x:f.x, y:f.y, z:f.z}); }
function mpFireReq(m){
  if(MP.role!=='host') return;
  const x = m.x|0, y = m.y|0, z = m.z|0;
  if(m.b){ if(getB(x,y,z)===m.b) igniteBlock(x, y, z, m.b); } else igniteAt(x, y, z, m.g|0);
}
function mpApplyFires(list){
  MP.fireApply = true; MP.applying = true;
  try{ for(const [x,y,z,g,b] of list){ if(b) igniteBlock(x, y, z, b); else igniteAt(x, y, z, g); } }
  finally{ MP.fireApply = false; MP.applying = false; }
}
function mpFireD2(x, z){   // distance² au joueur le plus proche : l'hôte garde les feux vivants autour de TOUS les joueurs
  let best = (x-P.x)*(x-P.x) + (z-P.z)*(z-P.z);
  if(MP.open && MP.role==='host') for(const p of MP.players.values()){ const d = p.rp; if(!d) continue; const q = (x-d.x)*(x-d.x) + (z-d.z)*(z-d.z); if(q<best) best = q; }
  return best;
}

// ── Objet jeté (touche A sur AZERTY = Q sur QWERTY ; Ctrl = toute la pile) ──
function dropHeld(all){
  const it = hotItem(); if(!it || it.id===null || it.n<=0) return;
  const n = all ? it.n : 1, id = it.id;
  it.n -= n; if(it.n<=0){ it.id = null; it.n = 0; }
  const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch), dx = -cp*Math.sin(P.yaw), dz = -cp*Math.cos(P.yaw), SPD = 30;
  spawnDrop(P.x+dx*0.3, P.y+P.eyeH-0.3, P.z+dz*0.3, id, n, {vx:dx*SPD, vy:2.5+sp*6, vz:dz*SPD, age:-1.2});   // âge négatif : délai avant ramassage
  drawHotbar();
}

// ── Objet tenu en main (visible sur le modèle des autres joueurs, et sur le nôtre en 3e personne) ──
let _hBox = null, _hPlane = null;
function makeHeldMesh(id){
  if(id===null || id===undefined) return null;
  if(!_hBox){ _hBox = new THREE.BoxGeometry(6,6,6); _hPlane = new THREE.PlaneGeometry(11,11); }
  const isPlant = typeof id==='number' && BLOCKS[id] && BLOCKS[id].plant;
  const flat = isPlant || (typeof id==='string' && FLAT_DROP_IDS.has(id));
  let mesh;
  if(flat){
    mesh = new THREE.Mesh(_hPlane, dropMaterial(isPlant ? BLOCKS[id].tTop : id, true));
    mesh.rotation.set(0, -Math.PI/2, 0);   // normale vers -x (côté extérieur de la main droite) : la texture est lue à l'endroit, lame vers l'avant
    mesh.rotateOnAxis(new THREE.Vector3(1,1,0).normalize(), Math.PI);   // 180° autour de l'axe du manche (diagonale du sprite) : le manche et la pointe ne bougent pas, les deux autres coins s'échangent
    mesh.position.set(0, -6, 6);           // coin bas-gauche du sprite (le manche) dans la main, diagonale vers l'avant-haut
  } else {
    mesh = new THREE.Mesh(_hBox, (typeof id==='number' && BLOCKS[id]) ? blockDropMats(id) : dropMaterial(typeof id==='string' ? id : 'dirt', false));
    mesh.rotation.set(0, Math.PI/4, 0);
    mesh.position.set(0, -10, 4);
  }
  return mesh;
}
function mpSetHeld(model, id){
  if(model.hid === id) return;
  model.hid = id;
  if(model.heldMesh){ model.rArm.remove(model.heldMesh); model.heldMesh = null; }
  const m = makeHeldMesh(id);
  if(m){ model.rArm.add(m); model.heldMesh = m; }
}

// ── Cycle de vie ──
function mpClose(){
  const peer = MP.peer, hc = MP.hostConn, conns = [...MP.conns.values()];
  MP.peer = null; MP.hostConn = null; MP.conns.clear(); MP.open = false; MP.role = null; MP.pid = null; MP.code = null;
  MP.started = false; MP.eq.length = 0; MP.chestKey = null; MP.armSig = '';
  mpClearLights();
  for(const p of MP.players.values()) mpRemoveRemote(p);
  MP.players.clear();
  try{ if(hc) hc.close(); }catch(e){}
  for(const c of conns){ try{ c.conn.close(); }catch(e){} }
  try{ if(peer) peer.destroy(); }catch(e){}
}
function mpLost(){
  if(!MP.open && !MP.peer) return;
  const wasClient = MP.role==='client', wasIn = gameOn;
  mpClose();
  mpStatus('Disconnected.', true);
  if(wasIn && wasClient){ addChat('Multiplayer: connection to the host lost.', '#ff5555'); fireReset(); }
  mpRefreshPause();
}
function mpRefreshPause(){
  const info = mpEl('pause-mp-info'), btn = mpEl('pause-mp-btn'); if(!info) return;
  const names = [MP.name]; for(const p of MP.players.values()) names.push(p.name);
  if(MP.role==='host' && MP.code){
    info.textContent = 'Game code: '+MP.code+'  ·  '+names.length+' player'+(names.length>1?'s':'')+': '+names.join(', ');
    btn.textContent = 'Copy game code'; btn.style.display = 'block';
  } else if(MP.role==='client' && MP.open){
    info.textContent = 'Connected  ·  '+names.length+' player'+(names.length>1?'s':'')+': '+names.join(', ');
    btn.style.display = 'none';
  } else { info.textContent = 'Single player — the world keeps running while the menu is open in multiplayer.'; btn.textContent = 'Open to friends'; btn.style.display = 'block'; }
}
function mpPauseBtn(){ if(MP.role==='host') mpCopy(); else if(MP.role!=='client') mpOpenHost(); mpRefreshPause(); }
