'use strict';

// ════════════════════════════════════════════════
// PARTICULES DE CASSE (blocs et plantes) — petits carrés 4×4 px tirés de la texture du bloc,
// tous dans UN seul mesh dynamique (1 draw call), alimenté par l'atlas existant.
// ════════════════════════════════════════════════
const MAX_PART = 320, PART = [], _pCells = {};
let _pMesh = null, _pPos, _pUv, _pCol, _pGeo;

function _partCells(name){   // cellules 4×4 de la texture qui ne sont pas (presque) transparentes
  if(_pCells[name]) return _pCells[name];
  const cells = [];
  try{
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const cx = cv.getContext('2d'); cx.drawImage(GRAY[name] || IMGS[name], 0, 0, 16, 16);
    const d = cx.getImageData(0,0,16,16).data;
    for(let c=0;c<16;c++){
      const ox=(c&3)*4, oy=(c>>2)*4; let n=0;
      for(let y=0;y<4;y++) for(let x=0;x<4;x++) if(d[((oy+y)*16+ox+x)*4+3] > 128) n++;
      if(n >= 8) cells.push(c);
    }
  }catch(e){}
  if(!cells.length) for(let c=0;c<16;c++) cells.push(c);
  return _pCells[name] = cells;
}

function _initParticles(){
  _pGeo = new THREE.BufferGeometry();
  _pPos = new THREE.BufferAttribute(new Float32Array(MAX_PART*12), 3).setUsage(THREE.DynamicDrawUsage);
  _pUv  = new THREE.BufferAttribute(new Float32Array(MAX_PART*8),  2).setUsage(THREE.DynamicDrawUsage);
  _pCol = new THREE.BufferAttribute(new Float32Array(MAX_PART*12), 3).setUsage(THREE.DynamicDrawUsage);
  const idx = new Uint16Array(MAX_PART*6);
  for(let q=0;q<MAX_PART;q++){ const b=q*4, i=q*6; idx[i]=b; idx[i+1]=b+1; idx[i+2]=b+2; idx[i+3]=b; idx[i+4]=b+2; idx[i+5]=b+3; }
  _pGeo.setIndex(new THREE.BufferAttribute(idx,1));
  _pGeo.setAttribute('position', _pPos); _pGeo.setAttribute('uv', _pUv); _pGeo.setAttribute('color', _pCol);
  _pMesh = new THREE.Mesh(_pGeo, new THREE.MeshBasicMaterial({map:ATLAS_TEX, vertexColors:true, alphaTest:0.5, side:THREE.DoubleSide}));
  _pMesh.frustumCulled = false;
  scene.add(_pMesh);
}

function spawnBreakParticles(bx, by, bz, bid){
  const bd = BLOCKS[bid]; if(!bd) return;
  const faces = bd.tFront ? [bd.tSide, bd.tTop, bd.tFront] : [bd.tSide, bd.tTop, bd.tBot];
  const n = bd.plant ? 8 : 26;
  for(let i=0;i<n;i++){
    const nm = bd.plant ? bd.tTop : faces[(Math.random()*3)|0];
    const tile = TILE_IDX[nm]; if(tile === undefined) continue;
    const cells = _partCells(nm), cell = cells[(Math.random()*cells.length)|0];
    const rx = Math.random(), ry = Math.random()*(bd.plant ? 0.8 : 1), rz = Math.random();
    const tk = TILE_TINT[tile];
    const tint = tk===1 ? GRASS_TINT[0] : tk===2 ? FOLIAGE_TINT[0] : null;
    const sh = 0.75 + Math.random()*0.25;
    if(PART.length >= MAX_PART) PART.shift();
    PART.push({
      x:bx+rx, y:by+ry, z:bz+rz,
      vx:(rx-0.5)*3.2 + (Math.random()-0.5), vy:(ry-0.5)*2.5 + 1.2 + Math.random(), vz:(rz-0.5)*3.2 + (Math.random()-0.5),
      life:0.5 + Math.random()*0.9, h:0.045 + Math.random()*0.04,
      u:TILE_U0[tile] + (cell&3)*TILE_W/4, v:TILE_V0[tile] + (3-(cell>>2))*TILE_W/4,
      r:(tint?tint[0]/255:1)*sh, g:(tint?tint[1]/255:1)*sh, b:(tint?tint[2]/255:1)*sh
    });
  }
}

function updateParticles(dt){
  if(!_pMesh){ if(!ATLAS_TEX) return; _initParticles(); }
  for(let i=PART.length-1;i>=0;i--){
    const p = PART[i];
    if((p.life -= dt) <= 0){ PART.splice(i,1); continue; }
    p.vy -= 16*dt;
    const dr = Math.max(0, 1-1.2*dt); p.vx *= dr; p.vz *= dr;
    const nx = p.x+p.vx*dt, ny = p.y+p.vy*dt, nz = p.z+p.vz*dt;
    if(solid(nx,p.y,p.z)) p.vx = 0; else p.x = nx;
    if(solid(p.x,p.y,nz)) p.vz = 0; else p.z = nz;
    if(solid(p.x,ny,p.z)){ if(p.vy<0){ p.vx*=0.6; p.vz*=0.6; } p.vy = 0; } else p.y = ny;
  }
  const n = PART.length;
  if(!n){ _pMesh.visible = false; return; }
  _pMesh.visible = true;
  const e = camera.matrixWorld.elements, rx=e[0], ry=e[1], rz=e[2], ux=e[4], uy=e[5], uz=e[6];
  const lv = LIGHT_UNI.uSkyCol.value, lt = Math.min(1, Math.max((lv.r+lv.g+lv.b)/3, S.brightness*0.25, 0.12));
  const d = TILE_W/4, P3 = _pPos.array, U2 = _pUv.array, C3 = _pCol.array;
  for(let i=0;i<n;i++){
    const p = PART[i], h = p.h, a = i*12, t = i*8;
    const ax=(rx+ux)*h, ay=(ry+uy)*h, az=(rz+uz)*h, bx=(rx-ux)*h, by=(ry-uy)*h, bz=(rz-uz)*h;
    P3[a]  =p.x-ax; P3[a+1] =p.y-ay; P3[a+2] =p.z-az;
    P3[a+3]=p.x+bx; P3[a+4] =p.y+by; P3[a+5] =p.z+bz;
    P3[a+6]=p.x+ax; P3[a+7] =p.y+ay; P3[a+8] =p.z+az;
    P3[a+9]=p.x-bx; P3[a+10]=p.y-by; P3[a+11]=p.z-bz;
    U2[t]=p.u; U2[t+1]=p.v;  U2[t+2]=p.u+d; U2[t+3]=p.v;  U2[t+4]=p.u+d; U2[t+5]=p.v+d;  U2[t+6]=p.u; U2[t+7]=p.v+d;
    const cr=p.r*lt, cg=p.g*lt, cb=p.b*lt;
    for(let k=0;k<4;k++){ C3[a+k*3]=cr; C3[a+k*3+1]=cg; C3[a+k*3+2]=cb; }
  }
  _pPos.needsUpdate = _pUv.needsUpdate = _pCol.needsUpdate = true;
  _pGeo.setDrawRange(0, n*6);
}
