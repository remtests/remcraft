'use strict';

// ════════════════════════════════════════════════
// BLOCK & ITEM DEFINITIONS
// ════════════════════════════════════════════════
const BLOCKS = {
  1:{name:'Grass Block', sid:'grass_block',       tTop:'grass_top', tSide:'grass_side', tBot:'dirt',       hard:1,   drop:2,         needsPick:0, isCraft:false},
  2:{name:'Dirt', sid:'dirt',       tTop:'dirt',      tSide:'dirt',       tBot:'dirt',       hard:1,   drop:2,         needsPick:0, isCraft:false},
  3:{name:'Stone', sid:'stone',      tTop:'stone',     tSide:'stone',      tBot:'stone',      hard:3,   drop:8,         needsPick:0, isCraft:false},
  4:{name:'Sand', sid:'sand',       tTop:'sand',      tSide:'sand',       tBot:'sand',       hard:1,   drop:4,         needsPick:0, isCraft:false},
  5:{name:'Oak Log', sid:'oak_log',        tTop:'log_top',   tSide:'log_side',   tBot:'log_top',    hard:2,   drop:5,         needsPick:0, isCraft:false},
  6:{name:'Oak Leaves', sid:'oak_leaves',    tTop:'leaves',    tSide:'leaves',     tBot:'leaves',     hard:.4,  drop:null,      needsPick:0, isCraft:false},
  7:{name:'Oak Planks', sid:'oak_planks',    tTop:'planks',    tSide:'planks',     tBot:'planks',     hard:1.5, drop:7,         needsPick:0, isCraft:false},
  8:{name:'Cobblestone', sid:'cobblestone', tTop:'cobble',    tSide:'cobble',     tBot:'cobble',     hard:3,   drop:8,         needsPick:0, isCraft:false},
  9:{name:'Gravel', sid:'gravel',     tTop:'gravel',    tSide:'gravel',     tBot:'gravel',     hard:1,   drop:9,         needsPick:0, isCraft:false},
  10:{name:'Bedrock', sid:'bedrock',    tTop:'bedrock',   tSide:'bedrock',    tBot:'bedrock',    hard:999, drop:null,      needsPick:0, isCraft:false},
  11:{name:'Crafting Table', sid:'crafting_table',     tTop:'craft_top', tSide:'craft_side', tBot:'planks',     hard:2,   drop:11,        needsPick:0, isCraft:true},
  12:{name:'Iron Ore', sid:'iron_ore',  tTop:'iron_ore',  tSide:'iron_ore',   tBot:'iron_ore',   hard:4,   drop:'raw_iron', needsPick:1, isCraft:false},
  13:{name:'Coal Ore', sid:'coal_ore',tTop:'coal_ore', tSide:'coal_ore',   tBot:'coal_ore',   hard:3,   drop:'coal',    needsPick:1, isCraft:false},
  14:{name:'Glass', sid:'glass',      tTop:'glass',     tSide:'glass',      tBot:'glass',      hard:0.3, drop:null,      needsPick:0, isCraft:false},
  15:{name:'Gold Ore', sid:'gold_ore',   tTop:'gold_ore',  tSide:'gold_ore',   tBot:'gold_ore',   hard:4,   drop:'raw_gold', needsPick:2, isCraft:false},
  16:{name:'Diamond Ore', sid:'diamond_ore',tTop:'diamond_ore',tSide:'diamond_ore',tBot:'diamond_ore',hard:5, drop:'diamond', needsPick:2, isCraft:false},
  17:{name:'Bookshelf', sid:'bookshelf',tTop:'planks',  tSide:'bookshelf',  tBot:'planks',     hard:1.5, drop:7,         needsPick:0, isCraft:false},
  18:{name:'TNT', sid:'tnt',        tTop:'tnt_top',   tSide:'tnt_side',   tBot:'tnt_top',    hard:0,   drop:null,      needsPick:0, isCraft:false},
  19:{name:'White Wool', sid:'white_wool',      tTop:'wool',      tSide:'wool',       tBot:'wool',       hard:0.8, drop:19,        needsPick:0, isCraft:false},
  20:{name:'Torch', sid:'torch',     tTop:'torch_block',tSide:'torch_block',tBot:'torch_block',hard:0,  drop:'torch',needsPick:0,isCraft:false,noCollide:true},
  21:{name:'Furnace', sid:'furnace',       tTop:'furnace_top',tSide:'furnace_front',tBot:'stone',   hard:3.5, drop:21,        needsPick:1, isCraft:false, isFurnace:true},
  22:{name:'Cactus', sid:'cactus',     tTop:'cactus_top', tSide:'cactus_side',  tBot:'cactus_top', hard:0.4, drop:22, needsPick:0, isCraft:false},
  24:{name:'Short Grass', sid:'short_grass',  tTop:'short_grass', tSide:'short_grass', tBot:'short_grass', hard:0, drop:null, needsPick:0, isCraft:false, noCollide:true, plant:true},
  25:{name:'Poppy', sid:'poppy',   tTop:'poppy',       tSide:'poppy',       tBot:'poppy',       hard:0, drop:25,   needsPick:0, isCraft:false, noCollide:true, plant:true},
  26:{name:'Blue Orchid', sid:'blue_orchid',tTop:'blue_orchid',tSide:'blue_orchid', tBot:'blue_orchid', hard:0, drop:26,   needsPick:0, isCraft:false, noCollide:true, plant:true},
  27:{name:'Chest', sid:'chest',     tTop:'chest_top',  tSide:'chest_side',  tBot:'chest_top',  tFront:'chest_front', icon:'chest_front', hard:2.5, drop:27, needsPick:0, isCraft:false, isChest:true},
  // Bûche posée à l'horizontale (comme dans Minecraft : l'axe dépend de la face visée à la pose). Même drop que la bûche (id 5).
  28:{name:'Oak Log', sid:'oak_log_x', variantOf:5, tTop:'log_top', tSide:'log_side', tBot:'log_top', hard:2, drop:5, needsPick:0, isCraft:false},   // axe X (est-ouest)
  29:{name:'Oak Log', sid:'oak_log_z', variantOf:5, tTop:'log_top', tSide:'log_side', tBot:'log_top', hard:2, drop:5, needsPick:0, isCraft:false},   // axe Z (nord-sud)
  23:{name:'Water', sid:'water',        tTop:'water',      tSide:'water',       tBot:'water',      hard:100, drop:null, needsPick:0, isCraft:false, noCollide:true, isFluid:true},
};

