'use server';

import { revalidatePath } from 'next/cache';
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
