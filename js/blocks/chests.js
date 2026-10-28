'use strict';

// ════════════════════════════════════════════════
// COFFRES : 27 emplacements par coffre, orientation mémorisée à la pose
// ════════════════════════════════════════════════
const CHESTS = new Map();      // "x,y,z" → 27 emplacements {id,n}
const CHEST_DIR = new Map();   // "x,y,z" → index dans FACE_DIRS (côté de la face avant)
let CHEST_CUR = null;          // clé du coffre ouvert
function chestSlots(k){
  let a = CHESTS.get(k);
  if(!a){ a = Array.from({length:27}, ()=>({id:null,n:0})); CHESTS.set(k,a); }
  return a;
}
function openChest(x,y,z){ CHEST_CUR = x+','+y+','+z; toggleUI('chest'); }

function drawChestUI(){
  const top = document.getElementById('chest-main');
  top.innerHTML = '';
  for(let row=0;row<3;row++){
    const rowDiv = document.createElement('div'); rowDiv.className = 'mc-inv-row';
    for(let col=0;col<9;col++) rowDiv.appendChild(makeSlotEl('chest', row*9+col));
    top.appendChild(rowDiv);
  }
  buildInvRows(document.getElementById('chest-inv-main'), document.getElementById('chest-inv-hotbar'));
}

// Maj + clic : transfert rapide coffre ⇄ inventaire
function chestQuickMove(type, idx){
  if(!CHEST_CUR) return;
  const src = liveItem(type, idx); if(!src || src.id===null) return;
  if(type==='chest'){
    const rest = addInv(src.id, src.n);
    if(rest>0){ src.n = rest; } else { src.id=null; src.n=0; }
  } else {
    const dst = chestSlots(CHEST_CUR);
    let n = src.n;
    for(const s of dst) if(s.id===src.id && s.n<64){ const a=Math.min(n,64-s.n); s.n+=a; n-=a; if(!n) break; }
    if(n) for(const s of dst) if(s.id===null){ s.id=src.id; const a=Math.min(n,64); s.n=a; n-=a; if(!n) break; }
    if(n){ src.n = n; } else { src.id=null; src.n=0; }
  }
  drawHotbar(); redrawOpenUI();
}

const LEAF_APPLE_CHANCE = 0.07;   // 7 % de chances qu'un bloc de feuillage lâche une pomme
function leafAppleDrop(x, y, z){
  if(Math.random() < LEAF_APPLE_CHANCE) spawnDrop(x+0.5, y+0.5, z+0.5, 'apple');
}

function doBreak(t){
  if(!t){P.breaking=null;P.bprog=0;_hideBreak();return;}
  const creative = WORLD.mode==='creative';
  const bd=BLOCKS[t.bid]; if(!bd||(bd.hard===999 && !creative)) return;
  if(P.breakCool>0) return;   // créatif : un bloc toutes les ~0,22 s en maintenant le clic (le délai s'écoule dans la boucle principale ; un nouveau clic l'ignore)
  if(!P.breaking||P.breaking.bx!==t.bx||P.breaking.by!==t.by||P.breaking.bz!==t.bz)
    {P.breaking={...t};P.bprog=0;}
  const speed = getBreakSpeed(bd);
  P.bprog += (creative || bd.hard===0) ? 1 : speed * 1.5 / bd.hard * frameDt;
  _showBreak(t.bx, t.by, t.bz, Math.floor(P.bprog * 10));
  if(P.bprog>=1){
    spawnBreakParticles(t.bx,t.by,t.bz,t.bid);
    if(t.bid===27){   // le contenu du coffre tombe au sol
      const k = t.bx+','+t.by+','+t.bz, slots = CHESTS.get(k);
      if(slots) for(const sl of slots) if(sl.id!==null && sl.n>0) spawnDrop(t.bx+0.5, t.by+0.5, t.bz+0.5, sl.id, sl.n);
      CHESTS.delete(k); CHEST_DIR.delete(k);
    }
    let furnaceLit = false;
    if(t.bid===21){   // le contenu du four (entrée, combustible, résultat) tombe au sol ; son état disparaît avec le bloc
      const k = t.bx+','+t.by+','+t.bz, F = FURNACES.get(k);
      if(F){
        furnaceLit = F.active;
        for(const sl of [F.input, F.fuel, F.output]) if(sl.id!==null && sl.n>0) spawnDrop(t.bx+0.5, t.by+0.5, t.bz+0.5, sl.id, sl.n);
        FURNACES.delete(k);
      }
      if(FURNACE_CUR===k) FURNACE_CUR = null;
    }
    svExhaust(0.005);   // casser un bloc fatigue un peu
    setB(t.bx,t.by,t.bz,0); markDirty(t.bx,t.by,t.bz,t.bid===20 || furnaceLit);
    const above = getB(t.bx,t.by+1,t.bz);
    if(above && BLOCKS[above] && BLOCKS[above].plant){   // une plante sans support se détache
      spawnBreakParticles(t.bx,t.by+1,t.bz,above);
      setB(t.bx,t.by+1,t.bz,0); markDirty(t.bx,t.by+1,t.bz,false);
      const ad = BLOCKS[above].drop; if(ad!==null && ad!==undefined && !creative) spawnDrop(t.bx+0.5,t.by+1.5,t.bz+0.5,ad);
    }
    const dropId = (bd.drop!==undefined) ? bd.drop : t.bid;
    if(dropId !== null && !creative) spawnDrop(t.bx+0.5, t.by+0.5, t.bz+0.5, dropId);   // créatif : pas d'objet au sol
    if(t.bid===6 && !creative) leafAppleDrop(t.bx, t.by, t.bz);   // feuillage : petite chance de pomme
    if(creative) P.breakCool = 0.22;
    P.breaking=null; P.bprog=0;
    _hideBreak();
    drawHotbar();
  }
}

