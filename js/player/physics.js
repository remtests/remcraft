'use strict';

// ════════════════════════════════════════════════
// PHYSICS
// ════════════════════════════════════════════════
// Valeurs Minecraft converties à 60 pas/s : marche 4,3 blocs/s, saut ~1,25 bloc en ~0,5 s
const GRAV=0.00889,JUMP=0.15,SPD=0.0717,EXT=0.30;

// Regard : appliqué à chaque frame (indépendant de la physique à pas fixe)
function updateLook(){
  mdx=0; mdy=0;
}

// Un pas de physique = 1/60 s (pas fixe → vitesse identique à 30, 60 ou 144 FPS)
function physStep(){
  P.px=P.x; P.py=P.y; P.pz=P.z;
  const spec = WORLD.mode==='spectator';   // spectateur : vol permanent, sans collisions
  if(spec) P.fly = true;
  const cy=Math.cos(P.yaw),sy=Math.sin(P.yaw);
  let mx=0,mz=0;
  if(K.KeyW||K.KeyZ){mx-=sy;mz-=cy;}
  if(K.KeyS){mx+=sy;mz+=cy;}
  if(K.KeyA){mx-=cy;mz+=sy;}
  if(K.KeyD){mx+=cy;mz-=sy;}
  const L=Math.hypot(mx,mz)||1;
  // Sprint : double appui sur Z/W (voir keydown) ou Ctrl gauche maintenu en avançant ; stoppé par le sneak, l'arrêt de la marche ou un mur
  const fwd = !!(K.KeyW||K.KeyZ);
  P.sneak = !!(K.ShiftLeft||K.ShiftRight) && !P.fly;
  if(P.sneak || !fwd) P.sprint = false;
  else if(K.ControlLeft) P.sprint = true;
  if(svOn() && SV.food<=6) P.sprint = false;   // survie : plus de sprint avec 6 de faim ou moins
  const spd = SPD * (P.sneak ? 0.3 : P.sprint ? 1.3 : 1);
  let tx=(mx||mz)?mx/L*spd:0, tz=(mx||mz)?mz/L*spd:0;
  if(P.fly){ tx*=2.4; tz*=2.4; }
  const swim = svWaterCheck();   // dans l'eau : déplacement ralenti, on nage avec Espace
  if(swim){ tx*=0.6; tz*=0.6; }
  // Easing : la vitesse horizontale rejoint sa cible de façon exponentielle (accélération et freinage progressifs)
  // constantes de temps (s) : au sol accélération 0,09 / freinage 0,06 ; en l'air 0,30 ; en vol 0,12
  const moving = (tx||tz) ? true : false;
  const tau = P.fly ? 0.12 : !P.onGround ? 0.30 : moving ? 0.09 : 0.06;
  const ke = 1 - Math.exp(-(1/60)/tau);
  P.sx = (P.sx||0) + (tx-(P.sx||0))*ke;
  P.sz = (P.sz||0) + (tz-(P.sz||0))*ke;
  if(!moving && Math.abs(P.sx)<1e-4 && Math.abs(P.sz)<1e-4){ P.sx=0; P.sz=0; }
  P.vx = P.sx; P.vz = P.sz;
  if(P.fly){   // vol créatif : Espace monte, Maj descend
    // Easing vertical : même lissage exponentiel que l'horizontal (montée/descente progressives, freinage à la relâche)
    const tvy = (K.Space?0.2:0) - ((K.ShiftLeft||K.ShiftRight)?0.2:0), kv = 1 - Math.exp(-(1/60)/0.12);
    P.vy += (tvy - P.vy)*kv;
    if(tvy===0 && Math.abs(P.vy)<1e-3) P.vy = 0;
    P.onGround=false;
  } else if(swim){
    P.vy = Math.max(-0.05, P.vy*0.85 - GRAV*0.25);
    if(K.Space) P.vy = SV.headWater ? 0.07 : 0.12;   // plus d'élan à la surface pour sortir de l'eau
  } else {
    if(K.Space&&P.onGround){P.vy=JUMP;P.onGround=false;svJump();}
    P.vy=Math.max(-1.2,P.vy-GRAV);
  }
  if(P.sneak && P.onGround){   // sneak : on ne peut pas tomber du bord (comme Minecraft : axe X, axe Z, puis diagonale)
    const sup = (x,z)=> solid(x-EXT,P.y-0.05,z-EXT) || solid(x+EXT,P.y-0.05,z-EXT) || solid(x-EXT,P.y-0.05,z+EXT) || solid(x+EXT,P.y-0.05,z+EXT);
    if(P.vx!==0 && !sup(P.x+P.vx, P.z)) P.vx = 0;
    if(P.vz!==0 && !sup(P.x, P.z+P.vz)) P.vz = 0;
    if(P.vx!==0 && P.vz!==0 && !sup(P.x+P.vx, P.z+P.vz)) P.vx = P.vz = 0;
  }
  const _ix=P.vx, _iz=P.vz, _intended=Math.hypot(_ix,_iz), flyDown = P.fly && P.vy<0;
  if(spec){ P.x+=P.vx; P.z+=P.vz; P.y+=P.vy; }   // noclip : on traverse les blocs
  else { sweepX(P.vx); sweepZ(P.vz); sweepY(P.vy); }
  P.sx = P.vx; P.sz = P.vz;   // un mur / le sneak coupent aussi la vitesse lissée
  if(P.sprint && _intended>0.004 && Math.hypot(P.x-P.px, P.z-P.pz) < _intended*0.3) P.sprint = false;   // contre un mur : le sprint s'arrête
  if(!spec && flyDown && P.onGround) P.fly=false;   // on se pose : le vol s'arrête
  svAfterMove(Math.hypot(P.x-P.px, P.z-P.pz));   // chute et épuisement
  // Plus de téléportation à la surface : avant, se tenir sur la bedrock (y ≈ −59) suffisait à déclencher le « sauvetage ».
  // Seul le vide, loin sous le monde, est mortel (survie) ; en créatif on peut voler pour remonter.
  if(!spec && P.y < Y_MIN-64 && svOn()) svDamage(4,'void',{force:true});
}

