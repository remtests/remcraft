'use strict';

// ════════════════════════════════════════════════
// THREE.JS — scène, atlas, matériaux
// ════════════════════════════════════════════════
let renderer, scene, camera, hemisphereL;   // hemisphereL : seulement pour les entités (joueur, objets au sol)

// Uniformes partagés par tous les matériaux du monde (éclairage précalculé + torche en main)
const LIGHT_UNI = {
  uSkyCol: {value: new THREE.Color(1,1,1)},
  uBlkCol: {value: new THREE.Color(1,0.72,0.42)},
  uHeld:   {value: new THREE.Vector4(0,-9999,0,0)},
  uMin:    {value: 0.0},
  uFire:   {value: Array.from({length:14}, ()=>new THREE.Vector4(0,-9999,0,0))},   // lumières dynamiques (xyz, rayon) : [0..5] feux les plus proches, [6..13] torches tenues par les autres joueurs
};

// ── Atlas de textures : 1 texture pour tout le monde → 1 à 4 draw calls par chunk (au lieu de ~15) ──
const ATLAS_SZ = 256, ATLAS_CELL = 24, ATLAS_GUT = 4, ATLAS_PER_ROW = 10;
let ATLAS_TEX = null;
const TILE_IDX = {};
const TILE_TOP = new Uint8Array(256), TILE_BOT = new Uint8Array(256), TILE_SIDE = new Uint8Array(256);
let TILE_U0 = [], TILE_V0 = [];
const TILE_TINT = new Uint8Array(256);   // 1 = teinte herbe, 2 = teinte feuillage
const TILE_W = 16/ATLAS_SZ;

function makeWaterCanvas(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 16;
  const c = cv.getContext('2d');
  c.fillStyle = '#2f5fd0'; c.fillRect(0,0,16,16);
  const r = srng(99);
  for(let i=0;i<40;i++){ c.fillStyle = r()<0.5 ? '#3a6ee0' : '#2753b8'; c.fillRect((r()*16)|0,(r()*16)|0,2,1); }
  return cv;
}
function buildAtlas(){
  const names = new Set(['stone','torch_block']);
  for(const id in BLOCKS){ const b = BLOCKS[id]; names.add(b.tTop); names.add(b.tSide); names.add(b.tBot); if(b.tFront) names.add(b.tFront); }
  const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS_SZ;
  const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
  let i = 0;
  const G = ATLAS_GUT;
  for(const n of names){
    const src = GRAY[n] || IMGS[n] || (n==='water' ? makeWaterCanvas() : IMGS['stone']);
    const col = i%ATLAS_PER_ROW, row = (i/ATLAS_PER_ROW)|0;
    const ox = col*ATLAS_CELL+G, oy = row*ATLAS_CELL+G;
    if(src){
      cx.drawImage(src,0,0,16,16, ox,oy,16,16);
      // marge de 4 px (bords étirés) → pas de saignement entre tuiles avec les mipmaps
      cx.drawImage(src,0,0,16,1,  ox,oy-G,16,G);   cx.drawImage(src,0,15,16,1, ox,oy+16,16,G);
      cx.drawImage(src,0,0,1,16,  ox-G,oy,G,16);   cx.drawImage(src,15,0,1,16, ox+16,oy,G,16);
      cx.drawImage(src,0,0,1,1,   ox-G,oy-G,G,G);  cx.drawImage(src,15,0,1,1,  ox+16,oy-G,G,G);
      cx.drawImage(src,0,15,1,1,  ox-G,oy+16,G,G); cx.drawImage(src,15,15,1,1, ox+16,oy+16,G,G);
    }
    TILE_IDX[n] = i;
    TILE_U0[i] = ox/ATLAS_SZ;
    TILE_V0[i] = 1 - (oy+16)/ATLAS_SZ;   // v du bas de la tuile (flipY)
    i++;
  }
  for(const id in BLOCKS){
    const b = BLOCKS[id];
    TILE_TOP[id] = TILE_IDX[b.tTop]; TILE_BOT[id] = TILE_IDX[b.tBot]; TILE_SIDE[id] = TILE_IDX[b.tSide];
  }
  TILE_TINT.fill(0);
  if(TILE_IDX['grass_top']!==undefined)  TILE_TINT[TILE_IDX['grass_top']]  = 1;
  if(TILE_IDX['short_grass']!==undefined)TILE_TINT[TILE_IDX['short_grass']]= 1;
  if(TILE_IDX['leaves']!==undefined)     TILE_TINT[TILE_IDX['leaves']]     = 2;
  ATLAS_TEX = new THREE.CanvasTexture(cv);
  ATLAS_TEX.magFilter = THREE.NearestFilter;
  ATLAS_TEX.minFilter = THREE.NearestFilter;   // pixels nets à toute distance : pas de mipmaps, pas de filtrage linéaire
  ATLAS_TEX.generateMipmaps = false;
  ATLAS_TEX.anisotropy = 1;
}

