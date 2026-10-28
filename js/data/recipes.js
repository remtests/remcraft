'use strict';

// ════════════════════════════════════════════════
// RECIPES — vanilla Minecraft (3x3 grid, 0 = vide)
// Conventions de grille: indices 0-8 = rangées gauche→droite, haut→bas
// Ingrédient '#planks' = n'importe quelles planches (toutes essences) ; voir PLANKS_IDS plus bas.
// Règle : une recette n'existe que si tous ses ingrédients et son résultat existent (bloc de BLOCKS, ou objet avec texture).
// ════════════════════════════════════════════════
const RECIPES = [
  // === BASIQUES ===
  {name:'Oak Planks ×4',      g:[5,0,0,  0,0,0,  0,0,0],               r:7, n:4},
  // Bâton : 2 planches (n'importe quelle essence) en colonne centrale
  {name:'Stick ×4',         g:[0,'#planks',0,  0,'#planks',0,  0,0,0],               r:'stick', n:4},
  {name:'Crafting Table',           g:['#planks','#planks',0,  '#planks','#planks',0,  0,0,0],               r:11, n:1},
  {name:'Furnace',             g:[8,8,8,  8,0,8,  8,8,8],               r:21, n:1},
  {name:'Chest',           g:['#planks','#planks','#planks',  '#planks',0,'#planks',  '#planks','#planks','#planks'],               r:27, n:1},

  // === OUTILS BOIS ===
  {name:'Wooden Sword',        g:[0,'#planks',0,  0,'#planks',0,  0,'stick',0],          r:'wooden_sword', n:1},
  {name:'Wooden Pickaxe',      g:['#planks','#planks','#planks',  0,'stick',0,  0,'stick',0],    r:'wooden_pickaxe', n:1},
  {name:'Wooden Axe',       g:['#planks','#planks',0,  '#planks','stick',0,  0,'stick',0],    r:'wooden_axe', n:1},
  {name:'Wooden Shovel',       g:[0,'#planks',0,  0,'stick',0,  0,'stick',0],    r:'wooden_shovel', n:1},
  {name:'Wooden Hoe',        g:['#planks','#planks',0,  0,'stick',0,  0,'stick',0],    r:'wooden_hoe', n:1},

  // === OUTILS PIERRE ===
  {name:'Stone Sword',      g:[0,8,0,  0,8,0,  0,'stick',0],          r:'stone_sword', n:1},
  {name:'Stone Pickaxe',    g:[8,8,8,  0,'stick',0,  0,'stick',0],    r:'stone_pickaxe', n:1},
  {name:'Stone Axe',     g:[8,8,0,  8,'stick',0,  0,'stick',0],    r:'stone_axe', n:1},
  {name:'Stone Shovel',     g:[0,8,0,  0,'stick',0,  0,'stick',0],    r:'stone_shovel', n:1},
  {name:'Stone Hoe',      g:[8,8,0,  0,'stick',0,  0,'stick',0],    r:'stone_hoe', n:1},

  // === OUTILS FER ===
  {name:'Iron Sword',         g:[0,'iron_ingot',0,  0,'iron_ingot',0,  0,'stick',0],     r:'iron_sword', n:1},
  {name:'Iron Pickaxe',       g:['iron_ingot','iron_ingot','iron_ingot',  0,'stick',0,  0,'stick',0], r:'iron_pickaxe', n:1},
  {name:'Iron Axe',        g:['iron_ingot','iron_ingot',0,  'iron_ingot','stick',0,  0,'stick',0], r:'iron_axe', n:1},
  {name:'Iron Shovel',        g:[0,'iron_ingot',0,  0,'stick',0,  0,'stick',0],           r:'iron_shovel', n:1},
  {name:'Iron Hoe',         g:['iron_ingot','iron_ingot',0,  0,'stick',0,  0,'stick',0],r:'iron_hoe',   n:1},

  // === OUTILS OR ===
  {name:'Golden Sword',          g:[0,'gold_ingot',0,  0,'gold_ingot',0,  0,'stick',0],      r:'golden_sword', n:1},
  {name:'Golden Pickaxe',        g:['gold_ingot','gold_ingot','gold_ingot',  0,'stick',0,  0,'stick',0], r:'golden_pickaxe', n:1},
  {name:'Golden Axe',         g:['gold_ingot','gold_ingot',0,  'gold_ingot','stick',0,  0,'stick',0], r:'golden_axe', n:1},
  {name:'Golden Shovel',         g:[0,'gold_ingot',0,  0,'stick',0,  0,'stick',0],            r:'golden_shovel', n:1},
  {name:'Golden Hoe',          g:['gold_ingot','gold_ingot',0,  0,'stick',0,  0,'stick',0], r:'golden_hoe', n:1},

  // === OUTILS DIAMANT ===
  {name:'Diamond Sword',     g:[0,'diamond',0,  0,'diamond',0,  0,'stick',0],              r:'diamond_sword', n:1},
  {name:'Diamond Pickaxe',   g:['diamond','diamond','diamond',  0,'stick',0,  0,'stick',0], r:'diamond_pickaxe', n:1},
  {name:'Diamond Axe',    g:['diamond','diamond',0,  'diamond','stick',0,  0,'stick',0], r:'diamond_axe', n:1},
  {name:'Diamond Shovel',    g:[0,'diamond',0,  0,'stick',0,  0,'stick',0],                 r:'diamond_shovel', n:1},
  {name:'Diamond Hoe',     g:['diamond','diamond',0,  0,'stick',0,  0,'stick',0],          r:'diamond_hoe', n:1},

  // === ARMURE FER ===
  {name:'Iron Helmet',       g:['iron_ingot','iron_ingot','iron_ingot',  'iron_ingot',0,'iron_ingot',  0,0,0],            r:'iron_helmet', n:1},
  {name:'Iron Chestplate',     g:['iron_ingot',0,'iron_ingot',  'iron_ingot','iron_ingot','iron_ingot',  'iron_ingot','iron_ingot','iron_ingot'], r:'iron_chestplate', n:1},
  {name:'Iron Leggings',    g:['iron_ingot','iron_ingot','iron_ingot',  'iron_ingot',0,'iron_ingot',  'iron_ingot',0,'iron_ingot'],            r:'iron_leggings', n:1},
  {name:'Iron Boots',       g:[0,0,0,  'iron_ingot',0,'iron_ingot',  'iron_ingot',0,'iron_ingot'],                       r:'iron_boots', n:1},

  // === ARMURE OR ===
  {name:'Golden Helmet',        g:['gold_ingot','gold_ingot','gold_ingot',  'gold_ingot',0,'gold_ingot',  0,0,0],            r:'golden_helmet', n:1},
  {name:'Golden Chestplate',      g:['gold_ingot',0,'gold_ingot',  'gold_ingot','gold_ingot','gold_ingot',  'gold_ingot','gold_ingot','gold_ingot'], r:'golden_chestplate', n:1},
  {name:'Golden Leggings',     g:['gold_ingot','gold_ingot','gold_ingot',  'gold_ingot',0,'gold_ingot',  'gold_ingot',0,'gold_ingot'],            r:'golden_leggings', n:1},
  {name:'Golden Boots',        g:[0,0,0,  'gold_ingot',0,'gold_ingot',  'gold_ingot',0,'gold_ingot'],                       r:'golden_boots', n:1},

  // === ARMURE DIAMANT ===
  {name:'Diamond Helmet',   g:['diamond','diamond','diamond',  'diamond',0,'diamond',  0,0,0],                            r:'diamond_helmet', n:1},
  {name:'Diamond Chestplate', g:['diamond',0,'diamond',  'diamond','diamond','diamond',  'diamond','diamond','diamond'],     r:'diamond_chestplate', n:1},
  {name:'Diamond Leggings',g:['diamond','diamond','diamond',  'diamond',0,'diamond',  'diamond',0,'diamond'],             r:'diamond_leggings', n:1},
  {name:'Diamond Boots',   g:[0,0,0,  'diamond',0,'diamond',  'diamond',0,'diamond'],                                    r:'diamond_boots', n:1},

  // === COMBAT ===
  {name:'Bow',              g:[0,'stick','iron_ingot',  'stick',0,'iron_ingot',  0,'stick','iron_ingot'], r:'bow', n:1},
  {name:'Arrow ×4',        g:[0,'flint',0,  0,'stick',0,  0,7,0],                                        r:'arrow', n:4},

  // === BLOCS CONSTRUCTION ===
  {name:'Glass ×8',         g:[3,3,3,  3,0,3,  3,3,3],               r:14, n:8},
  {name:'Bookshelf',     g:['#planks','#planks','#planks',  'book','book','book',  '#planks','#planks','#planks'], r:17, n:1},
  {name:'TNT',              g:['coal',4,'coal',  4,'coal',4,  'coal',4,'coal'],         r:18, n:1},
  {name:'White Wool',         g:[7,7,0,  7,7,0,  0,0,0],               r:19, n:1},

  // === UTILITAIRES ===
  {name:'Torch ×4',        g:[0,'coal',0,  0,'stick',0,  0,0,0],     r:'torch', n:4},
  {name:'Oak Sign ×3',       g:[7,7,7,  7,7,7,  0,'stick',0],          r:'oak_sign', n:3},
  {name:'Oak Door ×3',    g:[7,7,0,  7,7,0,  7,7,0],               r:'oak_door', n:3},
  {name:'Iron Door ×3',     g:['iron_ingot','iron_ingot',0,  'iron_ingot','iron_ingot',0,  'iron_ingot','iron_ingot',0], r:'iron_door', n:3},
  {name:'Bucket',             g:['iron_ingot',0,'iron_ingot',  0,'iron_ingot',0,  0,0,0], r:'bucket', n:1},
  {name:'Flint and Steel',          g:['iron_ingot','flint',0,  0,0,0,  0,0,0],                  r:'flint_and_steel', n:1},
  {name:'Shears',        g:[0,'iron_ingot',0,  'iron_ingot',0,0,  0,0,0],             r:'shears', n:1},

  // === PAPIER / LIVRES ===
  {name:'Paper ×3',        g:[0,0,0,  'sugar_cane','sugar_cane','sugar_cane',  0,0,0],  r:'paper', n:3},
  {name:'Book',            g:[0,'paper',0,  0,'paper',0,  0,'paper',0],                  r:'book', n:1},

  // === NOURRITURE ===
  {name:'Bread',             g:[0,0,0,  0,0,0,  'wheat','wheat','wheat'],                 r:'bread', n:1},
];

