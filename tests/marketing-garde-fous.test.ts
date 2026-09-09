import { describe, it, expect } from 'vitest';
import { validerTexte, validerContenu } from '../src/lib/marketing/garde-fous';
import { genererSemaine, type Contenu } from '../src/lib/marketing/generateur';

const BASE = 'https://coparentalitezen.fr';

function contenuAvec(champs: Partial<Contenu>): Contenu {
  return {
    reference: 'test-1', niche: 'garde-alternee', format: 'publication', categorie: 'conseil',
    accroche: 'Une accroche neutre.',
    pages: [{ titre: 'Visuel', texte: 'Un texte neutre.' }],
    legendeInstagram: 'Légende neutre.',
    legendeFacebook: 'Légende neutre.',
    texteAlternatif: 'Alt.',
    hashtags: ['#coparentalité'],
    appelAction: 'Découvrez CoparentalitéZen.',
    jour: 1,
    ...champs,
  };
}

describe('conseil juridique personnalisé', () => {
  it('bloque une affirmation de droit présentée comme certaine', () => {
    const v = validerTexte('Vous avez le droit à la garde exclusive.', 'x');
    expect(v).toHaveLength(1);
    expect(v[0].categorie).toBe('conseil_juridique_personnalise');
  });

  it('bloque une réponse présentée comme le conseil juridique du lecteur', () => {
    expect(validerTexte('Dans votre cas, la loi vous donne raison.')).not.toHaveLength(0);
  });

  it('laisse passer un renvoi vers un professionnel', () => {
    expect(validerTexte('Cette application ne remplace pas un conseil juridique professionnel.')).toEqual([]);
  });

  it('laisse passer la mention déjà présente dans banque.ts', () => {
    expect(validerTexte('Elle ne donne aucun conseil juridique.')).toEqual([]);
  });
});

describe('promesse de disparition des conflits', () => {
  it('bloque une promesse d’absence totale de conflit', () => {
    const v = validerTexte('Avec cette application, plus aucun conflit entre parents.');
    expect(v[0].categorie).toBe('promesse_disparition_conflits');
  });

  it('bloque une formulation « fini les disputes »', () => {
    expect(validerTexte('Finies les disputes sur le planning.')).not.toHaveLength(0);
  });

  it('laisse passer une formulation mesurée', () => {
    expect(validerTexte('Un calendrier partagé réduit les malentendus au quotidien.')).toEqual([]);
  });
});

describe('respect des deux parents', () => {
  it('bloque une accusation portée contre l’autre parent', () => {
    const v = validerTexte('Prouvez que l’autre parent a tort sur le planning.');
    expect(v[0].categorie).toBe('partialite_parent');
  });

  it('bloque la désignation d’un « mauvais parent »', () => {
    expect(validerTexte('Ne soyez pas le mauvais parent de l’histoire.')).not.toHaveLength(0);
  });

  it('laisse passer une phrase neutre mentionnant les deux parents', () => {
    expect(validerTexte('Vérifiez que les deux parents regardent bien le même calendrier.')).toEqual([]);
  });
});

describe('validation d’un contenu complet', () => {
  it('accepte un contenu neutre', () => {
    expect(validerContenu(contenuAvec({})).ok).toBe(true);
  });

  it('rejette dès qu’un seul champ viole une règle', () => {
    const r = validerContenu(contenuAvec({ legendeFacebook: 'Plus aucun conflit, promis.' }));
    expect(r.ok).toBe(false);
    expect(r.violations[0].champ).toBe('legendeFacebook');
  });

  it('vérifie aussi les planches, pas seulement les légendes', () => {
    const r = validerContenu(contenuAvec({
      pages: [{ titre: 'Étape 1', texte: 'La loi vous accorde ce droit automatiquement.' }],
    }));
    expect(r.ok).toBe(false);
    expect(r.violations[0].champ).toBe('pages[0].texte');
  });
});

describe('non-régression sur la production réelle', () => {
  it('aucun contenu engendré par la banque de sujets ne déclenche un garde-fou', () => {
    // Un an de semaines, pour couvrir l'ensemble des sujets et de leurs
    // variantes saisonnières plutôt qu'un seul échantillon arbitraire.
    const echecs: string[] = [];
    for (let semaine = 0; semaine < 52; semaine++) {
      const date = new Date(Date.UTC(2026, 0, 5 + semaine * 7));
      for (const contenu of genererSemaine(date, BASE)) {
        const r = validerContenu(contenu);
        if (!r.ok) {
          echecs.push(`${contenu.reference} — ${r.violations.map((v) => v.description).join('; ')}`);
        }
      }
    }
    expect(echecs).toEqual([]);
  });
});
