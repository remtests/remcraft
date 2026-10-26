'use strict';

// ════════════════════════════════════════════════
// SURVIE : points de vie, faim, dégâts, régénération, noyade, feu, mort et réapparition
// ════════════════════════════════════════════════
// Règles reprises de Minecraft (difficulté Normal) :
//  - 20 PV (10 cœurs) et 20 de faim (10 icônes), + saturation et épuisement
//  - l'épuisement monte avec le sprint, les sauts, la casse de blocs, les dégâts et la régénération ;
//    à 4 il consomme d'abord la saturation, puis la faim
//  - régénération : faim ≥ 18 → 1 PV / 4 s ; faim pleine + saturation → soin rapide (1 PV / 0,5 s au plus)
//  - faim à 0 : 1 dégât / 4 s (sans jamais tuer : il reste au moins 1 PV)
//  - sprint impossible avec 6 de faim ou moins
//  - chute : (hauteur − 3) PV, annulée dans l'eau ; noyade après 15 s sous l'eau (2 PV / s) ; feu, cactus
//  - mort : l'inventaire tombe au sol, écran « You died! », réapparition au point de départ
// Le mode créatif est invulnérable et masque les barres.
const SV = {
  hp:20, food:20, sat:5, exh:0,
  fall:0, air:15, burn:0,
  invul:0, lastDmg:0, foodTimer:0, tickAcc:0, burnT:0, drownT:0,
  inWater:false, headWater:false,
  flash:0, hurtFlash:0, drawT:0, shakeT:0,
  eat:null, dead:false, cause:'', spawn:null, dirty:true, modeShown:null,
};
const SV_MAX = 20, SV_AIR_MAX = 15, SV_EAT_TIME = 1.6;
// nourriture : f = points de faim, m = coefficient de saturation (saturation gagnée = f × m × 2)
const FOOD_VALUES = { apple:{f:4, m:0.3}, bread:{f:5, m:0.6} };
const SV_CAUSE = {
  fall:'fell from a high place', drown:'drowned', starve:'starved to death', cactus:'was pricked to death',
  fire:'burned to death', kill:'died', void:'fell out of the world'
};
const svSafe = () => WORLD.mode==='creative' || WORLD.mode==='spectator';   // modes sans vie ni faim
const svOn = () => WORLD.mode==='survival' && !SV.dead;

// ── Armure : points de défense (Minecraft Java) ──
const ARMOR_DEF = { leather:[1,3,2,1], gold:[2,5,3,1], iron:[2,6,5,2], diamond:[3,8,6,3] };
function svArmorValue(){
  let def = 0, tough = 0;
  P.armor.forEach(a=>{
    const m = (a && a.id!==null) ? ARMOR_OF[a.id] : null;
    if(!m) return;
    def += ARMOR_DEF[m.mat][m.slot];
    if(m.mat==='diamond') tough += 2;
  });
  return {def, tough};
}

// ── Remise à zéro (nouveau monde / réapparition) ──
function svResetStats(){
  SV.hp = SV_MAX; SV.food = 20; SV.sat = 5; SV.exh = 0;
  SV.fall = 0; SV.air = SV_AIR_MAX; SV.burn = 0; SV.invul = 0; SV.lastDmg = 0;
  SV.foodTimer = 0; SV.tickAcc = 0; SV.burnT = 0; SV.drownT = 0;
  SV.flash = 0; SV.hurtFlash = 0; SV.eat = null; SV.dirty = true;
}
function svInit(spawnX, spawnZ){
  SV.dead = false; SV.spawn = {x:spawnX, z:spawnZ};
  svResetStats(); svBuildHud(); svRefreshMode(true);
  document.getElementById('death').style.display = 'none';
  document.getElementById('hud').style.visibility = '';
  svDraw(true);
}

