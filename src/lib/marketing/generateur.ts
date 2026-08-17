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
import { construireLien } from './utm';

export type Format = 'reel' | 'carrousel' | 'publication';
export type Categorie = 'conseil' | 'quotidien' | 'demonstration' | 'modele' | 'marque';

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
 */
const CYCLE: Categorie[] = [
  'conseil', 'quotidien', 'demonstration', 'conseil', 'modele', 'conseil', 'quotidien',
  'conseil', 'demonstration', 'quotidien', 'conseil', 'marque', 'conseil', 'demonstration',
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
export function sujetsDeLaSemaine(mois: number, graine: number): Sujet[] {
  const tirage = alea(graine);
  return [...BANQUE]
    .map((s) => ({
      sujet: s,
      rang: (s.saison?.includes(mois) ? 0 : 1) + tirage(),
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

/**
 * Contenu de marque, sans sujet : il ne parle d'aucune difficulté et n'ouvre
 * donc pas sur une solution. Un contenu sur vingt, pas davantage.
 */
function contenuMarque(
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
 * @param date  un jour quelconque de la semaine visée
 * @param base  l'adresse publique du site, pour les liens Facebook
 */
export function genererSemaine(date: Date, base: string): Contenu[] {
  const semaine = semaineIso(date);
  const annee = date.getFullYear();
  const tirage = alea(annee * 100 + semaine);
  const sujets = sujetsDeLaSemaine(date.getMonth() + 1, annee * 100 + semaine);

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
      texteAlternatif:
        `Visuel sobre sur fond crème. Titre : « ${accroche} ». `
        + `Sujet : ${sujet.angle.toLowerCase()}`,
      hashtags,
      appelAction: APPEL_ACTION,
      jour,
    };
  });
}
