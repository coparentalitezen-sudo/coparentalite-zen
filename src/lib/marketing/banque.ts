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
  /** Mois où le sujet est le plus pertinent. Vide : toute l'année. */
  saison?: number[];
}

export const BANQUE: Sujet[] = [
  {
    niche: 'garde-alternee',
    probleme: 'Personne ne sait avec certitude chez qui dorment les enfants la semaine prochaine.',
    intention: 'Voir le planning sans avoir à le recalculer ni à le redemander.',
    angle: 'Un calendrier partagé vaut mieux qu’une règle que chacun applique de tête.',
    fonctionnalite: 'Le planning de garde',
    accroches: [
      'Vous recomptez les semaines sur vos doigts ?',
      'Chez qui sont les enfants jeudi prochain ?',
      'Un rythme de garde ne se retient pas, il se lit.',
    ],
    etapes: [
      'Écrivez le rythme une seule fois : type, date de début, parent qui commence.',
      'Notez les changements ponctuels à part, sans toucher au rythme habituel.',
      'Vérifiez que les deux parents regardent bien le même calendrier.',
    ],
    modele: [
      'Type de rythme (une semaine sur deux, 2-2-3, 3-4-4-3…)',
      'Date de début et parent qui commence',
      'Heure et lieu d’échange habituels',
      'Ce qui change pendant les vacances scolaires',
    ],
    apport: 'Le calendrier se remplit tout seul et reste identique des deux côtés.',
    hashtags: ['#coparentalité', '#gardealternée', '#parentsséparés', '#organisationfamiliale'],
  },
  {
    niche: 'vacances-scolaires',
    probleme: 'Les vacances se décident tard, souvent dans l’urgence, parfois deux fois.',
    intention: 'Fixer les périodes assez tôt pour pouvoir réserver sereinement.',
    angle: 'Décider en novembre coûte moins cher que décider en février.',
    fonctionnalite: 'Les vacances scolaires officielles, importées automatiquement',
    accroches: [
      'Les vacances de février se préparent en novembre.',
      'Qui prend la première semaine ? La question revient chaque année.',
      'Réserver avant d’avoir tranché, c’est réserver deux fois.',
    ],
    etapes: [
      'Partez des dates officielles de votre zone, pas de votre souvenir.',
      'Découpez chaque période en segments et attribuez-les un par un.',
      'Écrivez la décision quelque part où les deux parents la reliront.',
    ],
    modele: [
      'Dates officielles de la zone',
      'Découpage retenu (moitié, semaine par semaine…)',
      'Qui prend quel segment cette année',
      'Alternance prévue l’année suivante',
    ],
    apport: 'Le calendrier scolaire officiel est déjà chargé, zone par zone.',
    hashtags: ['#vacancesscolaires', '#coparentalité', '#parentsséparés', '#organisation'],
    saison: [10, 11, 12, 1, 2, 5, 6],
  },
  {
    niche: 'echange-enfants',
    probleme: 'L’échange se passe mal parce que rien n’a été précisé avant.',
    intention: 'Rendre le moment de l’échange prévisible et court.',
    angle: 'Ce qui est écrit avant n’a pas à être discuté sur le trottoir.',
    fonctionnalite: 'Les rendez-vous et les affaires à préparer',
    accroches: [
      'Les échanges tendus le sont rarement à cause des enfants.',
      'Cinq minutes de préparation évitent vingt minutes de discussion.',
      'Un échange réussi est un échange sans surprise.',
    ],
    etapes: [
      'Fixez une heure et un lieu qui ne changent pas d’une semaine à l’autre.',
      'Listez ce qui voyage avec l’enfant, et vérifiez la liste avant de partir.',
      'Gardez la conversation entre adultes pour un autre moment que l’échange.',
    ],
    modele: [
      'Vêtements pour la durée du séjour',
      'Cartable, devoirs, matériel de sport',
      'Traitement en cours et ordonnance',
      'Doudou, objet du soir',
      'Carte vitale ou carnet de santé si besoin',
    ],
    apport: 'La liste des affaires est rattachée au rendez-vous, et rappelée la veille.',
    hashtags: ['#coparentalité', '#parentsséparés', '#organisation', '#résidencealternée'],
  },
  {
    niche: 'depenses-partagees',
    probleme: 'Les frais s’accumulent et plus personne ne sait qui a payé quoi.',
    intention: 'Savoir où en est le partage sans avoir à refaire les comptes.',
    angle: 'Un compte tenu au fil de l’eau évite la discussion de fin d’année.',
    fonctionnalite: 'Le suivi des dépenses partagées',
    accroches: [
      'Qui a payé les chaussures de sport ?',
      'Les comptes se font mieux au fil de l’eau qu’en décembre.',
      'Une dépense notée le jour même ne se rediscute pas six mois plus tard.',
    ],
    etapes: [
      'Notez la dépense le jour même, avec le justificatif photographié.',
      'Indiquez la part de chacun au moment où vous l’enregistrez.',
      'Regardez le solde plutôt que de recompter ligne par ligne.',
    ],
    modele: [
      'Date et montant',
      'Enfant concerné',
      'Catégorie (santé, école, sport, vêtements…)',
      'Qui a avancé les frais',
      'Part de chaque parent',
    ],
    apport: 'Le solde se met à jour tout seul, et les justificatifs restent attachés.',
    hashtags: ['#dépensespartagées', '#coparentalité', '#budgetfamilial', '#parentsséparés'],
  },
  {
    niche: 'pension',
    probleme: 'Les justificatifs sont éparpillés entre messages, photos et papiers.',
    intention: 'Retrouver une preuve de paiement sans fouiller douze mois d’historique.',
    angle: 'Ranger au moment où l’on paie coûte trente secondes ; ranger après, une soirée.',
    fonctionnalite: 'L’historique et les justificatifs',
    accroches: [
      'Où est le justificatif du mois de mars ?',
      'Trente secondes au moment de payer, ou une soirée six mois plus tard.',
      'Un historique tenu vaut mieux qu’une mémoire sûre d’elle.',
    ],
    etapes: [
      'Photographiez le justificatif au moment du paiement, pas plus tard.',
      'Rangez-le au même endroit que les autres, sans exception.',
      'Vérifiez une fois par trimestre qu’aucun mois ne manque.',
    ],
    modele: [
      'Mois concerné',
      'Montant versé et date',
      'Moyen de paiement',
      'Justificatif joint',
    ],
    apport: 'Chaque versement garde sa pièce jointe, consultable par les deux parents.',
    hashtags: ['#coparentalité', '#parentsséparés', '#organisation', '#viedeparent'],
  },
  {
    niche: 'ecole-activites',
    probleme: 'Une réunion d’école n’arrive qu’à un seul des deux parents.',
    intention: 'Que les deux parents aient la même information scolaire au même moment.',
    angle: 'L’information scolaire ne devrait pas dépendre de qui relève la boîte aux lettres.',
    fonctionnalite: 'Les rendez-vous partagés',
    accroches: [
      'Une réunion d’école oubliée n’est presque jamais un oubli volontaire.',
      'Deux parents, une seule convocation : le problème est là.',
      'L’école prévient un parent. À vous de prévenir l’autre.',
    ],
    etapes: [
      'Notez la date dès réception, avant de refermer le cahier.',
      'Précisez qui s’y rend, pour éviter d’y aller à deux ou à zéro.',
      'Ajoutez les activités récurrentes une fois pour toutes.',
    ],
    modele: [
      'Réunions et conseils de classe',
      'Sorties et voyages scolaires',
      'Entraînements et compétitions',
      'Représentations et spectacles',
      'Jours sans école',
    ],
    apport: 'Le rendez-vous est visible par les deux parents dès qu’il est créé.',
    hashtags: ['#rentréescolaire', '#coparentalité', '#parentsséparés', '#écoleprimaire'],
    saison: [8, 9, 10, 6],
  },
  {
    niche: 'rendez-vous-medicaux',
    probleme: 'Le parent qui n’accompagne pas ignore ce qui a été dit chez le médecin.',
    intention: 'Transmettre l’essentiel du rendez-vous sans y consacrer un échange entier.',
    angle: 'Trois lignes écrites valent mieux qu’un récit qu’on croit avoir fait.',
    fonctionnalite: 'Les rendez-vous et leurs notes',
    accroches: [
      'Qui a le carnet de santé ?',
      'Le rendez-vous s’est bien passé. Encore faut-il le dire.',
      'Trois lignes après le rendez-vous évitent trois messages le lendemain.',
    ],
    etapes: [
      'Notez la date du prochain rendez-vous avant de quitter le cabinet.',
      'Écrivez trois lignes : ce qui a été dit, ce qui est prescrit, ce qui suit.',
      'Rangez l’ordonnance au même endroit que les précédentes.',
    ],
    modele: [
      'Date et praticien',
      'Motif du rendez-vous',
      'Ce qui a été dit',
      'Traitement prescrit et durée',
      'Prochaine échéance',
    ],
    apport: 'La note reste attachée au rendez-vous, lisible par les deux parents.',
    hashtags: ['#santéenfant', '#coparentalité', '#parentsséparés', '#organisationfamiliale'],
  },
  {
    niche: 'documents-familiaux',
    probleme: 'Un papier indispensable est toujours chez l’autre parent.',
    intention: 'Accéder au document au moment où on en a besoin.',
    angle: 'Un original chez l’un, une copie accessible aux deux.',
    fonctionnalite: 'Le rangement des documents',
    accroches: [
      'La carte d’identité est chez qui, déjà ?',
      'Un original suffit. Une copie accessible aussi.',
      'Le papier manquant se découvre toujours au mauvais moment.',
    ],
    etapes: [
      'Photographiez les documents qui servent plusieurs fois par an.',
      'Rangez-les par enfant, pas par date.',
      'Vérifiez les dates d’expiration avant les vacances, pas pendant.',
    ],
    modele: [
      'Pièce d’identité et passeport',
      'Carnet de santé et vaccins',
      'Attestation d’assurance scolaire',
      'Certificat de scolarité',
      'Autorisation de sortie du territoire si nécessaire',
    ],
    apport: 'Les documents sont rangés par enfant et consultables par les deux parents.',
    hashtags: ['#organisationfamiliale', '#coparentalité', '#parentsséparés', '#administratif'],
  },
  {
    niche: 'communication',
    probleme: 'Les échanges dérivent vite parce que tout passe par le même canal.',
    intention: 'Séparer l’organisation des enfants du reste de la relation.',
    angle: 'Ce qui est factuel se lit mieux quand ce n’est pas mélangé au reste.',
    fonctionnalite: 'Un espace commun dédié à l’organisation',
    accroches: [
      'Un message d’organisation n’est pas une conversation.',
      'Écrire moins, écrire précis : la tension baisse d’elle-même.',
      'Ce qui est écrit une fois n’a pas à être répété.',
    ],
    etapes: [
      'Tenez-vous aux faits : quoi, quand, où, qui.',
      'Une demande par message, pour qu’une réponse suffise.',
      'Différez de quelques heures les messages écrits sous le coup de l’agacement.',
    ],
    modele: [
      'De quoi il s’agit',
      'Date et heure concernées',
      'Ce que vous demandez précisément',
      'Jusqu’à quand vous attendez une réponse',
    ],
    apport: 'L’information d’organisation vit dans l’application, pas dans une messagerie.',
    hashtags: ['#coparentalité', '#communication', '#parentsséparés', '#famille'],
  },
  {
    niche: 'nouveaux-conjoints',
    probleme: 'L’arrivée d’un nouveau conjoint brouille les repères d’organisation.',
    intention: 'Que chacun sache qui fait quoi, sans que les rôles soient à deviner.',
    angle: 'Clarifier les rôles apaise davantage que d’en discuter longuement.',
    fonctionnalite: 'Les rôles au sein du foyer',
    accroches: [
      'Qui va chercher les enfants mercredi ?',
      'Un rôle clair vaut mieux qu’un rôle supposé.',
      'Les nouveaux repères se posent, ils ne s’improvisent pas.',
    ],
    etapes: [
      'Dites qui peut aller chercher les enfants, et qui doit être prévenu.',
      'Distinguez ce qui relève des parents de ce qui peut être délégué.',
      'Annoncez les changements avant qu’ils ne surprennent l’autre parent.',
    ],
    modele: [
      'Qui peut accompagner et récupérer',
      'Qui est prévenu en cas d’imprévu',
      'Qui décide des rendez-vous médicaux',
      'Ce qui reste entre parents',
    ],
    apport: 'Chaque membre du foyer a son propre accès, avec les droits qui lui reviennent.',
    hashtags: ['#famillerecomposée', '#coparentalité', '#parentsséparés', '#beauparent'],
  },
  {
    niche: 'familles-recomposees',
    probleme: 'Deux calendriers de garde différents se superposent dans le même foyer.',
    intention: 'Voir en une fois qui est là, et quand.',
    angle: 'Deux rythmes ne se retiennent pas ; ils se superposent sur un calendrier.',
    fonctionnalite: 'La vue d’ensemble du foyer',
    accroches: [
      'Deux rythmes de garde dans la même maison, ça se planifie.',
      'Le week-end où tout le monde est là se repère à l’avance.',
      'Superposer deux calendriers de tête, personne n’y arrive.',
    ],
    etapes: [
      'Posez chaque rythme séparément, sans chercher à les fusionner.',
      'Repérez les week-ends où tous les enfants sont présents.',
      'Réservez les moments communs sur ces week-ends-là.',
    ],
    modele: [
      'Rythme du premier foyer',
      'Rythme du second foyer',
      'Week-ends où tout le monde est présent',
      'Vacances communes possibles',
    ],
    apport: 'Les périodes se lisent côte à côte, sans calcul.',
    hashtags: ['#famillerecomposée', '#coparentalité', '#organisationfamiliale', '#parentsséparés'],
  },
  {
    niche: 'longue-distance',
    probleme: 'La distance transforme chaque échange en trajet à organiser.',
    intention: 'Prévoir les trajets assez tôt pour qu’ils coûtent moins cher et fatiguent moins.',
    angle: 'À distance, ce qui se décide tard se paie deux fois.',
    fonctionnalite: 'Les périodes et les rendez-vous planifiés',
    accroches: [
      'À trois cents kilomètres, un week-end se prépare un mois avant.',
      'Les billets pris tard coûtent deux fois plus.',
      'La distance ne se réduit pas, mais elle s’organise.',
    ],
    etapes: [
      'Fixez les périodes plusieurs mois à l’avance, pas quelques semaines.',
      'Notez qui accompagne, à l’aller comme au retour.',
      'Prévoyez le rendez-vous de repli si le trajet est annulé.',
    ],
    modele: [
      'Dates de départ et de retour',
      'Moyen de transport et horaires',
      'Qui accompagne à l’aller, qui au retour',
      'Solution de repli en cas d’annulation',
    ],
    apport: 'Les périodes lointaines sont visibles longtemps à l’avance par les deux parents.',
    hashtags: ['#coparentalité', '#parentsséparés', '#gardealternée', '#organisation'],
  },
  {
    niche: 'imprevus',
    probleme: 'Un changement de dernière minute se perd entre deux messages.',
    intention: 'Modifier une journée sans dérégler tout le calendrier.',
    angle: 'Une exception s’écrit comme une exception, pas en changeant la règle.',
    fonctionnalite: 'Les changements ponctuels',
    accroches: [
      'Un week-end échangé ne doit pas décaler toute l’année.',
      'L’exception s’écrit à part. La règle reste la règle.',
      'Ce qui est convenu par message se perd. Ce qui est noté, non.',
    ],
    etapes: [
      'Ne modifiez jamais le rythme habituel pour un cas particulier.',
      'Notez l’exception avec sa date et son motif.',
      'Vérifiez que l’autre parent l’a bien vue avant de considérer que c’est acquis.',
    ],
    modele: [
      'Date concernée',
      'Ce qui change',
      'Motif',
      'Contrepartie éventuelle et sa date',
    ],
    apport: 'L’exception ne touche pas au rythme, qui reprend tout seul ensuite.',
    hashtags: ['#coparentalité', '#parentsséparés', '#organisation', '#gardealternée'],
  },
  {
    niche: 'anniversaires',
    probleme: 'L’anniversaire tombe chez un parent et se prépare chez les deux.',
    intention: 'Éviter le double cadeau, la double fête et la déception.',
    angle: 'Se répartir la fête demande un message ; la rattraper en demande dix.',
    fonctionnalite: 'Les rendez-vous et la préparation partagée',
    accroches: [
      'Deux gâteaux, deux fois le même cadeau : ça s’évite.',
      'L’anniversaire tombe un mercredi. Chez qui ?',
      'Une fête réussie se répartit avant, pas pendant.',
    ],
    etapes: [
      'Fixez qui reçoit le jour même, et qui organise l’autre moment.',
      'Dites ce que vous offrez avant d’acheter.',
      'Convenez de la liste des invités une seule fois.',
    ],
    modele: [
      'Date et lieu de la fête',
      'Qui organise quoi',
      'Cadeau prévu par chaque parent',
      'Invités et horaires',
    ],
    apport: 'La préparation est visible des deux côtés, avant l’achat.',
    hashtags: ['#anniversaire', '#coparentalité', '#parentsséparés', '#famille'],
  },
  {
    niche: 'conflits-planning',
    probleme: 'Le désaccord porte souvent sur ce que chacun croit avoir convenu.',
    intention: 'Revenir à ce qui a été écrit plutôt qu’à ce dont chacun se souvient.',
    angle: 'Deux souvenirs sincères peuvent se contredire. Un écrit, non.',
    fonctionnalite: 'L’historique des modifications',
    accroches: [
      'Deux souvenirs sincères peuvent se contredire.',
      '« On avait dit… » : la phrase qui n’a jamais rien réglé.',
      'Ce qui est daté n’a pas à être défendu.',
    ],
    etapes: [
      'Écrivez l’accord au moment où il est pris, pas le lendemain.',
      'Datez-le, et vérifiez que l’autre parent l’a bien lu.',
      'En cas de désaccord, relisez l’écrit avant de répondre.',
    ],
    modele: [
      'Ce qui a été convenu',
      'Date de l’accord',
      'Période concernée',
      'Ce qui reste à trancher',
    ],
    apport: 'Chaque modification est enregistrée avec sa date et son auteur.',
    hashtags: ['#coparentalité', '#parentsséparés', '#organisation', '#médiationfamiliale'],
  },
];

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
      + 'parent. Elle range l’information au même endroit pour les deux. Le reste vous '
      + 'appartient.',
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
