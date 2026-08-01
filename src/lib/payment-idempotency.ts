/**
 * Clé Stripe stable pendant une fenêtre courte.
 *
 * Deux clics ou répétitions réseau dans la même fenêtre réutilisent la même
 * session. Une nouvelle tentative reste possible après expiration de la fenêtre.
 */
export function cleIdempotencePaiement(params: {
  userId: string;
  householdId: string;
  type: 'extension' | 'abonnement';
  resource: string;
  now?: number;
  windowMs?: number;
}): string {
  const windowMs = params.windowMs ?? 15 * 60_000;
  const bucket = Math.floor((params.now ?? Date.now()) / windowMs);
  return [
    'czen',
    params.type,
    params.householdId,
    params.userId,
    params.resource,
    bucket,
  ].join(':');
}
