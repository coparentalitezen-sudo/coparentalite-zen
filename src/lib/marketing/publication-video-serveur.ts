import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import { publicationAutorisee, conclurePublication } from './depot';
import { avecMotsDiese } from './mots-diese';
import { configurationPrete, publierReelInstagram, publierReelFacebook, vignetteReelFacebook, expurger } from './meta';
import { signaler } from './alertes';
import { adresseSignee, telechargerVideo, COLONNES_VIDEO, type LigneVideo } from './videos';
import {
  publierVideo, apresIssue, etatReservationExistante,
  type Dependances, type Plateforme, type RapportVideo, type Reservation,
} from './publication-video';

/**
 * Branchement de publierVideo() sur Supabase et l'API Graph de Meta, pour les
 * Reels du générateur (Instagram et Facebook). YouTube garde son propre
 * circuit (src/lib/youtube/publication.ts), qui applique les mêmes contrôles.
 */
type Service = NonNullable<ReturnType<typeof supabaseService>>;

export async function lireVideo(service: Service, cle: string): Promise<LigneVideo | null> {
  const { data } = await service.from('marketing_videos').select(COLONNES_VIDEO).eq('cle', cle).maybeSingle();
  return (data as LigneVideo | null) ?? null;
}

/** Applique l'issue d'une publication au compteur d'échecs ; suspend la plateforme au deuxième échec. */
export async function appliquerIssue(service: Service, plateforme: string, ok: boolean, motif?: string): Promise<void> {
  const { data } = await service.from('marketing_parametres')
    .select('echecs_consecutifs, actif').eq('plateforme', plateforme).maybeSingle();
  if (!data) return;
  const suite = apresIssue(data.echecs_consecutifs ?? 0, ok);
  if (suite.suspendre && data.actif) {
    const raison = `Suspendu automatiquement après ${suite.echecs} échecs consécutifs : ${expurger(motif ?? 'motif inconnu').slice(0, 300)}`;
    await service.from('marketing_parametres').update({
      echecs_consecutifs: suite.echecs, actif: false, suspendu_motif: raison, updated_at: new Date().toISOString(),
    }).eq('plateforme', plateforme);
    await signaler(service, {
      cle: `suspension:${plateforme}:${new Date().toISOString().slice(0, 13)}`, niveau: 'suspension',
      sujet: `${plateforme} suspendu automatiquement`,
      message: `${raison}\n\nAucune publication ne partira sur ${plateforme} tant que vous ne l’aurez pas réactivée dans l’administration.`,
    });
    return;
  }
  await service.from('marketing_parametres').update({ echecs_consecutifs: suite.echecs }).eq('plateforme', plateforme);
}

