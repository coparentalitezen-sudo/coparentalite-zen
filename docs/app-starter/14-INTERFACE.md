# 14 — Interface

Étape 5 du mode opératoire. Ce que le socle livre, et les règles auxquelles
une page métier doit se plier.

---

## 1. Principe de composition

Une page métier **assemble** des composants du socle. Elle ne les modifie
jamais. Si un composant ne convient pas, on lui ajoute un paramètre — on ne le
duplique pas dans `src/metier/`.

Conséquence pratique : toutes les applications issues du starter se
ressemblent structurellement, et diffèrent par leurs couleurs, leur
typographie et leur contenu. C'est voulu : la cohérence est un gain de temps,
pas une contrainte.

## 2. Tokens de design

Déclarés dans `globals.css` via `@theme`, **générés** depuis
`app.config.marque` par `scripts/generer-theme.ts` :

```css
@theme {
  --color-primaire: …;
  --color-accent: …;
  --color-fond: …;
  --color-encre: …;
  --color-soft: …;        /* texte secondaire */
  --color-card: …;
  --color-line: …;
  --color-ok / --color-ok-bg;
  --color-wait / --color-wait-bg;
  --color-err / --color-err-bg;
  --radius-card: …;
  --radius-btn: …;
  --font-sans: …;
  --font-display: …;
}
```

⚠ Deux variantes par couleur d'accent. Sur Coparentalité Zen, le corail et la
sauge ne passent pas le contraste AA en texte : une variante « texte » dédiée
existe pour chacune. Toute couleur de marque doit être testée en texte sur
fond clair **avant** d'être adoptée ; si elle échoue, prévoir sa variante.

⚠ Aucune couleur littérale (`#RRGGBB`) ailleurs que dans `app.config.ts` —
vérifié par `verifier-config.ts`.

## 3. Classes utilitaires du socle

```css
.card         fond, rayon, bordure, ombre douce
.btn          inline-flex, min-height 44px, rayon, poids 700
.btn-primary  fond primaire, texte blanc
.btn-ghost    fond neutre, texte encre
```

`input`, `select`, `textarea` héritent d'une hauteur minimale de 44 px et du
même rayon.

Aucune bibliothèque d'interface. Les icônes sont des tracés SVG dans
`socle/ui/icons.tsx`. Ce choix, tenu depuis le début sur Coparentalité Zen,
supprime une surface entière de mises à jour et n'impose aucun style.

## 4. Layout et navigation

`socle/ui/layout-app.tsx` fournit :

- un en-tête avec le nom de l'application et le **hash de version** — seul
  moyen fiable de savoir quelle version est réellement servie ;
- un bandeau conditionnel (bêta, mode démonstration, période de grâce) ;
- la zone de contenu, `min-h-dvh`, marges de sécurité iOS ;
- une **navigation basse**, lue depuis `app.config.navigation`.

Règles de navigation :

- **cinq entrées maximum.** Au-delà, la dernière devient « Plus » et ouvre un
  menu.
- Chaque entrée porte une icône **et** un libellé — jamais une icône seule.
- L'entrée active est signalée autrement que par la seule couleur.

## 5. Mobile d'abord

Le socle est conçu pour le téléphone, puis élargi. Pas l'inverse.

- Colonne unique par défaut, largeur maximale sur grand écran.
- Cibles tactiles ≥ 44 px, sans exception.
- Aucune interaction dépendant du survol.
- Les actions principales en bas de l'écran, à portée du pouce.
- Formulaires : un champ par ligne, clavier adapté (`inputMode="decimal"` pour
  un montant, `type="date"` pour une date).
- `viewportFit: 'cover'` et `min-h-dvh` : l'encoche et la barre d'accueil iOS
  ne doivent jamais masquer une action.

## 6. Les quatre états obligatoires

Chaque écran affichant des données doit traiter les quatre. Le socle les
fournit ; ne pas les câbler est un défaut, pas un raccourci.

| État | Composant | Contenu attendu |
|---|---|---|
| Chargement | `<Chargement />` | `role="status"`, jamais une page blanche |
| Erreur | `<Erreur />` | message lisible + détails repliables + « Réessayer » |
| Vide | `<Vide />` | titre, explication, **action** pour en sortir |
| Sans accès | `<SansAcces />` | ce qui manque et comment l'obtenir |

Un écran vide sans explication est la première cause d'abandon. « Aucune
donnée » n'est pas un message : dire pourquoi, et proposer quoi faire.

## 7. Erreurs

- Affichées **là où l'utilisateur agit**, pas en haut de page.
- Message lisible par un humain ; détails techniques dans un dépliant
  « Détails techniques », visible en développement et pendant la bêta,
  masqué en production.
- `role="alert"` sur le bloc d'erreur.
- Jamais de message qui accuse l'utilisateur.

Le socle fournit aussi `error.tsx`, `global-error.tsx` et `not-found.tsx` à la
racine — absents de Coparentalité Zen, ce qui laisse Next afficher sa page
brute en cas de plantage de rendu.

## 8. Accessibilité

- **Jamais d'information portée par la seule couleur.** Toujours doubler par
  une initiale, un libellé ou une icône. Sur Coparentalité Zen, les deux
  parents ne sont jamais distingués par la couleur seule.
- Contraste AA minimum pour tout texte.
- Chaque champ a un `<label>` réellement associé.
- Navigation au clavier possible, focus visible.
- `role="status"` sur les chargements, `role="alert"` sur les erreurs.
- Images décoratives en `alt=""`, images porteuses de sens décrites.
- Textes redimensionnables : aucune hauteur fixe sur un conteneur de texte.

## 9. Écriture

Le vocabulaire fait partie de l'interface. Coparentalité Zen en donne un
exemple travaillé : « montant à régulariser » plutôt que « dette », « dépense
à vérifier » plutôt que « refusée », « en attente de réponse » plutôt
qu'« ignoré ».

La règle transposable : **choisir des mots qui n'attribuent ni faute ni
jugement**, surtout dans un domaine chargé — argent, santé, famille,
administration.

## 10. Honnêteté produit

Règle du socle, non négociable :

- aucun bouton factice ;
- aucune donnée décorative ;
- aucune simulation présentée comme fonctionnelle ;
- un écran incomplet le dit ;
- un message ne promet jamais ce que le produit ne fait pas.

Sur Coparentalité Zen, « l'autre parent en est informé » était faux tant que
les notifications n'existaient pas. Une promesse fausse dans l'interface coûte
plus cher qu'une fonctionnalité absente.
