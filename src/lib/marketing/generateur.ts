/**
 * Génération de la semaine éditoriale.
 *
 * Déterministe : la même semaine engendre exactement les mêmes contenus. Ce
 * n'est pas un détail de confort, c'est ce qui rend l'opération rejouable —
 * relancer la génération après une erreur ne produit pas une seconde série de
 * brouillons à trier.
 *
 * Aucun modèle de langage n'intervient. La variété vient de la recombinaison :
 * quinze sujets, plusieurs accroches chacun, cinq façons de les mettre en
 * forme. C'est moins souple qu'une rédaction assistée, c'est gratuit, et cela
 * ne dépend d'aucune clé d'API.
 */

import { BANQUE, MARQUE, type Sujet } from './banque';
import { QUESTIONS } from '../quiz';
import { construireLien } from './utm';

export type Format = 'reel' | 'carrousel' | 'publication';
export type Categorie =
  'conseil' | 'quotidien' | 'demonstration' | 'modele' | 'marque' | 'quiz';

export interface Page {
  titre: string;
  texte: string;
  /** Durée en secondes, pour les Reels seulement. */
  secondes?: number;
}

export interface Contenu {
  reference: string;          // sert d'utm_content : stable, lisible
  niche: string;
  format: Format;
  categorie: Categorie;
  accroche: string;
  pages: Page[];
  legendeInstagram: string;
  legendeFacebook: string;
  texteAlternatif: string;
  hashtags: string[];
  appelAction: string;
  jour: number;               // 0 = dimanche, conformément à Date.getDay()
}

/** L'appel à l'action, identique partout où il a un sens. */
export const APPEL_ACTION =
  'Simplifiez votre organisation familiale avec CoparentalitéZen. Lien dans la bio.';

/**
 * Cadence par défaut : trois Reels, deux carrousels, deux publications.
 * Les clés suivent Date.getDay() — dimanche vaut 0.
 */
export const CADENCE: Record<number, Format> = {
  1: 'reel', 2: 'carrousel', 3: 'publication',
  4: 'reel', 5: 'carrousel', 6: 'reel', 0: 'publication',
};

/**
 * Répartition éditoriale sur un cycle de quatre semaines.
 *
 * 40 / 25 / 20 / 10 / 5 ne tombe pas juste sur sept contenus : 40 % de sept
 * font 2,8. Étalée sur vingt-huit créneaux, la répartition tombe juste, et
 * chaque semaine reste proche de la cible sans qu'aucune ne soit aberrante.
 *
 * Le créneau 8 porte le questionnaire. Sa position n'est pas indifférente :
 * le cycle avance de sept par semaine, donc l'indice 8 retombe toujours sur
 * le deuxième créneau de la semaine, qui est un carrousel. Un questionnaire
 * publié en Reel ou en image unique n'aurait aucun sens — il lui faut des
 * planches à faire défiler.
 */
const CYCLE: Categorie[] = [
  'conseil', 'quotidien', 'demonstration', 'conseil', 'modele', 'conseil', 'quotidien',
  'conseil', 'quiz', 'quotidien', 'conseil', 'marque', 'conseil', 'demonstration',
  'quotidien', 'conseil', 'modele', 'conseil', 'demonstration', 'quotidien', 'conseil',
  'demonstration', 'quotidien', 'conseil', 'modele', 'conseil', 'demonstration', 'quotidien',
];

/** Générateur pseudo-aléatoire à graine : reproductible, contrairement à Math.random. */
function alea(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Numéro de semaine ISO : la graine naturelle d'une production hebdomadaire. */
export function semaineIso(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - debut.getTime()) / 86400000) + 1) / 7);
}

/**
 * Sujets ordonnés pour une semaine donnée.
 *
 * Les sujets de saison passent devant quand le mois s'y prête : parler des
 * vacances de février en novembre a du sens, en juillet beaucoup moins. Le
 * reste est mélangé de façon reproductible, pour ne pas traiter éternellement
 * les quinze niches dans l'ordre de la liste.
 */
