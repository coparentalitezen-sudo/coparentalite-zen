import { describe, it, expect } from 'vitest';
import {
  ajusterPoids, redigerBilan, mediane,
  MINIMUM_MESURABLE, POIDS_MIN, POIDS_MAX,
} from '../src/lib/marketing/bilan';
import type { Agregat } from '../src/lib/marketing/mesures';

const niche = (
  cle: string, contenus: number, inscriptions: number, clics = 0,
): Agregat => ({
  cle, contenus, inscriptions, clics,
  rendement: contenus > 0 ? inscriptions / contenus : 0,
});

describe('médiane', () => {
  it('résiste à une valeur exceptionnelle', () => {
    expect(mediane([1, 2, 3, 4, 1000])).toBe(3);
  });

  it('traite un nombre pair de valeurs', () => {
    expect(mediane([1, 2, 3, 4])).toBe(2.5);
  });

  it('accepte une liste vide', () => {
    expect(mediane([])).toBe(0);
  });
});

describe('prudence avant tout ajustement', () => {
  it('ne touche à rien sous trois contenus mesurés', () => {
    const agregats = [niche('a', MINIMUM_MESURABLE - 1, 5), niche('b', 1, 0)];
    expect(ajusterPoids(agregats, {})).toEqual([]);
  });

  it('ne touche à rien quand une seule niche est mesurable', () => {
    // Comparer une niche à elle-même n'apprend rien.
    expect(ajusterPoids([niche('a', 10, 5), niche('b', 1, 0)], {})).toEqual([]);
  });

  it('n’ajuste jamais une niche encore non mesurable', () => {
    const ajustements = ajusterPoids(
      [niche('a', 10, 5), niche('b', 10, 0), niche('jeune', 1, 0)], {});
    expect(ajustements.map((x) => x.niche)).not.toContain('jeune');
  });
});

describe('ajustement progressif', () => {
  it('monte une niche au rendement supérieur à la médiane', () => {
    const a = ajusterPoids([niche('forte', 10, 8), niche('faible', 10, 0), niche('moyenne', 10, 2)],
      { forte: 1, faible: 1, moyenne: 1 });
    expect(a.find((x) => x.niche === 'forte')!.nouveau).toBeGreaterThan(1);
    expect(a.find((x) => x.niche === 'faible')!.nouveau).toBeLessThan(1);
  });

  it('ne bouge jamais de plus d’un quart en une semaine', () => {
    const a = ajusterPoids([niche('forte', 10, 9), niche('faible', 10, 0), niche('m', 10, 1)],
      { forte: 1, faible: 1, m: 1 });
    for (const x of a) {
      expect(Math.abs(x.nouveau - x.ancien) / x.ancien).toBeLessThanOrEqual(0.25 + 1e-9);
    }
  });

  it('respecte le plancher, pour qu’un sujet reste essayé', () => {
    let poids: Record<string, number> = { faible: 1, forte: 1, m: 1 };
    for (let s = 0; s < 30; s++) {
      const a = ajusterPoids([niche('forte', 10, 9), niche('faible', 10, 0), niche('m', 10, 1)], poids);
      for (const x of a) poids[x.niche] = x.nouveau;
    }
    expect(poids.faible).toBeGreaterThanOrEqual(POIDS_MIN);
    expect(poids.forte).toBeLessThanOrEqual(POIDS_MAX);
  });

  it('départage par les clics quand aucune niche n’obtient d’inscription', () => {
    const a = ajusterPoids(
      [niche('vue', 10, 0, 300), niche('ignoree', 10, 0, 5), niche('m', 10, 0, 50)],
      { vue: 1, ignoree: 1, m: 1 });
    expect(a.find((x) => x.niche === 'vue')!.nouveau).toBeGreaterThan(1);
    expect(a.find((x) => x.niche === 'ignoree')!.nouveau).toBeLessThan(1);
  });
});

describe('rédaction du bilan', () => {
  const base = {
    semaine: '2026s34', contenusPublies: 7, clics: 120, inscriptions: 4,
    parNiche: [niche('pension', 5, 3, 80), niche('garde-alternee', 4, 1, 30), niche('imprevus', 4, 0, 0)],
    ajustements: [{ niche: 'pension', ancien: 1, nouveau: 1.25, motif: 'Rendement supérieur à la médiane' }],
    sourcesIndisponibles: [],
  };

  it('tient en une page', () => {
    expect(redigerBilan(base).split('\n').length).toBeLessThanOrEqual(40);
  });

  it('refuse d’analyser une semaine sans publication', () => {
    const texte = redigerBilan({ ...base, contenusPublies: 0 });
    expect(texte).toContain('Aucun contenu publié');
    expect(texte).not.toContain('Sujets en tête');
  });

  it('nomme les sujets en tête et les sujets sans effet', () => {
    const texte = redigerBilan(base);
    expect(texte).toContain('pension');
    expect(texte).toContain('imprevus');
    expect(texte).toContain('Sans effet mesurable');
  });

  it('ne conclut rien tant qu’aucune niche n’est mesurable', () => {
    const texte = redigerBilan({ ...base, parNiche: [niche('a', 1, 0), niche('b', 2, 1)] });
    expect(texte).toContain('Rien n’est donc conclu'.replace('’', "'"));
  });

  it('signale une source de détection manquante', () => {
    const texte = redigerBilan({ ...base, sourcesIndisponibles: ['pension'] });
    expect(texte).toContain('Réserve');
    expect(texte).toContain('indisponible');
  });

  it('dit clairement quand rien n’a été ajusté', () => {
    expect(redigerBilan({ ...base, ajustements: [] })).toContain('Aucun ajustement');
  });
});
