import { construireLien, type Origine } from './utm';

export type ReseauLienCourt = 'instagram' | 'facebook';

const ORIGINES: Record<ReseauLienCourt, Origine> = {
  instagram: {
    source: 'instagram',
    campagne: 'lancement_quiz',
    contenu: 'bio_reel',
  },
  facebook: {
    source: 'facebook',
    campagne: 'lancement_quiz',
    contenu: 'publication',
  },
};

/**
 * Construit la destination d'un lien court sans reprendre aucun paramètre
 * fourni par le navigateur. La source marketing reste ainsi celle décidée
 * par le serveur et le lien ne peut pas devenir une redirection ouverte.
 */
export function destinationLienCourt(
  urlRequete: string,
  reseau: ReseauLienCourt,
): URL {
  const origineRequete = new URL(urlRequete).origin;
  return new URL(construireLien(origineRequete, ORIGINES[reseau], '/quiz'));
}
