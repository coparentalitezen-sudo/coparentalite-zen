/**
 * Administrateur de la plateforme.
 *
 * À ne pas confondre avec le rôle « admin » du type member_role : celui-ci
 * désigne l'administrateur d'un foyer, c'est-à-dire un parent. Ici il s'agit
 * de l'exploitant du service, celui qui valide les publications.
 *
 * La liste vit dans une variable d'environnement plutôt qu'en base : une
 * table d'administrateurs se modifie depuis la base, et quiconque obtiendrait
 * un accès en écriture s'y inscrirait. Une variable d'environnement ne se
 * change que depuis le tableau de bord de l'hébergeur.
 *
 * Le dépôt étant public, aucune protection ne peut reposer sur le secret
 * d'une adresse : cette vérification est faite côté serveur à chaque requête,
 * jamais dans le navigateur.
 */

/** Adresses autorisées, normalisées. Vide par défaut : rien n'est ouvert. */
export function administrateurs(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.includes('@'));
}

/**
 * L'adresse donnée administre-t-elle la plateforme ?
 *
 * Une liste vide ne laisse passer personne. C'est le comportement voulu : tant
 * que la variable n'est pas renseignée, l'interface d'administration est
 * inaccessible, y compris à son auteur.
 */
export function estAdministrateur(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalisee = email.trim().toLowerCase();
  if (!normalisee) return false;
  return administrateurs().includes(normalisee);
}

/** L'administration est-elle configurée ? Sert à l'afficher en diagnostic. */
export function administrationConfiguree(): boolean {
  return administrateurs().length > 0;
}