// ── Matériaux : injection d'un éclairage précalculé (ciel + blocs + torche en main) ──
function patchShader(shader){
  shader.uniforms.uSkyCol = LIGHT_UNI.uSkyCol;
  shader.uniforms.uBlkCol = LIGHT_UNI.uBlkCol;
  shader.uniforms.uHeld   = LIGHT_UNI.uHeld;
  shader.uniforms.uMin    = LIGHT_UNI.uMin;
  shader.uniforms.uFire   = LIGHT_UNI.uFire;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aLight;\nvarying vec2 vLight;\nvarying vec3 vWPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLight = aLight;\nvWPos = position;');
  const baked =
    'float hd = distance(vWPos, uHeld.xyz);\n' +
    'float hf = uHeld.w > 0.0 ? clamp(1.0 - hd/uHeld.w, 0.0, 1.0) : 0.0;\n' +
    'hf = hf*hf;\n' +
    'for(int fi=0; fi<14; fi++){ float fr = uFire[fi].w; if(fr > 0.0){ float ff = clamp(1.0 - distance(vWPos, uFire[fi].xyz)/fr, 0.0, 1.0); hf = max(hf, ff*ff); } }\n' +
    'vec3 bakedL = max(max(uSkyCol*vLight.x, uBlkCol*max(vLight.y, hf)), vec3(uMin));\n';
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uSkyCol;\nuniform vec3 uBlkCol;\nuniform vec4 uHeld;\nuniform vec4 uFire[14];\nuniform float uMin;\nvarying vec2 vLight;\nvarying vec3 vWPos;')
    .replace('#include <aomap_fragment>', baked +
      'reflectedLight.indirectDiffuse = bakedL;\n' +
      '#include <aomap_fragment>');
}
let CMATS = null;   // [solide, cutout, verre, eau]
function makeChunkMats(){
  // Matériau "basic" : aucun calcul de lumière dynamique, tout est précalculé dans les sommets (comme Minecraft)
  const mk = (opts) => {
    const m = new THREE.MeshBasicMaterial(Object.assign({map:ATLAS_TEX, vertexColors:true}, opts));
    m.onBeforeCompile = sh => patchShader(sh);
    return m;
  };
  return [
    mk({}),
    mk({side:THREE.DoubleSide, alphaTest:0.5}),
    mk({transparent:true, opacity:0.8, alphaTest:0.1, depthWrite:false}),
    mk({transparent:true, opacity:0.72, side:THREE.DoubleSide, depthWrite:false}),
  ];
}

function initThree(){
  renderer = new THREE.WebGLRenderer({canvas:document.getElementById('c'), antialias:false, powerPreference:'high-performance'});
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x87ceeb);
  renderer.autoClear = false;   // 2 passes : ciel (soleil/lune) puis monde

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 1e6, 1e6+1);   // brouillard désactivé (plus de teinte sur les blocs lointains)

  camera = new THREE.PerspectiveCamera(S.fov, innerWidth/innerHeight, 0.1, 400);
  camera.rotation.order = 'YXZ';

  hemisphereL = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 1.0);   // éclaire seulement joueur + objets au sol
  scene.add(hemisphereL);

  buildSkyBodies();
  buildAtlas();
  CMATS = makeChunkMats();
  buildSettingsUI();
  applySettings();

  addEventListener('resize', ()=>{
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  });
}
