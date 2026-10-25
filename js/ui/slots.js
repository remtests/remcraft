'use strict';

// ════════════════════════════════════════════════
// SLOT ELEMENT FACTORY
// ════════════════════════════════════════════════
function liveItem(type, idx){
  if(type==='inv')       return P.inv[idx];
  if(type==='craft')     return CG[idx];
  if(type==='invcraft')  return ICG[idx];
  if(type==='chest')     return CHEST_CUR ? chestSlots(CHEST_CUR)[idx] : null;
  if(type==='armor')     return P.armor[idx];
  return null;
}

function renderDragIcon(){
  if(!dragItem) return;
  const dx=dragCanvas.getContext('2d'); dx.imageSmoothingEnabled=false;
  dx.clearRect(0,0,40,40);
  const key=typeof dragItem.id==='string'?dragItem.id:(BLOCKS[dragItem.id]?.icon||BLOCKS[dragItem.id]?.tTop||'dirt');
  const img=IMGS[key];
  if(img) dx.drawImage(img,0,0,40,40);
  else{dx.fillStyle='#888';dx.fillRect(0,0,40,40);}
  dragCnt.textContent=dragItem.n>1?dragItem.n:'';
}

function makeSlotEl(type, idx){
  const el=document.createElement('div'); el.className='mc-slot';
  const item=liveItem(type,idx);
  renderSlotEl(el, item);

  el.addEventListener('mousedown',e=>{
    e.preventDefault();
    e.stopPropagation();
    if(e.shiftKey && !dragItem && (type==='chest' || (type==='inv' && document.getElementById('chest-ui').classList.contains('open')))){
      chestQuickMove(type, idx); return;
    }
    if(dragItem){
      handleDrop(type,idx, e.button===2);
      if(type==='craft'||type==='invcraft') checkRecipe(type);
      redrawOpenUI();
      return;
    }
    const live=liveItem(type,idx);
    if(!live||live.id===null) return;
    if(e.button===2){
      const half=Math.ceil(live.n/2);
      dragItem={id:live.id, n:half};
      live.n-=half; if(live.n<=0){live.id=null;live.n=0;}
      splitMode=true;
    } else {
      dragItem={id:live.id, n:live.n};
      live.id=null; live.n=0;
      splitMode=false;
    }
    dragFromType=type; dragFromIdx=idx;
    renderDragIcon();
    dragEl.style.display='block';
    dragEl.style.left=mouseX+'px'; dragEl.style.top=mouseY+'px';
    renderSlotEl(el, live);
    drawHotbar();
    if(type==='craft'||type==='invcraft') checkRecipe(type);
  });

  el.addEventListener('mouseenter',e=>{
    if(dragItem&&e.buttons>0){
      handleDrop(type,idx, e.buttons===2);
      if(type==='craft'||type==='invcraft') checkRecipe(type);
      redrawOpenUI();
    }
    const live=liveItem(type,idx);
    if(live&&live.id!==null){
      const tt=document.getElementById('tooltip');
      tt.textContent=itemName(live.id);
      tt.style.left=(e.clientX+14)+'px'; tt.style.top=(e.clientY-24)+'px';
      tt.style.display='block';
    }
  });
  el.addEventListener('mouseleave',()=>document.getElementById('tooltip').style.display='none');
  return el;
}

function handleDrop(type, idx, rightClick){
  if(!dragItem) return;
  const target=liveItem(type,idx);
  if(!target) return;

  if(type==='armor'){   // un seul exemplaire, et seulement la bonne pièce dans le bon emplacement
    if(armorSlotOf(dragItem.id)!==idx) return;
    if(target.id===null){
      target.id=dragItem.id; target.n=1; dragItem.n--;
      if(dragItem.n<=0){ dragItem=null; dragEl.style.display='none'; dragCnt.textContent=''; } else renderDragIcon();
    } else if(dragItem.n===1){
      const tmp={id:target.id, n:1};
      target.id=dragItem.id; target.n=1;
      dragItem={...tmp}; renderDragIcon(); dragEl.style.display='block';
    }
    drawHotbar();
    return;
  }

  if(rightClick){
    if(target.id===null || target.id===dragItem.id){
      if(target.id===null){ target.id=dragItem.id; target.n=0; }
      if(target.n<64){
        target.n++;
        dragItem.n--;
        if(dragItem.n<=0){ dragItem=null; dragEl.style.display='none'; dragCnt.textContent=''; }
        else { renderDragIcon(); }
      }
    }
    drawHotbar();
    return;
  }

  if(target.id===dragItem.id && target.n<64){
    const add=Math.min(dragItem.n, 64-target.n);
    target.n+=add; dragItem.n-=add;
    if(dragItem.n<=0){ dragItem=null; dragEl.style.display='none'; dragCnt.textContent=''; }
    else { renderDragIcon(); }
  } else if(target.id===null){
    target.id=dragItem.id; target.n=dragItem.n;
    dragItem=null; dragEl.style.display='none'; dragCnt.textContent='';
  } else {
    const tmp={id:target.id, n:target.n};
    target.id=dragItem.id; target.n=dragItem.n;
    dragItem={...tmp};
    renderDragIcon();
    dragEl.style.display='block';
  }
  drawHotbar();
}

function renderSlotEl(el, item){
  el.innerHTML='';
  if(item&&item.id!==null){
    el.appendChild(mkCanvas(item.id,28));
    if(item.n>1){const s=document.createElement('span');s.className='sc';s.textContent=item.n;el.appendChild(s);}
  }
}
