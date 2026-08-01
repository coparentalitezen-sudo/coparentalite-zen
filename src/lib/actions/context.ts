'use client';

/** Contexte du foyer : membres, enfants, catégories. */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';
import type { Contexte } from './types';

// ---------------- Contexte du foyer ----------------
/** null = l'utilisateur n'a pas encore de foyer (cas normal, pas une erreur). */
export async function getContexte(): Promise<ActionResult<Contexte | null>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  try {
    // Deux requêtes simples plutôt qu'une jointure imbriquée : household_members
    // et households ont toutes deux une colonne deleted_at, ce qui rend le filtre
    // ambigu côté PostgREST.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err('Session expirée. Reconnectez-vous.');

    const { data: membre, error: e1 } = await supabase
      .from('household_members')
      .select('role, household_id')
      .eq('profile_id', user.id)
      .is('deleted_at', null)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (e1) return err(lisible('Impossible de charger votre foyer.', e1), detail(e1));
    if (!membre) return ok(null);

    const { data: foyer, error: e2 } = await supabase
      .from('households')
      .select('id, name, deleted_at')
      .eq('id', membre.household_id as string)
      .maybeSingle();
    if (e2) return err(lisible('Impossible de charger votre foyer.', e2), detail(e2));
    if (!foyer || foyer.deleted_at) return ok(null);
    const h = foyer as unknown as { id: string; name: string; deleted_at: string | null };

    const [membres, enfants, categories] = await Promise.all([
      supabase.from('household_members')
        .select('profile_id, role, color_key, profiles!inner(display_name, is_placeholder)')
        .eq('household_id', h.id).is('deleted_at', null),
      supabase.from('children')
        .select('id, first_name, color, birth_date')
        .eq('household_id', h.id).is('deleted_at', null).is('archived_at', null)
        .order('first_name'),
      supabase.from('expense_categories')
        .select('id, name').is('deleted_at', null).order('sort_order'),
    ]);

    return ok({
      foyer: { id: h.id, nom: h.name, role: membre.role as string },
      membres: (membres.data ?? []).map((m) => {
        const p = m.profiles as unknown as { display_name: string; is_placeholder?: boolean };
        const nom = p?.display_name ?? 'Parent';
        return {
          profileId: m.profile_id as string,
          nom,
          role: m.role as string,
          couleur: (m.color_key as 'navy' | 'coral' | 'sage') ?? 'navy',
          initiale: nom.charAt(0).toUpperCase(),
          // Un parent nommé mais pas encore inscrit : le planning fonctionne,
          // mais il ne peut ni se connecter ni valider de dépense.
          provisoire: Boolean(p?.is_placeholder),
        };
      }),
      enfants: (enfants.data ?? []).map((c) => ({
        id: c.id as string, prenom: c.first_name as string,
        couleur: (c.color as string) ?? '#9AA791', naissance: (c.birth_date as string) ?? null,
      })),
      categories: (categories.data ?? []).map((c) => ({ id: c.id as string, nom: c.name as string })),
      moi: user.id,
    });
  } catch (e) {
    return err(lisible('Chargement impossible. Vérifiez votre connexion.', e), detail(e));
  }
}

export async function createHousehold(name: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_household', { p_name: name });
  if (error) return err(lisible('La création du foyer n’a pas abouti.', error));
  return ok(data as string);
}