const solid=(x,y,z)=>{const b=getB(Math.floor(x),Math.floor(y),Math.floor(z));return !!(b&&BLOCKS[b]&&!BLOCKS[b].noCollide);};
const _OY=[0,0.9,1.7];

function sweepX(d){
  if(!d)return;
  const ex=P.x+d+(d>0?EXT:-EXT);
  for(let dy=0;dy<3;dy++){
    const y=P.y+_OY[dy];
    for(let dz=-1;dz<=1;dz+=2)
      if(solid(ex,y,P.z+dz*EXT)){P.vx=0;return;}
  }
  P.x+=d;
}
function sweepZ(d){
  if(!d)return;
  const ez=P.z+d+(d>0?EXT:-EXT);
  for(let dy=0;dy<3;dy++){
    const y=P.y+_OY[dy];
    for(let dx=-1;dx<=1;dx+=2)
      if(solid(P.x+dx*EXT,y,ez)){P.vz=0;return;}
  }
  P.z+=d;
}
// FIX : déplacement vertical découpé en pas ≤ 0.45 bloc → plus de traversée du sol en chute rapide
function sweepY(d){
  if(!d)return;
  const n=Math.ceil(Math.abs(d)/0.45), sd=d/n;
  for(let i=0;i<n;i++) if(!sweepY1(sd)) return;
}
function sweepY1(d){
  if(d<0){
    const fy=Math.floor(P.y+d); let hit=false;
    for(let dx=-1;dx<=1&&!hit;dx+=2) for(let dz=-1;dz<=1&&!hit;dz+=2)
      if(solid(P.x+dx*EXT,fy,P.z+dz*EXT)) hit=true;
    if(hit){P.y=fy+1;P.vy=0;P.onGround=true;return false;}
    P.y+=d;P.onGround=false;return true;
  }
  const hy=P.y+d+1.8; let hit=false;
  for(let dx=-1;dx<=1&&!hit;dx+=2) for(let dz=-1;dz<=1&&!hit;dz+=2)
    if(solid(P.x+dx*EXT,hy,P.z+dz*EXT)) hit=true;
  if(hit){P.vy=0;return false;}
  P.y+=d;return true;
}
