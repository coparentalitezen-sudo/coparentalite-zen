import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { chiffrer, dechiffrer, cleDeChiffrement } from '../src/lib/youtube/chiffrement';
import {
  configOAuth, nouveauDefi, memeState, urlAutorisation, echangerCode, rafraichir,
  autorisationsManquantes, SCOPES, ErreurOAuth,
} from '../src/lib/youtube/oauth';
import {
  shortDuJour, planchesDuShort, titreDuShort, descriptionDuShort, motsClesDuShort,
  dureeDuShort, jourAParis,
} from '../src/lib/youtube/short';
import { ouvrirSession, etatSession, transferer, ErreurEnvoi } from '../src/lib/youtube/envoi';
import { BANQUE } from '../src/lib/marketing/banque';

vi.mock('server-only', () => ({}));

const CLE = randomBytes(32);
const CONFIG = { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://www.coparentalitezen.fr/api/youtube/oauth/retour' };
const BASE = 'https://www.coparentalitezen.fr';

function reponse(status: number, corps: unknown = {}, entetes: Record<string, string> = {}) {
  return new Response(corps === null ? null : JSON.stringify(corps), { status, headers: entetes });
}

describe('chiffrement des jetons', () => {
  it('rend le texte d’origine', () => {
    expect(dechiffrer(chiffrer('1//jeton-secret', CLE), CLE)).toBe('1//jeton-secret');
  });

  it('ne laisse jamais le jeton en clair et change à chaque chiffrement', () => {
    const a = chiffrer('1//jeton-secret', CLE);
    expect(a).not.toContain('jeton-secret');
    expect(chiffrer('1//jeton-secret', CLE)).not.toBe(a);
  });

  it('refuse un jeton altéré ou une autre clé', () => {
    const c = chiffrer('1//jeton', CLE);
    const altere = c.slice(0, -2) + (c.endsWith('A') ? 'BB' : 'AA');
    expect(() => dechiffrer(altere, CLE)).toThrow();
    expect(() => dechiffrer(c, randomBytes(32))).toThrow();
  });

  it('exige une clé de 32 octets', () => {
    expect(cleDeChiffrement(undefined)).toBeNull();
    expect(cleDeChiffrement(randomBytes(16).toString('base64'))).toBeNull();
    expect(cleDeChiffrement(CLE.toString('base64'))?.length).toBe(32);
  });
});

describe('OAuth', () => {
  it('construit l’URI de redirection exacte depuis le domaine canonique', () => {
    const c = configOAuth({ YOUTUBE_CLIENT_ID: 'a', YOUTUBE_CLIENT_SECRET: 'b',
      NEXT_PUBLIC_SITE_URL: 'https://www.coparentalitezen.fr' } as unknown as NodeJS.ProcessEnv);
    expect(c?.redirectUri).toBe('https://www.coparentalitezen.fr/api/youtube/oauth/retour');
    expect(configOAuth({} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it('demande PKCE S256, un jeton durable et seulement deux autorisations', () => {
    const defi = nouveauDefi();
    const url = new URL(urlAutorisation(CONFIG, defi));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(defi.defi);
    expect(url.searchParams.get('code_challenge')).not.toBe(defi.verificateur);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe(defi.state);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...SCOPES]);
    expect(url.toString()).not.toContain('secret');
  });

  it('compare le state sans tolérance', () => {
    const { state } = nouveauDefi();
    expect(memeState(state, state)).toBe(true);
    expect(memeState(state, `${state}x`)).toBe(false);
    expect(memeState(undefined, state)).toBe(false);
    expect(memeState(state, null)).toBe(false);
  });

  it('échange le code avec le vérificateur PKCE', async () => {
    const f = vi.fn(async () => reponse(200, {
      access_token: 'ya29', refresh_token: '1//r', expires_in: 3599, scope: SCOPES.join(' '),
    }));
    const j = await echangerCode(CONFIG, 'code', 'verif', f as unknown as typeof fetch, 0);
    const corps = new URLSearchParams(String((f.mock.calls[0] as unknown[])[1] && ((f.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(corps.get('code_verifier')).toBe('verif');
    expect(j.rafraichissement).toBe('1//r');
    expect(j.expireLe.getTime()).toBe(3_599_000);
    expect(autorisationsManquantes(j.scopes)).toEqual([]);
  });

  it('signale une autorisation décochée', () => {
    expect(autorisationsManquantes([SCOPES[0]])).toEqual([SCOPES[1]]);
  });

  it('classe invalid_grant comme révocation (mode test : sept jours)', async () => {
    const f = async () => reponse(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    const e = await rafraichir(CONFIG, '1//r', f as unknown as typeof fetch).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurOAuth);
    expect(e.revoque).toBe(true);
    expect(e.temporaire).toBe(false);
  });

  it('classe une panne de Google comme temporaire', async () => {
    const e = await rafraichir(CONFIG, '1//r', (async () => reponse(503)) as unknown as typeof fetch).catch((x) => x);
    expect(e.temporaire).toBe(true);
    expect(e.revoque).toBe(false);
    const r = await rafraichir(CONFIG, '1//r', (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch).catch((x) => x);
    expect(r.temporaire).toBe(true);
  });
});

describe('contenu du Short', () => {
  it('ne traite jamais le même sujet deux jours de suite', () => {
    let precedent = '';
    for (let i = 0; i < 60; i += 1) {
      const jour = new Date(Date.UTC(2026, 9, 25 + i)).toISOString().slice(0, 10);
      const s = shortDuJour(jour);
      expect(s.sujet.niche).not.toBe(precedent);
      precedent = s.sujet.niche;
    }
  });

  it('ne reprend pas la même accroche avant un tour complet de la banque', () => {
    const vues = new Set<string>();
    const cycle = BANQUE.reduce((t, s) => t + s.accroches.length, 0);
    for (let i = 0; i < cycle; i += 1) {
      const jour = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      vues.add(shortDuJour(jour).accroche);
    }
    expect(vues.size).toBe(cycle);
  });

  it('est déterministe : le même jour, le même Short', () => {
    expect(shortDuJour('2026-11-03')).toEqual(shortDuJour('2026-11-03'));
  });

  it('dure entre 15 et 30 secondes, accroche en tête et site en dernier', () => {
    const s = shortDuJour('2026-10-26');
    const planches = planchesDuShort(s, true);
    expect(dureeDuShort(s)).toBeGreaterThanOrEqual(15);
    expect(dureeDuShort(s)).toBeLessThanOrEqual(30);
    expect(planches[0].texte).toBe(s.accroche);
    expect(planches.at(-1)?.appel).toBe('www.coparentalitezen.fr');
  });

  it('n’annonce « 3 mois gratuits » que si l’offre est confirmée', () => {
    const s = shortDuJour('2026-10-26');
    expect(planchesDuShort(s, true).at(-1)?.texte).toContain('3 mois gratuits');
    expect(planchesDuShort(s, false).at(-1)?.texte).not.toContain('gratuit');
    expect(descriptionDuShort(s, BASE, false)).not.toContain('gratuits');
  });

  it('respecte les limites de YouTube pour chaque jour de l’année', () => {
    for (let i = 0; i < 366; i += 1) {
      const jour = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      const s = shortDuJour(jour);
      const titre = titreDuShort(s);
      const description = descriptionDuShort(s, BASE, true);
      expect(titre.length).toBeLessThanOrEqual(100);
      expect(titre).not.toMatch(/[<>]/);
      expect(description).not.toMatch(/[<>]/);
      expect(Buffer.byteLength(description)).toBeLessThan(5000);
      expect(motsClesDuShort(s).join(',').length).toBeLessThanOrEqual(500);
    }
  });

  it('mène vers le site avec un lien traçable', () => {
    const d = descriptionDuShort(shortDuJour('2026-10-26'), BASE, true);
    const lien = d.match(/https:\/\/www\.coparentalitezen\.fr\S+/)?.[0];
    expect(lien).toBeDefined();
    const url = new URL(lien!);
    expect(url.searchParams.get('utm_source')).toBe('youtube');
    expect(url.searchParams.get('utm_content')).toBe('yt-2026-10-26');
  });

  it('date le Short à l’heure de Paris', () => {
    // 23 h 30 UTC le 31 décembre : déjà le 1er janvier à Paris.
    expect(jourAParis(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});

describe('envoi et anti-doublon', () => {
  const meta = { titre: 't', description: 'd', motsCles: [], visibilite: 'private' as const };
  const video = new Uint8Array(1000);
  const creee = { id: 'abc123', snippet: { channelId: 'UCtyvxX1S4JBTqsKgS3OgQFg' },
    status: { privacyStatus: 'private', uploadStatus: 'uploaded' } };

  it('ouvre une session et renvoie son adresse, sans envoyer de fichier', async () => {
    const f = vi.fn(async () => reponse(200, {}, { location: 'https://upload/session/1' }));
    expect(await ouvrirSession('ya29', meta, 1000, f as unknown as typeof fetch)).toBe('https://upload/session/1');
    const init = (f.mock.calls[0] as unknown[])[1] as RequestInit;
    const corps = JSON.parse(String(init.body));
    expect(corps.status.selfDeclaredMadeForKids).toBe(false);
    expect(corps.status.privacyStatus).toBe('private');
  });

  it('après une coupure, retrouve la vidéo déjà créée au lieu de la renvoyer', async () => {
    const f = async () => reponse(200, creee);
    const etat = await etatSession('ya29', 'https://upload/session/1', 1000, f as unknown as typeof fetch);
    expect(etat).toEqual({ etat: 'terminee', video: expect.objectContaining({ id: 'abc123' }) });
  });

  it('reprend un envoi partiel à l’octet près', async () => {
    const f = async () => reponse(308, null, { range: 'bytes=0-399' });
    expect(await etatSession('ya29', 's', 1000, f as unknown as typeof fetch)).toEqual({ etat: 'partielle', recus: 400 });

    const envoi = vi.fn(async () => reponse(201, creee));
    await transferer('ya29', 's', video, 400, envoi as unknown as typeof fetch);
    const init = (envoi.mock.calls[0] as unknown[])[1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers['Content-Range']).toBe('bytes 400-999/1000');
    expect(init.headers['Content-Length']).toBe('600');
  });

  it('considère une session expirée comme sans vidéo', async () => {
    expect(await etatSession('ya29', 's', 1000, (async () => reponse(404)) as unknown as typeof fetch))
      .toEqual({ etat: 'introuvable' });
  });

  it('distingue quota épuisé (définitif aujourd’hui) et panne (temporaire)', async () => {
    const quota = await transferer('ya29', 's', video, 0, (async () =>
      reponse(403, { error: { errors: [{ reason: 'quotaExceeded' }] } })) as unknown as typeof fetch).catch((e) => e);
    expect(quota).toBeInstanceOf(ErreurEnvoi);
    expect(quota.code).toBe('quotaExceeded');
    expect(quota.temporaire).toBe(false);

    const panne = await transferer('ya29', 's', video, 0, (async () => reponse(503)) as unknown as typeof fetch).catch((e) => e);
    expect(panne.temporaire).toBe(true);

    const jeton = await transferer('ya29', 's', video, 0, (async () => reponse(401)) as unknown as typeof fetch).catch((e) => e);
    expect(jeton.authentification).toBe(true);
  });

  it('refuse de conclure sans identifiant de vidéo', async () => {
    const e = await transferer('ya29', 's', video, 0, (async () => reponse(200, { status: {} })) as unknown as typeof fetch).catch((x) => x);
    expect(e.code).toBe('sans_id');
  });
});

import { decider, MAX_TENTATIVES, type LigneShort } from '../src/lib/youtube/decision';

describe('décision avant publication', () => {
  const base: LigneShort = {
    id: '1', cle_idempotence: 'short-2026-10-26', statut: 'en_attente', tentatives: 0,
    verrou_jusqua: null, session_envoi: null, taille_octets: null, video_id: null,
    titre: 't', description: 'd', visibilite_demandee: 'public', jour: '2026-10-26',
  };
  const maintenant = Date.parse('2026-10-26T08:00:00Z');

  it('ne republie jamais un Short publié', () => {
    expect(decider({ ...base, statut: 'publiee', video_id: 'x' }, maintenant)).toBe('deja');
  });

  it('laisse la main à une exécution en cours', () => {
    expect(decider({ ...base, statut: 'en_cours', verrou_jusqua: '2026-10-26T08:05:00Z' }, maintenant)).toBe('occupe');
  });

  it('reprend une exécution interrompue dont le verrou a expiré', () => {
    expect(decider({ ...base, statut: 'en_cours', verrou_jusqua: '2026-10-26T07:50:00Z' }, maintenant)).toBe('publier');
  });

  it('retente un échec, puis abandonne', () => {
    expect(decider({ ...base, statut: 'echec', tentatives: 2 }, maintenant)).toBe('publier');
    expect(decider({ ...base, statut: 'echec', tentatives: MAX_TENTATIVES }, maintenant)).toBe('abandon');
  });

  it('attend un humain quand la chaîne obtenue n’était pas la bonne', () => {
    expect(decider({ ...base, statut: 'a_verifier' }, maintenant)).toBe('a_verifier');
  });
});

import { planifierVisuel } from '../src/lib/marketing/visuel';

describe('lisibilité de la dernière planche', () => {
  it('l’adresse du site tient sur la largeur et reste plus grande que le texte', () => {
    for (const offre of [true, false]) {
      const derniere = planchesDuShort(shortDuJour('2026-10-26'), offre).at(-1)!;
      const plan = planifierVisuel(derniere, 'vertical');
      const largeurAdresse = 'www.coparentalitezen.fr'.length * 0.62 * plan.tailleAppel;
      expect(largeurAdresse).toBeLessThanOrEqual(1080 - 180 - 42);
      expect(plan.tailleAppel).toBeGreaterThan(plan.taille);
    }
  });
});
