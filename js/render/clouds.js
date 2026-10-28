'use strict';

// ════════════════════════════════════════════════
// NUAGES — pattern clouds.png (1 pixel = 1 cellule de 12×12 blocs, épaisseur 4), dérive lente vers +X
// Portée : 128 chunks (valeur par défaut de Minecraft) = 2048 blocs, avec un fondu sur les derniers 30 %.
// Le motif (256×256 cellules = 3072 blocs, se répète) est construit UNE SEULE FOIS en une tuile ; on affiche les
// tuiles (jusqu'à 3×3, même géométrie) qui recouvrent la portée autour du joueur : plus de reconstruction en marchant.
// ════════════════════════════════════════════════
const CLOUD_PNG = "assets/textures/environment/clouds.png";
const CL_CELL = 12, CL_H = 4, CL_Y = 100, CL_SPEED = 1.5;
const CL_CHUNKS = 128, CL_RANGE = CL_CHUNKS*16;   // portée d'affichage des nuages (blocs)
let CL_MAP = null, CL_W = 256, _clTile = null, _clMat = null, _clMeshes = [], _clD = 0;
const _clCam = {value:new THREE.Vector2()};   // position XZ de la caméra pour le fondu (cameraPosition vaut toujours 0 avec MeshBasicMaterial en r128)
(function(){
  const im = new Image();
  im.onload = () => {
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const c2 = cv.getContext('2d'); c2.drawImage(im,0,0);
    const d = c2.getImageData(0,0,cv.width,cv.height).data, m = new Uint8Array(cv.width*cv.height);
    for(let i=0;i<m.length;i++) m[i] = d[i*4+3] > 127 ? 1 : 0;
    CL_W = cv.width; CL_MAP = m;
  };
  im.src = CLOUD_PNG;
})();
const _clAt = (i,j) => CL_MAP[(((j%CL_W)+CL_W)%CL_W)*CL_W + (((i%CL_W)+CL_W)%CL_W)];

function _buildCloudTile(){
  // 1re passe : nombre de quads (dessus + dessous + côtés exposés) ; 2e passe : remplissage direct des tableaux typés
  let nq = 0;
  for(let i=0;i<CL_W;i++) for(let j=0;j<CL_W;j++){   // _clAt gère le bouclage : les tuiles voisines se raccordent sans couture
    if(!_clAt(i,j)) continue;
    nq += 2 + (_clAt(i+1,j)?0:1) + (_clAt(i-1,j)?0:1) + (_clAt(i,j+1)?0:1) + (_clAt(i,j-1)?0:1);
  }
  const pos = new Float32Array(nq*12), col = new Float32Array(nq*12), ind = new Uint32Array(nq*6);
  let qn = 0;
  const quad = (a,b,c,d,sh) => {
    let p = qn*12, v = qn*4, k = qn*6;
    pos[p++]=a[0];pos[p++]=a[1];pos[p++]=a[2]; pos[p++]=b[0];pos[p++]=b[1];pos[p++]=b[2];
    pos[p++]=c[0];pos[p++]=c[1];pos[p++]=c[2]; pos[p++]=d[0];pos[p++]=d[1];pos[p++]=d[2];
    col.fill(sh, qn*12, qn*12+12);
    ind[k++]=v; ind[k++]=v+1; ind[k++]=v+2; ind[k++]=v; ind[k++]=v+2; ind[k++]=v+3;
    qn++;
  };
  const y0 = 0, y1 = CL_H;
  for(let i=0;i<CL_W;i++) for(let j=0;j<CL_W;j++){
    if(!_clAt(i,j)) continue;
    const x0 = i*CL_CELL, x1 = x0+CL_CELL, z0 = j*CL_CELL, z1 = z0+CL_CELL;
    quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0], 1.0);          // dessus
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], 0.72);         // dessous
    if(!_clAt(i+1,j)) quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1], 0.9);
    if(!_clAt(i-1,j)) quad([x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0], 0.9);
    if(!_clAt(i,j+1)) quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], 0.8);
    if(!_clAt(i,j-1)) quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], 0.8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.setIndex(new THREE.BufferAttribute(ind,1));
  g.computeBoundingSphere();
  return g;
}

function updateClouds(dt){
  if(!CL_MAP || !scene) return;
  if(!_clTile){
    _clTile = _buildCloudTile();
    _clMat = new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.85, depthWrite:false, fog:false, toneMapped:false});
    _clMat.onBeforeCompile = sh => {   // fondu avec la distance horizontale à la caméra : opaque jusqu'à 70 % de la portée, invisible à 100 %
      sh.uniforms.uClCam = _clCam;
      sh.vertexShader = sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCW;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCW = (modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCW;\nuniform vec2 uClCam;')
        .replace('#include <dithering_fragment>','#include <dithering_fragment>\ngl_FragColor.a *= 1.0 - smoothstep('+(CL_RANGE*0.7).toFixed(1)+', '+CL_RANGE.toFixed(1)+', length(vCW.xz - uClCam));');
    };
  }
  _clCam.value.set(P.x, P.z);
  _clD += dt*CL_SPEED;
  // tuiles qui recouvrent [P−portée, P+portée] (le motif dérive vers +X de _clD ; période = CL_W×CL_CELL)
  const T = CL_W*CL_CELL;
  const n0 = Math.floor((P.x-CL_RANGE-_clD)/T), n1 = Math.floor((P.x+CL_RANGE-_clD)/T);
  const m0 = Math.floor((P.z-CL_RANGE)/T),      m1 = Math.floor((P.z+CL_RANGE)/T);
  let u = 0;
  for(let n=n0;n<=n1;n++) for(let m=m0;m<=m1;m++){
    let mesh = _clMeshes[u];
    if(!mesh){ mesh = new THREE.Mesh(_clTile, _clMat); mesh.renderOrder = 5; scene.add(mesh); _clMeshes[u] = mesh; }
    mesh.visible = true; mesh.position.set(n*T + _clD, CL_Y, m*T); u++;
  }
  for(;u<_clMeshes.length;u++) _clMeshes[u].visible = false;
  // couleur selon l'heure : blanc le jour, teinté au lever/coucher, gris-bleu sombre la nuit
  const sk = sampleSky(dayT), br = Math.max(0, Math.min(1, 0.2 + 0.8*sk.sun/1.2)), tf = Math.max(0, Math.min(1, 1 - sk.sun/1.2))*0.45;
  const r = Math.max(0.10, (1-tf + tf*sk.hor[0]/255)*br), g = Math.max(0.11, (1-tf + tf*sk.hor[1]/255)*br), b = Math.max(0.17, (1-tf + tf*sk.hor[2]/255)*br);
  _clMat.color.setRGB(r,g,b);
}

function updateSkyBodies(){
  if(!skyScene) return;
  setMoonPhase(dayCount%8);
  if(sunObj){
    sunObj.m.position.copy(camera.position).addScaledVector(_sd,SKY_D);
    sunObj.m.quaternion.copy(camera.quaternion);
    sunObj.m.visible=_sd.y>-0.25;
  }
  if(moonObj){
    moonObj.m.position.copy(camera.position).addScaledVector(_sd,-SKY_D);
    moonObj.m.quaternion.copy(camera.quaternion);
    moonObj.m.visible=_sd.y<0.25;
  }
}