export function sujetsDeLaSemaine(
  mois: number, graine: number, poids: Record<string, number> = {},
): Sujet[] {
  const tirage = alea(graine);
  return [...BANQUE]
    .map((s) => ({
      sujet: s,
      // Le poids divise le rang : un sujet qui obtient des inscriptions
      // remonte, sans jamais évincer les autres — la part aléatoire subsiste,
      // et le poids reste borné en base. Un sujet affaibli continue donc
      // d'être tiré, donc d'être mesuré.
      rang: ((s.saison?.includes(mois) ? 0 : 1) + tirage()) / (poids[s.niche] ?? 1),
    }))
    .sort((a, b) => a.rang - b.rang)
    .map((x) => x.sujet);
}

/** Trois à cinq mots-dièse, jamais plus : au-delà, ils cessent d'être pertinents. */
function motsDiese(sujet: Sujet, tirage: () => number): string[] {
  const nombre = 3 + Math.floor(tirage() * 3); // 3, 4 ou 5
  return sujet.hashtags.slice(0, Math.min(nombre, sujet.hashtags.length));
}

/** Corps d'un Reel : quatre plans, vingt à trente-cinq secondes au total. */
function plansReel(sujet: Sujet, accroche: string): Page[] {
  return [
    { titre: 'Accroche', texte: accroche, secondes: 3 },
    { titre: 'Le problème', texte: sujet.probleme, secondes: 6 },
    { titre: 'Ce qui aide', texte: sujet.etapes.join(' Puis : '), secondes: 14 },
    { titre: 'Transition', texte: sujet.apport, secondes: 5 },
  ];
}

/** Corps d'un carrousel : six planches, une idée par planche. */
function planchesCarrousel(sujet: Sujet, accroche: string, categorie: Categorie): Page[] {
  const couverture = { titre: 'Couverture', texte: accroche };
  const fin = { titre: 'Pour aller plus loin', texte: sujet.apport };

  if (categorie === 'modele') {
    return [
      couverture,
      { titre: 'À quoi ça sert', texte: sujet.intention },
      ...sujet.modele.slice(0, 4).map((element, i) => ({
        titre: `Élément ${i + 1}`, texte: element,
      })),
      fin,
    ];
  }

  return [
    couverture,
    { titre: 'Le problème', texte: sujet.probleme },
    { titre: 'Étape 1', texte: sujet.etapes[0] },
    { titre: 'Étape 2', texte: sujet.etapes[1] },
    { titre: 'Étape 3', texte: sujet.etapes[2] },
    fin,
  ];
}

/**
 * Légende Instagram : l'accroche, une idée, l'appel à l'action, les mots-dièse.
 * Légende Facebook : la même matière, en phrases suivies et avec le lien —
 * « lien dans la bio » n'a aucun sens sur Facebook, où le lien peut figurer
 * dans la publication elle-même.
 */
function legendes(
  sujet: Sujet, accroche: string, corps: string, hashtags: string[], lien: string,
): { instagram: string; facebook: string } {
  // Les contenus de démonstration portent déjà l'apport dans leur corps :
  // le rappeler produirait la même phrase deux fois de suite.
  const rappel = corps.includes(sujet.apport) ? '' : `${sujet.apport}\n\n`;
  return {
    instagram: `${accroche}\n\n${corps}\n\n${APPEL_ACTION}\n\n${hashtags.join(' ')}`,
    facebook:
      `${accroche}\n\n${corps}\n\n${rappel}`
      + `Simplifiez votre organisation familiale avec Coparentalité Zen : ${lien}`,
  };
}

/** Accroches du questionnaire, pour ne pas republier la même couverture. */
const ACCROCHES_QUIZ = [
  'Quel rythme de garde correspond vraiment à votre famille ?',
  'Cinq questions pour trouver votre rythme de garde.',
  'Il existe sept rythmes de garde. Lequel est le vôtre ?',
  'Répondez à cinq questions, repartez avec votre planning.',
];

