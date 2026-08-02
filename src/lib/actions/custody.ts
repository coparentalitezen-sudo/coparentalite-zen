'use client';

/** Planning : rythme de garde récurrent et exceptions (vacances, ponctuels). */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';
import type { CustodyPattern } from '../custody';
import type { RegleGarde, ExceptionGarde, TypeException, TypeExceptionInfo,
  PropositionVacances } from './types';

// ---------------- Rythme de garde ----------------
export async function getRegleGarde(householdId: string): Promise<ActionResult<RegleGarde | null>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.from('custody_rules')
    .select('pattern, start_date, starting_parent, config, handover_time, handover_day, handover_place')
    .eq('household_id', householdId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return err(lisible('Impossible de charger le rythme de garde.', error));
  if (!data) return ok(null);
  const cfg = (data.config ?? {}) as { parent2?: string; custom_cycle?: ('P1' | 'P2')[] };
  return ok({
    pattern: data.pattern as CustodyPattern,
    customCycle: cfg.custom_cycle ?? null,
    handoverTime: (data.handover_time as string)?.slice(0, 5) ?? null,
    handoverDay: data.handover_day === null || data.handover_day === undefined
      ? null : Number(data.handover_day),
    handoverPlace: (data.handover_place as string) ?? null,
    startDate: data.start_date as string,
    parent1: data.starting_parent as string,
    parent2: cfg.parent2 ?? '',
  });
}

export async function setRegleGarde(
  householdId: string, pattern: CustodyPattern, startDate: string,
  parent1: string, parent2: string,
  /** Répartition jour par jour, requise pour le rythme personnalisé. */
  customCycle?: ('P1' | 'P2')[] | null,
  /** Heure du passage, format HH:MM ; null pour un changement au lever. */
  handoverTime?: string | null,
  handoverPlace?: string | null,
  /** Jour du changement, 0 = dimanche … 6 = samedi ; null pour le lundi. */
  handoverDay?: number | null,
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('set_custody_rule', {
    p_household: householdId, p_pattern: pattern, p_start_date: startDate,
    p_parent1: parent1, p_parent2: parent2,
    p_custom_cycle: customCycle && customCycle.length > 0 ? customCycle : null,
    p_handover_time: handoverTime || null,
    p_handover_place: handoverPlace || null,
    p_handover_day: handoverDay ?? null,
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
    typeLibelle: (e.kind_label as string) ?? 'Période',
    priorite: Number(e.priorite ?? 10),
    icone: (e.icone as string) ?? 'calendrier',
    couleur: (e.couleur as string) ?? '#4E6381',
    anneeScolaire: (e.school_year as string) ?? null,
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
  /** Rattachement facultatif à une période officielle du calendrier. */
  anneeScolaire?: string | null;
  periodeOfficielleId?: string | null;
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
    p_school_year: input.anneeScolaire ?? null,
    p_source_holiday: input.periodeOfficielleId ?? null,
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


/** Catalogue des types de période, défini en base et extensible sans code. */
export async function listerTypesException(): Promise<ActionResult<TypeExceptionInfo[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('types_exception');
  if (error) return err(lisible('Impossible de charger les types de période.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((t) => ({
    code: t.code as string,
    libelle: t.libelle as string,
    librellePluriel: (t.libelle_pluriel as string) ?? (t.libelle as string),
    priorite: Number(t.priorite ?? 10),
    icone: (t.icone as string) ?? 'calendrier',
    couleur: (t.couleur as string) ?? '#4E6381',
    description: (t.description as string) ?? null,
    depuisCalendrier: Boolean(t.depuis_calendrier),
  })));
}

/**
 * Périodes de vacances de l'année scolaire, avec ce que les parents en ont
 * déjà décidé. Les dates officielles ne sont qu'une proposition : elles
 * restent librement modifiables, comme le parent gardien.
 */
export async function listerPropositionsVacances(
  householdId: string, anneeScolaire?: string,
): Promise<ActionResult<PropositionVacances[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('propositions_vacances', {
    p_household: householdId, p_annee: anneeScolaire ?? null,
  });
  if (error) return err(lisible('Impossible de charger les vacances.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((v) => ({
    holidayId: v.holiday_id as string,
    libelle: v.libelle as string,
    anneeScolaire: (v.annee_scolaire as string) ?? null,
    debutOfficiel: v.debut_officiel as string,
    finOfficielle: v.fin_officielle as string,
    exceptionId: (v.exception_id as string) ?? null,
    parentId: (v.parent_id as string) ?? null,
    debutRetenu: (v.debut_retenu as string) ?? null,
    finRetenue: (v.fin_retenue as string) ?? null,
    enfantsCouverts: Number(v.enfants_couverts ?? 0),
    enfantsTotal: Number(v.enfants_total ?? 0),
    segment: Number(v.segment ?? 1),
    segmentsTotal: Number(v.segments_total ?? 0),
  })));
}


/**
 * Retire un segment de vacances dans son ensemble.
 *
 * Un segment regroupe une exception par enfant : n'en supprimer qu'une
 * laisserait la période à moitié effacée, et donc impossible à corriger.
 */
export async function supprimerSegmentVacances(
  exceptionId: string,
): Promise<ActionResult<number>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('supprimer_segment_vacances', {
    p_exception: exceptionId,
  });
  if (error) return err(lisible('La période n’a pas pu être retirée.', error), detail(error));
  return ok(Number(data ?? 0));
}
