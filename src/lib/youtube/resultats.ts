/**
 * Résultats YouTube pour l'onglet Résultats : vues, clics vers le site et
 * inscriptions de chaque Short, abonnés de la chaîne et leur progression.
 *
 * Fonction pure : la page lit la base, ceci fait les comptes.
 *
 * Clics : seuls ceux comptés à partir du 9/11/2026 sont repris. Avant, les
 * robots qui vérifient les liens d'une description étaient comptés comme des
 * spectateurs (deux à quatre « clics » par Short, tous le jour de publication) ;
 * la route de comptage les écarte désormais.
 */

export const DEBUT_FILTRE_ROBOTS = '2026-11-09';

export interface ShortPublie { jour: string; titre: string | null; video_id: string | null; vues: number | null }
export interface VisiteYoutube { contenu: string; jour: string; clics: number }
export interface ReleveChaine { jour: string; abonnes: number | null; abonnes_masques?: boolean | null; vues: number | null }

export interface LigneShortResultat {
  jour: string; titre: string; videoId: string | null;
  vues: number | null; clics: number; inscrits: number;
}

export interface SyntheseYoutube {
  lignes: LigneShortResultat[];
  vues: number | null;
  clics: number;
  inscrits: number;
  abonnes: number | null;
  abonnesMasques: boolean;
  /** Abonnés gagnés (ou perdus) depuis le relevé de référence. */
  progression: number | null;
  /** Nombre de jours couverts par la progression (7 au plus, moins au début). */
  progressionJours: number | null;
  releveLe: string | null;
}

const cle = (jour: string) => `yt-${jour}`;

function ecartJours(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

export function syntheseYoutube(
  shorts: ShortPublie[],
  visites: VisiteYoutube[],
  origines: (string | null)[],
  releves: ReleveChaine[],
): SyntheseYoutube {
  const clics = new Map<string, number>();
  for (const v of visites) {
    if (v.jour < DEBUT_FILTRE_ROBOTS) continue;
    clics.set(v.contenu, (clics.get(v.contenu) ?? 0) + (v.clics ?? 0));
  }
  const inscrits = new Map<string, number>();
  for (const o of origines) if (o) inscrits.set(o, (inscrits.get(o) ?? 0) + 1);

  const lignes = [...shorts]
    .sort((a, b) => b.jour.localeCompare(a.jour))
    .map((s) => ({
      jour: s.jour, titre: s.titre ?? '', videoId: s.video_id,
      vues: s.vues, clics: clics.get(cle(s.jour)) ?? 0, inscrits: inscrits.get(cle(s.jour)) ?? 0,
    }));

  const connues = lignes.filter((l) => l.vues !== null);
  const tries = [...releves].filter((r) => r.abonnes !== null).sort((a, b) => b.jour.localeCompare(a.jour));
  const dernier = tries[0] ?? null;
  // Référence : le relevé le plus récent datant d'au moins sept jours, sinon le plus ancien.
  const reference = dernier
    ? (tries.find((r) => ecartJours(dernier.jour, r.jour) >= 7) ?? tries[tries.length - 1])
    : null;
  const jours = dernier && reference ? ecartJours(dernier.jour, reference.jour) : null;

  return {
    lignes,
    vues: connues.length ? connues.reduce((t, l) => t + (l.vues ?? 0), 0) : null,
    clics: lignes.reduce((t, l) => t + l.clics, 0),
    inscrits: [...inscrits.entries()].filter(([k]) => k.startsWith('yt-')).reduce((t, [, n]) => t + n, 0),
    abonnes: dernier?.abonnes ?? null,
    abonnesMasques: Boolean([...releves].sort((a, b) => b.jour.localeCompare(a.jour))[0]?.abonnes_masques),
    progression: dernier && reference && jours ? (dernier.abonnes ?? 0) - (reference.abonnes ?? 0) : null,
    progressionJours: jours || null,
    releveLe: dernier?.jour ?? null,
  };
}

/** Visites et inscriptions par canal, sur une fenêtre glissante (robots exclus). */
export interface LigneCanal { source: string; visites7: number; visites30: number; inscrits30: number }
export function parCanal(
  visites: { source: string; jour: string; clics: number }[],
  inscrits: { origine_source: string | null; created_at: string }[],
  aujourdhui: string,
): LigneCanal[] {
  const jourMoins = (n: number) => new Date(Date.parse(`${aujourdhui}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const d7 = jourMoins(6), d30 = jourMoins(29);
  const t = new Map<string, LigneCanal>();
  const ligne = (s: string) => t.get(s) ?? t.set(s, { source: s, visites7: 0, visites30: 0, inscrits30: 0 }).get(s)!;
  for (const v of visites) {
    if (v.jour < DEBUT_FILTRE_ROBOTS || v.jour < d30) continue;
    const l = ligne(v.source);
    l.visites30 += v.clics ?? 0;
    if (v.jour >= d7) l.visites7 += v.clics ?? 0;
  }
  for (const i of inscrits) {
    if (i.created_at.slice(0, 10) < d30) continue;
    ligne(i.origine_source || 'sans-origine').inscrits30 += 1;
  }
  return [...t.values()].sort((a, b) => b.visites30 + b.inscrits30 * 100 - (a.visites30 + a.inscrits30 * 100));
}
