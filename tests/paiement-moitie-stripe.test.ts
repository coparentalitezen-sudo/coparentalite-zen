import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { creerSessionMoitie, type ConfigStripe } from '../src/lib/stripe';
import { repartirMoitie } from '../src/lib/paiement-partage';

const config: ConfigStripe = {
  cleSecrete: 'sk_test_factice',
  secretWebhook: 'whsec_factice',
  origine: 'https://exemple.test',
};

/** Rejoue l'appel Stripe sans réseau, et rend les champs envoyés lisibles. */
let appels: { url: string; entetes: Record<string, string>; champs: URLSearchParams }[];

beforeEach(() => {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    appels.push({
      url,
      entetes: init.headers as Record<string, string>,
      champs: new URLSearchParams(String(init.body)),
    });
    return {
      ok: true,
      json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }),
    } as unknown as Response;
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

const base = {
  config,
  householdId: 'foyer-1',
  partageId: 'partage-1',
  userId: 'parent-a',
  montantCents: 750,
  periodicite: 'year' as const,
  cleIdempotence: 'cle-1',
};

describe('session Checkout d’une moitié', () => {
  it('ouvre bien une session d’abonnement, pas un paiement unique', async () => {
    await creerSessionMoitie(base);
    expect(appels[0].champs.get('mode')).toBe('subscription');
  });

  it('décrit le tarif à la volée sans référencer de prix Stripe préenregistré', async () => {
    await creerSessionMoitie(base);
    const c = appels[0].champs;
    expect(c.get('line_items[0][price]')).toBeNull();
    expect(c.get('line_items[0][price_data][currency]')).toBe('eur');
  });

  it('facture exactement le montant transmis, sans le recalculer', async () => {
    await creerSessionMoitie({ ...base, montantCents: 749 });
    expect(appels[0].champs.get('line_items[0][price_data][unit_amount]')).toBe('749');
  });

  it('reconduit la part chaque année sur la formule annuelle', async () => {
    await creerSessionMoitie(base);
    expect(appels[0].champs.get('line_items[0][price_data][recurring][interval]')).toBe('year');
  });

  it('reconduit la part chaque mois sur la formule mensuelle', async () => {
    await creerSessionMoitie({ ...base, periodicite: 'month' });
    expect(appels[0].champs.get('line_items[0][price_data][recurring][interval]')).toBe('month');
  });

  it('rattache la part au foyer, au partage et au parent payeur', async () => {
    await creerSessionMoitie(base);
    const c = appels[0].champs;
    expect(c.get('metadata[household_id]')).toBe('foyer-1');
    expect(c.get('metadata[partage_id]')).toBe('partage-1');
    expect(c.get('metadata[user_id]')).toBe('parent-a');
    expect(c.get('metadata[type]')).toBe('partage');
  });

  it('recopie ces repères sur l’abonnement, que les renouvellements portent', async () => {
    await creerSessionMoitie(base);
    const c = appels[0].champs;
    expect(c.get('subscription_data[metadata][partage_id]')).toBe('partage-1');
    expect(c.get('subscription_data[metadata][user_id]')).toBe('parent-a');
  });

  it('transmet la clé d’idempotence : un double clic ne facture qu’une fois', async () => {
    await creerSessionMoitie(base);
    expect(appels[0].entetes['Idempotency-Key']).toBe('cle-1');
  });

  it('réutilise le client Stripe existant plutôt que d’en créer un second', async () => {
    await creerSessionMoitie({ ...base, clientExistant: 'cus_123', emailClient: 'a@exemple.test' });
    const c = appels[0].champs;
    expect(c.get('customer')).toBe('cus_123');
    expect(c.get('customer_email')).toBeNull();
  });

  it('refuse un montant nul plutôt que d’ouvrir une session vide', async () => {
    await expect(creerSessionMoitie({ ...base, montantCents: 0 })).rejects.toThrow();
    expect(appels).toHaveLength(0);
  });

  it('refuse un montant fractionnaire', async () => {
    await expect(creerSessionMoitie({ ...base, montantCents: 749.5 })).rejects.toThrow();
  });

  it('les deux sessions d’un partage reconstituent le prix annuel exact', async () => {
    const { premiere, seconde } = repartirMoitie(1499);
    await creerSessionMoitie({ ...base, montantCents: premiere, cleIdempotence: 'a' });
    await creerSessionMoitie({ ...base, userId: 'parent-b', montantCents: seconde, cleIdempotence: 'b' });
    const total = appels
      .map((a) => Number(a.champs.get('line_items[0][price_data][unit_amount]')))
      .reduce((s, n) => s + n, 0);
    expect(total).toBe(1499);
  });
});
