'use strict';

// ════════════════════════════════════════════════
// RAYCAST — parcours de voxels exact (DDA), ~10× moins de lectures qu'un pas de 0.04
// ════════════════════════════════════════════════
// Boîte réelle de la torche : 2×10×2 px (x/z de 7/16 à 9/16, y de 0 à 10/16), légèrement élargie comme le contour de sélection
function _rayHitsTorch(bx,by,bz,ox,oy,oz,dx,dy,dz,maxD){
  const lo=[bx+0.4325,by-0.0025,bz+0.4325], hi=[bx+0.5675,by+0.6275,bz+0.5675], o=[ox,oy,oz], d=[dx,dy,dz];
  let t0=0, t1=maxD;
  for(let i=0;i<3;i++){
    if(d[i]===0){ if(o[i]<lo[i]||o[i]>hi[i]) return false; continue; }
    let a=(lo[i]-o[i])/d[i], b=(hi[i]-o[i])/d[i];
    if(a>b){ const c=a; a=b; b=c; }
    if(a>t0) t0=a; if(b<t1) t1=b;
    if(t0>t1) return false;
  }
  return true;
}
function castRay(maxD=6){
  const cp=Math.cos(P.pitch),sp=Math.sin(P.pitch);
  const cyw=Math.cos(P.yaw),syw=Math.sin(P.yaw);
  const dx=-cp*syw,dy=sp,dz=-cp*cyw;
  const ox=P.x,oy=P.y+P.eyeH,oz=P.z;
  let bx=Math.floor(ox),by=Math.floor(oy),bz=Math.floor(oz);
  const stx=dx>0?1:-1, sty=dy>0?1:-1, stz=dz>0?1:-1;
  const tdx=dx!==0?Math.abs(1/dx):Infinity, tdy=dy!==0?Math.abs(1/dy):Infinity, tdz=dz!==0?Math.abs(1/dz):Infinity;
  let tmx=dx===0?Infinity:(dx>0?(bx+1-ox):(ox-bx))*tdx;
  let tmy=dy===0?Infinity:(dy>0?(by+1-oy):(oy-by))*tdy;
  let tmz=dz===0?Infinity:(dz>0?(bz+1-oz):(oz-bz))*tdz;
  let lx=bx,ly=by,lz=bz,t=0;
  for(let it=0;it<64;it++){   // borne de sécurité
    lx=bx;ly=by;lz=bz;
    if(tmx<tmy&&tmx<tmz){t=tmx;tmx+=tdx;bx+=stx;}
    else if(tmy<tmz){t=tmy;tmy+=tdy;by+=sty;}
    else {t=tmz;tmz+=tdz;bz+=stz;}
    if(t>maxD) return null;
    const b=getB(bx,by,bz);
    if(b===20 && !_rayHitsTorch(bx,by,bz,ox,oy,oz,dx,dy,dz,maxD)) continue;   // torche : seule la tige (2×10×2 px) est ciblable, le reste de la case laisse passer le rayon
    if(b&&BLOCKS[b]&&!BLOCKS[b].isFluid) return{bx,by,bz,bid:b,pbx:lx,pby:ly,pbz:lz};
  }
  return null;
}

let hlBox=null;

// ── Overlay destroy_stage ──────────────────────
let _breakMesh = null;
let _breakStage = -1;

function _initBreakMesh(){
  const geo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  _breakMesh = new THREE.Mesh(geo, mat);
  _breakMesh.renderOrder = 999;
  _breakMesh.visible = false;
  scene.add(_breakMesh);
}

// Taille de la boîte de sélection selon le bloc : [échelle x/z, échelle y, hauteur du centre]
function _boxFor(bid){ return bid===20 ? [0.13,0.63,0.315] : bid===27 ? [0.875,0.875,0.4375] : bid===22 ? [0.875,1,0.5] : [1,1,0.5]; }   // torche : 2×10×2 px
function _showBreak(bx, by, bz, stage){
  if(!_breakMesh) _initBreakMesh();
  const s = Math.max(0, Math.min(9, stage));
  if(s !== _breakStage){
    _breakStage = s;
    _breakMesh.material.map = getTex('destroy_' + s);
    _breakMesh.material.needsUpdate = true;
  }
  const bxs = _boxFor(getB(bx,by,bz));
  _breakMesh.scale.set(bxs[0],bxs[1],bxs[0]);
  _breakMesh.position.set(bx+0.5, by+bxs[2], bz+0.5);
  _breakMesh.visible = true;
}

