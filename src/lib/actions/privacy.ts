'use client';

/** Droits RGPD : export, suppression du compte et du foyer, identité. */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

// ---------------- RGPD ----------------
export async function exportMyData(): Promise<ActionResult<Blob>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) return err(lisible('L’export n’a pas abouti.', error));
  return ok(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

export async function deleteMyAccount(): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return err(lisible('La suppression n’a pas abouti.', error));
  await supabase.auth.signOut();
  return ok(undefined);
}

export async function deleteHousehold(householdId: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_household', { p_household: householdId });
  if (error) return err(lisible('Seul le propriétaire du foyer peut le supprimer.', error));
  return ok(undefined);
}

/** Chaque parent ne peut renommer que son propre profil (garanti par la RLS). */
export async function renommerMonProfil(nom: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const propre = nom.trim();
  if (propre.length < 2) return err('Indiquez un nom d’au moins 2 caractères.');
  if (propre.length > 40) return err('Ce nom est trop long (40 caractères maximum).');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Session expirée. Reconnectez-vous.');
  const { error } = await supabase.from('profiles')
    .update({ display_name: propre }).eq('id', user.id);
  if (error) return err(lisible('Le changement de nom n’a pas abouti.', error), detail(error));
  return ok(undefined);
}

export async function seDeconnecter(): Promise<void> {
  const supabase = supabaseBrowser();
  if (supabase) await supabase.auth.signOut();
}
