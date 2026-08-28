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

### 2.1 Mécanisme complet de mise à jour — implémentation

C'est la brique la plus souvent réinventée de travers, et son échec est
silencieux : les utilisateurs restent sur une version ancienne pendant des
jours sans que rien ne le signale. Voici les **cinq pièces** qui doivent
toutes être présentes. Il en manque une et le mécanisme ne fonctionne pas.

**Pièce 1 — Le fichier du worker change à chaque déploiement.**
Le navigateur ne détecte une mise à jour que si l'octet du fichier `/sw.js`
diffère. D'où la version injectée depuis le build (§ 2 ci-dessus). Un worker
servi comme fichier statique inchangé ne déclenchera **jamais** de mise à
jour.

**Pièce 2 — Le worker sait s'activer à la demande.**

```js
// Sans cet écouteur, une nouvelle version reste bloquée en état « waiting »
// jusqu'à ce que TOUS les onglets soient fermés — sur une PWA installée,
// cela peut durer des semaines.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
```

**Pièce 3 — Les anciens caches sont purgés à l'activation.**

```js
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(
      noms.filter((n) => n.startsWith(PREFIXE) && !n.endsWith(VERSION))
          .map((n) => caches.delete(n))
    );
    // Pas de clients.claim() : prendre le contrôle d'un onglet déjà ouvert
    // interrompt la navigation en cours.
  })());
});
```

**Pièce 4 — Le composant client**, monté dans le layout racine. Quatre
responsabilités : enregistrer, détecter, **chercher une mise à jour au retour
dans l'application**, recharger une seule fois.

```tsx
'use client';
import { useEffect, useState } from 'react';

export function ServiceWorker() {
  const [enAttente, setEnAttente] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let annule = false;

    const enregistrer = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // Cas souvent oublié : une version était déjà prête avant ce montage.
        if (reg.waiting) setEnAttente(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener('statechange', () => {
            // « installed » AVEC un contrôleur actif = mise à jour.
            // Sans contrôleur, c'est la première installation : ne rien proposer.
            if (nouveau.state === 'installed'
                && navigator.serviceWorker.controller && !annule) {
              setEnAttente(nouveau);
            }
          });
        });

        // Pièce décisive sur mobile : une PWA installée n'est pas rechargée,
        // elle est mise en arrière-plan. Sans cette recherche au retour,
        // la mise à jour n'est jamais détectée.
        const auRetour = () => {
          if (document.visibilityState === 'visible') reg.update();
        };
        document.addEventListener('visibilitychange', auRetour);
        return () => document.removeEventListener('visibilitychange', auRetour);
      } catch {
        // L'absence de service worker ne doit jamais empêcher l'usage.
      }
    };
    enregistrer();

    // Garde anti-boucle : sans elle, controllerchange peut recharger en boucle.
    let recharge = false;
    const onControllerChange = () => {
      if (recharge) return;
      recharge = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      annule = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!enAttente) return null;

  return (
    <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex
      max-w-md items-center gap-3 rounded-2xl bg-encre px-4 py-3 text-white shadow-lg">
      <p className="min-w-0 flex-1 text-sm font-bold">
        Une nouvelle version est disponible.
      </p>
      <button type="button"
        className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-encre"
        onClick={() => enAttente.postMessage('SKIP_WAITING')}>
        Actualiser
      </button>
    </div>
  );
}
```

**Pièce 5 — Le hash de version affiché dans l'en-tête.** Sans lui, impossible
de savoir quelle version tourne réellement sur un appareil, ni de vérifier
qu'une mise à jour a bien été prise. C'est aussi ce que les testeurs doivent
joindre à chaque signalement.

### 2.2 Ce qui fait échouer la mise à jour

| Symptôme | Cause | Correction |
|---|---|---|
| Aucune invite ne s'affiche jamais | `/sw.js` identique d'un déploiement à l'autre | injecter la version du build dans le fichier |
| L'invite s'affiche à la **première** installation | `navigator.serviceWorker.controller` non vérifié | ne proposer que s'il existe un contrôleur |
| La nouvelle version reste bloquée | pas d'écouteur `SKIP_WAITING` | pièce 2 |
| Sur mobile, rien ne se met à jour pendant des jours | pas de `reg.update()` au retour de veille | pièce 4, `visibilitychange` |
| Rechargement en boucle | pas de garde sur `controllerchange` | drapeau `recharge` |
| Anciens écrans après mise à jour | caches non purgés | pièce 3 |
| La saisie en cours est perdue | rechargement imposé | ne jamais recharger sans action de l'utilisateur |

### 2.3 Comment le vérifier

Aucun de ces défauts n'apparaît en développement local. Test obligatoire, sur
appareil réel :

1. installer la PWA sur le téléphone ;
2. déployer une modification visible (un texte suffit) ;
3. mettre l'application en arrière-plan, attendre, y revenir ;
4. l'invite doit apparaître ; appuyer sur « Actualiser » ;
5. le hash de version doit avoir changé.

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
