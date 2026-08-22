import { describe, it, expect } from 'vitest';
import {
  QUESTIONS, recommander, conseilDepenses, libelleEnfants, conseilsRythme,
  type Reponses,
} from '../src/lib/quiz';
import { MODELES } from '../src/lib/rythmes';

/** Jeu de réponses complet, modifiable champ par champ dans chaque cas. */
function reponses(partiel: Partial<Reponses> = {}): Reponses {
  return {
    age: 'grand',
    enfants: 'un',
    depenses: 'oui',
    repartition: 'partagee',
    horaires: 'variables',
    ...partiel,
  };
}

describe('questionnaire', () => {
  it('pose cinq questions, toutes distinctes', () => {
    expect(QUESTIONS).toHaveLength(5);
    const cles = QUESTIONS.map((q) => q.cle);
    expect(new Set(cles).size).toBe(5);
  });

  it('interroge sur l’autre parent sans lui prêter de genre', () => {
    for (const q of QUESTIONS) {
      expect(q.intitule).not.toMatch(/papa|maman|le père|la mère/i);
    }
  });

  it('propose au moins deux options par question, sans doublon de valeur', () => {
    for (const q of QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      const valeurs = q.options.map((o) => o.valeur);
      expect(new Set(valeurs).size).toBe(valeurs.length);
    }
  });

  it('formule les questions sans jargon technique', () => {
    for (const q of QUESTIONS) {
      expect(q.intitule).not.toMatch(/pattern|P1|P2|custody|2-2-5-5/);
      expect(q.intitule.length).toBeGreaterThan(10);
    }
  });
});

describe('recommandation', () => {
  it('renvoie toujours un rythme du catalogue', () => {
    const patterns = MODELES.map((m) => m.pattern);
    for (const age of ['petit', 'grand'] as const) {
      for (const enfants of ['un', 'deux', 'troisPlus'] as const) {
        for (const depenses of ['oui', 'pasEncore', 'non'] as const) {
          for (const repartition of ['partagee', 'principale'] as const) {
            for (const horaires of ['reguliers', 'variables', 'decales'] as const) {
              const r = recommander({ age, enfants, depenses, repartition, horaires });
              expect(patterns).toContain(r.pattern);
              expect(patterns).toContain(r.alternative);
            }
          }
        }
      }
    }
  });

  it('ne conseille jamais son propre rythme en alternative', () => {
    for (const age of ['petit', 'grand'] as const) {
      for (const horaires of ['reguliers', 'variables', 'decales'] as const) {
        const r = recommander(reponses({ age, horaires }));
        expect(r.alternative).not.toBe(r.pattern);
      }
    }
  });

  it('ne fait dépendre le rythme ni du nombre d’enfants ni des dépenses', () => {
    // Ces deux réponses orientent ce qu'on met en avant après le résultat,
    // jamais le rythme lui-même : le conseil doit rester identique.
    const reference = recommander(reponses()).pattern;
    for (const enfants of ['un', 'deux', 'troisPlus'] as const) {
      for (const depenses of ['oui', 'pasEncore', 'non'] as const) {
        expect(recommander(reponses({ enfants, depenses })).pattern)
          .toBe(reference);
      }
    }
  });

  it('respecte une résidence principale chez un parent', () => {
    expect(recommander(reponses({ repartition: 'principale' })).pattern)
      .toBe('alternating_weekends');
  });

  it('propose un cycle libre aux horaires en roulement', () => {
    expect(recommander(reponses({ horaires: 'decales' })).pattern).toBe('custom');
  });

  it('évite les longues séparations avant six ans', () => {
    expect(recommander(reponses({ age: 'petit' })).pattern).toBe('p2233');
  });

  it('fixe les mêmes jours chaque semaine quand les horaires le permettent', () => {
    expect(recommander(reponses({ horaires: 'reguliers' })).pattern).toBe('p2255');
  });

  it('retient l’alternance hebdomadaire dans le cas le plus courant', () => {
    expect(recommander(reponses()).pattern).toBe('alternating_weeks');
  });

  it('justifie chaque conseil en langage courant', () => {
    for (const horaires of ['reguliers', 'variables', 'decales'] as const) {
      const r = recommander(reponses({ horaires }));
      expect(r.raison.length).toBeGreaterThan(40);
      expect(r.raisonAlternative.length).toBeGreaterThan(30);
      expect(r.raison).not.toMatch(/pattern|P1|P2/);
    }
  });
});

describe('suites proposées après le résultat', () => {
  it('donne des bénéfices et un point de vigilance à chaque rythme', () => {
    for (const modele of MODELES) {
      const conseils = conseilsRythme(modele.pattern);
      expect(conseils.benefices.length).toBeGreaterThanOrEqual(2);
      expect(conseils.vigilance.length).toBeGreaterThan(40);
    }
  });

  it('adapte le conseil sur les dépenses à chaque réponse', () => {
    const vues = new Set(
      (['oui', 'pasEncore', 'non'] as const)
        .map((depenses) => conseilDepenses(reponses({ depenses }))),
    );
    expect(vues.size).toBe(3);
    for (const texte of vues) expect(texte.length).toBeGreaterThan(40);
  });

  it('nomme les enfants selon leur nombre', () => {
    expect(libelleEnfants(reponses({ enfants: 'un' }))).toBe('votre enfant');
    expect(libelleEnfants(reponses({ enfants: 'deux' }))).toBe('vos deux enfants');
    expect(libelleEnfants(reponses({ enfants: 'troisPlus' }))).toBe('vos enfants');
  });
});
