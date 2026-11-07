/**
 * Textes des vignettes (image de couverture) des vidéos animées.
 *
 * La vignette est ce qu'on voit avant d'appuyer : grille du profil Instagram,
 * miniature YouTube, fil Facebook. L'accroche complète y était illisible
 * (une phrase de soixante caractères en petit sur une bande blanche) : la
 * vignette porte une version courte, en gros, qui pose la question.
 *
 * Une vignette par accroche de la banque, dans le même ordre : la vignette
 * annonce exactement ce que la vidéo raconte. Mêmes règles que banque.ts :
 * aucun chiffre ni témoignage ajouté (un nombre n'apparaît que s'il est déjà
 * dans l'accroche), aucun parent désigné fautif, aucune promesse de résultat.
 * 34 caractères au plus : trois lignes en très gros caractères.
 */

export const VIGNETTE_MAX = 34;

export const VIGNETTES: Record<string, readonly [string, string, string]> = {
  'garde-alternee': ['Encore à compter de tête ?', 'Jeudi prochain, chez qui ?', 'Le rythme de garde, lisible'],
  'vacances-scolaires': ['Février ? Ça se joue déjà', 'Qui prend la première semaine ?', 'Réserver deux fois ? Non.'],
  'echange-enfants': ['Pourquoi l’échange coince ?', 'Le sac prêt la veille', 'L’échange sans surprise'],
  'depenses-partagees': ['Qui a payé les chaussures ?', 'Les comptes, au fil de l’eau', 'La dépense notée le jour même'],
  pension: ['Le justificatif de mars ?', 'Trente secondes ou une soirée ?', 'L’historique, pas la mémoire'],
  'ecole-activites': ['La réunion d’école oubliée ?', 'Une seule convocation ?', 'Et l’autre parent, prévenu ?'],
  'rendez-vous-medicaux': ['Qui a le carnet de santé ?', 'Le médecin a dit quoi ?', 'Trois lignes suffisent'],
  'documents-familiaux': ['La carte d’identité, chez qui ?', 'Une copie accessible', 'Le papier qui manque…'],
  communication: ['Pas une conversation', 'Écrire moins, écrire précis', 'Fini les relances'],
  'nouveaux-conjoints': ['Mercredi, qui va les chercher ?', 'Un rôle clair pour chacun', 'Les nouveaux repères'],
  'familles-recomposees': ['Deux rythmes, une maison', 'Tout le monde là ce week-end ?', 'Deux calendriers de tête ?'],
  'longue-distance': ['À trois cents kilomètres…', 'Loin, et organisés', 'La distance s’organise'],
  imprevus: ['Un week-end échangé, et après ?', 'L’exception, à part', 'Convenu par message… perdu ?'],
  anniversaires: ['Deux fois le même cadeau ?', 'Mercredi : chez qui ?', 'L’anniversaire, à deux'],
  'conflits-planning': ['Deux souvenirs sincères', '« On avait dit… »', 'Daté, donc plus discuté'],
};

/** Vignette de l'accroche : celle de même rang, sinon une des trois selon la graine. */
export function vignetteDe(niche: string, accroches: readonly string[], accroche: string, graine: number): string {
  const liste = VIGNETTES[niche];
  if (!liste) throw new Error(`Pas de vignettes pour la niche « ${niche} ».`);
  const rang = accroches.indexOf(accroche);
  return liste[rang >= 0 && rang < liste.length ? rang : graine % liste.length];
}
