/**
 * Versions courtes des trois étapes de chaque sujet, pour les vidéos animées.
 *
 * Pourquoi un second jeu de phrases : une vidéo garde chaque sous-titre au
 * moins max(1,8 s ; voix + 0,6 s ; caractères / 12 + 1 s). Avec les étapes
 * complètes de banque.ts (60 à 78 caractères), une vidéo « accroche → trois
 * étapes → apport → logo » durait 33 à 41 s ; 37 combinaisons sur 45
 * dépassaient les 35 s visés. Ramenées à 45 caractères au plus, elle tient
 * dans 27 à 34 s sans rien retirer de la démonstration.
 *
 * Ce sont des condensés des étapes de la banque, rien de plus : même sens,
 * même ordre, aucun chiffre, aucune promesse ni affirmation juridique
 * ajoutés. Les carrousels, les publications et Pinterest gardent les
 * versions complètes. Rédigées le 5 novembre 2026, à valider par l'éditeur.
 */
export const LONGUEUR_MAX_ETAPE_COURTE = 45;

export const ETAPES_COURTES: Record<string, [string, string, string]> = {
  'garde-alternee': [
    'Écrivez le rythme une seule fois.',
    'Notez les exceptions à part.',
    'Lisez tous les deux le même calendrier.',
  ],
  'vacances-scolaires': [
    'Partez des dates officielles de votre zone.',
    'Attribuez chaque segment un par un.',
    'Notez la décision là où chacun la retrouve.',
  ],
  'echange-enfants': [
    'Gardez la même heure et le même lieu.',
    'Listez les affaires qui suivent l’enfant.',
    'Parlez entre adultes à un autre moment.',
  ],
  'depenses-partagees': [
    'Notez la dépense le jour même.',
    'Indiquez tout de suite la part de chacun.',
    'Regardez le solde, pas chaque ligne.',
  ],
  pension: [
    'Photographiez le justificatif en payant.',
    'Rangez-le avec les autres, sans exception.',
    'Chaque trimestre, comptez les mois.',
  ],
  'ecole-activites': [
    'Notez la date dès réception.',
    'Précisez qui s’y rend.',
    'Ajoutez les activités récurrentes une fois.',
  ],
  'rendez-vous-medicaux': [
    'Notez le prochain rendez-vous sur place.',
    'Notez les consignes et la suite à donner.',
    'Rangez l’ordonnance avec les précédentes.',
  ],
  'documents-familiaux': [
    'Photographiez les documents souvent utiles.',
    'Rangez-les par enfant, pas par date.',
    'Vérifiez les expirations avant les vacances.',
  ],
  communication: [
    'Tenez-vous aux faits : quoi, quand, où, qui.',
    'Une seule demande par message.',
    'Agacé ? Attendez quelques heures pour écrire.',
  ],
  'nouveaux-conjoints': [
    'Dites qui peut aller chercher les enfants.',
    'Distinguez ce qui revient aux parents.',
    'Annoncez les changements à l’avance.',
  ],
  'familles-recomposees': [
    'Posez chaque rythme séparément.',
    'Repérez les week-ends où tous sont là.',
    'Réservez-y les moments communs.',
  ],
  'longue-distance': [
    'Fixez les périodes des mois à l’avance.',
    'Notez qui accompagne, aller et retour.',
    'Prévoyez un rendez-vous de repli.',
  ],
  imprevus: [
    'Ne touchez jamais au rythme habituel.',
    'Notez l’exception, sa date et son motif.',
    'Vérifiez que l’autre parent l’a vue.',
  ],
  anniversaires: [
    'Fixez qui reçoit le jour même.',
    'Dites ce que vous offrez avant d’acheter.',
    'Arrêtez la liste des invités une fois.',
  ],
  'conflits-planning': [
    'Écrivez l’accord dès qu’il est pris.',
    'Datez-le et vérifiez qu’il a été lu.',
    'En désaccord ? Relisez l’écrit d’abord.',
  ],
};
