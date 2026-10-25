'use strict';

// ════════════════════════════════════════════════
// UI TOGGLE
// ════════════════════════════════════════════════
function toggleUI(which){
  const el=document.getElementById(which+'-ui');
  if(!el){return;}
  if(el.classList.contains('open')){closeUI();return;}
  closeUI();
  uiOn=true; el.classList.add('open');
  document.exitPointerLock();
  if(which==='inv') drawInv();
  if(which==='craft') drawCraftUI();
  if(which==='furnace') drawFurnaceUI(true);
  if(which==='chest') drawChestUI();
}

function closeUI(){
  ['inv','craft','furnace','chest'].forEach(k=>{
    const el=document.getElementById(k+'-ui');
    if(el) el.classList.remove('open');
  });
  for(let i=0;i<9;i++) if(CG[i].id!==null){addInv(CG[i].id,CG[i].n);CG[i].id=null;CG[i].n=0;}
  for(let i=0;i<4;i++) if(ICG[i].id!==null){addInv(ICG[i].id,ICG[i].n);ICG[i].id=null;ICG[i].n=0;}
  if(dragItem) stopDrag();
  uiOn=false;
  craftResult=null;
  invCraftResult=null;
  if(gameOn&&!paused) lockPtr();
  drawHotbar();
}
