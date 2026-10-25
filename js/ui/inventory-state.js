'use strict';

// ════════════════════════════════════════════════
// INVENTORY DRAG-AND-DROP STATE
// ════════════════════════════════════════════════
let dragItem=null;
let dragFromType=null;
let dragFromIdx=null;
let splitMode=false;

const dragEl=document.getElementById('drag-item');
const dragCanvas=document.getElementById('drag-canvas');
const dragCnt=document.getElementById('drag-cnt');

addEventListener('mousemove',e=>{
  if(dragItem){ dragEl.style.left=e.clientX+'px'; dragEl.style.top=e.clientY+'px'; }
});

function stopDrag(){
  if(dragItem){ addInv(dragItem.id,dragItem.n); }
  dragItem=null; dragEl.style.display='none';
  drawHotbar(); redrawOpenUI();
}

addEventListener('mousedown',e=>{
  if(!uiOn) return;
  if(dragItem && e.button===2 && !e.target.closest('.mc-slot,.mc-out-slot')){ stopDrag(); return; }
});

document.getElementById('inv-ui').addEventListener('mousedown',e=>{
  if(e.target===document.getElementById('inv-ui') && dragItem) stopDrag();
});
document.getElementById('chest-ui').addEventListener('mousedown',e=>{
  if(e.target===document.getElementById('chest-ui') && dragItem) stopDrag();
});
document.getElementById('craft-ui').addEventListener('mousedown',e=>{
  if(e.target===document.getElementById('craft-ui') && dragItem) stopDrag();
});
document.getElementById('furnace-ui').addEventListener('mousedown',e=>{
  if(e.target===document.getElementById('furnace-ui') && dragItem) stopDrag();
});
