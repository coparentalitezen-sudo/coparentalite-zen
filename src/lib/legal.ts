/**
 * Identité légale de l'éditeur.
 *
 * Ces valeurs viennent des variables d'environnement. Plusieurs noms sont
 * acceptés pour chacune : ceux déjà en place chez l'hébergeur, et ceux que le
 * code réclamait auparavant. Renommer une variable de production est une
 * opération risquée quand on ne peut pas la refaire à l'identique — mieux vaut
 * que le code s'adapte, puisque lui se relit.
 *
 * ATTENTION — ce module ne doit être importé que par du code serveur.
 * Les variables sans préfixe NEXT_PUBLIC_ ne franchissent pas la frontière du
 * navigateur : importées depuis un composant client, elles y seraient vides,
 * et les mentions légales afficheraient « À compléter » à la face du monde.
 * Les pages juridiques sont rendues côté serveur ; l'écran Confidentialité de
 * l'application reçoit ce dont il a besoin en propriété.
 */

export const LEGAL_VERSION = '2026-08-02';

/** Première valeur renseignée parmi plusieurs noms possibles. */
function premiere(...noms: string[]): string | null {
  for (const nom of noms) {
    const valeur = process.env[nom]?.trim();
    if (valeur) return valeur;
  }
  return null;
}

export const legal = {
  nom: premiere('LEGAL_PUBLISHER_NAME', 'NEXT_PUBLIC_LEGAL_NAME')
    ?? 'Coparentalité Zen',
  forme: premiere('LEGAL_PUBLISHER_FORM', 'LEGAL_FORM', 'NEXT_PUBLIC_LEGAL_FORM')
    ?? 'Éditeur indépendant',
  siren: premiere('LEGAL_PUBLISHER_SIREN', 'LEGAL_SIREN', 'NEXT_PUBLIC_LEGAL_SIREN')
    ?? 'À compléter',
  adresse: premiere('LEGAL_PUBLISHER_ADDRESS', 'LEGAL_ADDRESS', 'NEXT_PUBLIC_LEGAL_ADDRESS')
    ?? 'À compléter',
  responsable: premiere('LEGAL_PUBLISHER_DIRECTOR', 'LEGAL_DIRECTOR',
    'NEXT_PUBLIC_LEGAL_DIRECTOR', 'LEGAL_PUBLISHER_NAME') ?? 'À compléter',
  email: premiere('LEGAL_CONTACT_EMAIL', 'SUPPORT_EMAIL', 'NEXT_PUBLIC_SUPPORT_EMAIL')
    ?? 'contact@coparentalitezen.fr',
  mediation: premiere('LEGAL_MEDIATOR', 'NEXT_PUBLIC_MEDIATOR')
    ?? 'À compléter avant commercialisation publique',
};

/** Vrai lorsque l'identité suffit à une vente publique. */
export function identiteComplete(): boolean {
  return legal.nom !== 'Coparentalité Zen'
    && legal.siren !== 'À compléter'
    && legal.adresse !== 'À compléter';
}
