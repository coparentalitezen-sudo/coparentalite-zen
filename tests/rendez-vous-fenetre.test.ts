import { describe, expect, it } from 'vitest';
import {
  fenetreRendezVous, jourValide, ajouterJours, FENETRE_JOURS, PAS_JOURS,
} from '@/lib/rendez-vous-fenetre';

describe('période des rendez-vous', () => {
  it('par défaut, les 90 prochains jours', () => {
    expect(fenetreRendezVous('2026-11-26', null)).toEqual({ du: '2026-11-26', au: ajouterJours('2026-11-26', FENETRE_JOURS) });
  });

  it('va jusqu’au jour demandé par le planning, même au-delà de 90 jours (incident du 23/04/2027)', () => {
    const { du, au } = fenetreRendezVous('2026-11-26', '2027-04-23');
    expect(du).toBe('2026-11-26');
    expect(au).toBe('2027-04-23');
  });

  it('ne réduit pas la période pour un jour proche', () => {
    expect(fenetreRendezVous('2026-11-26', '2026-12-01').au).toBe(ajouterJours('2026-11-26', FENETRE_JOURS));
  });

  it('remonte au jour demandé s’il est passé', () => {
    expect(fenetreRendezVous('2026-11-26', '2026-11-20').du).toBe('2026-11-20');
  });

  it('s’étend de 90 jours à chaque « Voir plus loin »', () => {
    expect(fenetreRendezVous('2026-11-26', null, 2).au).toBe(ajouterJours('2026-11-26', FENETRE_JOURS + 2 * PAS_JOURS));
  });

  it('ignore un jour invalide plutôt que de casser la page', () => {
    for (const v of ['2027-02-31', '23/04/2027', 'abc', '', null]) {
      expect(jourValide(v)).toBeNull();
      expect(fenetreRendezVous('2026-11-26', v)).toEqual(fenetreRendezVous('2026-11-26', null));
    }
  });

  it('passe correctement les fins de mois et d’année', () => {
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29');
  });
});
