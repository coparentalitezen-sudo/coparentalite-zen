import { NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { contenuPinterest } from '@/lib/marketing/pinterest';
import { rendreVisuel } from '@/lib/marketing/rendu';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(requete: Request) {
  const reference = new URL(requete.url).searchParams.get('ref') ?? '';
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const contenu = contenuPinterest(reference, base);
  if (!contenu) return new NextResponse('Not found', { status: 404 });

  try {
    const rendu = await rendreVisuel(contenu, 0, 'pinterest');
    const brut = Buffer.from(await rendu.arrayBuffer());
    const image = PNG.sync.read(brut);
    const converti = jpeg.encode({ data: image.data, width: image.width, height: image.height }, 88);
    return new NextResponse(new Uint8Array(converti.data), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(converti.data.length),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (erreur) {
    console.error('[pinterest] rendu impossible', erreur instanceof Error ? erreur.message : erreur);
    return new NextResponse('Rendu impossible', { status: 500 });
  }
}
