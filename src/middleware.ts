import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware d'authentification et de canonisation du domaine.
 * - Mode démo (pas de variables Supabase) : tout passe, l'app affiche le bandeau démo.
 * - Mode production : rafraîchit la session et protège /app/* (redirection /connexion).
 */

/**
 * Anciens domaines à rediriger vers le domaine définitif.
 *
 * Les applications déjà installées depuis une ancienne adresse y restent
 * indéfiniment : leur écran d'accueil pointe sur l'hôte d'origine. Sans
 * redirection, ces installations continuent de produire des liens
 * d'invitation vers un domaine abandonné.
 *
 * Seuls des hôtes nommément désignés sont redirigés : les déploiements de
 * prévisualisation utilisent eux aussi des adresses en .vercel.app et ne
 * doivent surtout pas être détournés.
 */
const HOTES_OBSOLETES = (process.env.HOTES_OBSOLETES ?? 'coparentalite-zen-yvtn.vercel.app')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

/** Chemins soumis au contrôle de session. */
const CHEMINS_PROTEGES = ['/app', '/connexion', '/inscription', '/invitation'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const hote = request.headers.get('host')?.toLowerCase() ?? '';
  const canonique = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (canonique && HOTES_OBSOLETES.includes(hote)) {
    // Redirection temporaire : une permanente serait mise en cache par le
    // navigateur et deviendrait pénible à corriger en cas d'erreur.
    return NextResponse.redirect(
      new URL(path + request.nextUrl.search, canonique), 307,
    );
  }

  if (!CHEMINS_PROTEGES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

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
  // Large, car la redirection d'hôte doit s'appliquer à toutes les pages et
  // pas seulement aux parcours authentifiés. Les fichiers statiques et les
  // routes d'API en sont exclus : le contrôle de session, lui, reste limité
  // aux chemins listés dans CHEMINS_PROTEGES.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)'],
};
