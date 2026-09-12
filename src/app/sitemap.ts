import type { MetadataRoute } from 'next';
import { referencesRecentes } from '@/lib/marketing/pinterest';

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

/**
 * Plan du site.
 *
 * Les pages de conseil existaient déjà et étaient servies, mais rien ne les
 * déclarait ni n'y menait : elles n'étaient atteignables que par une épingle
 * Pinterest, canal justement inaccessible. Des dizaines de pages rédigées
 * restaient donc invisibles.
 *
 * Les priorités ne valent qu'entre elles : elles disent quelle page compte le
 * plus sur ce site, pas comment ce site se compare aux autres.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();

  const fixes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: maintenant, changeFrequency: 'weekly', priority: 1 },
    {
      url: new URL('/calendrier-garde-alternee', BASE).toString(),
      lastModified: maintenant,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
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

  const conseils: MetadataRoute.Sitemap = referencesRecentes(BASE).map((reference) => ({
    url: new URL(`/conseils/${encodeURIComponent(reference)}`, BASE).toString(),
    lastModified: maintenant,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...fixes, ...conseils];
}
