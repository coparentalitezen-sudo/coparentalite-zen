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
    'Écris le rythme une seule fois.',
    'Note les exceptions à part.',
    'Un seul calendrier, lu par vous deux.',
  ],
  'vacances-scolaires': [
    'Pars des dates officielles de ta zone.',
    'Attribue chaque segment un par un.',
    'Note la décision là où chacun la retrouve.',
  ],
  'echange-enfants': [
    'Garde la même heure et le même lieu.',
    'Liste les affaires qui suivent l’enfant.',
    'Parle entre adultes à un autre moment.',
  ],
  'depenses-partagees': [
    'Note la dépense le jour même.',
    'Indique tout de suite la part de chacun.',
    'Regarde le solde, pas chaque ligne.',
  ],
  pension: [
    'Photographie le justificatif en payant.',
    'Range-le avec les autres, sans exception.',
    'Chaque trimestre, compte les mois.',
  ],
  'ecole-activites': [
    'Note la date dès réception.',
    'Précise qui s’y rend.',
    'Ajoute les activités récurrentes une fois.',
  ],
  'rendez-vous-medicaux': [
    'Note le prochain rendez-vous sur place.',
    'Note les consignes et la suite à donner.',
    'Garde l’ordonnance avec les précédentes.',
  ],
  'documents-familiaux': [
    'Prends en photo les documents souvent utiles.',
    'Range-les par enfant, pas par date.',
    'Vérifie les expirations avant les vacances.',
  ],
  communication: [
    'Tiens-toi aux faits : quoi, quand, où, qui.',
    'Une seule demande par message.',
    'Agacé ? Attends quelques heures pour écrire.',
  ],
  'nouveaux-conjoints': [
    'Dis qui peut aller chercher les enfants.',
    'Distingue ce qui revient aux parents.',
    'Annonce les changements à l’avance.',
  ],
  'familles-recomposees': [
    'Pose chaque rythme séparément.',
    'Repère les week-ends où tous sont là.',
    'Réserves-y les moments communs.',
  ],
  'longue-distance': [
    'Choisis les périodes des mois à l’avance.',
    'Note qui accompagne, aller et retour.',
    'Prévois un rendez-vous de repli.',
  ],
  imprevus: [
    'Ne touche jamais au rythme habituel.',
    'Note l’exception, sa date et son motif.',
    'Vérifie que l’autre parent l’a vue.',
  ],
  anniversaires: [
    'Choisis qui reçoit le jour même.',
    'Dis ce que tu offres avant d’acheter.',
    'Arrête la liste des invités une fois.',
  ],
  'conflits-planning': [
    'Écris l’accord dès qu’il est pris.',
    'Date-le et vérifie qu’il a été lu.',
    'En désaccord ? Relis l’écrit d’abord.',
  ],
  noel: [
    'Choisis comment partager les fêtes.',
    'Note l’heure et le lieu du passage.',
    'Envoie le planning bien avant les fêtes.',
  ],
};
