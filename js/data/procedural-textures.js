'use strict';

// ════════════════════════════════════════════════
// PROCEDURAL PIXEL-ART TEXTURES
// ════════════════════════════════════════════════
const IMGS = {}, T3 = {}, GRAY = {};
// Teintes de biomes (couleurs Minecraft) : 0 Plaines, 1 Forêt, 2 Montagne, 3 Désert, 4 Forêt centenaire,
// 5 Savane, 6 Taïga, 7 Jungle, 8 Forêt fleurie, 9 Collines venteuses, 10 Badlands
const GRASS_TINT   = [[145,189,89],[121,192,90],[138,182,137],[191,183,85],[104,178,78],[191,183,85],[134,183,131],[ 89,201, 60],[121,192,90],[138,182,137],[144,129, 77]];
const FOLIAGE_TINT = [[119,171,47],[ 89,174,48],[109,163,107],[174,164,42],[ 72,160,40],[174,164,42],[104,164,100],[ 48,187, 11],[ 89,174,48],[109,163,107],[158,129, 77]];
const TINT_KEYS = {grass_top:'g', short_grass:'g', leaves:'f', jungle_leaves:'f', acacia_leaves:'f', dark_oak_leaves:'f'};   // teinte selon le biome (par sommet)
const FIXED_TINT = {spruce_leaves:[97,153,97], birch_leaves:[128,167,85]};   // teinte fixe (comme Minecraft) : appliquée une fois au chargement
function tintCanvas(cv, rgb){
  const c = cv.getContext('2d'), id = c.getImageData(0,0,cv.width,cv.height), d = id.data;
  for(let i=0;i<d.length;i+=4){ d[i]=d[i]*rgb[0]/255; d[i+1]=d[i+1]*rgb[1]/255; d[i+2]=d[i+2]*rgb[2]/255; }
  c.putImageData(id,0,0);
}
const SKYIMG = {};

function srng(seed){let s=seed|0;return()=>{s=(Math.imul(s,1664525)+1013904223)|0;return(s>>>0)/0xffffffff;};}
const px=(cx,x,y,col)=>{cx.fillStyle=col;cx.fillRect(x,y,1,1);};
const fill=(cx,col)=>{cx.fillStyle=col;cx.fillRect(0,0,16,16);};
const row=(cx,y,col)=>{cx.fillStyle=col;cx.fillRect(0,y,16,1);};

function makeTex(fn,seed){
  const cv=document.createElement('canvas');cv.width=cv.height=16;
  fn(cv.getContext('2d'),srng(seed||1));
  IMGS[fn._k]=cv;
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;
  return t;
}

