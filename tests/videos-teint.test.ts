import { describe, it, expect } from 'vitest';
// Module JavaScript partagé avec la page de rendu.
import { distribution, teintEnfant, TEINT_ENFANT } from '../video-gabarit/decors.js';

describe('vidéos : teint des enfants cohérent avec celui des parents', () => {
  it('deux parents noirs → noir ; un noir et un blanc → marron clair ; deux blancs → blanc', () => {
    expect(teintEnfant('noir', 'noir')).toBe('noir');
    expect(teintEnfant('noir', 'blanc')).toBe('metis');
    expect(teintEnfant('blanc', 'noir')).toBe('metis');
    expect(teintEnfant('blanc', 'blanc')).toBe('blanc');
  });

  it('s’applique à l’aîné et au cadet, sur toutes les graines, et les quatre couples existent', () => {
    const couples = new Set<string>();
    for (let g = 0; g < 50_000; g += 13) {
      const d = distribution(g);
      const attendu = teintEnfant(d.papa.teint, d.maman.teint) as keyof typeof TEINT_ENFANT;
      expect(d.teintEnfants).toBe(attendu);
      expect(TEINT_ENFANT[attendu]).toContain(d.enfant.skin);
      expect(TEINT_ENFANT[attendu]).toContain(d.cadet.skin);
      couples.add(`${d.papa.teint}+${d.maman.teint}`);
    }
    expect([...couples].sort()).toEqual(['blanc+blanc', 'blanc+noir', 'noir+blanc', 'noir+noir']);
  });

  it('déterministe : même graine, même distribution', () => {
    expect(JSON.stringify(distribution(123456))).toBe(JSON.stringify(distribution(123456)));
  });
});
