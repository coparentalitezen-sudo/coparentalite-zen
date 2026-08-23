import { NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { contenuPinterest } from '@/lib/marketing/pinterest';
import { rendreVisuel } from '@/lib/marketing/rendu';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(requete: Request) {
  const parametres = new URL(requete.url).searchParams;
  const reference = parametres.get('ref') ?? '';
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const contenu = contenuPinterest(reference, base);
  if (!contenu) return new NextResponse('Not found', { status: 404 });

  /*
   * La planche demandée, la couverture par défaut.
   *
   * Le paramètre vient d'une URL publique, donc de n'importe qui : une valeur
   * hors bornes produirait un accès indéfini et une erreur de rendu. On la
   * ramène dans l'intervalle plutôt que de refuser, l'image restant alors
   * valide quoi qu'on demande.
   */
  const demande = Number(parametres.get('page') ?? '0');
  const page = Number.isFinite(demande)
    ? Math.min(Math.max(Math.trunc(demande), 0), contenu.pages.length - 1)
    : 0;

  try {
    const rendu = await rendreVisuel(contenu, page, 'pinterest');
    const brut = Buffer.from(await rendu.arrayBuffer());
    const image = PNG.sync.read(brut);
    const converti = jpeg.encode({ data: image.data, width: image.width, height: image.height }, 88);
    return new NextResponse(new Uint8Array(converti.data), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(converti.data.length),
        // Déterministe pour une référence et une planche données : le CDN
        // peut le garder indéfiniment, ce qui évite un rendu complet à chaque
        // passage de Pinterest sur le flux.
        'Cache-Control':
          'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800',
      },
    });
  } catch (erreur) {
    console.error('[pinterest] rendu impossible', erreur instanceof Error ? erreur.message : erreur);
    return new NextResponse('Rendu impossible', { status: 500 });
  }
}