// ── Flags ajoutés aux blocs d'origine (le moteur lit ces flags au lieu de comparer des noms de textures) ──
Object.assign(BLOCKS[5],  {log:true, logX:28, logZ:29, mat:'wood'});          // bûche de chêne : logX/logZ = variantes posées à l'horizontale
Object.assign(BLOCKS[28], {log:true, axis:'x', tSideR:'log_side_r'});          // axe X : écorce tournée de 90° (tuile générée par l'atlas)
Object.assign(BLOCKS[29], {log:true, axis:'z', tSideR:'log_side_r'});          // axe Z
BLOCKS[6].leaves = true;                                                       // feuilles de chêne (cutout + teinte de biome)
BLOCKS[14].glass = true;                                                       // verre (mesh translucide)
// Four : côté dédié + face avant orientée (éteinte / allumée). Dessus = furnace_top, dessous = stone (inchangés).
Object.assign(BLOCKS[21], {tSide:'furnace_side', tFront:'furnace_front', tFrontOn:'furnace_front_on'});

// ════════════════════════════════════════════════
// BLOCS AJOUTÉS (textures v2) — IDs 30+
// ════════════════════════════════════════════════
// Flags : leaves (cutout, teinte), glass (translucide), cross (modèle en croix), axis/logX/logZ (bûches), tFront/tFrontOn (face avant),
//         mat ('stone'|'wood'|'earth'|'soft' = outil efficace), burn (inflammabilité), variantOf (état interne, absent du créatif).
// Une texture manquante n'est jamais devinée : le repli est indiqué à côté (ex. dessus de la bûche d'acacia).
let _nid = 30;
function addBlock(sid, name, tTop, tSide, tBot, p){
  const id = _nid++;
  BLOCKS[id] = Object.assign({name, sid, tTop, tSide, tBot, hard:1, drop:id, needsPick:0, isCraft:false}, p || {});
  return id;
}
const _all = (sid, name, tex, p) => addBlock(sid, name, tex, tex, tex, p);   // même texture sur les 6 faces