function doPlace(){
  const t=castRay(); if(!t) return;
  if(BLOCKS[t.bid]?.isCraft){toggleUI('craft');return;}
  if(BLOCKS[t.bid]?.isFurnace){openFurnace(t.bx,t.by,t.bz);return;}
  if(BLOCKS[t.bid]?.isChest){openChest(t.bx,t.by,t.bz);return;}
  const it=hotItem();
  if(!it||it.id===null) return;
  if(it.id==='flint_and_steel'){ useLighter(t); return; }   // briquet : allume le feu

  // Torche : item string 'torch' → place le bloc 20
  const isTorchItem = it.id === 'torch';
  const blockId = isTorchItem ? 20 : it.id;

  // Seuls les blocs numériques connus sont posables (+ torche)
  if(!isTorchItem && (typeof it.id !== 'number' || !BLOCKS[it.id])) return;

  const tp=!!BLOCKS[t.bid]?.plant;   // viser une plante la remplace
  const px=tp?t.bx:t.pbx, py=tp?t.by:t.pby, pz=tp?t.bz:t.pbz;
  if(py<Y_MIN||py>Y_MAX) return;
  if(getB(px,py,pz)!==0 && !tp) return;
  if(BLOCKS[blockId]?.plant){ const bb=getB(px,py-1,pz); if(bb!==1&&bb!==2) return; }
  // La torche ne peut être posée que sur un bloc solide en dessous
  if(isTorchItem && !getB(px,py-1,pz)) return;
  if(blockId===22 && !getB(px,py-1,pz)) return;   // un cactus a besoin d'un bloc dessous
  if(!isTorchItem && !BLOCKS[blockId]?.noCollide && px<P.x+EXT && px+1>P.x-EXT && py<P.y+1.8 && py+1>P.y && pz<P.z+EXT && pz+1>P.z-EXT) return;  // FIX : vrai test AABB
  if(blockId===27){   // la face avant du coffre regarde le joueur
    const k = px+','+py+','+pz, ddx = P.x-(px+0.5), ddz = P.z-(pz+0.5);
    CHEST_DIR.set(k, Math.abs(ddx)>Math.abs(ddz) ? (ddx>0?0:1) : (ddz>0?2:3));
    CHESTS.delete(k);
  }
  if(blockId===21) FURNACES.delete(px+','+py+','+pz);   // un four neuf est toujours vide
  let placeId = blockId;
  if(blockId===5){   // bûche : axe selon la face visée (haut/bas → vertical, est/ouest → axe X, nord/sud → axe Z)
    const fx = t.pbx-t.bx, fz = t.pbz-t.bz, fy = t.pby-t.by;
    if(!tp && fy===0){ if(fx!==0) placeId = 28; else if(fz!==0) placeId = 29; }
  }
  removeFireAt(px,py,pz);
  setB(px,py,pz,placeId); markDirty(px,py,pz,blockId===20);
  if(WORLD.mode!=='creative'){ it.n--; if(it.n<=0){it.id=null;it.n=0;} }   // créatif : blocs infinis
  drawHotbar();
}
