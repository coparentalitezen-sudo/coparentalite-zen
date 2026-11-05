/**
 * Heure de publication, à l'heure de Paris.
 *
 * Chaque plateforme a son heure (marketing_parametres.heure). Une horloge
 * appelle la publication toutes les heures ; la publication ne part que si
 * l'heure réglée est atteinte ce jour-là. « Atteinte » et non « égale » : une
 * horloge en retard d'une heure publie quand même, et l'idempotence garantit
 * qu'un passage suivant ne republie pas.
 */

const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false });
const FORMAT_JOUR = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
const FORMAT_JOUR_SEMAINE = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' });

/** Heure (0 à 23) à Paris. */
export function heureParis(maintenant = new Date()): number {
  return Number(FORMAT_HEURE.format(maintenant)) % 24;
}

/** Date du jour à Paris, AAAA-MM-JJ. */
export function jourParis(maintenant = new Date()): string {
  return FORMAT_JOUR.format(maintenant);
}

/** Jour de la semaine à Paris, 0 = dimanche (comme Date.getDay et le champ `jour` du générateur). */
export function jourSemaineParis(maintenant = new Date()): number {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(FORMAT_JOUR_SEMAINE.format(maintenant));
}

export const HEURE_PAR_DEFAUT = 10;

/** L'heure réglée est-elle atteinte aujourd'hui ? */
export function heureAtteinte(heureReglee: number | null | undefined, maintenant = new Date()): boolean {
  const h = Number.isInteger(heureReglee) ? (heureReglee as number) : HEURE_PAR_DEFAUT;
  return heureParis(maintenant) >= h;
}

/** Ajoute n jours à une date AAAA-MM-JJ. */
export function decalerJour(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
