'use strict';

// Ramène une image à 16×16. Les textures haute définition (ex. 160×160 = pixels agrandis ×10) sont échantillonnées au CENTRE
// de chaque cellule (pixel-perfect, aucun flou) ; les 16×16 sont copiées telles quelles.
function toTile16(img){
  const cv = document.createElement('canvas'); cv.width = cv.height = 16;
  const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if(w > 16 && w === h && w % 16 === 0){
    try{
      const big = document.createElement('canvas'); big.width = w; big.height = h;
      const bx = big.getContext('2d'); bx.imageSmoothingEnabled = false; bx.drawImage(img, 0, 0);
      const src = bx.getImageData(0, 0, w, h).data, out = cx.createImageData(16, 16), s = w/16, o = s >> 1;
      for(let y=0; y<16; y++) for(let x=0; x<16; x++){
        const si = ((y*s+o)*w + (x*s+o))*4, di = (y*16+x)*4;
        out.data[di] = src[si]; out.data[di+1] = src[si+1]; out.data[di+2] = src[si+2]; out.data[di+3] = src[si+3];
      }
      cx.putImageData(out, 0, 0);
      return cv;
    }catch(e){ /* canvas "tainted" (file://) : repli sur la réduction du navigateur */ }
  }
  cx.drawImage(img, 0, 0, 16, 16);
  return cv;
}

function loadTextures(cb){
  // 1. Textures procédurales pour tous les items/outils
  buildProceduralTextures();

  // 2. Remplace les textures bloc par les vraies PNG (16×16, pixel-perfect)
  //    Toutes les data: URIs chargent de façon asynchrone — on attend qu'elles soient toutes prêtes
  const keys = Object.keys(TEX_DATA);
  const itemKeys = Object.keys(ITEM_TEX_DATA);
  const armorKeys = Object.keys(ARMOR_TEX_DATA);
  const mobKeys = Object.keys(MOB_TEX_DATA);
  let pending = keys.length + itemKeys.length + 2 + armorKeys.length + mobKeys.length;

  function loadOneImg(key, src){
    const img = new Image();
    img.onload = function(){
      const cv = toTile16(img);
      IMGS[key] = cv;
      if(TINT_KEYS[key]){   // gris conservé pour le monde (teinte par biome dans les sommets), copie teintée pour icônes/objets
        const g = document.createElement('canvas'); g.width = g.height = 16;
        g.getContext('2d').drawImage(cv,0,0); GRAY[key] = g;
        tintCanvas(cv, (TINT_KEYS[key]==='g' ? GRASS_TINT : FOLIAGE_TINT)[0]);
      } else if(FIXED_TINT[key]) tintCanvas(cv, FIXED_TINT[key]);   // feuilles d'épicéa / bouleau : couleur fixe
      const t = new THREE.CanvasTexture(cv);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      T3[key] = t;
      pending--;
      if(pending <= 0) cb();
    };
    img.onerror = function(){
      console.warn('Texture manquante:', key);
      pending--;
      if(pending <= 0) cb();
    };
    img.src = src;
  }
  keys.forEach(function(key){ loadOneImg(key, TEX_DATA[key]); });
  itemKeys.forEach(function(key){ loadOneImg(key, ITEM_TEX_DATA[key]); });
  armorKeys.forEach(function(key){   // textures d'armure : 64×32, gardées telles quelles (pas de redimensionnement en 16×16)
    const img = new Image();
    img.onload = function(){
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
      cv.getContext('2d').drawImage(img,0,0);
      ARMOR_IMG[key] = cv;
      pending--; if(pending <= 0) cb();
    };
    img.onerror = function(){ console.warn('Texture d\'armure manquante:', key); pending--; if(pending <= 0) cb(); };
    img.src = ARMOR_TEX_DATA[key];
  });
  mobKeys.forEach(function(key){   // textures de créatures : taille d'origine conservée (les UV en dépendent)
    const img = new Image();
    img.onload = function(){
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img,0,0);
      MOB_IMG[key] = cv;
      pending--; if(pending <= 0) cb();
    };
    img.onerror = function(){ console.warn('Texture de créature manquante:', key); pending--; if(pending <= 0) cb(); };
    img.src = MOB_TEX_DATA[key];
  });
  Object.keys(SKY_TEX_DATA).forEach(function(key){
    const img = new Image();
    img.onload = function(){
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img,0,0);
      SKYIMG[key] = cv;
      pending--; if(pending <= 0) cb();
    };
    img.onerror = function(){ console.warn('Texture ciel manquante:', key); pending--; if(pending <= 0) cb(); };
    img.src = SKY_TEX_DATA[key];
  });
}
