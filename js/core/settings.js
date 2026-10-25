'use strict';

// ════════════════════════════════════════════════
// RÉGLAGES (persistés dans localStorage)
// ════════════════════════════════════════════════
// Options vidéo façon Minecraft : distance d'affichage, éclairage doux, luminosité, FOV, framerate max.
// Pas d'ombres portées, pas de PBR, pas de post-traitement : toute la lumière est précalculée par sommet.
const DEFAULTS = {renderDist:8, smooth:2, brightness:0, fov:70, maxFps:0, showDebug:true};
const S = Object.assign({}, DEFAULTS);
const CHUNK_BUDGET = 6;     // ms de construction de chunks par frame
const FOG_START    = 0.6;   // le brouillard démarre à 60 % de la distance d'affichage (toujours actif, comme Minecraft)
try{
  const saved = JSON.parse(localStorage.getItem('mc_settings_v3')||'null');
  if(saved && typeof saved==='object') for(const k in DEFAULTS) if(typeof saved[k]===typeof DEFAULTS[k]) S[k]=saved[k];
}catch(e){}
function saveSettings(){ try{ localStorage.setItem('mc_settings_v3', JSON.stringify(S)); }catch(e){} }
