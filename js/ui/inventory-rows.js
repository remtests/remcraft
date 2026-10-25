'use strict';

// ════════════════════════════════════════════════
// DRAW INVENTORY ROWS
// ════════════════════════════════════════════════
function buildInvRows(mainEl, hotbarEl){
  mainEl.innerHTML='';
  for(let row=0;row<3;row++){
    const rowDiv=document.createElement('div'); rowDiv.className='mc-inv-row';
    for(let col=0;col<9;col++){
      const i=row*9+col;
      rowDiv.appendChild(makeSlotEl('inv',i));
    }
    mainEl.appendChild(rowDiv);
  }
  hotbarEl.innerHTML='';
  for(let i=0;i<9;i++){
    const el=makeSlotEl('inv',i+27);
    if(i===P.hotbar) el.style.outline='2px solid #fff';
    hotbarEl.appendChild(el);
  }
}

let _creativeList = null;
function creativeList(){
  if(_creativeList) return _creativeList;
  const l = [];
  for(const id in BLOCKS){ const i=+id; if(i===23) continue; l.push(i===20 ? 'torch' : i); }
  for(const k in ITEMS) if(IMGS[k] && !l.includes(k)) l.push(k);
  return _creativeList = l;
}
const stackFor = id => (typeof id==='string' && /(_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots)$|^(bow|shears|flint_and_steel|bucket|water_bucket|saddle)$/.test(id)) ? 1 : 64;
function drawCreativePalette(){
  const pal = document.getElementById('creative-pal'), creative = WORLD.mode==='creative';
  pal.style.display = creative ? 'block' : 'none';
  const g = document.getElementById('creative-grid');
  if(!creative || g.children.length) return;   // construite une seule fois
  for(const id of creativeList()){
    const el = document.createElement('div'); el.className = 'mc-slot';
    el.appendChild(mkCanvas(id,28));
    el.addEventListener('mousedown', e=>{
      e.preventDefault(); e.stopPropagation();
      if(dragItem){ dragItem=null; dragEl.style.display='none'; dragCnt.textContent=''; return; }   // supprime l'objet tenu
      dragItem = {id, n:stackFor(id)}; renderDragIcon();
      dragEl.style.display='block'; dragEl.style.left=mouseX+'px'; dragEl.style.top=mouseY+'px';
    });
    el.addEventListener('mouseenter', e=>{
      const tt = document.getElementById('tooltip');
      tt.textContent = itemName(id); tt.style.left=(e.clientX+14)+'px'; tt.style.top=(e.clientY-24)+'px'; tt.style.display='block';
    });
    el.addEventListener('mouseleave', ()=>document.getElementById('tooltip').style.display='none');
    g.appendChild(el);
  }
}

function drawInv(){
  drawCreativePalette();
  ['armor-head','armor-chest','armor-legs','armor-boots'].forEach((id,i)=>{   // slots d'armure réels (avant : simples décors)
    const old = document.getElementById(id); if(!old) return;
    const el = makeSlotEl('armor', i); el.id = id; el.title = old.title; el.dataset.ph = ['🪖','👕','👖','👟'][i];
    old.replaceWith(el);
  });
  buildInvRows(
    document.getElementById('inv-main-grid'),
    document.getElementById('inv-hotbar-grid')
  );
  for(let i=0;i<4;i++){
    const el=document.getElementById('icg'+i);
    if(!el) continue;
    el.innerHTML='';
    const item=ICG[i];
    if(item.id!==null){
      el.appendChild(mkCanvas(item.id,28));
      if(item.n>1){const s=document.createElement('span');s.className='sc';s.textContent=item.n;el.appendChild(s);}
    }
  }
  const out=document.getElementById('inv-craft-out'); out.innerHTML='';
  if(invCraftResult){
    out.appendChild(mkCanvas(invCraftResult.r,34));
    if(invCraftResult.n>1){const s=document.createElement('span');s.className='sc';s.textContent=invCraftResult.n;out.appendChild(s);}
  }
}

function drawCraftUI(){
  for(let i=0;i<9;i++){
    const el=document.getElementById('cg'+i);
    if(!el) continue;
    el.innerHTML='';
    const item=CG[i];
    if(item.id!==null){
      el.appendChild(mkCanvas(item.id,28));
      if(item.n>1){const s=document.createElement('span');s.className='sc';s.textContent=item.n;el.appendChild(s);}
    }
  }
  const out=document.getElementById('craft-out'); out.innerHTML='';
  if(craftResult){
    out.appendChild(mkCanvas(craftResult.r,42));
    if(craftResult.n>1){const s=document.createElement('span');s.className='sc';s.textContent=craftResult.n;out.appendChild(s);}
  }
  buildInvRows(
    document.getElementById('craft-inv-main'),
    document.getElementById('craft-inv-hotbar')
  );
}

function redrawOpenUI(){
  if(document.getElementById('inv-ui').classList.contains('open')) drawInv();
  if(document.getElementById('craft-ui').classList.contains('open')) drawCraftUI();
  if(document.getElementById('furnace-ui').classList.contains('open')) drawFurnaceUI(false);
  if(document.getElementById('chest-ui').classList.contains('open')) drawChestUI();
  drawHotbar();
}

function setupCraftSlots(){
  for(let i=0;i<9;i++){
    const el=document.getElementById('cg'+i);
    el.addEventListener('mousedown',e=>{
      e.preventDefault(); e.stopPropagation();
      if(dragItem){ handleDrop('craft',i, e.button===2); checkRecipe('craft'); redrawOpenUI(); return; }
      const live=CG[i];
      if(!live||live.id===null) return;
      if(e.button===2){
        const half=Math.ceil(live.n/2);
        dragItem={id:live.id,n:half}; live.n-=half; if(live.n<=0){live.id=null;live.n=0;}
        splitMode=true;
      } else {
        dragItem={id:live.id,n:live.n}; live.id=null; live.n=0; splitMode=false;
      }
      renderDragIcon(); dragEl.style.display='block';
      dragEl.style.left=mouseX+'px'; dragEl.style.top=mouseY+'px';
      checkRecipe('craft'); redrawOpenUI();
    });
    el.addEventListener('mouseenter',e=>{
      if(dragItem&&e.buttons>0){handleDrop('craft',i, e.buttons===2);checkRecipe('craft');redrawOpenUI();}
    });
  }
  for(let i=0;i<4;i++){
    const el=document.getElementById('icg'+i);
    if(!el) continue;
    el.addEventListener('mousedown',e=>{
      e.preventDefault(); e.stopPropagation();
      if(dragItem){ handleDrop('invcraft',i, e.button===2); checkRecipe('invcraft'); redrawOpenUI(); return; }
      const live=ICG[i];
      if(!live||live.id===null) return;
      if(e.button===2){
        const half=Math.ceil(live.n/2);
        dragItem={id:live.id,n:half}; live.n-=half; if(live.n<=0){live.id=null;live.n=0;}
        splitMode=true;
      } else {
        dragItem={id:live.id,n:live.n}; live.id=null; live.n=0; splitMode=false;
      }
      renderDragIcon(); dragEl.style.display='block';
      dragEl.style.left=mouseX+'px'; dragEl.style.top=mouseY+'px';
      checkRecipe('invcraft'); redrawOpenUI();
    });
    el.addEventListener('mouseenter',e=>{
      if(dragItem&&e.buttons>0){handleDrop('invcraft',i, e.buttons===2);checkRecipe('invcraft');redrawOpenUI();}
    });
  }
}
