import { NextResponse, type NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import {
  configOAuth, echangerCode, chainesAutorisees, autorisationsManquantes, memeState,
  revoquer, CHAINE_ATTENDUE, CHEMIN_RETOUR, ErreurOAuth,
} from '@/lib/youtube/oauth';
import { chiffrer, cleDeChiffrement } from '@/lib/youtube/chiffrement';
import { estAdministrateurConnecte, COOKIE_OAUTH } from '@/lib/youtube/acces';

/**
 * Retour de Google après consentement.
 *
 * Rien n'est enregistré tant que tout n'est pas vérifié : administrateur
 * connecté, state identique à celui du cookie, deux autorisations accordées,
 * et chaîne autorisée égale à celle de Coparentalité Zen. Dans le cas
 * contraire, l'autorisation obtenue est révoquée aussitôt chez Google.
 *
 * Aucun jeton ne sort de cette route : ni dans l'adresse de redirection, ni
 * dans les journaux. Le motif renvoyé à l'écran est un code court.
 */
export const dynamic = 'force-dynamic';

function vers(requete: NextRequest, motif: string) {
  const reponse = NextResponse.redirect(new URL(`/admin/youtube?connexion=${motif}`, requete.url));
  reponse.cookies.set(COOKIE_OAUTH, '', { path: CHEMIN_RETOUR, maxAge: 0 });
  return reponse;
}

export async function GET(requete: NextRequest) {
  if (!await estAdministrateurConnecte()) return new NextResponse('Not found', { status: 404 });

  const params = requete.nextUrl.searchParams;
  if (params.get('error')) return vers(requete, 'refusee');

  let cookie: { s?: string; v?: string } = {};
  try { cookie = JSON.parse(requete.cookies.get(COOKIE_OAUTH)?.value ?? '{}'); } catch { /* vide */ }
  if (!memeState(cookie.s, params.get('state')) || !cookie.v) return vers(requete, 'state');

  const code = params.get('code');
  const config = configOAuth();
  const cle = cleDeChiffrement();
  const service = supabaseService();
  if (!code || !config || !cle || !service) return vers(requete, 'configuration');

  try {
    const jetons = await echangerCode(config, code, cookie.v);

    const manquantes = autorisationsManquantes(jetons.scopes);
    if (manquantes.length > 0 || !jetons.rafraichissement) {
      await revoquer(jetons.acces);
      return vers(requete, manquantes.length > 0 ? 'autorisations' : 'sans-rafraichissement');
    }

    const chaines = await chainesAutorisees(jetons.acces);
    const chaine = chaines.find((c) => c.id === CHAINE_ATTENDUE);
    if (!chaine) {
      await revoquer(jetons.rafraichissement);
      return vers(requete, 'mauvaise-chaine');
    }

    const { error } = await service.from('marketing_youtube_connexion').upsert({
      id: true,
      etat: 'active',
      chaine_id: chaine.id,
      chaine_titre: chaine.titre,
      jeton_rafraichissement: chiffrer(jetons.rafraichissement, cle),
      jeton_acces: chiffrer(jetons.acces, cle),
      jeton_acces_expire: jetons.expireLe.toISOString(),
      scopes: jetons.scopes.join(' '),
      connecte_le: new Date().toISOString(),
      derniere_erreur: null,
    });
    if (error) return vers(requete, 'enregistrement');
    return vers(requete, 'ok');
  } catch (e) {
    console.error('[youtube] retour OAuth', e instanceof ErreurOAuth ? e.code : 'erreur');
    return vers(requete, 'google');
  }
}
