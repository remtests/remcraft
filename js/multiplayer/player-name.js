'use strict';

// Gestion du pseudo (chargé avant world-state.js qui l'utilise à l'initialisation)
function mpCleanName(s){ return String(s||'').replace(/[^\w .\-]/g,'').trim().slice(0,16); }
function mpLoadName(){
  let n = ''; try{ n = localStorage.getItem('mc_username')||''; }catch(e){}
  n = mpCleanName(n);
  if(!n){ n = 'Player'+(100+Math.floor(Math.random()*900)); try{ localStorage.setItem('mc_username', n); }catch(e){} }
  return n;
}
