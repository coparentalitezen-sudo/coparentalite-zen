'use client';
import { createBrowserClient } from '@supabase/ssr';

/** Client Supabase côté navigateur. Null en mode démo (pas de projet configuré). */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
