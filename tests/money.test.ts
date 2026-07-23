import { describe, it, expect } from 'vitest';
import { splitAmount, computePairBalance, balanceLabel } from '../src/lib/money';

const P1 = 'parent-1', P2 = 'parent-2';
const pct = (parentId: string, basisPoints: number) => ({ kind: 'percentage' as const, parentId, basisPoints });
const fix = (parentId: string, fixedCents: number) => ({ kind: 'fixed_amount' as const, parentId, fixedCents });

describe('splitAmount — répartitions en pourcentage', () => {
  it('50/50 sur montant pair', () => {
    const r = splitAmount(10000, [pct(P1, 5000), pct(P2, 5000)]);
    expect(r).toEqual([{ parentId: P1, owedCents: 5000 }, { parentId: P2, owedCents: 5000 }]);
  });

  it('50/50 sur montant impair : aucun centime perdu (85,51 €)', () => {
    const r = splitAmount(8551, [pct(P1, 5000), pct(P2, 5000)]);
    expect(r[0].owedCents + r[1].owedCents).toBe(8551);
    expect(Math.abs(r[0].owedCents - r[1].owedCents)).toBe(1);
  });

  it('60/40 sur 100,01 €', () => {
    const r = splitAmount(10001, [pct(P1, 6000), pct(P2, 4000)]);
    expect(r[0].owedCents + r[1].owedCents).toBe(10001);
    expect(r[0].owedCents).toBe(6001); // plus fort reste : 6000,6 → 6001
    expect(r[1].owedCents).toBe(4000);
  });

  it('70/30 et 75/25', () => {
    expect(splitAmount(999, [pct(P1, 7000), pct(P2, 3000)]).map(a => a.owedCents)).toEqual([699, 300]);
    expect(splitAmount(1001, [pct(P1, 7500), pct(P2, 2500)]).map(a => a.owedCents)).toEqual([751, 250]);
  });

  it('100/0 : un seul parent paie tout', () => {
    const r = splitAmount(4550, [pct(P1, 10000), pct(P2, 0)]);
    expect(r).toEqual([{ parentId: P1, owedCents: 4550 }, { parentId: P2, owedCents: 0 }]);
  });

  it('trois parties (beau-parent contributeur) 40/40/20', () => {
    const r = splitAmount(10001, [pct(P1, 4000), pct(P2, 4000), pct('bp', 2000)]);
    expect(r.reduce((s, a) => s + a.owedCents, 0)).toBe(10001);
  });

  it('propriété : somme exacte sur 500 montants et répartitions variés', () => {
    const combos = [[5000,5000],[6000,4000],[7000,3000],[7500,2500],[9999,1],[3333,6667]];
    for (let amount = 1; amount <= 500; amount++) {
      for (const [a, b] of combos) {
        const r = splitAmount(amount, [pct(P1, a), pct(P2, b)]);
        expect(r.reduce((s, x) => s + x.owedCents, 0)).toBe(amount);
        expect(r.every(x => x.owedCents >= 0)).toBe(true);
      }
    }
  });
});

describe('splitAmount — montants fixes et règles mixtes', () => {
  it('montants fixes exacts', () => {
    const r = splitAmount(5000, [fix(P1, 2000), fix(P2, 3000)]);
    expect(r).toEqual([{ parentId: P1, owedCents: 2000 }, { parentId: P2, owedCents: 3000 }]);
  });

  it('fixe + pourcentage : le fixe est servi, le reste réparti', () => {
    // P1 doit un forfait de 10 €, le reste (90 €) est 50/50
    const r = splitAmount(10000, [fix(P1, 1000), pct(P1, 5000), pct(P2, 5000)]);
    const p1 = r.find(a => a.parentId === P1)!.owedCents;
    const p2 = r.find(a => a.parentId === P2)!.owedCents;
    expect(p1).toBe(1000 + 4500);
    expect(p2).toBe(4500);
    expect(p1 + p2).toBe(10000);
  });

  it('rejette des fixes supérieurs au total', () => {
    expect(() => splitAmount(1000, [fix(P1, 600), fix(P2, 600)])).toThrow(/supérieurs au total/);
  });

  it('rejette des fixes qui ne couvrent pas le total (centimes orphelins)', () => {
    expect(() => splitAmount(1000, [fix(P1, 400), fix(P2, 500)])).toThrow(/non attribué/);
  });
});

describe('splitAmount — garde-fous', () => {
  it('rejette un montant nul ou négatif', () => {
    expect(() => splitAmount(0, [pct(P1, 10000)])).toThrow(/strictement positif/);
    expect(() => splitAmount(-500, [pct(P1, 10000)])).toThrow(/strictement positif/);
  });
  it('rejette les flottants', () => {
    expect(() => splitAmount(100.5, [pct(P1, 10000)])).toThrow(/entier/);
  });
  it('rejette une répartition qui ne totalise pas 100 %', () => {
    expect(() => splitAmount(1000, [pct(P1, 5000), pct(P2, 4000)])).toThrow(/100 %/);
    expect(() => splitAmount(1000, [pct(P1, 6000), pct(P2, 5000)])).toThrow(/100 %/);
  });
  it('rejette basisPoints hors bornes', () => {
    expect(() => splitAmount(1000, [pct(P1, 11000), pct(P2, -1000)])).toThrow(/bornes/);
  });
});

