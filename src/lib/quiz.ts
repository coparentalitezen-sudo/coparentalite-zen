/**
 * Questionnaire d'orientation vers un rythme de garde.
 *
 * Un parent qui découvre l'application ne sait pas encore que « 2-2-5-5 »
 * existe, et encore moins si cela lui conviendrait. Quatre questions sur sa
 * situation réelle suffisent à désigner un point de départ crédible — qu'il
 * pourra changer ensuite, rien ici n'est définitif.
 *
 * Le questionnaire est public et ne demande aucun compte : il montre d'abord
 * ce que l'application sait faire, l'inscription vient après.
 *
 * Fonctions pures, sans dépendance au navigateur : la logique se teste, et
 * l'écran ne fait que l'afficher.
 */
import type { CustodyPattern } from './custody';

export interface Reponses {
  /** Âge du plus jeune enfant. */
  age: 'petit' | 'grand';
  /** Distance entre les deux domiciles. */
  distance: 'proche' | 'loin';
  /** Répartition souhaitée ou déjà en place. */
  repartition: 'partagee' | 'principale';
  /** Régularité des horaires de travail. */
  horaires: 'reguliers' | 'variables' | 'decales';
}

export type CleQuestion = keyof Reponses;

export interface Question {
  cle: CleQuestion;
  /** Formulation courte : elle doit tenir sur un écran de téléphone. */
  intitule: string;
  /** Ce que la question sert à déterminer, dit sans jargon. */
  precision?: string;
  options: { valeur: string; libelle: string; detail?: string }[];
}

export const QUESTIONS: Question[] = [
  {
    cle: 'age',
    intitule: 'Quel âge a votre plus jeune enfant ?',
    precision:
      'Avant six ans, les longues séparations sont généralement mal vécues.',
    options: [
      { valeur: 'petit', libelle: 'Moins de 6 ans' },
      { valeur: 'grand', libelle: '6 ans et plus' },
    ],
  },
  {
    cle: 'distance',
    intitule: 'Quelle distance sépare les deux domiciles ?',
    precision: 'Elle détermine le nombre de trajets supportables par semaine.',
    options: [
      { valeur: 'proche', libelle: 'Moins de 30 minutes' },
      { valeur: 'loin', libelle: 'Plus d’une heure' },
    ],
  },
  {
    cle: 'repartition',
    intitule: 'Comment souhaitez-vous répartir le temps ?',
    options: [
      {
        valeur: 'partagee',
        libelle: 'À parts égales',
        detail: 'Les enfants vivent autant chez l’un que chez l’autre.',
      },
      {
        valeur: 'principale',
        libelle: 'Principalement chez un parent',
        detail: 'L’autre parent les accueille régulièrement.',
      },
    ],
  },
  {
    cle: 'horaires',
    intitule: 'Vos horaires de travail sont-ils réguliers ?',
    options: [
      {
        valeur: 'reguliers',
        libelle: 'Les mêmes jours chaque semaine',
      },
      {
        valeur: 'variables',
        libelle: 'Variables d’une semaine à l’autre',
      },
      {
        valeur: 'decales',
        libelle: 'Gardes, astreintes ou roulements',
      },
    ],
  },
];

export interface Recommandation {
  pattern: CustodyPattern;
  /** Pourquoi ce rythme, formulé à partir des réponses données. */
  raison: string;
  /** Second rythme à considérer, avec ce qui le distinguerait. */
  alternative: CustodyPattern;
  raisonAlternative: string;
}

/**
 * Rythme conseillé à partir des quatre réponses.
 *
 * L'ordre des règles compte : une contrainte matérielle (distance, horaires
 * atypiques) prime sur une préférence, parce qu'aucun rythme ne tient si les
 * trajets sont impossibles. L'âge vient ensuite, puis la régularité.
 */
export function recommander(r: Reponses): Recommandation {
  if (r.repartition === 'principale' || r.distance === 'loin') {
    return {
      pattern: 'alternating_weekends',
      raison: r.distance === 'loin'
        ? 'Plus d’une heure de trajet rend les échanges fréquents éprouvants pour les enfants comme pour vous : mieux vaut des séjours plus rares et plus longs.'
        : 'Les enfants gardent un domicile principal et retrouvent l’autre parent à un rythme prévisible.',
      alternative: 'alternating_weeks',
      raisonAlternative:
        'Si la distance se réduit un jour, l’alternance hebdomadaire devient envisageable.',
    };
  }

  if (r.horaires === 'decales') {
    return {
      pattern: 'custom',
      raison:
        'Des gardes ou des roulements ne se plient à aucun modèle standard : vous dessinez le cycle jour par jour, sur une à quatre semaines.',
      alternative: 'p2233',
      raisonAlternative:
        'Si vos roulements suivent malgré tout un cycle court et régulier, ce modèle peut suffire.',
    };
  }

  if (r.age === 'petit') {
    return {
      pattern: 'p2233',
      raison:
        'Avant six ans, une semaine entière sans l’autre parent est longue. Ce rythme ne dépasse jamais trois jours d’affilée.',
      alternative: 'p3443',
      raisonAlternative:
        'À mesure que l’enfant grandit, des séjours de trois à quatre jours deviennent confortables.',
    };
  }

  if (r.horaires === 'reguliers') {
    return {
      pattern: 'p2255',
      raison:
        'Vos jours de garde ne bougent jamais d’une semaine à l’autre : le planning s’accorde à des horaires fixes, et les week-ends alternent.',
      alternative: 'alternating_weeks',
      raisonAlternative:
        'Si vous préférez moins de trajets, quitte à perdre des jours fixes, l’alternance hebdomadaire est plus simple.',
    };
  }

  return {
    pattern: 'alternating_weeks',
    raison:
      'Le rythme le plus répandu : peu de trajets, des repères simples, et un planning qui se retient sans effort.',
    alternative: 'p3443',
    raisonAlternative:
      'Si une semaine entière vous paraît longue, ce modèle raccourcit les séjours sans multiplier les échanges.',
  };
}

/** Clé de mémorisation du rythme conseillé, relue à la configuration du foyer. */
export const CLE_RYTHME_SUGGERE = 'czen_rythme_suggere';

/** Patterns acceptés en relecture : une valeur stockée vient du navigateur. */
const PATTERNS_CONNUS: CustodyPattern[] = [
  'alternating_weeks', 'even_weeks', 'odd_weeks', 'p2233', 'p3443',
  'p2255', 'alternating_weekends', 'custom',
];

/**
 * Mémorise le rythme conseillé pour la configuration du foyer.
 *
 * Le stockage peut être refusé — navigation privée, réglage restrictif. Le
 * questionnaire a déjà affiché son résultat à l'écran : perdre la mémorisation
 * ne coûte qu'une présélection, jamais le service. On renonce en silence.
 */
export function memoriserRythmeSuggere(pattern: CustodyPattern): void {
  try {
    window.localStorage.setItem(CLE_RYTHME_SUGGERE, pattern);
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}

/**
 * Relit le rythme conseillé, une seule fois : il est effacé à la lecture.
 *
 * Sans cet effacement, un parent qui changerait de rythme des mois plus tard
 * verrait resurgir une réponse donnée avant même son inscription.
 */
export function lireRythmeSuggere(): CustodyPattern | null {
  try {
    const brut = window.localStorage.getItem(CLE_RYTHME_SUGGERE);
    if (!brut) return null;
    window.localStorage.removeItem(CLE_RYTHME_SUGGERE);
    return (PATTERNS_CONNUS as string[]).includes(brut)
      ? (brut as CustodyPattern)
      : null;
  } catch {
    return null;
  }
}
