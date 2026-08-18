/**
 * Agrégation des mesures.
 *
 * Séparée de l'accès aux données pour être vérifiable sans base : le calcul
 * d'un taux de conversion se teste sur des tableaux, celui d'une requête SQL
 * ne se teste qu'en production.
 *
 * DEUX FAMILLES DE MESURES, ET ELLES NE SE MÉLANGENT PAS
 *
 *  * Ce que nous mesurons nous-mêmes : clics reçus, inscriptions attribuées,
 *    passage à une formule payante. Disponible dès aujourd'hui.
 *  * Ce que seul Meta connaît : portée, vues, taux de lecture, interactions.
 *    Indisponible tant que la connexion n'est pas faite.
 *
 * La distinction compte : afficher zéro pour une portée inconnue laisserait
 * croire qu'un contenu n'a touché personne, alors qu'on n'en sait rien. Ces
 * mesures valent donc null, et l'écran dit « en attente ».
 */

export interface LigneVisite {
  contenu: string;
  source: string;
  clics: number;
}

export interface LigneContenu {
  reference: string;
  niche: string;
  format: string;
  categorie: string;
  accroche: string;
  statut: string;
}

export interface PerformanceContenu {
  reference: string;
  niche: string;
  format: string;
  categorie: string;
  accroche: string;
  clics: number;
  inscriptions: number;
  /** Inconnu tant que Meta n'est pas connecté — jamais zéro par défaut. */
  portee: number | null;
  vues: number | null;
}

export interface Agregat {
  cle: string;
  clics: number;
  inscriptions: number;
  contenus: number;
  /** Inscriptions par contenu publié : la seule comparaison honnête entre
   *  une niche traitée deux fois et une autre traitée vingt fois. */
  rendement: number;
}

/** Rapproche contenus, clics et inscriptions par référence. */
export function performances(
  contenus: LigneContenu[],
  visites: LigneVisite[],
  originesInscrits: string[],
): PerformanceContenu[] {
  const clics = new Map<string, number>();
  for (const v of visites) {
    clics.set(v.contenu, (clics.get(v.contenu) ?? 0) + (v.clics ?? 0));
  }
  const inscriptions = new Map<string, number>();
  for (const o of originesInscrits) {
    inscriptions.set(o, (inscriptions.get(o) ?? 0) + 1);
  }

  return contenus.map((c) => ({
    reference: c.reference,
    niche: c.niche,
    format: c.format,
    categorie: c.categorie,
    accroche: c.accroche,
    clics: clics.get(c.reference) ?? 0,
    inscriptions: inscriptions.get(c.reference) ?? 0,
    portee: null,
    vues: null,
  }));
}

/** Regroupe les performances selon une dimension : niche, format, catégorie. */
export function regrouper(
  lignes: PerformanceContenu[], dimension: 'niche' | 'format' | 'categorie',
): Agregat[] {
  const table = new Map<string, Agregat>();
  for (const l of lignes) {
    const cle = l[dimension];
    const a = table.get(cle) ?? { cle, clics: 0, inscriptions: 0, contenus: 0, rendement: 0 };
    a.clics += l.clics;
    a.inscriptions += l.inscriptions;
    a.contenus += 1;
    table.set(cle, a);
  }
  for (const a of table.values()) {
    a.rendement = a.contenus > 0
      ? Math.round((a.inscriptions / a.contenus) * 100) / 100
      : 0;
  }
  // Tri par rendement, puis par clics : deux niches à rendement nul se
  // départagent par l'intérêt qu'elles ont malgré tout suscité.
  return [...table.values()].sort((x, y) =>
    y.rendement - x.rendement || y.clics - x.clics);
}

/** Taux de transformation, arrondi au dixième, sans division par zéro. */
export function taux(numerateur: number, denominateur: number): number {
  if (denominateur <= 0) return 0;
  return Math.round((numerateur / denominateur) * 1000) / 10;
}

export interface Entonnoir {
  clics: number;
  inscriptions: number;
  foyersActives: number;
  abonnements: number;
  tauxInscription: number;
  tauxActivation: number;
  tauxAbonnement: number;
}

/**
 * Entonnoir d'acquisition.
 *
 * Chaque taux se rapporte à l'étape précédente et non au total : un taux
 * d'abonnement calculé sur les clics mélangerait deux déperditions distinctes
 * et masquerait celle qui coûte réellement.
 */
export function entonnoir(
  clics: number, inscriptions: number, foyersActives: number, abonnements: number,
): Entonnoir {
  return {
    clics, inscriptions, foyersActives, abonnements,
    tauxInscription: taux(inscriptions, clics),
    tauxActivation: taux(foyersActives, inscriptions),
    tauxAbonnement: taux(abonnements, foyersActives),
  };
}

/**
 * Les trois meilleures accroches, à condition qu'il y ait matière à comparer.
 *
 * En dessous de trois contenus mesurés, la fonction ne renvoie rien : classer
 * deux accroches revient à désigner un gagnant par tirage au sort, et cette
 * désignation orienterait ensuite toute la production.
 */
export function meilleuresAccroches(
  lignes: PerformanceContenu[], minimum = 3,
): PerformanceContenu[] {
  const mesurees = lignes.filter((l) => l.clics > 0);
  if (mesurees.length < minimum) return [];
  return [...mesurees].sort((a, b) => b.clics - a.clics).slice(0, 3);
}