// Bois : planches, bûche (+ 2 variantes horizontales), feuilles
[['spruce','Spruce'], ['birch','Birch'], ['jungle','Jungle'], ['acacia','Acacia'], ['dark_oak','Dark Oak']].forEach(([w, N]) => {
  _all(w+'_planks', N+' Planks', w+'_planks', {hard:1.5, mat:'wood', burn:0.025});
  const top = (w === 'acacia') ? 'acacia_planks' : w+'_log_top';   // acacia : pas de texture de dessus fournie → planches en attendant
  const side = w+'_log_side', sideR = side+'_r';
  const log = addBlock(w+'_log', N+' Log', top, side, top, {hard:2, mat:'wood', burn:0.015, log:true});
  BLOCKS[log].logX = addBlock(w+'_log_x', N+' Log', top, side, top, {hard:2, mat:'wood', log:true, variantOf:log, drop:log, axis:'x', tSideR:sideR});
  BLOCKS[log].logZ = addBlock(w+'_log_z', N+' Log', top, side, top, {hard:2, mat:'wood', log:true, variantOf:log, drop:log, axis:'z', tSideR:sideR});
  _all(w+'_leaves', N+' Leaves', w+'_leaves', {hard:.4, drop:null, leaves:true, mat:'soft', burn:0.07});
});

// Pierres
_all('andesite', 'Andesite', 'andesite', {hard:3, mat:'stone'});
_all('diorite',  'Diorite',  'diorite',  {hard:3, mat:'stone'});
_all('granite',  'Granite',  'granite',  {hard:3, mat:'stone'});
_all('polished_andesite', 'Polished Andesite', 'polished_andesite', {hard:3, mat:'stone'});
_all('polished_diorite',  'Polished Diorite',  'polished_diorite',  {hard:3, mat:'stone'});
_all('polished_granite',  'Polished Granite',  'polished_granite',  {hard:3, mat:'stone'});
_all('tuff', 'Tuff', 'tuff', {hard:3, mat:'stone'});
const _cobbledDeepslate = _all('cobbled_deepslate', 'Cobbled Deepslate', 'cobbled_deepslate', {hard:6, mat:'stone'});
_all('deepslate', 'Deepslate', 'deepslate', {hard:6, mat:'stone', drop:_cobbledDeepslate});   // se mine en pavé d'ardoise
_all('dripstone_block', 'Dripstone Block', 'dripstone_block', {hard:3, mat:'stone'});

// Minerais (drops : objets « lapis » / « redstone » pas encore dans ITEMS → le bloc lui-même en attendant)
_all('lapis_ore',    'Lapis Lazuli Ore', 'lapis_ore',    {hard:4, mat:'stone', needsPick:1});
_all('redstone_ore', 'Redstone Ore',     'redstone_ore', {hard:4, mat:'stone', needsPick:2});
_all('deepslate_iron_ore',     'Deepslate Iron Ore',     'deepslate_iron_ore',     {hard:6, mat:'stone', needsPick:1, drop:'raw_iron'});
_all('deepslate_gold_ore',     'Deepslate Gold Ore',     'deepslate_gold_ore',     {hard:6, mat:'stone', needsPick:2, drop:'raw_gold'});
_all('deepslate_diamond_ore',  'Deepslate Diamond Ore',  'deepslate_diamond_ore',  {hard:7, mat:'stone', needsPick:2, drop:'diamond'});
_all('deepslate_lapis_ore',    'Deepslate Lapis Lazuli Ore', 'deepslate_lapis_ore', {hard:6, mat:'stone', needsPick:1});
_all('deepslate_redstone_ore', 'Deepslate Redstone Ore', 'deepslate_redstone_ore', {hard:6, mat:'stone', needsPick:2});

