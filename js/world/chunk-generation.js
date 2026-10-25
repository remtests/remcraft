'use strict';

// ══════════════════════════════════════════════════════════
// GÉNÉRATION D'UN CHUNK
// ══════════════════════════════════════════════════════════
// Bruit des grottes échantillonné sur une grille 4×4×4 puis interpolé en trilinéaire,
// avec rejet rapide des cellules qui ne peuvent pas contenir de cavité.
const CN = 5, CNY = 46, CCY = 45;
const _c1 = new Float32Array(CN*CN*CNY), _c2 = new Float32Array(CN*CN*CNY), _cb = new Float32Array(CN*CN*CNY);
const _maybe = new Uint8Array(16*CCY);
const _hArr = new Int16Array(256), _tArr = new Uint8Array(256);
function tri(a,gx,gz,gy,fx,fz,fy){
  const i = (gx*CN+gz)*CNY+gy, sx = CN*CNY, sz = CNY;
  const x00=a[i]+(a[i+1]-a[i])*fy,           x01=a[i+sz]+(a[i+sz+1]-a[i+sz])*fy;
  const x10=a[i+sx]+(a[i+sx+1]-a[i+sx])*fy,  x11=a[i+sx+sz]+(a[i+sx+sz+1]-a[i+sx+sz])*fy;
  const x0=x00+(x01-x00)*fz, x1=x10+(x11-x10)*fz;
  return x0+(x1-x0)*fx;
}
function minAbs(lo,hi){ return (lo<=0&&hi>=0) ? 0 : Math.min(Math.abs(lo),Math.abs(hi)); }

function dirtDepthOf(type, h){ return (type===2 && h>38) || (type===9 && h>42) ? 1 : (type===10 ? 10 : 4); }

