'use strict';

// ════════════════════════════════════════════════
// RECIPES — vanilla Minecraft (3x3 grid, 0 = vide)
// Conventions de grille: indices 0-8 = rangées gauche→droite, haut→bas
// ════════════════════════════════════════════════
const RECIPES = [
  // === BASIQUES ===
  {name:'Oak Planks ×4',      g:[5,0,0,  0,0,0,  0,0,0],               r:7, n:4},
  // Bâton : 2 planches en colonne centrale ← CORRIGÉ
  {name:'Stick ×4',         g:[0,7,0,  0,7,0,  0,0,0],               r:'stick', n:4},
  {name:'Crafting Table',           g:[7,7,0,  7,7,0,  0,0,0],               r:11, n:1},
  {name:'Furnace',             g:[8,8,8,  8,0,8,  8,8,8],               r:21, n:1},
  {name:'Chest',           g:[7,7,7,  7,0,7,  7,7,7],               r:27, n:1},

  // === OUTILS BOIS ===
  {name:'Wooden Sword',        g:[0,7,0,  0,7,0,  0,'stick',0],          r:'wooden_sword', n:1},
  {name:'Wooden Pickaxe',      g:[7,7,7,  0,'stick',0,  0,'stick',0],    r:'wooden_pickaxe', n:1},
  {name:'Wooden Axe',       g:[7,7,0,  7,'stick',0,  0,'stick',0],    r:'wooden_axe', n:1},
  {name:'Wooden Shovel',       g:[0,7,0,  0,'stick',0,  0,'stick',0],    r:'wooden_shovel', n:1},
  {name:'Wooden Hoe',        g:[7,7,0,  0,'stick',0,  0,'stick',0],    r:'wooden_hoe', n:1},

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
  {name:'Bookshelf',     g:[7,7,7,  'book','book','book',  7,7,7], r:17, n:1},
  {name:'TNT',              g:['coal',4,'coal',  4,'coal',4,  'coal',4,'coal'],         r:18, n:1},
  {name:'White Wool',         g:[7,7,0,  7,7,0,  0,0,0],               r:19, n:1},

  // === UTILITAIRES ===
  {name:'Torch ×4',        g:[0,'coal',0,  0,'stick',0,  0,0,0],     r:'torch', n:4},
  {name:'Ladder ×3',       g:['stick',0,'stick',  'stick','stick','stick',  'stick',0,'stick'], r:'ladder', n:3},
  {name:'Oak Sign ×3',       g:[7,7,7,  7,7,7,  0,'stick',0],          r:'oak_sign', n:3},
  {name:'Oak Door ×3',    g:[7,7,0,  7,7,0,  7,7,0],               r:'oak_door', n:3},
  {name:'Iron Door ×3',     g:['iron_ingot','iron_ingot',0,  'iron_ingot','iron_ingot',0,  'iron_ingot','iron_ingot',0], r:'iron_door', n:3},
  {name:'Bucket',             g:['iron_ingot',0,'iron_ingot',  0,'iron_ingot',0,  0,0,0], r:'bucket', n:1},
  {name:'Flint and Steel',          g:['iron_ingot','flint',0,  0,0,0,  0,0,0],                  r:'flint_and_steel', n:1},
  {name:'Shears',        g:[0,'iron_ingot',0,  'iron_ingot',0,0,  0,0,0],             r:'shears', n:1},
  {name:'Rail ×16',         g:['iron_ingot',0,'iron_ingot',  'iron_ingot','stick','iron_ingot',  'iron_ingot',0,'iron_ingot'], r:'rail', n:16},
  {name:'Minecart',         g:[0,0,0,  'iron_ingot',0,'iron_ingot',  'iron_ingot','iron_ingot','iron_ingot'], r:'minecart', n:1},
  {name:'Oak Boat',           g:[7,0,7,  7,7,7,  0,0,0],               r:'oak_boat', n:1},
  {name:'Oak Fence ×3',       g:['stick','stick','stick',  'stick','stick','stick',  0,0,0], r:'oak_fence', n:3},
  {name:'Oak Fence Gate',    g:[0,'stick',0,  0,'stick',0,  0,'stick',0], r:'oak_fence_gate', n:1},
  {name:'Stone Slab ×6',  g:[0,0,0,  0,0,0,  8,8,8],               r:'stone_slab', n:6},
  {name:'Oak Slab ×6',g:[0,0,0,  0,0,0,  7,7,7],               r:'oak_slab', n:6},
  {name:'Stone Stairs ×4',g:[8,0,0, 8,8,0,  8,8,8],               r:'stone_stairs', n:4},
  {name:'Oak Stairs ×4', g:[7,0,0,  7,7,0,  7,7,7],               r:'oak_stairs', n:4},
  {name:'Block of Iron',      g:['iron_ingot','iron_ingot','iron_ingot',  'iron_ingot','iron_ingot','iron_ingot',  'iron_ingot','iron_ingot','iron_ingot'], r:'iron_block', n:1},
  {name:'Block of Gold',       g:['gold_ingot','gold_ingot','gold_ingot',  'gold_ingot','gold_ingot','gold_ingot',  'gold_ingot','gold_ingot','gold_ingot'], r:'gold_block', n:1},
  {name:'Block of Diamond',  g:['diamond','diamond','diamond',  'diamond','diamond','diamond',  'diamond','diamond','diamond'], r:'diamond_block', n:1},

  // === PAPIER / LIVRES ===
  {name:'Paper ×3',        g:[0,0,0,  'sugar_cane','sugar_cane','sugar_cane',  0,0,0],  r:'paper', n:3},
  {name:'Book',            g:[0,'paper',0,  0,'paper',0,  0,'paper',0],                  r:'book', n:1},

  // === NOURRITURE ===
  {name:'Bread',             g:[0,0,0,  0,0,0,  'wheat','wheat','wheat'],                 r:'bread', n:1},
];
