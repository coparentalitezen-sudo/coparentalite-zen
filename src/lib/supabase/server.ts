import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Client Supabase côté serveur (Server Components / Route Handlers). */
export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => all.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

/**
 * Client de service : contourne la RLS avec la clé service_role.
 *
 * Réservé aux traitements sans utilisateur — en pratique le seul webhook
 * Stripe, qui doit créditer un foyer sans session authentifiée. Cette clé ne
 * doit jamais atteindre le navigateur : ce module est importé uniquement par
 * des Route Handlers.
 */
export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  return createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
