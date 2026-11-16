import { describe, it, expect } from 'vitest';
import { analyser, similarite, motsSignificatifs, variation } from '../src/lib/copilote/analyse';
import { cleSemaine, periodeAnalysee, ajouterJours } from '../src/lib/copilote/dates';
import type { Vente, PlateformeBoutique } from '../src/lib/copilote/types';

const FIN = '2026-11-15';
let n = 0;

/** Une vente `jours` jours avant la fin de période. */
function vente(titre: string, jours: number, o: Partial<Vente> = {}): Vente {
  n++;
  return {
    plateforme: 'etsy' as PlateformeBoutique,
    commande: `c${n}`,
    ligne: '',
    produitRef: titre.toLowerCase().replace(/\W+/g, '-'),
    titre,
    quantite: 1,
    montantCentimes: 790,
    devise: 'EUR',
    venduLe: ajouterJours(FIN, -jours),
    ...o,
  };
}

const serie = (titre: string, jours: number[], o: Partial<Vente> = {}) =>
  jours.map((j) => vente(titre, j, o));

describe('dates', () => {
  it('semaine ISO avec l’année de la semaine, pas du calendrier', () => {
    expect(cleSemaine('2026-11-16')).toBe('2026-S47');
    expect(cleSemaine('2025-12-29')).toBe('2026-S01');
    expect(cleSemaine('2027-01-01')).toBe('2026-S53');
  });

  it('le lundi, la période est la semaine écoulée du lundi au dimanche', () => {
    expect(periodeAnalysee(new Date('2026-11-16T06:00:00Z')))
      .toEqual({ debut: '2026-11-09', fin: '2026-11-15' });
  });
});

describe('ressemblance des titres', () => {
  it('ignore formats, années et liaisons', () => {
    expect(motsSignificatifs('Budget familial 2026 – Google Sheets & Excel'))
      .toEqual(['budget', 'familial']);
  });

  it('rapproche le même produit vendu sous deux titres voisins', () => {
    const a = motsSignificatifs('Budget familial mensuel Google Sheets');
    const b = motsSignificatifs('Budget familial mensuel - modèle Excel');
    expect(similarite(a, b)).toBe(1);
    expect(similarite(a, motsSignificatifs('Calendrier garde alternée'))).toBe(0);
  });
});

describe('chiffres de la semaine', () => {
  it('compte unités, commandes, chiffre d’affaires et évolution', () => {
    const ventes = [
      ...serie('Budget familial', [0, 1, 2]),
      vente('Budget familial', 3, { quantite: 2, montantCentimes: 1580 }),
      ...serie('Budget familial', [8, 9]),
    ];
    const a = analyser({ ventes, fin: FIN });
    expect(a.semaine.unites).toBe(5);
    expect(a.semaine.commandes).toBe(4);
    expect(a.semaine.caCentimes).toBe(790 * 3 + 1580);
    expect(a.semaine.panierMoyenCentimes).toBe(Math.round((790 * 3 + 1580) / 4));
    expect(a.precedente.unites).toBe(2);
    expect(a.evolution).toBe(150);
  });

  it('n’additionne jamais deux devises', () => {
    const ventes = [
      ...serie('Budget familial', [0, 1]),
      vente('Planner', 1, { devise: 'USD', montantCentimes: 900, plateforme: 'gumroad' }),
    ];
    const a = analyser({ ventes, fin: FIN });
    expect(a.devise).toBe('EUR');
    expect(a.autresDevises).toEqual(['USD']);
    expect(a.semaine.caCentimes).toBe(1580);
  });

  it('pas d’évolution calculée sur une semaine précédente vide', () => {
    expect(variation(4, 0)).toBeNull();
    expect(analyser({ ventes: serie('X', [0]), fin: FIN }).evolution).toBeNull();
  });

  it('ignore les ventes postérieures à la période', () => {
    const a = analyser({ ventes: [vente('X', -1), vente('X', 0)], fin: FIN });
    expect(a.semaine.unites).toBe(1);
  });
});

