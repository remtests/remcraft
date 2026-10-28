'use strict';

// ════════════════════════════════════════════════
// WORLD-SPACE ITEM DROPS (géométries et matériaux PARTAGÉS : plus de fuite mémoire)
// ════════════════════════════════════════════════
const drops=[];
const DROP_SIZE=0.375;   // 0.25 × 1.5
const DROP_FLAT_DEPTH=2;   // épaisseur des items extrudés, en « pixels » de texture (16 px = toute la largeur)
const MAX_DROPS=160, DROP_LIFETIME=300;
let _dropBox=null, _dropPlane=null;
const _dropMats=new Map();

// IDs qui doivent dropper comme une texture plate (items, pas des blocs)
const FLAT_DROP_IDS = new Set([
  'raw_iron','raw_gold','diamond','coal',
  'iron_ingot','gold_ingot','stick','flint','flint_and_steel',
  'bread','apple','coal','arrow','bow','shears','bucket',
  'water_bucket','sugar_cane','wheat','torch','saddle',
  'iron_sword','iron_pickaxe','iron_axe','iron_shovel','iron_hoe',
  'wooden_sword','wooden_pickaxe','wooden_axe','wooden_shovel','wooden_hoe',
  'stone_sword','stone_pickaxe','stone_axe','stone_shovel','stone_hoe',
  'golden_sword','golden_pickaxe','golden_axe','golden_shovel','golden_hoe',
  'diamond_sword','diamond_pickaxe','diamond_axe','diamond_shovel','diamond_hoe',
  'iron_helmet','iron_chestplate','iron_leggings','iron_boots',
  'diamond_helmet','diamond_chestplate','diamond_leggings','diamond_boots',
  'golden_helmet','golden_chestplate','golden_leggings','golden_boots',
  'leather_helmet','leather_chestplate','leather_leggings','leather_boots','paper','book','compass','clock','oak_door','iron_door',
  'oak_sign',
]);

// Lumière dynamique : les drops reçoivent la torche en main (locale + autres joueurs) et les feux, comme le décor (mêmes uniformes LIGHT_UNI)
function patchDropShader(sh){
  sh.uniforms.uBlkCol = LIGHT_UNI.uBlkCol;
  sh.uniforms.uHeld   = LIGHT_UNI.uHeld;
  sh.uniforms.uFire   = LIGHT_UNI.uFire;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDropWP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDropWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uBlkCol;\nuniform vec4 uHeld;\nuniform vec4 uFire[14];\nvarying vec3 vDropWP;')
    .replace('#include <aomap_fragment>',
      'float hf = uHeld.w > 0.0 ? clamp(1.0 - distance(vDropWP, uHeld.xyz)/uHeld.w, 0.0, 1.0) : 0.0;\n' +
      'hf = hf*hf;\n' +
      'for(int fi=0; fi<14; fi++){ float fr = uFire[fi].w; if(fr > 0.0){ float ff = clamp(1.0 - distance(vDropWP, uFire[fi].xyz)/fr, 0.0, 1.0); hf = max(hf, ff*ff); } }\n' +
      'reflectedLight.indirectDiffuse = max(reflectedLight.indirectDiffuse, uBlkCol * hf * diffuseColor.rgb);\n' +
      '#include <aomap_fragment>');
}
function dropMaterial(key, flat){
  const k = (flat?'f:':'b:')+key;
  let m = _dropMats.get(k);
  if(!m){
    m = new THREE.MeshLambertMaterial(flat
      ? {map:getTex(key), alphaTest:0.1, side:THREE.DoubleSide}
      : {map:getTex(key)});
    m.onBeforeCompile = patchDropShader;
    _dropMats.set(k,m);
  }
  return m;
}

