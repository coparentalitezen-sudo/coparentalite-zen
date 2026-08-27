# 06 — Application web progressive

Étape 6 du mode opératoire. Le socle livre une PWA installable sur iPhone et
Android, avec la totalité des contournements découverts en production.

---

## 1. Manifeste

`src/app/manifest.ts` — une route Next, pas un fichier statique : elle lit
`app.config.ts`, donc renommer l'application ne demande aucune retouche.

Champs qui comptent :

| Champ | Valeur | Pourquoi |
|---|---|---|
| `id` | chemin stable, ex. `/app/accueil` | identifie l'installation ; le changer crée une **seconde** application chez l'utilisateur |
| `name` / `short_name` | `short_name` ≤ 12 caractères | au-delà, iOS tronque sous l'icône |
| `start_url` | `/app/accueil?source=pwa` | le paramètre permet de mesurer les lancements installés |
| `scope` | `/` | tout ce qui reste dans l'application |
| `display` | `standalone` | sans barre d'adresse |
| `display_override` | `['standalone','minimal-ui','browser']` | dégradation ordonnée |
| `background_color` / `theme_color` | identiques au fond réel | sinon un flash de couleur au lancement |
| `icons` | 11 tailles `any` + 2 `maskable` | voir § 3 |
| `shortcuts` | ≤ 3, déclarés dans `app.config.ts` | appui long sur l'icône |

## 2. Service worker

**Servi dynamiquement** par `src/app/sw.js/route.ts`, avec la version du build
injectée :

```ts
const VERSION =
  process.env.NEXT_PUBLIC_VERSION ??
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  'local';
```

Conséquence : chaque déploiement produit un fichier différent, le navigateur
détecte le changement, réinstalle le worker et purge les caches précédents.
C'est la parade la plus efficace au problème classique du « service worker qui
sert une version périmée pendant des jours ».

### Règle de cache

**Aucune donnée métier n'est jamais mise en cache.** Trois raisons vérifiées :

1. Supabase est sur un autre domaine — les requêtes ne sont pas interceptées ;
2. les pages authentifiées ne doivent jamais être stockées : sur un appareil
   partagé, elles restitueraient l'écran de quelqu'un d'autre ;
3. seuls les fichiers statiques immuables (`/_next/static/`) et les images
   publiques sont conservés.

Précharger uniquement : la page hors ligne, le manifeste, deux icônes, le
symbole. `catch(() => undefined)` sur le préchargement — une ressource
manquante ne doit jamais empêcher l'installation du worker.

### Points critiques

⚠ **Pas de `clients.claim()`.** Prendre le contrôle d'un onglet déjà ouvert
interrompt la navigation en cours. Le worker pilote la page au chargement
suivant, ce qui suffit.

⚠ **Relayer les redirections en mode `manual`.** Sans cela, un worker casse
les redirections du middleware et la garde d'authentification tombe en erreur.

⚠ **Purger par préfixe et version** à l'activation :

```js
caches.keys().then(noms => Promise.all(
  noms.filter(n => n.startsWith(PREFIXE) && !n.endsWith(VERSION))
      .map(n => caches.delete(n))
));
```

**Mise à jour explicite.** Le worker écoute `SKIP_WAITING` ; le composant
`ServiceWorker` détecte une nouvelle version et propose de recharger. Ne pas
recharger d'autorité : l'utilisateur perdrait sa saisie en cours.

## 3. Icônes

`python3 scripts/generer-icones.py` produit les 21 fichiers de `public/icons/`
depuis un seul symbole source, plus les écrans de démarrage iOS.

⚠ **Le piège des marges.** Le symbole source touche les bords de son fichier ;
toute icône générée avec une marge insuffisante est **rognée** par les masques
d'iOS et d'Android. Le script recadre le symbole sur son contenu réel puis
applique :

- **80 % de la largeur** pour les icônes standard ;
- **54 % pour les icônes maskable** — un carré inscrit dans le cercle de
  sécurité d'Android ne mesure que 0,8/√2 ≈ 56 % du côté.

Le script vérifie ensuite qu'aucun logo ne touche un bord.

