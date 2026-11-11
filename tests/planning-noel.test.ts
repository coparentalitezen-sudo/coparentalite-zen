import { describe, it, expect } from 'vitest';
import { decouperNoel } from '@/lib/noel';
import { planningNoel, bornes, FORMULES } from '@/lib/planning-noel';

// Bornes officielles 2026-2027 : samedi 19 décembre minuit (Paris) → reprise lundi 4 janvier.
const noel = decouperNoel('2026-2027', '2026-12-18T23:00:00+00:00', '2027-01-03T23:00:00+00:00')!;

describe('planning de Noël', () => {
  it('moitié-moitié : le parent choisi a la moitié avec le 25, l’autre la suivante, sans trou', () => {
    const p = planningNoel(noel, 'moitie', 'autre');
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ debut: '2026-12-19', parent: 'autre', libelle: 'Première moitié, avec Noël' });
    expect(p[0].fin >= '2026-12-25').toBe(true);
    expect(p[1]).toMatchObject({ fin: '2027-01-03', parent: 'moi' });
  });

  it('réveillon : le 24 au parent choisi, le 25 à l’autre, le reste au rythme habituel', () => {
    const p = planningNoel(noel, 'reveillon', 'moi');
    expect(p.find((x) => x.debut === '2026-12-24')).toMatchObject({ fin: '2026-12-24', parent: 'moi' });
    expect(p.find((x) => x.debut === '2026-12-25')).toMatchObject({ fin: '2026-12-25', parent: 'autre' });
    expect(p[0]).toMatchObject({ debut: '2026-12-19', fin: '2026-12-23', parent: null });
    expect(p.at(-1)).toMatchObject({ fin: '2027-01-03', parent: null });
  });

  it('une fête chacun : Noël d’un côté, Nouvel An de l’autre, à cheval sur l’année', () => {
    const p = planningNoel(noel, 'fetes', 'moi');
    expect(p.find((x) => x.debut === '2026-12-24')).toMatchObject({ fin: '2026-12-25', parent: 'moi' });
    expect(p.find((x) => x.debut === '2026-12-31')).toMatchObject({ fin: '2027-01-01', parent: 'autre' });
    // périodes contiguës, du premier jour à la veille de la reprise
    for (let i = 1; i < p.length; i++) expect(p[i].debut > p[i - 1].fin).toBe(true);
    expect(p[0].debut).toBe(noel.premierJour);
    expect(p.at(-1)!.fin).toBe(noel.dernierJour);
  });

  it('textes courts et lisibles', () => {
    expect(bornes({ debut: '2026-12-24', fin: '2026-12-24', parent: 'moi', libelle: '' })).toMatch(/^le jeu\. 24 déc\.$/);
    expect(bornes({ debut: '2026-12-19', fin: '2026-12-26', parent: 'moi', libelle: '' })).toMatch(/^du sam\. 19 déc\. au sam\. 26 déc\.$/);
    expect(bornes({ debut: '2026-12-31', fin: '2027-01-01', parent: 'moi', libelle: '' })).toBe('du jeu. 31 déc. au ven. 1er janv.');
    expect(FORMULES.map((f) => f.id)).toEqual(['moitie', 'reveillon', 'fetes']);
  });
});
