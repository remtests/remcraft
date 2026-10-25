'use strict';

function loadTextures(cb){
  // 1. Textures procédurales pour tous les items/outils
  buildProceduralTextures();

  // 2. Remplace les textures bloc par les vraies PNG (16×16, pixel-perfect)
  //    Toutes les data: URIs chargent de façon asynchrone — on attend qu'elles soient toutes prêtes
  const keys = Object.keys(TEX_DATA);
  const itemKeys = Object.keys(ITEM_TEX_DATA);
  const armorKeys = Object.keys(ARMOR_TEX_DATA);
  let pending = keys.length + itemKeys.length + 2 + armorKeys.length;

  function loadOneImg(key, src){
    const img = new Image();
    img.onload = function(){
      const cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const cx = cv.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, 0, 0, 16, 16);
      IMGS[key] = cv;
      if(TINT_KEYS[key]){   // gris conservé pour le monde (teinte par biome dans les sommets), copie teintée pour icônes/objets
        const g = document.createElement('canvas'); g.width = g.height = 16;
        g.getContext('2d').drawImage(cv,0,0); GRAY[key] = g;
        tintCanvas(cv, (TINT_KEYS[key]==='g' ? GRASS_TINT : FOLIAGE_TINT)[0]);
      }
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
