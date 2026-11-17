/**
 * Banque de sujets.
 *
 * La matière première, séparée des gabarits qui la mettent en forme. C'est ce
 * qui permet de produire un carrousel lundi et un Reel jeudi sur le même sujet
 * sans répéter le même texte : le gabarit change, la matière reste.
 *
 * Chaque sujet décrit une difficulté réelle et vérifiable de la coparentalité,
 * et la fonctionnalité qui y répond. Aucune statistique, aucun témoignage : on
 * n'invente pas de chiffres, et un témoignage fabriqué se retournerait contre
 * l'application le jour où quelqu'un le vérifierait.
 *
 * Le ton est calme et pratique. Rien ici ne désigne un parent fautif : les
 * contenus qui opposent les parents font de l'audience et détruisent la
 * confiance des deux côtés.
 */

export interface Sujet {
  /** Identifiant de la micro-niche, tel qu'il figure en base. */
  niche: string;
  /** La difficulté vécue, formulée du point de vue du parent. */
  probleme: string;
  /** Ce que le parent cherche à faire. */
  intention: string;
  /** L'angle éditorial. */
  angle: string;
  /** La fonctionnalité mise en avant. */
  fonctionnalite: string;
  /** Plusieurs accroches, pour ne pas ouvrir deux contenus de la même façon. */
  accroches: string[];
  /** Trois étapes concrètes, applicables sans l'application. */
  etapes: [string, string, string];
  /** Les éléments d'une liste ou d'un modèle réutilisable. */
  modele: string[];
  /** Ce que l'application fait de plus, une fois les étapes comprises. */
  apport: string;
  /** Trois à cinq mots-dièse réellement liés au sujet. */
  hashtags: string[];
  /**
   * Ce qu'un parent tape réellement dans une barre de recherche.
   *
   * Pinterest n'est pas un fil d'actualité mais un moteur : une épingle
   * intitulée « Tu comptes encore les semaines de tête ? » ne répond à
   * aucune requête, alors que « planning garde alternée à imprimer » en est
   * une. Ces formulations servent de titre aux épingles ; les accroches
   * restent réservées à Instagram et Facebook, où elles interpellent.
   */
  recherches: string[];
  /** Mois où le sujet est le plus pertinent. Vide : toute l'année. */
  saison?: number[];
}

