import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Coparentalité Zen',
    short_name: 'Copar. Zen',
    description:
      'Planning de garde et budget partagé des parents séparés, dans une seule application simple et apaisante.',
    start_url: '/app/accueil',
    display: 'standalone',
    background_color: '#FCF9F6',
    theme_color: '#FCF9F6',
    lang: 'fr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
