'use strict';

// ════════════════════════════════════════════════
// BLOCK STATES — propriétés par bloc posé (orientation, ouvert, alimenté, puissance…)
// ════════════════════════════════════════════════
// Un état est un entier 0..65535 (Uint16) stocké à côté de l'id du bloc (voir world-state.js). Il évite de multiplier
// les ids (une porte = 1 id + 6 bits d'état, au lieu de 32 ids). L'id reste sur 8 bits : il reste donc de la place.
//
// Un schéma décrit les propriétés d'un bloc, dans l'ordre ; chaque propriété occupe ceil(log2(nb valeurs)) bits :
//     BS.define('oak_door', {facing:['north','south','west','east'], half:['lower','upper'], hinge:['left','right'], open:'bool', powered:'bool'});
//
// RÈGLE : la PREMIÈRE valeur de chaque propriété est sa valeur par défaut, donc l'état par défaut d'un bloc est toujours 0.
// C'est ce qui permet de ne rien stocker pour la quasi-totalité du monde (terrain généré, blocs sans état, blocs jamais touchés).
//
// Les schémas sont rattachés aux blocs par leur `sid` : un schéma déclaré ici pour un bloc qui n'existe pas encore reste en
// attente et s'active tout seul le jour où le bloc est ajouté dans blocks.js (BS.attachAll() est appelé à la fin de blocks.js).
const HASSTATE = new Uint8Array(256);   // 1 si le bloc possède un schéma d'états

