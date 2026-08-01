'use client';

/**
 * Rendez-vous et affaires à prévoir.
 *
 * Un rendez-vous se SUPERPOSE au planning sans jamais le modifier : noter une
 * consultation ne déplace aucun enfant. C'est ce qui le distingue d'une
 * exception de garde.
 */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

export interface CategorieRdv {
  code: string;
  libelle: string;
  icone: string | null;
  couleur: string | null;
  /** Affaires proposées par défaut pour cette catégorie. */
  suggestions: string[];
  ordre: number;
}

export interface RendezVous {
  id: string;
  categorie: string;
  categorieLibelle: string;
  icone: string | null;
  couleur: string | null;
  titre: string;
  debut: string;
  fin: string | null;
  journeeEntiere: boolean;
  lieu: string | null;
  note: string | null;
  accompagnant: string | null;
  accompagnantNom: string | null;
  enfants: string | null;
  enfantIds: string[];
  affaires: string[];
  affairesCochees: number;
  affairesTotal: number;
  creePar: string;
}

export interface AffaireRecurrente {
  id: string;
  libelle: string;
  jour: number;
  enfantId: string | null;
  enfant: string | null;
}

export const JOURS_SEMAINE = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
] as const;

export async function listerCategoriesRdv(): Promise<ActionResult<CategorieRdv[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('categories_rendez_vous');
  if (error) return err(lisible('Impossible de charger les catégories.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((c) => ({
    code: c.code as string,
    libelle: c.libelle as string,
    icone: (c.icone as string) ?? null,
    couleur: (c.couleur as string) ?? null,
    suggestions: (c.suggestions as string[]) ?? [],
    ordre: Number(c.ordre ?? 100),
  })));
}

export async function listerRendezVous(
  householdId: string, du: string, au: string,
): Promise<ActionResult<RendezVous[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('list_appointments', {
    p_household: householdId, p_from: du, p_to: au,
  });
  if (error) return err(lisible('Impossible de charger les rendez-vous.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    categorie: r.categorie as string,
    categorieLibelle: r.categorie_label as string,
    icone: (r.icone as string) ?? null,
    couleur: (r.couleur as string) ?? null,
    titre: r.titre as string,
    debut: r.debut as string,
    fin: (r.fin as string) ?? null,
    journeeEntiere: Boolean(r.journee_entiere),
    lieu: (r.lieu as string) ?? null,
    note: (r.note as string) ?? null,
    accompagnant: (r.accompagnant as string) ?? null,
    accompagnantNom: (r.accompagnant_nom as string) ?? null,
    enfants: (r.enfants as string) ?? null,
    enfantIds: (r.enfant_ids as string[]) ?? [],
    affaires: (r.affaires as string[]) ?? [],
    affairesCochees: Number(r.affaires_cochees ?? 0),
    affairesTotal: Number(r.affaires_total ?? 0),
    creePar: r.cree_par as string,
  })));
}

export async function creerRendezVous(input: {
  householdId: string;
  categorie: string;
  titre: string;
  debut: string;
  fin?: string | null;
  journeeEntiere?: boolean;
  lieu?: string | null;
  note?: string | null;
  accompagnant?: string | null;
  enfantIds: string[];
  affaires?: string[];
}): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_appointment', {
    p_household: input.householdId,
    p_category: input.categorie,
    p_title: input.titre,
    p_starts_at: input.debut,
    p_ends_at: input.fin ?? null,
    p_all_day: input.journeeEntiere ?? false,
    p_location: input.lieu ?? null,
    p_note: input.note ?? null,
    p_accompagnant: input.accompagnant ?? null,
    p_child_ids: input.enfantIds,
    p_affaires: input.affaires?.filter((a) => a.trim()) ?? null,
  });
  if (error) return err(lisible('Le rendez-vous n’a pas pu être enregistré.', error), detail(error));
  return ok(data as string);
}

export async function modifierRendezVous(input: {
  id: string; titre: string; debut: string; fin?: string | null;
  lieu?: string | null; note?: string | null; accompagnant?: string | null;
}): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('update_appointment', {
    p_id: input.id, p_title: input.titre, p_starts_at: input.debut,
    p_ends_at: input.fin ?? null, p_location: input.lieu ?? null,
    p_note: input.note ?? null, p_accompagnant: input.accompagnant ?? null,
  });
  if (error) return err(lisible('La modification n’a pas abouti.', error), detail(error));
  return ok(undefined);
}

export async function supprimerRendezVous(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_appointment', { p_id: id });
  if (error) return err(lisible('La suppression n’a pas abouti.', error));
  return ok(undefined);
}

export async function ajouterAffaire(input: {
  householdId: string; libelle: string;
  rendezVousId?: string | null; jour?: number | null; enfantId?: string | null;
}): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('ajouter_affaire', {
    p_household: input.householdId, p_label: input.libelle,
    p_appointment: input.rendezVousId ?? null,
    p_jour: input.jour ?? null, p_child: input.enfantId ?? null,
  });
  if (error) return err(lisible('L’affaire n’a pas pu être ajoutée.', error), detail(error));
  return ok(data as string);
}

export async function cocherAffaire(id: string, coche: boolean): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('cocher_affaire', { p_id: id, p_coche: coche });
  if (error) return err(lisible('L’affaire n’a pas pu être mise à jour.', error));
  return ok(undefined);
}

export async function listerAffairesRecurrentes(
  householdId: string,
): Promise<ActionResult<AffaireRecurrente[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('affaires_recurrentes', { p_household: householdId });
  if (error) return err(lisible('Impossible de charger les rappels.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: a.id as string,
    libelle: a.libelle as string,
    jour: Number(a.jour ?? 0),
    enfantId: (a.enfant_id as string) ?? null,
    enfant: (a.enfant as string) ?? null,
  })));
}

export async function supprimerAffaire(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('supprimer_affaire', { p_id: id });
  if (error) return err(lisible('L’affaire n’a pas pu être retirée.', error));
  return ok(undefined);
}