// Item plat → plaque extrudée : faces avant/arrière (alpha-testées) + une tranche par pixel de bord (la couleur du pixel)
const _dropFlatGeos = new Map();
function extrudedDropGeo(key){
  if(_dropFlatGeos.has(key)) return _dropFlatGeos.get(key);
  let geo = null;
  const src = IMGS[key];
  if(src){
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(src,0,0,16,16);
    const px = cx.getImageData(0,0,16,16).data;
    const solid = (x,y) => x>=0 && y>=0 && x<16 && y<16 && px[(y*16+x)*4+3] > 25;
    const S = DROP_SIZE*1.1, h = S/2, pw = S/16, D2 = pw*DROP_FLAT_DEPTH/2;
    const pos=[], nor=[], uv=[], ind=[];
    const quad = (pts, n, uvs) => {   // pts : 4 sommets ; l'ordre est corrigé pour que la face regarde vers n
      const a=pts[0], b=pts[1], c=pts[2];
      const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
      const dot=(uy*vz-uz*vy)*n[0]+(uz*vx-ux*vz)*n[1]+(ux*vy-uy*vx)*n[2];
      const o = dot>=0 ? [0,1,2,3] : [0,3,2,1], i0 = pos.length/3;
      for(const j of o){ pos.push(...pts[j]); nor.push(...n); uv.push(...uvs[j]); }
      ind.push(i0,i0+1,i0+2, i0,i0+2,i0+3);
    };
    quad([[-h,-h,D2],[h,-h,D2],[h,h,D2],[-h,h,D2]], [0,0,1], [[0,0],[1,0],[1,1],[0,1]]);
    quad([[-h,-h,-D2],[h,-h,-D2],[h,h,-D2],[-h,h,-D2]], [0,0,-1], [[0,0],[1,0],[1,1],[0,1]]);
    for(let y=0;y<16;y++) for(let x=0;x<16;x++){
      if(!solid(x,y)) continue;
      const X0=-h+x*pw, X1=X0+pw, Y1=h-y*pw, Y0=Y1-pw, u=(x+0.5)/16, v=1-(y+0.5)/16, t=[[u,v],[u,v],[u,v],[u,v]];
      if(!solid(x-1,y)) quad([[X0,Y0,-D2],[X0,Y0,D2],[X0,Y1,D2],[X0,Y1,-D2]], [-1,0,0], t);
      if(!solid(x+1,y)) quad([[X1,Y0,-D2],[X1,Y0,D2],[X1,Y1,D2],[X1,Y1,-D2]], [1,0,0], t);
      if(!solid(x,y-1)) quad([[X0,Y1,-D2],[X1,Y1,-D2],[X1,Y1,D2],[X0,Y1,D2]], [0,1,0], t);
      if(!solid(x,y+1)) quad([[X0,Y0,-D2],[X1,Y0,-D2],[X1,Y0,D2],[X0,Y0,D2]], [0,-1,0], t);
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nor,3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(ind);
  }
  _dropFlatGeos.set(key, geo);
  return geo;
}
function removeDrop(i){
  const d = drops[i];
  scene.remove(d.mesh);
  drops.splice(i,1);
}

const _dropBlockMats = new Map();
function blockDropMats(id){   // BoxGeometry : +x, -x, +y, -y, +z, -z → côtés / dessus / dessous (+ face avant éventuelle)
  let a = _dropBlockMats.get(id);
  if(!a){
    const bd = BLOCKS[id], side = dropMaterial(bd.tSide,false);
    a = [side, side, dropMaterial(bd.tTop,false), dropMaterial(bd.tBot,false), bd.tFront ? dropMaterial(bd.tFront,false) : side, side];
    _dropBlockMats.set(id, a);
  }
  return a;
}
function spawnDrop(wx,wy,wz,id,n=1,o){
  if(id===null||id===undefined) return;
  o = o || {};
  if(drops.length >= MAX_DROPS) removeDrop(0);
  if(!_dropBox){
    _dropBox = new THREE.BoxGeometry(DROP_SIZE,DROP_SIZE,DROP_SIZE);
    _dropPlane = new THREE.PlaneGeometry(DROP_SIZE*1.1, DROP_SIZE*1.1);
  }
  const isPlant = typeof id==='number' && BLOCKS[id] && BLOCKS[id].plant;
  const isFlat = isPlant || (typeof id==='string' && FLAT_DROP_IDS.has(id));
  let geo, mat;
  if(isFlat){ const fk = isPlant ? BLOCKS[id].tTop : id; geo = extrudedDropGeo(fk) || _dropPlane; mat = dropMaterial(fk, true); }
  else if(typeof id==='number' && BLOCKS[id]){ geo = _dropBox; mat = blockDropMats(id); }
  else { geo = _dropBox; mat = dropMaterial(typeof id==='string'?id:'dirt',false); }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(wx,wy,wz);
  scene.add(mesh);
  const dd = {
    wx, wy, wz,
    vy: o.vy!==undefined ? o.vy : 1.5+Math.random()*0.5,
    vx: o.vx!==undefined ? o.vx : (Math.random()-0.5)*0.6,
    vz: o.vz!==undefined ? o.vz : (Math.random()-0.5)*0.6,
    id, n, ph:Math.random()*6.28, age:o.age||0, onGround:false, mesh, isFlat,
    collecting:false, collectT:0,
    uid: o.uid || ((MP.pid||'L')+'.'+(++MP.dseq))   // identifiant commun à tous les joueurs
  };
  drops.push(dd);
  if(MP.open && !o.remote) mpOut({t:'dr', u:dd.uid, x:wx, y:wy, z:wz, i:id, n, vx:dd.vx, vy:dd.vy, vz:dd.vz, a:dd.age});
}

function updateDrops(dt){
  const GRAV=-12, HALF=DROP_SIZE/2;
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];
    if(d.collecting){
      d.collectT+=dt*6;
      const t=Math.min(d.collectT,1);
      d.mesh.position.set(d.wx+(P.x-d.wx)*t, d.wy+(P.y+1.0-d.wy)*t, d.wz+(P.z-d.wz)*t);
      d.mesh.scale.setScalar(Math.max(0.001,1-t));
      if(t>=1) removeDrop(i);
      continue;
    }
    d.age+=dt;
    if(d.age>DROP_LIFETIME){ removeDrop(i); continue; }
    if(d.onGround && d.vx===0 && d.vz===0 && d.age>0.5 && Math.abs(d.wx-P.x)+Math.abs(d.wz-P.z)>6){
      // objet au repos loin du joueur : on se contente de l'animer (pas de physique)
      d.mesh.position.set(d.wx, d.wy+Math.sin(d.age*2.2)*0.03, d.wz);
      d.mesh.rotation.y = d.age*1.8 + d.ph;
      continue;
    }
    const STEPS=4, sub=dt/STEPS;
    for(let s=0;s<STEPS;s++){
      const ox=d.wx, oz=d.wz;
      d.vy+=GRAV*sub;
      d.wy+=d.vy*sub; d.wx+=d.vx*sub; d.wz+=d.vz*sub;
      { const hb=getB(Math.floor(d.wx), Math.floor(d.wy), Math.floor(d.wz));   // un objet jeté s'arrête contre un mur
        if(hb && BLOCKS[hb] && !BLOCKS[hb].noCollide && !BLOCKS[hb].plant){ d.wx=ox; d.wz=oz; d.vx=0; d.vz=0; } }
      const bx=Math.floor(d.wx), bz=Math.floor(d.wz);
      const fb=Math.floor(d.wy-HALF);
      const b=getB(bx,fb,bz);
      if(d.vy<0 && b && BLOCKS[b]){
        d.wy=fb+1+HALF; d.vy=0; d.vx=0; d.vz=0; d.onGround=true;
      } else d.onGround=false;
    }
    if(d.wy < Y_MIN+HALF){ d.wy=Y_MIN+HALF; d.vy=0; d.onGround=true; }
    { const dmp=Math.pow(0.80, dt*60); d.vx*=dmp; d.vz*=dmp; }   // frottement indépendant du framerate
    if(Math.abs(d.vx)<0.01) d.vx=0;
    if(Math.abs(d.vz)<0.01) d.vz=0;
    const bobY = d.onGround ? Math.sin(d.age*2.2)*0.03 : 0;
    d.mesh.position.set(d.wx, d.wy+bobY, d.wz);
    d.mesh.rotation.y = d.age*1.8 + d.ph;   // toupie autour de l'axe vertical (items plats ET blocs)
    if(d.age>0.5){
      const dist=Math.hypot(d.wx-P.x, d.wy-(P.y+0.9), d.wz-P.z);
      // FIX : on ne ramasse que s'il reste de la place (avant, l'objet disparaissait si l'inventaire était plein)
      if(dist<1.8 && WORLD.mode!=='spectator' && !SV.dead && invRoom(d.id)){
        const rest = addInv(d.id, d.n); drawHotbar();
        if(rest>0){ d.n = rest; if(MP.open) mpOut({t:'du', u:d.uid, n:rest}); }   // inventaire presque plein : on garde le reste au sol
        else {
          d.collecting=true; d.collectT=0; if(MP.open) mpOut({t:'dk', u:d.uid});
          d.wx=d.mesh.position.x; d.wy=d.mesh.position.y; d.wz=d.mesh.position.z;
        }
      }
    }
  }
}
