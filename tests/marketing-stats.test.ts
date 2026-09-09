import { describe, it, expect } from 'vitest';
import { referenceDuLien, associerEpingles, joursDepuisPub, epinglesAMesurer } from '../src/lib/marketing/stats';
import type { EpingleApi } from '../src/lib/marketing/pinterest-api';
import type { ContenuSansPin, ContenuACollecter } from '../src/lib/marketing/depot';

describe('référence portée par un lien', () => {
  it('lit utm_content', () => {
    expect(referenceDuLien('https://coparentalitezen.fr/conseils/2026s34-carrousel-2?utm_content=2026s34-carrousel-2'))
      .toBe('2026s34-carrousel-2');
  });

  it('renvoie null sans utm_content', () => {
    expect(referenceDuLien('https://coparentalitezen.fr/conseils/x')).toBeNull();
  });

  it('renvoie null pour un lien absent ou invalide', () => {
    expect(referenceDuLien(null)).toBeNull();
    expect(referenceDuLien('pas une url')).toBeNull();
  });
});

describe('association épingles ↔ contenus', () => {
  const enAttente: ContenuSansPin[] = [
    { reference: '2026s34-carrousel-2' },
    { reference: '2026s34-reel-1' },
  ];

  it('rattache une épingle dont le lien porte une référence connue', () => {
    const epingles: EpingleApi[] = [
      { id: 'pin-1', link: 'https://x.fr/a?utm_content=2026s34-carrousel-2', created_at: '2026-08-20T09:00:00Z' },
    ];
    const r = associerEpingles(epingles, enAttente);
    expect(r).toEqual([{ reference: '2026s34-carrousel-2', pinId: 'pin-1', creeLe: new Date('2026-08-20T09:00:00Z') }]);
  });

  it('ignore une épingle dont la référence est inconnue', () => {
    const epingles: EpingleApi[] = [
      { id: 'pin-1', link: 'https://x.fr/a?utm_content=autre-chose', created_at: null },
    ];
    expect(associerEpingles(epingles, enAttente)).toEqual([]);
  });

  it('ignore une épingle sans lien', () => {
    const epingles: EpingleApi[] = [{ id: 'pin-1', link: null, created_at: null }];
    expect(associerEpingles(epingles, enAttente)).toEqual([]);
  });

  it('ne rattache une référence qu’une seule fois', () => {
    const epingles: EpingleApi[] = [
      { id: 'pin-1', link: 'https://x.fr/a?utm_content=2026s34-carrousel-2', created_at: null },
      { id: 'pin-2', link: 'https://x.fr/b?utm_content=2026s34-carrousel-2', created_at: null },
    ];
    const r = associerEpingles(epingles, enAttente);
    expect(r).toHaveLength(1);
    expect(r[0].pinId).toBe('pin-1');
  });
});

describe('âge d’une épingle', () => {
  it('compte les jours pleins écoulés', () => {
    expect(joursDepuisPub(new Date('2026-08-01T09:00:00Z'), new Date('2026-08-04T09:00:00Z'))).toBe(3);
  });

  it('ne renvoie jamais un âge négatif', () => {
    expect(joursDepuisPub(new Date('2026-08-10T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))).toBe(0);
  });
});

describe('sélection des épingles à mesurer', () => {
  const maintenant = new Date('2026-08-10T12:00:00Z');
  const contenus: ContenuACollecter[] = [
    { contenuId: 'c1', pinId: 'pin-1', pinCreeLe: new Date('2026-08-09T12:00:00Z') }, // 1 jour
    { contenuId: 'c2', pinId: 'pin-2', pinCreeLe: new Date('2026-08-07T12:00:00Z') }, // 3 jours
  ];

  it('écarte une épingle publiée depuis moins de deux jours', () => {
    const r = epinglesAMesurer(contenus, maintenant);
    expect(r.map((c) => c.pinId)).toEqual(['pin-2']);
  });

  it('porte l’âge calculé pour chaque épingle retenue', () => {
    const r = epinglesAMesurer(contenus, maintenant);
    expect(r[0].jours).toBe(3);
  });
});
