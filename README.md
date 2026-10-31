# Remcraft (Three.js)

Remcraft est une réplique de Minecraft jouable dans le navigateur : monde infini, biomes, grottes, craft, four, coffres, feu, cycle jour/nuit, armures, skins et multijoueur (PeerJS / WebRTC).

## Lancer le jeu

Le jeu est jouable via le déploiement Github Pages https://remtests.github.io/remcraft

**Double-cliquer sur `serve.bat` (Windows) ou lancer `./serve.sh` (Mac/Linux)**, puis ouvrir http://localhost:8000.
Ces fichiers sont des résidus de test en local pour les premières versions du jeu :

```bash
python3 -m http.server 8000      # puis http://localhost:8000
npx serve .
```

## Notes techniques

- Les scripts sont des **scripts classiques** (pas des modules ES) et partagent la portée globale, comme dans
  le fichier d'origine. **L'ordre des balises `<script>` dans `index.html` est important.**
- Three.js (r128) et PeerJS (1.5.4) sont chargés depuis un CDN.

## Fluides (eau / lave)

- `js/blocks/fluids.js` : simulation (niveaux 7→0, chute, trou le plus proche, sources infinies d'eau, réactions eau + lave, courant, seaux).
- `js/render/fluid-render.js` : textures animées (`assets/textures/fluids`), hauteur des surfaces, courant, voile de caméra.
- États de bloc `level` / `falling` (voir `data/block-states.js`) ; source = état 0. Commande : `/setblock x y z water[level=3]`.
- `assets/textures/blocks/obsidian.png` est une texture générée (aucune fournie) : à remplacer.
