import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { verifierVisuel } from '@/lib/marketing/signature';
import { contenuDeReference, rendreVisuel } from '@/lib/marketing/rendu';

/**
 * Visuel accessible sans session, pour que Meta puisse le récupérer.
 *
 * POURQUOI DU JPEG ET NON DU PNG
 * L'API de publication Instagram n'accepte que le JPEG. Un PNG parfaitement
 * valide est refusé avec « Only photo or video can be accepted as media
 * type » — un message qui laisse croire que l'adresse ne renvoie pas une
 * image, alors qu'elle en renvoie une, dans le mauvais format. Le moteur de
 * rendu ne produisant que du PNG, la conversion se fait ici.
 *
 * L'adresse est publique mais signée. Sans signature, elle serait énumérable :
 * n'importe qui pourrait parcourir les références et lire les contenus avant
 * leur publication, y compris ceux qui ont été rejetés.
 *
 * Une signature invalide reçoit le même 404 qu'une référence inexistante. Deux
 * réponses distinctes indiqueraient qu'une référence existe, ce qui est déjà
 * une information.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  const rendu = await rendreVisuel(contenu, page);
  const png = Buffer.from(await rendu.arrayBuffer());

  // Qualité 88 : au-delà, le poids grimpe sans gain visible sur un aplat de
  // couleur et du texte ; en deçà, des artefacts apparaissent sur les lettres.
  const jpeg = await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toBuffer();

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.length),
      // Meta peut récupérer la même image plusieurs fois lors d'un réessai.
      'Cache-Control': 'public, max-age=3600, immutable',
    },
  });
}
