/**
 * Questionnaire d'orientation vers un rythme de garde.
 *
 * Un parent qui découvre l'application ne sait pas encore que « 2-2-5-5 »
 * existe, et encore moins si cela lui conviendrait. Cinq questions sur sa
 * situation réelle suffisent à désigner un point de départ crédible — qu'il
 * pourra changer ensuite, rien ici n'est définitif.
 *
 * Toutes les questions ne servent pas au même but. L'âge, la répartition et
 * les horaires déterminent le rythme ; le nombre d'enfants et le partage des
 * dépenses n'y changent rien, mais orientent ce que l'on met en avant après
 * le résultat. Les confondre laisserait croire qu'une réponse pèse sur un
 * conseil qu'elle ne touche pas.
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
  /** Nombre d'enfants concernés par l'organisation. */
  enfants: 'un' | 'deux' | 'troisPlus';
  /** Les dépenses liées aux enfants sont-elles déjà partagées ? */
  depenses: 'oui' | 'pasEncore' | 'non';
  /** Répartition en place, ou souhaitée. */
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
    cle: 'enfants',
    intitule: 'Combien avez-vous d’enfants ?',
    options: [
      { valeur: 'un', libelle: 'Un enfant' },
      { valeur: 'deux', libelle: 'Deux enfants' },
      { valeur: 'troisPlus', libelle: 'Trois enfants ou plus' },
    ],
  },
  {
    cle: 'depenses',
    /*
     * « L'autre parent » et non « le papa » : la moitié des parents séparés
     * qui s'organisent sont des pères, et une question qui les désigne comme
     * un tiers les écarte dès la troisième réponse.
     */
    intitule:
      'Partagez-vous les dépenses liées aux enfants avec l’autre parent ?',
    precision:
      'Cantine, activités, santé, fournitures — tout ce qui se règle à deux.',
    options: [
      { valeur: 'oui', libelle: 'Oui, régulièrement' },
      { valeur: 'pasEncore', libelle: 'Pas encore, mais c’est prévu' },
      { valeur: 'non', libelle: 'Non, chacun paie de son côté' },
    ],
  },
  {
    cle: 'repartition',
    intitule: 'Quel rythme de garde avez-vous, ou souhaitez-vous ?',
    precision:
      'Répondez sur la situation en place si elle existe déjà, sinon sur '
      + 'celle que vous visez.',
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
      { valeur: 'reguliers', libelle: 'Les mêmes jours chaque semaine' },
      { valeur: 'variables', libelle: 'Variables d’une semaine à l’autre' },
      { valeur: 'decales', libelle: 'Gardes, astreintes ou roulements' },
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

export interface ConseilsRythme {
  benefices: string[];
  vigilance: string;
}

/**
 * Bénéfices concrets et point d'attention du rythme affiché.
 *
 * Ces textes restent volontairement organisationnels : le questionnaire ne
 * connaît ni la situation juridique ni l'histoire familiale de la personne.
 */
export function conseilsRythme(pattern: CustodyPattern): ConseilsRythme {
  const conseils: Record<CustodyPattern, ConseilsRythme> = {
    alternating_weeks: {
      benefices: ['Peu de passages d’un domicile à l’autre.', 'Un calendrier simple à mémoriser.'],
      vigilance: 'Une semaine complète peut sembler longue aux plus jeunes : prévoyez des repères stables et des transitions claires.',
    },
    even_weeks: {
      benefices: ['Les semaines attribuées restent prévisibles.', 'Les changements se repèrent longtemps à l’avance.'],
      vigilance: 'Vérifiez chaque année la correspondance entre semaines paires et calendrier scolaire.',
    },
    odd_weeks: {
      benefices: ['Les semaines attribuées restent prévisibles.', 'Les changements se repèrent longtemps à l’avance.'],
      vigilance: 'Vérifiez chaque année la correspondance entre semaines impaires et calendrier scolaire.',
    },
    p2233: {
      benefices: ['Aucune séparation ne dépasse trois jours.', 'Les contacts avec chaque parent sont fréquents.'],
      vigilance: 'Les passages sont nombreux : préparez les affaires et les horaires de transition à l’avance.',
    },
    p3443: {
      benefices: ['Les séjours restent courts sans changer chaque jour.', 'Les week-ends peuvent alterner régulièrement.'],
      vigilance: 'Le cycle est moins intuitif qu’une semaine sur deux : un calendrier partagé devient particulièrement utile.',
    },
    p2255: {
      benefices: ['Les mêmes jours de semaine reviennent chez le même parent.', 'Les week-ends alternent sans modifier les jours fixes.'],
      vigilance: 'Les blocs de cinq jours demandent d’anticiper école, activités et affaires personnelles.',
    },
    alternating_weekends: {
      benefices: ['Le domicile principal reste stable.', 'Les week-ends d’accueil sont prévisibles.'],
      vigilance: 'Ajoutez séparément les vacances et les temps en semaine prévus par votre organisation.',
    },
    custom: {
      benefices: ['Le cycle suit vos contraintes réelles.', 'Les roulements professionnels peuvent être reproduits fidèlement.'],
      vigilance: 'Un cycle personnalisé doit être relu ensemble, surtout après un changement d’horaires.',
    },
  };
  return conseils[pattern];
}

/**
 * Rythme conseillé à partir des réponses qui le concernent.
 *
 * L'ordre des règles compte : une contrainte matérielle prime sur une
 * préférence, parce qu'aucun rythme ne tient si le quotidien l'empêche.
 * L'âge vient ensuite, puis la régularité des horaires.
 */
export function recommander(r: Reponses): Recommandation {
  if (r.repartition === 'principale') {
    return {
      pattern: 'alternating_weekends',
      raison:
        'Les enfants gardent un domicile principal et retrouvent l’autre parent à un rythme prévisible, week-end après week-end.',
      alternative: 'alternating_weeks',
      raisonAlternative:
        'Si vous vous orientez un jour vers un temps partagé, l’alternance hebdomadaire est le passage le plus simple.',
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

/**
 * Ce que le partage des dépenses appelle comme suite, en une phrase.
 *
 * Trois situations, trois besoins : tenir des comptes déjà partagés, se
 * préparer à les ouvrir, ou seulement garder une trace. Répondre la même
 * chose aux trois donnerait le sentiment que la question n'a servi à rien.
 */
export function conseilDepenses(r: Reponses): string {
  if (r.depenses === 'oui') {
    return 'Vous partagez déjà les dépenses : l’application les enregistre, calcule ce que chacun doit et garde l’historique des remboursements.';
  }
  if (r.depenses === 'pasEncore') {
    return 'Quand le partage des dépenses commencera, tout est prêt : une dépense s’ajoute en quelques secondes et le solde se met à jour seul.';
  }
  return 'Même quand chacun paie de son côté, garder une trace des dépenses évite bien des discussions plus tard. La fonction reste là si le besoin vient.';
}

/** Les enfants, désignés tels qu'on en parle. */
export function libelleEnfants(r: Reponses): string {
  if (r.enfants === 'un') return 'votre enfant';
  if (r.enfants === 'deux') return 'vos deux enfants';
  return 'vos enfants';
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
