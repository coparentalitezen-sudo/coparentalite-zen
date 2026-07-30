'use client';

/**
 * Vacances scolaires officielles.
 *
 * Le foyer choisit sa zone académique ; les périodes proviennent du calendrier
 * du ministère de l'Éducation nationale, importé automatiquement. Aucun parent
 * ne saisit jamais de vacances à la main.
 */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

export type Zone = 'A' | 'B' | 'C';

export interface VacancesScolaires {
  id: string;
  libelle: string;
  zone: string | null;
  anneeScolaire: string | null;
  debut: string;
  fin: string;
  source: 'officiel' | 'manuel';
}

export interface EtatCalendrier {
  zone: Zone | null;
  periodes: number;
  premiereDate: string | null;
  derniereDate: string | null;
  derniereSync: string | null;
  /** true si le calendrier couvre au moins l'année à venir. */
  couvreUnAn: boolean;
}

/** Départements par zone, pour aider au choix sans avoir à chercher ailleurs. */
export const ZONES: { zone: Zone; academies: string }[] = [
  { zone: 'A', academies: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers' },
  { zone: 'B', academies: 'Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg' },
  { zone: 'C', academies: 'Créteil, Montpellier, Paris, Toulouse, Versailles' },
];

export async function getZone(householdId: string): Promise<ActionResult<Zone | null>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase
    .from('households').select('school_zone').eq('id', householdId).maybeSingle();
  if (error) return err(lisible('Impossible de lire la zone du foyer.', error), detail(error));
  return ok(((data?.school_zone as Zone) ?? null));
}

/**
 * Change la zone. Les exceptions créées par les parents ne sont jamais
 * touchées : seule la couche d'information « vacances scolaires » change.
 */
export async function setZone(householdId: string, zone: Zone | null): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('set_school_zone', {
    p_household: householdId, p_zone: zone,
  });
  if (error) return err(lisible('La zone n’a pas pu être enregistrée.', error), detail(error));
  return ok(undefined);
}

export async function listerVacances(
  householdId: string, du: string, au: string,
): Promise<ActionResult<VacancesScolaires[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('list_school_holidays', {
    p_household: householdId, p_from: du, p_to: au,
  });
  if (error) return err(lisible('Impossible de charger les vacances scolaires.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((v) => ({
    id: v.id as string,
    libelle: v.libelle as string,
    zone: (v.zone as string) ?? null,
    anneeScolaire: (v.annee_scolaire as string) ?? null,
    debut: v.debut as string,
    fin: v.fin as string,
    source: (v.source as 'officiel' | 'manuel') ?? 'officiel',
  })));
}

/** État de l'import : permet d'informer plutôt que d'afficher un calendrier vide sans explication. */
export async function getEtatCalendrier(householdId: string): Promise<ActionResult<EtatCalendrier>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('school_calendar_state', {
    p_household: householdId,
  });
  if (error) return err(lisible('Impossible de lire l’état du calendrier.', error), detail(error));
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return ok({
    zone: ((l?.zone as Zone) ?? null),
    periodes: Number(l?.periodes ?? 0),
    premiereDate: (l?.premiere_date as string) ?? null,
    derniereDate: (l?.derniere_date as string) ?? null,
    derniereSync: (l?.derniere_sync as string) ?? null,
    couvreUnAn: Boolean(l?.couvre_un_an),
  });
}
