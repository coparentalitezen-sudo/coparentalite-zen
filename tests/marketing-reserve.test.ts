import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { imageAccessible, publierReserve, type ContenuReserve } from '../src/lib/marketing/reserve';

const CONTENU: ContenuReserve = {
  id: 'c1',
  theme: 'routine du matin',
  image_url: 'https://exemple.test/visuel.jpg',
  legende: 'Une légende',
  texte_alternatif: 'Description du visuel',
  statut_instagram: 'en_attente',
  statut_facebook: 'en_attente',
};

/** Faux client Supabase : enregistre les appels de fonctions SQL. */
function client(contenu: ContenuReserve | null) {
  const appels: { nom: string; args?: Record<string, unknown> }[] = [];
  const rpc = async (nom: string, args?: Record<string, unknown>) => {
    appels.push({ nom, args });
    if (nom === 'reserve_prochain_contenu') return { data: contenu, error: null };
    if (nom === 'reserve_finaliser') return { data: 'echec', error: null };
    return { data: null, error: null };
  };
  return { service: { rpc }, appels };
}

/** Faux réseau : une réponse préparée par appel, dans l'ordre. */
function reseau(reponses: { statut?: number; entetes?: Record<string, string>; corps?: unknown }[]) {
  const urls: string[] = [];
  let i = 0;
  const requete = async (url: string) => {
    urls.push(url);
    const r = reponses[Math.min(i++, reponses.length - 1)];
    return new Response(r.corps === undefined ? '' : JSON.stringify(r.corps), {
      status: r.statut ?? 200,
      headers: r.entetes ?? { 'content-type': 'image/jpeg', 'content-length': '120000' },
    });
  };
  return { requete, urls };
}

describe('vérification de l’image', () => {
  it('accepte un JPEG joignable', async () => {
    const { requete } = reseau([{}]);
    expect(await imageAccessible(CONTENU.image_url, requete)).toEqual({ ok: true });
  });

  it('refuse une image introuvable', async () => {
    const { requete } = reseau([{ statut: 404 }]);
    const r = await imageAccessible(CONTENU.image_url, requete);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('404');
  });

  it('refuse un PNG, qu’Instagram rejette', async () => {
    const { requete } = reseau([{ entetes: { 'content-type': 'image/png' } }]);
    const r = await imageAccessible(CONTENU.image_url, requete);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('JPEG');
  });

  it('refuse une image trop lourde', async () => {
    const { requete } = reseau([
      { entetes: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) } },
    ]);
    expect((await imageAccessible(CONTENU.image_url, requete)).ok).toBe(false);
  });

  it('retente en requête partielle quand HEAD est refusé', async () => {
    const { requete } = reseau([{ statut: 405 }, { statut: 206, entetes: { 'content-type': 'image/jpeg' } }]);
    expect(await imageAccessible(CONTENU.image_url, requete)).toEqual({ ok: true });
  });
});

describe('publication depuis la réserve', () => {
  beforeEach(() => {
    process.env.META_APP_ID = '111';
    process.env.META_PAGE_ID = '222';
    process.env.META_IG_USER_ID = '333';
    process.env.META_LONG_LIVED_TOKEN = 'EAAjetonDeTest1234567890';
  });
  afterEach(() => {
    delete process.env.META_APP_ID; delete process.env.META_PAGE_ID;
    delete process.env.META_IG_USER_ID; delete process.env.META_LONG_LIVED_TOKEN;
  });

  it('ne fait rien quand la réserve est vide', async () => {
    const { service, appels } = client(null);
    expect(await publierReserve(service, ['instagram', 'facebook'])).toBeNull();
    expect(appels.map((a) => a.nom)).toEqual(['reserve_prochain_contenu']);
  });

  it('ne publie rien et ne se replie jamais sur le texte quand l’image manque', async () => {
    const { service, appels } = client(CONTENU);
    const { requete, urls } = reseau([{ statut: 404 }]);

    const rapport = await publierReserve(service, ['instagram', 'facebook'], requete);

    expect(rapport?.instagram.publie).toBe(false);
    expect(rapport?.facebook.publie).toBe(false);
    // Aucun appel vers Meta : seule l'image a été sollicitée.
    expect(urls.every((u) => u.startsWith('https://exemple.test/'))).toBe(true);
    expect(appels.some((a) => a.nom === 'reserve_enregistrer_succes')).toBe(false);
    expect(appels.find((a) => a.nom === 'reserve_enregistrer_echec')?.args?.p_plateforme).toBe('image');
  });

  it('ne republie pas la plateforme qui avait déjà réussi', async () => {
    const { service, appels } = client({ ...CONTENU, statut_facebook: 'publiee' });
    const vus: string[] = [];

    // Réponses choisies par adresse : l'enchaînement Meta (nature du jeton,
    // conteneur, état, publication) ne dépend pas de l'ordre du test.
    const requete = async (url: string) => {
      vus.push(url);
      const reponse = (corps: unknown) => new Response(JSON.stringify(corps), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
      if (url.startsWith('https://exemple.test/')) {
        return new Response('', {
          status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '120000' },
        });
      }
      // Le jeton fourni est déjà celui de la page : aucune dérivation.
      if (url.includes('/me?fields=id')) return reponse({ id: '222' });
      if (url.includes('/media_publish')) return reponse({ id: 'ig-42' });
      if (url.includes('/media')) return reponse({ id: 'conteneur' });
      if (url.includes('status_code')) return reponse({ status_code: 'FINISHED' });
      return reponse({});
    };

    const rapport = await publierReserve(service, ['instagram', 'facebook'], requete);

    // Facebook n'a reçu aucun appel : il était déjà publié.
    expect(vus.some((u) => u.includes('/photos'))).toBe(false);

    const succes = appels.filter((a) => a.nom === 'reserve_enregistrer_succes');
    expect(succes).toHaveLength(1);
    expect(succes[0].args?.p_plateforme).toBe('instagram');
    expect(succes[0].args?.p_media_id).toBe('ig-42');
    expect(rapport?.facebook.publie).toBe(true);
  });
});