export const BANQUE: Sujet[] = [
  {
    niche: 'garde-alternee',
    recherches: ['planning garde alternée à imprimer', 'calendrier semaine sur deux', 'rythme de garde 2-2-3'],
    probleme: 'Personne ne sait avec certitude chez qui dorment les enfants la semaine prochaine.',
    intention: 'Voir le planning sans avoir à le recalculer ni à le redemander.',
    angle: 'Un calendrier partagé vaut mieux qu’une règle que chacun applique de tête.',
    fonctionnalite: 'Le planning de garde',
    accroches: [
      'Tu comptes encore les semaines de tête ?',
      'Jeudi prochain, tu sais chez qui dorment les enfants ?',
      'Arrête de retenir ton rythme de garde : écris-le une fois.',
    ],
    etapes: [
      'Écris le rythme une seule fois : type, date de début, parent qui commence.',
      'Note les changements ponctuels à part, sans toucher au rythme habituel.',
      'Vérifie que les deux parents regardent bien le même calendrier.',
    ],
    modele: [
      'Type de rythme (une semaine sur deux, 2-2-3, 3-4-4-3…)',
      'Date de début et parent qui commence',
      'Heure et lieu d’échange habituels',
      'Ce qui change pendant les vacances scolaires',
    ],
    apport: 'Le calendrier se remplit tout seul et reste identique des deux côtés.',
    hashtags: ['#coparentalite', '#gardealternee', '#parentssepares', '#organisationfamiliale'],
  },
  {
    niche: 'vacances-scolaires',
    recherches: ['partage vacances scolaires parents séparés', 'calendrier vacances garde alternée'],
    probleme: 'Les vacances se décident tard, souvent dans l’urgence, parfois deux fois.',
    intention: 'Fixer les périodes assez tôt pour pouvoir réserver sereinement.',
    angle: 'Décider en novembre coûte moins cher que décider en février.',
    fonctionnalite: 'Les vacances scolaires officielles, importées automatiquement',
    accroches: [
      'Tes vacances de février se jouent dès novembre.',
      'Tu sais déjà qui prend la première semaine de février ?',
      'Réserver avant d’avoir tranché, c’est réserver deux fois.',
    ],
    etapes: [
      'Pars des dates officielles de ta zone, pas de ton souvenir.',
      'Découpe chaque période en segments et attribue-les un par un.',
      'Écris la décision quelque part où les deux parents la reliront.',
    ],
    modele: [
      'Dates officielles de la zone',
      'Découpage retenu (moitié, semaine par semaine…)',
      'Qui prend quel segment cette année',
      'Alternance prévue l’année suivante',
    ],
    apport: 'Le calendrier scolaire officiel est déjà chargé, zone par zone.',
    hashtags: ['#vacancesscolaires', '#coparentalite', '#parentssepares', '#organisation'],
    saison: [10, 11, 12, 1, 2, 5, 6],
  },
  {
    niche: 'echange-enfants',
    recherches: ['organiser les échanges d’enfants après séparation', 'lieu d’échange garde alternée'],
    probleme: 'L’échange se passe mal parce que rien n’a été précisé avant.',
    intention: 'Rendre le moment de l’échange prévisible et court.',
    angle: 'Ce qui est écrit avant n’a pas à être discuté sur le trottoir.',
    fonctionnalite: 'Les rendez-vous et les affaires à préparer',
    accroches: [
      'Ton échange du vendredi coince ? Rarement à cause des enfants.',
      'Prépare le sac jeudi soir, pas sur le trottoir vendredi.',
      'Même heure chaque vendredi : plus personne n’est surpris.',
    ],
    etapes: [
      'Fixe une heure et un lieu qui ne changent pas d’une semaine à l’autre.',
      'Liste ce qui voyage avec l’enfant, et vérifie la liste avant de partir.',
      'Garde la conversation entre adultes pour un autre moment que l’échange.',
    ],
    modele: [
      'Vêtements pour la durée du séjour',
      'Cartable, devoirs, matériel de sport',
      'Traitement en cours et ordonnance',
      'Doudou, objet du soir',
      'Carte vitale ou carnet de santé si besoin',
    ],
    apport: 'La liste des affaires est rattachée au rendez-vous, et rappelée la veille.',
    hashtags: ['#coparentalite', '#parentssepares', '#organisation', '#residencealternee'],
  },
  {
    niche: 'depenses-partagees',
    recherches: ['partage des frais enfants parents séparés', 'tableau dépenses garde alternée'],
    probleme: 'Les frais s’accumulent et plus personne ne sait qui a payé quoi.',
    intention: 'Savoir où en est le partage sans avoir à refaire les comptes.',
    angle: 'Un compte tenu au fil de l’eau évite la discussion de fin d’année.',
    fonctionnalite: 'Le suivi des dépenses partagées',
    accroches: [
      'Tu ne sais plus qui a payé les chaussures de sport ?',
      'Ne refais plus tes comptes en décembre : note au fil de l’eau.',
      'Une dépense notée le jour même ne se discute plus.',
    ],
    etapes: [
      'Note la dépense le jour même, avec le justificatif photographié.',
      'Indique la part de chacun au moment où tu l’enregistres.',
      'Regarde le solde plutôt que de recompter ligne par ligne.',
    ],
    modele: [
      'Date et montant',
      'Enfant concerné',
      'Catégorie (santé, école, sport, vêtements…)',
      'Qui a avancé les frais',
      'Part de chaque parent',
    ],
    apport: 'Le solde se met à jour tout seul, et les justificatifs restent attachés.',
    hashtags: ['#depensespartagees', '#coparentalite', '#budgetfamilial', '#parentssepares'],
  },
  {
    niche: 'pension',
    recherches: ['calcul pension alimentaire enfant', 'suivi pension alimentaire tableau'],
    probleme: 'Les justificatifs sont éparpillés entre messages, photos et papiers.',
    intention: 'Retrouver une preuve de paiement sans fouiller douze mois d’historique.',
    angle: 'Ranger au moment où l’on paie coûte trente secondes ; ranger après, une soirée.',
    fonctionnalite: 'L’historique et les justificatifs',
    accroches: [
      'Le justificatif de mars : tu le retrouves en dix secondes ?',
      'Trente secondes au moment de payer, ou une soirée six mois plus tard.',
      'Ne compte plus sur ta mémoire pour les versements de l’année.',
    ],
    etapes: [
      'Photographie le justificatif au moment du paiement, pas plus tard.',
      'Range-le au même endroit que les autres, sans exception.',
      'Vérifie une fois par trimestre qu’aucun mois ne manque.',
    ],
    modele: [
      'Mois concerné',
      'Montant versé et date',
      'Moyen de paiement',
      'Justificatif joint',
    ],
    apport: 'Chaque versement garde sa pièce jointe, consultable par les deux parents.',
    hashtags: ['#coparentalite', '#parentssepares', '#organisation', '#viedeparent'],
  },
  {
    niche: 'ecole-activites',
    recherches: ['organisation école garde alternée', 'planning activités enfants parents séparés'],
    probleme: 'Une réunion d’école n’arrive qu’à un seul des deux parents.',
    intention: 'Que les deux parents aient la même information scolaire au même moment.',
    angle: 'L’information scolaire ne devrait pas dépendre de qui relève la boîte aux lettres.',
    fonctionnalite: 'Les rendez-vous partagés',
    accroches: [
      'Réunion d’école mardi : tu as prévenu l’autre parent ?',
      'Deux parents, une seule convocation : le problème est là.',
      'L’école prévient un parent. À toi de prévenir l’autre.',
    ],
    etapes: [
      'Note la date dès réception, avant de refermer le cahier.',
      'Précise qui s’y rend, pour éviter d’y aller à deux ou à zéro.',
      'Ajoute les activités récurrentes une fois pour toutes.',
    ],
    modele: [
      'Réunions et conseils de classe',
      'Sorties et voyages scolaires',
      'Entraînements et compétitions',
      'Représentations et spectacles',
      'Jours sans école',
    ],
    apport: 'Le rendez-vous est visible par les deux parents dès qu’il est créé.',
    hashtags: ['#rentreescolaire', '#coparentalite', '#parentssepares', '#ecoleprimaire'],
    saison: [8, 9, 10, 6],
  },
  {
    niche: 'rendez-vous-medicaux',
    recherches: ['carnet de santé garde alternée', 'suivi rendez-vous médicaux enfants'],
    probleme: 'Le parent qui n’accompagne pas ignore ce qui a été dit chez le médecin.',
    intention: 'Transmettre l’essentiel du rendez-vous sans y consacrer un échange entier.',
    angle: 'Trois lignes écrites valent mieux qu’un récit qu’on croit avoir fait.',
    fonctionnalite: 'Les rendez-vous et leurs notes',
    accroches: [
      'Rendez-vous chez le médecin mardi : qui a le carnet de santé ?',
      'Le rendez-vous s’est bien passé. Encore faut-il le dire.',
      'Après le rendez-vous, trois lignes suffisent.',
    ],
    etapes: [
      'Note la date du prochain rendez-vous avant de quitter le cabinet.',
      'Écris trois lignes : ce qui a été dit, ce qui est prescrit, ce qui suit.',
      'Garde l’ordonnance au même endroit que les précédentes.',
    ],
    modele: [
      'Date et praticien',
      'Motif du rendez-vous',
      'Ce qui a été dit',
      'Traitement prescrit et durée',
      'Prochaine échéance',
    ],
    apport: 'La note reste attachée au rendez-vous, lisible par les deux parents.',
    hashtags: ['#santeenfant', '#coparentalite', '#parentssepares', '#organisationfamiliale'],
  },
  {
    niche: 'documents-familiaux',
    recherches: ['papiers des enfants garde alternée', 'ranger documents administratifs enfants'],
    probleme: 'Un papier indispensable est toujours chez l’autre parent.',
    intention: 'Accéder au document au moment où on en a besoin.',
    angle: 'Un original chez l’un, une copie accessible aux deux.',
    fonctionnalite: 'Le rangement des documents',
    accroches: [
      'Départ samedi, et tu ne sais pas où est la carte d’identité ?',
      'Tu cherches encore le livret de famille ? Partage une copie.',
      'Le papier manquant se découvre toujours au mauvais moment.',
    ],
    etapes: [
      'Prends en photo les documents qui servent plusieurs fois par an.',
      'Range-les par enfant, pas par date.',
      'Vérifie les dates d’expiration avant les vacances, pas pendant.',
    ],
    modele: [
      'Pièce d’identité et passeport',
      'Carnet de santé et vaccins',
      'Attestation d’assurance scolaire',
      'Certificat de scolarité',
      'Autorisation de sortie du territoire si nécessaire',
    ],
    apport: 'Les documents sont rangés par enfant et consultables par les deux parents.',
    hashtags: ['#organisationfamiliale', '#coparentalite', '#parentssepares', '#administratif'],
  },
  {
    niche: 'communication',
    recherches: ['communiquer avec son ex sans conflit', 'message coparentalité exemple'],
    probleme: 'Les échanges dérivent vite parce que tout passe par le même canal.',
    intention: 'Séparer l’organisation des enfants du reste de la relation.',
    angle: 'Ce qui est factuel se lit mieux quand ce n’est pas mélangé au reste.',
    fonctionnalite: 'Un espace commun dédié à l’organisation',
    accroches: [
      'Arrête de tout mélanger : l’organisation n’est pas une conversation.',
      'Écris moins, écris précis : la tension baisse toute seule.',
      'Un message clair évite les relances.',
    ],
    etapes: [
      'Tiens-toi aux faits : quoi, quand, où, qui.',
      'Une demande par message, pour qu’une réponse suffise.',
      'Diffère de quelques heures les messages écrits sous le coup de l’agacement.',
    ],
    modele: [
      'De quoi il s’agit',
      'Date et heure concernées',
      'Ce que tu demandes précisément',
      'Jusqu’à quand tu attends une réponse',
    ],
    apport: 'L’information d’organisation vit dans l’application, pas dans une messagerie.',
    hashtags: ['#coparentalite', '#communication', '#parentssepares', '#famille'],
  },
  {
    niche: 'nouveaux-conjoints',
    recherches: ['beau-parent place dans la famille', 'présenter son nouveau conjoint aux enfants'],
    probleme: 'L’arrivée d’un nouveau conjoint brouille les repères d’organisation.',
    intention: 'Que chacun sache qui fait quoi, sans que les rôles soient à deviner.',
    angle: 'Clarifier les rôles apaise davantage que d’en discuter longuement.',
    fonctionnalite: 'Les rôles au sein du foyer',
    accroches: [
      'Mercredi à la sortie de l’école, tu sais qui récupère les enfants ?',
      'Ne laisse pas deviner le rôle de chacun dans ta nouvelle famille.',
      'Nouveau conjoint ? Préviens l’autre parent avant, pas après.',
    ],
    etapes: [
      'Dis qui peut aller chercher les enfants, et qui doit être prévenu.',
      'Distingue ce qui relève des parents de ce qui peut être délégué.',
      'Annonce les changements avant qu’ils ne surprennent l’autre parent.',
    ],
    modele: [
      'Qui peut accompagner et récupérer',
      'Qui est prévenu en cas d’imprévu',
      'Qui décide des rendez-vous médicaux',
      'Ce qui reste entre parents',
    ],
    apport: 'Chaque membre du foyer a son propre accès, avec les droits qui lui reviennent.',
    hashtags: ['#famillerecomposee', '#coparentalite', '#parentssepares', '#beauparent'],
  },
  {
    niche: 'familles-recomposees',
    recherches: ['organisation famille recomposée', 'planning famille recomposée'],
    probleme: 'Deux calendriers de garde différents se superposent dans le même foyer.',
    intention: 'Voir en une fois qui est là, et quand.',
    angle: 'Deux rythmes ne se retiennent pas ; ils se superposent sur un calendrier.',
    fonctionnalite: 'La vue d’ensemble du foyer',
    accroches: [
      'Deux rythmes de garde sous ton toit ? Arrête de les calculer de tête.',
      'Samedi, tous les enfants sont là ? Tu le sais un mois avant ?',
      'Superposer deux calendriers de tête, personne n’y arrive.',
    ],
    etapes: [
      'Pose chaque rythme séparément, sans chercher à les fusionner.',
      'Repère les week-ends où tous les enfants sont présents.',
      'Réserve les moments communs sur ces week-ends-là.',
    ],
    modele: [
      'Rythme du premier foyer',
      'Rythme du second foyer',
      'Week-ends où tout le monde est présent',
      'Vacances communes possibles',
    ],
    apport: 'Les périodes se lisent côte à côte, sans calcul.',
    hashtags: ['#famillerecomposee', '#coparentalite', '#organisationfamiliale', '#parentssepares'],
  },
  {
    niche: 'longue-distance',
    recherches: ['garde alternée longue distance', 'voir ses enfants à distance'],
    probleme: 'La distance transforme chaque échange en trajet à organiser.',
    intention: 'Prévoir les trajets assez tôt pour qu’ils coûtent moins cher et fatiguent moins.',
    angle: 'À distance, ce qui se décide tard se paie deux fois.',
    fonctionnalite: 'Les périodes et les rendez-vous planifiés',
    accroches: [
      'À trois cents kilomètres, un week-end se prépare un mois avant.',
      'Loin de tes enfants ? Fixe tes week-ends trois mois avant.',
      'Tu ne peux pas réduire la distance. Tu peux l’organiser.',
    ],
    etapes: [
      'Fixe les périodes plusieurs mois à l’avance, pas quelques semaines.',
      'Note qui accompagne, à l’aller comme au retour.',
      'Prévois le rendez-vous de repli si le trajet est annulé.',
    ],
    modele: [
      'Dates de départ et de retour',
      'Moyen de transport et horaires',
      'Qui accompagne à l’aller, qui au retour',
      'Solution de repli en cas d’annulation',
    ],
    apport: 'Les périodes lointaines sont visibles longtemps à l’avance par les deux parents.',
    hashtags: ['#coparentalite', '#parentssepares', '#gardealternee', '#organisation'],
  },
  {
    niche: 'imprevus',
    recherches: ['changer un jour de garde imprévu', 'gérer les imprévus garde alternée'],
    probleme: 'Un changement de dernière minute se perd entre deux messages.',
    intention: 'Modifier une journée sans dérégler tout le calendrier.',
    angle: 'Une exception s’écrit comme une exception, pas en changeant la règle.',
    fonctionnalite: 'Les changements ponctuels',
    accroches: [
      'Un week-end échangé ne doit jamais décaler toute ton année.',
      'Ne touche pas au rythme pour un seul samedi échangé.',
      'Le samedi échangé par SMS ? Perdu dans le fil dès lundi.',
    ],
    etapes: [
      'Ne modifie jamais le rythme habituel pour un cas particulier.',
      'Note l’exception avec sa date et son motif.',
      'Vérifie que l’autre parent l’a bien vue avant de considérer que c’est acquis.',
    ],
    modele: [
      'Date concernée',
      'Ce qui change',
      'Motif',
      'Contrepartie éventuelle et sa date',
    ],
    apport: 'L’exception ne touche pas au rythme, qui reprend tout seul ensuite.',
    hashtags: ['#coparentalite', '#parentssepares', '#organisation', '#gardealternee'],
  },
  {
    niche: 'anniversaires',
    recherches: ['anniversaire enfant parents séparés', 'organiser un anniversaire en garde alternée'],
    probleme: 'L’anniversaire tombe chez un parent et se prépare chez les deux.',
    intention: 'Éviter le double cadeau, la double fête et la déception.',
    angle: 'Se répartir la fête demande un message ; la rattraper en demande dix.',
    fonctionnalite: 'Les rendez-vous et la préparation partagée',
    accroches: [
      'Deux gâteaux, deux fois le même cadeau : ça s’évite.',
      'Son anniversaire tombe mercredi. Tu sais déjà chez qui ?',
      'L’anniversaire se prépare à deux, et à l’avance.',
    ],
    etapes: [
      'Fixe qui reçoit le jour même, et qui organise l’autre moment.',
      'Dis ce que tu offres avant d’acheter.',
      'Conviens de la liste des invités une seule fois.',
    ],
    modele: [
      'Date et lieu de la fête',
      'Qui organise quoi',
      'Cadeau prévu par chaque parent',
      'Invités et horaires',
    ],
    apport: 'La préparation est visible des deux côtés, avant l’achat.',
    hashtags: ['#anniversaire', '#coparentalite', '#parentssepares', '#famille'],
  },
  {
    niche: 'conflits-planning',
    recherches: ['désaccord planning garde alternée', 'éviter les disputes de planning'],
    probleme: 'Le désaccord porte souvent sur ce que chacun croit avoir convenu.',
    intention: 'Revenir à ce qui a été écrit plutôt qu’à ce dont chacun se souvient.',
    angle: 'Deux souvenirs sincères peuvent se contredire. Un écrit, non.',
    fonctionnalite: 'L’historique des modifications',
    accroches: [
      'Ton souvenir contre le sien ? Sans écrit, personne n’a tort.',
      'Arrête les « on avait dit » : écris l’accord le jour même.',
      'Un accord daté, tu n’as plus jamais à le défendre.',
    ],
    etapes: [
      'Écris l’accord au moment où il est pris, pas le lendemain.',
      'Date-le, et vérifie que l’autre parent l’a bien lu.',
      'En cas de désaccord, relis l’écrit avant de répondre.',
    ],
    modele: [
      'Ce qui a été convenu',
      'Date de l’accord',
      'Période concernée',
      'Ce qui reste à trancher',
    ],
    apport: 'Chaque modification est enregistrée avec sa date et son auteur.',
    hashtags: ['#coparentalite', '#parentssepares', '#organisation', '#mediationfamiliale'],
  },
];

