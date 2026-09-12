import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

/**
 * Directives d'exploration.
 *
 * Le site n'en avait aucune, pas plus qu'il n'avait de plan : les robots
 * découvraient l'accueil et rien d'autre, et une recherche « site: » ne
 * remontait aucune page.
 *
 * L'espace connecté, l'administration et les points d'entrée techniques sont
 * exclus : ils exigent une session, les faire explorer ne produirait que des
 * redirections et dépenserait le budget d'exploration sur des pages qui ne
 * répondront jamais à personne.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/admin/', '/api/', '/auth/', '/invitation/', '/reinitialisation/'],
    },
    sitemap: new URL('/sitemap.xml', BASE).toString(),
  };
}