// ── Épuisement / soin / dégâts ──
function svExhaust(a){ if(svOn()) SV.exh = Math.min(40, SV.exh + a); }
function svHeal(a){ if(SV.dead) return; const o = SV.hp; SV.hp = Math.min(SV_MAX, SV.hp + a); if(SV.hp!==o) SV.dirty = true; }
// opt : {armor:true} → réduit par l'armure ; {force:true} → ignore le mode créatif et les temps d'invulnérabilité
function svDamage(amount, cause, opt){
  opt = opt || {};
  if(SV.dead || amount<=0) return false;
  if(svSafe() && !opt.force) return false;
  if(!opt.force){
    if(SV.invul>0){            // 0,5 s d'invulnérabilité : seul un coup plus fort que le précédent passe (la différence)
      if(amount <= SV.lastDmg) return false;
      const diff = amount - SV.lastDmg; SV.lastDmg = amount; amount = diff;
    } else { SV.lastDmg = amount; SV.invul = 0.5; }
  }
  if(opt.armor){
    const {def, tough} = svArmorValue();
    if(def>0) amount *= 1 - Math.min(20, Math.max(def/5, def - amount/(2+tough/4))) / 25;
  }
  SV.hp = Math.max(0, SV.hp - amount);
  SV.exh = Math.min(40, SV.exh + 0.1);
  SV.hurtFlash = 0.3; SV.flash = 0.6; SV.dirty = true;
  if(SV.hp<=0) svDie(cause);
  return true;
}

// ── Mort et réapparition ──
function svDie(cause){
  if(SV.dead) return;
  SV.dead = true; SV.cause = cause; SV.eat = null; SV.burn = 0;
  for(const k in K) K[k] = false;
  mldown = false; mrdown = false; P.breaking = null; P.bprog = 0; P.sprint = false;
  if(typeof _hideBreak==='function') _hideBreak();
  for(const id of ['bbar','ebar']) document.getElementById(id).style.display = 'none';
  if(uiOn) closeUI();               // la grille de craft rend d'abord ses objets à l'inventaire
  // l'inventaire, l'armure et la main secondaire tombent au sol
  const toss = it => { if(it && it.id!==null && it.n>0) spawnDrop(P.x, P.y+1, P.z, it.id, it.n, {vx:(Math.random()-0.5)*6, vy:3+Math.random()*3, vz:(Math.random()-0.5)*6, age:-0.6}); if(it){ it.id = null; it.n = 0; } };
  P.inv.forEach(toss); P.armor.forEach(toss); toss(P.offhand);
  if(typeof rebuildArmor==='function' && typeof PM!=='undefined' && PM) rebuildArmor();
  drawHotbar();
  document.exitPointerLock();
  document.getElementById('death-cause').textContent = (MP.name||'Player')+' '+(SV_CAUSE[cause]||'died');
  document.getElementById('death').style.display = 'flex';
  document.getElementById('hud').style.visibility = 'hidden';   // la barre d'objets disparaît à l'écran de mort
  svDraw(true);
}
function svRespawn(){
  if(!SV.dead) return;
  SV.dead = false; svResetStats();
  for(const k in K) K[k] = false;
  const sp = SV.spawn || {x:P.x, z:P.z}, bm = getBiomeData(Math.floor(sp.x), Math.floor(sp.z));
  P.x = sp.x; P.z = sp.z; P.y = bm.h + 3; P.px = P.x; P.py = P.y; P.pz = P.z;
  P.vx = P.vy = P.vz = 0; P.sx = P.sz = 0; P.fly = false; P.onGround = false;
  document.getElementById('death').style.display = 'none';
  document.getElementById('hud').style.visibility = '';
  if(typeof updateVisibleChunks==='function') updateVisibleChunks(true);
  drawHotbar(); svDraw(true);
  lockPtr();
}

// ── Eau (nage minimale, nécessaire pour la noyade) ──
function svWaterCheck(){
  const wx = Math.floor(P.x), wz = Math.floor(P.z), w = y => getB(wx, Math.floor(P.y+y), wz)===23;
  SV.inWater = w(0.2) || w(0.9);
  SV.headWater = w(P.eyeH);
  return SV.inWater && !P.fly;
}

// ── Appelés par la physique (60 pas/s) ──
function svJump(){ svExhaust(P.sprint ? 0.2 : 0.05); }
function svAfterMove(dist){
  if(!svOn()){ SV.fall = 0; return; }
  if(P.sprint && !P.fly && SV.inWater===false) svExhaust(0.1*dist);
  if(P.fly || SV.inWater){ SV.fall = 0; return; }       // l'eau amortit toute chute
  if(P.onGround){
    if(SV.fall>3) svDamage(Math.ceil(SV.fall-3), 'fall', {force:false});
    SV.fall = 0;
  } else if(P.y < P.py) SV.fall += P.py - P.y;
}

