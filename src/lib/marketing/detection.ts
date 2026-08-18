/**
 * Détection des micro-niches.
 *
 * Le principe : classer les quinze sujets suivis, chaque semaine, pour décider
 * lesquels traiter en priorité. Le classement ne prétend pas mesurer un
 * marché — il ordonne des sujets à partir de signaux imparfaits mais réels et
 * légalement accessibles.
 *
 * SOURCES RETENUES, ET POURQUOI CELLES-LÀ
 *
 *  1. Le calendrier scolaire officiel (data.education.gouv.fr), déjà intégré à
 *     l'application. Il dit ce qui approche : parler des vacances de février
 *     en novembre a du sens, en juillet beaucoup moins.
 *
 *  2. Les consultations d'articles Wikipédia en français (API Pageviews de la
 *     Wikimedia Foundation). Publique, documentée, sans clé, sans compte. Elle
 *     mesure une curiosité réelle sur « résidence alternée » ou « pension
 *     alimentaire », et ses variations saisonnières.
 *
 *  3. Nos propres mesures : clics reçus et inscriptions attribuées par niche.
 *     C'est le seul signal qui porte sur des gens que le contenu a réellement
 *     touchés. Il pèse donc lourd — mais seulement quand il repose sur assez
 *     de contenus pour signifier quelque chose.
 *
 * SOURCES ÉCARTÉES, EXPLICITEMENT
 *
 *  * Google Trends : aucune API officielle. Les bibliothèques disponibles
 *    contournent une interface non publique, ce qui sort du cadre fixé.
 *  * Groupes Facebook, forums privés, comptes fermés : l'aspiration en est
 *    illégale, et les conditions d'utilisation de Meta l'interdisent.
 *  * Achats de données d'audience : payants, donc hors cadre.
 *
 * PRUDENCE STATISTIQUE
 *
 * Une niche n'est jamais déclarée gagnante sur une publication. En dessous de
 * trois contenus publiés, la performance observée n'entre pas dans le score :
 * un Reel qui marche un mardi ne prouve rien, et laisser un tel accident
 * réorienter la production est le moyen le plus sûr de tout miser sur du bruit.
 */

import type { Sujet } from './banque';

/** Nombre de contenus publiés en dessous duquel la performance est ignorée. */
export const SEUIL_FIABILITE = 3;

export interface SignauxNiche {
  /** Consultations Wikipédia sur trente jours, ou null si la source a échoué. */
  consultations: number | null;
  /** Contenus publiés sur cette niche. */
  publies: number;
  /** Clics reçus, toutes plateformes. */
  clics: number;
  /** Inscriptions attribuées. */
  inscriptions: number;
  /** Une période scolaire concernée approche-t-elle ? */
  saisonProche: boolean;
}

export interface Score {
  /** Note finale sur 100. */
  total: number;
  /** Les huit composantes, pour que le classement soit relisible. */
  details: {
    interet: number;
    frequence: number;
    adequation: number;
    potentielClic: number;
    potentielInscription: number;
    performancePassee: number;
    saisonnalite: number;
    concurrence: number;
  };
  /** Vrai tant que la performance observée n'est pas fiable. */
  provisoire: boolean;
}

/** Ramène une valeur dans l'intervalle 0–1, en la comparant à un repère. */
function proportion(valeur: number, repere: number): number {
  if (repere <= 0) return 0;
  return Math.max(0, Math.min(1, valeur / repere));
}

/**
 * Calcule le score d'une niche.
 *
 * Les huit critères demandés, pondérés. La performance passée pèse le plus —
 * c'est le seul signal qui porte sur des gens réels — mais uniquement quand
 * elle repose sur assez de contenus. En deçà, sa part est redistribuée sur
 * l'intérêt observé, faute de quoi une niche jamais traitée resterait
 * éternellement dernière et ne serait jamais essayée.
 */
