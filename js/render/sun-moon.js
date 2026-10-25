'use strict';

// ════════════════════════════════════════════════
// SOLEIL & LUNE (billboards dans une passe de rendu séparée, à l'infini)
// ════════════════════════════════════════════════
let skyScene=null, sunObj=null, moonObj=null, dayCount=0, _moonPhase=-1;
const SKY_D=60;
function buildSkyBodies(){
  skyScene=new THREE.Scene();
  const mk=(cv,size)=>{
    if(!cv) return null;
    const tex=new THREE.CanvasTexture(cv);
    tex.magFilter=THREE.NearestFilter; tex.minFilter=THREE.NearestFilter; tex.generateMipmaps=false;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({
      map:tex, transparent:true, blending:THREE.AdditiveBlending,   // fond noir des textures = transparent
      depthWrite:false, depthTest:false, fog:false, toneMapped:false}));
    m.scale.set(size,size,1); m.frustumCulled=false; m.renderOrder=1;
    skyScene.add(m);
    return {m,tex};
  };
  sunObj=mk(SKYIMG.sun, SKY_D*0.40);
  moonObj=mk(SKYIMG.moon, SKY_D*0.30);
  if(moonObj) moonObj.tex.repeat.set(0.25,0.5);   // moon_phases.png = 4×2 sprites
}
function setMoonPhase(p){
  if(!moonObj||p===_moonPhase) return;
  _moonPhase=p;
  // ligne du haut (v 0.5→1) = phases 0-3, ligne du bas = phases 4-7
  moonObj.tex.offset.set((p%4)*0.25, p<4?0.5:0);
}