// ── Tick à 20 Hz : faim, régénération, famine ──
function svTick(){
  if(SV.exh>4){
    SV.exh -= 4;
    if(SV.sat>0) SV.sat = Math.max(0, SV.sat-1); else SV.food = Math.max(0, SV.food-1);
    SV.dirty = true;
  }
  if(SV.sat>0 && SV.hp<SV_MAX && SV.food>=20){            // soin rapide
    if(++SV.foodTimer>=10){ const a = Math.min(SV.sat,6); svHeal(a/6); SV.exh += a; SV.foodTimer = 0; }
  } else if(SV.food>=18 && SV.hp<SV_MAX){                 // soin normal
    if(++SV.foodTimer>=80){ svHeal(1); SV.exh += 6; SV.foodTimer = 0; }
  } else if(SV.food<=0){                                  // famine (Normal : ne tue pas)
    if(++SV.foodTimer>=80){ if(SV.hp>1) svDamage(1,'starve',{force:true}); SV.foodTimer = 0; }
  } else SV.foodTimer = 0;
}

// ── Manger : maintenir le clic droit sur un aliment (1,6 s) ──
function svTryEat(){
  if(!svOn()) return false;
  const it = hotItem();
  if(!it || it.id===null || !FOOD_VALUES[it.id] || SV.food>=20) return false;
  SV.eat = {t:0, slot:P.hotbar};
  return true;
}
function svEatStep(dt){
  const e = SV.eat; if(!e) return;
  const it = hotItem(), fv = it && it.id!==null ? FOOD_VALUES[it.id] : null;
  if(!mrdown || uiOn || paused || !fv || SV.food>=20 || P.hotbar!==e.slot){ SV.eat = null; document.getElementById('ebar').style.display = 'none'; return; }
  e.t += dt;
  document.getElementById('ebar').style.display = 'block';
  document.getElementById('efill').style.width = Math.min(100, e.t/SV_EAT_TIME*100)+'%';
  if(e.t >= SV_EAT_TIME){
    it.n--; if(it.n<=0){ it.id = null; it.n = 0; }
    SV.food = Math.min(20, SV.food + fv.f);
    SV.sat = Math.min(SV.food, SV.sat + fv.f*fv.m*2);
    SV.dirty = true; e.t = 0;
    drawHotbar();
  }
}

// ── Contacts dangereux : cactus, feu ──
function svContact(){
  // cactus : un bloc de cactus collé au joueur
  const o = [-0.42, 0, 0.42];
  let cactus = false;
  for(const dx of o){ for(const dz of o){ for(const dy of [0.1,0.9,1.5]){
    if(getB(Math.floor(P.x+dx), Math.floor(P.y+dy), Math.floor(P.z+dz))===22){ cactus = true; break; }
  } if(cactus) break; } if(cactus) break; }
  if(cactus) svDamage(1, 'cactus', {armor:true});
  // feu : les flammes dans la case des pieds ou du corps
  const fx = Math.floor(P.x), fz = Math.floor(P.z), fy = Math.floor(P.y);
  if(FIRES.has(fkey(fx,fy,fz)) || FIRES.has(fkey(fx,fy+1,fz))){ svDamage(1, 'fire'); SV.burn = Math.max(SV.burn, 6); }
}

