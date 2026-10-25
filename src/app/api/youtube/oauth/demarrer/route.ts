import { NextResponse } from 'next/server';
import { configOAuth, nouveauDefi, urlAutorisation, CHEMIN_RETOUR } from '@/lib/youtube/oauth';
import { estAdministrateurConnecte, COOKIE_OAUTH } from '@/lib/youtube/acces';

/**
 * Démarre la connexion de la chaîne YouTube. Administrateur seulement.
 *
 * Le state et le vérificateur PKCE partent dans un cookie httpOnly, limité
 * à la route de retour et valable dix minutes : la page ne les voit jamais,
 * et un retour sans ce cookie — lien forgé, autre navigateur — est refusé.
 */
export const dynamic = 'force-dynamic';

export async function GET(requete: Request) {
  if (!await estAdministrateurConnecte()) return new NextResponse('Not found', { status: 404 });

  const config = configOAuth();
  if (!config) {
    return NextResponse.redirect(new URL('/admin/youtube?connexion=configuration', requete.url));
  }

  const defi = nouveauDefi();
  const reponse = NextResponse.redirect(urlAutorisation(config, defi));
  reponse.cookies.set(COOKIE_OAUTH, JSON.stringify({ s: defi.state, v: defi.verificateur }), {
    httpOnly: true, secure: true, sameSite: 'lax', path: CHEMIN_RETOUR, maxAge: 600,
  });
  return reponse;
}
