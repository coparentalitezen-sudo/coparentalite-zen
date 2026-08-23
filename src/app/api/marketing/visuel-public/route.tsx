import { NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { verifierVisuel } from '@/lib/marketing/signature';
import { contenuDeReference, rendreVisuel } from '@/lib/marketing/rendu';

/**
 * Visuel accessible sans session, pour que Meta puisse le récupérer.
 *
 * POURQUOI DU JPEG
 * L'API de publication Instagram n'accepte que le JPEG. Un PNG parfaitement
 * valide est refusé avec « Only photo or video can be accepted as media
 * type » — message qui laisse croire que l'adresse ne renvoie pas d'image,
 * alors qu'elle en renvoie une, dans le mauvais format.
 *
 * POURQUOI PAS SHARP
 * La conversion passait d'abord par sharp, une extension native. Ces
 * extensions se construisent sans erreur puis échouent à l'exécution en
 * environnement serverless, où le binaire attendu n'est pas celui présent.
 * L'échec ne se manifeste donc qu'en production, ce qui est le pire moment.
 * pngjs et jpeg-js font le même travail en JavaScript pur : environ 250 ms
 * pour une planche, sans binaire à faire correspondre.
 *
 * L'adresse est publique mais signée : sans signature, elle serait
 * énumérable, et l'on pourrait lire les contenus avant publication, y compris
 * ceux qui ont été rejetés.
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

  try {
    const rendu = await rendreVisuel(contenu, page);
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
        /*
         * Une référence donnée produit toujours la même image : le contenu
         * est régénéré depuis la semaine que porte la référence, jamais
         * modifié après coup. Rien ne justifie donc de le refabriquer.
         *
         * `s-maxage` est la partie qui compte : sans elle, le CDN de Vercel
         * ne garde rien et chaque affichage relance un rendu complet —
         * génération, décodage PNG, réencodage JPEG. Sept planches dépliées
         * dans l'écran de validation, c'étaient sept rendus simultanés.
         *
         * `max-age` reste court : le navigateur n'a pas besoin de conserver
         * des dizaines d'images de validation, le CDN s'en charge.
         */
        'Cache-Control':
          'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400, immutable',
      },
    });
  } catch (e) {
    // La signature ayant déjà été vérifiée, l'appelant est légitime : lui
    // rendre la cause vaut mieux qu'une page blanche, qui obligerait à
    // deviner. Un échec muet ici a déjà coûté une soirée.
    return new NextResponse(
      `Rendu impossible : ${e instanceof Error ? e.message : String(e)}`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}
