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

  // Préparer une réponse modifiable
  let response = NextResponse.next();

  const supabase = createServerClient(url, key, {
    cookies: {
      // lire les cookies depuis la requête
      getAll: () => request.cookies.getAll(),
      // écrire uniquement dans la response (NextRequest.cookies n'est pas garanti modifiable)
      setAll: (all) => {
        // s'assurer que response est la valeur retournée finale
        all.forEach(({ name, value, options }) => {
          // options peut être undefined ; response.cookies.set gère cela
          response.cookies.set(name, value, options ?? undefined);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  // données renvoyées par getUser() peuvent être { data: { user } }
  const user = (data as any)?.user;
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
