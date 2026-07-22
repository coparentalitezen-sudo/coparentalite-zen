import { createServerClient } from '@supabase/ssr';
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
