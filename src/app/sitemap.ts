import type { MetadataRoute } from 'next';
import { PAGES_THEMATIQUES } from '@/lib/marketing/pages-thematiques';

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

/**
 * Plan du site.
 *
 * Les pages de conseil n'y figurent plus. Leur titre était l'accroche d'une
 * publication sociale, que personne ne tape dans un moteur, et une
 * quarantaine de textes s'y répartissaient sur plus de quatre-vingts adresses.
 * Déclarées, elles diluaient le site ; elles restent servies et marquées
 * `noindex`, pour les épingles Pinterest qui y mènent encore.
 *
 * Les pages thématiques, construites sur une intention de recherche, les
 * remplacent dans le plan : `PAGES_THEMATIQUES` en est la source unique.
 *
 * Les priorités ne valent qu'entre elles : elles disent quelle page compte le
 * plus sur ce site, pas comment ce site se compare aux autres.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();

  const fixes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: maintenant, changeFrequency: 'weekly', priority: 1 },
    ...PAGES_THEMATIQUES.map((page) => ({
      url: new URL(page.chemin, BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    {
      url: new URL('/quiz', BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: new URL('/aide', BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: new URL('/contact', BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: new URL('/cgu', BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'yearly',
      priority: 0.1,
    },
    {
      url: new URL('/confidentialite', BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'yearly',
      priority: 0.1,
    },
    {
      url: new URL('/mentions-legales', BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'yearly',
      priority: 0.1,
    },
  ];

  return fixes;
}
