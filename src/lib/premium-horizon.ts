/**
 * Logique d'horizon, isolée des composants pour être testable seule.
 *
 * C'est une commodité d'affichage : la barrière réelle est en base, dans
 * exiger_horizon(). Un client modifié ne gagnerait qu'un refus du serveur.
 */
import type { Offre } from './actions/premium';

/** La date visée est-elle couverte par l'offre en cours ? */
export function dansHorizon(offre: Offre | null, date: string | Date): boolean {
  // Offre inconnue : on ne refuse jamais à tort, le serveur tranchera.
  if (!offre) return true;
  if (offre.illimite || !offre.horizon) return true;
  const jour = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return jour <= offre.horizon;
}
