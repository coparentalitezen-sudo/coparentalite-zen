import { describe, it, expect } from 'vitest';
import {
  parserReponseExtraction, ErreurExtraction, anneeScolaireDe, semaineAbDe,
} from '../src/lib/scolarite/edt';

const reponseValide = JSON.stringify({
  semaine_ab_detectee: true,
  creneaux: [
    { jour: 1, heure_debut: '08:00', heure_fin: '09:00', matiere: 'Maths', salle: 'B12', professeur: 'Mme Dupont', semaine_ab: 'A' },
    { jour: 3, heure_debut: '10:00', heure_fin: '11:30', matiere: 'Histoire', salle: null, professeur: null, semaine_ab: null },
  ],
});

describe('parserReponseExtraction — parsing dégradé', () => {
  it('parse une réponse JSON propre', () => {
    const r = parserReponseExtraction(reponseValide);
    expect(r.semaine_ab_detectee).toBe(true);
    expect(r.creneaux).toHaveLength(2);
    expect(r.creneaux[0]).toMatchObject({ jour_semaine: 1, heure_debut: '08:00', heure_fin: '09:00', matiere: 'Maths', semaine_ab: 'A' });
    expect(r.creneaux[1]).toMatchObject({ jour_semaine: 3, salle: null, professeur: null, semaine_ab: null });
  });

  it('tolère des fences markdown ```json ... ```', () => {
    const r = parserReponseExtraction('```json\n' + reponseValide + '\n```');
    expect(r.creneaux).toHaveLength(2);
  });

  it('tolère des fences ``` sans le mot json', () => {
    const r = parserReponseExtraction('```\n' + reponseValide + '\n```');
    expect(r.creneaux).toHaveLength(2);
  });

  it('rejette un JSON invalide, jamais un résultat deviné', () => {
    expect(() => parserReponseExtraction('ceci n’est pas du JSON')).toThrow(ErreurExtraction);
  });

  it('rejette une réponse sans tableau creneaux', () => {
    expect(() => parserReponseExtraction('{"semaine_ab_detectee": false}')).toThrow(ErreurExtraction);
  });

  it('rejette un jour de semaine hors 1-5 (samedi/dimanche)', () => {
    const brut = JSON.stringify({ creneaux: [{ jour: 6, heure_debut: '08:00', heure_fin: '09:00' }] });
    expect(() => parserReponseExtraction(brut)).toThrow(ErreurExtraction);
  });

  it('rejette une heure de fin antérieure ou égale à l’heure de début', () => {
    const brut = JSON.stringify({ creneaux: [{ jour: 1, heure_debut: '10:00', heure_fin: '09:00' }] });
    expect(() => parserReponseExtraction(brut)).toThrow(ErreurExtraction);
    const brutEgal = JSON.stringify({ creneaux: [{ jour: 1, heure_debut: '10:00', heure_fin: '10:00' }] });
    expect(() => parserReponseExtraction(brutEgal)).toThrow(ErreurExtraction);
  });

  it('rejette une heure mal formée', () => {
    const brut = JSON.stringify({ creneaux: [{ jour: 1, heure_debut: '8h00', heure_fin: '09:00' }] });
    expect(() => parserReponseExtraction(brut)).toThrow(ErreurExtraction);
  });

  it('un champ semaine_ab autre que A/B devient null plutôt que de lever une erreur', () => {
    const brut = JSON.stringify({ creneaux: [{ jour: 1, heure_debut: '08:00', heure_fin: '09:00', semaine_ab: 'C' }] });
    const r = parserReponseExtraction(brut);
    expect(r.creneaux[0].semaine_ab).toBeNull();
  });
});

describe('anneeScolaireDe', () => {
  it('bascule au 1er août', () => {
    expect(anneeScolaireDe(new Date('2026-09-02'))).toBe('2026-2027');
    expect(anneeScolaireDe(new Date('2026-08-01'))).toBe('2026-2027');
    expect(anneeScolaireDe(new Date('2026-07-31'))).toBe('2025-2026');
    expect(anneeScolaireDe(new Date('2027-01-15'))).toBe('2026-2027');
  });
});

describe('semaineAbDe — alternance des semaines A/B', () => {
  it('la semaine d’ancrage elle-même est A', () => {
    expect(semaineAbDe('2026-09-07', '2026-09-07')).toBe('A');
    expect(semaineAbDe('2026-09-10', '2026-09-07')).toBe('A'); // même semaine calendaire
  });

  it('alterne à chaque semaine suivante', () => {
    expect(semaineAbDe('2026-09-14', '2026-09-07')).toBe('B');
    expect(semaineAbDe('2026-09-21', '2026-09-07')).toBe('A');
    expect(semaineAbDe('2026-09-28', '2026-09-07')).toBe('B');
  });

  it('reste cohérente pour une date antérieure à l’ancrage', () => {
    expect(semaineAbDe('2026-08-31', '2026-09-07')).toBe('B');
  });
});
