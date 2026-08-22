import { describe, it, expect } from 'vitest';
import {
  bornesDuMois, dansLeMois, synthetiser, moisDisponibles, nomDuMois,
  type DepenseSynthese,
} from '../src/lib/rapport';
import type { DayAssignment } from '../src/lib/custody';

const A = 'parent-a';
const B = 'parent-b';

function jours(...paires: [string, string][]): DayAssignment[] {
  return paires.map(([date, parentId]) => ({ date, parentId, source: 'rule' }));
}

function depense(
  partiel: Partial<DepenseSynthese> & { montantCents: number; date: string },
): DepenseSynthese {
  return {
    id: Math.random().toString(36).slice(2),
    titre: 'Cantine',
    payePar: A,
    statut: 'validated',
    categorie: 'Scolarité',
    parts: [
      { profileId: A, montantCents: Math.round(partiel.montantCents / 2) },
      { profileId: B, montantCents: Math.round(partiel.montantCents / 2) },
    ],
    ...partiel,
  };
}

describe('bornes du mois', () => {
  it('trouve le dernier jour d’un mois de 31 jours', () => {
    expect(bornesDuMois('2026-08')).toEqual({ debut: '2026-08-01', fin: '2026-08-31' });
  });

  it('trouve le dernier jour d’un mois de 30 jours', () => {
    expect(bornesDuMois('2026-09').fin).toBe('2026-09-30');
  });

  it('gère février d’une année bissextile', () => {
    expect(bornesDuMois('2028-02').fin).toBe('2028-02-29');
    expect(bornesDuMois('2026-02').fin).toBe('2026-02-28');
  });

  it('gère décembre sans déborder sur l’année suivante', () => {
    expect(bornesDuMois('2026-12').fin).toBe('2026-12-31');
  });
});

describe('appartenance au mois', () => {
  it('retient les dates du mois et écarte les autres', () => {
    expect(dansLeMois('2026-08-01', '2026-08')).toBe(true);
    expect(dansLeMois('2026-08-31', '2026-08')).toBe(true);
    expect(dansLeMois('2026-07-31', '2026-08')).toBe(false);
    expect(dansLeMois('2026-09-01', '2026-08')).toBe(false);
  });
});

describe('synthèse mensuelle', () => {
  it('compte les jours de garde par parent', () => {
    const s = synthetiser('2026-08', jours(
      ['2026-08-01', A], ['2026-08-02', A], ['2026-08-03', B],
    ), [], [A, B]);
    expect(s.parents[0].jours).toBe(2);
    expect(s.parents[1].jours).toBe(1);
    expect(s.joursCouverts).toBe(3);
  });

  it('écarte les jours hors du mois demandé', () => {
    const s = synthetiser('2026-08', jours(
      ['2026-07-31', A], ['2026-08-01', A], ['2026-09-01', B],
    ), [], [A, B]);
    expect(s.joursCouverts).toBe(1);
    expect(s.parents[0].jours).toBe(1);
    expect(s.parents[1].jours).toBe(0);
  });

  it('calcule la part de jours en pourcentage', () => {
    const s = synthetiser('2026-08', jours(
      ['2026-08-01', A], ['2026-08-02', A], ['2026-08-03', A], ['2026-08-04', B],
    ), [], [A, B]);
    expect(s.parents[0].pourcentJours).toBe(75);
    expect(s.parents[1].pourcentJours).toBe(25);
  });

  it('ne divise pas par zéro sur un mois sans planning', () => {
    const s = synthetiser('2026-08', [], [], [A, B]);
    expect(s.parents[0].pourcentJours).toBe(0);
    expect(s.joursCouverts).toBe(0);
    expect(s.soldeCents).toBe(0);
  });

  it('additionne les dépenses du mois seulement', () => {
    const s = synthetiser('2026-08', [], [
      depense({ montantCents: 5000, date: '2026-08-10' }),
      depense({ montantCents: 3000, date: '2026-07-10' }),
    ], [A, B]);
    expect(s.totalCents).toBe(5000);
    expect(s.depenses).toHaveLength(1);
  });

  it('distingue ce qui est avancé de ce qui est dû', () => {
    const s = synthetiser('2026-08', [], [
      depense({ montantCents: 10000, date: '2026-08-10', payePar: A }),
    ], [A, B]);
    expect(s.parents[0].avanceCents).toBe(10000);
    expect(s.parents[0].duCents).toBe(5000);
    expect(s.parents[1].avanceCents).toBe(0);
    expect(s.parents[1].duCents).toBe(5000);
  });

  it('donne un solde positif au parent qui a trop avancé', () => {
    const s = synthetiser('2026-08', [], [
      depense({ montantCents: 10000, date: '2026-08-10', payePar: A }),
    ], [A, B]);
    expect(s.soldeCents).toBe(5000);
  });

  it('donne un solde négatif au parent qui a trop peu avancé', () => {
    const s = synthetiser('2026-08', [], [
      depense({ montantCents: 10000, date: '2026-08-10', payePar: B }),
    ], [A, B]);
    expect(s.soldeCents).toBe(-5000);
  });

  it('annule le solde quand chacun a avancé sa part', () => {
    const s = synthetiser('2026-08', [], [
      depense({ montantCents: 10000, date: '2026-08-05', payePar: A }),
      depense({ montantCents: 10000, date: '2026-08-15', payePar: B }),
    ], [A, B]);
    expect(s.soldeCents).toBe(0);
  });

  it('signale les dépenses non acquises sans les retirer du total', () => {
    const s = synthetiser('2026-08', [], [
      depense({ montantCents: 5000, date: '2026-08-05', statut: 'validated' }),
      depense({ montantCents: 3000, date: '2026-08-06', statut: 'pending' }),
      depense({ montantCents: 2000, date: '2026-08-07', statut: 'disputed' }),
      depense({ montantCents: 1000, date: '2026-08-08', statut: 'reimbursed' }),
    ], [A, B]);
    expect(s.enAttente).toBe(2);
    expect(s.totalCents).toBe(11000);
  });

  it('classe les dépenses par date croissante', () => {
    const s = synthetiser('2026-08', [], [
      depense({ montantCents: 1000, date: '2026-08-20' }),
      depense({ montantCents: 1000, date: '2026-08-05' }),
    ], [A, B]);
    expect(s.depenses.map((d) => d.date)).toEqual(['2026-08-05', '2026-08-20']);
  });
});

describe('choix du mois', () => {
  it('propose douze mois, du plus récent au plus ancien', () => {
    const liste = moisDisponibles(new Date('2026-08-22T12:00:00Z'));
    expect(liste).toHaveLength(12);
    expect(liste[0]).toBe('2026-08');
    expect(liste[1]).toBe('2026-07');
    expect(liste[11]).toBe('2025-09');
  });

  it('recule correctement au-delà d’un changement d’année', () => {
    const liste = moisDisponibles(new Date('2026-01-15T12:00:00Z'), 3);
    expect(liste).toEqual(['2026-01', '2025-12', '2025-11']);
  });

  it('nomme le mois en français', () => {
    expect(nomDuMois('2026-08')).toBe('août 2026');
    expect(nomDuMois('2026-01')).toBe('janvier 2026');
  });
});
