'use strict';

// ════════════════════════════════════════════════
// FOUR (FURNACE)
// ════════════════════════════════════════════════
// Un four = un bloc : l'état (contenu + progression) est rangé par position "x,y,z", comme les coffres.
// Tous les fours posés cuisent en parallèle ; casser un four fait tomber son contenu (voir doBreak).
const FURNACES = new Map();   // "x,y,z" → {input, fuel, output, fuelTime, fuelMax, smeltTime, active}
let FURNACE_CUR = null;       // clé du four dont l'interface est ouverte
function newFurnaceState(){
  return {
    input:  {id:null,n:0},
    fuel:   {id:null,n:0},
    output: {id:null,n:0},
    fuelTime:   0,   // ticks de fuel restants
    fuelMax:    0,   // ticks max du fuel actuel
    smeltTime:  0,   // progression de la fonte (0..200)
    active:     false,
  };
}
function furnaceAt(k){ let F = FURNACES.get(k); if(!F){ F = newFurnaceState(); FURNACES.set(k, F); } return F; }
function curFurnace(){ return FURNACE_CUR ? furnaceAt(FURNACE_CUR) : null; }
function openFurnace(x,y,z){ FURNACE_CUR = x+','+y+','+z; furnaceAt(FURNACE_CUR); toggleUI('furnace'); }
// multijoueur : après une action dans l'interface du four, on envoie son contenu (voir network.js)
function furnaceChanged(){ if(FURNACE_CUR && typeof mpFurnaceSend==='function') mpFurnaceSend(FURNACE_CUR); }

// Recettes de fonte : id_entrée → id_sortie
const SMELT_RECIPES = {
  'raw_iron':  'iron_ingot',
  'raw_gold':  'gold_ingot',
  'coal':      null,          // le charbon est un fuel, pas fondable
  12:          'iron_ingot',  // bloc de fer ore (au cas où)
  15:          'gold_ingot',
  3:           8,             // pierre → cobble (au cas où inversé)
  // aliments
  'bread':     null,
};

// Valeur en ticks de fuel (200 ticks = 1 smelt)
const FUEL_VALUES = {
  7:           300,   // planches
  5:           150,   // bois (log)
  'stick':     100,
  'coal':      1600,
  'wooden_pickaxe': 200,
  'wooden_axe':  200,
  'wooden_sword':200,
  'wooden_shovel':200,
  'wooden_hoe':  200,
};

// Blocs ajoutés : sable → verre, pavé d'ardoise → ardoise ; planches / bûches de toutes les essences et bloc de charbon en combustible
SMELT_RECIPES[4] = 14;                                        // sable → verre
SMELT_RECIPES[BID('red_sand')] = 14;                          // sable rouge → verre
SMELT_RECIPES[BID('cobbled_deepslate')] = BID('deepslate');   // pavé d'ardoise → ardoise
for(const w of ['spruce','birch','jungle','acacia','dark_oak']){ FUEL_VALUES[BID(w+'_planks')] = 300; FUEL_VALUES[BID(w+'_log')] = 150; }
FUEL_VALUES[BID('coal_block')] = 16000;                       // = 10 × le charbon

function getSmeltResult(id){
  if(id===null) return null;
  if(SMELT_RECIPES[id]!==undefined) return SMELT_RECIPES[id];
  // Vérifier par nom si c'est un item smelable générique
  return null;
}

function getFuelTicks(id){
  if(id===null) return 0;
  return FUEL_VALUES[id]||0;
}