// Blocs de métal
_all('coal_block',       'Block of Coal',   'coal_block',       {hard:5, mat:'stone', needsPick:1});
_all('copper_block',     'Block of Copper', 'copper_block',     {hard:5, mat:'stone', needsPick:1});
_all('exposed_copper',   'Exposed Copper',  'exposed_copper',   {hard:5, mat:'stone', needsPick:1});
_all('weathered_copper', 'Weathered Copper','weathered_copper', {hard:5, mat:'stone', needsPick:1});
_all('oxidized_copper',  'Oxidized Copper', 'oxidized_copper',  {hard:5, mat:'stone', needsPick:1});

// Terre, sable, argile
_all('clay',     'Clay',     'clay',     {hard:1, mat:'earth'});
_all('red_sand', 'Red Sand', 'red_sand', {hard:1, mat:'earth'});
// Grès : 3 textures (dessus lisse / côté à bande / dessous pavé). Grès rouge : pas de texture de dessous fournie → on réutilise le dessus.
addBlock('sandstone',     'Sandstone',     'sandstone_top',     'sandstone_side',     'sandstone_bottom', {hard:2, mat:'stone'});
addBlock('red_sandstone', 'Red Sandstone', 'red_sandstone_top', 'red_sandstone_side', 'red_sandstone_top', {hard:2, mat:'stone'});

// Terracotta (15 couleurs fournies ; pas de rose ni de terracotta nature)
[['white','White'],['orange','Orange'],['magenta','Magenta'],['light_blue','Light Blue'],['yellow','Yellow'],['lime','Lime'],
 ['gray','Gray'],['light_gray','Light Gray'],['cyan','Cyan'],['purple','Purple'],['blue','Blue'],['brown','Brown'],
 ['green','Green'],['red','Red'],['black','Black']].forEach(([c, N]) => _all(c+'_terracotta', N+' Terracotta', c+'_terracotta', {hard:2, mat:'stone'}));

// Glace, neige, slime
_all('ice',        'Ice',        'ice',        {hard:1,   mat:'stone', glass:true, drop:null});
_all('packed_ice', 'Packed Ice', 'packed_ice', {hard:1,   mat:'stone', drop:null});
_all('blue_ice',   'Blue Ice',   'blue_ice',   {hard:5,   mat:'stone', drop:null});
_all('snow_block', 'Snow Block', 'snow_block', {hard:.5,  mat:'earth'});
_all('powder_snow','Powder Snow','powder_snow',{hard:.5,  mat:'earth', drop:null});
addBlock('snowy_grass_block', 'Snowy Grass Block', 'snow_block', 'snowy_grass_side', 'dirt', {hard:1, mat:'earth', drop:2});   // dessus = neige, côtés = herbe enneigée, dessous = terre
_all('slime_block', 'Slime Block', 'slime_block', {hard:.3, mat:'soft', glass:true});

// Stalactite / stalagmite : 5 états d'épaisseur (tip_merge, tip, frustum, middle, base), rendus en croix comme les plantes.
// Un seul bloc visible dans le créatif (la pointe) ; les 4 autres sont des états internes (variantOf), à choisir selon les voisins.
const _dripP = {hard:3, mat:'stone', cross:true, noCollide:true};
const _drip = addBlock('pointed_dripstone', 'Pointed Dripstone', 'pointed_dripstone_tip', 'pointed_dripstone_tip', 'pointed_dripstone_tip', _dripP);
['tip_merge','frustum','middle','base'].forEach(k => {
  const t = 'pointed_dripstone_' + k;
  addBlock('pointed_dripstone_' + k, 'Pointed Dripstone', t, t, t, Object.assign({}, _dripP, {variantOf:_drip, drop:_drip}));
});