describe('computePairBalance — solde net entre parents', () => {
  it("exemple de l'énoncé : P1 doit 50 €, P2 doit 30 € → net 20 € en faveur de P2", () => {
    const expenses = [
      // P2 a payé 100 € en 50/50 → P1 lui doit 50 €
      { paidBy: P2, allocations: splitAmount(10000, [pct(P1, 5000), pct(P2, 5000)]) },
      // P1 a payé 60 € en 50/50 → P2 lui doit 30 €
      { paidBy: P1, allocations: splitAmount(6000, [pct(P1, 5000), pct(P2, 5000)]) },
    ];
    const b = computePairBalance(P1, P2, expenses);
    expect(b.netCentsForA).toBe(-2000); // P1 doit régulariser 20 €
    expect(balanceLabel(b, P1)).toBe('Vous avez 20,00 € à régulariser');
    expect(balanceLabel(b, P2)).toBe('Vous devez recevoir 20,00 €');
  });

  it('remboursement partiel puis complet', () => {
    const expenses = [
      { paidBy: P1, allocations: splitAmount(10000, [pct(P1, 5000), pct(P2, 5000)]) },
    ];
    // P2 doit 50 € à P1 ; il rembourse 20 € puis 30 €
    const partial = computePairBalance(P1, P2, expenses, [
      { fromParent: P2, toParent: P1, amountCents: 2000 },
    ]);
    expect(partial.netCentsForA).toBe(3000);
    const full = computePairBalance(P1, P2, expenses, [
      { fromParent: P2, toParent: P1, amountCents: 2000 },
      { fromParent: P2, toParent: P1, amountCents: 3000 },
    ]);
    expect(full.netCentsForA).toBe(0);
    expect(balanceLabel(full, P1)).toBe('Les comptes sont équilibrés');
  });

  it('dépense multi-enfants : agrégation de deux parts 50/50 par enfant', () => {
    // 2 enfants, 30 € chacun : mêmes règles → équivalent à 60 € en 50/50
    const perChild = splitAmount(3000, [pct(P1, 5000), pct(P2, 5000)]);
    const expenses = [
      { paidBy: P1, allocations: perChild },
      { paidBy: P1, allocations: perChild },
    ];
    const b = computePairBalance(P1, P2, expenses);
    expect(b.netCentsForA).toBe(3000);
  });

  it('rejette un remboursement négatif ou nul', () => {
    expect(() =>
      computePairBalance(P1, P2, [], [{ fromParent: P2, toParent: P1, amountCents: 0 }])
    ).toThrow(/non positif/);
  });
});

describe('solde avec remboursements — scénario réel du produit', () => {
  it('un remboursement du montant exact remet les comptes à zéro', () => {
    // P1 paie 10 € en 50/50 → P2 lui doit 5 €
    const expenses = [
      { paidBy: P1, allocations: splitAmount(1000, [pct(P1, 5000), pct(P2, 5000)]) },
    ];
    const avant = computePairBalance(P1, P2, expenses);
    expect(balanceLabel(avant, P2)).toBe('Vous avez 5,00 € à régulariser');

    const apres = computePairBalance(P1, P2, expenses, [
      { fromParent: P2, toParent: P1, amountCents: 500 },
    ]);
    expect(apres.netCentsForA).toBe(0);
    expect(balanceLabel(apres, P2)).toBe('Les comptes sont équilibrés');
  });

  it('un remboursement supérieur inverse le solde (trop-perçu visible)', () => {
    const expenses = [
      { paidBy: P1, allocations: splitAmount(1000, [pct(P1, 5000), pct(P2, 5000)]) },
    ];
    const b = computePairBalance(P1, P2, expenses, [
      { fromParent: P2, toParent: P1, amountCents: 800 },
    ]);
    expect(b.netCentsForA).toBe(-300);
    expect(balanceLabel(b, P2)).toBe('Vous devez recevoir 3,00 €');
  });

  it('remboursements successifs cumulés au centime près', () => {
    const expenses = [
      { paidBy: P1, allocations: splitAmount(8551, [pct(P1, 5000), pct(P2, 5000)]) },
    ];
    const du = expenses[0].allocations.find(a => a.parentId === P2)!.owedCents;
    const b = computePairBalance(P1, P2, expenses, [
      { fromParent: P2, toParent: P1, amountCents: 1000 },
      { fromParent: P2, toParent: P1, amountCents: 2000 },
      { fromParent: P2, toParent: P1, amountCents: du - 3000 },
    ]);
    expect(b.netCentsForA).toBe(0);
  });
});
