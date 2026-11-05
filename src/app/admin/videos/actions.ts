'use server';

import { revalidatePath } from 'next/cache';
import { supabaseService } from '@/lib/supabase/server';
import { estAdministrateurConnecte } from '@/lib/youtube/acces';
import { executerPublicationYoutube } from '@/lib/youtube/publication';
import { publierReelAnime } from '@/lib/marketing/publication-video-serveur';
import { jourParis } from '@/lib/marketing/horaire';

/**
 * Actions de l'écran des vidéos. Le contrôle d'administrateur est refait à
 * chaque appel : une action serveur est joignable sans passer par l'écran.
 * Aucune de ces actions ne contourne les contrôles bloquants d'une vidéo ni
 * l'idempotence : « Republier » ne republie jamais une vidéo déjà en ligne.
 */
type Retour = { ok: boolean; message: string };
const PLATEFORMES_REGLABLES = ['global', 'instagram', 'facebook', 'youtube', 'pinterest'] as const;
type Reglable = typeof PLATEFORMES_REGLABLES[number];
const refuse: Retour = { ok: false, message: 'Accès refusé.' };

function rafraichir() { revalidatePath('/admin/videos'); revalidatePath('/admin/youtube'); revalidatePath('/admin'); }

/** Arrêt d'urgence : immédiat, vérifié par chaque publication au moment même de partir. */
export async function actionSuspendre(plateforme: Reglable, motif: string): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return refuse;
  if (!PLATEFORMES_REGLABLES.includes(plateforme)) return { ok: false, message: 'Plateforme inconnue.' };
  const raison = motif.trim().slice(0, 300);
  if (!raison) return { ok: false, message: 'Indiquez un motif : il s’affichera tant que la suspension dure.' };
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { error } = await service.from('marketing_parametres')
    .update({ actif: false, suspendu_motif: raison, updated_at: new Date().toISOString() }).eq('plateforme', plateforme);
  rafraichir();
  return error ? { ok: false, message: 'La suspension n’a pas été enregistrée.' }
    : { ok: true, message: plateforme === 'global' ? 'Toutes les publications sont suspendues.' : `${plateforme} suspendu.` };
}

export async function actionReactiver(plateforme: Reglable): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return refuse;
  if (!PLATEFORMES_REGLABLES.includes(plateforme)) return { ok: false, message: 'Plateforme inconnue.' };
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { error } = await service.from('marketing_parametres').update({
    actif: true, suspendu_motif: null, echecs_consecutifs: 0, mode: 'automatique', updated_at: new Date().toISOString(),
  }).eq('plateforme', plateforme);
  rafraichir();
  return error ? { ok: false, message: 'La réactivation n’a pas été enregistrée.' } : { ok: true, message: `${plateforme} réactivé, en mode automatique.` };
}

export async function actionHeure(plateforme: Exclude<Reglable, 'global'>, heure: number): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return refuse;
  if (!Number.isInteger(heure) || heure < 0 || heure > 23) return { ok: false, message: 'Heure invalide.' };
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { error } = await service.from('marketing_parametres').update({ heure }).eq('plateforme', plateforme);
  rafraichir();
  return error ? { ok: false, message: 'L’heure n’a pas été enregistrée.' } : { ok: true, message: `${plateforme} : publication à partir de ${heure} h.` };
}

/** Remet une vidéo dans la file de rendu. Refusé si elle est déjà publiée quelque part. */
export async function actionRerendre(cle: string): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return refuse;
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { data: v } = await service.from('marketing_videos').select('id, source, jour, statut').eq('cle', cle).maybeSingle();
  if (!v) return { ok: false, message: 'Vidéo introuvable.' };
  if (v.statut === 'en_cours') return { ok: false, message: 'Rendu déjà en cours.' };
  const publiee = v.source === 'youtube'
    ? (await service.from('marketing_youtube_shorts').select('id').eq('cle_idempotence', `short-${v.jour}`).in('statut', ['publiee', 'en_cours', 'a_verifier'])).data?.length
    : (await service.from('marketing_publications').select('id').like('cle_idempotence', `${cle}:%`).in('statut', ['publiee', 'envoyee', 'a_verifier'])).data?.length;
  if (publiee) return { ok: false, message: 'Déjà publiée (ou en cours) sur une plateforme : un nouveau rendu changerait une vidéo en ligne.' };
  const { error } = await service.from('marketing_videos').update({
    statut: 'a_rendre', tentatives: 0, controles: null, erreur: null, verrou_jusqua: null, updated_at: new Date().toISOString(),
  }).eq('id', v.id);
  rafraichir();
  return error ? { ok: false, message: 'Échec de l’enregistrement.' }
    : { ok: true, message: 'Remise en file : elle sera rendue au prochain passage du rendu (ou lancez « Vidéos animées — rendu » dans GitHub Actions).' };
}

/** Relance une plateforme en échec. Contrôles, arrêt d'urgence et idempotence restent appliqués ; seule l'heure est ignorée. */
export async function actionRepublier(cle: string, plateforme: 'instagram' | 'facebook' | 'youtube'): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return refuse;
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { data: v } = await service.from('marketing_videos').select('source, jour, reference').eq('cle', cle).maybeSingle();
  if (!v) return { ok: false, message: 'Vidéo introuvable.' };
  if (plateforme === 'youtube') {
    if (v.source !== 'youtube') return { ok: false, message: 'Cette vidéo n’est pas un Short du jour.' };
    if (v.jour !== jourParis()) return { ok: false, message: 'Seul le Short du jour peut être republié : celui-ci était prévu un autre jour.' };
    const r = await executerPublicationYoutube({ ignorerHeure: true });
    rafraichir();
    return { ok: r.publie, message: r.publie ? `Publié sur YouTube (${r.videoId}).` : `Rien n’a été publié : ${r.motif ?? r.statut}.` };
  }
  if (v.source !== 'reel') return { ok: false, message: 'Ce Short n’est publié que sur YouTube.' };
  const r = await publierReelAnime(v.reference, plateforme, { ignorerHeure: true });
  rafraichir();
  return { ok: r.publie, message: r.publie ? `Publié sur ${plateforme}.` : `Rien n’a été publié : ${r.motif ?? r.statut}.` };
}

/**
 * Après vérification humaine sur la plateforme : la publication interrompue n'est PAS en ligne,
 * une nouvelle tentative devient sûre. (Si elle est en ligne, il n'y a rien à faire.)
 */
export async function actionConfirmerAbsente(cle: string, plateforme: 'instagram' | 'facebook'): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return refuse;
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { error } = await service.from('marketing_publications')
    .update({ statut: 'echec', derniere_erreur: 'Vérifiée absente par l’administrateur.', updated_at: new Date().toISOString() })
    .eq('cle_idempotence', `${cle}:${plateforme}`).eq('statut', 'a_verifier');
  rafraichir();
  return error ? { ok: false, message: 'Échec de l’enregistrement.' } : { ok: true, message: 'Noté : « Republier » est de nouveau possible.' };
}