// ── Mise à jour par frame ──
function svUpdate(dt){
  if(!gameOn) return;
  SV.invul = Math.max(0, SV.invul-dt); SV.hurtFlash = Math.max(0, SV.hurtFlash-dt); SV.flash = Math.max(0, SV.flash-dt);
  if(SV.modeShown !== WORLD.mode) svRefreshMode();
  const hurt = document.getElementById('sv-hurt'), burn = document.getElementById('sv-burn');
  hurt.style.opacity = SV.hurtFlash>0 ? (SV.hurtFlash/0.3*0.55).toFixed(2) : 0;
  if(!svOn()){ burn.style.opacity = 0; return; }

  svWaterCheck();
  SV.tickAcc += dt; let n = 0;
  while(SV.tickAcc>=0.05 && n<5){ svTick(); SV.tickAcc -= 0.05; n++; }
  if(n===5) SV.tickAcc = 0;
  svEatStep(dt);
  if(SV.dead) return;
  svContact();

  // feu : brûlure 1 PV / s, éteinte par l'eau
  if(SV.inWater) SV.burn = 0;
  if(SV.burn>0){
    SV.burn -= dt; SV.burnT += dt;
    if(SV.burnT>=1){ SV.burnT -= 1; svDamage(1,'fire',{force:true}); }
  } else SV.burnT = 0;
  burn.style.opacity = SV.burn>0 ? 0.55 : 0;
  if(SV.dead) return;

  // noyade : 15 s d'air, puis 2 PV par seconde
  if(SV.headWater){
    const was = SV.air; SV.air = Math.max(0, SV.air-dt);
    if(Math.ceil(was/1.5)!==Math.ceil(SV.air/1.5)) SV.dirty = true;
    if(SV.air<=0){ SV.drownT += dt; if(SV.drownT>=1){ SV.drownT -= 1; svDamage(2,'drown',{force:true}); } }
  } else { if(SV.air<SV_AIR_MAX){ SV.air = Math.min(SV_AIR_MAX, SV.air+dt*6); SV.dirty = true; } SV.drownT = 0; }

  SV.drawT += dt; SV.shakeT += dt;
  if(SV.dirty || SV.flash>0 || ((SV.hp<=4 || SV.sat<=0) && SV.shakeT>=0.12)){
    if(SV.drawT>=0.04 || SV.dirty){ SV.drawT = 0; if(SV.shakeT>=0.12) SV.shakeT = 0; svDraw(); }
  }
}

// ══════════════════════ HUD ══════════════════════
function svBuildHud(){
  const hearts = document.getElementById('sv-hearts'), food = document.getElementById('sv-food');
  if(hearts.children.length) return;
  for(let i=0;i<10;i++){
    for(const [wrap,cls] of [[hearts,'sv-h'],[food,'sv-f']]){
      const d = document.createElement('div'); d.className = cls; d.appendChild(document.createElement('i')); wrap.appendChild(d);
    }
    const b = document.createElement('div'); b.className = 'sv-b'; document.getElementById('sv-air').appendChild(b);
  }
}
function svRefreshMode(force){
  SV.modeShown = WORLD.mode;
  const creative = svSafe();
  document.getElementById('sv-status').style.display = creative ? 'none' : 'flex';
  document.getElementById('hud').style.visibility = (WORLD.mode==='spectator' || SV.dead) ? 'hidden' : '';   // spectateur : pas de barre d'objets
  document.getElementById('sv-air').style.display = 'none';
  if(creative){ SV.eat = null; document.getElementById('ebar').style.display = 'none'; }
  SV.dirty = true;
}
function svDraw(force){
  SV.dirty = false;
  if(svSafe()) return;
  const hp = Math.ceil(SV.hp), blink = SV.flash>0 && Math.floor(SV.flash/0.1)%2===1;
  const shakeH = hp<=4 && hp>0, shakeF = SV.sat<=0;
  const H = document.getElementById('sv-hearts').children, F = document.getElementById('sv-food').children;
  for(let i=0;i<10;i++){
    const h = H[i], f = F[i];
    h.className = 'sv-h' + (blink ? ' blink' : '') + (hp>=2*i+2 ? ' full' : hp===2*i+1 ? ' half' : '');
    h.style.transform = shakeH ? 'translateY('+(Math.floor(Math.random()*3)-1)+'px)' : '';
    f.className = 'sv-f' + (SV.food>=2*i+2 ? ' full' : SV.food===2*i+1 ? ' half' : '');   // i = 0 : icône la plus à droite
    f.style.transform = shakeF ? 'translateY('+(Math.floor(Math.random()*3)-1)+'px)' : '';
  }
  // bulles d'air (au-dessus de la faim) : visibles quand on est sous l'eau ou qu'il manque de l'air
  const air = document.getElementById('sv-air'), show = SV.headWater || SV.air<SV_AIR_MAX;
  air.style.display = show ? 'flex' : 'none';
  if(show){
    const n = Math.ceil(SV.air/1.5), B = air.children;
    for(let i=0;i<10;i++) B[i].className = 'sv-b' + (i<n ? ' on' : '');
  }
}
