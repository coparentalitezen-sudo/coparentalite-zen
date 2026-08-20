import { genererSemaine } from '@/lib/marketing/generateur';
import { lireParametres, lireStatuts } from '@/lib/marketing/depot';
import { creerFluxPinterest } from '@/lib/marketing/pinterest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const contenus = genererSemaine(new Date(), base);
  const [statuts, parametres] = await Promise.all([
    lireStatuts(contenus.map((contenu) => contenu.reference)),
    lireParametres(),
  ]);
  const publiables = parametres?.actif
    ? parametres.mode === 'automatique'
      ? contenus
      : contenus.filter((contenu) =>
        ['valide', 'publie'].includes(statuts[contenu.reference]?.statut ?? ''))
    : [];
  const flux = creerFluxPinterest(publiables, base);

  return new Response(flux, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