/**
 * Sujet de saison : Noël. Hors de la banque, pour ne pas déplacer la rotation
 * des quinze sujets ; la campagne de Noël (campagne-noel.ts) le fait passer
 * certains jours, jusqu'au 24 décembre. Mêmes règles que la banque : aucun
 * chiffre, aucune promesse, aucun parent désigné ; une proposition à convenir,
 * une décision de justice primant toujours.
 */
export const NOEL: Sujet = {
  niche: 'noel',
  recherches: ['vacances de noël garde alternée', 'qui a les enfants à noël parents séparés', 'planning noël garde alternée'],
  probleme: 'Noël chez qui ? La question revient chaque année, et souvent trop tard.',
  intention: 'Décider tôt qui accueille les enfants au réveillon, le 25 et au Nouvel An.',
  angle: 'Un Noël décidé à l’avance se passe mieux qu’un Noël négocié la veille.',
  fonctionnalite: 'Le planning de Noël gratuit, puis le planning partagé',
  accroches: [
    'Noël chez qui ? Mieux vaut le savoir tôt.',
    'Le 24 ou le 25 ? Décide-le à l’avance.',
    'Le 31 décembre, tu sais déjà chez qui sont les enfants ?',
  ],
  etapes: [
    'Choisis une façon de partager : moitié, 24 et 25, ou une fête chacun.',
    'Fixe l’heure et le lieu du passage, pas seulement le jour.',
    'Envoie le planning écrit à l’autre parent, bien avant les fêtes.',
  ],
  modele: [
    'Façon de partager retenue',
    'Qui a le réveillon du 24',
    'Qui a le jour de Noël',
    'Qui a le Nouvel An',
    'Heure et lieu du passage',
  ],
  apport: 'Ton calendrier de Noël est gratuit, sur le site.',
  hashtags: ['#noel', '#gardealternee', '#coparentalite', '#parentssepares'],
  saison: [11, 12],
};

