'use client';

/**
 * Notifications.
 *
 * Le moteur est indépendant des canaux : une notification est un fait, la
 * façon dont elle atteint le parent est réglée séparément. Seul le canal
 * « application » est actif ; les préférences acceptent déjà « push » et
 * « courriel », dont l'activation ne demandera aucune reprise ici.
 */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

export interface Notification {
  id: string;
  type: string;
  typeLibelle: string;
  titre: string;
  corps: string | null;
  href: string | null;
  entite: string | null;
  entiteId: string | null;
  auteur: string | null;
  programmeeLe: string;
  lueLe: string | null;
  creeeLe: string;
}

export interface PreferenceNotification {
  type: string;
  typeLibelle: string;
  description: string | null;
  categorie: string;
  estRappel: boolean;
  ordre: number;
  canal: string;
  canalLibelle: string;
  canalActif: boolean;
  active: boolean;
}

/** Délais proposés pour les rappels, en minutes. */
export const DELAIS_RAPPEL = [
  { minutes: 5, libelle: '5 minutes avant' },
  { minutes: 15, libelle: '15 minutes avant' },
  { minutes: 30, libelle: '30 minutes avant' },
  { minutes: 60, libelle: '1 heure avant' },
  { minutes: 1440, libelle: 'La veille' },
] as const;

export async function listerNotifications(
  householdId: string, limite = 50, nonLues = false,
): Promise<ActionResult<Notification[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('mes_notifications', {
    p_household: householdId, p_limite: limite, p_non_lues: nonLues,
  });
  if (error) return err(lisible('Impossible de charger vos notifications.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((n) => ({
    id: n.id as string,
    type: n.type_code as string,
    typeLibelle: (n.type_label as string) ?? 'Notification',
    titre: n.titre as string,
    corps: (n.corps as string) ?? null,
    href: (n.href as string) ?? null,
    entite: (n.entite as string) ?? null,
    entiteId: (n.entite_id as string) ?? null,
    auteur: (n.auteur as string) ?? null,
    programmeeLe: n.programmee_le as string,
    lueLe: (n.lue_le as string) ?? null,
    creeeLe: n.creee_le as string,
  })));
}

export async function compterNonLues(householdId: string): Promise<ActionResult<number>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('compter_notifications_non_lues', {
    p_household: householdId,
  });
  if (error) return err(lisible('Décompte indisponible.', error), detail(error));
  return ok(Number(data ?? 0));
}

export async function marquerLue(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('marquer_notification_lue', { p_id: id });
  if (error) return err(lisible('La notification n’a pas pu être marquée comme lue.', error));
  return ok(undefined);
}

export async function marquerToutLu(householdId: string): Promise<ActionResult<number>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('marquer_tout_lu', { p_household: householdId });
  if (error) return err(lisible('L’opération n’a pas abouti.', error));
  return ok(Number(data ?? 0));
}

export async function listerPreferences(
  householdId: string,
): Promise<ActionResult<PreferenceNotification[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('mes_preferences_notifications', {
    p_household: householdId,
  });
  if (error) return err(lisible('Impossible de charger vos préférences.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((p) => ({
    type: p.type_code as string,
    typeLibelle: p.type_label as string,
    description: (p.description as string) ?? null,
    categorie: p.categorie as string,
    estRappel: Boolean(p.est_rappel),
    ordre: Number(p.ordre ?? 100),
    canal: p.canal as string,
    canalLibelle: p.canal_label as string,
    canalActif: Boolean(p.canal_actif),
    active: Boolean(p.active),
  })));
}

export async function definirPreference(
  householdId: string, type: string, canal: string, active: boolean,
): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('definir_preference_notification', {
    p_household: householdId, p_type: type, p_canal: canal, p_active: active,
  });
  if (error) return err(lisible('La préférence n’a pas été enregistrée.', error));
  return ok(undefined);
}

export async function getDelaiRappel(householdId: string): Promise<ActionResult<number>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('mon_delai_rappel', { p_household: householdId });
  if (error) return err(lisible('Délai de rappel indisponible.', error));
  return ok(Number(data ?? 60));
}

export async function setDelaiRappel(
  householdId: string, minutes: number,
): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('definir_delai_rappel', {
    p_household: householdId, p_minutes: minutes,
  });
  if (error) return err(lisible('Le délai n’a pas été enregistré.', error));
  return ok(undefined);
}