/**
 * Carrousel du questionnaire.
 *
 * Les planches sont construites à partir des questions réelles du
 * questionnaire, et non recopiées à côté. Modifier une question sur le site
 * change donc le carrousel à la génération suivante — deux libellés qui
 * divergent produiraient un lecteur qui répond à une question sur Instagram
 * et en trouve une autre en arrivant sur la page.
 *
 * Une publication du fil n'est pas interactive : personne ne peut y appuyer
 * sur une réponse. Le carrousel fait donc réfléchir, et c'est le lien qui
 * calcule le planning. Les planches sont écrites dans cet esprit — elles
 * n'annoncent jamais un résultat qu'Instagram serait incapable de donner.
 */
function planchesQuiz(accroche: string): Page[] {
  return [
    { titre: 'Couverture', texte: accroche },
    ...QUESTIONS.map((q, i) => ({
      titre: `Question ${i + 1}`,
      texte: `${q.intitule}\n\n${q.options.map((o) => `• ${o.libelle}`).join('\n')}`,
    })),
    {
      titre: 'Votre résultat',
      texte:
        'Semaine sur deux, 2-2-3, 2-2-5-5, 3-4-4-3, week-end alterné ou cycle '
        + 'personnalisé : le questionnaire complet affiche votre planning sur '
        + 'deux semaines, sans inscription. Lien dans la bio.',
    },
  ];
}

function contenuQuiz(
  reference: string, jour: number, lienQuiz: string, indice: number,
): Contenu {
  const accroche = ACCROCHES_QUIZ[indice % ACCROCHES_QUIZ.length];
  const hashtags = [
    '#gardealternée', '#coparentalité', '#parentsséparés', '#organisationfamiliale',
  ];

  return {
    reference, niche: 'rythme-de-garde', format: 'carrousel', categorie: 'quiz',
    accroche,
    pages: planchesQuiz(accroche),
    legendeInstagram:
      `${accroche}\n\n`
      + 'Faites défiler et répondez pour vous. À la fin, le questionnaire '
      + 'complet vous montre le planning correspondant, sur deux semaines, '
      + 'sans créer de compte.\n\n'
      + `${APPEL_ACTION}\n\n${hashtags.join(' ')}`,
    legendeFacebook:
      `${accroche}\n\n`
      + 'Faites défiler et répondez pour vous. Le questionnaire complet '
      + 'affiche ensuite le planning correspondant, sur deux semaines, sans '
      + `créer de compte : ${lienQuiz}`,
    texteAlternatif:
      'Carrousel sobre. Couverture en texte blanc sur fond bleu marine : '
      + `« ${accroche} ». Les planches suivantes, en texte foncé sur fond `
      + 'crème, posent cinq questions sur l’âge des enfants, leur nombre, le '
      + 'partage des dépenses, la répartition du temps et les horaires de '
      + 'travail.',
    hashtags,
    appelAction: APPEL_ACTION,
    jour,
  };
}

/**
 * Contenu de marque, sans sujet : il ne parle d'aucune difficulté et n'ouvre
 * donc pas sur une solution. Un contenu sur vingt, pas davantage.
 */function contenuMarque(
  reference: string, format: Format, jour: number, lien: string, indice: number,
): Contenu {
  const m = MARQUE[indice % MARQUE.length];

  // Un contenu de marque obéit aux mêmes contraintes de format que les autres :
  // un carrousel de deux planches n'est pas un carrousel, et un Reel de huit
  // secondes n'en est pas un non plus.
  const pages: Page[] =
    format === 'reel' ? [
      { titre: 'Accroche', texte: m.accroche, secondes: 4 },
      { titre: 'Le propos', texte: m.corps, secondes: 16 },
      { titre: 'En pratique', texte: m.planches[0], secondes: 6 },
    ]
    : format === 'carrousel' ? [
      { titre: 'Couverture', texte: m.accroche },
      { titre: 'Le propos', texte: m.corps },
      ...m.planches.map((texte, i) => ({ titre: `Point ${i + 1}`, texte })),
    ]
    : [{ titre: 'Visuel', texte: m.accroche }];

  return {
    reference, niche: 'marque', format, categorie: 'marque',
    accroche: m.accroche,
    pages,
    legendeInstagram: `${m.accroche}\n\n${m.corps}\n\n${APPEL_ACTION}\n\n#coparentalité #parentsséparés #organisationfamiliale`,
    legendeFacebook: `${m.accroche}\n\n${m.corps}\n\nDécouvrir l’application : ${lien}`,
    texteAlternatif: m.texteAlternatif,
    hashtags: ['#coparentalité', '#parentsséparés', '#organisationfamiliale'],
    appelAction: APPEL_ACTION,
    jour,
  };
}

