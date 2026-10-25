'use strict';

// ════════════════════════════════════════════════
// BOUCLE PRINCIPALE
// ════════════════════════════════════════════════
let lastT=0, acc=0, frameDt=0.016, _dbgT=0;
const STEP = 1/60;
let _lastFrameTs = 0;
function loop(ts){
  requestAnimationFrame(loop);
  if(S.maxFps && ts-_lastFrameTs < 1000/S.maxFps - 1.5) return;   // limiteur de framerate (option « Framerate max »)
  _lastFrameTs = ts;
  trackFPS(ts);
  const dt=Math.min((ts-lastT)/1000,.1); lastT=ts;
  if(!gameOn || (paused && !MP.open)) return;   // en multijoueur le monde continue de tourner pendant la pause
  frameDt = dt;

  let n = 0;
  if(!paused){
    updateLook();
    acc += dt;
    while(acc >= STEP && n < 5){ if(!SV.dead) physStep(); acc -= STEP; n++; }
    if(n === 5) acc = 0;
    svUpdate(dt);   // survie : faim, régénération, dégâts, noyade…
  }

  updDay(dt);
  updateClouds(dt);
  updateDrops(dt);
  updateFurnace(dt);
  updateHeldLight(dt);
  updateFire(dt);
  updateCactus();
  updateVisibleChunks();
  processChunkQueue();

  const t = paused ? null : castRay(); updHL(t);
  if(!paused){
    if(mldown&&!uiOn) doBreak(t);
    else if(!mldown){P.breaking=null;P.bprog=0;}
  }

  const a = acc/STEP;   // interpolation entre deux pas physiques → mouvement fluide à 144 Hz
  const _ex=P.px+(P.x-P.px)*a, _ey=P.py+(P.y-P.py)*a, _ez=P.pz+(P.z-P.pz)*a;
  P.eyeH += ((P.sneak ? 1.27 : 1.62) - P.eyeH) * Math.min(1, dt*14);   // les yeux descendent en sneak
  P.fovMul += ((P.sprint ? 1.12 : 1) - P.fovMul) * Math.min(1, dt*10);   // léger élargissement du champ de vision en sprint
  const tFov = S.fov * P.fovMul;
  if(Math.abs(camera.fov - tFov) > 0.01){ camera.fov = tFov; camera.updateProjectionMatrix(); }
  updateCamera(_ex,_ey+P.eyeH,_ez);
  updatePlayerModel(_ex,_ey,_ez,dt);
  updateParticles(dt);
  mpTick(dt);

  _dbgT += dt;
  const dbg = document.getElementById('dbg');
  if(!S.showDebug){ if(dbg.style.display!=='none') dbg.style.display='none'; }
  else {
    if(dbg.style.display==='none') dbg.style.display='block';
    if(_dbgT > 0.25){   // HUD rafraîchi 4×/s (avant : innerHTML + calcul de biome à chaque frame)
      _dbgT = 0;
      const biomeNames=BIOME_NAMES;
      colInfo(Math.floor(P.x),Math.floor(P.z));
      const inf = renderer.info.render;
      dbg.innerHTML=
        `${_fpsVal} FPS · draw calls: ${inf.calls} · triangles: ${(inf.triangles/1000).toFixed(0)}k · chunks: ${CHUNK_MESH.size}<br>`+
        `XYZ: ${P.x.toFixed(1)} / ${P.y.toFixed(1)} / ${P.z.toFixed(1)} | Yaw: ${(P.yaw*180/Math.PI%360).toFixed(0)}° Pitch: ${(P.pitch*180/Math.PI).toFixed(0)}°<br>`+
        `On ground: ${P.onGround} | Biome: ${biomeNames[_ct]} | Target: ${t&&BLOCKS[t.bid]?BLOCKS[t.bid].name:'—'}<br>`+
        `Seed: ${WORLD_SEED} | 🕯️ Torches: ${LIGHTSRC.size} | queue: ${dirty.size} | ${(dayT*24).toFixed(1)}h`;
    }
  }
  updateSkyBodies();
  renderer.clear();
  renderer.render(skyScene,camera);
  renderer.clearDepth();
  renderer.render(scene,camera);
}