const BS = (() => {
  const SCHEMAS = new Array(256).fill(null);   // id numérique → schéma
  const PENDING = new Map();                   // sid → {props, opts}

  // ── Directions (mêmes axes que le jeu : +x = est, +z = sud, −z = nord) ──
  const DIRS = {north:[0,0,-1,'south'], south:[0,0,1,'north'], west:[-1,0,0,'east'], east:[1,0,0,'west'], up:[0,1,0,'down'], down:[0,-1,0,'up']};
  const HORIZ = ['north','south','west','east'];
  const opposite = n => DIRS[n] ? DIRS[n][3] : n;
  const vec = n => DIRS[n] ? [DIRS[n][0], DIRS[n][1], DIRS[n][2]] : [0,0,0];
  function fromVec(dx, dy, dz){
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    if(ay >= ax && ay >= az) return dy >= 0 ? 'up' : 'down';
    if(ax >= az) return dx >= 0 ? 'east' : 'west';
    return dz >= 0 ? 'south' : 'north';
  }
  // Direction dans laquelle regarde le joueur (yaw/pitch du jeu : le regard est (−cos p·sin y, sin p, −cos p·cos y))
  function lookDir(yaw, pitch, horizontalOnly){
    const cp = Math.cos(pitch||0);
    return fromVec(-cp*Math.sin(yaw), horizontalOnly ? 0 : Math.sin(pitch||0), -cp*Math.cos(yaw));
  }

  // ── Construction d'un schéma ──
  function build(id, sid, props, opts){
    const list = [], byName = new Map();
    let shift = 0;
    for(const name of Object.keys(props)){
      let values = props[name];
      if(values === 'bool') values = [false, true];
      if(!Array.isArray(values) || values.length < 2) throw new Error('BS «'+sid+'» : propriété «'+name+'» invalide (2 valeurs minimum)');
      const bits = Math.ceil(Math.log2(values.length));
      const p = {name, values: values.slice(), bits, shift, mask: (1<<bits)-1};
      list.push(p); byName.set(name, p); shift += bits;
    }
    if(shift > 16) throw new Error('BS «'+sid+'» : '+shift+' bits d\'état demandés (maximum 16)');
    return {id, sid, props: list, byName, bits: shift, look: !!(opts && opts.look), place: (opts && opts.place) || null};
  }

  // Déclare un schéma (en attente tant que le bloc n'existe pas)
  function define(sid, props, opts){
    PENDING.set(sid, {props, opts});
    if(typeof BLOCKS !== 'undefined') attachAll();
  }
  // Rattache les schémas en attente aux blocs existants (idempotent)
  function attachAll(){
    for(const id in BLOCKS){
      const n = +id;
      if(SCHEMAS[n]) continue;
      const pend = PENDING.get(BLOCKS[n].sid);
      if(!pend) continue;
      SCHEMAS[n] = build(n, BLOCKS[n].sid, pend.props, pend.opts);
      HASSTATE[n] = 1;
      BLOCKS[n].states = SCHEMAS[n];
    }
  }

  const schema = id => SCHEMAS[id] || null;
  const idxOf = (p, v) => {
    let i = p.values.indexOf(v);
    if(i < 0){ const t = String(v); i = p.values.findIndex(x => String(x) === t); }
    return i;
  };

  // État → objet {propriété: valeur}
  function decode(id, s){
    const sc = SCHEMAS[id], o = {};
    if(!sc) return o;
    for(const p of sc.props) o[p.name] = p.values[Math.min((s >> p.shift) & p.mask, p.values.length-1)];
    return o;
  }
  // Objet partiel → état (les propriétés absentes gardent la valeur de `base`, 0 par défaut)
  function encode(id, obj, base){
    const sc = SCHEMAS[id];
    if(!sc) throw new Error('ce bloc n\'a pas d\'états');
    let s = base || 0;
    for(const k in obj){
      const p = sc.byName.get(k);
      if(!p) throw new Error('propriété inconnue «'+k+'» (valides : '+sc.props.map(q => q.name).join(', ')+')');
      const i = idxOf(p, obj[k]);
      if(i < 0) throw new Error('valeur invalide «'+obj[k]+'» pour «'+k+'» (valides : '+p.values.join(', ')+')');
      s = (s & ~(p.mask << p.shift)) | (i << p.shift);
    }
    return s;
  }
  const get = (id, s, name) => { const p = SCHEMAS[id]?.byName.get(name); return p ? p.values[Math.min((s >> p.shift) & p.mask, p.values.length-1)] : undefined; };
  const set = (id, s, name, value) => encode(id, {[name]: value}, s);

  // Ramène un état quelconque (venant du réseau, d'une sauvegarde…) à un état valide pour ce bloc ; 0 si le bloc n'a pas d'états
  function clean(id, s){
    const sc = SCHEMAS[id];
    if(!sc || !Number.isInteger(s) || s <= 0) return 0;
    let r = 0;
    for(const p of sc.props){
      let i = (s >> p.shift) & p.mask;
      if(i >= p.values.length) i = p.values.length-1;
      r |= i << p.shift;
    }
    return r;
  }

  // Texte "facing=east,open=true" ⇄ état (commandes, débogage)
  function parse(id, str, base){
    try{
      const o = {};
      for(const part of String(str).split(',')){
        const t = part.trim(); if(!t) continue;
        const eq = t.indexOf('=');
        if(eq < 1) throw new Error('syntaxe attendue : propriété=valeur');
        o[t.slice(0, eq).trim()] = t.slice(eq+1).trim();
      }
      return {state: encode(id, o, base)};
    }catch(e){ return {error: e.message}; }
  }
  function format(id, s){
    const o = decode(id, s);
    return Object.keys(o).map(k => k+'='+o[k]).join(',');
  }

  // ── État à la pose ──
  // ctx : {fx,fy,fz} = normale de la face visée (position posée − position visée), yaw/pitch du joueur.
  // Un schéma peut fournir sa propre fonction `place(ctx, schema)` (renvoie un état) ; sinon règles génériques ci-dessous.
  function placement(id, ctx){
    const sc = SCHEMAS[id];
    if(!sc) return 0;
    if(sc.place) return clean(id, sc.place(ctx, sc) | 0);
    const has = n => sc.byName.has(n), vals = n => sc.byName.get(n).values;
    const fx = ctx.fx|0, fy = ctx.fy|0, fz = ctx.fz|0;
    const lookH = lookDir(ctx.yaw, 0, true), o = {};
    if(has('face')){                       // levier, bouton : posé au sol, au mur ou au plafond
      o.face = fy > 0 ? 'floor' : fy < 0 ? 'ceiling' : 'wall';
      if(has('facing')) o.facing = fy === 0 ? fromVec(fx, 0, fz) : lookH;
    }
    else if(has('facing')){
      const f = vals('facing');
      if(f.includes('up') && f.includes('down')) o.facing = opposite(lookDir(ctx.yaw, ctx.pitch, false));   // piston, dropper… : la face avant regarde le joueur
      else o.facing = sc.look ? lookH : opposite(lookH);                                                     // 4 directions : vers le joueur (ou comme lui avec look:true)
    }
    if(has('half') && vals('half').includes('top')) o.half = fy < 0 ? 'top' : 'bottom';   // escalier, trappe : moitié haute si on vise le dessous d'un bloc
    if(has('type') && vals('type').includes('top')) o.type = fy < 0 ? 'top' : 'bottom';   // dalle
    return encode(id, o);
  }

  return {DIRS, HORIZ, opposite, vec, fromVec, lookDir,
          define, attachAll, schema, decode, encode, get, set, clean, parse, format, placement};
})();

// État valide pour (id, s) : 0 si le bloc n'a pas d'états. Utilisé partout où un état arrive de l'extérieur.
function bsNorm(id, s){ return (HASSTATE[id] && s) ? BS.clean(id, s) : 0; }

