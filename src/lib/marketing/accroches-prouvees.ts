/**
 * Accroches prouvées par les mesures réelles.
 *
 * `hookscore.py` (skill ig-reel) écarte bien les accroches manifestement
 * faibles, mais il prédit mal les vues : son auteur l'a mesuré (AUC 0,56, à
 * peine mieux que le hasard), et nos propres Shorts le confirment — « Le
 * papier manquant se découvre toujours au mauvais moment. » est notée 36 et a
 * fait 848 vues. Quand les mesures et la note se contredisent, les mesures
 * gagnent : une accroche listée ici passe le test des accroches même sous le
 * seuil (tests/accroches-skill.test.ts). Elle doit tout de même éviter les
 * salutations, préambules, mots-dièse et emoji.
 *
 * Règle d'entrée : au moins 400 vues sur un Short YouTube (ou l'équivalent en
 * portée Meta), relevées dans marketing_youtube_shorts / marketing_mesures.
 * Chiffres réels uniquement : la preuve cite la date et le nombre relevés.
 * Le suivi hebdomadaire (docs/SUIVI-ACCROCHES.md) tient cette liste à jour.
 */
export interface AccrocheProuvee {
  accroche: string;
  preuve: string;
}

export const SEUIL_PREUVE_VUES = 400;

export const ACCROCHES_PROUVEES: readonly AccrocheProuvee[] = [
  { accroche: 'Le 24 ou le 25 ? Décide-le à l’avance.', preuve: 'Short YouTube du 15/11/2026 : 933 vues' },
  { accroche: 'Superposer deux calendriers de tête, personne n’y arrive.', preuve: 'Short YouTube du 10/11/2026 : 898 vues' },
  { accroche: 'Le papier manquant se découvre toujours au mauvais moment.', preuve: 'Short YouTube du 07/11/2026 : 848 vues' },
  { accroche: 'L’anniversaire se prépare à deux, et à l’avance.', preuve: 'Short YouTube du 13/11/2026 : 585 vues' },
  { accroche: 'L’école prévient un parent. À toi de prévenir l’autre.', preuve: 'Short YouTube du 05/11/2026 : 563 vues (version au vouvoiement)' },
  { accroche: 'Un message clair évite les relances.', preuve: 'Short YouTube du 08/11/2026 : 448 vues' },
];