function generateChunk(cx,cz){
  const data = new Uint8Array(CSIZ*CSIZ*CHH);
  const meta = {hmL:new Uint8Array(256), top:new Uint8Array(256), bio:new Uint8Array(256), edited:false};
  const key = ckey(cx,cz);
  CHUNK_DATA.set(key,data); CHUNK_META.set(key,meta);
  const SD = WORLD_SEED, x0 = cx*CSIZ, z0 = cz*CSIZ;

  if(WORLD.type==='flat'){   // Superflat : bedrock, 2 × terre, 1 × herbe — ni arbres ni grottes
    const s0 = FLAT_H + Y_OFF;
    for(let col=0;col<256;col++){
      const base = col*CHH;
      data[base+s0-3] = 10; data[base+s0-2] = 2; data[base+s0-1] = 2; data[base+s0] = 1;
      meta.bio[col] = 0;
    }
    for(let col=0;col<256;col++) recomputeColumn(data,meta,col);
    return data;
  }

  // 1) hauteur + biome de chaque colonne
  let maxStone = 0;
  for(let lx=0;lx<CSIZ;lx++) for(let lz=0;lz<CSIZ;lz++){
    const col = lx*CSIZ+lz;
    colInfo(x0+lx, z0+lz);
    _hArr[col] = _ch; _tArr[col] = _ct; meta.bio[col] = _ct;
    const dd = dirtDepthOf(_ct, _ch);
    const st = _ch + Y_OFF - dd;
    if(st > maxStone) maxStone = st;
  }

  // 2) grilles de bruit de grottes (seulement jusqu'à la hauteur utile)
  const gyMax = Math.min(CNY-1, (maxStone>>2)+1);
  const cs = 0.046;
  for(let gx=0;gx<CN;gx++) for(let gz=0;gz<CN;gz++){
    const wx = x0+gx*4, wz = z0+gz*4;
    for(let gy=0;gy<=gyMax;gy++){
      const wy = gy*4 - Y_OFF, idx = (gx*CN+gz)*CNY+gy;
      _c1[idx] = perlin3(wx*cs,        wy*0.052,     wz*cs,        SD^310);
      _c2[idx] = perlin3(wx*cs*1.3+5,  wy*0.062+30,  wz*cs*1.3+5,  SD^420);
      _cb[idx] = perlin3(wx*0.016,     wy*0.022,     wz*0.016,     SD^530);
    }
  }
  for(let a=0;a<4;a++) for(let b=0;b<4;b++) for(let g=0;g<CCY;g++){
    if(g>=gyMax){ _maybe[(a*4+b)*CCY+g]=0; continue; }
    let lo1=1e9,hi1=-1e9,lo2=1e9,hi2=-1e9,hib=-1e9;
    for(let da=0;da<2;da++) for(let db=0;db<2;db++) for(let dg=0;dg<2;dg++){
      const idx = ((a+da)*CN+(b+db))*CNY+g+dg;
      const v1=_c1[idx], v2=_c2[idx], vb=_cb[idx];
      if(v1<lo1)lo1=v1; if(v1>hi1)hi1=v1;
      if(v2<lo2)lo2=v2; if(v2>hi2)hi2=v2;
      if(vb>hib)hib=vb;
    }
    const m1=minAbs(lo1,hi1), m2=minAbs(lo2,hi2);
    _maybe[(a*4+b)*CCY+g] = (m1*m1+m2*m2 < 0.0295 || hib > 0.515) ? 1 : 0;
  }

  // 3) remplissage des colonnes
  for(let lx=0;lx<CSIZ;lx++) for(let lz=0;lz<CSIZ;lz++){
    const col = lx*CSIZ+lz, base = col*CHH;
    const wx = x0+lx, wz = z0+lz;
    const h = _hArr[col], type = _tArr[col];
    const surfLy = h + Y_OFF;
    const dirtDepth = dirtDepthOf(type, h);
    const stoneTop = surfLy - dirtDepth;
    const gx = lx>>2, gz = lz>>2, fx = (lx&3)*0.25, fz = (lz&3)*0.25;
    const cellBase = (gx*4+gz)*CCY;

    data[base+BED_LY] = 10; // bedrock (y = -60) ; les blocs en dessous restent de l'air et ne sont jamais générés
    for(let ly=BED_LY+1; ly<stoneTop; ly++){
      let carve = false;
      if(_maybe[cellBase+(ly>>2)]){
        const gy = ly>>2, fy = (ly&3)*0.25;
        if(ly>BED_LY+5){
          const v1 = tri(_c1,gx,gz,gy,fx,fz,fy), v2 = tri(_c2,gx,gz,gy,fx,fz,fy);
          if(v1*v1+v2*v2 < 0.028) carve = true;
        }
        if(!carve && ly>BED_LY+10 && tri(_cb,gx,gz,gy,fx,fz,fy) > 0.52) carve = true;
      }
      if(carve) continue;
      const wy = ly - Y_OFF;
      let block = 3;
      const depth = h - wy;
      if(depth > 3){
        const hv = hash32(wx*3+wy, wz*5+wy, 17^SD);          // 1 seul hachage : minerais (haut) + gravier (bas)
        const rng = (hv>>>0)/4294967296;
        if     (rng < 0.015)               block = 13; // charbon
        else if(rng < 0.026 && depth > 8)  block = 12; // fer
        else if(rng < 0.032 && depth > 24) block = 15; // or
        else if(rng < 0.036 && depth > 38) block = 16; // diamant
        else if(depth > 5 && ((Math.imul(hv,-1640531535)>>>8)/16777216) < 0.035) block = 9; // gravier
      }
      data[base+ly] = block;
    }
    const sub = ((type===2 && h>38) || (type===9 && h>42)) ? 3 : (type===3 ? 4 : 2);
    if(type === 10){   // Badlands : strates horizontales
      for(let ly=Math.max(BED_LY+1,stoneTop); ly<surfLy; ly++) data[base+ly] = BAD_BAND[(((ly-Y_OFF)%6)+6)%6];
    } else for(let ly=Math.max(BED_LY+1,stoneTop); ly<surfLy; ly++) data[base+ly] = sub;
    let sb;
    if(type === 3 || type === 10) sb = 4;   // sable du désert / des badlands
    else if(type === 9){ const pn = perlin2(wx*0.07, wz*0.07, SD^717); sb = (h>44 || pn>0.35) ? 3 : (pn>0.2 ? 9 : 1); }   // collines : plaques de pierre / gravier
    else if(type !== 2) sb = 1;
    else if(h > 62) sb = 9;
    else if(h > 45) sb = 3;
    else if(h > 32) sb = 8;
    else            sb = 1;
    data[base+surfLy] = sb;
  }

  // 4) arbres — passe avec marge de 2 blocs : les canopées ne sont plus coupées aux bordures de chunk
  for(let lx=-2;lx<CSIZ+2;lx++) for(let lz=-2;lz<CSIZ+2;lz++){
    const wx = x0+lx, wz = z0+lz;
    const ts = hash2(wx,wz,77^SD);
    if(ts >= 0.12) continue;
    let h, type;
    if(lx>=0&&lx<CSIZ&&lz>=0&&lz<CSIZ){ h=_hArr[lx*CSIZ+lz]; type=_tArr[lx*CSIZ+lz]; }
    else { colInfo(wx,wz); h=_ch; type=_ct; }
    const prob = TREE_P[type];
    if(ts >= prob || !(h>4 && h<50)) continue;
    if(type===9 && (h>44 || perlin2(wx*0.07, wz*0.07, SD^717) > 0.2)) continue;   // pas d'arbre sur la pierre / le gravier
    let trunkH = 4 + (hash2(wx+1,wz,88^SD)*3|0);
    if(type===6) trunkH = 6 + (hash2(wx+1,wz,88^SD)*4|0);        // sapin
    else if(type===7) trunkH = 6 + (hash2(wx+1,wz,88^SD)*5|0);   // arbre de jungle
    if(lx>=0&&lx<CSIZ&&lz>=0&&lz<CSIZ){
      const b = (lx*CSIZ+lz)*CHH;
      for(let t=1;t<=trunkH;t++){ const ty=h+t; if(ty<=Y_MAX) data[b+ty+Y_OFF]=5; }
    }
    if(type===6){   // sapin : canopée conique par étages
      const top = h+trunkH;
      for(let ox=-2;ox<=2;ox++) for(let oz=-2;oz<=2;oz++){
        const flx = lx+ox, flz = lz+oz;
        if(flx<0||flx>=CSIZ||flz<0||flz>=CSIZ) continue;
        const b = (flx*CSIZ+flz)*CHH, mx = Math.max(Math.abs(ox),Math.abs(oz)), ad = Math.abs(ox)+Math.abs(oz);
        for(let fy=h+3; fy<=top+1 && fy<=Y_MAX; fy++){
          const k = top+1-fy, rad = k===0 ? 0 : (k<=2 ? 1 : (k%2 ? 2 : 1));
          if(mx>rad || (rad===2 && ad>3)) continue;
          if(data[b+fy+Y_OFF]===0) data[b+fy+Y_OFF]=6;
        }
      }
      continue;
    }
    const topW = h+trunkH;
    for(let ox=-2;ox<=2;ox++) for(let oz=-2;oz<=2;oz++){
      const flx = lx+ox, flz = lz+oz;
      if(flx<0||flx>=CSIZ||flz<0||flz>=CSIZ) continue;
      const b = (flx*CSIZ+flz)*CHH;
      for(let oy=-1;oy<=2;oy++){
        const dist = Math.sqrt(ox*ox+oz*oz)*0.9 + Math.abs(oy-0.8)*0.7;
        if(dist > 2.8) continue;
        const fy = topW+oy;
        if(fy<Y_MIN||fy>Y_MAX) continue;
        if(data[b+fy+Y_OFF]===0) data[b+fy+Y_OFF]=6;
      }
    }
  }

  // 4b) forêt centenaire : arbres géants (tronc 2×2, canopée ovoïde), très espacés — 1 candidat par cellule de 11×11
  {
    const CELL = 11;
    const i0 = Math.floor((x0-8)/CELL), i1 = Math.floor((x0+CSIZ+8)/CELL);
    const j0 = Math.floor((z0-8)/CELL), j1 = Math.floor((z0+CSIZ+8)/CELL);
    for(let ci=i0; ci<=i1; ci++) for(let cj=j0; cj<=j1; cj++){
      const hv = hash32(ci,cj,901^SD);
      if((hv>>>0)/4294967296 > 0.85) continue;
      const tx = ci*CELL + 1 + ((hv>>>4)&255)%8, tz = cj*CELL + 1 + ((hv>>>12)&255)%8;
      colInfo(tx,tz);
      if((_ct!==4 && _ct!==7) || !(_ch>4 && _ch<55)) continue;
      const th = _ch, T = (_ct===7 ? 22 : 16) + ((hv>>>20)&15)%9;   // jungle : géants plus hauts
      for(let a=0;a<2;a++) for(let b=0;b<2;b++){
        const lx = tx+a-x0, lz = tz+b-z0;
        if(lx<0||lx>=CSIZ||lz<0||lz>=CSIZ) continue;
        const bs = (lx*CSIZ+lz)*CHH;
        for(let y=th+1; y<=th+T && y<=Y_MAX; y++){ const v = data[bs+y+Y_OFF]; if(v===0||v===6) data[bs+y+Y_OFF] = 5; }
      }
      const top = th+T, ccx = tx+1, ccz = tz+1;
      for(let oy=-6; oy<=3; oy++){
        const t = (oy+1.5)/4.6, r2 = 1-t*t;
        if(r2<=0) continue;
        const rad = 5.4*Math.sqrt(r2), fy = top+oy;
        if(fy>Y_MAX || fy<Y_MIN) continue;
        for(let wxl=tx-6; wxl<=tx+7; wxl++) for(let wzl=tz-6; wzl<=tz+7; wzl++){
          const lx = wxl-x0, lz = wzl-z0;
          if(lx<0||lx>=CSIZ||lz<0||lz>=CSIZ) continue;
          const d = Math.hypot(wxl+0.5-ccx, wzl+0.5-ccz);
          const jit = 0.85 + 0.3*((hash32(wxl,wzl,fy)>>>0)/4294967296);
          if(d <= rad*jit){ const idx = (lx*CSIZ+lz)*CHH+fy+Y_OFF; if(data[idx]===0) data[idx] = 6; }
        }
      }
    }
  }

  // 4c) cactus (désert), herbe haute et fleurs (plaines / forêts)
  for(let lx=0;lx<CSIZ;lx++) for(let lz=0;lz<CSIZ;lz++){
    const col = lx*CSIZ+lz, base = col*CHH, type = _tArr[col], h = _hArr[col];
    if(type===2 || h<=4 || h>=50) continue;
    const wx = x0+lx, wz = z0+lz, ay = h+1+Y_OFF;
    if(data[base+ay] !== 0) continue;
    if(type===9 && data[base+h+Y_OFF] !== 1) continue;   // collines : rien sur la pierre / le gravier
    if(type===3 || type===10){
      if(hash2(wx,wz,444^SD) < (type===3 ? 0.006 : 0.0025)){
        const ch = 1 + ((hash32(wx,wz,445^SD)>>>0)%3);
        for(let t=0;t<ch && h+1+t<=Y_MAX;t++) data[base+ay+t] = 22;
      }
      continue;
    }
    const r = hash2(wx,wz,311^SD);
    if(type===0){
      const patch = perlin2(wx*0.09, wz*0.09, SD^515);
      const fp = patch > 0.2 ? 0.14 : 0.012;
      if(r < fp){ data[base+ay] = perlin2(wx*0.05, wz*0.05, SD^616) > 0 ? 25 : 26; }
      else if(r < fp + 0.30) data[base+ay] = 24;
    } else if(type===5){          // savane : herbe haute partout
      if(r < 0.40) data[base+ay] = 24;
    } else if(type===8){          // forêt fleurie : tapis de fleurs
      if(r < 0.22) data[base+ay] = perlin2(wx*0.06, wz*0.06, SD^818) > 0 ? 25 : 26;
      else if(r < 0.34) data[base+ay] = 24;
    } else {
      if(r < (type===4 ? 0.16 : type===7 ? 0.30 : type===9 ? 0.06 : 0.10)) data[base+ay] = 24;
    }
  }

  // 5) heightmaps
  for(let col=0;col<256;col++) recomputeColumn(data,meta,col);
  return data;
}
