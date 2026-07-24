import { describe, it, expect } from 'vitest';
import { calculerSerenite, type EtatFoyer } from '../src/lib/serenite';

const parfait: EtatFoyer = {
  deuxParents: true,
  auMoinsUnEnfant: true,
  rythmeDefini: true,
  depensesEnAttente: 0,
  depensesAVerifier: 0,
  soldeCents: 0,
};

describe('calculerSerenite — complétude administrative du foyer', () => {
  it('foyer entièrement configuré et à jour : 100 %', () => {
    const s = calculerSerenite(parfait);
    expect(s.pourcentage).toBe(100);
    expect(s.libelle).toBe('Tout est à jour');
    expect(s.restant).toEqual([]);
  });

  it('foyer vierge : 0 %, et tous les points d’attention listés', () => {
    const s = calculerSerenite({
      deuxParents: false, auMoinsUnEnfant: false, rythmeDefini: false,
      depensesEnAttente: 2, depensesAVerifier: 1, soldeCents: 1200,
    });
    expect(s.pourcentage).toBe(0);
    expect(s.libelle).toBe('Foyer à compléter');
    expect(s.restant).toHaveLength(6);
  });

  it('un solde non nul coûte 10 points mais laisse le foyer « presque à jour »', () => {
    const s = calculerSerenite({ ...parfait, soldeCents: 479 });
    expect(s.pourcentage).toBe(90);
    expect(s.libelle).toBe('Tout est à jour');
    expect(s.restant).toEqual(['Un montant reste à régulariser']);
  });

  it('le signe du solde n’a aucune influence : seul l’équilibre compte', () => {
    expect(calculerSerenite({ ...parfait, soldeCents: 479 }).pourcentage)
      .toBe(calculerSerenite({ ...parfait, soldeCents: -479 }).pourcentage);
  });

  it('parent seul, sans enfant ni rythme : score plancher malgré des comptes propres', () => {
    const s = calculerSerenite({
      ...parfait, deuxParents: false, auMoinsUnEnfant: false, rythmeDefini: false,
    });
    expect(s.pourcentage).toBe(35);
    expect(s.libelle).toBe('Foyer à compléter');
  });

  it('des dépenses en attente font passer sous les 90 %', () => {
    const s = calculerSerenite({ ...parfait, depensesEnAttente: 1 });
    expect(s.pourcentage).toBe(85);
    expect(s.libelle).toBe('Presque à jour');
  });

  it('le score reste toujours borné entre 0 et 100', () => {
    const cas: EtatFoyer[] = [
      parfait,
      { ...parfait, depensesEnAttente: 999, depensesAVerifier: 999, soldeCents: -99999 },
    ];
    for (const c of cas) {
      const p = calculerSerenite(c).pourcentage;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('ne dépend jamais de l’identité des parents : aucune comparaison entre eux', () => {
    // Contrat structurel : EtatFoyer n'expose aucun identifiant de parent,
    // donc le score ne peut pas opposer l'un à l'autre.
    const interdits = ['parentA', 'parentB', 'parent1', 'parent2', 'moi', 'autre', 'pere', 'mere'];
    const cles = Object.keys(parfait);
    expect(cles.filter((k) => interdits.includes(k))).toEqual([]);
    expect(cles.filter((k) => /Id$/.test(k))).toEqual([]);
  });
});