// auth = vrai : ce pair simule vraiment (solo, ou hôte). Sinon (client) : seule la progression est animée,
// le contenu vient des messages de l'hôte (évite de fondre deux fois les mêmes objets).
function _tickFurnace(F, dt, auth){
  const ticks = dt*20; // 20 ticks/s
  if(!auth){
    if(F.fuelTime>0) F.fuelTime = Math.max(0, F.fuelTime-ticks);
    if(F.active) F.smeltTime = Math.min(200, F.smeltTime+ticks);
    return;
  }

  const result = getSmeltResult(F.input.id);
  const hasInput = F.input.id!==null && F.input.n>0 && result!==null;

  // Si plus de fuel, essayer d'en consommer un nouveau
  if(F.fuelTime<=0){
    if(hasInput && F.fuel.id!==null && F.fuel.n>0){
      const fticks = getFuelTicks(F.fuel.id);
      if(fticks>0){
        F.fuelMax  = fticks;
        F.fuelTime = fticks;
        F.fuel.n--;
        if(F.fuel.n<=0){F.fuel.id=null;F.fuel.n=0;}
        F.active=true;
      } else {
        F.active=false;
      }
    } else {
      F.active=false;
      F.smeltTime=0;
    }
  }

  // Décrémenter le fuel si actif
  if(F.fuelTime>0){
    F.fuelTime=Math.max(0, F.fuelTime-ticks);
    F.active=true;
  }

  // Fondre
  if(F.active && hasInput){
    F.smeltTime+=ticks;
    if(F.smeltTime>=200){
      F.smeltTime=0;
      if(result!==null){
        if(F.output.id===null){
          F.output.id=result; F.output.n=1;
        } else if(F.output.id===result && F.output.n<64){
          F.output.n++;
        } else {
          F.smeltTime=200; return; // sortie pleine
        }
        F.input.n--;
        if(F.input.n<=0){F.input.id=null;F.input.n=0;}
      }
    }
  } else if(!F.active){
    F.smeltTime=0;
  }
}

let _furnUiT = 0;
function updateFurnace(dt){
  const auth = !(typeof MP!=='undefined' && MP.open && MP.role==='client');
  for(const [k, F] of FURNACES){
    const was = F.active;
    _tickFurnace(F, dt, auth);
    // un four actif est une source de lumière précalculée : on reconstruit les chunks proches quand il s'allume/s'éteint
    if(F.active !== was){ const c = k.split(','); markDirty(+c[0], +c[1], +c[2], true); }
  }
  // Mise à jour UI si ouvert
  _furnUiT += dt;
  if(_furnUiT > 0.15 && FURNACE_CUR && document.getElementById('furnace-ui').classList.contains('open')){
    _furnUiT = 0; drawFurnaceUI();
  }
}
function takeFurnaceOutput(){
  const F = curFurnace(); if(!F || !F.output.id) return;
  addInv(F.output.id, F.output.n);
  F.output.id=null; F.output.n=0;
  drawFurnaceUI(); drawHotbar(); furnaceChanged();
}

function renderFurnaceSlot(el, slot){
  // Vide le contenu sans toucher à l'élément lui-même (preserve listeners)
  while(el.firstChild) el.removeChild(el.firstChild);
  if(slot.id!==null){
    el.appendChild(mkCanvas(slot.id, el===document.getElementById('furnace-output')?44:38));
    if(slot.n>1){const s=document.createElement('span');s.className='sc';s.textContent=slot.n;el.appendChild(s);}
  }
}

function drawFurnaceUI(rebuildInv){
  const F = curFurnace() || newFurnaceState();   // pas de four sélectionné : affichage vide
  renderFurnaceSlot(document.getElementById('furnace-input'),  F.input);
  renderFurnaceSlot(document.getElementById('furnace-fuel'),   F.fuel);
  renderFurnaceSlot(document.getElementById('furnace-output'), F.output);
  // Barres
  const fuelPct = F.fuelMax>0?(F.fuelTime/F.fuelMax*100):0;
  document.getElementById('furnace-fuel-bar').style.width=fuelPct+'%';
  document.getElementById('furnace-prog-bar').style.width=(F.smeltTime/200*100)+'%';
  document.getElementById('furnace-status').textContent = F.active?'🔥 Lit':'⬜ Idle';
  // Inventaire — ne reconstruire que si explicitement demandé ou si les conteneurs sont vides
  const mainEl = document.getElementById('furnace-inv-main');
  const hotbarEl = document.getElementById('furnace-inv-hotbar');
  if(rebuildInv || mainEl.children.length===0){
    buildInvRows(mainEl, hotbarEl);
  } else {
    // Mise à jour légère : redessiner le contenu de chaque slot sans détruire les éléments
    const allSlots = mainEl.querySelectorAll('.mc-slot');
    allSlots.forEach((el, i)=>{
      const item = P.inv[i];
      renderSlotEl(el, item);
    });
    const hotbarSlots = hotbarEl.querySelectorAll('.mc-slot');
    hotbarSlots.forEach((el, i)=>{
      if(i===P.hotbar) el.style.outline='2px solid #fff'; else el.style.outline='';
      renderSlotEl(el, P.inv[i+27]);
    });
  }
}

