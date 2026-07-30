'use client';

/**
 * Localisation du foyer et calendrier officiel.
 *
 * L'architecture est indépendante du pays : chaque pays déclare en base
 * comment sa subdivision de vacances se détermine ('zone', 'region' ou
 * 'national'). Ajouter la Belgique ou la Suisse ne demande aucun changement
 * ici — seulement des lignes de référence et un importateur.
 */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

export type ModeZone = 'zone' | 'region' | 'national';

export interface Pays {
  code: string;
  libelle: string;
  mode: ModeZone;
  /** Intitulé à présenter : « Zone académique », « Canton », « Communauté »… */
  libelleZone: string;
  /** La subdivision peut-elle être déduite d'un code postal ou d'un département ? */
  deduction: boolean;
  source: string | null;
  sourceUrl: string | null;
}

export interface ZoneDisponible {
  code: string;
  libelle: string;
  aide: string | null;
}

export interface Localisation {
  pays: string | null;
  paysLibelle: string | null;
  mode: ModeZone | null;
  libelleZone: string | null;
  deduction: boolean;
  zone: string | null;
  zoneLibelle: string | null;
  areaCode: string | null;
  codePostal: string | null;
  source: string | null;
}

export async function listerPays(): Promise<ActionResult<Pays[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('pays_disponibles');
  if (error) return err(lisible('Impossible de charger la liste des pays.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((p) => ({
    code: p.code as string,
    libelle: p.libelle as string,
    mode: p.mode as ModeZone,
    libelleZone: (p.libelle_zone as string) ?? 'Zone',
    deduction: Boolean(p.deduction),
    source: (p.source as string) ?? null,
    sourceUrl: (p.source_url as string) ?? null,
  })));
}

export async function listerZones(pays: string): Promise<ActionResult<ZoneDisponible[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('zones_disponibles', { p_pays: pays });
  if (error) return err(lisible('Impossible de charger les zones.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((z) => ({
    code: z.code as string,
    libelle: z.libelle as string,
    aide: (z.aide as string) ?? null,
  })));
}

export async function getLocalisation(householdId: string): Promise<ActionResult<Localisation>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('household_location', { p_household: householdId });
  if (error) return err(lisible('Impossible de lire la localisation du foyer.', error), detail(error));
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return ok({
    pays: (l?.pays as string) ?? null,
    paysLibelle: (l?.pays_libelle as string) ?? null,
    mode: (l?.mode as ModeZone) ?? null,
    libelleZone: (l?.libelle_zone as string) ?? null,
    deduction: Boolean(l?.deduction),
    zone: (l?.zone as string) ?? null,
    zoneLibelle: (l?.zone_libelle as string) ?? null,
    areaCode: (l?.area_code as string) ?? null,
    codePostal: (l?.code_postal as string) ?? null,
    source: (l?.source as string) ?? null,
  });
}

/**
 * Enregistre la localisation. Si aucune zone n'est fournie, le serveur tente de
 * la déduire du code postal ou du département — et renvoie null s'il n'y
 * parvient pas, plutôt que de deviner. Aucune décision de garde n'est affectée.
 */
export async function setLocalisation(input: {
  householdId: string;
  pays: string;
  zone?: string | null;
  areaCode?: string | null;
  codePostal?: string | null;
}): Promise<ActionResult<{ zone: string | null; deduite: boolean }>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('set_household_location', {
    p_household: input.householdId,
    p_pays: input.pays,
    p_zone: input.zone ?? null,
    p_area: input.areaCode ?? null,
    p_code_postal: input.codePostal ?? null,
  });
  if (error) return err(lisible('La localisation n’a pas pu être enregistrée.', error), detail(error));
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return ok({
    zone: (l?.zone_retenue as string) ?? null,
    deduite: Boolean(l?.deduite),
  });
}
