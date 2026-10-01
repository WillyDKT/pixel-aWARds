# Pixel aWARds — Pixel War 2026

Overlay d’aide pour la Pixel War des Decathlon Innovation Awards 2026 :
<https://innovation-awards2026.decathlon.com/en-us/pixelwar>

## Démarche

Le dessin de référence est fourni sous forme de grille de pixels dans
`template.js`. Une extension Chromium Manifest V3 affiche cette grille en
surimpression sur le plateau et suit son zoom et son déplacement pour aider
les participants à se coordonner. L’overlay est uniquement visuel : il ne
place aucun pixel et n’appelle pas l’API du jeu.

## Installation

Dans Chrome, ouvrez `chrome://extensions`, activez le **Mode développeur**,
choisissez **Charger l’extension non empaquetée**, puis sélectionnez ce
dossier. Ouvrez ensuite la page Pixel War. Le bouton de l’overlay permet de
l’afficher ou de le masquer ; le raccourci est `Alt` + `Maj` + `P`.
