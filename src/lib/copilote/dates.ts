/** Dates du copilote, toutes au format AAAA-MM-JJ et calculées en UTC. */

export function jourIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return jourIso(d);
}

/** Nombre de jours de `a` à `b` (positif si b est après a). */
export function ecartJours(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Semaine ISO 8601, année comprise : « 2026-S47 ».
 *
 * L'année est celle de la semaine, pas du calendrier : le lundi 29 décembre
 * 2025 appartient à 2026-S01. Le confondre ferait écrire deux rapports sous
 * la même clé à chaque changement d'année.
 */
export function cleSemaine(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const annee = d.getUTCFullYear();
  const debut = Date.UTC(annee, 0, 1);
  const numero = Math.ceil(((d.getTime() - debut) / 86_400_000 + 1) / 7);
  return `${annee}-S${String(numero).padStart(2, '0')}`;
}

/**
 * Période analysée : les sept jours complets qui précèdent l'exécution.
 * Le lundi matin, c'est exactement la semaine écoulée, du lundi au dimanche.
 */
export function periodeAnalysee(maintenant: Date): { debut: string; fin: string } {
  const fin = ajouterJours(jourIso(maintenant), -1);
  return { debut: ajouterJours(fin, -6), fin };
}

/** « 9 nov. » — format court pour les rapports. */
export function jourCourt(jour: string): string {
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const [, m, j] = jour.split('-').map(Number);
  return `${j} ${mois[m - 1]}`;
}
