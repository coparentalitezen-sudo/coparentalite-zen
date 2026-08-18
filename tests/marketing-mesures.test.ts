import { describe, it, expect } from 'vitest';
import {
  performances, regrouper, taux, entonnoir, meilleuresAccroches,
  type LigneContenu, type LigneVisite,
} from '../src/lib/marketing/mesures';

const contenu = (reference: string, niche: string, format = 'carrousel'): LigneContenu => ({
  reference, niche, format, categorie: 'conseil', accroche: `Accroche ${reference}`, statut: 'publie',
});

describe('rapprochement des mesures', () => {
  const contenus = [contenu('c1', 'pension'), contenu('c2', 'garde-alternee'), contenu('c3', 'pension')];
  const visites: LigneVisite[] = [
    { contenu: 'c1', source: 'instagram', clics: 12 },
    { contenu: 'c1', source: 'facebook', clics: 3 },
    { contenu: 'c2', source: 'instagram', clics: 40 },
  ];

  it('additionne les clics de toutes les plateformes', () => {
    const p = performances(contenus, visites, []);
    expect(p.find((x) => x.reference === 'c1')!.clics).toBe(15);
  });

  it('compte zéro clic pour un contenu sans visite', () => {
    expect(performances(contenus, visites, []).find((x) => x.reference === 'c3')!.clics).toBe(0);
  });

  it('attribue les inscriptions au contenu d’origine', () => {
    const p = performances(contenus, visites, ['c1', 'c1', 'c2']);
    expect(p.find((x) => x.reference === 'c1')!.inscriptions).toBe(2);
    expect(p.find((x) => x.reference === 'c2')!.inscriptions).toBe(1);
  });

  it('laisse la portée inconnue plutôt que de la dire nulle', () => {
    // Zéro signifierait « n'a touché personne ». Null signifie « on n'en sait
    // rien tant que Meta n'est pas connecté ». Les deux ne se valent pas.
    for (const p of performances(contenus, visites, [])) {
      expect(p.portee).toBeNull();
      expect(p.vues).toBeNull();
    }
  });

  it('ignore une visite qui ne correspond à aucun contenu', () => {
    const p = performances(contenus, [{ contenu: 'inconnu', source: 'x', clics: 99 }], []);
    expect(p.reduce((s, x) => s + x.clics, 0)).toBe(0);
  });
});

describe('regroupement', () => {
  const lignes = performances(
    [contenu('c1', 'pension'), contenu('c2', 'pension'), contenu('c3', 'garde-alternee', 'reel')],
    [{ contenu: 'c1', source: 'instagram', clics: 10 }, { contenu: 'c3', source: 'instagram', clics: 4 }],
    ['c1', 'c3'],
  );

  it('regroupe par niche', () => {
    const g = regrouper(lignes, 'niche');
    expect(g.find((x) => x.cle === 'pension')!.contenus).toBe(2);
    expect(g.find((x) => x.cle === 'pension')!.clics).toBe(10);
  });

  it('compare par rendement et non par volume brut', () => {
    // « garde-alternee » a moins de clics mais une inscription sur un seul
    // contenu ; « pension » une inscription sur deux. Le rendement départage.
    const g = regrouper(lignes, 'niche');
    expect(g[0].cle).toBe('garde-alternee');
  });

  it('regroupe aussi par format', () => {
    const g = regrouper(lignes, 'format');
    expect(g.map((x) => x.cle).sort()).toEqual(['carrousel', 'reel']);
  });
});

describe('taux et entonnoir', () => {
  it('ne divise jamais par zéro', () => {
    expect(taux(5, 0)).toBe(0);
    expect(entonnoir(0, 0, 0, 0).tauxInscription).toBe(0);
  });

  it('arrondit au dixième', () => {
    expect(taux(1, 3)).toBe(33.3);
  });

  it('rapporte chaque taux à l’étape précédente', () => {
    const e = entonnoir(100, 20, 10, 5);
    expect(e.tauxInscription).toBe(20);
    expect(e.tauxActivation).toBe(50);
    expect(e.tauxAbonnement).toBe(50);
  });
});

describe('classement des accroches', () => {
  it('refuse de classer trop peu de contenus', () => {
    const lignes = performances(
      [contenu('c1', 'pension'), contenu('c2', 'pension')],
      [{ contenu: 'c1', source: 'instagram', clics: 50 }],
      [],
    );
    expect(meilleuresAccroches(lignes)).toEqual([]);
  });

  it('classe dès qu’il y a matière à comparer', () => {
    const refs = ['c1', 'c2', 'c3', 'c4'];
    const lignes = performances(
      refs.map((r) => contenu(r, 'pension')),
      refs.map((r, i) => ({ contenu: r, source: 'instagram', clics: (i + 1) * 10 })),
      [],
    );
    const top = meilleuresAccroches(lignes);
    expect(top).toHaveLength(3);
    expect(top[0].reference).toBe('c4');
  });
});
