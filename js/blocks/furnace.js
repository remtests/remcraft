'use strict';

// ════════════════════════════════════════════════
// FOUR (FURNACE)
// ════════════════════════════════════════════════
const FURNACE = {
  input:  {id:null,n:0},
  fuel:   {id:null,n:0},
  output: {id:null,n:0},
  fuelTime:   0,   // ticks de fuel restants
  fuelMax:    0,   // ticks max du fuel actuel
  smeltTime:  0,   // progression de la fonte (0..200)
  active:     false,
  pos:        null, // {x,y,z} du four actuellement ouvert
};

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

function _updateFurnaceCore(dt){
  const ticks = dt*20; // 20 ticks/s

  const result = getSmeltResult(FURNACE.input.id);
  const hasInput = FURNACE.input.id!==null && FURNACE.input.n>0 && result!==null;

  // Si plus de fuel, essayer d'en consommer un nouveau
  if(FURNACE.fuelTime<=0){
    if(hasInput && FURNACE.fuel.id!==null && FURNACE.fuel.n>0){
      const fticks = getFuelTicks(FURNACE.fuel.id);
      if(fticks>0){
        FURNACE.fuelMax  = fticks;
        FURNACE.fuelTime = fticks;
        FURNACE.fuel.n--;
        if(FURNACE.fuel.n<=0){FURNACE.fuel.id=null;FURNACE.fuel.n=0;}
        FURNACE.active=true;
      } else {
        FURNACE.active=false;
      }
    } else {
      FURNACE.active=false;
      FURNACE.smeltTime=0;
    }
  }

  // Décrémenter le fuel si actif
  if(FURNACE.fuelTime>0){
    FURNACE.fuelTime=Math.max(0, FURNACE.fuelTime-ticks);
    FURNACE.active=true;
  }

  // Fondre
  if(FURNACE.active && hasInput){
    FURNACE.smeltTime+=ticks;
    if(FURNACE.smeltTime>=200){
      FURNACE.smeltTime=0;
      if(result!==null){
        if(FURNACE.output.id===null){
          FURNACE.output.id=result; FURNACE.output.n=1;
        } else if(FURNACE.output.id===result && FURNACE.output.n<64){
          FURNACE.output.n++;
        } else {
          FURNACE.smeltTime=200; return; // sortie pleine
        }
        FURNACE.input.n--;
        if(FURNACE.input.n<=0){FURNACE.input.id=null;FURNACE.input.n=0;}
      }
    }
  } else if(!FURNACE.active){
    FURNACE.smeltTime=0;
  }

  // Mise à jour UI si ouvert
  _furnUiT += dt;
  if(_furnUiT > 0.15 && document.getElementById('furnace-ui').classList.contains('open')){
    _furnUiT = 0; drawFurnaceUI();
  }
}

let _furnUiT = 0;
function updateFurnace(dt){
  const was = FURNACE.active;
  _updateFurnaceCore(dt);
  // le four actif est une source de lumière précalculée : on reconstruit les chunks proches quand il s'allume/s'éteint
  if(FURNACE.active !== was && FURNACE.pos) markDirty(FURNACE.pos.x, FURNACE.pos.y, FURNACE.pos.z, true);
}
function takeFurnaceOutput(){
  if(!FURNACE.output.id) return;
  addInv(FURNACE.output.id, FURNACE.output.n);
  FURNACE.output.id=null; FURNACE.output.n=0;
  drawFurnaceUI(); drawHotbar();
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
  renderFurnaceSlot(document.getElementById('furnace-input'),  FURNACE.input);
  renderFurnaceSlot(document.getElementById('furnace-fuel'),   FURNACE.fuel);
  renderFurnaceSlot(document.getElementById('furnace-output'), FURNACE.output);
  // Barres
  const fuelPct = FURNACE.fuelMax>0?(FURNACE.fuelTime/FURNACE.fuelMax*100):0;
  document.getElementById('furnace-fuel-bar').style.width=fuelPct+'%';
  document.getElementById('furnace-prog-bar').style.width=(FURNACE.smeltTime/200*100)+'%';
  document.getElementById('furnace-status').textContent = FURNACE.active?'🔥 Lit':'⬜ Idle';
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
    drawFurnaceUI(false); drawHotbar(); return;
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
  drawFurnaceUI(false); drawHotbar();
}

function setupFurnaceSlots(){
  document.getElementById('furnace-input') .addEventListener('mousedown',e=>furnaceSlotInteract(FURNACE.input, e));
  document.getElementById('furnace-fuel')  .addEventListener('mousedown',e=>furnaceSlotInteract(FURNACE.fuel,  e));
  document.getElementById('furnace-output').addEventListener('mousedown',e=>{
    e.preventDefault(); e.stopPropagation();
    if(FURNACE.output.id===null) return;
    if(dragItem){
      // On ne peut que récupérer la sortie, pas y déposer
      if(dragItem.id===FURNACE.output.id && dragItem.n<64){
        const add=Math.min(FURNACE.output.n,64-dragItem.n);
        dragItem.n+=add; FURNACE.output.n-=add;
        if(FURNACE.output.n<=0){FURNACE.output.id=null;FURNACE.output.n=0;}
        renderDragIcon();
      }
    } else {
      dragItem={id:FURNACE.output.id,n:FURNACE.output.n};
      FURNACE.output.id=null;FURNACE.output.n=0;
      renderDragIcon(); dragEl.style.display='block';
      dragEl.style.left=mouseX+'px'; dragEl.style.top=mouseY+'px';
    }
    drawFurnaceUI(false); drawHotbar();
  });
}
