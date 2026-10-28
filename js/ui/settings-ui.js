'use strict';

// ════════════════════════════════════════════════
// APPLICATION DES RÉGLAGES + INTERFACE
// ════════════════════════════════════════════════
function applySettings(){
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  camera.fov = S.fov; camera.aspect = innerWidth/innerHeight;
  camera.far = CL_RANGE + 300;   // fixe : les nuages portent à 128 chunks (2048 blocs), indépendamment de la distance d'affichage
  camera.updateProjectionMatrix();

  // Brouillard calé sur la distance d'affichage : les chunks apparaissent dans la brume, jamais "en pop"
  const far = Math.max(24, S.renderDist*CSIZ - 6);
  scene.fog.near = 1e6;   // brouillard désactivé
  scene.fog.far  = 1e6+1;

  if(lastPCX!==null){ updateVisibleChunks(true); }
  refreshSettingsUI();
}

const SETTING_DEFS = [
  {k:'renderDist', label:'Render Distance', min:2,  max:16,  step:1,    fmt:v=>v+' chunks'},
  {k:'smooth',     label:'Smooth Lighting',      type:'cycle', opts:[[0,'OFF'],[1,'MINIMUM'],[2,'MAXIMUM']], rebuild:true},
  {k:'brightness', label:'Brightness',           min:0,   max:1,   step:0.05, fmt:v=>v<=0?'Moody':v>=1?'Bright':Math.round(v*100)+'%'},
  {k:'fov',        label:'FOV',                   min:30,  max:110, step:1,    fmt:v=>v===70?'Normal':v+'°'},
  {k:'maxFps',     label:'Max Framerate',        type:'cycle', opts:[[30,'30 FPS'],[60,'60 FPS'],[120,'120 FPS'],[0,'Unlimited']]},
  {k:'showDebug',  label:'Debug Info (F3)',  type:'toggle'},
];
const _setUI = {};
function buildSettingsUI(){
  const st = document.createElement('style');
  st.textContent =
    '#pause-settings{display:flex;flex-direction:column;gap:5px;width:440px;max-width:92vw;padding:8px 10px;background:rgba(0,0,0,.35);border:1px solid #444}'+
    '.set-row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;color:#ccc}'+
    '.set-row label{flex:1}.set-row input[type=range]{width:150px}.set-val{width:84px;text-align:right;color:#8f8;font-size:11px}'+
    '.set-row select{background:#555;color:#fff;border:1px solid #777;padding:2px}'+
    '.set-cy{min-width:96px}.set-tg{background:#555!important;border:1px solid #777!important;padding:2px 14px!important;font-size:12px!important}.set-tg.on{background:#4a7!important}';
  document.head.appendChild(st);
  const box = document.getElementById('pause-settings');
  if(!box) return;
  for(const def of SETTING_DEFS){
    const row = document.createElement('div'); row.className = 'set-row';
    const lab = document.createElement('label'); lab.textContent = def.label; row.appendChild(lab);
    let ctl;
    const commit = v=>{
      S[def.k] = v; saveSettings();
      applySettings();
      if(def.rebuild) rebuildAllChunks();
    };
    if(def.type==='toggle'){
      ctl = document.createElement('button'); ctl.className = 'set-tg';
      ctl.onclick = ()=>commit(!S[def.k]);
      row.appendChild(ctl); _setUI[def.k] = {ctl};
    } else if(def.type==='cycle'){
      ctl = document.createElement('button'); ctl.className = 'set-tg set-cy';
      ctl.onclick = ()=>{
        const i = def.opts.findIndex(o=>o[0]===S[def.k]);
        commit(def.opts[(i+1)%def.opts.length][0]);
      };
      row.appendChild(ctl); _setUI[def.k] = {ctl};
    } else {
      ctl = document.createElement('input'); ctl.type='range';
      ctl.min=def.min; ctl.max=def.max; ctl.step=def.step;
      const val = document.createElement('span'); val.className='set-val';
      ctl.oninput = ()=>{ val.textContent = def.fmt(+ctl.value); };
      ctl.onchange = ()=>commit(+ctl.value);
      row.appendChild(ctl); row.appendChild(val); _setUI[def.k] = {ctl, val};
    }
    box.appendChild(row);
  }
}
function refreshSettingsUI(){
  for(const def of SETTING_DEFS){
    const u = _setUI[def.k]; if(!u) continue;
    if(def.type==='toggle'){ u.ctl.textContent = S[def.k]?'ON':'OFF'; u.ctl.classList.toggle('on', !!S[def.k]); }
    else if(def.type==='cycle'){ const o = def.opts.find(o=>o[0]===S[def.k]); u.ctl.textContent = o ? o[1] : String(S[def.k]); }
    else { u.ctl.value = S[def.k]; u.val.textContent = def.fmt(S[def.k]); }
  }
}

// FPS counter
let _fpsFrames=0, _fpsLast=0, _fpsVal=0;
function trackFPS(ts){
  _fpsFrames++;
  if(ts - _fpsLast > 800){
    _fpsVal = Math.round(_fpsFrames * 1000 / (ts - _fpsLast));
    _fpsFrames = 0; _fpsLast = ts;
    const col = _fpsVal>=50?'#4f4':_fpsVal>=30?'#ff4':'#f44';
    const el = document.getElementById('pause-fps');
    if(el) el.innerHTML = `<span style="color:${col}">⏱ ${_fpsVal} FPS</span>`;
  }
}
