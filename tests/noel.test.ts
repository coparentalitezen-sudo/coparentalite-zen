import { describe, expect, it } from 'vitest';
import {
  anneeScolaireDuProchainNoel, dateLongue, decouperNoel, jourAParis,
} from '../src/lib/noel';

// Bornes telles que la source officielle les publie pour 2026-2027.
const DEBUT = '2026-12-18T23:00:00+00:00';
const FIN = '2027-01-03T23:00:00+00:00';

describe('vacances de Noël', () => {
  it('ramène les horodatages officiels au jour de Paris', () => {
    expect(jourAParis(DEBUT)).toBe('2026-12-19');
    expect(jourAParis(FIN)).toBe('2027-01-04');
    expect(jourAParis('pas une date')).toBeNull();
  });

  it('découpe 2026-2027 en deux moitiés de huit jours', () => {
    const d = decouperNoel('2026-2027', DEBUT, FIN)!;
    expect(d.finDesCours).toBe('2026-12-18');
    expect(d.reprise).toBe('2027-01-04');
    expect(d.nombreDeJours).toBe(16);
    expect(d.premiereMoitie).toEqual({ debut: '2026-12-19', fin: '2026-12-26' });
    expect(d.secondeMoitie).toEqual({ debut: '2026-12-27', fin: '2027-01-03' });
    expect(d.noelDansLaPremiereMoitie).toBe(true);
  });

  it('donne le jour restant à la seconde moitié quand le total est impair', () => {
    const d = decouperNoel('x', '2026-12-18T23:00:00+00:00', '2027-01-04T23:00:00+00:00')!;
    expect(d.nombreDeJours).toBe(17);
    expect(d.premiereMoitie.fin).toBe('2026-12-26');
    expect(d.secondeMoitie).toEqual({ debut: '2026-12-27', fin: '2027-01-04' });
  });

  it('refuse des bornes inversées', () => {
    expect(decouperNoel('x', FIN, DEBUT)).toBeNull();
  });

  it('vise le Noël de l’année civile en cours', () => {
    expect(anneeScolaireDuProchainNoel('2026-10-25')).toBe('2026-2027');
    expect(anneeScolaireDuProchainNoel('2027-03-10')).toBe('2027-2028');
  });

  it('écrit les dates en toutes lettres', () => {
    expect(dateLongue('2026-12-19')).toBe('samedi 19 décembre 2026');
    expect(dateLongue('2026-12-19', false)).toBe('samedi 19 décembre');
  });
});