function buildProceduralTextures(){
  // GRASS TOP
  const gtFn=(cx,rng)=>{
    const c=['#5da832','#63b535','#58a02e','#6abf38','#4e9228','#72c43a','#50a028'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)px(cx,x,y,rng()<0.1?'#3a7a1e':c[Math.floor(rng()*c.length)]);
  }; gtFn._k='grass_top'; T3['grass_top']=makeTex(gtFn,1);

  // GRASS SIDE
  const gsFn=(cx,rng)=>{
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      if(y<3) px(cx,x,y,rng()<0.3?'#4a9628':'#5cb030');
      else px(cx,x,y,rng()<0.18?'#a07840':rng()<0.1?'#7a4c28':'#9e6b3f');
    }
  }; gsFn._k='grass_side'; T3['grass_side']=makeTex(gsFn,2);

  // DIRT
  const dFn=(cx,rng)=>{
    const c=['#9e6b3f','#8b5e34','#a87040','#7a4c28','#b07848'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)px(cx,x,y,c[Math.floor(rng()*c.length)]);
  }; dFn._k='dirt'; T3['dirt']=makeTex(dFn,3);

  // STONE
  const stFn=(cx,rng)=>{
    fill(cx,'#898989');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){const v=rng();if(v<0.06)px(cx,x,y,'#707070');else if(v<0.10)px(cx,x,y,'#a0a0a0');}
  }; stFn._k='stone'; T3['stone']=makeTex(stFn,4);

  // SAND
  const saFn=(cx,rng)=>{
    const c=['#dbd09a','#d4c88e','#e2d6a4','#c8bc80'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)px(cx,x,y,c[Math.floor(rng()*c.length)]);
  }; saFn._k='sand'; T3['sand']=makeTex(saFn,5);

  // LOG TOP
  const ltFn=(cx,rng)=>{
    fill(cx,'#7a5c28');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const dx=x-7.5,dy=y-7.5,d=Math.sqrt(dx*dx+dy*dy);
      if(d<2)px(cx,x,y,'#5a4018');
      else if(d<3.5||( d<5&&rng()<0.5))px(cx,x,y,'#8a6830');
      else if(rng()<0.15)px(cx,x,y,'#6a4820');
    }
  }; ltFn._k='log_top'; T3['log_top']=makeTex(ltFn,6);

  // LOG SIDE
  const lsFn=(cx,rng)=>{
    const c=['#8b6428','#7a5420','#956e30','#6e4a1c'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const g=Math.sin(x*2.1)*0.5+0.5;
      px(cx,x,y,rng()<0.05?'#5a3c14':c[Math.floor(g*(c.length-1))]);
    }
    for(let y=0;y<16;y++){px(cx,0,y,'#5a3c14');px(cx,15,y,'#5a3c14');}
  }; lsFn._k='log_side'; T3['log_side']=makeTex(lsFn,7);

  // LEAVES
  const leafFn=(cx,rng)=>{
    const c=['#1a6b1a','#0f5a0f','#237023','#145514','#1c7a1c','#0a4a0a','#186018'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      if(rng()<0.12){cx.clearRect(x,y,1,1);}
      else px(cx,x,y,c[Math.floor(rng()*c.length)]);
    }
  }; leafFn._k='leaves'; T3['leaves']=makeTex(leafFn,8);

  // PLANKS
  const plFn=(cx,rng)=>{
    fill(cx,'#c8a060');
    [3,4,7,8,11,12].forEach(y=>row(cx,y,'#a07840'));
    for(let y=0;y<16;y++)px(cx,(Math.floor(y/4)%2)*8,y,'#a07840');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.04)px(cx,x,y,'#b89050');
  }; plFn._k='planks'; T3['planks']=makeTex(plFn,9);

  // COBBLESTONE
  const coFn=(cx,rng)=>{
    fill(cx,'#6e6e6e');
    const stones=[[0,0,7,4],[8,0,8,4],[0,4,5,4],[6,4,5,4],[12,4,4,4],[0,8,8,4],[9,8,7,4],[0,12,6,4],[7,12,9,4]];
    for(const[x,y,w,h]of stones){
      const v=Math.floor(rng()*30+80);
      cx.fillStyle=`rgb(${v},${v},${v})`;cx.fillRect(x+1,y+1,w-1,h-1);
      cx.fillStyle='#484848';cx.fillRect(x,y,w,1);cx.fillRect(x,y,1,h);
      cx.fillStyle='#a0a0a0';cx.fillRect(x+w-1,y+1,1,h-1);cx.fillRect(x+1,y+h-1,w-2,1);
    }
  }; coFn._k='cobble'; T3['cobble']=makeTex(coFn,10);

  // GRAVEL
  const grFn=(cx,rng)=>{
    fill(cx,'#8a8a9a');
    for(let i=0;i<28;i++){
      const x=Math.floor(rng()*13),y=Math.floor(rng()*13),s=Math.floor(rng()*3)+1,v=Math.floor(rng()*50+78);
      cx.fillStyle=`rgb(${v},${v},${v+8})`;cx.fillRect(x,y,s,s);
    }
  }; grFn._k='gravel'; T3['gravel']=makeTex(grFn,11);

  // BEDROCK
  const bbFn=(cx,rng)=>{
    fill(cx,'#2a2a2a');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){const v=rng();if(v<0.2)px(cx,x,y,'#3a3a3a');else if(v<0.25)px(cx,x,y,'#1a1a1a');}
  }; bbFn._k='bedrock'; T3['bedrock']=makeTex(bbFn,12);

  // CRAFTING TABLE
  const ctFn=(cx,rng)=>{
    fill(cx,'#c8a060');[3,4,7,8,11,12].forEach(y=>row(cx,y,'#a07840'));
    cx.fillStyle='#6e4e20';cx.fillRect(4,4,8,8);
    cx.fillStyle='#4a3010';cx.fillRect(5,5,6,6);
    cx.fillStyle='#8a6028';cx.fillRect(1,1,14,2);cx.fillRect(1,1,2,14);
    cx.fillStyle='#5a3c14';cx.fillRect(1,13,14,2);cx.fillRect(13,1,2,14);
  }; ctFn._k='craft_top'; T3['craft_top']=makeTex(ctFn,13);

  const csFn=(cx,rng)=>{
    fill(cx,'#c8a060');[3,4,7,8,11,12].forEach(y=>row(cx,y,'#a07840'));
    cx.fillStyle='#5a3c14';cx.fillRect(2,2,2,8);cx.fillRect(6,2,1,8);cx.fillRect(10,2,4,2);cx.fillRect(11,4,2,6);
  }; csFn._k='craft_side'; T3['craft_side']=makeTex(csFn,14);
  const cfFn=(cx,rng)=>{
    fill(cx,'#c8a060');[3,4,7,8,11,12].forEach(y=>row(cx,y,'#a07840'));
    cx.fillStyle='#5a3c14';cx.fillRect(2,2,2,8);cx.fillRect(6,1,2,9);cx.fillRect(10,2,4,2);cx.fillRect(11,4,2,6);
  }; cfFn._k='craft_front'; T3['craft_front']=makeTex(cfFn,15);

  // IRON ORE
  const ioFn=(cx,rng)=>{
    fill(cx,'#898989');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.07)px(cx,x,y,'#707070');
    [[2,2,3,3],[9,7,3,3],[5,10,3,2]].forEach(([x,y,w,h])=>{cx.fillStyle='#d0b090';cx.fillRect(x,y,w,h);cx.fillStyle='#f0d0b0';cx.fillRect(x,y,1,1);});
  }; ioFn._k='iron_ore'; T3['iron_ore']=makeTex(ioFn,16);

  // COAL ORE
  const coOFn=(cx,rng)=>{
    fill(cx,'#898989');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.07)px(cx,x,y,'#707070');
    [[2,2,3,3],[10,5,3,3],[4,10,3,3],[10,10,3,3]].forEach(([x,y,w,h])=>{cx.fillStyle='#1a1a1a';cx.fillRect(x,y,w,h);cx.fillStyle='#111';cx.fillRect(x,y,1,1);});
  }; coOFn._k='coal_ore'; T3['coal_ore']=makeTex(coOFn,17);

  // GLASS
  const glFn=(cx,rng)=>{
    cx.clearRect(0,0,16,16);
    cx.fillStyle='rgba(180,220,255,0.35)';cx.fillRect(0,0,16,16);
    cx.fillStyle='rgba(255,255,255,0.5)';
    cx.fillRect(0,0,16,1);cx.fillRect(0,0,1,16);
    cx.fillRect(15,0,1,16);cx.fillRect(0,15,16,1);
    cx.fillStyle='rgba(180,220,255,0.6)';cx.fillRect(2,2,4,4);
  }; glFn._k='glass'; T3['glass']=makeTex(glFn,40);

  // GOLD ORE
  const goFn=(cx,rng)=>{
    fill(cx,'#898989');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.07)px(cx,x,y,'#707070');
    [[2,2,3,3],[9,6,3,3],[4,10,3,3]].forEach(([x,y,w,h])=>{cx.fillStyle='#f0d020';cx.fillRect(x,y,w,h);cx.fillStyle='#ffe850';cx.fillRect(x,y,1,1);});
  }; goFn._k='gold_ore'; T3['gold_ore']=makeTex(goFn,41);

  // DIAMOND ORE
  const doFn=(cx,rng)=>{
    fill(cx,'#898989');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.07)px(cx,x,y,'#707070');
    [[2,3,3,3],[9,8,3,3],[5,11,2,2]].forEach(([x,y,w,h])=>{cx.fillStyle='#20d0e0';cx.fillRect(x,y,w,h);cx.fillStyle='#80f0ff';cx.fillRect(x,y,1,1);});
  }; doFn._k='diamond_ore'; T3['diamond_ore']=makeTex(doFn,42);

  // FURNACE TOP
  const furFn=(cx,rng)=>{
    fill(cx,'#898989');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){const v=rng();if(v<0.06)px(cx,x,y,'#707070');else if(v<0.10)px(cx,x,y,'#a0a0a0');}
    cx.fillStyle='#484848';cx.fillRect(3,3,10,10);
    cx.fillStyle='#c84000';cx.fillRect(5,5,6,6);
    cx.fillStyle='#ff8800';cx.fillRect(6,6,4,4);
  }; furFn._k='furnace_top'; T3['furnace_top']=makeTex(furFn,43);

  const furFront=(cx,rng)=>{
    fill(cx,'#898989');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.06)px(cx,x,y,'#707070');
    cx.fillStyle='#484848';cx.fillRect(2,3,12,8);
    cx.fillStyle='#c84000';cx.fillRect(3,4,10,6);
    cx.fillStyle='#ff8000';cx.fillRect(4,5,8,4);
    cx.fillStyle='#ffcc00';cx.fillRect(5,6,6,2);
    cx.fillStyle='#555';cx.fillRect(6,1,4,2);
  }; furFront._k='furnace_front'; T3['furnace_front']=makeTex(furFront,44);

  // WOOL (white)
  const wlFn=(cx,rng)=>{
    const c=['#f0f0f0','#e8e8e8','#f8f8f8','#ececec'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)px(cx,x,y,c[Math.floor(rng()*c.length)]);
    for(let i=0;i<12;i++){const xp=Math.floor(rng()*14),yp=Math.floor(rng()*14);px(cx,xp,yp,'#d8d8d8');}
  }; wlFn._k='wool'; T3['wool']=makeTex(wlFn,45);

  // CHEST TOP
  const chFn=(cx,rng)=>{
    fill(cx,'#a87040');
    cx.fillStyle='#8b5c30';cx.fillRect(1,1,14,14);
    cx.fillStyle='#7a4c20';cx.fillRect(2,2,12,12);
    cx.fillStyle='#d4a060';cx.fillRect(3,3,10,4);
    cx.fillStyle='#c8903a';cx.fillRect(7,4,2,2);
    cx.fillStyle='#a07030';cx.fillRect(3,7,10,5);
  }; chFn._k='chest_top'; T3['chest_top']=makeTex(chFn,46);

  // BOOKSHELF
  const bkFn=(cx,rng)=>{
    fill(cx,'#c8a060');[3,4,12,13].forEach(y=>row(cx,y,'#a07840'));
    const bc=['#b84030','#3060c0','#308840','#a08820','#602080'];
    for(let i=0;i<5;i++){const xs=1+i*3;cx.fillStyle=bc[i%bc.length];cx.fillRect(xs,4,2,8);}
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.02)px(cx,x,y,'#906020');
  }; bkFn._k='bookshelf'; T3['bookshelf']=makeTex(bkFn,47);

  // TNT SIDE
  const tntFn=(cx,rng)=>{
    fill(cx,'#c83020');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.08)px(cx,x,y,'#a02010');
    cx.fillStyle='#f0f0f0';cx.fillRect(2,4,12,8);
    cx.fillStyle='#d03020';cx.fillRect(3,5,10,6);
    // T N T letters
    cx.fillStyle='#c83020';
    [3,4,5,6,7,8,9,10].forEach(x=>cx.fillRect(x,5,1,1));
    cx.fillRect(5,6,1,4);cx.fillRect(7,5,1,6);cx.fillRect(9,5,1,6);
  }; tntFn._k='tnt_side'; T3['tnt_side']=makeTex(tntFn,48);

  const tntTop=(cx,rng)=>{
    fill(cx,'#c83020');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(rng()<0.08)px(cx,x,y,'#a02010');
    cx.fillStyle='#888';cx.fillRect(5,5,6,6);
    cx.fillStyle='#666';cx.fillRect(7,7,2,2);
  }; tntTop._k='tnt_top'; T3['tnt_top']=makeTex(tntTop,49);

  // SPONGE
  const spFn=(cx,rng)=>{
    fill(cx,'#c8c020');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      if(rng()<0.15)px(cx,x,y,'#a0a010');
      if((x+y)%3===0)cx.clearRect(x,y,1,1);
    }
  }; spFn._k='sponge'; T3['sponge']=makeTex(spFn,50);

  // === ITEMS ===
  const transparent=(cx)=>cx.clearRect(0,0,16,16);

  // STICK
  const skFn=(cx,rng)=>{transparent(cx);for(let i=0;i<10;i++){px(cx,3+i,3+i,'#9e6b30');px(cx,4+i,3+i,'#7a5020');}};
  skFn._k='stick'; T3['stick']=makeTex(skFn,18);

  // WOOD SWORD
  const wswFn=(cx,rng)=>{
    transparent(cx);
    for(let i=0;i<7;i++){px(cx,8-i,i,'#c8a060');px(cx,9-i,i,'#a07840');}
    [3,4,5].forEach(x=>px(cx,x,7,'#7a5020'));
    for(let i=0;i<4;i++)px(cx,5,8+i,'#9e6b30');
  }; wswFn._k='wooden_sword'; T3['wooden_sword']=makeTex(wswFn,19);

  // WOOD PICK
  const wpFn=(cx,rng)=>{
    transparent(cx);
    for(let x=1;x<9;x++)px(cx,x,1,'#c8a060');
    [1,8].forEach(x=>{px(cx,x,2,'#c8a060');px(cx,x,3,'#a07840');});
    for(let i=0;i<10;i++){px(cx,4+i,3+i,'#9e6b30');px(cx,5+i,3+i,'#7a5020');}
  }; wpFn._k='wooden_pickaxe'; T3['wooden_pickaxe']=makeTex(wpFn,20);

  // WOOD AXE
  const waFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c8a060';cx.fillRect(2,1,5,4);
    cx.fillStyle='#a07840';cx.fillRect(3,2,3,3);
    for(let i=0;i<10;i++){px(cx,5+i,3+i,'#9e6b30');px(cx,6+i,3+i,'#7a5020');}
  }; waFn._k='wooden_axe'; T3['wooden_axe']=makeTex(waFn,21);

  // STONE PICK
  const spkFn=(cx,rng)=>{
    transparent(cx);
    for(let x=1;x<9;x++)px(cx,x,1,'#989898');
    [1,8].forEach(x=>{px(cx,x,2,'#989898');px(cx,x,3,'#787878');});
    for(let i=0;i<10;i++){px(cx,4+i,3+i,'#9e6b30');px(cx,5+i,3+i,'#7a5020');}
  }; spkFn._k='stone_pickaxe'; T3['stone_pickaxe']=makeTex(spkFn,22);

  // STONE SWORD
  const sswFn=(cx,rng)=>{
    transparent(cx);
    for(let i=0;i<7;i++){px(cx,8-i,i,'#989898');px(cx,9-i,i,'#787878');}
    [3,4,5].forEach(x=>px(cx,x,7,'#7a5020'));
    for(let i=0;i<4;i++)px(cx,5,8+i,'#9e6b30');
  }; sswFn._k='stone_sword'; T3['stone_sword']=makeTex(sswFn,23);

  // IRON INGOT
  const iiFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#b8b8c8';cx.fillRect(2,2,12,10);
    cx.fillStyle='#d0d0e0';cx.fillRect(3,3,10,2);
    cx.fillStyle='#9898a8';cx.fillRect(2,10,12,2);
    cx.fillStyle='#a8a8b8';cx.fillRect(2,4,2,6);
    cx.fillStyle='#c8c8d8';cx.fillRect(12,4,2,6);
  }; iiFn._k='iron_ingot'; T3['iron_ingot']=makeTex(iiFn,24);

  // IRON PICK
  const ipFn=(cx,rng)=>{
    transparent(cx);
    for(let x=1;x<9;x++)px(cx,x,1,'#c0c0d0');
    [1,8].forEach(x=>{px(cx,x,2,'#c0c0d0');px(cx,x,3,'#9898a8');});
    for(let i=0;i<10;i++){px(cx,4+i,3+i,'#9e6b30');px(cx,5+i,3+i,'#7a5020');}
  }; ipFn._k='iron_pickaxe'; T3['iron_pickaxe']=makeTex(ipFn,25);

  // COAL
  const coalFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#1a1a1a';cx.fillRect(3,2,10,11);
    cx.fillStyle='#2a2a2a';cx.fillRect(4,3,8,9);
    cx.fillStyle='#383838';cx.fillRect(5,4,3,3);
    cx.fillStyle='#111';cx.fillRect(3,2,1,11);cx.fillRect(3,12,10,1);
  }; coalFn._k='coal'; T3['coal']=makeTex(coalFn,26);

  // GOLD INGOT
  const gIngFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#f0c820';cx.fillRect(2,2,12,10);
    cx.fillStyle='#ffe840';cx.fillRect(3,3,10,2);
    cx.fillStyle='#c8a010';cx.fillRect(2,10,12,2);
    cx.fillStyle='#d8b018';cx.fillRect(2,4,2,6);
    cx.fillStyle='#f8d830';cx.fillRect(12,4,2,6);
  }; gIngFn._k='gold_ingot'; T3['gold_ingot']=makeTex(gIngFn,51);

  // DIAMOND
  const diamFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#20d0e0';cx.fillRect(5,2,6,2);
    cx.fillStyle='#40e8f8';cx.fillRect(3,4,10,4);
    cx.fillStyle='#20c8d8';cx.fillRect(4,8,8,4);
    cx.fillStyle='#10a8b8';cx.fillRect(5,12,6,2);
    cx.fillStyle='#80f0ff';cx.fillRect(5,3,2,2);
  }; diamFn._k='diamond'; T3['diamond']=makeTex(diamFn,52);

  // IRON SWORD
  const iswFn=(cx,rng)=>{
    transparent(cx);
    for(let i=0;i<7;i++){px(cx,8-i,i,'#c8c8d8');px(cx,9-i,i,'#a0a0b0');}
    [3,4,5].forEach(x=>px(cx,x,7,'#7a5020'));
    for(let i=0;i<4;i++)px(cx,5,8+i,'#9e6b30');
  }; iswFn._k='iron_sword'; T3['iron_sword']=makeTex(iswFn,53);

  // IRON AXE
  const iaxFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';cx.fillRect(2,1,5,4);
    cx.fillStyle='#a0a0b0';cx.fillRect(3,2,3,3);
    for(let i=0;i<10;i++){px(cx,5+i,3+i,'#9e6b30');px(cx,6+i,3+i,'#7a5020');}
  }; iaxFn._k='iron_axe'; T3['iron_axe']=makeTex(iaxFn,54);

  // IRON SHOVEL
  const ishFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';cx.fillRect(6,1,4,5);
    cx.fillStyle='#a0a0b0';cx.fillRect(7,2,2,4);
    for(let i=0;i<9;i++){px(cx,7,5+i,'#9e6b30');px(cx,8,5+i,'#7a5020');}
  }; ishFn._k='iron_shovel'; T3['iron_shovel']=makeTex(ishFn,55);

  // WOOD SHOVEL
  const wshFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c8a060';cx.fillRect(6,1,4,5);
    cx.fillStyle='#a07840';cx.fillRect(7,2,2,4);
    for(let i=0;i<9;i++){px(cx,7,5+i,'#9e6b30');px(cx,8,5+i,'#7a5020');}
  }; wshFn._k='wooden_shovel'; T3['wooden_shovel']=makeTex(wshFn,56);

  // STONE SHOVEL
  const sshFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#989898';cx.fillRect(6,1,4,5);
    cx.fillStyle='#787878';cx.fillRect(7,2,2,4);
    for(let i=0;i<9;i++){px(cx,7,5+i,'#9e6b30');px(cx,8,5+i,'#7a5020');}
  }; sshFn._k='stone_shovel'; T3['stone_shovel']=makeTex(sshFn,57);

  // STONE AXE
  const saxFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#989898';cx.fillRect(2,1,5,4);
    cx.fillStyle='#787878';cx.fillRect(3,2,3,3);
    for(let i=0;i<10;i++){px(cx,5+i,3+i,'#9e6b30');px(cx,6+i,3+i,'#7a5020');}
  }; saxFn._k='stone_axe'; T3['stone_axe']=makeTex(saxFn,58);

  // IRON HOE
  const ihoFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';cx.fillRect(2,2,7,2);cx.fillRect(2,2,2,4);
    for(let i=0;i<10;i++){px(cx,5+i,4+i,'#9e6b30');px(cx,6+i,4+i,'#7a5020');}
  }; ihoFn._k='iron_hoe'; T3['iron_hoe']=makeTex(ihoFn,59);

  // WOOD HOE
  const whoFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c8a060';cx.fillRect(2,2,7,2);cx.fillRect(2,2,2,4);
    for(let i=0;i<10;i++){px(cx,5+i,4+i,'#9e6b30');px(cx,6+i,4+i,'#7a5020');}
  }; whoFn._k='wooden_hoe'; T3['wooden_hoe']=makeTex(whoFn,60);

  // STONE HOE
  const shoFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#989898';cx.fillRect(2,2,7,2);cx.fillRect(2,2,2,4);
    for(let i=0;i<10;i++){px(cx,5+i,4+i,'#9e6b30');px(cx,6+i,4+i,'#7a5020');}
  }; shoFn._k='stone_hoe'; T3['stone_hoe']=makeTex(shoFn,61);

  // DIAMOND PICK
  const dpFn=(cx,rng)=>{
    transparent(cx);
    for(let x=1;x<9;x++)px(cx,x,1,'#20d8e8');
    [1,8].forEach(x=>{px(cx,x,2,'#20d8e8');px(cx,x,3,'#10b8c8');});
    for(let i=0;i<10;i++){px(cx,4+i,3+i,'#9e6b30');px(cx,5+i,3+i,'#7a5020');}
  }; dpFn._k='diamond_pickaxe'; T3['diamond_pickaxe']=makeTex(dpFn,62);

  // DIAMOND SWORD
  const dswFn=(cx,rng)=>{
    transparent(cx);
    for(let i=0;i<7;i++){px(cx,8-i,i,'#20d8e8');px(cx,9-i,i,'#10b8c8');}
    [3,4,5].forEach(x=>px(cx,x,7,'#7a5020'));
    for(let i=0;i<4;i++)px(cx,5,8+i,'#9e6b30');
  }; dswFn._k='diamond_sword'; T3['diamond_sword']=makeTex(dswFn,63);

  // IRON HELMET
  const ihelFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';cx.fillRect(2,2,12,5);cx.fillRect(2,7,2,4);cx.fillRect(12,7,2,4);
    cx.fillStyle='#a0a0b0';cx.fillRect(3,3,10,3);
    cx.fillStyle='#8080a0';cx.fillRect(4,6,8,1);
  }; ihelFn._k='iron_helmet'; T3['iron_helmet']=makeTex(ihelFn,70);

  // IRON CHESTPLATE
  const ichFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';cx.fillRect(2,1,4,3);cx.fillRect(6,1,4,3);cx.fillRect(10,1,4,3);
    cx.fillRect(1,4,14,10);
    cx.fillStyle='#a0a0b0';cx.fillRect(2,5,12,8);
    cx.fillStyle='#8080a0';cx.fillRect(7,2,2,2);
  }; ichFn._k='iron_chestplate'; T3['iron_chestplate']=makeTex(ichFn,71);

  // IRON LEGGINGS
  const ilegFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';cx.fillRect(1,1,14,5);
    cx.fillRect(1,6,6,9);cx.fillRect(9,6,6,9);
    cx.fillStyle='#a0a0b0';cx.fillRect(2,2,12,3);
  }; ilegFn._k='iron_leggings'; T3['iron_leggings']=makeTex(ilegFn,72);

  // IRON BOOTS
  const ibotFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';cx.fillRect(2,2,5,8);cx.fillRect(9,2,5,8);
    cx.fillRect(2,9,5,3);cx.fillRect(9,9,6,3);
    cx.fillStyle='#a0a0b0';cx.fillRect(3,3,3,6);cx.fillRect(10,3,3,6);
  }; ibotFn._k='iron_boots'; T3['iron_boots']=makeTex(ibotFn,73);

  // BOW
  const bowFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#9e6b30';
    for(let i=0;i<12;i++)px(cx,2+i,1+i,'#9e6b30');
    cx.fillStyle='#c8c8d8';
    px(cx,3,1,'#c8c8d8');px(cx,3,13,'#c8c8d8');
    for(let i=0;i<13;i++)px(cx,4,1+i,'#c8c8d8');
    px(cx,13,8,'#c8c8d8');
  }; bowFn._k='bow'; T3['bow']=makeTex(bowFn,74);

  // ARROW
  const arrowFn=(cx,rng)=>{
    transparent(cx);
    for(let i=0;i<11;i++)px(cx,2+i,2+i,'#9e6b30');
    px(cx,1,3,'#4a4a4a');px(cx,2,2,'#4a4a4a');px(cx,3,1,'#4a4a4a');
    px(cx,12,12,'#f0e0d0');px(cx,13,13,'#f0e0d0');px(cx,13,12,'#e0d0c0');
  }; arrowFn._k='arrow'; T3['arrow']=makeTex(arrowFn,75);

  // BREAD
  const breadFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c8840c';cx.fillRect(2,4,12,8);
    cx.fillStyle='#e8a020';cx.fillRect(3,3,10,2);cx.fillRect(3,9,10,2);
    cx.fillStyle='#d89018';cx.fillRect(2,5,12,4);
    cx.fillStyle='#b87010';cx.fillRect(2,4,1,8);cx.fillRect(13,4,1,8);
  }; breadFn._k='bread'; T3['bread']=makeTex(breadFn,76);

  // APPLE
  const appleFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c82010';cx.fillRect(4,3,8,10);
    cx.fillStyle='#e03020';cx.fillRect(5,2,6,11);cx.fillRect(3,5,10,6);
    cx.fillStyle='#f04030';cx.fillRect(6,4,3,3);
    cx.fillStyle='#40a020';cx.fillRect(7,1,2,2);px(cx,6,2,'#30c010');
    cx.fillStyle='rgba(255,255,255,0.4)';cx.fillRect(6,4,2,2);
  }; appleFn._k='apple'; T3['apple']=makeTex(appleFn,77);

  // TORCH
  const torchFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#9e6b30';cx.fillRect(7,9,2,6);
    cx.fillStyle='#8b5c20';px(cx,7,9,1);px(cx,8,9,1);
    cx.fillStyle='#ffd020';cx.fillRect(6,6,4,4);
    cx.fillStyle='#ff8800';cx.fillRect(7,4,2,4);
    cx.fillStyle='#ffff80';px(cx,7,4,1);px(cx,8,4,1);
  }; torchFn._k='torch'; T3['torch']=makeTex(torchFn,78);

  // TORCH BLOCK (face)
  const torchBlockFn=(cx,rng)=>{
    cx.clearRect(0,0,16,16);
    cx.fillStyle='#9e6b30';cx.fillRect(7,8,2,8);
    cx.fillStyle='#ffd020';cx.fillRect(6,5,4,4);
    cx.fillStyle='#ff8800';cx.fillRect(7,2,2,4);
    cx.fillStyle='#ffff80';px(cx,7,2,1);px(cx,8,2,1);
  }; torchBlockFn._k='torch_block'; T3['torch_block']=makeTex(torchBlockFn,79);

  // LADDER
  const ladFn=(cx,rng)=>{
    cx.clearRect(0,0,16,16);
    cx.fillStyle='#9e6b30';
    cx.fillRect(2,0,2,16);cx.fillRect(12,0,2,16);
    [2,6,10,14].forEach(y=>cx.fillRect(2,y,12,2));
  }; ladFn._k='ladder'; T3['ladder']=makeTex(ladFn,80);

  // SIGN
  const signFn=(cx,rng)=>{
    fill(cx,'#c8a060');
    [3,4,7,8].forEach(y=>row(cx,y,'#a07840'));
    cx.fillStyle='#f0d880';cx.fillRect(1,1,14,8);
    cx.fillStyle='#d0b860';cx.fillRect(1,9,14,1);
    cx.fillStyle='#c8a060';cx.fillRect(7,10,2,6);
  }; signFn._k='oak_sign'; T3['oak_sign']=makeTex(signFn,81);

  // SUGAR CANE
  const scFn=(cx,rng)=>{
    cx.clearRect(0,0,16,16);
    const c=['#48c020','#38a018','#50d028','#40b020'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      if(x>=5&&x<=10)px(cx,x,y,c[Math.floor(rng()*c.length)]);
    }
    cx.fillStyle='#30801a';cx.fillRect(5,4,6,1);cx.fillRect(5,9,6,1);cx.fillRect(5,13,6,1);
  }; scFn._k='sugar_cane'; T3['sugar_cane']=makeTex(scFn,82);

  // PAPER
  const papFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#f0f0e0';cx.fillRect(1,2,14,12);
    cx.fillStyle='#e0e0d0';cx.fillRect(2,3,12,10);
    cx.fillStyle='#a0a090';
    [5,7,9].forEach(y=>cx.fillRect(3,y,10,1));
    cx.fillStyle='#c0c0b0';cx.fillRect(1,2,1,12);cx.fillRect(14,2,1,12);
  }; papFn._k='paper'; T3['paper']=makeTex(papFn,83);

  // BOOK
  const bookFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#8b4020';cx.fillRect(2,1,12,14);
    cx.fillStyle='#a05030';cx.fillRect(3,2,10,12);
    cx.fillStyle='#c06040';cx.fillRect(4,3,8,10);
    cx.fillStyle='#f0e0c0';cx.fillRect(5,4,6,8);
    cx.fillStyle='#d0c0a0';[6,8,10].forEach(y=>cx.fillRect(5,y,6,1));
    cx.fillStyle='#8b4020';cx.fillRect(7,1,2,14);
  }; bookFn._k='book'; T3['book']=makeTex(bookFn,84);

  // CLOCK ITEM
  const clkFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#f0c820';cx.fillRect(2,2,12,12);
    cx.fillStyle='#d8b018';cx.fillRect(3,3,10,10);
    cx.fillStyle='#ff4020';cx.fillRect(7,7,2,4);
    cx.fillStyle='#404040';cx.fillRect(7,4,2,3);
    cx.fillStyle='#f0f0f0';cx.fillRect(6,6,4,4);
    cx.fillStyle='#202020';cx.fillRect(7,7,2,2);
  }; clkFn._k='clock'; T3['clock']=makeTex(clkFn,85);

  // COMPASS
  const compFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#a0a0a0';cx.fillRect(2,2,12,12);
    cx.fillStyle='#888';cx.fillRect(3,3,10,10);
    cx.fillStyle='#f0f0f0';cx.fillRect(5,3,6,5);
    cx.fillStyle='#e03020';cx.fillRect(5,8,6,5);
    cx.fillStyle='#202020';cx.fillRect(7,7,2,2);
  }; compFn._k='compass'; T3['compass']=makeTex(compFn,86);

  // DOOR (wood)
  const doorFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#a07040';cx.fillRect(2,0,12,16);
    cx.fillStyle='#c89050';cx.fillRect(3,1,10,6);cx.fillRect(3,9,10,6);
    cx.fillStyle='#e8b060';cx.fillRect(4,2,8,4);cx.fillRect(4,10,8,4);
    cx.fillStyle='#d4a070';cx.fillRect(11,7,2,2);
  }; doorFn._k='oak_door'; T3['oak_door']=makeTex(doorFn,87);

  // IRON DOOR
  const idoorFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#b0b0c0';cx.fillRect(2,0,12,16);
    cx.fillStyle='#d0d0e0';cx.fillRect(3,1,10,6);cx.fillRect(3,9,10,6);
    cx.fillStyle='#e0e0f0';cx.fillRect(4,2,8,4);cx.fillRect(4,10,8,4);
    cx.fillStyle='#c0c0d0';cx.fillRect(11,7,2,2);
  }; idoorFn._k='iron_door'; T3['iron_door']=makeTex(idoorFn,88);

  // GOLDEN SWORD
  const gswFn=(cx,rng)=>{
    transparent(cx);
    for(let i=0;i<7;i++){px(cx,8-i,i,'#f8e040');px(cx,9-i,i,'#d8b820');}
    [3,4,5].forEach(x=>px(cx,x,7,'#7a5020'));
    for(let i=0;i<4;i++)px(cx,5,8+i,'#9e6b30');
  }; gswFn._k='golden_sword'; T3['golden_sword']=makeTex(gswFn,89);

  // GOLDEN PICK
  const gpkFn=(cx,rng)=>{
    transparent(cx);
    for(let x=1;x<9;x++)px(cx,x,1,'#f8e040');
    [1,8].forEach(x=>{px(cx,x,2,'#f8e040');px(cx,x,3,'#d8b820');});
    for(let i=0;i<10;i++){px(cx,4+i,3+i,'#9e6b30');px(cx,5+i,3+i,'#7a5020');}
  }; gpkFn._k='golden_pickaxe'; T3['golden_pickaxe']=makeTex(gpkFn,90);

  // BUCKET (empty)
  const bucFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';
    cx.fillRect(3,6,10,8);cx.fillRect(2,7,12,6);
    cx.fillStyle='#a0a0b0';cx.fillRect(3,12,10,2);cx.fillRect(2,8,1,6);cx.fillRect(13,8,1,6);
    cx.fillStyle='#d0d0e0';cx.fillRect(5,5,6,2);cx.fillRect(3,6,1,2);cx.fillRect(12,6,1,2);
    cx.fillRect(6,3,4,2);
  }; bucFn._k='bucket'; T3['bucket']=makeTex(bucFn,91);

  // WATER BUCKET
  const wbucFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';
    cx.fillRect(3,6,10,8);cx.fillRect(2,7,12,6);
    cx.fillStyle='#2060d0';cx.fillRect(3,9,10,5);cx.fillRect(2,10,12,4);
    cx.fillStyle='#a0a0b0';cx.fillRect(3,12,10,2);cx.fillRect(2,8,1,6);cx.fillRect(13,8,1,6);
    cx.fillStyle='#d0d0e0';cx.fillRect(5,5,6,2);cx.fillRect(6,3,4,2);
  }; wbucFn._k='water_bucket'; T3['water_bucket']=makeTex(wbucFn,92);

  // LEATHER ARMOR (boots texture)
  const leatFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#8b4a20';cx.fillRect(2,2,5,8);cx.fillRect(9,2,5,8);
    cx.fillRect(2,9,5,3);cx.fillRect(9,9,6,3);
    cx.fillStyle='#a06030';cx.fillRect(3,3,3,6);cx.fillRect(10,3,3,6);
  }; leatFn._k='leather_boots'; T3['leather_boots']=makeTex(leatFn,93);

  // FLINT
  const flintFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#303030';cx.fillRect(4,2,8,12);cx.fillRect(3,4,10,8);
    cx.fillStyle='#484848';cx.fillRect(5,3,6,10);cx.fillRect(4,5,8,6);
    cx.fillStyle='#606060';cx.fillRect(6,5,3,3);
  }; flintFn._k='flint'; T3['flint']=makeTex(flintFn,94);

  // FLINT & STEEL
  const flstFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#303030';cx.fillRect(2,8,6,6);cx.fillRect(3,7,4,8);
    cx.fillStyle='#c0c0d0';cx.fillRect(7,2,7,7);cx.fillRect(6,3,8,5);
    cx.fillStyle='#e0e0f0';cx.fillRect(8,3,4,4);
    cx.fillStyle='#ff8000';px(cx,6,7,1);px(cx,7,8,1);
  }; flstFn._k='flint_and_steel'; T3['flint_and_steel']=makeTex(flstFn,95);

  // SADDLE
  const sadFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#8b2010';cx.fillRect(2,4,12,8);cx.fillRect(4,2,8,4);
    cx.fillStyle='#6b1800';cx.fillRect(3,5,10,6);
    cx.fillStyle='#c04020';cx.fillRect(5,3,6,3);
    cx.fillStyle='#404040';[2,13].forEach(x=>cx.fillRect(x,8,2,4));
  }; sadFn._k='saddle'; T3['saddle']=makeTex(sadFn,96);

  // RAW IRON
  const rawIronFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c88050';cx.fillRect(3,2,10,11);cx.fillRect(2,4,12,7);
    cx.fillStyle='#e0a070';cx.fillRect(4,3,8,9);cx.fillRect(3,5,10,5);
    cx.fillStyle='#d09060';cx.fillRect(5,4,2,2);cx.fillRect(9,7,2,2);
    cx.fillStyle='#a06040';cx.fillRect(3,2,1,11);cx.fillRect(3,12,10,1);
  }; rawIronFn._k='raw_iron'; T3['raw_iron']=makeTex(rawIronFn,110);

  // RAW GOLD
  const rawGoldFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#d4a820';cx.fillRect(3,2,10,11);cx.fillRect(2,4,12,7);
    cx.fillStyle='#f0c830';cx.fillRect(4,3,8,9);cx.fillRect(3,5,10,5);
    cx.fillStyle='#ffe050';cx.fillRect(5,4,2,2);cx.fillRect(9,7,2,2);
    cx.fillStyle='#a08010';cx.fillRect(3,2,1,11);cx.fillRect(3,12,10,1);
  }; rawGoldFn._k='raw_gold'; T3['raw_gold']=makeTex(rawGoldFn,111);
  const shearFn=(cx,rng)=>{
    transparent(cx);
    cx.fillStyle='#c0c0d0';
    for(let i=0;i<6;i++){px(cx,4+i,2+i,'#c0c0d0');px(cx,3+i,3+i,'#c0c0d0');}
    for(let i=0;i<6;i++){px(cx,8+i,8+i,'#c0c0d0');px(cx,9+i,7+i,'#c0c0d0');}
    cx.fillStyle='#808090';px(cx,8,7,1);px(cx,7,8,1);
    cx.fillStyle='#f0f0f0';px(cx,5,3,1);px(cx,10,9,1);
  }; shearFn._k='shears'; T3['shears']=makeTex(shearFn,97);
}

function getTex(name){ return T3[name] || T3['stone']; }



function mkCanvas(id, sz) {
  const cv = document.createElement('canvas'); cv.width = cv.height = sz;
  const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
  const key = typeof id === 'string' ? id : (BLOCKS[id]?.icon || BLOCKS[id]?.tTop || 'dirt');
  const src = IMGS[key];
  if(src) cx.drawImage(src, 0, 0, sz, sz);
  else { cx.fillStyle='#f0f'; cx.fillRect(0,0,sz,sz); }
  return cv;
}
