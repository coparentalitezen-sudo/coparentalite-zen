import { NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { verifierVisuel } from '@/lib/marketing/signature';
import { rendrePlanche } from '@/lib/marketing/rendu';
import {
  lireContenuParReference, rangFormat, NOM_BOUTIQUE, type FormatVisuelProduit,
} from '@/lib/copilote/depot-contenus';

/**
 * Visuel d'une publication produit, lu par Meta et par Pinterest.
 *
 * Même charte et même conversion JPEG que les visuels marketing (Instagram
 * refuse le PNG). L'adresse est signée : sans signature, on pourrait
 * parcourir les références et lire une publication rejetée.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FORMATS: FormatVisuelProduit[] = ['carre', 'pinterest'];

export async function GET(requete: Request) {
  const p = new URL(requete.url).searchParams;
  const reference = p.get('ref') ?? '';
  const format = (p.get('f') ?? 'carre') as FormatVisuelProduit;
  if (!FORMATS.includes(format)
    || !verifierVisuel(`copilote:${reference}`, rangFormat(format), p.get('jeton'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const contenu = await lireContenuParReference(reference);
  if (!contenu) return new NextResponse('Not found', { status: 404 });

  try {
    const rendu = await rendrePlanche({
      texte: contenu.accroche,
      appel: contenu.appelVisuel,
      surtitre: `Boutique ${NOM_BOUTIQUE()}`,
      couverture: true,
    }, format);
    const image = PNG.sync.read(Buffer.from(await rendu.arrayBuffer()));
    const converti = jpeg.encode({ data: image.data, width: image.width, height: image.height }, 88);
    return new NextResponse(new Uint8Array(converti.data), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(converti.data.length),
        // Le texte d'une publication ne change pas après enregistrement.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    });
  } catch (e) {
    console.error('[copilote] visuel', reference, e);
    return new NextResponse('Erreur de rendu', { status: 500 });
  }
}
