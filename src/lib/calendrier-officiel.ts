/**
 * Transformation des enregistrements du calendrier scolaire officiel.
 *
 * Fonctions pures, isolées de la route d'import pour être testables seules.
 *
 * DÉFAUT CORRIGÉ ICI : la source officielle regroupe sur une même ligne les
 * périodes communes à plusieurs zones — « Zone A, Zone B, Zone C » pour la
 * Toussaint, Noël, l'Été et l'Ascension. Ne retenir que la première zone
 * revenait à n'importer ces périodes que pour la zone A : un foyer en zone B
 * ou C ne voyait donc aucune vacance de Toussaint ni de Noël.
 */

export const ZONES_METROPOLE = ['A', 'B', 'C'] as const;
export type ZoneMetropole = (typeof ZONES_METROPOLE)[number];

export interface EnregistrementOfficiel {
  description?: string;
  start_date?: string;
  end_date?: string;
  zones?: string;
  annee_scolaire?: string;
  population?: string;
  location?: string;
}

export interface PeriodeImportable {
  country_code: string;
  label: string;
  zone: string;
  school_year: string | null;
  starts_on: string;
  ends_on: string;
  population: string | null;
  external_id: string;
}

/**
 * Toutes les zones métropolitaines citées, pas seulement la première.
 * « Zone A, Zone B, Zone C » → ['A', 'B', 'C'].
 * Les libellés hors métropole (Corse, Guadeloupe…) ne renvoient rien : nous
 * n'avons pas leur calendrier, et en inventer un serait pire que rien.
 */
export function zonesCitees(zones: string | undefined): ZoneMetropole[] {
  if (!zones) return [];
  const trouvees = new Set<ZoneMetropole>();
  for (const m of zones.matchAll(/Zone\s+([ABC])/gi)) {
    trouvees.add(m[1].toUpperCase() as ZoneMetropole);
  }
  return ZONES_METROPOLE.filter((z) => trouvees.has(z));
}

/** Un horodatage officiel ramené au jour ; null si la date est inexploitable. */
export function jour(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Les périodes réservées aux enseignants (pré-rentrée notamment) ne concernent
 * pas la garde des enfants : les retenir créerait des vacances fantômes.
 */
export function concerneLesEleves(population: string | undefined): boolean {
  if (!population) return true;
  return !/enseignant/i.test(population);
}

/**
 * Convertit la réponse officielle en périodes importables.
 * Une période commune à plusieurs zones produit une ligne par zone : c'est
 * ainsi que chaque foyer retrouve ses vacances, quelle que soit sa zone.
 */
export function versPeriodesImportables(
  enregistrements: EnregistrementOfficiel[],
): PeriodeImportable[] {
  const sorties: PeriodeImportable[] = [];
  const vues = new Set<string>();

  for (const e of enregistrements) {
    if (!concerneLesEleves(e.population)) continue;

    const debut = jour(e.start_date);
    const fin = jour(e.end_date);
    if (!debut || !fin || fin < debut) continue;

    const label = (e.description ?? '').trim() || 'Vacances scolaires';
    const annee = e.annee_scolaire ?? null;

    for (const zone of zonesCitees(e.zones)) {
      const cle = `${annee ?? ''}|${zone}|${label}|${debut}`;
      if (vues.has(cle)) continue;      // la source peut répéter une même période
      vues.add(cle);
      sorties.push({
        country_code: 'FR',
        label,
        zone,
        school_year: annee,
        starts_on: debut,
        ends_on: fin,
        population: e.population ?? null,
        external_id: cle,
      });
    }
  }
  return sorties;
}

/** Correspondances académie → zone, déduites de la même réponse officielle. */
export function versCorrespondancesAcademies(
  enregistrements: EnregistrementOfficiel[],
): { area_code: string; area_label: string; zone_code: string }[] {
  const par = new Map<string, ZoneMetropole>();
  for (const e of enregistrements) {
    const academie = e.location?.trim();
    if (!academie) continue;
    const zones = zonesCitees(e.zones);
    // Une académie appartient à une seule zone : on ne retient la
    // correspondance que si la ligne ne cite qu'une zone.
    if (zones.length === 1) par.set(academie, zones[0]);
  }
  return [...par.entries()].map(([academie, zone]) => ({
    area_code: academie.toUpperCase(),
    area_label: academie,
    zone_code: zone,
  }));
}
