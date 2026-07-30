import { describe, it, expect } from 'vitest';
import { dansHorizon } from '../src/lib/premium-horizon';
import type { Offre } from '../src/lib/actions/premium';

const gratuite = (horizon: string, joursRestants = 10): Offre => ({
  planId: 'free', planLibelle: 'Gratuit', prixCents: 499, periodicite: 'month',
  illimite: false, horizon, joursRestants,
  moisOfferts: 3, moisAjoutes: 0, abonnementActif: false,
  abonnementFin: null, resiliationProgrammee: false,
});

const illimitee: Offre = {
  planId: 'premium', planLibelle: 'Zen Plus', prixCents: 499, periodicite: 'month',
  illimite: true, horizon: null,
  joursRestants: null, moisOfferts: 3, moisAjoutes: 0, abonnementActif: true,
  abonnementFin: '2027-01-01T00:00:00Z', resiliationProgrammee: false,
};

describe('dansHorizon — garde d’affichage de l’offre', () => {
  it('accepte une date antérieure à l’horizon', () => {
    expect(dansHorizon(gratuite('2026-10-31'), '2026-09-15')).toBe(true);
  });

  it('accepte le dernier jour couvert : la borne est inclusive', () => {
    expect(dansHorizon(gratuite('2026-10-31'), '2026-10-31')).toBe(true);
  });

  it('refuse le lendemain de l’horizon', () => {
    expect(dansHorizon(gratuite('2026-10-31'), '2026-11-01')).toBe(false);
  });

  it('n’impose aucune limite avec un abonnement actif', () => {
    expect(dansHorizon(illimitee, '2099-12-31')).toBe(true);
  });

  it('ne bloque rien quand l’offre est inconnue : on ne refuse jamais à tort', () => {
    // Le serveur reste l'autorité ; bloquer sur une donnée absente
    // empêcherait d'agir pour une mauvaise raison.
    expect(dansHorizon(null, '2099-12-31')).toBe(true);
  });

  it('accepte un horodatage complet et ne retient que le jour', () => {
    expect(dansHorizon(gratuite('2026-10-31'), '2026-10-31T23:30:00.000Z')).toBe(true);
    expect(dansHorizon(gratuite('2026-10-31'), '2026-11-01T00:30:00.000Z')).toBe(false);
  });

  it('accepte un objet Date', () => {
    expect(dansHorizon(gratuite('2026-10-31'), new Date('2026-10-20T12:00:00Z'))).toBe(true);
    expect(dansHorizon(gratuite('2026-10-31'), new Date('2026-12-01T12:00:00Z'))).toBe(false);
  });

  it('reste cohérent quand l’horizon est déjà dépassé', () => {
    const echue = gratuite('2026-01-31', 0);
    expect(dansHorizon(echue, '2026-02-01')).toBe(false);
    // le passé reste consultable : la limite ne porte que sur l'avenir
    expect(dansHorizon(echue, '2026-01-15')).toBe(true);
  });
});
