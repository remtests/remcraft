'use strict';

// ════════════════════════════════════════════════
// HUD DRAWING
// ════════════════════════════════════════════════
function drawHotbar(){
  const hb=document.getElementById('hotbar'); hb.innerHTML='';
  for(let i=0;i<9;i++){
    const it=P.inv[i+27];
    const el=document.createElement('div');
    el.className='slot'+(i===P.hotbar?' sel':'');
    const k=document.createElement('span');k.className='k';k.textContent=i+1;el.appendChild(k);
    if(it&&it.id!==null){
      el.appendChild(mkCanvas(it.id,38));
      if(it.n>1){const s=document.createElement('span');s.className='cnt';s.textContent=it.n;el.appendChild(s);}
    }
    el.onclick=()=>{P.hotbar=i;drawHotbar();};
    hb.appendChild(el);
  }
  drawOffhand();
}

function drawOffhand(){
  const el=document.getElementById('offhand-slot');
  if(!el) return;
  el.innerHTML='';
  const it=P.offhand;
  if(it&&it.id!==null){
    el.appendChild(mkCanvas(it.id,32));
    if(it.n>1){const s=document.createElement('span');s.className='cnt';s.textContent=it.n;el.appendChild(s);}
  } else {
    // Icône vide — main secondaire
    const ph=document.createElement('span');
    ph.textContent='🤚';ph.style.cssText='font-size:18px;opacity:0.3;';
    el.appendChild(ph);
  }
}

// Swap l'item actif de la hotbar avec la main secondaire
function swapOffhand(){
  const hotSlot=P.inv[P.hotbar+27];
  const tmp={id:P.offhand.id, n:P.offhand.n};
  P.offhand.id=hotSlot?hotSlot.id:null;
  P.offhand.n=hotSlot?hotSlot.n:0;
  if(hotSlot){hotSlot.id=tmp.id;hotSlot.n=tmp.n;}
  drawHotbar();
}

// Clic sur le slot offhand → swap avec l'item actif
function offhandClick(){
  swapOffhand();
}

function hotItem(){return P.inv[P.hotbar+27];}
