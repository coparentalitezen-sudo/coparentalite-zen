/**
 * Légende telle qu'elle part sur Facebook.
 *
 * Deux défauts constatés le 7/11 sur la page :
 * - les mots-dièse, posés en dernière ligne d'un texte long, restaient cachés
 *   derrière « Voir plus » (Facebook coupe après deux ou trois lignes, une
 *   seule sur un Reel) : on aurait dit qu'il n'y en avait aucun ;
 * - la légende commune du visuel quotidien renvoyait à « la bio », qui
 *   n'existe pas sur une page Facebook, où le lien est cliquable dans le texte.
 *
 * Appliquée au moment de publier, à toutes les publications Facebook (Reels,
 * visuels quotidiens, réserve, générateur) : les légendes déjà enregistrées
 * en profitent sans réécriture en base. Fonction pure et idempotente.
 */

const MOT_DIESE = /(^|\s)#[\p{L}\p{N}_]+/u;
/** Nombre de mots-dièse remontés à la fin du premier paragraphe. */
export const DIESES_EN_TETE = 2;

/** Retire les renvois à la biographie, qui n'ont de sens que sur Instagram. */
function sansBio(texte: string): string {
  return texte
    .replace(/\s*\((?:le )?lien aussi dans (?:la|ma) bio\)/giu, '')
    .replace(/\s*[—–-]\s*lien dans (?:la|ma) bio\.?/giu, '.')
    .replace(/\s*Lien dans (?:la|ma) bio\.?/gu, '')
    .replace(/\.\./g, '.');
}

export function legendeFacebook(texte: string): string {
  const paragraphes = sansBio(texte).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphes.length < 2) return paragraphes.join('\n\n');

  // Dernier paragraphe fait uniquement de mots-dièse : on le répartit.
  const dernier = paragraphes[paragraphes.length - 1];
  const mots = dernier.split(/\s+/);
  if (!mots.every((m) => /^#[\p{L}\p{N}_]+$/u.test(m))) return paragraphes.join('\n\n');

  // Déjà traitée (le premier paragraphe porte des mots-dièse) : inchangée.
  if (MOT_DIESE.test(paragraphes[0])) return paragraphes.join('\n\n');

  const tete = mots.slice(0, DIESES_EN_TETE);
  const reste = mots.slice(DIESES_EN_TETE);
  const corps = paragraphes.slice(1, -1);
  return [
    `${paragraphes[0]} ${tete.join(' ')}`,
    ...corps,
    ...(reste.length ? [reste.join(' ')] : []),
  ].join('\n\n');
}