const ITEMS = {
  stick:         {name:'Stick'},
  wooden_sword:    {name:'Wooden Sword'},
  wooden_pickaxe:     {name:'Wooden Pickaxe'},
  wooden_axe:      {name:'Wooden Axe'},
  wooden_shovel:   {name:'Wooden Shovel'},
  wooden_hoe:      {name:'Wooden Hoe'},
  stone_pickaxe:    {name:'Stone Pickaxe'},
  stone_sword:   {name:'Stone Sword'},
  stone_axe:     {name:'Stone Axe'},
  stone_shovel:  {name:'Stone Shovel'},
  stone_hoe:     {name:'Stone Hoe'},
  raw_iron:      {name:'Raw Iron'},
  raw_gold:      {name:'Raw Gold'},
  iron_pickaxe:     {name:'Iron Pickaxe'},
  iron_sword:    {name:'Iron Sword'},
  iron_axe:      {name:'Iron Axe'},
  iron_shovel:   {name:'Iron Shovel'},
  iron_hoe:      {name:'Iron Hoe'},
  iron_helmet:   {name:'Iron Helmet'},
  iron_chestplate:{name:'Iron Chestplate'},
  iron_leggings: {name:'Iron Leggings'},
  iron_boots:    {name:'Iron Boots'},
  gold_ingot:    {name:'Gold Ingot'},
  golden_sword:  {name:'Golden Sword'},
  golden_pickaxe:   {name:'Golden Pickaxe'},
  diamond:       {name:'Diamond'},
  diamond_pickaxe:  {name:'Diamond Pickaxe'},
  diamond_sword: {name:'Diamond Sword'},
  coal:          {name:'Coal'},
  bow:           {name:'Bow'},
  arrow:         {name:'Arrow'},
  bread:         {name:'Bread'},
  apple:         {name:'Apple'},
  torch:    {name:'Torch'},
  ladder:        {name:'Ladder'},
  oak_sign:          {name:'Oak Sign'},
  paper:         {name:'Paper'},
  book:          {name:'Book'},
  clock:    {name:'Clock'},
  compass:       {name:'Compass'},
  oak_door:     {name:'Oak Door'},
  iron_door:     {name:'Iron Door'},
  bucket:        {name:'Bucket'},
  water_bucket:  {name:'Water Bucket'},
  leather_helmet:{name:'Leather Cap'},
  leather_chestplate:{name:'Leather Tunic'},
  leather_leggings:{name:'Leather Pants'},
  leather_boots: {name:'Leather Boots'},
  flint:         {name:'Flint'},
  flint_and_steel:   {name:'Flint and Steel'},
  saddle:        {name:'Saddle'},
  golden_axe:    {name:'Golden Axe'},
  golden_shovel: {name:'Golden Shovel'},
  golden_hoe:    {name:'Golden Hoe'},
  golden_helmet: {name:'Golden Helmet'},
  golden_chestplate:{name:'Golden Chestplate'},
  golden_leggings:{name:'Golden Leggings'},
  golden_boots:  {name:'Golden Boots'},
  diamond_axe:   {name:'Diamond Axe'},
  diamond_shovel:{name:'Diamond Shovel'},
  diamond_hoe:   {name:'Diamond Hoe'},
  diamond_helmet:{name:'Diamond Helmet'},
  diamond_chestplate:{name:'Diamond Chestplate'},
  diamond_leggings:{name:'Diamond Leggings'},
  diamond_boots: {name:'Diamond Boots'},
  rail:          {name:'Rail'},
  powered_rail:  {name:'Powered Rail'},
  minecart:      {name:'Minecart'},
  oak_boat:          {name:'Oak Boat'},
  oak_fence:         {name:'Oak Fence'},
  oak_fence_gate:    {name:'Oak Fence Gate'},
  stone_slab:    {name:'Stone Slab'},
  oak_slab:     {name:'Oak Slab'},
  stone_stairs:   {name:'Stone Stairs'},
  oak_stairs:    {name:'Oak Stairs'},
  iron_block:    {name:'Block of Iron'},
  gold_block:    {name:'Block of Gold'},
  diamond_block: {name:'Block of Diamond'},
};

function itemName(id) {
  if(typeof id === 'number') return BLOCKS[id]?.name || '?';
  return ITEMS[id]?.name || String(id).split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
