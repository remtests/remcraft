'use strict';

// ════════════════════════════════════════════════
// SKIN + MODÈLE DU JOUEUR + CAMÉRA (F5)
// ════════════════════════════════════════════════
const SKIN_URI='assets/textures/skins/default_skin.png';
let camMode=0;            // 0 = première personne, 1 = troisième (dos), 2 = troisième (face)
let PM=null;              // modèle du joueur
// ── Skin personnalisé : PNG 64×64 (ou 64×32 ancien format), conservé dans le localStorage ──
const SKIN_KEY = 'mc_skin_v1';
function customSkinUri(){
  try{ const v = localStorage.getItem(SKIN_KEY); if(v && v.indexOf('data:image/png;base64,')===0) return v; }catch(e){}
  return null;
}
function currentSkinUri(){ return customSkinUri() || SKIN_URI; }
function skinMsg(text, err){
  const st = document.getElementById('skin-status'); st.textContent = text; st.style.color = err ? '#ff5555' : '#a0a0a0';
}
function skinRefreshUI(){
  const custom = customSkinUri();
  skinMsg(custom ? 'Custom skin' : 'Default skin', false);
  document.getElementById('skin-reset').style.display = custom ? 'inline' : 'none';
  const img = new Image();
  img.onload = ()=>{   // aperçu du visage (tête + calque « chapeau »)
    const c = document.getElementById('skin-face').getContext('2d'); c.imageSmoothingEnabled = false;
    c.clearRect(0,0,8,8); c.drawImage(img, 8,8,8,8, 0,0,8,8); c.drawImage(img, 40,8,8,8, 0,0,8,8);
  };
  img.src = currentSkinUri();
}
function applySkinToModel(){
  if(!PM) return;
  const img = new Image(), tex = PM.head.children[0].material.map;
  img.onload = ()=>{ tex.image = img; tex.needsUpdate = true; };
  img.src = currentSkinUri();
}
function importSkinFile(file){
  if(!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onerror = ()=>{ URL.revokeObjectURL(url); skinMsg('This file is not a valid PNG image.', true); };
  img.onload = ()=>{
    URL.revokeObjectURL(url);
    if(img.width!==64 || (img.height!==64 && img.height!==32)){ skinMsg('Skin must be a 64×64 (or 64×32) PNG.', true); return; }
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0);
    if(img.height===32){   // ancien format : les membres gauches sont les membres droits en miroir (même conversion que Minecraft)
      for(const [x,y,xo,yo,w,h] of [[4,16,16,32,4,4],[8,16,16,32,4,4],[0,20,24,32,4,12],[4,20,16,32,4,12],[8,20,8,32,4,12],[12,20,16,32,4,12],
                                    [44,16,-8,32,4,4],[48,16,-8,32,4,4],[40,20,0,32,4,12],[44,20,-8,32,4,12],[48,20,-16,32,4,12],[52,20,-8,32,4,12]]){
        c.save(); c.translate(x+xo+w, y+yo); c.scale(-1,1); c.drawImage(cv, x,y,w,h, 0,0,w,h); c.restore();
      }
    }
    // couche de base toujours opaque (comme Minecraft) ; les calques « jacket / hat / sleeves » gardent leur transparence
    for(const [x,y,w,h] of [[0,0,32,16],[16,16,24,16],[40,16,16,16],[0,16,16,16],[16,48,16,16],[32,48,16,16]]){
      const id = c.getImageData(x,y,w,h), d = id.data;
      for(let i=3;i<d.length;i+=4) d[i] = 255;
      c.putImageData(id,x,y);
    }
    try{ localStorage.setItem(SKIN_KEY, cv.toDataURL('image/png')); }
    catch(e){ skinMsg('Could not store the skin (storage full or blocked).', true); return; }
    skinRefreshUI(); applySkinToModel();
  };
  img.src = url;
}
function resetSkin(){
  try{ localStorage.removeItem(SKIN_KEY); }catch(e){}
  skinRefreshUI(); applySkinToModel();
}
skinRefreshUI();

