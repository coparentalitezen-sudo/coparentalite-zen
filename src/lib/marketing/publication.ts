import 'server-only';
import {
  configurationPrete, publierImageInstagram, publierCarrouselInstagram,
  publierFacebook, publierAlbumFacebook,
  expurger, type ResultatMeta,
} from './meta';
import { publierReelAnime } from './publication-video-serveur';
import { urlVisuelPublic } from './signature';
import { contenuDeReference } from './rendu';
import {
  reserverPublication, conclurePublication, enregistrerSemaine, publicationAutorisee,
} from './depot';

/**
 * Publication d'un contenu.
 *
 * Extraite de la route HTTP parce qu'elle est appelée de deux endroits :
 * l'interface d'administration et la route elle-même. La version précédente
 * faisait dialoguer les deux par un appel réseau de l'application vers
 * elle-même, en recopiant les cookies de session — un aller-retour fragile,
 * qui répondait 404 dès que la session ne se transmettait pas, et qui
 * n'apportait rien puisque l'appelant avait déjà vérifié les droits.
 *
 * Le contrôle d'accès reste donc à la charge de l'appelant. C'est explicite :
 * cette fonction publie, elle ne décide pas qui a le droit de publier.
 */

export interface ResultatPublication {
  ok: boolean;
  metaId?: string | null;
  erreur?: string;
  dejaPublie?: boolean;
}

export async function publierContenu(
  reference: string,
  plateforme: 'instagram' | 'facebook',
  page = 0,
): Promise<ResultatPublication> {
  // Chaque plateforme répond d'elle-même. Une publication déclenchée à la
  // main reste soumise à son interrupteur : c'est lui l'arrêt d'urgence, et
  // un arrêt qu'un clic contourne n'arrête rien.
  const autorisation = await publicationAutorisee(plateforme);
  if (!autorisation.autorisee) {
    return { ok: false, erreur: autorisation.motif };
  }

  const prete = await configurationPrete();
  if (!prete.ok) return { ok: false, erreur: prete.erreur };
  const config = prete.donnees!;

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';

  // La semaine est enregistrée d'abord : un contenu doit exister en base pour
  // qu'une publication puisse s'y rattacher.
  await enregistrerSemaine(new Date(), base);

  const contenu = contenuDeReference(reference, base);
  if (!contenu || !contenu.pages[page]) {
    return { ok: false, erreur: 'Contenu ou planche introuvable.' };
  }

  // Les Reels partent uniquement en vidéo animée, rendue et contrôlée hors
  // Vercel (video-gabarit/), par leur propre circuit (même clé d'idempotence).
  // Pas de repli en planches : une vidéo absente ou refusée par ses contrôles
  // ne publie rien, et une alerte part.
  if (contenu.format === 'reel') {
    const r = await publierReelAnime(reference, plateforme, { ignorerHeure: true });
    return r.publie
      ? { ok: true, metaId: r.idExterne ?? null }
      : { ok: false, erreur: `${r.statut} : ${r.motif ?? ''}`.trim(), dejaPublie: r.statut === 'deja' };
  }

  const urlImage = urlVisuelPublic(base, reference, page);
  if (!urlImage) {
    return { ok: false, erreur: 'Visuel non signable : CRON_SECRET manquant.' };
  }

  const reservation = await reserverPublication(reference, plateforme);
  if (!reservation.ok) {
    return {
      ok: false,
      erreur: reservation.erreur,
      metaId: reservation.deja?.metaMediaId ?? null,
      dejaPublie: reservation.deja?.statut === 'publiee',
    };
  }

  // Tout contenu de plusieurs planches part en carrousel sur Instagram. Les
  // contenus « reel » en comptent quatre mais n'ont pas de vidéo : ils
  // partaient en image seule, soit la couverture sans la suite, et la
  // question posée restait sans réponse.
  const estCarrousel = contenu.pages.length >= 2;

  const urlsPlanches = contenu.pages.map((_, i) => urlVisuelPublic(base, reference, i) ?? '');

  // Publication en carrousel (Instagram) ou en album (Facebook) : la forme
  // de repli, qui ne dépend ni de la vidéo ni de son traitement par Meta.
  const publierEnPlanches = async (): Promise<ResultatMeta<unknown>> => (
    plateforme === 'facebook'
      ? estCarrousel
        ? publierAlbumFacebook(config, urlsPlanches, contenu.legendeFacebook)
        : publierFacebook(config, urlImage, contenu.legendeFacebook)
      : estCarrousel
        ? publierCarrouselInstagram(
            config,
            urlsPlanches.map((url) => ({ url, texteAlternatif: contenu.texteAlternatif })),
            contenu.legendeInstagram,
          )
        : publierImageInstagram(
            config, urlImage, contenu.legendeInstagram, contenu.texteAlternatif)
  );

  const resultat: ResultatMeta<unknown> = await publierEnPlanches();

  const idPublication = reservation.deja!.id;

  if (!resultat.ok) {
    const message = expurger(resultat.erreur ?? 'Échec sans message.', config.jeton);
    await conclurePublication(idPublication, false, undefined, message);
    return { ok: false, erreur: message };
  }

  const donnees = resultat.donnees as { id?: string; post_id?: string };
  const metaId = donnees.post_id ?? donnees.id ?? null;
  await conclurePublication(idPublication, true, metaId ?? undefined);

  return { ok: true, metaId };
}