describe('classement des produits', () => {
  const ventes = [
    // Moteur : 6 ventes sur 28 jours
    ...serie('Budget familial mensuel', [1, 3, 5, 10, 15, 20]),
    // Stagne : 6 → 1 d'une période à l'autre
    ...serie('Calendrier garde alternée', [2, 30, 33, 36, 40, 45, 50]),
    // Trop tôt : 2 ventes
    ...serie('Routine du soir enfants', [4, 6]),
    // En hausse : 1 → 3, hors du top 3 car le top est complet
    ...serie('Planning des repas', [1, 2, 3, 40]),
    ...serie('Suivi épargne objectifs', [1, 2, 4, 6, 8]),
    ...serie('Tableau partage frais', [1, 2, 3, 5, 7]),
  ];
  const a = analyser({ ventes, fin: FIN });
  const statut = (debut: string) => a.produits.find((f) => f.titre.startsWith(debut))!;

  it('désigne les trois premiers comme moteurs', () => {
    expect(statut('Budget familial').statut).toBe('moteur');
    expect(a.produits.filter((f) => f.statut === 'moteur')).toHaveLength(3);
  });

  it('repère une baisse de moitié sur 28 jours', () => {
    expect(statut('Calendrier garde').statut).toBe('stagne');
    expect(statut('Calendrier garde').motif).toMatch(/6 → 1/);
  });

  it('ne conclut rien sous trois ventes', () => {
    expect(statut('Routine du soir').statut).toBe('trop_tot');
  });

  it('repère une hausse', () => {
    expect(statut('Planning des repas').statut).toBe('en_hausse');
  });

  it('signale un produit sans vente depuis longtemps', () => {
    const b = analyser({ ventes: serie('Vieux produit', [60, 61, 62]), fin: FIN });
    expect(b.produits[0].statut).toBe('stagne');
    expect(b.produits[0].motif).toMatch(/Aucune vente depuis 60 jours/);
  });
});

describe('produits sur plusieurs plateformes', () => {
  it('regroupe un même produit vendu sur Etsy et Payhip', () => {
    const a = analyser({
      ventes: [
        ...serie('Budget familial mensuel Google Sheets', [1, 2, 3]),
        vente('Budget familial mensuel', 4, { plateforme: 'payhip', produitRef: 'p1' }),
      ],
      fin: FIN,
    });
    expect(a.produits).toHaveLength(1);
    expect(a.produits[0].plateformes).toEqual(['etsy', 'payhip']);
    expect(a.produits[0].unitesParPlateforme).toEqual({ etsy: 3, payhip: 1 });
  });

  it('compte les achats groupés', () => {
    const a = analyser({
      ventes: [
        vente('Budget familial', 1, { commande: 'X1' }), vente('Suivi épargne', 1, { commande: 'X1' }),
        vente('Budget familial', 2, { commande: 'X2' }), vente('Suivi épargne', 2, { commande: 'X2' }),
      ],
      fin: FIN,
    });
    expect(a.coAchats[0]).toMatchObject({ commandes: 2 });
  });
});

describe('vues et conversion', () => {
  it('calcule la conversion sur les trente jours du relevé', () => {
    const a = analyser({
      ventes: serie('Budget familial', [1, 50]),
      vues: [{ plateforme: 'etsy', produitRef: 'budget-familial', titre: 'Budget familial', vues: 400, releveLe: FIN }],
      fin: FIN,
    });
    expect(a.produits[0].vues).toBe(400);
    expect(a.produits[0].conversion).toBe(1 / 400);
    // 400 vues, 0,25 % : assez de vues pour conclure malgré peu de ventes.
    expect(a.produits[0].statut).toBe('faible_conversion');
  });

  it('fait apparaître une fiche du catalogue sans aucune vente', () => {
    const a = analyser({
      ventes: [],
      catalogue: [{ plateforme: 'etsy', reference: 'r', titre: 'Carnet de liaison', prixCentimes: 500,
        devise: 'EUR', tags: [], description: '' }],
      fin: FIN,
    });
    expect(a.produits[0]).toMatchObject({ titre: 'Carnet de liaison', unitesTotal: 0, statut: 'trop_tot' });
  });
});
