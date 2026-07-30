'use client';

/** Enfants du foyer. */
import { supabaseBrowser, ok, err, lisible, type ActionResult } from './core';

// ---------------- Enfants ----------------
export async function ajouterEnfant(
  householdId: string, prenom: string, naissance: string | null, couleur: string
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Session expirée. Reconnectez-vous.');
  const { data, error } = await supabase.from('children')
    .insert({
      household_id: householdId, first_name: prenom.trim(),
      birth_date: naissance || null, color: couleur, created_by: user.id,
    })
    .select('id').single();
  if (error) return err(lisible('L’ajout de l’enfant n’a pas abouti.', error));
  return ok(data.id as string);
}

export async function archiverEnfant(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.from('children')
    .update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return err(lisible('L’archivage n’a pas abouti.', error));
  return ok(undefined);
}
