import { describe, it, expect } from 'vitest';
import { estJourFerie, joursFeriesAnnee } from '../src/lib/scolarite/jours-feries';

describe('joursFeriesAnnee — jours fériés de France métropolitaine', () => {
  it('reconnaît les dates fixes 2026', () => {
    expect(estJourFerie('2026-01-01')).toBe(true);
    expect(estJourFerie('2026-05-01')).toBe(true);
    expect(estJourFerie('2026-05-08')).toBe(true);
    expect(estJourFerie('2026-07-14')).toBe(true);
    expect(estJourFerie('2026-08-15')).toBe(true);
    expect(estJourFerie('2026-11-01')).toBe(true);
    expect(estJourFerie('2026-11-11')).toBe(true);
    expect(estJourFerie('2026-12-25')).toBe(true);
  });

  it('calcule les jours mobiles à partir de Pâques (Pâques 2026 = 5 avril)', () => {
    expect(estJourFerie('2026-04-06')).toBe(true);  // lundi de Pâques
    expect(estJourFerie('2026-05-14')).toBe(true);  // Ascension
    expect(estJourFerie('2026-05-25')).toBe(true);  // lundi de Pentecôte
  });

  it('un jour ordinaire n’est pas férié', () => {
    expect(estJourFerie('2026-09-02')).toBe(false);
    expect(estJourFerie('2026-04-05')).toBe(false); // dimanche de Pâques lui-même n'est pas un jour férié distinct
  });

  it('couvre bien 11 dates par an', () => {
    expect(joursFeriesAnnee(2027).size).toBe(11);
  });
});
