'use strict';

// ════════════════════════════════════════════════
// APERÇU 3D DU JOUEUR DANS L'INVENTAIRE (comme dans Minecraft)
//   · modèle avec le skin courant, l'armure équipée et l'objet en main
//   · le personnage tourne le corps et la tête vers le curseur (mêmes proportions que Minecraft)
//   · il reprend les mouvements du joueur : posture accroupie, balancement des jambes/bras quand on bouge,
//     léger balancement des bras au repos
// Rendu dans un petit WebGLRenderer à part (créé à la première ouverture), actif seulement quand l'inventaire est ouvert.
// ════════════════════════════════════════════════
const IPV_W = 104, IPV_H = 146;     // taille intérieure du cadre (css px) : 108×150 moins les bordures
let IPV = null;

function ipvMakeModel(tex){
  const mB = new THREE.MeshLambertMaterial({map:tex, emissive:0x444444, emissiveMap:tex, alphaTest:0.5});
  const mO = new THREE.MeshLambertMaterial({map:tex, emissive:0x444444, emissiveMap:tex, alphaTest:0.5, transparent:true});
  const root = new THREE.Group();
  const part = (w,h,d,ub,vb,uo,vo,px,py,pivY,hat)=>{   // mêmes pièces que le modèle en jeu (voir buildPlayerModel)
    const piv = new THREE.Group(); piv.position.set(px,pivY,0);
    const base = new THREE.Mesh(skinBox(w,h,d,ub,vb,0), mB), over = new THREE.Mesh(skinBox(w,h,d,uo,vo,hat?1:0.5), mO);
    base.position.y = over.position.y = py-pivY; piv.userData.cy = py-pivY; piv.add(base, over); root.add(piv); return piv;
  };
  const m = {
    root, mB, mO, armorMeshes:[], asig:null, hid:undefined, heldMesh:null,
    head: part(8,8,8, 0,0, 32,0, 0,28,24,true),   body: part(8,12,4, 16,16, 16,32, 0,18,18,false),
    rArm: part(4,12,4, 40,16, 40,32, -6,18,22,false), lArm: part(4,12,4, 32,48, 48,48, 6,18,22,false),
    rLeg: part(4,12,4, 0,16, 0,32, -2,6,12,false),    lLeg: part(4,12,4, 16,48, 0,48, 2,6,12,false)
  };
  m.head.rotation.order = 'YXZ';
  root.scale.setScalar(0.9375/16);
  return m;
}

function ipvBuild(){
  const canvas = document.getElementById('inv-preview'); if(!canvas) return null;
  let renderer;
  try{ renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true}); }catch(e){ return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  renderer.setSize(IPV_W, IPV_H, false);
  renderer.setClearColor(0x000000, 0);   // fond transparent : le cadre gris de la page fait office de fond
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 1.0));   // même éclairage que le joueur en jeu
  const camera = new THREE.PerspectiveCamera(28, IPV_W/IPV_H, 0.1, 50);
  camera.position.set(0, 0.95, 4.2); camera.lookAt(0, 0.95, 0);
  const uri = currentSkinUri(), img = new Image(), tex = new THREE.Texture(img);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  img.onload = ()=>{ tex.needsUpdate = true; }; img.src = uri;
  const m = ipvMakeModel(tex);
  scene.add(m.root);
  return {canvas, renderer, scene, camera, tex, uri, m, on:false, last:0, t:0, sn:0, phase:0, swing:0, lx:0, lz:0, init:false, fy:0, fp:0};
}

function ipvFrame(ts){
  const V = IPV; if(!V || !V.on) return;
  const ui = document.getElementById('inv-ui');
  if(!ui || !ui.classList.contains('open')){ V.on = false; return; }   // inventaire fermé → on arrête la boucle
  requestAnimationFrame(ipvFrame);
  const dt = Math.min(0.1, Math.max(0, (ts - V.last)/1000)); V.last = ts; V.t += dt;
  const m = V.m;

  // skin changé (import / reset) → nouvelle texture
  const uri = currentSkinUri();
  if(uri !== V.uri){ V.uri = uri; const im = new Image(); im.onload = ()=>{ V.tex.image = im; V.tex.needsUpdate = true; }; im.src = uri; }
  // armure et objet en main
  const asig = P.armor.map(a=>a.id||'').join('|');
  if(asig !== m.asig){ m.asig = asig; rebuildArmor(m, P.armor.map(a=>a.id)); }
  { const hi = hotItem(); mpSetHeld(m, (hi && hi.id!==null && hi.n>0) ? hi.id : null); }

  // mouvement du joueur : on mesure son déplacement horizontal, comme pour le modèle en 3e personne
  if(!V.init){ V.lx = P.x; V.lz = P.z; V.init = true; }
  const mv = Math.hypot(P.x-V.lx, P.z-V.lz); V.lx = P.x; V.lz = P.z;
  const spd = dt>0 ? mv/dt : 0;
  V.swing += (Math.min(1, spd/4.3) - V.swing) * Math.min(1, dt*12);
  V.phase += mv*2.7;
  const amp = Math.sin(V.phase)*1.2*V.swing;
  m.rLeg.rotation.x = amp; m.lLeg.rotation.x = -amp;
  // au repos, les bras se balancent très légèrement (animation d'inactivité de Minecraft)
  const age = V.t*20, idleZ = Math.cos(age*0.09)*0.05 + 0.05, idleX = Math.sin(age*0.067)*0.05;
  m.rArm.rotation.x = -amp + idleX;  m.lArm.rotation.x = amp - idleX;
  m.rArm.rotation.z = -idleZ;        m.lArm.rotation.z = idleZ;
  // posture accroupie (même géométrie que updatePlayerModel)
  V.sn += ((P.sneak?1:0) - V.sn) * Math.min(1, dt*14);
  { const th = 0.5*V.sn, c = Math.cos(th), s = Math.sin(th);
    m.body.rotation.x = th; m.body.position.set(0, 12+6*c, 6*s);
    m.head.position.set(0, 12+12*c, 12*s);
    m.rArm.position.set(-6, 12+10*c, 10*s); m.lArm.position.set(6, 12+10*c, 10*s);
    m.rArm.rotation.x += 0.4*V.sn; m.lArm.rotation.x += 0.4*V.sn;
    m.rLeg.position.z = m.lLeg.position.z = 3.5*V.sn; }

  // le personnage regarde le curseur : corps ±20°, tête ±40° au total, inclinaison ±20° (formules de Minecraft)
  const r = V.canvas.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height*0.17;   // position approximative des yeux
  const f = Math.atan((mouseX - cx)/80), g = Math.atan((mouseY - cy)/80), k = Math.min(1, dt*18);
  V.fy += (f - V.fy)*k; V.fp += (g - V.fp)*k;
  m.root.rotation.y = V.fy*0.349;          // 20°
  m.head.rotation.y = V.fy*0.349;          // +20° par rapport au corps = 40° au total
  m.head.rotation.x = V.fp*0.349;          // curseur au-dessus → la tête se lève

  V.renderer.render(V.scene, V.camera);
}

function invPreviewStart(){
  if(!IPV) IPV = ipvBuild();
  if(!IPV || IPV.on) return;
  IPV.on = true; IPV.last = performance.now(); IPV.init = false;
  requestAnimationFrame(ipvFrame);
}
