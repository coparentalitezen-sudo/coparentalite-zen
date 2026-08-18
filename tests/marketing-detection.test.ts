import { describe, it, expect } from 'vitest';
import {
  calculerScore, classer, urlConsultations, totaliserConsultations,
  ARTICLES, SEUIL_FIABILITE, type SignauxNiche,
} from '../src/lib/marketing/detection';
import { BANQUE } from '../src/lib/marketing/banque';

const NEUTRE: SignauxNiche = {
  consultations: 0, publies: 0, clics: 0, inscriptions: 0, saisonProche: false,
};

const sujet = (niche: string) => BANQUE.find((s) => s.niche === niche)!;

describe('calcul du score', () => {
  it('reste borné entre 0 et 100', () => {
    const bas = calculerScore(sujet('garde-alternee'), NEUTRE, 1000, 3);
    const haut = calculerScore(sujet('garde-alternee'),
      { consultations: 1000, publies: 20, clics: 2000, inscriptions: 60, saisonProche: true },
      1000, 3);
    expect(bas.total).toBeGreaterThanOrEqual(0);
    expect(haut.total).toBeLessThanOrEqual(100);
    expect(haut.total).toBeGreaterThan(bas.total);
  });

  it('rend les huit composantes demandées', () => {
    const s = calculerScore(sujet('pension'), NEUTRE, 100, 5);
    expect(Object.keys(s.details).sort()).toEqual([
      'adequation', 'concurrence', 'frequence', 'interet',
      'performancePassee', 'potentielClic', 'potentielInscription', 'saisonnalite',
    ]);
  });
});

describe('prudence statistique', () => {
  it('ignore la performance tant que trop peu de contenus ont été publiés', () => {
    const s = calculerScore(sujet('pension'),
      { consultations: 50, publies: SEUIL_FIABILITE - 1, clics: 900, inscriptions: 40, saisonProche: false },
      100, 5);
    expect(s.provisoire).toBe(true);
    expect(s.details.performancePassee).toBe(0);
  });

  it('ne laisse pas une seule publication réussie dominer le classement', () => {
    const coupDeChance: SignauxNiche = {
      consultations: 10, publies: 1, clics: 5000, inscriptions: 200, saisonProche: false,
    };
    const regulier: SignauxNiche = {
      consultations: 10, publies: 10, clics: 400, inscriptions: 12, saisonProche: false,
    };
    const a = calculerScore(sujet('pension'), coupDeChance, 100, 5);
    const b = calculerScore(sujet('depenses-partagees'), regulier, 100, 5);
    expect(b.total).toBeGreaterThan(a.total);
  });

  it('tient compte de la performance dès que le seuil est atteint', () => {
    const s = calculerScore(sujet('pension'),
      { consultations: 50, publies: SEUIL_FIABILITE, clics: 120, inscriptions: 6, saisonProche: false },
      100, 5);
    expect(s.provisoire).toBe(false);
    expect(s.details.performancePassee).toBeGreaterThan(0);
  });
});

describe('classement', () => {
  it('trie par score décroissant et conserve tous les sujets', () => {
    const rangs = classer(BANQUE, {}, 3);
    expect(rangs).toHaveLength(BANQUE.length);
    for (let i = 1; i < rangs.length; i++) {
      expect(rangs[i - 1].score.total).toBeGreaterThanOrEqual(rangs[i].score.total);
    }
  });

  it('fait remonter un sujet dont la saison est en cours', () => {
    const rangs = classer(BANQUE, {}, 11);
    const position = rangs.findIndex((r) => r.sujet.niche === 'vacances-scolaires');
    expect(position).toBeLessThan(6);
  });

  it('laisse une chance à un sujet jamais traité', () => {
    const signaux: Record<string, SignauxNiche> = {
      'garde-alternee': { consultations: 900, publies: 12, clics: 60, inscriptions: 0, saisonProche: false },
    };
    const rangs = classer(BANQUE, signaux, 3);
    const jamaisTraite = rangs.findIndex((r) => r.score.provisoire);
    expect(jamaisTraite).toBeLessThan(rangs.length - 1);
  });

  it('fonctionne quand toutes les sources ont échoué', () => {
    expect(() => classer(BANQUE, {}, 7)).not.toThrow();
    expect(classer(BANQUE, {}, 7)[0].score.total).toBeGreaterThan(0);
  });
});

describe('source Wikimédia', () => {
  it('construit une adresse conforme à l’API Pageviews', () => {
    const url = urlConsultations('Résidence_alternée',
      new Date('2026-07-01'), new Date('2026-07-31'));
    expect(url).toContain('wikimedia.org/api/rest_v1/metrics/pageviews/per-article');
    expect(url).toContain('/fr.wikipedia/all-access/user/');
    expect(url).toMatch(/\/daily\/20260701\/20260731$/);
  });

  it('encode les titres accentués', () => {
    expect(urlConsultations('Famille_recomposée', new Date('2026-01-01'), new Date('2026-01-02')))
      .toContain('Famille_recompos%C3%A9e');
  });

  it('totalise les consultations', () => {
    expect(totaliserConsultations({ items: [{ views: 10 }, { views: 5 }] })).toBe(15);
  });

  it('renvoie null plutôt que zéro quand la réponse est inexploitable', () => {
    // Distinction utile : zéro consultation est une information, une source
    // en panne n'en est pas une.
    expect(totaliserConsultations({ erreur: 'not found' })).toBeNull();
    expect(totaliserConsultations(null)).toBeNull();
  });

  it('ne cite que des articles rattachés à une niche connue', () => {
    const niches = new Set(BANQUE.map((s) => s.niche));
    for (const niche of Object.keys(ARTICLES)) expect(niches.has(niche)).toBe(true);
  });
});