/** Tous les sujets, banque et saison : pour retrouver un sujet par sa niche. */
export const TOUS_LES_SUJETS: Sujet[] = [...BANQUE, NOEL];

/** Contenus de marque : ils ne parlent d'aucune difficulté particulière. */
export const MARQUE = [
  {
    accroche: 'Pourquoi Coparentalité Zen existe.',
    corps:
      'Deux parents séparés n’ont pas besoin d’un outil de plus. Ils ont besoin de '
      + 'regarder le même calendrier, de voir les mêmes dépenses, et de ne pas avoir '
      + 'à se redemander ce qui a été convenu. C’est tout ce que fait cette application.',
    planches: [
      'Un seul calendrier, lu à l’identique par les deux parents.',
      'Les dépenses notées au fil de l’eau, avec leurs justificatifs.',
      'Les changements ponctuels sans dérégler le rythme habituel.',
      'Chacun son compte, les mêmes informations.',
    ],
    texteAlternatif:
      'Fond crème avec le logo Coparentalité Zen et la phrase « S’organiser, coopérer, avancer ».',
  },
  {
    accroche: 'Ce que l’application ne fait pas.',
    corps:
      'Elle ne juge pas, ne conseille pas juridiquement, et ne prend parti pour aucun '
      + 'parent. Elle range l’information au même endroit pour les deux. Le reste '
      + 't’appartient.',
    planches: [
      'Elle ne juge aucun parent.',
      'Elle ne donne aucun conseil juridique.',
      'Elle ne remplace ni un accord, ni une décision de justice.',
      'Elle range l’information au même endroit pour les deux.',
    ],
    texteAlternatif:
      'Fond crème, texte sobre énonçant ce que l’application ne fait pas.',
  },
];
