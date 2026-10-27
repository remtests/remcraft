'use strict';

// ════════════════════════════════════════════════
// INPUT
// ════════════════════════════════════════════════
const K={};
let mdx=0,mdy=0,mldown=false,mrdown=false;
// Souris brute : pas d'accélération/lissage du système (unadjustedMovement) et rotation appliquée immédiatement
function lockPtr(){
  if(SV.dead) return;   // écran de mort : le curseur reste libre
  const c=document.getElementById('c');
  try{
    const p=c.requestPointerLock({unadjustedMovement:true});
    if(p&&p.catch) p.catch(()=>{try{c.requestPointerLock();}catch(e){}});
  }catch(e){ c.requestPointerLock(); }
}
let gameOn=false,uiOn=false,paused=false;
let mouseX=0,mouseY=0;


addEventListener('keydown',e=>{
  if(chatOpen) return;   // la saisie du chat est gérée par son propre champ
  K[e.code]=true;
  if(e.code==='F3'){e.preventDefault();S.showDebug=!S.showDebug;saveSettings();refreshSettingsUI();return;}
  if(e.code==='F5'&&gameOn&&!e.ctrlKey&&!e.metaKey){e.preventDefault();if(!e.repeat&&!uiOn&&!paused)camMode=(camMode+1)%3;document.getElementById('cross').style.display=camMode===0?'block':'none';return;}
  if(!gameOn || SV.dead) return;
  if(!uiOn && !paused && !e.ctrlKey && !e.metaKey && !e.altKey && (e.code==='KeyT' || e.code==='Enter' || e.key==='/')){
    e.preventDefault(); openChat(e.key==='/' ? '/' : ''); return;
  }
  if(e.code==='Space' && !e.repeat && WORLD.mode==='creative' && !uiOn && !paused){   // double appui sur Espace = voler / se poser
    const tt = performance.now();
    if(tt-(window._lastSpace||0) < 300){ P.fly = !P.fly; P.vy = 0; }
    window._lastSpace = tt;
  }
  if((e.code==='KeyW'||e.code==='KeyZ') && !e.repeat && !uiOn && !paused){   // double appui sur la touche avant = sprint
    const tf = performance.now();
    if(tf-(window._lastFwd||0) < 300 && !(K.ShiftLeft||K.ShiftRight)) P.sprint = true;
    window._lastFwd = tf;
  }
  if(WORLD.mode==='spectator' && (e.code==='KeyQ'||e.code==='KeyE'||e.code==='KeyF')) return;   // pas d'inventaire ni de lancer en spectateur
  if(e.code==='KeyQ' && !e.repeat && gameOn && !uiOn && !paused){ e.preventDefault(); dropHeld(e.ctrlKey); return; }   // touche « A » en AZERTY : jeter (Ctrl = toute la pile)
  if(e.code==='KeyE'){toggleUI('inv');return;}
  if(e.code==='KeyF'){swapOffhand();return;}
  if(e.code==='Escape'){if(uiOn){closeUI();return;} paused?resume():doPause();}
  if(/^Digit[1-9]$/.test(e.code)){P.hotbar=+e.code[5]-1;drawHotbar();}
});
addEventListener('keyup',e=>K[e.code]=false);
addEventListener('mousemove',e=>{
  mouseX=e.clientX; mouseY=e.clientY;
  if(document.pointerLockElement&&!uiOn&&!paused){
    P.yaw-=e.movementX*0.0022;
    P.pitch=Math.max(-1.55,Math.min(1.55,P.pitch-e.movementY*0.0022));
  }
});
addEventListener('mousedown',e=>{
  if(!gameOn || SV.dead) return;
  if(!document.pointerLockElement&&!uiOn&&!paused){
    lockPtr(); return;
  }
  if(document.pointerLockElement&&!uiOn&&WORLD.mode!=='spectator'){
    if(e.button===0 && !punchFire()){
      mldown=true;
      P.breakCool=0; doBreak(castRay());   // un nouveau clic agit tout de suite : pas d'attente de la prochaine frame ni du délai « maintien » du créatif
    }
    if(e.button===2){
      mrdown = true;
      const tt = castRay(), bd = tt && BLOCKS[tt.bid], inter = bd && (bd.isCraft || bd.isFurnace || bd.isChest);   // un bloc interactif prime sur manger
      if(inter || !svTryEat()) doPlace();
      e.preventDefault();
    }
  }
});
addEventListener('mouseup',e=>{
  if(e.button===2) mrdown=false;
  if(e.button===0){mldown=false;P.breaking=null;P.bprog=0;_hideBreak();}
});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('wheel',e=>{
  if(uiOn) return;
  P.hotbar=((P.hotbar+(e.deltaY>0?1:-1))+9)%9; drawHotbar();
},{passive:true});
addEventListener('pointerlockchange',()=>{
  if(!document.pointerLockElement&&gameOn&&!uiOn&&!paused&&!SV.dead) doPause();
});

function doPause(){paused=true;document.exitPointerLock();document.getElementById('pause').style.display='flex';mpRefreshPause();}
function resume(){paused=false;document.getElementById('pause').style.display='none';lockPtr();}