function skinBox(w,h,d,u,v,inf){
  const g=new THREE.BoxGeometry(w+inf,h+inf,d+inf);
  const uv=g.attributes.uv;
  // ordre three.js : +x, -x, +y, -y, +z, -z  (le personnage regarde vers +z ; sa droite est -x)
  const faces=[
    [u+d+w, v+d, d, h, 0],   // côté gauche
    [u,     v+d, d, h, 0],   // côté droit
    [u+d,   v,   w, d, 0],   // dessus
    [u+d+w, v,   w, d, 1],   // dessous (retourné)
    [u+d,   v+d, w, h, 0],   // face
    [u+2*d+w, v+d, w, h, 0]  // dos
  ];
  faces.forEach((f,i)=>{
    const u0=f[0]/64,u1=(f[0]+f[2])/64;
    let vt=1-f[1]/64,vb=1-(f[1]+f[3])/64;
    if(f[4]){const t=vt;vt=vb;vb=t;}
    uv.setXY(i*4+0,u0,vt); uv.setXY(i*4+1,u1,vt);
    uv.setXY(i*4+2,u0,vb); uv.setXY(i*4+3,u1,vb);
  });
  uv.needsUpdate=true;
  return g;
}
function buildPlayerModel(){
  const img=new Image();
  const tex=new THREE.Texture(img);
  tex.magFilter=THREE.NearestFilter; tex.minFilter=THREE.NearestFilter; tex.generateMipmaps=false;
  img.onload=()=>{tex.needsUpdate=true;};
  img.src=currentSkinUri();
  const mBase=new THREE.MeshLambertMaterial({map:tex,emissive:0x444444,emissiveMap:tex,alphaTest:0.5});
  const mOver=new THREE.MeshLambertMaterial({map:tex,emissive:0x444444,emissiveMap:tex,alphaTest:0.5,transparent:true});
  const root=new THREE.Group();
  const part=(w,h,d,ub,vb,uo,vo,px,py,pivY,hat)=>{
    // pivot en (px,pivY) ; la boîte est centrée en py
    const piv=new THREE.Group(); piv.position.set(px,pivY,0);
    const base=new THREE.Mesh(skinBox(w,h,d,ub,vb,0),mBase);
    const over=new THREE.Mesh(skinBox(w,h,d,uo,vo,hat?1:0.5),mOver);
    base.position.y=over.position.y=py-pivY;
    piv.userData.cy=py-pivY;
    piv.add(base,over); root.add(piv); return piv;
  };
  PM={
    root,
    head:  part(8,8,8,   0,0,   32,0,   0,28,24,true),
    body:  part(8,12,4, 16,16, 16,32,   0,18,18,false),
    rArm:  part(4,12,4, 40,16, 40,32,  -6,18,22,false),
    lArm:  part(4,12,4, 32,48, 48,48,   6,18,22,false),
    rLeg:  part(4,12,4,  0,16,  0,32,  -2,6,12,false),
    lLeg:  part(4,12,4, 16,48,  0,48,   2,6,12,false),
    armorMeshes:[], armorSig:'', sn:0, phase:0, swing:0, hit:0, lx:0, lz:0, by:0, init:false
  };
  PM.head.rotation.order='YXZ';   // d'abord pivoter sur l'axe vertical, puis lever/baisser la tête
  root.scale.setScalar(0.9375/16);
  root.visible=false;
  scene.add(root);
}
function updatePlayerModel(x,y,z,dt){
  if(!PM) buildPlayerModel();
  const m=PM;
  const asig=P.armor.map(a=>a.id||'').join('|');   // l'équipement a changé → on reconstruit les coques d'armure
  if(asig!==m.armorSig){ m.armorSig=asig; rebuildArmor(); }
  { const hi=hotItem(); mpSetHeld(m, (hi && hi.id!==null && hi.n>0) ? hi.id : null); }
  if(camMode===0){ m.root.visible=false; m.init=false; return; }
  m.root.visible=true;
  if(!m.init){ m.lx=x; m.lz=z; m.by=P.yaw; m.init=true; }
  const mvx=x-m.lx, mvz=z-m.lz, mv=Math.hypot(mvx,mvz); m.lx=x; m.lz=z;
  const spd=dt>0?mv/dt:0;
  const target=Math.min(1,spd/4.3);
  m.swing+=(target-m.swing)*Math.min(1,dt*12);
  m.phase+=mv*2.7;
  const amp=Math.sin(m.phase)*1.2*m.swing;
  m.rLeg.rotation.x= amp; m.lLeg.rotation.x=-amp;
  m.rArm.rotation.x=-amp; m.lArm.rotation.x= amp;
  if(mldown&&!uiOn){ m.hit+=dt*12; m.rArm.rotation.x=-(1.0+0.7*Math.abs(Math.sin(m.hit))); }
  else m.hit=0;
  // posture accroupie : le torse se penche autour des hanches, la tête et les bras suivent, les jambes reculent
  m.sn += ((P.sneak?1:0) - m.sn) * Math.min(1, dt*14);
  { const th=0.5*m.sn, c=Math.cos(th), sn=Math.sin(th);
    m.body.rotation.x = th; m.body.position.set(0, 12+6*c, 6*sn);
    m.head.position.set(0, 12+12*c, 12*sn);
    m.rArm.position.set(-6, 12+10*c, 10*sn); m.lArm.position.set(6, 12+10*c, 10*sn);
    m.rArm.rotation.x += 0.4*m.sn; m.lArm.rotation.x += 0.4*m.sn;
    m.rLeg.position.z = m.lLeg.position.z = 3.5*m.sn; }
  // tête d'abord, corps ensuite (easing), écart max tête/corps limité
  const wrap=a=>{a=(a+Math.PI)%(2*Math.PI);if(a<0)a+=2*Math.PI;return a-Math.PI;};
  // la tête tourne seule jusqu'à 70° ; au-delà, le corps suit (avec easing)
  const MAXD=70*Math.PI/180;
  const df=wrap(P.yaw-m.by);
  if(dt>0 && mv/dt>0.6){
    // en marche : le corps se réaligne sur la direction réelle du déplacement (plus de moonwalk en arrière / en strafe)
    const hd=Math.atan2(-mvx,-mvz);
    m.by+=wrap(hd-m.by)*Math.min(1,dt*10);
  } else if(Math.abs(df)>MAXD){
    const tgt=P.yaw-Math.sign(df)*MAXD;
    m.by+=wrap(tgt-m.by)*Math.min(1,dt*14);
  }
  m.head.rotation.y=Math.max(-1.45,Math.min(1.45,wrap(P.yaw-m.by)));
  m.head.rotation.x=-P.pitch;
  m.root.position.set(x,y,z);
  m.root.rotation.y=m.by+Math.PI;
}
function updateCamera(ex,ey,ez){
  camera.rotation.z = svTiltRoll();   // tilt de caméra quand le joueur prend des dégâts (survival.js)
  if(camMode===0){ camera.rotation.y=P.yaw; camera.rotation.x=P.pitch; camera.position.set(ex,ey,ez); return; }
  const sg=camMode===2?-1:1;   // 2 = caméra devant le joueur, tournée vers lui
  if(sg>0){ camera.rotation.y=P.yaw; camera.rotation.x=P.pitch; }
  else { camera.rotation.y=P.yaw+Math.PI; camera.rotation.x=-P.pitch; }
  const cp=Math.cos(P.pitch);
  const bx=sg*Math.sin(P.yaw)*cp, by=-sg*Math.sin(P.pitch), bz=sg*Math.cos(P.yaw)*cp;
  let d=4;
  for(let s=0.2;s<=4;s+=0.1){
    if(solid(ex+bx*s,ey+by*s,ez+bz*s)){ d=Math.max(0.3,s-0.25); break; }
  }
  camera.position.set(ex+bx*d,ey+by*d,ez+bz*d);
}
