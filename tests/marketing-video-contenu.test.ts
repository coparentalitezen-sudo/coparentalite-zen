import { describe, it, expect } from 'vitest';
import {
  compterMots, decouperTexte, planchesVideo, MOTS_MAX,
  TEXTE_APPEL_VIDEO, SECONDES_APPEL_VIDEO,
} from '../src/lib/marketing/video-contenu';
import { validerTexte } from '../src/lib/marketing/garde-fous';
import { genererSemaine, type Contenu } from '../src/lib/marketing/generateur';

const BASE = 'https://coparentalitezen.fr';

function contenuAvec(pages: Contenu['pages']): Contenu {
  return {
    reference: 'test-1', niche: 'garde-alternee', format: 'reel', categorie: 'conseil',
    accroche: 'Une accroche.', pages,
    legendeInstagram: 'x', legendeFacebook: 'x', texteAlternatif: 'x',
    hashtags: [], appelAction: 'x', jour: 1,
  };
}

describe('compterMots', () => {
  it('compte les mots séparés par un espace', () => {
    expect(compterMots('Un texte de cinq mots ici')).toBe(6);
  });

  it('ignore les espaces multiples et les bords', () => {
    expect(compterMots('  deux   mots  ')).toBe(2);
  });

  it('renvoie zéro pour une chaîne vide', () => {
    expect(compterMots('')).toBe(0);
  });
});

describe('decouperTexte', () => {
  it('laisse un texte de quinze mots ou moins en une seule planche', () => {
    const texte = 'Écrivez le rythme une seule fois : type, date de début, parent qui commence.';
    expect(compterMots(texte)).toBeLessThanOrEqual(MOTS_MAX);
    expect(decouperTexte(texte)).toEqual([texte]);
  });

  it('retrouve les étapes d’un texte assemblé par plansReel (« Puis : »)', () => {
    const texte = 'Notez le rythme une fois. Puis : Vérifiez les deux calendriers. '
      + 'Puis : Ajustez les vacances à part.';
    const segments = decouperTexte(texte);
    expect(segments).toEqual([
      'Notez le rythme une fois.',
      'Vérifiez les deux calendriers.',
      'Ajustez les vacances à part.',
    ]);
    for (const s of segments) expect(compterMots(s)).toBeLessThanOrEqual(MOTS_MAX);
  });

  it('découpe sur les frontières de phrase à défaut de « Puis : »', () => {
    const texte = 'Première idée en une phrase complète et déjà courte. '
      + 'Deuxième idée, elle aussi une phrase complète et courte.';
    const segments = decouperTexte(texte);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatch(/^Première idée/);
    expect(segments[1]).toMatch(/^Deuxième idée/);
  });

  it('tombe sur un découpage brut par mots si une phrase seule dépasse la limite', () => {
    const texte = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(' ');
    const segments = decouperTexte(texte);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(compterMots(s)).toBeLessThanOrEqual(MOTS_MAX);
    expect(segments.join(' ')).toBe(texte);
  });

  it('ignore un texte vide', () => {
    expect(decouperTexte('')).toEqual([]);
  });
});

describe('planchesVideo', () => {
  it('ne découpe pas une planche déjà courte', () => {
    const contenu = contenuAvec([{ titre: 'Accroche', texte: 'Une idée courte et claire.', secondes: 3 }]);
    const planches = planchesVideo(contenu);
    // La planche source, puis l'appel à l'action ajouté automatiquement.
    expect(planches[0]).toMatchObject({ texte: 'Une idée courte et claire.', secondes: 3 });
    expect(planches).toHaveLength(2);
  });

  it('découpe « ce qui aide » en plusieurs planches courtes', () => {
    const contenu = contenuAvec([{
      titre: 'Ce qui aide',
      texte: 'Notez le rythme une fois. Puis : Vérifiez les deux calendriers. '
        + 'Puis : Ajustez les vacances à part.',
      secondes: 14,
    }]);
    const planches = planchesVideo(contenu);
    // Trois étapes retrouvées, plus l'appel à l'action.
    expect(planches.length).toBeGreaterThan(2);
    for (const p of planches) expect(compterMots(p.texte)).toBeLessThanOrEqual(MOTS_MAX);
  });

  it('répartit la durée au prorata du nombre de mots, sans dépasser le total', () => {
    const contenu = contenuAvec([{
      titre: 'Ce qui aide',
      texte: 'Un segment vraiment très court ici. Puis : Un second segment nettement plus long '
        + 'avec beaucoup plus de mots dedans.',
      secondes: 14,
    }]);
    const planches = planchesVideo(contenu).slice(0, -1); // sans l'appel à l'action
    expect(planches.length).toBe(2);
    const total = planches.reduce((s, p) => s + p.secondes, 0);
    // Le plancher (2s minimum) et l'arrondi peuvent faire dériver légèrement
    // le total — vérifié à une seconde près plutôt qu'à l'identique.
    expect(Math.abs(total - 14)).toBeLessThanOrEqual(1);
    expect(planches[1].secondes).toBeGreaterThan(planches[0].secondes);
  });

  it('respecte l’ordre des planches sources', () => {
    const contenu = contenuAvec([
      { titre: 'Accroche', texte: 'Première idée courte.', secondes: 3 },
      { titre: 'Transition', texte: 'Seconde idée courte.', secondes: 5 },
    ]);
    const planches = planchesVideo(contenu);
    expect(planches.map((p) => p.texte)).toEqual([
      'Première idée courte.', 'Seconde idée courte.', TEXTE_APPEL_VIDEO,
    ]);
  });

  it('numérote les planches (position/total) sur l’ensemble, appel à l’action compris', () => {
    const contenu = contenuAvec([
      { titre: 'Accroche', texte: 'Première idée courte.', secondes: 3 },
      { titre: 'Transition', texte: 'Seconde idée courte.', secondes: 5 },
    ]);
    const planches = planchesVideo(contenu);
    expect(planches.map((p) => p.position)).toEqual([1, 2, 3]);
    for (const p of planches) expect(p.total).toBe(3);
  });

  it('ajoute une planche d’appel à l’action à la fin, trois secondes', () => {
    const contenu = contenuAvec([{ titre: 'Accroche', texte: 'Une idée courte.', secondes: 3 }]);
    const planches = planchesVideo(contenu);
    const derniere = planches.at(-1)!;
    expect(derniere.texte).toBe(TEXTE_APPEL_VIDEO);
    expect(derniere.secondes).toBe(SECONDES_APPEL_VIDEO);
  });
});

describe('planche d’appel à l’action', () => {
  it('passe les garde-fous éditoriaux', () => {
    expect(validerTexte(TEXTE_APPEL_VIDEO)).toEqual([]);
  });

  it('tient en quinze mots', () => {
    expect(compterMots(TEXTE_APPEL_VIDEO)).toBeLessThanOrEqual(MOTS_MAX);
  });
});

describe('non-régression sur la production réelle', () => {
  it('aucune planche vidéo, sur un an de semaines, ne dépasse quinze mots', () => {
    const echecs: string[] = [];
    for (let semaine = 0; semaine < 52; semaine++) {
      const date = new Date(Date.UTC(2026, 0, 5 + semaine * 7));
      for (const contenu of genererSemaine(date, BASE)) {
        if (contenu.format !== 'reel') continue;
        for (const planche of planchesVideo(contenu)) {
          if (compterMots(planche.texte) > MOTS_MAX) {
            echecs.push(`${contenu.reference} — "${planche.texte}"`);
          }
        }
      }
    }
    expect(echecs).toEqual([]);
  });
});
