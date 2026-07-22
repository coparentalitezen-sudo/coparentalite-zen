# Coparentalité Zen — Charte d'identité visuelle

Le fichier `original/coparentalite-zen-logo-original.png` (1254×1254) est la référence officielle. Aucune variante ne le remplace : toutes en sont dérivées par recadrage ou détourage, sans redessin.

## Couleurs officielles (mesurées au pixel sur le logo)

Le bleu marine des figures est #4E6381, le rose doux #E4A196, le vert sauge #9AA791 (identique sur le cercle, l'enfant et le script « Zen »), le fond crème #FCF9F6 et l'encre du texte #101B2C. Le rose et le sauge n'atteignent pas 4.5:1 sur crème : ils servent aux fonds, badges et illustrations, jamais au texte courant. Les variantes texte accessibles sont dans `design-tokens.css` (--brand-coral-text, --brand-sage-text).

## Fichiers livrés

- `logos/coparentalite-zen-logo-complet.png` — logo complet avec signature (authentification, accueil public, exports PDF, e-mails, menu bureau)
- `logos/coparentalite-zen-logo-sans-signature.png` — usage mobile quand la signature devient illisible en petit
- `logos/coparentalite-zen-symbole.png` — symbole seul détouré (petits en-têtes internes, splash, partages)
- `logos/coparentalite-zen-logo-fond-clair.png` / `-fond-sombre.png` — disque crème détouré, utilisable sur tout fond (le disque garantit la lisibilité)
- `logos/coparentalite-zen-logo-monochrome.png` — niveaux de gris pour documents N&B
- `icons/coparentalite-zen-icon-512.png`, `-192.png` — icônes PWA (manifest)
- `icons/coparentalite-zen-icon-carre-1024.png` — icône carrée arrondie (stores futurs via Capacitor)
- `icons/coparentalite-zen-favicon.png`, `favicon.ico` — favicon 16/32/48
- `social/coparentalite-zen-og.png` — image Open Graph 1200×630

## Règles

Ratio 1:1 toujours conservé ; jamais d'étirement, de recoloration, d'effets, ni de placement sur fond qui réduit le contraste (les versions détourées conservent le disque crème précisément pour cela). Espace de protection minimal : 8 % de la largeur du logo. Taille minimale : 32 px pour le symbole, 120 px pour le logo complet, 200 px si la signature doit rester lisible.

## Différenciation Kakeibo (audit initial)

Kakeibo (getkakeibo.app) est une inspiration UX (simplicité, ajout rapide, cartes synthétiques), pas une référence visuelle. Points de différenciation actés dès la conception : palette navy/corail/sauge sur crème issue du logo (Kakeibo n'utilise pas cette gamme), typographie Fraunces + Nunito Sans, iconographie famille/maison/cœur, navigation 5 onglets avec bouton central « Ajouter », vocabulaire coparentalité (« montant à régulariser », « demande de modification »). Un audit de vérification écran par écran sera refait en Phase 8, avant validation finale.
