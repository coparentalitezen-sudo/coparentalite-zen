'use client';

/** Planning : rythme de garde récurrent et exceptions (vacances, ponctuels). */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';
import type { CustodyPattern } from '../custody';
import type { RegleGarde, ExceptionGarde, TypeException } from './types';

// ---------------- Rythme de garde ----------------
export async function getRegleGarde(householdId: string): Promise<ActionResult<RegleGarde | null>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.from('custody_rules')
    .select('pattern, start_date, starting_parent, config')
    .eq('household_id', householdId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return err(lisible('Impossible de charger le rythme de garde.', error));
  if (!data) return ok(null);
  const cfg = (data.config ?? {}) as { parent2?: string };
  return ok({
    pattern: data.pattern as CustodyPattern,
    startDate: data.start_date as string,
    parent1: data.starting_parent as string,
    parent2: cfg.parent2 ?? '',
  });
}

export async function setRegleGarde(
  householdId: string, pattern: CustodyPattern, startDate: string, parent1: string, parent2: string
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('set_custody_rule', {
    p_household: householdId, p_pattern: pattern, p_start_date: startDate,
    p_parent1: parent1, p_parent2: parent2,
  });
  if (error) return err(lisible('L’enregistrement du rythme n’a pas abouti.', error));
  return ok(data as string);
}

// ---------------- Exceptions de garde ----------------
export async function listerExceptions(
  householdId: string, du: string, au: string
): Promise<ActionResult<ExceptionGarde[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('list_custody_exceptions', {
    p_household: householdId, p_from: du, p_to: au,
  });
  if (error) return err(lisible('Impossible de charger les périodes du planning.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: e.id as string,
    type: e.kind as TypeException,
    enfantId: e.child_id as string,
    enfantPrenom: e.child_name as string,
    parentId: e.parent_id as string,
    debut: e.starts_at as string,
    fin: e.ends_at as string,
    titre: (e.title as string) ?? null,
    note: (e.note as string) ?? null,
    creePar: e.created_by as string,
    creeLe: e.created_at as string,
    modifieLe: e.updated_at as string,
  })));
}

export async function creerException(input: {
  householdId: string; type: TypeException; enfantIds: string[]; parentId: string;
  debut: string; fin: string; titre?: string; note?: string;
}): Promise<ActionResult<string[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  if (input.enfantIds.length === 0) return err('Sélectionnez au moins un enfant.');
  if (new Date(input.fin) <= new Date(input.debut)) {
    return err('La fin doit être postérieure au début.');
  }
  const { data, error } = await supabase.rpc('create_custody_exception', {
    p_household: input.householdId, p_kind: input.type, p_child_ids: input.enfantIds,
    p_parent_id: input.parentId, p_starts_at: input.debut, p_ends_at: input.fin,
    p_title: input.titre ?? null, p_note: input.note ?? null,
  });
  if (error) return err(lisible('L’enregistrement n’a pas abouti.', error), detail(error));
  return ok((data ?? []) as string[]);
}

export async function modifierException(input: {
  id: string; parentId: string; debut: string; fin: string; titre?: string; note?: string;
}): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  if (new Date(input.fin) <= new Date(input.debut)) {
    return err('La fin doit être postérieure au début.');
  }
  const { error } = await supabase.rpc('update_custody_exception', {
    p_id: input.id, p_parent_id: input.parentId,
    p_starts_at: input.debut, p_ends_at: input.fin,
    p_title: input.titre ?? null, p_note: input.note ?? null,
  });
  if (error) return err(lisible('La modification n’a pas abouti.', error), detail(error));
  return ok(undefined);
}

export async function supprimerException(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_custody_exception', { p_id: id });
  if (error) return err(lisible('La suppression n’a pas abouti.', error), detail(error));
  return ok(undefined);
}
