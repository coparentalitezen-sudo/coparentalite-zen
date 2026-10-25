'use server';

import { revalidatePath } from 'next/cache';
import { supabaseService } from '@/lib/supabase/server';
import { estAdministrateurConnecte } from '@/lib/youtube/acces';
import { executerPublicationYoutube } from '@/lib/youtube/publication';
import { cleDeChiffrement, dechiffrer } from '@/lib/youtube/chiffrement';
import { revoquer } from '@/lib/youtube/oauth';
import { majParametres } from '@/lib/marketing/depot';

/**
 * Actions de l'écran YouTube. Le contrôle d'administrateur est refait à
 * chaque appel : une action serveur est joignable sans passer par l'écran.
 */

type Retour = { ok: boolean; message: string };

export async function actionActiverYoutube(actif: boolean): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return { ok: false, message: 'Accès refusé.' };
  const ok = await majParametres({
    plateforme: 'youtube', actif, mode: 'automatique',
    suspenduMotif: actif ? null : 'Arrêt manuel depuis l’administration.',
  });
  revalidatePath('/admin/youtube');
  return { ok, message: ok ? (actif ? 'Publication quotidienne activée.' : 'Publication YouTube arrêtée.') : 'L’enregistrement n’a pas abouti.' };
}

export async function actionVisibilite(visibilite: 'private' | 'unlisted' | 'public'): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return { ok: false, message: 'Accès refusé.' };
  const service = supabaseService();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { error } = await service.from('marketing_youtube_connexion')
    .update({ visibilite }).eq('id', true);
  revalidatePath('/admin/youtube');
  return { ok: !error, message: error ? 'L’enregistrement n’a pas abouti.' : 'Visibilité enregistrée.' };
}

export async function actionPublierEssai(): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return { ok: false, message: 'Accès refusé.' };
  const r = await executerPublicationYoutube({ essai: true });
  revalidatePath('/admin/youtube');
  return {
    ok: r.publie,
    message: r.publie
      ? `Short d’essai envoyé en privé (vidéo ${r.videoId}).`
      : `Rien n’a été publié : ${r.motif ?? r.statut}.`,
  };
}

export async function actionDeconnecter(): Promise<Retour> {
  if (!await estAdministrateurConnecte()) return { ok: false, message: 'Accès refusé.' };
  const service = supabaseService();
  const cle = cleDeChiffrement();
  if (!service) return { ok: false, message: 'Service indisponible.' };
  const { data } = await service.from('marketing_youtube_connexion')
    .select('jeton_rafraichissement').eq('id', true).maybeSingle();
  if (data?.jeton_rafraichissement && cle) {
    try { await revoquer(dechiffrer(data.jeton_rafraichissement, cle)); } catch { /* déjà invalide */ }
  }
  await service.from('marketing_youtube_connexion').update({
    etat: 'deconnectee', jeton_rafraichissement: null, jeton_acces: null,
    jeton_acces_expire: null, derniere_erreur: null,
  }).eq('id', true);
  await majParametres({ plateforme: 'youtube', actif: false, suspenduMotif: 'Chaîne déconnectée.' });
  revalidatePath('/admin/youtube');
  return { ok: true, message: 'Chaîne déconnectée et autorisation révoquée chez Google.' };
}
