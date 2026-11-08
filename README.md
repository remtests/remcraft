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

## Portail du Nether et Nether provisoire

- `js/blocks/nether-portal.js` : activation (briquet sur un cadre d'obsidienne complet, de 2×3 à 21×21 à l'intérieur, coins non exigés) et cohérence (si le cadre ou un bloc du portail disparaît, le portail connecté disparaît).
- `js/render/portal-render.js` : texture animée (`assets/textures/nether/portal`, images carrées empilées verticalement) et modèle de 2 plans fins (comme Minecraft), classe de mesh n°5.
- Bloc `nether_portal` (dernier id), état `axis` = `x` (défaut) ou `z`. Traversable, lumière 11, absent du créatif : `/setblock x y z nether_portal[axis=z]`.
- Texture : `assets/textures/nether/portal/nether_portal.png` (16×512 = 32 images de 16×16). La taille d'image se déduit de la largeur de la feuille.

### Dimensions, téléportation et Nether (provisoire)

- `js/world/dimensions.js` : chaque dimension (`overworld`, `nether`) a son propre état — chunks, lumières, coffres et leur orientation, fours, feux, fluides programmés, TNT, créatures, objets au sol, journal des blocs modifiés, registre des portails. `dimBind(id)` réaffecte les variables globales vers cet état (aucune copie) : le reste du code lit et écrit « le monde courant » (`CUR_DIM`, `inNether()`). `dimSwitch(id)` = le joueur change de dimension (affichage de l'ancienne retiré, nouvelle liée) ; `withDim(id, f)` exécute `f` dans une autre dimension sans toucher à l'affichage (sauvegarde, messages réseau). Les coordonnées sont celles de la dimension : un coffre en (3,71,3) peut exister dans chacune.
- Sauvegarde : l'Overworld garde les champs de premier niveau (anciennes sauvegardes lisibles), le Nether est dans `st.nether` (`e`, `ed`, `cd`, `chests`, `fu`) ; `st.dim` = dimension du joueur, `st.p` = sa position dans celle-ci.
- Multijoueur : chaque message de jeu porte `dm` (dimension). Blocs, coffres, fours et feux d'une autre dimension sont appliqués dans celle-ci sans affichage ; objets au sol, TNT et créatures restent propres à la dimension ; un joueur d'une autre dimension est invisible. Le « hello » d'un nouvel arrivant contient les deux dimensions (`hello.nether`, `hello.dim`).
- Téléportation (fin de `js/blocks/nether-portal.js`) : rester ~4 s dans un portail (instantané en créatif) → échelle 1:8, voile violet pendant l'attente. Destination : portail existant le plus proche dans l'autre dimension (rayon 16 vers le Nether, 128 vers l'Overworld), sinon portail neuf (cadre 4×5 + plateforme d'obsidienne). Après l'arrivée il faut sortir du portail avant de le reprendre. Mourir dans le Nether fait réapparaître dans l'Overworld.
- Génération du Nether (`js/world/nether-generation.js`) : dérivée de `WORLD_SEED` (même graine que l'Overworld, décalée par des constantes propres au Nether → déterministe, un Nether différent par monde). Terrain : bruit 3D à 3 octaves + biais vertical → grande caverne avec îles, piliers et voûtes ; plancher et plafond de bedrock irréguliers ; océan de lave jusqu'à `NETHER_LAVA_Y` (y = −28) ; quelques cases de surface de lave éclairent la caverne (`meta.lsrc`). La densité est échantillonnée sur une grille alignée sur le monde (4 en x/z, 8 en y) puis interpolée : aucune couture entre chunks, ~6 ms par chunk.
- Biomes du Nether : 5 biomes choisis par un climat (température, humidité) en bruit 2D, par proximité avec 5 points de référence (`NB_REF`). `netherBiomeAt(x, z)` donne le biome, `meta.bio` reste à 0. Surface : **Nether Wastes** (netherrack, taches de sable des âmes près de la lave, gravier) · **Soul Sand Valley** (vaste plaine de sable / sol d'âmes au-dessus de la lave, avec des mares) · **Crimson Forest** (nylium cramoisie, racines et champignons cramoisis) · **Warped Forest** (nylium biscornue, racines, pousses du Nether et champignons biscornus) · **Basalt Deltas** (piliers de basalte qui sortent de la lave, basalte et blackstone en surface). Le brouillard prend la couleur du biome du joueur (`netherFogStep`) ; F3 affiche le biome.
- Minerais : filons de quartz et d'or du Nether (marche aléatoire dans la netherrack du chunk), ancient debris profond et jamais au contact de l'air ou de la lave.
- Blocs ajoutés (ids 115 et suivants, `js/data/blocks.js`, textures dans `assets/textures/nether`) : sable des âmes, sol d'âmes, basalte (3 axes comme les bûches), blackstone, briques du Nether (+ fissurées), minerais d'or et de quartz du Nether, ancient debris, bloc de netherite, nylium cramoisie / biscornue, blocs de verrues, planches cramoisies / biscornues, racines, pousses et champignons. Les plantes se posent sur herbe, terre, sol d'âmes ou nylium (`plantOn`). Pas de tiges ni de champignons géants : seule la texture du dessus des tiges est fournie.
- Rejeu de journal (sauvegarde, arrivée en multijoueur) : `PORTAL_SUSPEND` suspend la vérification d'intégrité des portails, car l'ordre du journal n'est pas l'ordre chronologique.
- Ambiance du Nether : ciel et fond rouge sombre, ni soleil, ni lune, ni nuages, ni pluie, aucune lumière du ciel (le mesher traite ces chunks comme couverts), lumière minimale relevée.
