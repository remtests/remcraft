# Minecraft Clone (Three.js)

Clone de Minecraft jouable dans le navigateur : monde infini, biomes, grottes, craft, four, coffres, feu,
cycle jour/nuit, armures, skins et multijoueur (PeerJS / WebRTC).

## Lancer le jeu

Le jeu charge ses textures comme fichiers : il faut le servir en HTTP (ouvrir `index.html` en double-clic
via `file://` bloque les textures WebGL pour des raisons de sécurité du navigateur).

**Double-cliquer sur `serve.bat` (Windows) ou lancer `./serve.sh` (Mac/Linux)**, puis ouvrir http://localhost:8000.
Ou manuellement :

```bash
# au choix, depuis la racine du dépôt :
python3 -m http.server 8000      # puis http://localhost:8000
npx serve .
```

### Publier sur GitHub Pages
`Settings → Pages → Deploy from a branch → main / (root)`. Le jeu sera servi à
`https://<utilisateur>.github.io/<depot>/`.

## Arborescence

```
index.html                  Structure HTML (menus, HUD, inventaires)
css/                        Feuilles de style
  menu.css  loading.css  hud.css  world-creation.css  inventory.css
assets/textures/
  blocks/  items/  armor/   Textures 16×16 (blocs, objets, armures 64×32)
  environment/              Soleil, lune, nuages
  effects/                  Sprite du feu
  skins/                    Skin par défaut
js/                         Scripts classiques, chargés dans l'ordre de index.html
  data/                     Textures procédurales, blocs, recettes, manifeste des textures
  core/                     Réglages, chargeur de textures, boucle principale, démarrage du monde
  world/                    Bruit de Perlin, biomes, génération de chunks, gestion des chunks
  render/                   Scène/atlas/matériaux, mesher de chunks, ciel, soleil/lune, nuages
  player/                   Joueur, physique, raycast & casse de blocs, skin et modèle
  entities/                 Objets au sol, particules, armures
  blocks/                   Coffres, feu, four
  input/                    Clavier / souris
  ui/                       HUD, inventaire, craft, slots, chat & commandes, options
  multiplayer/              Pseudo, réseau PeerJS, joueurs distants
  main.js                   Point d'entrée : charge les textures puis lance la boucle
```

## Notes techniques

- Les scripts sont des **scripts classiques** (pas des modules ES) et partagent la portée globale, comme dans
  le fichier d'origine. **L'ordre des balises `<script>` dans `index.html` est important.**
- Three.js (r128) et PeerJS (1.5.4) sont chargés depuis un CDN.
- Pour ajouter une texture : déposer le PNG dans `assets/textures/...` et l'ajouter dans
  `js/data/texture-manifest.js`.
