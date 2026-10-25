import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';

/**
 * L'utilisateur de la requête est-il administrateur ?
 *
 * Refait à chaque route et chaque action, jamais hérité d'un écran : une
 * route OAuth est une adresse joignable directement.
 */
export async function estAdministrateurConnecte(): Promise<boolean> {
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return estAdministrateur(user?.email);
}

/** Cookie temporaire du parcours OAuth : state et vérificateur PKCE, jamais lisible par la page. */
export const COOKIE_OAUTH = 'czen_yt_oauth';