function furnaceSlotInteract(slot, e){
  e.preventDefault(); e.stopPropagation();
  if(dragItem){
    const rightClick = e.button===2;
    if(slot.id===null){
      if(rightClick){
        slot.id=dragItem.id; slot.n=1; dragItem.n--;
        if(dragItem.n<=0){dragItem=null;dragEl.style.display='none';}else renderDragIcon();
      } else {
        slot.id=dragItem.id; slot.n=dragItem.n;
        dragItem=null; dragEl.style.display='none'; dragCnt.textContent='';
      }
    } else if(slot.id===dragItem.id && slot.n<64){
      const add = rightClick ? 1 : Math.min(dragItem.n, 64-slot.n);
      slot.n+=add; dragItem.n-=add;
      if(dragItem.n<=0){dragItem=null;dragEl.style.display='none';dragCnt.textContent='';}else renderDragIcon();
    } else if(!rightClick){
      // Swap
      const tmp={id:slot.id,n:slot.n};
      slot.id=dragItem.id; slot.n=dragItem.n;
      dragItem=tmp; renderDragIcon(); dragEl.style.display='block';
    }
    drawFurnaceUI(false); drawHotbar(); furnaceChanged(); return;
  }
  // Pick up
  if(slot.id===null) return;
  if(e.button===2){
    const half=Math.ceil(slot.n/2);
    dragItem={id:slot.id,n:half}; slot.n-=half;
    if(slot.n<=0){slot.id=null;slot.n=0;}
  } else {
    dragItem={id:slot.id,n:slot.n}; slot.id=null; slot.n=0;
  }
  renderDragIcon(); dragEl.style.display='block';
  dragEl.style.left=mouseX+'px'; dragEl.style.top=mouseY+'px';
  drawFurnaceUI(false); drawHotbar(); furnaceChanged();
}

function setupFurnaceSlots(){
  document.getElementById('furnace-input') .addEventListener('mousedown',e=>{ const F = curFurnace(); if(F) furnaceSlotInteract(F.input, e); });
  document.getElementById('furnace-fuel')  .addEventListener('mousedown',e=>{ const F = curFurnace(); if(F) furnaceSlotInteract(F.fuel,  e); });
  document.getElementById('furnace-output').addEventListener('mousedown',e=>{
    e.preventDefault(); e.stopPropagation();
    const F = curFurnace(); if(!F || F.output.id===null) return;
    if(dragItem){
      // On ne peut que récupérer la sortie, pas y déposer
      if(dragItem.id===F.output.id && dragItem.n<64){
        const add=Math.min(F.output.n,64-dragItem.n);
        dragItem.n+=add; F.output.n-=add;
        if(F.output.n<=0){F.output.id=null;F.output.n=0;}
        renderDragIcon();
      }
    } else {
      dragItem={id:F.output.id,n:F.output.n};
      F.output.id=null;F.output.n=0;
      renderDragIcon(); dragEl.style.display='block';
      dragEl.style.left=mouseX+'px'; dragEl.style.top=mouseY+'px';
    }
    drawFurnaceUI(false); drawHotbar(); furnaceChanged();
  });
}
