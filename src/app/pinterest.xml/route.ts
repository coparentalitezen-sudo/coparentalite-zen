import { genererSemaine } from '@/lib/marketing/generateur';
import {
  lireParametresPlateforme, lireStatuts, publicationAutorisee,
} from '@/lib/marketing/depot';
import { creerFluxPinterest, type ElementFlux } from '@/lib/marketing/pinterest';
import { contenusPourPinterest, urlVisuelProduit } from '@/lib/copilote/depot-contenus';
import { lienSuivi } from '@/lib/copilote/contenus-produits';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const contenus = genererSemaine(new Date(), base);
  const [statuts, parametres, autorisation] = await Promise.all([
    lireStatuts(contenus.map((contenu) => contenu.reference)),
    lireParametresPlateforme('pinterest'),
    publicationAutorisee('pinterest'),
  ]);
  const publiables = autorisation.autorisee && parametres
    ? parametres.mode === 'automatique'
      ? contenus
      : contenus.filter((contenu) =>
        ['valide', 'publie'].includes(statuts[contenu.reference]?.statut ?? ''))
    : [];
  // Publications produits du copilote : déjà validées une à une, elles
  // suivent seulement l'interrupteur du canal, et n'apparaissent qu'à leur date.
  const produits: (ElementFlux & { date: Date })[] = autorisation.autorisee && parametres
    ? (await contenusPourPinterest(new Date().toISOString().slice(0, 10))).flatMap((c) => {
      const image = urlVisuelProduit(base, c.reference, 'pinterest');
      return image ? [{
        guid: c.reference,
        titre: c.titrePinterest,
        lien: lienSuivi(base, c.reference, 'pinterest'),
        description: c.descriptionPinterest,
        image,
        date: new Date(`${c.datePublication}T09:00:00Z`),
      }] : [];
    })
    : [];
  const flux = creerFluxPinterest(publiables, base, produits);

  return new Response(flux, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
