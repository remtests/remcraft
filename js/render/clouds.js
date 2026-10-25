'use strict';

// ════════════════════════════════════════════════
// NUAGES — pattern clouds.png (1 pixel = 1 cellule de 12×12 blocs, épaisseur 4), dérive lente vers +X
// Fenêtre de cellules autour du joueur reconstruite uniquement quand on change de cellule ; fondu avec la distance.
// ════════════════════════════════════════════════
const CLOUD_PNG = "assets/textures/environment/clouds.png";
const CL_CELL = 12, CL_H = 4, CL_Y = 100, CL_R = 17, CL_SPEED = 1.5;
let CL_MAP = null, CL_W = 256, _clMesh = null, _clMat = null, _clIb = 1e9, _clJb = 1e9, _clD = 0;
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

function _buildCloudGeo(ib,jb){
  const pos = [], col = [], ind = [];
  const quad = (a,b,c,d,sh) => {
    const n = pos.length/3;
    pos.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], d[0],d[1],d[2]);
    for(let k=0;k<4;k++) col.push(sh,sh,sh);
    ind.push(n,n+1,n+2, n,n+2,n+3);
  };
  const y0 = 0, y1 = CL_H;
  for(let i=ib-CL_R;i<=ib+CL_R;i++) for(let j=jb-CL_R;j<=jb+CL_R;j++){
    if(!_clAt(i,j)) continue;
    const x0 = (i-ib)*CL_CELL, x1 = x0+CL_CELL, z0 = (j-jb)*CL_CELL, z1 = z0+CL_CELL;
    quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0], 1.0);          // dessus
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], 0.72);         // dessous
    if(!_clAt(i+1,j)) quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1], 0.9);
    if(!_clAt(i-1,j)) quad([x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0], 0.9);
    if(!_clAt(i,j+1)) quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], 0.8);
    if(!_clAt(i,j-1)) quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], 0.8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
  g.setIndex(ind);
  return g;
}

function updateClouds(dt){
  if(!CL_MAP || !scene) return;
  if(!_clMesh){
    _clMat = new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.85, depthWrite:false, fog:false, toneMapped:false});
    _clMat.onBeforeCompile = sh => {   // fondu avec la distance horizontale à la caméra
      sh.uniforms.uClCam = _clCam;
      sh.vertexShader = sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCW;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCW = (modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCW;\nuniform vec2 uClCam;')
        .replace('#include <dithering_fragment>','#include <dithering_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(90.0, 185.0, length(vCW.xz - uClCam));');
    };
    _clMesh = new THREE.Mesh(new THREE.BufferGeometry(), _clMat);
    _clMesh.frustumCulled = false; _clMesh.renderOrder = 5;
    scene.add(_clMesh);
  }
  _clCam.value.set(P.x, P.z);
  _clD += dt*CL_SPEED;
  const ib = Math.floor((P.x-_clD)/CL_CELL), jb = Math.floor(P.z/CL_CELL);
  if(ib!==_clIb || jb!==_clJb){
    _clIb = ib; _clJb = jb;
    const old = _clMesh.geometry; _clMesh.geometry = _buildCloudGeo(ib,jb); old.dispose();
  }
  _clMesh.position.set(ib*CL_CELL + _clD, CL_Y, jb*CL_CELL);
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
