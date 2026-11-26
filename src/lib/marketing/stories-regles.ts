/**
 * Règles des stories, sans accès réseau ni base : testables seules.
 *
 * Une story par jour et par plateforme (Instagram, Facebook), qui reprend la
 * couverture du contenu du jour au format vertical. Elle part quelques heures
 * après la publication principale : un second rendez-vous dans la journée,
 * pour ceux qui n'ont pas vu le fil le matin.
 */
import { HEURE_PAR_DEFAUT } from './horaire';

/** Décalage de la story après l'heure de publication réglée de la plateforme. */
export const DECALAGE_STORY_HEURES = 3;
/** Au-delà, la story attend le lendemain plutôt que de partir la nuit. */
export const HEURE_STORY_MAX = 21;
/** Échecs tolérés dans la journée avant d'abandonner et d'alerter. */
export const ESSAIS_STORY_MAX = 2;

export type PlateformeStory = 'instagram' | 'facebook';

/** Heure (Paris) à partir de laquelle la story du jour peut partir. */
export function heureStory(heureReglee: number | null | undefined): number {
  const h = Number.isInteger(heureReglee) ? (heureReglee as number) : HEURE_PAR_DEFAUT;
  return Math.min(h + DECALAGE_STORY_HEURES, HEURE_STORY_MAX);
}

export interface LigneJournalStory {
  source: string | null;
  publie: boolean;
}

/**
 * Où en est la story du jour sur une plateforme, d'après le journal :
 * « faite » si une publication a réussi, « abandon » après trop d'échecs,
 * sinon « a_faire ». Le journal tient lieu de verrou : l'horloge passe
 * toutes les heures, et une story ne doit jamais partir deux fois.
 */
export function etatStory(
  journal: readonly LigneJournalStory[], plateforme: PlateformeStory,
): 'faite' | 'abandon' | 'a_faire' {
  const lignes = journal.filter((l) => l.source === plateforme);
  if (lignes.some((l) => l.publie)) return 'faite';
  if (lignes.length >= ESSAIS_STORY_MAX) return 'abandon';
  return 'a_faire';
}
