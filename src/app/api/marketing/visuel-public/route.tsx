import { NextResponse } from 'next/server';
import { verifierVisuel } from '@/lib/marketing/signature';
import { contenuDeReference, rendreVisuel } from '@/lib/marketing/rendu';

/**
 * Visuel accessible sans session, pour que Meta puisse le récupérer.
 *
 * Meta va chercher le média lui-même au moment de la publication : une route
 * protégée par une session lui renverrait un 404, et la publication échouerait
 * sans que rien n'indique pourquoi.
 *
 * L'adresse est donc publique mais signée. Sans signature, elle serait
 * énumérable : n'importe qui pourrait parcourir les références et lire les
 * contenus avant leur publication, y compris ceux qui ont été rejetés.
 *
 * Une signature invalide reçoit le même 404 qu'une référence inexistante. Deux
 * réponses distinctes indiqueraient qu'une référence existe, ce qui est déjà
 * une information.
 */
export const dynamic = 'force-dynamic';

export async function GET(requete: Request) {
  const url = new URL(requete.url);
  const reference = url.searchParams.get('ref') ?? '';
  const page = Number(url.searchParams.get('page') ?? '0');
  const jeton = url.searchParams.get('jeton');

  if (!Number.isInteger(page) || page < 0 || !verifierVisuel(reference, page, jeton)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const contenu = contenuDeReference(reference, base);
  if (!contenu || !contenu.pages[page]) return new NextResponse('Not found', { status: 404 });

  const reponse = await rendreVisuel(contenu, page);
  // Meta peut récupérer la même image plusieurs fois lors d'un réessai : la
  // laisser en cache évite de la redessiner à chaque tentative.
  reponse.headers.set('Cache-Control', 'public, max-age=3600, immutable');
  return reponse;
}
