'use strict';

// ════════════════════════════════════════════════
// PANORAMA DU MENU — fond du menu comme Minecraft : un cube de 6 images vu de l'intérieur, qui tourne lentement
// ════════════════════════════════════════════════
// Images : assets/textures/gui/title/background/panorama_0..5.png (0 devant, 1 droite, 2 derrière, 3 gauche, 4 haut, 5 bas).
// Réglages de Minecraft : champ de vision 85°, rotation 2°/s (un tour en 3 minutes), regard relevé de 25° (+ ou − 5° très lent), fondu d'entrée d'une seconde.
// Rendu : renderer et canvas à part (#menu-panorama, sous les menus), actif seulement tant qu'aucune partie n'est lancée (gameOn faux) :
// pendant le jeu le canvas est masqué et rien n'est dessiné. Si les images ou WebGL manquent, le menu reste noir comme avant.
// Les écrans de menu (#overlay, #world-select, #create-world, #mp-panel) ont un fond opaque par défaut ; la classe « pano-on » du <body> (posée quand le
// panorama s'affiche) les rend transparents / assombris (css/menu.css, css/world-creation.css).
const PANO_DIR = 'assets/textures/gui/title/background/';
const PANO_FOV = 85, PANO_SPEED = 2.0, PANO_PITCH = 25, PANO_PITCH_WOBBLE = 5, PANO_FADE_MS = 1000;
// (droite, haut, normale vers le centre) de chaque face, en coordonnées monde (+y haut, la face 0 devant = −z). Orientation déduite de la continuité des bords des 6 images.
const PANO_BASIS = [
  [[1,0,0], [0,1,0],  [0,0,1]],    // 0 devant
  [[0,0,1], [0,1,0],  [-1,0,0]],   // 1 droite
  [[-1,0,0],[0,1,0],  [0,0,-1]],   // 2 derrière
  [[0,0,-1],[0,1,0],  [1,0,0]],    // 3 gauche
  [[1,0,0], [0,0,1],  [0,-1,0]],   // 4 haut
  [[1,0,0], [0,0,-1], [0,1,0]],    // 5 bas
];
const PANO = {cv:null, back:null, load:null, renderer:null, scene:null, camera:null, loaded:0, ready:false, failed:false, on:false, spin:0, last:0, shownAt:0};

function panoInit(){
  const cv = PANO.cv = document.createElement('canvas');
  cv.id = 'menu-panorama';
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:399;display:none;opacity:0;';
  const back = PANO.back = document.createElement('div');   // fond noir sous le canvas : on ne voit jamais le canvas du jeu pendant le fondu
  back.style.cssText = 'position:fixed;inset:0;z-index:398;background:#000;display:none;';
  PANO.load = document.getElementById('loadscreen');
  document.body.appendChild(back); document.body.appendChild(cv);
  let r;
  try{ r = PANO.renderer = new THREE.WebGLRenderer({canvas:cv, antialias:true}); }catch(e){ PANO.failed = true; return; }
  r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  r.setSize(innerWidth, innerHeight, false);
  PANO.scene = new THREE.Scene();
  const cam = PANO.camera = new THREE.PerspectiveCamera(PANO_FOV, innerWidth/innerHeight, 0.05, 10);
  cam.rotation.order = 'YXZ';   // d'abord le lacet (autour de y), puis l'inclinaison
  const loader = new THREE.TextureLoader();
  for(let i = 0; i < 6; i++){
    const [R, U, N] = PANO_BASIS[i].map(a => new THREE.Vector3(a[0], a[1], a[2]));
    loader.load(PANO_DIR + 'panorama_' + i + '.png', tex => {
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.004, 2.004), new THREE.MeshBasicMaterial({map:tex}));   // 0,2 % de recouvrement : aucun trait entre les faces
      m.matrixAutoUpdate = false;
      m.matrix.makeBasis(R, U, N);               // le plan regarde vers le centre (sa face avant est vue de l'intérieur, sans effet miroir)
      m.matrix.setPosition(N.clone().multiplyScalar(-1));   // à 1 du centre, du côté opposé à sa normale
      PANO.scene.add(m);
      if(++PANO.loaded === 6) PANO.ready = true;
    }, undefined, () => { PANO.failed = true; console.warn('Panorama du menu : image manquante', 'panorama_' + i + '.png'); });
  }
  addEventListener('resize', () => {
    if(!PANO.renderer) return;
    PANO.renderer.setSize(innerWidth, innerHeight, false);
    PANO.camera.aspect = innerWidth/innerHeight; PANO.camera.updateProjectionMatrix();
  });
  requestAnimationFrame(panoTick);
}

function panoTick(ts){
  requestAnimationFrame(panoTick);
  if(PANO.failed) return;
  const show = PANO.ready && !(typeof gameOn !== 'undefined' && gameOn);   // seulement dans les menus
  if(show !== PANO.on){
    PANO.on = show; PANO.last = ts;
    PANO.back.style.display = PANO.cv.style.display = show ? 'block' : 'none';
    document.body.classList.toggle('pano-on', show);
    if(show){ PANO.shownAt = ts; PANO.cv.style.opacity = '0'; }
  }
  if(!show) return;
  const dt = Math.min((ts - PANO.last)/1000, 0.1); PANO.last = ts;
  if(PANO.load && (PANO.load.style.display === 'flex' || PANO.load.style.display === 'block')) return;   // chargement d'un monde : l'écran de chargement couvre tout, on laisse le processeur et le GPU à la génération
  PANO.spin += dt*PANO_SPEED;                                            // degrés
  const cam = PANO.camera, k = Math.PI/180;
  cam.rotation.y = -PANO.spin*k;                                         // vers la droite : le décor défile vers la gauche, comme dans Minecraft
  cam.rotation.x = (PANO_PITCH + Math.sin(PANO.spin*0.05)*PANO_PITCH_WOBBLE)*k;
  PANO.renderer.render(PANO.scene, cam);
  const f = Math.min(1, (ts - PANO.shownAt)/PANO_FADE_MS);
  PANO.cv.style.opacity = f.toFixed(3);
}

panoInit();
