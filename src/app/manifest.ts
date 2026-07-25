import type { MetadataRoute } from 'next';

/**
 * Manifeste d'application web.
 * Aucune logique métier : uniquement l'identité d'installation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app/accueil',
    name: 'Coparentalité Zen',
    short_name: 'Copar. Zen',
    description:
      'Planning de garde et budget partagé des parents séparés, dans une seule application simple et apaisante.',
    start_url: '/app/accueil?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait',
    background_color: '#FCF9F6',
    theme_color: '#FCF9F6',
    lang: 'fr',
    dir: 'ltr',
    categories: ['productivity', 'lifestyle', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-48.png', sizes: '48x48', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Ajouter une dépense',
        short_name: 'Ajouter',
        url: '/app/ajouter',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Voir le planning',
        short_name: 'Planning',
        url: '/app/planning',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Dépenses et remboursements',
        short_name: 'Dépenses',
        url: '/app/depenses',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
