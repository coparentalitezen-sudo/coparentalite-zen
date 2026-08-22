import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  creerSessionEmpreinte, creerAbonnementMoitie, produitDuTarif, type ConfigStripe,
} from '../src/lib/stripe';
import { repartirMoitie } from '../src/lib/paiement-partage';

const config: ConfigStripe = {
  cleSecrete: 'sk_test_factice',
  secretWebhook: 'whsec_factice',
  origine: 'https://exemple.test',
};

/** Rejoue l'API Stripe sans réseau, et rend lisibles les champs envoyés. */
let appels: { url: string; entetes: Record<string, string>; champs: URLSearchParams }[];
let reponse: Record<string, unknown>;

beforeEach(() => {
  appels = [];
  reponse = { id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    appels.push({
      url,
      entetes: init.headers as Record<string, string>,
      champs: new URLSearchParams(String(init.body ?? '')),
    });
    return { ok: true, json: async () => reponse } as unknown as Response;
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

const empreinte = {
  config,
  householdId: 'foyer-1',
  arrangementId: 'arr-1',
  userId: 'parent-a',
  montantCents: 750,
  cleIdempotence: 'cle-1',
};

describe('empreinte de carte, sans débit', () => {
  it('ouvre une session en mode setup, jamais en mode abonnement', async () => {
    await creerSessionEmpreinte(empreinte);
    expect(appels[0].champs.get('mode')).toBe('setup');
  });

  it('ne transmet aucune ligne de facturation : rien ne peut être prélevé', async () => {
    await creerSessionEmpreinte(empreinte);
    const envoye = [...appels[0].champs.keys()];
    expect(envoye.some((c) => c.startsWith('line_items'))).toBe(false);
  });

  it('annonce clairement au parent qu’aucun prélèvement n’a lieu', async () => {
    await creerSessionEmpreinte(empreinte);
    expect(appels[0].champs.get('custom_text[submit][message]'))
      .toMatch(/[Aa]ucun prélèvement/);
  });

  it('rattache l’empreinte au foyer, à l’arrangement et au parent', async () => {
    await creerSessionEmpreinte(empreinte);
    const c = appels[0].champs;
    expect(c.get('metadata[arrangement_id]')).toBe('arr-1');
    expect(c.get('metadata[user_id]')).toBe('parent-a');
  });

  it('recopie ces repères sur le Setup Intent, qui ne porte pas la session', async () => {
    await creerSessionEmpreinte(empreinte);
    expect(appels[0].champs.get('setup_intent_data[metadata][arrangement_id]')).toBe('arr-1');
  });

  it('transmet la clé d’idempotence : un double clic ne crée qu’une session', async () => {
    await creerSessionEmpreinte(empreinte);
    expect(appels[0].entetes['Idempotency-Key']).toBe('cle-1');
  });

  it('réutilise le client Stripe existant plutôt que d’en créer un second', async () => {
    await creerSessionEmpreinte({ ...empreinte, clientExistant: 'cus_1', emailClient: 'a@t.test' });
    expect(appels[0].champs.get('customer')).toBe('cus_1');
    expect(appels[0].champs.get('customer_email')).toBeNull();
  });

  it('refuse un montant nul plutôt que d’ouvrir une session vide', async () => {
    await expect(creerSessionEmpreinte({ ...empreinte, montantCents: 0 })).rejects.toThrow();
    expect(appels).toHaveLength(0);
  });
});

describe('produit rattaché au tarif', () => {
  it('lit le produit du tarif existant au lieu d’en créer un', async () => {
    reponse = { id: 'price_1', product: 'prod_zen' };
    const produit = await produitDuTarif(config, 'price_1');
    expect(produit).toBe('prod_zen');
    expect(appels[0].url).toContain('/prices/price_1');
    expect(appels.every((a) => !a.url.endsWith('/products'))).toBe(true);
  });

  it('échoue franchement si le tarif n’a pas de produit', async () => {
    reponse = { id: 'price_1' };
    await expect(produitDuTarif(config, 'price_1')).rejects.toThrow();
  });
});

const moitie = {
  config,
  householdId: 'foyer-1',
  arrangementId: 'arr-1',
  userId: 'parent-a',
  client: 'cus_1',
  moyenPaiement: 'pm_1',
  produit: 'prod_zen',
  montantCents: 750,
  periodicite: 'year' as const,
  cleIdempotence: 'cle-abo',
};

describe('abonnement d’une moitié', () => {
  beforeEach(() => { reponse = { id: 'sub_1', status: 'active' }; });

  it('débite sur le moyen de paiement déjà enregistré', async () => {
    await creerAbonnementMoitie(moitie);
    const c = appels[0].champs;
    expect(c.get('default_payment_method')).toBe('pm_1');
    expect(c.get('off_session')).toBe('true');
  });

  it('décrit le montant à la volée sous le produit existant', async () => {
    await creerAbonnementMoitie(moitie);
    const c = appels[0].champs;
    expect(c.get('items[0][price_data][product]')).toBe('prod_zen');
    expect(c.get('items[0][price_data][unit_amount]')).toBe('750');
    expect(c.get('items[0][price]')).toBeNull();
  });

  it('reconduit la part selon la périodicité convenue', async () => {
    await creerAbonnementMoitie(moitie);
    expect(appels[0].champs.get('items[0][price_data][recurring][interval]')).toBe('year');
  });

  it('rattache l’abonnement à sa contribution', async () => {
    await creerAbonnementMoitie(moitie);
    expect(appels[0].champs.get('metadata[arrangement_id]')).toBe('arr-1');
    expect(appels[0].champs.get('metadata[user_id]')).toBe('parent-a');
  });

  it('refuse un montant fractionnaire', async () => {
    await expect(creerAbonnementMoitie({ ...moitie, montantCents: 749.5 })).rejects.toThrow();
    expect(appels).toHaveLength(0);
  });

  it('les deux moitiés reconstituent exactement le tarif annuel', async () => {
    const { premiere, seconde } = repartirMoitie(1499);
    await creerAbonnementMoitie({ ...moitie, montantCents: premiere, cleIdempotence: 'a' });
    await creerAbonnementMoitie({ ...moitie, userId: 'parent-b', montantCents: seconde, cleIdempotence: 'b' });
    const total = appels
      .map((a) => Number(a.champs.get('items[0][price_data][unit_amount]')))
      .reduce((s, n) => s + n, 0);
    expect(total).toBe(1499);
  });
});
