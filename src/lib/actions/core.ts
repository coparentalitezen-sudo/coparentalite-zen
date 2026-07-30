'use client';

/**
 * Socle commun de la couche d'accès aux données.
 *
 * Toute fonction renvoie un ActionResult explicite : succès avec données,
 * mode démonstration, ou erreur porteuse d'un message lisible. Aucun faux
 * succès silencieux — c'est la règle qui a permis de diagnostiquer les
 * défauts de production sans deviner.
 */
import { supabaseBrowser } from '../supabase/client';

export type ActionResult<T = undefined> =
  | { status: 'ok'; data: T }
  | { status: 'demo' }
  | { status: 'error'; message: string; details?: string };

export const ok = <T,>(data: T): ActionResult<T> => ({ status: 'ok', data });
export const err = (message: string, details?: string): ActionResult<never> =>
  ({ status: 'error', message, details });

/** Détail technique brut, affiché derrière un dépliant pendant la bêta. */
export function detail(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const o = e as Record<string, unknown>;
  return [o.message, o.details, o.hint, o.code].filter(Boolean).join(' · ') || undefined;
}

/**
 * Message lisible : le détail technique n'apparaît qu'en développement.
 * Les messages métier de nos fonctions serveur sont reconnus et transmis tels
 * quels — ce sont eux qui expliquent à l'utilisateur ce qu'il doit corriger.
 */
export function lisible(fallback: string, e: unknown): string {
  const brut = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (process.env.NODE_ENV !== 'production' && brut) return `${fallback} (${brut})`;
  if (/foyer|parent|montant|part|autoris|expir|utilis|révoqu|requis|rembours|Annulez|payé|introuvable|déjà|horizon|abonnement|offre/i.test(brut)) return brut;
  return fallback;
}

export { supabaseBrowser };
