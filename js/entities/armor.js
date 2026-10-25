'use strict';

// ════════════════════════════════════════════════
// ARMURES : 2 textures 64×32 par matériau, plaquées sur des boîtes gonflées autour des membres du skin
//   layer_1 : casque (tête), plastron (torse + bras), bottes (jambes)  — boîtes gonflées de +1 px par face
//   layer_2 : pantalon (torse + jambes)                                — boîtes gonflées de +0,5 px par face
// Les membres gauches réutilisent la texture du membre droit, en miroir (format 64×32 historique).
// ════════════════════════════════════════════════
const ARMOR_IMG = {};
const ARMOR_OF = {};   // id d'objet → {slot:0..3, mat}
for(const [prefix, mat] of [['iron','iron'],['golden','gold'],['diamond','diamond'],['leather','leather']])
  ['helmet','chestplate','leggings','boots'].forEach((piece, i)=>{ ARMOR_OF[prefix+'_'+piece] = {slot:i, mat}; });
const armorSlotOf = id => (typeof id==='string' && ARMOR_OF[id]) ? ARMOR_OF[id].slot : -1;

const LEATHER_DYE = '#a06540';   // couleur par défaut du cuir non teint
function composeLeather(layer){   // base grise teintée + overlay (sangles, boutons) non teinté
  const base = ARMOR_IMG['leather_layer_'+layer], ov = ARMOR_IMG['leather_layer_'+layer+'_overlay'];
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
  const c = cv.getContext('2d');
  c.drawImage(base,0,0);
  c.globalCompositeOperation = 'multiply'; c.fillStyle = LEATHER_DYE; c.fillRect(0,0,64,32);
  c.globalCompositeOperation = 'destination-in'; c.drawImage(base,0,0);
  c.globalCompositeOperation = 'source-over'; if(ov) c.drawImage(ov,0,0);
  return cv;
}
const _armorMats = {};
function armorMat(mat, layer){
  const k = mat+'_'+layer;
  if(_armorMats[k]) return _armorMats[k];
  const cv = mat==='leather' ? composeLeather(layer) : ARMOR_IMG[mat+'_layer_'+layer];
  if(!cv){ console.warn('Armor texture missing:', mat, layer); }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return _armorMats[k] = new THREE.MeshLambertMaterial({map:t, emissive:0x444444, emissiveMap:t, alphaTest:0.5});
}
function armorBox(w,h,d,u,v,inf,mirror){
  const g = new THREE.BoxGeometry(w+inf, h+inf, d+inf), uv = g.attributes.uv;
  // ordre three.js : +x, -x, +y, -y, +z, -z (le personnage regarde vers +z ; sa gauche est +x)
  const faces = [
    [u+d+w, v+d, d, h, 0], [u, v+d, d, h, 0], [u+d, v, w, d, 0],
    [u+d+w, v, w, d, 1],   [u+d, v+d, w, h, 0], [u+2*d+w, v+d, w, h, 0]
  ];
  if(mirror){ const t = faces[0]; faces[0] = faces[1]; faces[1] = t; }
  faces.forEach((f,i)=>{
    let u0 = f[0]/64, u1 = (f[0]+f[2])/64;
    if(mirror){ const t = u0; u0 = u1; u1 = t; }
    let vt = 1-f[1]/32, vb = 1-(f[1]+f[3])/32;
    if(f[4]){ const t = vt; vt = vb; vb = t; }
    uv.setXY(i*4,   u0, vt); uv.setXY(i*4+1, u1, vt);
    uv.setXY(i*4+2, u0, vb); uv.setXY(i*4+3, u1, vb);
  });
  uv.needsUpdate = true;
  return g;
}
function rebuildArmor(m, ids){
  m = m || PM; ids = ids || P.armor.map(a=>a.id);
  for(const a of m.armorMeshes){ if(a.parent) a.parent.remove(a); a.geometry.dispose(); }
  m.armorMeshes = [];
  const add = (part, mat, layer, w,h,d, u,v, inf, mirror)=>{
    const mesh = new THREE.Mesh(armorBox(w,h,d,u,v,inf,mirror), armorMat(mat,layer));
    mesh.position.y = part.userData.cy;
    part.add(mesh); m.armorMeshes.push(mesh);
  };
  for(let i=0;i<4;i++){
    const aid = ids[i], a = (aid!==null && aid!==undefined) ? ARMOR_OF[aid] : null;
    if(!a || a.slot!==i) continue;
    const mt = a.mat;
    if(i===0) add(m.head, mt,1, 8,8,8,  0,0,  2,false);
    else if(i===1){
      add(m.body, mt,1, 8,12,4, 16,16, 2,false);
      add(m.rArm, mt,1, 4,12,4, 40,16, 2,false);
      add(m.lArm, mt,1, 4,12,4, 40,16, 2,true);
    } else if(i===2){
      add(m.body, mt,2, 8,12,4, 16,16, 1,false);
      add(m.rLeg, mt,2, 4,12,4,  0,16, 1,false);
      add(m.lLeg, mt,2, 4,12,4,  0,16, 1,true);
    } else {
      add(m.rLeg, mt,1, 4,12,4,  0,16, 2,false);
      add(m.lLeg, mt,1, 4,12,4,  0,16, 2,true);
    }
  }
}
// Icônes du cuir (casque/plastron/pantalon) : dérivées des icônes en fer, désaturées puis teintées
function makeLeatherIcons(){
  for(const piece of ['helmet','chestplate','leggings']){
    const src = IMGS['iron_'+piece]; if(!src) continue;
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const c = cv.getContext('2d'); c.drawImage(src,0,0);
    const id = c.getImageData(0,0,16,16), d = id.data;
    for(let i=0;i<d.length;i+=4){
      const g = (d[i]*0.3 + d[i+1]*0.59 + d[i+2]*0.11) / 255;
      d[i] = Math.min(255, g*160*1.35); d[i+1] = Math.min(255, g*101*1.35); d[i+2] = Math.min(255, g*64*1.35);
    }
    c.putImageData(id,0,0);
    IMGS['leather_'+piece] = cv;
    const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    T3['leather_'+piece] = t;
  }
}
