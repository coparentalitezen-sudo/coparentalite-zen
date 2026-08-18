import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { publierContenu } from '@/lib/marketing/publication';
import { configurationMeta } from '@/lib/marketing/meta';

/**
 * Publication d'un contenu, une plateforme à la fois.
 *
 * La logique vit dans un module partagé avec l'interface d'administration :
 * la dupliquer ici la ferait diverger au premier correctif.
 *
 * L'accord doit figurer explicitement dans le corps de la requête. Une route
 * de publication qu'un simple appel suffit à déclencher est une publication
 * accidentelle en attente.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(requete: Request) {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) return new NextResponse('Not found', { status: 404 });

  let corps: Record<string, unknown>;
  try { corps = (await requete.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ message: 'Requête illisible.' }, { status: 400 }); }

  if (corps.confirmation !== true) {
    return NextResponse.json({
      message: 'Accord explicite requis : ajoutez "confirmation": true.',
    }, { status: 400 });
  }

  const reference = typeof corps.reference === 'string' ? corps.reference : '';
  const plateforme = corps.plateforme === 'facebook' ? 'facebook' : 'instagram';
  const page = Number(corps.page ?? 0);

  const r = await publierContenu(reference, plateforme, page);

  if (!r.ok) {
    return NextResponse.json({
      publie: false, plateforme, erreur: r.erreur, meta_media_id: r.metaId ?? null,
    }, { status: r.dejaPublie ? 409 : 502 });
  }

  const config = configurationMeta();
  return NextResponse.json({
    publie: true,
    plateforme,
    reference,
    meta_media_id: r.metaId,
    // L'adresse permet de vérifier de ses yeux que le contenu existe vraiment,
    // plutôt que de se fier au seul identifiant renvoyé.
    verifier: plateforme === 'instagram'
      ? 'https://www.instagram.com/coparentalitezen/'
      : `https://www.facebook.com/${config?.pageId ?? ''}`,
  });
}
