/**
 * Progression de la configuration d'un foyer.
 *
 * Un parent qui découvre l'application doit savoir où il en est et ce qu'il
 * lui reste à faire. L'ordre n'est pas arbitraire : chaque étape prépare la
 * suivante, et l'invitation vient en dernier parce qu'elle vaut validation —
 * on ne dérange pas l'autre parent pour lui montrer un espace vide.
 *
 * Fonctions pures : aucune dépendance, testables seules.
 */

export type CleEtape =
  | 'foyer' | 'enfants' | 'second_parent' | 'rythme' | 'vacances' | 'invitation';

export interface EtatConfiguration {
  foyerCree: boolean;
  nbEnfants: number;
  /** Le second parent est nommé, qu'il ait ou non un compte. */
  secondParentNomme: boolean;
  /** Le second parent a rejoint le foyer avec son propre compte. */
  secondParentInscrit: boolean;
  rythmeDefini: boolean;
  zoneScolaireDefinie: boolean;
  invitationEnvoyee: boolean;
}

export interface Etape {
  cle: CleEtape;
  numero: number;
  titre: string;
  /** Ce que cette étape apporte, en une phrase. */
  aQuoiCaSert: string;
  fait: boolean;
  /** Une étape facultative n'empêche pas de considérer le foyer prêt. */
  facultative: boolean;
  /** Chemin de l'écran concerné. */
  href: string;
}

export function etapes(e: EtatConfiguration): Etape[] {
  return [
    {
      cle: 'foyer', numero: 1, titre: 'Créer le foyer',
      aQuoiCaSert: 'L’espace partagé où tout sera rassemblé.',
      fait: e.foyerCree, facultative: false, href: '/app/foyer',
    },
    {
      cle: 'enfants', numero: 2, titre: 'Ajouter les enfants',
      aQuoiCaSert: 'Indispensable au planning comme aux dépenses.',
      fait: e.nbEnfants > 0, facultative: false, href: '/app/enfants',
    },
    {
      cle: 'second_parent', numero: 3, titre: 'Nommer le second parent',
      aQuoiCaSert: 'Son prénom suffit pour l’instant : il pourra créer son compte plus tard.',
      fait: e.secondParentNomme, facultative: false, href: '/app/foyer',
    },
    {
      cle: 'rythme', numero: 4, titre: 'Définir le rythme de garde',
      aQuoiCaSert: 'Le planning se génère ensuite tout seul.',
      fait: e.rythmeDefini, facultative: false, href: '/app/foyer',
    },
    {
      cle: 'vacances', numero: 5, titre: 'Répartir les vacances',
      aQuoiCaSert: 'Les dates officielles sont proposées, vous les ajustez.',
      fait: e.zoneScolaireDefinie, facultative: true, href: '/app/vacances',
    },
    {
      cle: 'invitation', numero: 6, titre: 'Inviter le second parent',
      aQuoiCaSert: 'Votre configuration est prête : il la découvrira terminée.',
      fait: e.secondParentInscrit, facultative: false, href: '/app/foyer',
    },
  ];
}

/** Étapes obligatoires accomplies, sur le total. */
export function avancement(e: EtatConfiguration): {
  faites: number; total: number; pourcentage: number; terminee: boolean;
} {
  const obligatoires = etapes(e).filter((x) => !x.facultative);
  const faites = obligatoires.filter((x) => x.fait).length;
  const total = obligatoires.length;
  return {
    faites, total,
    pourcentage: total === 0 ? 100 : Math.round((faites / total) * 100),
    terminee: faites === total,
  };
}

/** Prochaine étape à accomplir, facultatives comprises. */
export function prochaineEtape(e: EtatConfiguration): Etape | null {
  return etapes(e).find((x) => !x.fait) ?? null;
}

/**
 * L'invitation est-elle prématurée ?
 *
 * Elle n'est jamais interdite — un parent pressé doit pouvoir inviter tout de
 * suite. Mais l'annoncer permet d'éviter de faire découvrir à l'autre parent
 * un foyer sans enfants ni rythme.
 */
export function invitationPrematuree(e: EtatConfiguration): string | null {
  if (e.nbEnfants === 0) {
    return 'Aucun enfant n’est encore enregistré : l’autre parent découvrirait un espace vide.';
  }
  if (!e.rythmeDefini) {
    return 'Le rythme de garde n’est pas défini : le planning apparaîtrait vide.';
  }
  return null;
}
