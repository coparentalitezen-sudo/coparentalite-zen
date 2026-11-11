/**
 * Mots-dièse d'une publication Instagram ou Facebook, selon son sujet.
 *
 * Règle du skill ig-caption (Instagram, depuis le 18/12/2025) : cinq au plus,
 * des étiquettes qui décrivent le sujet, pas un bloc générique identique sur
 * chaque publication. On garde les deux étiquettes de la marque et les deux
 * étiquettes larges choisies par l'éditeur le 8/11 (#maman, #papa : plus de
 * vues), et la cinquième nomme le sujet du jour (#vacancesscolaires,
 * #pensionalimentaire…), celle qu'un parent qui cherche ce sujet suit.
 */

export const BASE = ['#coparentalité', '#gardealternée'] as const;
export const LARGES = ['#maman', '#papa'] as const;

/** L'étiquette de sujet, par micro-niche de la banque. */
export const ETIQUETTE_SUJET: Record<string, string> = {
  'garde-alternee': '#parentsolo',
  'vacances-scolaires': '#vacancesscolaires',
  'echange-enfants': '#gardepartagée',
  'depenses-partagees': '#budgetfamilial',
  pension: '#pensionalimentaire',
  'ecole-activites': '#viescolaire',
  'rendez-vous-medicaux': '#santédesenfants',
  'documents-familiaux': '#papiersadministratifs',
  communication: '#communicationbienveillante',
  'nouveaux-conjoints': '#beauparent',
  'familles-recomposees': '#famillerecomposée',
  'longue-distance': '#parentàdistance',
  imprevus: '#organisationfamiliale',
  anniversaires: '#anniversaireenfant',
  'conflits-planning': '#organisationfamiliale',
  noel: '#noël',
  marque: '#parentsolo',
};

/** Thèmes du visuel quotidien → micro-niche. */
export const NICHE_DU_THEME: Record<string, string> = {
  garde: 'garde-alternee', depenses: 'depenses-partagees', vacances: 'vacances-scolaires',
  sac: 'echange-enfants', rendezvous: 'rendez-vous-medicaux', changement: 'imprevus',
  scolarite: 'ecole-activites',
};

export function motsDiesePour(niche: string): string[] {
  return [...BASE, ETIQUETTE_SUJET[niche] ?? '#parentsolo', ...LARGES];
}

const LIGNE_DIESES = /^(#[\p{L}\p{N}_]+)(\s+#[\p{L}\p{N}_]+)*$/u;

/**
 * Remplace le dernier paragraphe de mots-dièse d'une légende déjà écrite par
 * ceux du sujet. Sert au moment de publier : les légendes enregistrées avant
 * le changement en profitent sans réécriture en base. Idempotente ; une
 * légende sans paragraphe de mots-dièse final reçoit celui du sujet.
 */
export function avecMotsDiese(legende: string, niche: string): string {
  const paragraphes = legende.trim().split(/\n{2,}/);
  const dernier = paragraphes[paragraphes.length - 1]?.trim() ?? '';
  const ligne = motsDiesePour(niche).join(' ');
  if (LIGNE_DIESES.test(dernier)) paragraphes[paragraphes.length - 1] = ligne;
  else paragraphes.push(ligne);
  return paragraphes.join('\n\n');
}
