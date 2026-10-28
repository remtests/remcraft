# Remcraft (Three.js)

Remcraft est une réplique de Minecraft jouable dans le navigateur : monde infini, biomes, grottes, craft, four, coffres, feu,
cycle jour/nuit, armures, skins et multijoueur (PeerJS / WebRTC).

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