// ════════════════════════════════════════════════
// SCHÉMAS PRÉVUS (portes, redstone, plaques…) — en attente tant que les blocs ne sont pas ajoutés dans blocks.js
// ════════════════════════════════════════════════
// Convention : un état n'est lu que par le code du bloc concerné ; ici on ne fait que décrire ses propriétés.
// La première valeur est la valeur par défaut (ex. lit:[true,false] pour une torche de redstone, allumée à la pose).
{
  const H4 = ['north','south','west','east'];            // orientations horizontales
  const H6 = ['north','south','west','east','up','down'];
  const WOODS = ['oak','spruce','birch','jungle','acacia','dark_oak'];

  // Portes (2 blocs : moitié basse + haute)
  const door = {facing:H4, half:['lower','upper'], hinge:['left','right'], open:'bool', powered:'bool'};
  WOODS.forEach(w => BS.define(w+'_door', door, {look:true}));
  BS.define('iron_door', door, {look:true});

  // Trappes, portillons
  WOODS.forEach(w => {
    BS.define(w+'_trapdoor',   {facing:H4, half:['bottom','top'], open:'bool', powered:'bool'});
    BS.define(w+'_fence_gate', {facing:H4, open:'bool', powered:'bool', in_wall:'bool'}, {look:true});
  });

  // Entrées : leviers, boutons, plaques de pression
  const attach = {face:['floor','wall','ceiling'], facing:H4, powered:'bool'};
  BS.define('lever', attach);
  BS.define('stone_button', attach);
  WOODS.forEach(w => {
    BS.define(w+'_button', attach);
    BS.define(w+'_pressure_plate', {powered:'bool'});
  });
  BS.define('stone_pressure_plate', {powered:'bool'});
  BS.define('light_weighted_pressure_plate', {power:Array.from({length:16}, (_, i) => i)});   // or : 0..15 selon le nombre d'objets
  BS.define('heavy_weighted_pressure_plate', {power:Array.from({length:16}, (_, i) => i)});   // fer

  // Câblage : poudre (puissance + connexions visibles), torche, répéteur, comparateur
  const CONN = ['none','side','up'];
  BS.define('redstone_wire', {power:Array.from({length:16}, (_, i) => i), north:CONN, east:CONN, south:CONN, west:CONN});
  BS.define('redstone_torch', {lit:[true,false], facing:['up','north','south','west','east']}, {
    place(c){ return BS.encode(this.id, {facing: c.fy > 0 ? 'up' : c.fy === 0 ? BS.fromVec(c.fx|0, 0, c.fz|0) : 'up'}); }   // 'up' = posée au sol ; sinon dirigée à l'opposé du mur
  });
  BS.define('repeater',   {facing:H4, delay:[1,2,3,4], locked:'bool', powered:'bool'});
  BS.define('comparator', {facing:H4, mode:['compare','subtract'], powered:'bool'});
  BS.define('redstone_lamp', {lit:'bool'});
  BS.define('daylight_detector', {power:Array.from({length:16}, (_, i) => i), inverted:'bool'});

  // Mécanismes
  BS.define('piston',        {facing:H6, extended:'bool'});
  BS.define('sticky_piston', {facing:H6, extended:'bool'});
  BS.define('piston_head',   {facing:H6, type:['normal','sticky'], short:'bool'});
  BS.define('observer',  {facing:H6, powered:'bool'});
  BS.define('dispenser', {facing:H6, triggered:'bool'});
  BS.define('dropper',   {facing:H6, triggered:'bool'});
  BS.define('hopper',    {facing:['down','north','south','west','east'], enabled:[true,false]}, {
    place(c){ return BS.encode(this.id, {facing: c.fy > 0 ? 'down' : BS.opposite(BS.fromVec(c.fx|0, 0, c.fz|0))}); }
  });

  // Rails (10 formes ; les rails alimentés n'en utilisent que 6)
  const SHAPES = ['north_south','east_west','ascending_east','ascending_west','ascending_north','ascending_south','south_east','south_west','north_west','north_east'];
  BS.define('rail', {shape:SHAPES});
  ['powered_rail','detector_rail','activator_rail'].forEach(n => BS.define(n, {shape:SHAPES.slice(0, 6), powered:'bool'}));

  // Dalles, escaliers, échelle (les blocs d'ITEMS stone_slab / oak_stairs… pourront être posés avec leur orientation)
  WOODS.concat(['stone','cobblestone']).forEach(m => {
    BS.define(m+'_slab',   {type:['bottom','top','double']});
    BS.define(m+'_stairs', {facing:H4, half:['bottom','top'], shape:['straight','inner_left','inner_right','outer_left','outer_right']}, {look:true});
  });
  BS.define('ladder', {facing:H4});
}
