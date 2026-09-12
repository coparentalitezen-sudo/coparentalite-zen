import { NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { verifierVisuel } from '@/lib/marketing/signature';
import { contenuDeReference, rendreVisuelVideo } from '@/lib/marketing/rendu';
import { planchesVideo } from '@/lib/marketing/video-contenu';

/**
 * Planche vidéo d'un Reel, accessible sans session, pour que
 * scripts/video-render.ts (GitHub Actions) et video-test.ts puissent
 * l'assembler en vidéo (video.ts).
 *
 * Sœur de /api/marketing/visuel-public, pas un remplacement : cette route
 * sert la mise en page vidéo (video-contenu.ts, rendreVisuelVideo), l'autre
 * continue de servir les planches statiques exactement comme avant.
 *
 * L'index porte sur la liste des planches vidéo, produite par
 * planchesVideo(contenu) — pas sur contenu.pages, qu'une planche source
 * dépassant quinze mots ne rejoint plus une fois découpée en plusieurs
 * planches vidéo.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(requete: Request) {
  const url = new URL(requete.url);
  const reference = url.searchParams.get('ref') ?? '';
  const index = Number(url.searchParams.get('index') ?? '0');
  const jeton = url.searchParams.get('jeton');

  if (!Number.isInteger(index) || index < 0 || !verifierVisuel(reference, index, jeton)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const contenu = contenuDeReference(reference, base);
  if (!contenu) return new NextResponse('Not found', { status: 404 });

  const planche = planchesVideo(contenu)[index];
  if (!planche) return new NextResponse('Not found', { status: 404 });

  try {
    const rendu = await rendreVisuelVideo(planche.texte);
    const brut = Buffer.from(await rendu.arrayBuffer());
    const image = PNG.sync.read(brut);
    const converti = jpeg.encode(
      { data: image.data, width: image.width, height: image.height },
      88,
    );

    return new NextResponse(new Uint8Array(converti.data), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(converti.data.length),
        // Une référence et un index donnés produisent toujours la même
        // image : voir le raisonnement identique dans visuel-public.
        'Cache-Control':
          'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400, immutable',
      },
    });
  } catch (e) {
    return new NextResponse(
      `Rendu impossible : ${e instanceof Error ? e.message : String(e)}`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}
