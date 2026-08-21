import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { declencherDebits } from '../src/lib/paiement/declencher-debits';
import type { ConfigStripe } from '../src/lib/stripe';

const config: ConfigStripe = {
  cleSecrete: 'sk_test_factice',
  secretWebhook: 'whsec_factice',
  origine: 'https://exemple.test',
};

interface Part {
  id: string; user_id: string; amount_cents: number; status: string;
  stripe_customer_id: string | null; stripe_payment_method_id: string | null;
  stripe_subscription_id: string | null;
}

/**
 * Supabase réduit à ce que le module en attend, plus un journal des écritures.
 * Le point délicat étant la concurrence, le faux permet de simuler un
 * arrangement déjà pris par un autre passage.
 */
function faireService(options: {
  arrangement: Record<string, unknown> | null;
  parts: Part[];
  casGagne?: boolean;
}) {
  const ecritures: { table: string; valeurs: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (nom: string) => {
    if (nom === 'tarif_stripe') return { data: 'price_annuel', error: null };
    return { data: null, error: null };
  });

  const service = {
    ecritures, rpc,
    from(table: string) {
      const chaine: Record<string, unknown> = {
        select: () => chaine,
        eq: () => chaine,
        neq: () => chaine,
        is: () => chaine,
        maybeSingle: async () => ({
          data: table === 'subscription_payment_arrangements' ? options.arrangement : null,
          error: null,
        }),
        update(valeurs: Record<string, unknown>) {
          ecritures.push({ table, valeurs });
          return {
            eq: () => chaine.update_suite,
            neq: () => chaine.update_suite,
            is: () => chaine.update_suite,
          };
        },
        update_suite: {} as Record<string, unknown>,
        then: undefined,
      };
      // Les chaînes se referment sur elles-mêmes ; select() en bout renvoie
      // le résultat du compare-et-échange.
      const suite: Record<string, unknown> = {
        eq: () => suite,
        neq: () => suite,
        is: () => suite,
        select: async () => ({
          data: options.casGagne === false ? [] : [{ id: 'arr-1' }],
          error: null,
        }),
        then: (r: (v: unknown) => unknown) => r({ error: null }),
      };
      chaine.update_suite = suite;
      // Lecture des contributions
      if (table === 'subscription_contributions') {
        (chaine as Record<string, unknown>).select = () => ({
          eq: () => ({
            neq: async () => ({ data: options.parts, error: null }),
          }),
        });
      }
      return chaine;
    },
  };
  return service as unknown as Parameters<typeof declencherDebits>[0] & {
    ecritures: typeof ecritures; rpc: typeof rpc;
  };
}

const arrangement = {
  id: 'arr-1', household_id: 'foyer-1', mode: 'half',
  expected_contributions: 2, status: 'awaiting_second_setup',
  billing_period: 'year', total_amount_cents: 1499,
};

const prete = (id: string, user: string, montant: number): Part => ({
  id, user_id: user, amount_cents: montant, status: 'ready_to_charge',
  stripe_customer_id: `cus_${user}`, stripe_payment_method_id: `pm_${user}`,
  stripe_subscription_id: null,
});

let appelsStripe: string[];
beforeEach(() => {
  appelsStripe = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    appelsStripe.push(url);
    const corps = url.includes('/prices/')
      ? { id: 'price_annuel', product: 'prod_zen' }
      : { id: `sub_${appelsStripe.length}`, status: 'active' };
    return { ok: true, json: async () => corps } as unknown as Response;
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('déclenchement du débit', () => {
  it('ne débite personne tant qu’une empreinte manque', async () => {
    const service = faireService({
      arrangement,
      parts: [prete('c1', 'a', 750)],
    });
    const r = await declencherDebits(service, 'arr-1', config);
    expect(r).toBe('incomplet');
    expect(appelsStripe).toHaveLength(0);
  });

  it('ne débite pas si une part n’a pas de moyen de paiement', async () => {
    const sansCarte = { ...prete('c2', 'b', 749), stripe_payment_method_id: null };
    const service = faireService({
      arrangement, parts: [prete('c1', 'a', 750), sansCarte],
    });
    expect(await declencherDebits(service, 'arr-1', config)).toBe('incomplet');
    expect(appelsStripe).toHaveLength(0);
  });

  it('ne débite pas si une part est encore en attente de réponse', async () => {
    const enAttente = { ...prete('c2', 'b', 749), status: 'awaiting_partner' };
    const service = faireService({
      arrangement, parts: [prete('c1', 'a', 750), enAttente],
    });
    expect(await declencherDebits(service, 'arr-1', config)).toBe('incomplet');
    expect(appelsStripe).toHaveLength(0);
  });

  it('crée les deux abonnements quand les deux empreintes sont réunies', async () => {
    const service = faireService({
      arrangement, parts: [prete('c1', 'a', 750), prete('c2', 'b', 749)],
    });
    const r = await declencherDebits(service, 'arr-1', config);
    expect(r).toBe('declenche');
    const abonnements = appelsStripe.filter((u) => u.endsWith('/subscriptions'));
    expect(abonnements).toHaveLength(2);
  });

  it('lit le produit du tarif existant, sans en créer', async () => {
    const service = faireService({
      arrangement, parts: [prete('c1', 'a', 750), prete('c2', 'b', 749)],
    });
    await declencherDebits(service, 'arr-1', config);
    expect(appelsStripe.some((u) => u.includes('/prices/'))).toBe(true);
    expect(appelsStripe.some((u) => u.endsWith('/products'))).toBe(false);
  });

  it('s’arrête si un autre passage a déjà engagé le débit', async () => {
    const service = faireService({
      arrangement,
      parts: [prete('c1', 'a', 750), prete('c2', 'b', 749)],
      casGagne: false,
    });
    const r = await declencherDebits(service, 'arr-1', config);
    expect(r).toBe('deja_engage');
    expect(appelsStripe.filter((u) => u.endsWith('/subscriptions'))).toHaveLength(0);
  });

  it('ne redébite pas une part déjà rattachée à un abonnement', async () => {
    const dejaFaite = { ...prete('c1', 'a', 750), stripe_subscription_id: 'sub_existant' };
    const service = faireService({
      arrangement, parts: [dejaFaite, prete('c2', 'b', 749)],
    });
    await declencherDebits(service, 'arr-1', config);
    expect(appelsStripe.filter((u) => u.endsWith('/subscriptions'))).toHaveLength(1);
  });

  it('refuse d’encaisser si la somme des parts ne fait pas le total', async () => {
    const service = faireService({
      arrangement, parts: [prete('c1', 'a', 750), prete('c2', 'b', 800)],
    });
    const r = await declencherDebits(service, 'arr-1', config);
    expect(r).toBe('echec');
    expect(appelsStripe.filter((u) => u.endsWith('/subscriptions'))).toHaveLength(0);
  });

  it('ne pose jamais « payé » lui-même : seule la facture réglée l’autorise', async () => {
    const service = faireService({
      arrangement, parts: [prete('c1', 'a', 750), prete('c2', 'b', 749)],
    });
    await declencherDebits(service, 'arr-1', config);
    const statuts = service.ecritures
      .filter((e) => e.table === 'subscription_contributions')
      .map((e) => e.valeurs.status);
    expect(statuts).not.toContain('paid');
    expect(statuts).toContain('processing');
  });

  it('ne fait rien sans configuration Stripe', async () => {
    const service = faireService({
      arrangement, parts: [prete('c1', 'a', 750), prete('c2', 'b', 749)],
    });
    expect(await declencherDebits(service, 'arr-1', null)).toBe('echec');
    expect(appelsStripe).toHaveLength(0);
  });
});
