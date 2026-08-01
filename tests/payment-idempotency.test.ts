import { describe, expect, it } from 'vitest';
import { cleIdempotencePaiement } from '../src/lib/payment-idempotency';

describe('idempotence des paiements', () => {
  const base = {
    userId: 'user-1', householdId: 'foyer-1',
    type: 'abonnement' as const, resource: 'year',
  };

  it('réutilise la même clé pour deux clics rapprochés', () => {
    const a = cleIdempotencePaiement({ ...base, now: 1_000_000 });
    const b = cleIdempotencePaiement({ ...base, now: 1_000_500 });
    expect(a).toBe(b);
  });

  it('autorise une nouvelle intention après la fenêtre', () => {
    const a = cleIdempotencePaiement({ ...base, now: 0, windowMs: 1000 });
    const b = cleIdempotencePaiement({ ...base, now: 1000, windowMs: 1000 });
    expect(a).not.toBe(b);
  });

  it('isole les foyers, utilisateurs et produits', () => {
    const a = cleIdempotencePaiement({ ...base, now: 0 });
    expect(cleIdempotencePaiement({ ...base, householdId: 'foyer-2', now: 0 })).not.toBe(a);
    expect(cleIdempotencePaiement({ ...base, userId: 'user-2', now: 0 })).not.toBe(a);
    expect(cleIdempotencePaiement({ ...base, resource: 'month', now: 0 })).not.toBe(a);
  });
});