function dependances(service: Service, maintenant: Date): Dependances {
  return {
    maintenant,
    autorisation: async (p) => {
      if (p === 'tiktok') {
        const { data } = await service.from('marketing_parametres').select('actif, suspendu_motif').eq('plateforme', 'tiktok').maybeSingle();
        return { autorisee: false, motif: data?.suspendu_motif ?? 'TikTok bloqué.' };
      }
      return publicationAutorisee(p);
    },
    reglages: async (p) => {
      const { data } = await service.from('marketing_parametres').select('heure, mode').eq('plateforme', p).maybeSingle();
      return data ? { heure: data.heure, mode: data.mode } : null;
    },
    video: (cle) => lireVideo(service, cle),
    reserver: async (reference, p): Promise<Reservation> => {
      const { data: contenu } = await service.from('marketing_contenus').select('id').eq('reference', reference).maybeSingle();
      if (!contenu) throw new Error('Contenu introuvable en base.');
      const cle = `${reference}:${p}`;
      const { data: existante } = await service.from('marketing_publications')
        .select('id, statut, meta_media_id, tentatives, updated_at').eq('cle_idempotence', cle).maybeSingle();
      if (existante) {
        const etat = etatReservationExistante(existante.statut, existante.updated_at, maintenant);
        if (etat === 'deja') return { etat: 'deja', id: existante.id, idExterne: existante.meta_media_id };
        if (etat === 'occupee') return { etat: 'occupee', id: existante.id };
        if (etat === 'interrompue') return { etat: 'interrompue', id: existante.id };
        // Reprise sûre : mise à jour conditionnelle, une seule exécution l'obtient.
        const { data: prise } = await service.from('marketing_publications')
          .update({ statut: 'envoyee', tentatives: existante.tentatives + 1, updated_at: new Date().toISOString() })
          .eq('id', existante.id).eq('statut', existante.statut).eq('tentatives', existante.tentatives).select('id');
        return prise?.length ? { etat: 'reservee', id: existante.id } : { etat: 'occupee', id: existante.id };
      }
      // Clé d'idempotence unique en base : deux insertions simultanées, une seule réussit.
      const { data: creee, error } = await service.from('marketing_publications')
        .insert({ contenu_id: contenu.id, plateforme: p, cle_idempotence: cle, statut: 'envoyee', tentatives: 1 })
        .select('id').single();
      if (error || !creee) return { etat: 'occupee' };
      return { etat: 'reservee', id: creee.id };
    },
    marquerAVerifier: async (id, motif) => {
      await service.from('marketing_publications').update({ statut: 'a_verifier', derniere_erreur: motif, updated_at: new Date().toISOString() }).eq('id', id);
    },
    conclure: (id, ok, idExterne, erreur) => conclurePublication(id, ok, idExterne, erreur),
    publier: async (p, ligne) => {
      if (p !== 'instagram' && p !== 'facebook') return { ok: false, erreur: `Plateforme ${p} non prise en charge ici.` };
      const prete = await configurationPrete();
      if (!prete.ok) return { ok: false, erreur: prete.erreur };
      const config = prete.donnees!;
      const { data: contenu } = await service.from('marketing_contenus')
        .select('legende_instagram, legende_facebook').eq('reference', ligne.reference).maybeSingle();
      if (!contenu) return { ok: false, erreur: 'Légendes introuvables.' };
      // Mots-dièse du sujet de la vidéo (scénario rendu), à défaut ceux de la garde alternée.
      const { data: video } = await service.from('marketing_videos').select('scenario').eq('cle', ligne.cle).maybeSingle();
      const niche = String((video?.scenario as { niche?: string } | null)?.niche ?? 'garde-alternee');
      // Adresse signée créée à l'instant, valable quinze minutes : le temps que Meta récupère la vidéo.
      const url = await adresseSignee(service, ligne.chemin_video!);
      // La vignette n'est jamais bloquante : sans elle, la plateforme choisit une image du film.
      const couverture = ligne.chemin_affiche
        ? await adresseSignee(service, ligne.chemin_affiche).catch(() => undefined) : undefined;
      const res = p === 'instagram'
        ? await publierReelInstagram(config, url, avecMotsDiese(contenu.legende_instagram, niche), undefined, undefined, couverture)
        : await publierReelFacebook(config, url, avecMotsDiese(contenu.legende_facebook, niche));
      if (!res.ok) return { ok: false, erreur: expurger(res.erreur ?? 'Échec sans message.', config.jeton) };
      if (p === 'facebook' && ligne.chemin_affiche && res.donnees?.id) {
        try {
          const image = await telechargerVideo(service, ligne.chemin_affiche);
          const v = await vignetteReelFacebook(config, res.donnees.id, image);
          if (!v.ok) {
            await signaler(service, {
              cle: `vignette:facebook:${ligne.reference}`, niveau: 'information',
              sujet: 'Facebook : vignette non posée',
              message: `Le Reel ${ligne.reference} est bien publié, avec la miniature choisie par Facebook. Motif : ${v.erreur}`,
            });
          }
        } catch (e) {
          await signaler(service, {
            cle: `vignette:facebook:${ligne.reference}`, niveau: 'information',
            sujet: 'Facebook : vignette non posée',
            message: `Le Reel ${ligne.reference} est bien publié, avec la miniature choisie par Facebook. Motif : ${(e as Error).message}`,
          });
        }
      }
      return { ok: true, idExterne: res.donnees?.id };
    },
    issue: (p, ok, motif) => appliquerIssue(service, p, ok, motif),
    signaler: (cle, niveau, sujet, message) => signaler(service, { cle, niveau, sujet, message }),
  };
}

/** Publie la vidéo animée d'un Reel sur Instagram ou Facebook (ou rend compte de pourquoi elle ne part pas). */
export async function publierReelAnime(
  reference: string, plateforme: Plateforme, options: { ignorerHeure?: boolean; maintenant?: Date } = {},
): Promise<RapportVideo> {
  const service = supabaseService();
  if (!service) return { cle: reference, plateforme, statut: 'echec', publie: false, motif: 'Service indisponible.' };
  return publierVideo(dependances(service, options.maintenant ?? new Date()), reference, plateforme, options);
}