// ════════════════════════════════════════════════
// Blocs ajoutés (textures v2) — uniquement les recettes dont tous les ingrédients et le résultat existent déjà
// ════════════════════════════════════════════════
const PLANKS_IDS = new Uint8Array(256);   // id → 1 si planches (étiquette '#planks')
for(const id in BLOCKS) if(/_planks$/.test(BLOCKS[id].sid)) PLANKS_IDS[id] = 1;
{
  const q = (a) => [a,a,0,  a,a,0,  0,0,0];                 // 2×2 (tient aussi dans la grille de l'inventaire)
  const all9 = (a) => [a,a,a,  a,a,a,  a,a,a];
  ['spruce','birch','jungle','acacia','dark_oak'].forEach(w => {   // bûche → 4 planches de la même essence
    const N = w.split('_').map(x => x[0].toUpperCase()+x.slice(1)).join(' ');
    RECIPES.push({name:N+' Planks ×4', g:[BID(w+'_log'),0,0,  0,0,0,  0,0,0], r:BID(w+'_planks'), n:4});
  });
  ['granite','diorite','andesite'].forEach(k => {                    // 2×2 de pierre → 4 pierres polies
    const N = k[0].toUpperCase()+k.slice(1);
    RECIPES.push({name:'Polished '+N+' ×4', g:q(BID(k)), r:BID('polished_'+k), n:4});
  });
  RECIPES.push({name:'Sandstone',     g:q(4),             r:BID('sandstone'),     n:1});
  RECIPES.push({name:'Red Sandstone', g:q(BID('red_sand')), r:BID('red_sandstone'), n:1});
  RECIPES.push({name:'Dripstone Block', g:q(BID('pointed_dripstone')), r:BID('dripstone_block'), n:1});
  RECIPES.push({name:'Block of Coal',  g:all9('coal'),     r:BID('coal_block'),    n:1});
  RECIPES.push({name:'Coal ×9',        g:[BID('coal_block'),0,0,  0,0,0,  0,0,0], r:'coal', n:9});
  [['Iron','iron_ingot'],['Gold','gold_ingot'],['Diamond','diamond']].forEach(([N, item]) => {   // 9 lingots / diamants ⇄ bloc
    RECIPES.push({name:'Block of '+N, g:all9(item), r:BID(N.toLowerCase()+'_block'), n:1});
    RECIPES.push({name:N+(N==='Diamond' ? 's' : ' Ingots')+' ×9', g:[BID(N.toLowerCase()+'_block'),0,0,  0,0,0,  0,0,0], r:item, n:9});
  });
  RECIPES.push({name:'Packed Ice',     g:all9(BID('ice')),         r:BID('packed_ice'), n:1});
  RECIPES.push({name:'Blue Ice',       g:all9(BID('packed_ice')),  r:BID('blue_ice'),   n:1});
}
