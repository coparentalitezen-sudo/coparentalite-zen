/**
 * Période de rendez-vous chargée par la page /app/rendez-vous.
 *
 * Par défaut, les 90 prochains jours. Incident du 26/11/2026 : un rendez-vous
 * du 23/04/2027, visible dans le planning (qui charge le mois affiché),
 * n'apparaissait pas dans la liste, et ne pouvait donc être ni modifié ni
 * annulé avant fin janvier. La période s'étend désormais jusqu'au jour
 * demandé par le planning (?jour=AAAA-MM-JJ), et de 90 jours de plus à chaque
 * appui sur « Voir plus loin ».
 *
 * Fonctions pures sur des dates AAAA-MM-JJ, sans fuseau : testables seules.
 */
export const FENETRE_JOURS = 90;
export const PAS_JOURS = 90;

const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Une date AAAA-MM-JJ réelle (le 31/02 est refusé), sinon null. */
export function jourValide(valeur: string | null | undefined): string | null {
  if (!valeur || !FORMAT_JOUR.test(valeur)) return null;
  const d = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur ? valeur : null;
}

/** Ajoute n jours à une date AAAA-MM-JJ. */
export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Bornes de la période à charger, incluses.
 * - du : aujourd'hui, ou le jour demandé s'il est passé ;
 * - au : aujourd'hui + 90 jours (+ 90 par extension), repoussé au jour
 *   demandé s'il est plus loin.
 */
export function fenetreRendezVous(
  aujourdhui: string, jourDemande: string | null, extensions = 0,
): { du: string; au: string } {
  const jour = jourValide(jourDemande);
  let du = aujourdhui;
  let au = ajouterJours(aujourdhui, FENETRE_JOURS + Math.max(0, extensions) * PAS_JOURS);
  if (jour && jour < du) du = jour;
  if (jour && jour > au) au = jour;
  return { du, au };
}
