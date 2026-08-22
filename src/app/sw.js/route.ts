import { NextResponse } from 'next/server';

/**
 * Service worker servi dynamiquement pour y injecter la version du build.
 * Conséquence : chaque déploiement produit un fichier différent, le navigateur
 * réinstalle le worker et purge les caches de la version précédente.
 *
 * RÈGLE DE CACHE — aucune donnée métier n'est jamais mise en cache :
 *   • Supabase est sur un autre domaine : les requêtes ne sont pas interceptées ;
 *   • les pages de /app/* sont authentifiées : jamais stockées (un appareil
 *     partagé ne doit pas restituer l'écran d'un autre parent) ;
 *   • seuls les fichiers statiques et immuables sont conservés.
 */
export const dynamic = 'force-dynamic';

const VERSION =
  process.env.NEXT_PUBLIC_VERSION ??
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  'local';

export async function GET() {
  const sw = `
// Coparentalité Zen — service worker (version ${VERSION})
const VERSION = '${VERSION}';
const CACHE_STATIQUE = 'czen-statique-' + VERSION;
const CACHE_IMAGES = 'czen-images-' + VERSION;
const PAGE_HORS_LIGNE = '/hors-ligne';

// Coquille minimale : uniquement des ressources publiques et non personnelles
const PRECHARGE = [
  PAGE_HORS_LIGNE,
  '/manifest.webmanifest?v=4',
  '/icons/icon-192.png?v=4',
  '/icons/icon-512.png?v=4',
  '/symbole.png?v=4',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIQUE)
      .then((c) => c.addAll(PRECHARGE))
      .catch(() => undefined)   // une ressource manquante ne doit pas bloquer l'installation
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(
      noms.filter((n) => n.startsWith('czen-') && !n.endsWith(VERSION))
          .map((n) => caches.delete(n))
    );
    // Pas de clients.claim() : prendre le contrôle d'un onglet déjà ouvert
    // interrompt la navigation en cours. Le worker pilote la page dès le
    // chargement suivant, ce qui suffit et évite toute interférence.
  })());
});

// L'application peut demander l'activation immédiate d'une nouvelle version
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function estStatiqueImmuable(url) {
  return url.pathname.startsWith('/_next/static/');
}
function estImagePublique(url) {
  return /^\\/(icons|splash)\\//.test(url.pathname)
      || /\\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);
}

/* ---------- Notifications poussées ---------- */

/*
 * Une notification arrive : le service worker l'affiche même application
 * fermée. Le message est chiffré de bout en bout — le serveur de distribution
 * ne peut pas le lire, seul cet appareil le déchiffre.
 */
self.addEventListener('push', (event) => {
  let contenu = {};
  try {
    contenu = event.data ? event.data.json() : {};
  } catch (e) {
    contenu = { title: 'Coparentalité Zen' };
  }

  const titre = contenu.title || 'Coparentalité Zen';
  const options = {
    body: contenu.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    /* Regroupe les alertes similaires plutôt que d'empiler les bannières */
    tag: contenu.tag || 'coparentalite-zen',
    renotify: false,
    data: { url: contenu.url || '/app/notifications' },
    lang: 'fr',
  };
  /*
   * La pastille est posée ici, et pas seulement à l'ouverture.
   *
   * C'est tout l'intérêt : application fermée, personne n'exécute le code de
   * la cloche. Sans cet appel, le chiffre n'apparaîtrait sur l'icône qu'après
   * que le parent a ouvert l'application — donc trop tard pour l'y faire
   * revenir.
   *
   * Le serveur envoie le décompte quand il le connaît ; à défaut, on
   * incrémente d'une unité, ce qu'aucune API ne permet de faire directement.
   * Un chiffre approché vaut mieux qu'une icône muette.
   */
  const poser = () => {
    if (!self.navigator || !self.navigator.setAppBadge) return Promise.resolve();
    const nombre = typeof contenu.nonLues === 'number' && contenu.nonLues >= 0
      ? contenu.nonLues
      : (compteurLocal += 1);
    return self.navigator.setAppBadge(nombre).catch(() => {});
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(titre, options),
    poser(),
  ]));
});

/*
 * Décompte de secours, le temps que l'application s'ouvre.
 *
 * Il ne survit pas à l'arrêt du service worker, et c'est acceptable : la
 * cloche recale la pastille sur la valeur réelle dès la première ouverture.
 */
let compteurLocal = 0;

/*
 * Toucher la notification ouvre l'écran concerné. Si l'application est déjà
 * ouverte, on y navigue plutôt que d'ouvrir un second onglet.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = (event.notification.data && event.notification.data.url)
    || '/app/notifications';

  // Le décompte de secours repart de zéro : l'application va s'ouvrir et la
  // cloche posera la valeur réelle. Le laisser courir ferait repartir le
  // prochain incrément d'un total déjà lu.
  compteurLocal = 0;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((fenetres) => {
        for (const f of fenetres) {
          if (f.url.includes('/app') && 'focus' in f) {
            f.navigate(cible);
            return f.focus();
          }
        }
        return self.clients.openWindow(cible);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Autre domaine (Supabase, polices distantes…) : jamais intercepté
  if (url.origin !== self.location.origin) return;

  // Données et authentification : toujours réseau, jamais de cache
  if (url.pathname.startsWith('/api/')
      || url.pathname.startsWith('/auth/')
      || url.pathname === '/sw.js') return;

  // Navigations : réseau d'abord, page hors ligne en dernier recours.
  // Aucune page authentifiée n'est stockée.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // « manual » : la redirection éventuelle est renvoyée telle quelle et
        // suivie nativement par le navigateur. Sans cela, la garde
        // d'authentification du middleware (/app/* vers /connexion) provoquerait
        // une erreur de navigation, ou une double navigation fragile.
        return await fetch(req, { redirect: 'manual' });
      } catch {
        const cache = await caches.open(CACHE_STATIQUE);
        return (await cache.match(PAGE_HORS_LIGNE)) ?? Response.error();
      }
    })());
    return;
  }

  // Fichiers de build hachés : immuables, cache d'abord
  if (estStatiqueImmuable(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIQUE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const reponse = await fetch(req);
      if (reponse.ok) cache.put(req, reponse.clone());
      return reponse;
    })());
    return;
  }

  // Images et polices publiques : servies vite, rafraîchies en tâche de fond
  if (estImagePublique(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_IMAGES);
      const hit = await cache.match(req);
      const reseau = fetch(req).then((r) => {
        if (r.ok) cache.put(req, r.clone());
        return r;
      }).catch(() => hit ?? Response.error());
      return hit ?? reseau;
    })());
    return;
  }

  // Tout le reste : réseau, sans stockage
});
`.trimStart();

  return new NextResponse(sw, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
