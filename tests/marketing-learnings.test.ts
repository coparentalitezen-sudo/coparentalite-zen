import { describe, it, expect } from 'vitest';
import {
  scorePin, classer, produireLearnings, MINIMUM_PINS, PART_EXPLORATION,
  type MesurePin,
} from '../src/lib/marketing/learnings';

const mesure = (
  pinId: string, pilier: string, famille: string,
  impressions: number, saves = 0, pinClicks = 0, outboundClicks = 0,
): MesurePin => ({ pinId, pilier, famille, impressions, saves, pinClicks, outboundClicks });

describe('score d’une épingle', () => {
  it('n’a pas de score sans impression', () => {
    expect(scorePin(mesure('p', 'a', 'conseil', 0))).toBeNull();
  });

  it('pondère save, pin_click et outbound_click différemment', () => {
    const parSave = scorePin(mesure('p', 'a', 'conseil', 1000, 10))!;
    const parPinClick = scorePin(mesure('p', 'a', 'conseil', 1000, 0, 10))!;
    const parOutbound = scorePin(mesure('p', 'a', 'conseil', 1000, 0, 0, 10))!;
    expect(parOutbound).toBeGreaterThan(parPinClick);
    expect(parPinClick).toBeGreaterThan(parSave);
  });

  it('normalise pour 1000 impressions', () => {
    const petite = scorePin(mesure('p', 'a', 'conseil', 100, 1))!;
    const grande = scorePin(mesure('p', 'a', 'conseil', 1000, 10))!;
    expect(petite).toBeCloseTo(grande, 5);
  });
});

describe('classement par pilier ou famille', () => {
  const mesures: MesurePin[] = [
    mesure('p1', 'pension', 'conseil', 1000, 20, 5, 5),
    mesure('p2', 'pension', 'conseil', 1000, 5, 1, 0),
    mesure('p3', 'imprevus', 'quotidien', 1000, 0, 0, 0),
  ];

  it('exclut les épingles sans impression', () => {
    const avecVide = [...mesures, mesure('p4', 'pension', 'conseil', 0)];
    const r = classer(avecVide, 'pilier');
    expect(r.find((x) => x.cle === 'pension')?.nbPins).toBe(2);
  });

  it('trie du meilleur score médian au moins bon', () => {
    const r = classer(mesures, 'pilier');
    expect(r[0].cle).toBe('pension');
  });

  it('classe aussi par famille', () => {
    const r = classer(mesures, 'famille');
    expect(r.map((x) => x.cle)).toContain('conseil');
    expect(r.map((x) => x.cle)).toContain('quotidien');
  });
});

describe('bloc de consignes', () => {
  it('recommande de varier sous le plancher de pins mesurés', () => {
    const mesures = Array.from({ length: MINIMUM_PINS - 1 }, (_, i) =>
      mesure(`p${i}`, 'pension', 'conseil', 1000, 5));
    const { nbPins, bloc } = produireLearnings({ mesures });
    expect(nbPins).toBe(MINIMUM_PINS - 1);
    expect(bloc).toContain('varier');
    expect(bloc).not.toContain('Piliers en tête');
  });

  it('classe au-delà du plancher', () => {
    const mesures = [
      ...Array.from({ length: MINIMUM_PINS }, (_, i) => mesure(`p${i}`, 'pension', 'conseil', 1000, 20, 5, 5)),
      ...Array.from({ length: MINIMUM_PINS }, (_, i) => mesure(`q${i}`, 'imprevus', 'quotidien', 1000, 1)),
    ];
    const { bloc } = produireLearnings({ mesures });
    expect(bloc).toContain('Piliers en tête');
    expect(bloc).toContain('pension');
  });

  it('impose toujours la part exploratoire, même sous le plancher', () => {
    const mesures = [mesure('p1', 'pension', 'conseil', 1000, 5)];
    const { bloc } = produireLearnings({ mesures });
    expect(bloc).toContain(`${Math.round(PART_EXPLORATION * 100)} %`);
  });

  it('compte les pins mesurables, pas la longueur brute des mesures', () => {
    const mesures = [
      mesure('p1', 'pension', 'conseil', 1000, 5),
      mesure('p2', 'pension', 'conseil', 0),
    ];
    expect(produireLearnings({ mesures }).nbPins).toBe(1);
  });
});
