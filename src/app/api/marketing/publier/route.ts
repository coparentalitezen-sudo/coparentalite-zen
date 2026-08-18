import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { configurationMeta, publierImageInstagram, publierFacebook, expurger } from '@/lib/marketing/meta';
import { urlVisuelPublic } from '@/lib/marketing/signature';
import { contenuDeReference } from '@/lib/marketing/rendu';
import { reserverPublication, conclurePublication, enregistrerSemaine } from '@/lib/marketing/depot';

/**
 * Publication d'un contenu, une plateforme à la fois.
 *
 * Déclenchée par l'exploitant, jamais par une tâche planifiée : la
 * planification viendra plus tard, et seulement une fois cette route éprouvée
 * sur des publications réelles.
 *
 * TROIS PROTECTIONS CONTRE LE DOUBLON
 *  1. La ligne est réservée en base avant l'appel à Meta. Publier d'abord et
 *     enregistrer ensuite laisserait une fenêtre où un incident réseau
 *     produirait un doublon invisible.
 *  2. La clé d'idempotence est unique : deux demandes simultanées ne peuvent
 *     pas réserver la même ligne.
 *  3. Une publication déjà réussie est refusée, avec son identifiant Meta en
 *     réponse plutôt qu'une erreur sèche.
 *
 * L'accord explicite est exigé dans le corps de la requête. Une route de
 * publication qu'un simple appel suffit à déclencher est une publication
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

  const reference = typeof corps.reference === 'string' ? corps.reference : '';
  const plateforme = corps.plateforme === 'facebook' ? 'facebook' : 'instagram';
  const page = Number(corps.page ?? 0);

  if (corps.confirmation !== true) {
    return NextResponse.json({
      message: 'Accord explicite requis : ajoutez "confirmation": true.',
    }, { status: 400 });
  }

  const config = configurationMeta();
  if (!config) return NextResponse.json({ message: 'Meta non configuré.' }, { status: 503 });

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

  // La semaine est enregistrée d'abord : le contenu doit exister en base pour
  // qu'une publication puisse s'y rattacher.
  await enregistrerSemaine(new Date(), base);

  const contenu = contenuDeReference(reference, base);
  if (!contenu || !contenu.pages[page]) {
    return NextResponse.json({ message: 'Contenu ou planche introuvable.' }, { status: 404 });
  }

  const urlImage = urlVisuelPublic(base, reference, page);
  if (!urlImage) {
    return NextResponse.json({ message: 'Visuel non signable : CRON_SECRET manquant.' }, { status: 503 });
  }

  const reservation = await reserverPublication(reference, plateforme);
  if (!reservation.ok) {
    return NextResponse.json({
      message: reservation.erreur,
      meta_media_id: reservation.deja?.metaMediaId ?? null,
    }, { status: reservation.deja?.statut === 'publiee' ? 409 : 500 });
  }

  const resultat = plateforme === 'instagram'
    ? await publierImageInstagram(config, urlImage, contenu.legendeInstagram, contenu.texteAlternatif)
    : await publierFacebook(config, urlImage, contenu.legendeFacebook);

  const idPublication = reservation.deja!.id;

  if (!resultat.ok) {
    const message = expurger(resultat.erreur ?? 'Échec sans message.', config.jeton);
    await conclurePublication(idPublication, false, undefined, message);
    return NextResponse.json({ publie: false, plateforme, erreur: message }, { status: 502 });
  }

  const metaId = (resultat.donnees as { id?: string; post_id?: string }).post_id
    ?? (resultat.donnees as { id?: string }).id ?? null;

  await conclurePublication(idPublication, true, metaId ?? undefined);

  return NextResponse.json({
    publie: true,
    plateforme,
    reference,
    meta_media_id: metaId,
    // L'adresse permet de vérifier de ses yeux que le contenu existe vraiment,
    // plutôt que de se fier au seul identifiant renvoyé.
    verifier: plateforme === 'instagram'
      ? `https://www.instagram.com/coparentalitezen/`
      : `https://www.facebook.com/${config.pageId}`,
  });
}