function _hideBreak(){
  if(_breakMesh) _breakMesh.visible = false;
  _breakStage = -1;
}

function updHL(t){
  if(!hlBox){
    // Arêtes seulement — pas de faces, pas de triangles visibles
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002,1.002,1.002));
    hlBox = new THREE.LineSegments(edges,
      new THREE.LineBasicMaterial({color:0x000000, transparent:true, opacity:0.7, depthTest:true}));
    scene.add(hlBox);
  }
  hlBox.visible=!!t;
  if(t){ const bxs=_boxFor(t.bid); hlBox.scale.set(bxs[0],bxs[1],bxs[0]); hlBox.position.set(t.bx+.5,t.by+bxs[2],t.bz+.5); }
}

// ── Outil tenu en main ───────────────────────────
// Retourne le type et le tier de l'outil actif
function getToolInfo(){
  const it = hotItem();
  if(!it || it.id === null) return { type: null, tier: 0 };
  const id = it.id;
  // tier : 1=bois, 2=pierre, 3=fer, 4=or, 5=diamant
  const TIERS = {
    wooden_pickaxe:1, wooden_axe:1, wooden_shovel:1, wooden_sword:1, wooden_hoe:1,
    stone_pickaxe:2, stone_axe:2, stone_shovel:2, stone_sword:2, stone_hoe:2,
    iron_pickaxe:3, iron_axe:3, iron_shovel:3, iron_sword:3, iron_hoe:3,
    golden_pickaxe:4, golden_axe:4, golden_shovel:4, golden_sword:4, golden_hoe:4,
    diamond_pickaxe:5, diamond_axe:5, diamond_shovel:5, diamond_sword:5, diamond_hoe:5,
  };
  const TYPES = {
    wooden_pickaxe:'pick', stone_pickaxe:'pick', iron_pickaxe:'pick', golden_pickaxe:'pick', diamond_pickaxe:'pick',
    wooden_axe:'axe',   stone_axe:'axe',   iron_axe:'axe',   golden_axe:'axe',   diamond_axe:'axe',
    wooden_shovel:'shovel', stone_shovel:'shovel', iron_shovel:'shovel', golden_shovel:'shovel', diamond_shovel:'shovel',
    wooden_sword:'sword',   stone_sword:'sword',   iron_sword:'sword',   golden_sword:'sword',   diamond_sword:'sword',
    wooden_hoe:'hoe',   stone_hoe:'hoe',   iron_hoe:'hoe',   golden_hoe:'hoe',   diamond_hoe:'hoe',
  };
  return { type: TYPES[id] || null, tier: TIERS[id] || 0 };
}

// Multiplicateur de vitesse selon l'outil et le bloc
// Chaque outil est efficace sur certains types de blocs
function getBreakSpeed(bd){
  const { type, tier } = getToolInfo();

  // Multiplicateur par tier (indépendant du type de bloc)
  const TIER_MULT = [1.0, 1.5, 2.5, 4.0, 6.0, 9.0];
  const tierMult = TIER_MULT[tier] || 1.0;

  // Catégorie du bloc
  const tTop = bd.tTop || '';
  const mat = bd.mat;   // matériau déclaré dans blocks.js (blocs ajoutés) ; sinon liste de textures ci-dessous
  const isStone  = mat==='stone' || ['stone','cobble','iron_ore','coal_ore','gold_ore','diamond_ore',
                    'furnace_top','furnace_front','bedrock'].includes(tTop);
  const isWood   = mat==='wood' || ['log_side','log_top','planks','bookshelf','craft_top','craft_side','chest_top','chest_side'].includes(tTop);
  const isEarth  = mat==='earth' || ['dirt','grass_top','grass_side','sand','gravel'].includes(tTop);
  const isSoft   = mat==='soft' || ['leaves','wool','glass'].includes(tTop);

  // L'outil est-il le bon pour ce bloc ?
  if(type === 'pick'   && isStone) return tierMult;
  if(type === 'axe'    && isWood)  return tierMult;
  if(type === 'shovel' && isEarth) return tierMult;
  if(type === 'sword'  && isSoft)  return tierMult * 0.8;
  if(type === 'hoe'    && isSoft)  return tierMult;

  // Mauvais outil mais outil quand même : bonus partiel
  if(type !== null) return Math.max(1.0, tierMult * 0.4);

  // Mains nues : vitesse de base
  return 1.0;
}
// ── Casse de bloc ────────────────────────────────
