'use strict';

// ════════════════════════════════════════════════
// PLAYER
// ════════════════════════════════════════════════
const P = {
  x:8, y:30, z:8, px:8, py:30, pz:8,
  vx:0, vy:0, vz:0,
  yaw:0, pitch:0,
  onGround:false,
  inv:[], hotbar:0,
  breaking:null, bprog:0,
  offhand: {id:null, n:0},
  armor: [{id:null,n:0},{id:null,n:0},{id:null,n:0},{id:null,n:0}],
  sprint:false, sneak:false, eyeH:1.62, fovMul:1,   // sprint / sneak / hauteur des yeux / zoom de sprint   // casque, plastron, pantalon, bottes
};
for(let i=0;i<36;i++) P.inv.push({id:null,n:0});

function addInv(id,n=1){
  for(const s of P.inv) if(s.id===id&&s.n<64){const add=Math.min(n,64-s.n);s.n+=add;n-=add;if(!n)return 0;}
  for(const s of P.inv) if(!s.id){s.id=id;const add=Math.min(n,64);s.n=add;n-=add;if(!n)return 0;}
  return n;   // reste non placé
}
function invRoom(id){
  for(const s of P.inv) if(!s.id || (s.id===id&&s.n<64)) return true;
  return false;
}
