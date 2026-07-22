import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware d'authentification.
 * - Mode démo (pas de variables Supabase) : tout passe, l'app affiche le bandeau démo.
 * - Mode production : rafraîchit la session et protège /app/* (redirection /connexion).
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next(); // mode démo

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        all.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && path.startsWith('/app')) {
    const to = request.nextUrl.clone();
    to.pathname = '/connexion';
    to.searchParams.set('suite', path);
    return NextResponse.redirect(to);
  }
  if (user && (path === '/connexion' || path === '/inscription')) {
    const to = request.nextUrl.clone();
    to.pathname = '/app/accueil';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ['/app/:path*', '/connexion', '/inscription', '/invitation/:path*'],
};