⚠ **Le cache d'icônes est féroce.** iOS conserve l'icône d'une application
installée quasi indéfiniment. Deux parades appliquées ensemble :

1. un paramètre de version sur chaque URL d'icône (`?v=4`), incrémenté à
   chaque changement de logo ;
2. accepter que les installations existantes gardent l'ancienne icône jusqu'à
   réinstallation. Il n'existe pas de moyen de forcer la mise à jour.

Régénérer après **tout** changement de logo.

## 4. Installation

### iPhone / iPad

Safari uniquement. Il n'existe **aucune** invite automatique : l'utilisateur
doit faire Partager → « Sur l'écran d'accueil ». D'où un écran d'aide dédié,
qui reprend mot pour mot les intitulés du système.

Points de vigilance iOS :

- `apple-mobile-web-app-capable` = `yes` et `appleWebApp` dans les métadonnées ;
- écrans de démarrage : **une balise `apple-touch-startup-image` par
  résolution** (Coparentalité Zen en déclare 13). Sans elles, écran blanc au
  lancement ;
- `viewportFit: 'cover'` + `min-h-dvh` pour l'encoche et la barre d'accueil ;
- ⚠ depuis iPadOS 13, un iPad se présente comme un Mac : seul le support
  tactile permet de les distinguer.

### Android

Chrome propose l'installation automatiquement si le manifeste est valide, une
icône 192 et une 512 existent, et le site est en HTTPS. Le socle capte
`beforeinstallprompt` pour proposer le bouton au bon moment plutôt que de
subir la bannière du navigateur.

### Détection

`src/lib/installation.ts` — fonctions **pures**, donc testables sans
navigateur :

```ts
estInstallee(correspond, standaloneIOS)   // display-mode: standalone
                                          // | fullscreen | minimal-ui
                                          // | navigator.standalone (iOS)
detecterPlateforme(agent, tactile)        // 'ios' | 'android' | 'bureau'
etapesInstallation(plateforme)            // marche à suivre
```

Aucun signal n'est universel : `display-mode: standalone` est la norme,
`navigator.standalone` la propriété historique de Safari. Tester les deux.

## 5. Pièges vérifiés

⚠ **`Notification?.permission` plante si le global `Notification` n'existe
pas.** L'optional chaining ne protège pas d'un identifiant inexistant. Écrire :

```js
const supporte = typeof Notification !== 'undefined';
```

⚠ **`mailto:` abandonne silencieusement depuis une PWA installée sur iOS.**
Le lien ne fait rien du tout. Remplacer par l'API Presse-papiers avec
confirmation visible.

⚠ **L'impression native iOS convertit une page en PDF** sans aucune
bibliothèque embarquée. C'est la solution la plus légère pour un export
imprimable.

⚠ **Une PWA installée depuis un ancien domaine y reste indéfiniment.** D'où la
canonisation dans le middleware (voir `03-GITHUB-VERCEL.md` § 6.3).

⚠ **Le stockage local n'est pas garanti sur iOS** : Safari peut purger les
données d'un site peu visité. Ne jamais faire dépendre une donnée importante
du seul stockage navigateur.

## 6. Tests PWA

Automatisables (dans `e2e/`) :

- [ ] `/manifest.webmanifest` répond 200 avec un JSON valide
- [ ] `name`, `short_name`, `start_url`, `display`, icônes 192 et 512 présents
- [ ] `/sw.js` répond 200 en `application/javascript`
- [ ] la version du worker change entre deux builds
- [ ] `/hors-ligne` répond 200
- [ ] toutes les icônes déclarées existent réellement (pas de 404)

Manuels, sur appareil réel — **obligatoires avant la bêta** :

- [ ] installation iPhone, icône correcte et non rognée
- [ ] écran de démarrage sans flash blanc
- [ ] `short_name` non tronqué sous l'icône
- [ ] navigation sans barre d'adresse
- [ ] mode avion → page hors ligne
- [ ] déploiement d'une nouvelle version → invite de mise à jour
- [ ] installation Android, icône maskable correcte dans le lanceur
- [ ] raccourcis (appui long) fonctionnels
