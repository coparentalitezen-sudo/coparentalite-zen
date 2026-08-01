'use client';

import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

export type TypeEvenement = 'school' | 'activity' | 'medical' | 'birthday' | 'holiday' | 'handover' | 'other';

export interface EvenementPlanning {
  id: string;
  enfantId: string | null;
  enfantPrenom: string | null;
  type: TypeEvenement;
  titre: string;
  description: string | null;
  lieu: string | null;
  debut: string;
  fin: string | null;
  jourEntier: boolean;
  rappels: number[];
  texteRappel: string | null;
  creePar: string;
  creeLe: string;
  modifieLe: string;
}

export interface SaisieEvenement {
  householdId: string;
  enfantId: string | null;
  type: TypeEvenement;
  titre: string;
  description: string | null;
  lieu: string | null;
  debut: string;
  fin: string | null;
  jourEntier: boolean;
  rappels: number[];
  texteRappel: string | null;
}

function mapper(e: Record<string, unknown>): EvenementPlanning {
  return {
    id: e.id as string,
    enfantId: (e.child_id as string) ?? null,
    enfantPrenom: (e.child_name as string) ?? null,
    type: e.kind as TypeEvenement,
    titre: e.title as string,
    description: (e.description as string) ?? null,
    lieu: (e.location as string) ?? null,
    debut: e.starts_at as string,
    fin: (e.ends_at as string) ?? null,
    jourEntier: Boolean(e.all_day),
    rappels: Array.isArray(e.reminder_minutes) ? (e.reminder_minutes as number[]) : [],
    texteRappel: (e.reminder_text as string) ?? null,
    creePar: e.created_by as string,
    creeLe: e.created_at as string,
    modifieLe: e.updated_at as string,
  };
}

export async function listerEvenements(
  householdId: string, from: string, to: string,
): Promise<ActionResult<EvenementPlanning[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('list_calendar_events', {
    p_household: householdId, p_from: from, p_to: to,
  });
  if (error) return err(lisible('Impossible de charger les rendez-vous.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map(mapper));
}

export async function creerEvenement(s: SaisieEvenement): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_calendar_event', {
    p_household: s.householdId,
    p_child: s.enfantId,
    p_kind: s.type,
    p_title: s.titre,
    p_description: s.description,
    p_location: s.lieu,
    p_starts_at: s.debut,
    p_ends_at: s.fin,
    p_all_day: s.jourEntier,
    p_reminder_minutes: s.rappels,
    p_reminder_text: s.texteRappel,
  });
  if (error) return err(lisible('Le rendez-vous n’a pas été ajouté.', error), detail(error));
  return ok(String(data));
}

export async function modifierEvenement(id: string, s: Omit<SaisieEvenement, 'householdId'>): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('update_calendar_event', {
    p_id: id,
    p_child: s.enfantId,
    p_kind: s.type,
    p_title: s.titre,
    p_description: s.description,
    p_location: s.lieu,
    p_starts_at: s.debut,
    p_ends_at: s.fin,
    p_all_day: s.jourEntier,
    p_reminder_minutes: s.rappels,
    p_reminder_text: s.texteRappel,
  });
  if (error) return err(lisible('Le rendez-vous n’a pas été modifié.', error), detail(error));
  return ok(undefined);
}

export async function supprimerEvenement(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_calendar_event', { p_id: id });
  if (error) return err(lisible('Le rendez-vous n’a pas été supprimé.', error), detail(error));
  return ok(undefined);
}
