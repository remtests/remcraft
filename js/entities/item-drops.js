'use strict';

// ════════════════════════════════════════════════
// WORLD-SPACE ITEM DROPS (géométries et matériaux PARTAGÉS : plus de fuite mémoire)
// ════════════════════════════════════════════════
const drops=[];
const DROP_SIZE=0.25;
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

function dropMaterial(key, flat){
  const k = (flat?'f:':'b:')+key;
  let m = _dropMats.get(k);
  if(!m){
    m = new THREE.MeshLambertMaterial(flat
      ? {map:getTex(key), transparent:true, alphaTest:0.1, side:THREE.DoubleSide}
      : {map:getTex(key)});
    _dropMats.set(k,m);
  }
  return m;
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
  if(isFlat){ geo = _dropPlane; mat = dropMaterial(isPlant ? BLOCKS[id].tTop : id, true); }
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
