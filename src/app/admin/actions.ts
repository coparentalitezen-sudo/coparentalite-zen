'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import {
  majParametres, majStatut, corrigerLegende, type Statut,
} from '@/lib/marketing/depot';

/**
 * Contrôle d'accès des actions.
 *
 * Refait à chaque appel, et non hérité de la page qui les a affichées : une
 * action serveur est une adresse joignable directement, indépendamment de
 * l'écran qui la propose. Vérifier une seule fois à l'affichage laisserait la
 * porte ouverte à qui connaît le nom de l'action.
 */
async function exigerAdministrateur(): Promise<boolean> {
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return estAdministrateur(user?.email);
}

export async function actionStatut(
  reference: string, statut: Statut, motif?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const ok = await majStatut(reference, statut, motif);
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'L’enregistrement n’a pas abouti.' };
}

/** Validation groupée : c'est l'usage réel, une fois par semaine. */
export async function actionValiderTout(
  references: string[],
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  for (const r of references) {
    if (!await majStatut(r, 'valide')) {
      return { ok: false, message: `Échec sur ${r}. Les précédents sont validés.` };
    }
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function actionLegende(
  reference: string, plateforme: 'instagram' | 'facebook', texte: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  if (!texte.trim()) return { ok: false, message: 'Une légende vide ne serait pas publiable.' };
  const ok = await corrigerLegende(reference, plateforme, texte);
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'La correction n’a pas abouti.' };
}

/**
 * Interrupteur général.
 *
 * Volontairement séparé du mode : suspendre tout et passer en automatique sont
 * deux décisions différentes, et les confondre dans un seul réglage conduirait
 * un jour à réactiver les publications en croyant changer de mode.
 */
export async function actionSuspendre(
  actif: boolean, motif?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const ok = await majParametres({ actif, suspenduMotif: actif ? null : (motif ?? 'Suspendu manuellement') });
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'Le réglage n’a pas été enregistré.' };
}

export async function actionMode(
  mode: 'validation' | 'automatique',
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const ok = await majParametres({ mode });
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'Le réglage n’a pas été enregistré.' };
}

/**
 * Publication déclenchée depuis l'interface.
 *
 * Passe par la route plutôt que d'appeler Meta directement : la route porte
 * déjà la réservation en base, l'idempotence et l'expurgation des messages.
 * Dupliquer cette logique ici la ferait diverger au premier correctif.
 *
 * Le contenu doit être validé au préalable. Publier un brouillon non relu
 * reviendrait à supprimer l'étape de validation tout en la conservant à
 * l'écran.
 */
export async function actionPublier(
  reference: string, plateforme: 'instagram' | 'facebook',
): Promise<{ ok: boolean; message?: string; metaId?: string | null }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

  const reponse = await fetch(`${base}/api/marketing/publier`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // La route revérifie les droits : l'appel venant du serveur, il faut lui
      // transmettre la session de la personne qui a appuyé.
      cookie: (await cookies()).toString(),
    },
    body: JSON.stringify({ reference, plateforme, page: 0, confirmation: true }),
  });

  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok || !corps.publie) {
    return { ok: false, message: corps.erreur ?? corps.message ?? 'La publication a échoué.' };
  }

  revalidatePath('/admin');
  return { ok: true, metaId: corps.meta_media_id ?? null };
}