export function calculerScore(
  sujet: Sujet, signaux: SignauxNiche, repereConsultations: number, mois: number,
): Score {
  const fiable = signaux.publies >= SEUIL_FIABILITE;

  const interet = proportion(signaux.consultations ?? 0, repereConsultations);
  // Fréquence : un problème qui revient chaque semaine vaut mieux qu'un
  // problème annuel. Les sujets sans saison marquée sont, par construction,
  // ceux qui se posent toute l'année.
  const frequence = sujet.saison ? 0.6 : 1;
  // Adéquation : le sujet renvoie-t-il à une fonctionnalité qui existe ?
  // Tous les sujets de la banque en citent une, d'où une valeur pleine ; le
  // critère existe pour le jour où la banque s'ouvrira à d'autres sources.
  const adequation = 1;
  const potentielClic = fiable ? proportion(signaux.clics / signaux.publies, 40) : 0.5;
  const potentielInscription = fiable
    ? proportion(signaux.inscriptions / signaux.publies, 3)
    : 0.5;
  const performancePassee = fiable
    ? proportion(signaux.inscriptions, signaux.publies)
    : 0;
  const saisonnalite = sujet.saison?.includes(mois) ? 1 : signaux.saisonProche ? 0.7 : 0.2;
  // Concurrence : faute de mesure légale et gratuite de la concurrence
  // éditoriale française, ce critère est neutre et déclaré tel quel. Lui
  // inventer une valeur donnerait au score une précision qu'il n'a pas.
  const concurrence = 0.5;

  const poids = fiable
    ? { interet: 12, frequence: 10, adequation: 10, potentielClic: 15,
        potentielInscription: 15, performancePassee: 20, saisonnalite: 13, concurrence: 5 }
    : { interet: 27, frequence: 10, adequation: 10, potentielClic: 15,
        potentielInscription: 15, performancePassee: 0, saisonnalite: 18, concurrence: 5 };

  const details = {
    interet: interet * poids.interet,
    frequence: frequence * poids.frequence,
    adequation: adequation * poids.adequation,
    potentielClic: potentielClic * poids.potentielClic,
    potentielInscription: potentielInscription * poids.potentielInscription,
    performancePassee: performancePassee * poids.performancePassee,
    saisonnalite: saisonnalite * poids.saisonnalite,
    concurrence: concurrence * poids.concurrence,
  };

  const total = Object.values(details).reduce((s, v) => s + v, 0);

  return {
    total: Math.round(total * 100) / 100,
    details: Object.fromEntries(
      Object.entries(details).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ) as Score['details'],
    provisoire: !fiable,
  };
}

/**
 * Articles Wikipédia associés à chaque niche.
 *
 * Choisis pour leur rapport direct au sujet. Un article trop général
 * — « Famille » — mesurerait une curiosité encyclopédique sans lien avec la
 * difficulté vécue par un parent séparé.
 */
export const ARTICLES: Record<string, string> = {
  'garde-alternee': 'Résidence_alternée',
  'vacances-scolaires': 'Vacances_scolaires_en_France',
  'depenses-partagees': 'Pension_alimentaire',
  pension: 'Pension_alimentaire',
  communication: 'Médiation_familiale',
  'familles-recomposees': 'Famille_recomposée',
  'nouveaux-conjoints': 'Famille_recomposée',
  'conflits-planning': 'Autorité_parentale_en_France',
  'documents-familiaux': 'Autorité_parentale_en_France',
  'ecole-activites': 'Calendrier_scolaire_français',
};

/** Adresse de l'API Pageviews pour un article et une plage de dates. */
export function urlConsultations(article: string, debut: Date, fin: Date): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article'
    + `/fr.wikipedia/all-access/user/${encodeURIComponent(article)}`
    + `/daily/${iso(debut)}/${iso(fin)}`;
}

/** Somme des consultations d'une réponse de l'API Pageviews. */
export function totaliserConsultations(reponse: unknown): number | null {
  const corps = reponse as { items?: { views?: number }[] };
  if (!Array.isArray(corps?.items)) return null;
  return corps.items.reduce((s, i) => s + (typeof i.views === 'number' ? i.views : 0), 0);
}

/**
 * Classe les sujets par score décroissant.
 *
 * Les scores provisoires ne sont pas écartés : ils sont signalés. Un sujet
 * jamais traité doit pouvoir remonter, sans quoi la production tournerait
 * indéfiniment sur les mêmes trois niches.
 */
export function classer(
  sujets: Sujet[],
  signaux: Record<string, SignauxNiche>,
  mois: number,
): { sujet: Sujet; score: Score }[] {
  const consultations = Object.values(signaux)
    .map((s) => s.consultations ?? 0)
    .filter((n) => n > 0);
  // Le repère est la meilleure niche observée, pas une constante : ce qui
  // compte est le rang relatif, et un seuil figé vieillirait mal.
  const repere = consultations.length > 0 ? Math.max(...consultations) : 1;

  return sujets
    .map((sujet) => ({
      sujet,
      score: calculerScore(
        sujet,
        signaux[sujet.niche] ?? {
          consultations: null, publies: 0, clics: 0, inscriptions: 0, saisonProche: false,
        },
        repere,
        mois,
      ),
    }))
    .sort((a, b) => b.score.total - a.score.total);
}
