import { describe, it, expect } from 'vitest';
import {
  zonesCitees, jour, concerneLesEleves,
  versPeriodesImportables, versCorrespondancesAcademies,
  type EnregistrementOfficiel,
} from '../src/lib/calendrier-officiel';

describe('zonesCitees — le défaut qui vidait les plannings', () => {
  it('reconnaît une zone unique', () => {
    expect(zonesCitees('Zone A')).toEqual(['A']);
    expect(zonesCitees('Zone C')).toEqual(['C']);
  });

  it('reconnaît TOUTES les zones d’une période commune', () => {
    // C'est le cas de la Toussaint, de Noël et de l'Été : ne retenir que la
    // première zone privait les foyers B et C de la majorité des vacances.
    expect(zonesCitees('Zone A, Zone B, Zone C')).toEqual(['A', 'B', 'C']);
    expect(zonesCitees('Zone B et Zone C')).toEqual(['B', 'C']);
  });

  it('renvoie toujours les zones dans un ordre stable', () => {
    expect(zonesCitees('Zone C, Zone A')).toEqual(['A', 'C']);
  });

  it('ignore les territoires dont nous n’avons pas le calendrier', () => {
    // Mieux vaut ne rien afficher que d'inventer des dates
    expect(zonesCitees('Corse')).toEqual([]);
    expect(zonesCitees('Guadeloupe')).toEqual([]);
    expect(zonesCitees(undefined)).toEqual([]);
    expect(zonesCitees('')).toEqual([]);
  });

  it('ne se laisse pas piéger par la casse ni les espaces multiples', () => {
    expect(zonesCitees('zone a,  ZONE  B')).toEqual(['A', 'B']);
  });
});

describe('concerneLesEleves', () => {
  it('retient les périodes des élèves et les périodes générales', () => {
    expect(concerneLesEleves('Élèves')).toBe(true);
    expect(concerneLesEleves('-')).toBe(true);
    expect(concerneLesEleves(undefined)).toBe(true);
  });

  it('écarte les périodes réservées aux enseignants', () => {
    // La pré-rentrée des enseignants n'est pas une vacance pour les enfants
    expect(concerneLesEleves('Enseignants')).toBe(false);
  });
});

describe('jour', () => {
  it('ramène un horodatage au jour', () => {
    expect(jour('2026-10-17T22:00:00+00:00')).toBe('2026-10-17');
  });
  it('refuse une date inexploitable', () => {
    expect(jour('pas une date')).toBeNull();
    expect(jour(undefined)).toBeNull();
  });
});

describe('versPeriodesImportables', () => {
  const toussaint: EnregistrementOfficiel = {
    description: 'Vacances de la Toussaint',
    start_date: '2026-10-17T00:00:00+00:00',
    end_date: '2026-11-02T00:00:00+00:00',
    zones: 'Zone A, Zone B, Zone C',
    annee_scolaire: '2026-2027',
    population: '-',
  };

  it('produit une ligne par zone pour une période commune', () => {
    const p = versPeriodesImportables([toussaint]);
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.zone).sort()).toEqual(['A', 'B', 'C']);
    // toutes portent les mêmes dates
    expect(new Set(p.map((x) => x.starts_on))).toEqual(new Set(['2026-10-17']));
  });

  it('un foyer de zone C retrouve bien la Toussaint', () => {
    const p = versPeriodesImportables([toussaint]);
    expect(p.some((x) => x.zone === 'C')).toBe(true);
  });

  it('ne duplique pas une période répétée par la source', () => {
    const p = versPeriodesImportables([toussaint, { ...toussaint }]);
    expect(p).toHaveLength(3);
  });

  it('écarte les périodes des enseignants', () => {
    const p = versPeriodesImportables([{ ...toussaint, population: 'Enseignants' }]);
    expect(p).toEqual([]);
  });

  it('écarte une période dont la fin précède le début', () => {
    const p = versPeriodesImportables([{
      ...toussaint, start_date: '2026-11-02T00:00:00+00:00', end_date: '2026-10-17T00:00:00+00:00',
    }]);
    expect(p).toEqual([]);
  });

  it('écarte un territoire sans zone métropolitaine', () => {
    expect(versPeriodesImportables([{ ...toussaint, zones: 'Martinique' }])).toEqual([]);
  });

  it('conserve les périodes propres à une seule zone', () => {
    const hiver: EnregistrementOfficiel = {
      description: 'Vacances d’Hiver',
      start_date: '2027-02-06T00:00:00+00:00',
      end_date: '2027-02-22T00:00:00+00:00',
      zones: 'Zone B',
      annee_scolaire: '2026-2027',
    };
    const p = versPeriodesImportables([hiver]);
    expect(p).toHaveLength(1);
    expect(p[0].zone).toBe('B');
  });

  it('donne un identifiant externe distinct par zone', () => {
    const p = versPeriodesImportables([toussaint]);
    expect(new Set(p.map((x) => x.external_id)).size).toBe(3);
  });
});

describe('versCorrespondancesAcademies', () => {
  it('rattache une académie à sa zone', () => {
    const c = versCorrespondancesAcademies([
      { location: 'Créteil', zones: 'Zone C' },
      { location: 'Lyon', zones: 'Zone A' },
    ]);
    expect(c).toEqual(expect.arrayContaining([
      { area_code: 'CRÉTEIL', area_label: 'Créteil', zone_code: 'C' },
      { area_code: 'LYON', area_label: 'Lyon', zone_code: 'A' },
    ]));
  });

  it('ignore les lignes multi-zones, qui ne disent rien de l’académie', () => {
    // Une ligne « Zone A, Zone B, Zone C » ne permet pas de situer une académie
    const c = versCorrespondancesAcademies([
      { location: 'Créteil', zones: 'Zone A, Zone B, Zone C' },
    ]);
    expect(c).toEqual([]);
  });
});
