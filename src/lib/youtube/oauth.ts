import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * OAuth 2.0 Google pour la chaîne YouTube.
 *
 * Flux « code d'autorisation » côté serveur, avec PKCE (S256) et un `state`
 * aléatoire vérifié au retour contre une valeur gardée en cookie httpOnly :
 * un lien de retour forgé par un tiers ne peut ni être rejoué ni rattacher
 * une autre chaîne que celle que l'administrateur vient d'autoriser.
 *
 * Deux autorisations seulement :
 *   * youtube.upload — envoyer les vidéos ;
 *   * youtube.readonly — vérifier, avant d'enregistrer quoi que ce soit, que
 *     la chaîne autorisée est bien celle de Coparentalité Zen, confirmer
 *     après envoi que la vidéo est en ligne sur cette chaîne, et relever les
 *     vues. youtube.upload seul ne permet aucune lecture : sans ce second
 *     droit, une erreur de compte au consentement ne se verrait qu'après une
 *     première publication sur la mauvaise chaîne.
 *
 * Les fonctions qui parlent à Google reçoivent `fetch` en paramètre : les
 * tests les exercent sans réseau.
 */

export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const;

/** La seule chaîne sur laquelle l'application accepte de publier. */
export const CHAINE_ATTENDUE = 'UCtyvxX1S4JBTqsKgS3OgQFg';

export const CHEMIN_RETOUR = '/api/youtube/oauth/retour';

const URL_AUTORISATION = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_JETON = 'https://oauth2.googleapis.com/token';
const URL_REVOCATION = 'https://oauth2.googleapis.com/revoke';

export interface ConfigOAuth {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Configuration lue dans l'environnement, ou null s'il manque un élément. */
export function configOAuth(env: NodeJS.ProcessEnv = process.env): ConfigOAuth | null {
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();
  const base = env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  if (!clientId || !clientSecret) return null;
  // L'URI doit être identique, au caractère près, à celle déclarée chez
  // Google : on la construit toujours de la même façon, sans barre finale.
  return { clientId, clientSecret, redirectUri: new URL(CHEMIN_RETOUR, base).toString() };
}

// ---------------- PKCE et state ----------------

export interface Defi {
  state: string;
  verificateur: string;
  defi: string;
}

export function nouveauDefi(): Defi {
  const verificateur = randomBytes(32).toString('base64url');
  return {
    state: randomBytes(32).toString('base64url'),
    verificateur,
    defi: createHash('sha256').update(verificateur).digest('base64url'),
  };
}

/** Comparaison à temps constant : la durée ne révèle rien de la valeur attendue. */
export function memeState(attendu: string | undefined, recu: string | null): boolean {
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function urlAutorisation(config: ConfigOAuth, defi: Defi): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    // offline + consent : Google ne remet un jeton de rafraîchissement qu'à
    // ces deux conditions. Sans lui, la tâche s'arrêterait au bout d'une heure.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: defi.state,
    code_challenge: defi.defi,
    code_challenge_method: 'S256',
  });
  return `${URL_AUTORISATION}?${params}`;
}

// ---------------- Jetons ----------------

export interface Jetons {
  acces: string;
  rafraichissement?: string;
  expireLe: Date;
  scopes: string[];
}

/**
 * Erreur OAuth classée. `revoque` signifie que le jeton de rafraîchissement
 * n'est plus valable — autorisation retirée, mot de passe changé, ou
 * expiration des sept jours propre aux applications Google en mode test :
 * seule une nouvelle connexion par l'administrateur y remédie.
 */
export class ErreurOAuth extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly revoque: boolean,
    readonly temporaire: boolean,
  ) { super(message); }
}

type Fetch = typeof fetch;

async function demanderJetons(
  corps: Record<string, string>, f: Fetch, maintenant: number,
): Promise<Jetons> {
  let reponse: Response;
  try {
    reponse = await f(URL_JETON, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(corps),
    });
  } catch (e) {
    throw new ErreurOAuth(`Google injoignable : ${(e as Error).message}`, 'reseau', false, true);
  }
  const donnees = await reponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!reponse.ok) {
    const code = String(donnees.error ?? `http_${reponse.status}`);
    // invalid_grant : jeton révoqué ou expiré. Le message de Google ne
    // contient jamais le jeton lui-même, on peut le conserver.
    const description = String(donnees.error_description ?? '');
    throw new ErreurOAuth(
      `Google a refusé les jetons (${code}${description ? ` : ${description}` : ''}).`,
      code, code === 'invalid_grant', reponse.status >= 500,
    );
  }
  const acces = String(donnees.access_token ?? '');
  if (!acces) throw new ErreurOAuth('Réponse de Google sans jeton d’accès.', 'reponse_vide', false, true);
  return {
    acces,
    rafraichissement: donnees.refresh_token ? String(donnees.refresh_token) : undefined,
    expireLe: new Date(maintenant + Number(donnees.expires_in ?? 3600) * 1000),
    scopes: String(donnees.scope ?? '').split(' ').filter(Boolean),
  };
}

export function echangerCode(
  config: ConfigOAuth, code: string, verificateur: string,
  f: Fetch = fetch, maintenant = Date.now(),
): Promise<Jetons> {
  return demanderJetons({
    grant_type: 'authorization_code',
    code,
    code_verifier: verificateur,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  }, f, maintenant);
}

export function rafraichir(
  config: ConfigOAuth, rafraichissement: string,
  f: Fetch = fetch, maintenant = Date.now(),
): Promise<Jetons> {
  return demanderJetons({
    grant_type: 'refresh_token',
    refresh_token: rafraichissement,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  }, f, maintenant);
}

/** Les deux autorisations ont-elles été accordées ? Google laisse décocher. */
export function autorisationsManquantes(scopes: string[]): string[] {
  return SCOPES.filter((s) => !scopes.includes(s));
}

/** Révoque l'autorisation chez Google. Sans effet bloquant si Google ne répond pas. */
export async function revoquer(jeton: string, f: Fetch = fetch): Promise<boolean> {
  try {
    const r = await f(URL_REVOCATION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: jeton }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Chaîne(s) du compte autorisé. */
export async function chainesAutorisees(
  acces: string, f: Fetch = fetch,
): Promise<{ id: string; titre: string }[]> {
  const r = await f('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${acces}` },
  });
  if (!r.ok) throw new ErreurOAuth(`Lecture de la chaîne refusée (HTTP ${r.status}).`, `http_${r.status}`, r.status === 401, r.status >= 500);
  const d = await r.json() as { items?: { id: string; snippet?: { title?: string } }[] };
  return (d.items ?? []).map((c) => ({ id: c.id, titre: c.snippet?.title ?? '' }));
}
