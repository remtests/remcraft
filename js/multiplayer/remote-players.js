'use strict';

// ── Joueurs distants ──
function mpRemoveRemote(p){
  const r = p.rm; if(!r) return;
  scene.remove(r.root); scene.remove(r.tag);
  r.root.traverse(o=>{ if(o.geometry && o.geometry!==_hBox && o.geometry!==_hPlane) o.geometry.dispose(); });
  r.mB.dispose(); r.mO.dispose(); r.tex.dispose(); r.tag.material.map.dispose(); r.tag.material.dispose();
  p.rm = null;
}
function mpMakeRemote(p){
  const img = new Image(), tex = new THREE.Texture(img);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  img.onload = ()=>{ tex.needsUpdate = true; }; img.src = p.skin || SKIN_URI;
  const mB = new THREE.MeshLambertMaterial({map:tex, emissive:0x444444, emissiveMap:tex, alphaTest:0.5});
  const mO = new THREE.MeshLambertMaterial({map:tex, emissive:0x444444, emissiveMap:tex, alphaTest:0.5, transparent:true});
  const root = new THREE.Group();
  const part = (w,h,d,ub,vb,uo,vo,px,py,pivY,hat)=>{
    const piv = new THREE.Group(); piv.position.set(px,pivY,0);
    const base = new THREE.Mesh(skinBox(w,h,d,ub,vb,0), mB), over = new THREE.Mesh(skinBox(w,h,d,uo,vo,hat?1:0.5), mO);
    base.position.y = over.position.y = py-pivY; piv.userData.cy = py-pivY; piv.add(base, over); root.add(piv); return piv;
  };
  const R = {
    root, mB, mO, tex, armorMeshes:[], asig:'',
    head: part(8,8,8, 0,0, 32,0, 0,28,24,true),   body: part(8,12,4, 16,16, 16,32, 0,18,18,false),
    rArm: part(4,12,4, 40,16, 40,32, -6,18,22,false), lArm: part(4,12,4, 32,48, 48,48, 6,18,22,false),
    rLeg: part(4,12,4, 0,16, 0,32, -2,6,12,false),    lLeg: part(4,12,4, 16,48, 0,48, 2,6,12,false),
    x:0, y:0, z:0, by:0, phase:0, swing:0, hit:0, sn:0, init:false, hid:undefined, heldMesh:null
  };
  R.head.rotation.order = 'YXZ';
  root.scale.setScalar(0.9375/16);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 40;
  const g = cv.getContext('2d'); g.font = 'bold 24px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(250, g.measureText(p.name).width+16);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(128-tw/2, 4, tw, 32);
  g.fillStyle = '#fff'; g.fillText(p.name, 128, 21);
  R.tag = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv), transparent:true, depthTest:false}));
  R.tag.scale.set(1.6, 0.25, 1); R.tag.renderOrder = 10;
  scene.add(root, R.tag);
  return R;
}
function mpUpdateRemote(p, dt){
  const d = p.rp; if(!d) return;
  const r = p.rm || (p.rm = mpMakeRemote(p));
  if(!r.init){ r.x = d.x; r.y = d.y; r.z = d.z; r.by = d.yaw; r.init = true; }
  const k = Math.min(1, dt*14), ox = r.x, oz = r.z;
  r.x += (d.x-r.x)*k; r.y += (d.y-r.y)*k; r.z += (d.z-r.z)*k;
  const mvx = r.x-ox, mvz = r.z-oz, mv = Math.hypot(mvx, mvz), spd = dt>0 ? mv/dt : 0;
  r.swing += (Math.min(1, spd/4.3)-r.swing)*Math.min(1, dt*12); r.phase += mv*2.7;
  const amp = Math.sin(r.phase)*1.2*r.swing;
  r.rLeg.rotation.x = amp; r.lLeg.rotation.x = -amp; r.rArm.rotation.x = -amp; r.lArm.rotation.x = amp;
  if(d.a){ r.hit += dt*12; r.rArm.rotation.x = -(1.0+0.7*Math.abs(Math.sin(r.hit))); } else r.hit = 0;   // coup de bras (casse / frappe)
  r.sn += ((d.s ? 1 : 0) - r.sn) * Math.min(1, dt*14);   // accroupi : le torse se penche autour des hanches, tête et bras suivent, les jambes reculent
  { const th = 0.5*r.sn, c = Math.cos(th), sn = Math.sin(th);
    r.body.rotation.x = th; r.body.position.set(0, 12+6*c, 6*sn);
    r.head.position.set(0, 12+12*c, 12*sn);
    r.rArm.position.set(-6, 12+10*c, 10*sn); r.lArm.position.set(6, 12+10*c, 10*sn);
    r.rArm.rotation.x += 0.4*r.sn; r.lArm.rotation.x += 0.4*r.sn;
    r.rLeg.position.z = r.lLeg.position.z = 3.5*r.sn; }
  mpSetHeld(r, d.h===undefined ? null : d.h);
  { const asig = (p.ar||[]).join('|'); if(asig!==r.asig){ r.asig = asig; rebuildArmor(r, p.ar||[null,null,null,null]); } }   // armure du joueur distant
  const wrap = a=>{ a = (a+Math.PI)%(2*Math.PI); if(a<0) a += 2*Math.PI; return a-Math.PI; };
  const MAXD = 70*Math.PI/180, df = wrap(d.yaw-r.by);
  if(spd > 0.6) r.by += wrap(Math.atan2(-mvx,-mvz)-r.by)*Math.min(1, dt*10);
  else if(Math.abs(df) > MAXD) r.by += wrap(d.yaw-Math.sign(df)*MAXD-r.by)*Math.min(1, dt*14);
  r.head.rotation.y = Math.max(-1.45, Math.min(1.45, wrap(d.yaw-r.by))); r.head.rotation.x = -d.pitch;
  r.root.position.set(r.x, r.y, r.z); r.root.rotation.y = r.by+Math.PI;
  r.tag.position.set(r.x, r.y+2.2-0.25*r.sn, r.z);   // le pseudo descend quand le joueur s'accroupit
}
function mpTick(dt){
  if(!MP.open || !MP.pid) return;
  MP.lastSend += dt;
  if(MP.lastSend > 0.066){   // position, orientation, objet en main, coup de bras (~15 Hz)
    MP.lastSend = 0;
    const it = hotItem(), off = P.offhand, isT = id=>id==='torch' || id===20;
    const msg = {t:'p', x:P.x, y:P.y, z:P.z, yaw:P.yaw, pitch:P.pitch, h:(it && it.id!==null && it.n>0) ? it.id : null, a:(mldown && !uiOn) ? 1 : 0, s:P.sneak ? 1 : 0,
      l:((it && it.n>0 && isT(it.id)) || (off && off.n>0 && isT(off.id))) ? 1 : 0};   // l : une torche est tenue (main ou seconde main)
    const ar = P.armor.map(x=>(x.id===null || x.id===undefined) ? null : x.id), sig = ar.join('|');
    MP.armT += 0.066;
    if(sig!==MP.armSig || MP.armT>2){ msg.ar = ar; MP.armSig = sig; MP.armT = 0; }   // armure : envoyée au changement (+ rappel régulier pour les arrivants)
    mpOut(msg);
  }
  if(MP.eq.length){ const e = MP.eq; MP.eq = []; mpOut({t:'b', e}); }   // modifications de blocs groupées en un seul message
  if(MP.role==='host'){ MP.tmT += dt; if(MP.tmT > 1){ MP.tmT = 0; mpBroadcast({t:'tm', d:dayT, c:dayCount}, null); } }   // heure du monde
  mpChestPoll(dt);
  for(const p of MP.players.values()) mpUpdateRemote(p, dt);
  // lumière dynamique : un joueur distant qui tient une torche éclaire le décor autour de lui (comme la nôtre)
  const U = LIGHT_UNI.uFire.value; let k = 6;
  for(const p of MP.players.values()){ const r = p.rm; if(k<U.length && r && p.rp && p.rp.l) U[k++].set(r.x, r.y+1.3, r.z, 13); }
  while(k<U.length) U[k++].set(0, -9999, 0, 0);
}
function mpClearLights(){ const U = LIGHT_UNI.uFire.value; for(let k=6;k<U.length;k++) U[k].set(0, -9999, 0, 0); }
for(const id of ['username-in','pause-username']){ const el = mpEl(id); if(el) el.value = MP.name; }