/**
 * Produit les sept contenus d'une semaine.
 *
 * @param date   un jour quelconque de la semaine visée
 * @param base   l'adresse publique du site, pour les liens Facebook
 * @param poids  influence de chaque niche, issue de la boucle d'amélioration
 */
export function genererSemaine(
  date: Date, base: string, poids: Record<string, number> = {},
): Contenu[] {
  const semaine = semaineIso(date);
  const annee = date.getFullYear();
  const tirage = alea(annee * 100 + semaine);
  const sujets = sujetsDeLaSemaine(date.getMonth() + 1, annee * 100 + semaine, poids);

  // Le cycle de vingt-huit créneaux avance de sept par semaine : la
  // répartition éditoriale tient sur quatre semaines, pas sur une seule.
  const depart = ((semaine - 1) * 7) % CYCLE.length;
  const jours = [1, 2, 3, 4, 5, 6, 0];

  return jours.map((jour, i) => {
    const categorie = CYCLE[(depart + i) % CYCLE.length];
    const format = CADENCE[jour];
    const reference = `${annee}s${String(semaine).padStart(2, '0')}-${format}-${i + 1}`;
    const lien = construireLien(
      base, { source: 'facebook', campagne: 'acquisition', contenu: reference },
    );

    if (categorie === 'marque') {
      return contenuMarque(reference, format, jour, lien, semaine);
    }

    if (categorie === 'quiz') {
      // Le lien mène au questionnaire, pas à l'accueil : une personne venue
      // pour connaître son rythme de garde et déposée sur la page d'accueil
      // devrait le chercher elle-même, et ne le ferait pas.
      const lienQuiz = construireLien(
        base, { source: 'facebook', campagne: 'acquisition', contenu: reference },
        '/quiz',
      );
      return contenuQuiz(reference, jour, lienQuiz, semaine);
    }

    const sujet = sujets[i % sujets.length];
    const accroche = sujet.accroches[Math.floor(tirage() * sujet.accroches.length)];
    const hashtags = motsDiese(sujet, tirage);

    // Le corps de la légende dépend de l'intention du créneau : donner un
    // conseil, faire reconnaître une situation, montrer l'application, ou
    // fournir une liste réutilisable.
    const corps =
      categorie === 'conseil' ? sujet.etapes.join('\n\n')
      : categorie === 'quotidien' ? `${sujet.probleme}\n\n${sujet.angle}`
      : categorie === 'demonstration' ? `${sujet.angle}\n\n${sujet.apport}`
      : sujet.modele.map((e) => `• ${e}`).join('\n');

    const pages = format === 'reel'
      ? plansReel(sujet, accroche)
      : format === 'carrousel'
        ? planchesCarrousel(sujet, accroche, categorie)
        : [{ titre: 'Visuel', texte: accroche }];

    const { instagram, facebook } = legendes(sujet, accroche, corps, hashtags, lien);

    return {
      reference, niche: sujet.niche, format, categorie, accroche, pages,
      legendeInstagram: instagram,
      legendeFacebook: facebook,
      // Le texte alternatif décrit ce que l'image montre, sans jamais évoquer
      // un enfant identifiable : les visuels n'en comportent aucun.
      // La couverture est sur fond marine, les planches suivantes sur crème.
      // Décrire l'inverse tromperait précisément les personnes qui dépendent
      // de ce texte pour se représenter l'image.
      texteAlternatif:
        `Visuel sobre, texte blanc sur fond bleu marine. Titre : « ${accroche} ». `
        + `Sujet : ${sujet.angle.toLowerCase()}`,
      hashtags,
      appelAction: APPEL_ACTION,
      jour,
    };
  });
}
