import { describe, expect, it } from 'vitest';
import { genererSemaine } from '../src/lib/marketing/generateur';
import {
  contenuPinterest,
  creerFluxPinterest, elementsDuContenu,
  dateDepuisReference,
  lienConseilPinterest,
} from '../src/lib/marketing/pinterest';
import { planifierVisuel } from '../src/lib/marketing/visuel';

const BASE = 'https://coparentalitezen.fr';
const LUNDI = new Date('2026-08-17T10:00:00Z');

describe('références Pinterest durables', () => {
  it('retrouve le lundi de la semaine ISO', () => {
    expect(dateDepuisReference('2026s34-reel-1')?.toISOString().slice(0, 10))
      .toBe('2026-08-17');
  });

  it('refuse une référence arbitraire', () => {
    expect(dateDepuisReference('../../secret')).toBeNull();
    expect(dateDepuisReference('2026s99-reel-1')).toBeNull();
  });

  it('régénère un ancien contenu avec la bonne semaine', () => {
    const contenu = contenuPinterest('2026s34-reel-1', BASE);
    expect(contenu?.reference).toBe('2026s34-reel-1');
  });
});

describe('flux automatique Pinterest', () => {
  const contenus = genererSemaine(LUNDI, BASE).slice(0, 2);
  const flux = creerFluxPinterest(contenus, BASE);

  it('produit un RSS 2.0 avec une image verticale par épingle', () => {
    expect(flux).toContain('<rss version="2.0"');
    // Autant d'images que d'éléments : une épingle sans visuel n'est pas
    // importée par Pinterest.
    const elements = flux.match(/<item>/g)?.length ?? 0;
    expect(elements).toBe(flux.match(/<media:content/g)?.length ?? 0);
    expect(elements).toBe(
      contenus.reduce((n, c) => n + elementsDuContenu(c, BASE).length, 0));
    expect(flux).toContain('/api/marketing/pinterest-visuel?ref=');
  });

  it('envoie vers une page conseil suivie, pas directement vers un paiement', () => {
    const lien = lienConseilPinterest(BASE, contenus[0].reference);
    expect(lien).toContain('/conseils/');
    expect(lien).toContain('utm_source=pinterest');
    expect(lien).toContain(`utm_content=${contenus[0].reference}`);
  });

  it('échappe les caractères réservés du XML', () => {
    const modifie = [{ ...contenus[0], accroche: 'Parents & enfants < sereins' }];
    expect(creerFluxPinterest(modifie, BASE)).toContain('Parents &amp; enfants &lt; sereins');
  });

  it('garde le flux vide valide quand rien n’est encore approuvé', () => {
    const vide = creerFluxPinterest([], BASE);
    expect(vide).toContain('<channel>');
    expect(vide).not.toContain('<item>');
  });

  it('utilise les réglages Pinterest et respecte les deux arrêts d’urgence', async () => {
    const fs = await import('node:fs/promises');
    const route = await fs.readFile('src/app/pinterest.xml/route.ts', 'utf8');

    expect(route).toContain("lireParametresPlateforme('pinterest')");
    expect(route).toContain("publicationAutorisee('pinterest')");
    expect(route).not.toContain('lireParametres()');
  });
});

describe('visuel Pinterest', () => {
  it('respecte le ratio vertical 2:3', () => {
    expect(planifierVisuel({ texte: 'Planning familial', couverture: true }, 'pinterest'))
      .toMatchObject({ largeur: 1000, hauteur: 1500 });
  });
});

describe('épingles du questionnaire', () => {
  const quiz = [0, 1, 2, 3]
    .flatMap((n) => genererSemaine(new Date(2026, 0, 5 + n * 7), BASE))
    .find((c) => c.categorie === 'quiz')!;
  const elements = elementsDuContenu(quiz, BASE);

  it('donne une épingle par question, plus la couverture', () => {
    const questions = quiz.pages.filter((p) => p.titre.startsWith('Question'));
    expect(elements).toHaveLength(questions.length + 1);
  });

  it('écarte la planche qui renvoie au lien de la biographie', () => {
    // « Lien dans la bio » ne veut rien dire sur Pinterest, où le lien est
    // porté par l'épingle.
    for (const e of elements) {
      expect(e.titre).not.toMatch(/lien dans la bio/i);
      expect(e.description).not.toMatch(/lien dans la bio/i);
    }
  });

  it('mène au questionnaire et non à une page conseil', () => {
    for (const e of elements) {
      expect(e.lien).toContain('/quiz');
      expect(e.lien).not.toContain('/conseils/');
      expect(e.lien).toContain('utm_source=pinterest');
    }
  });

  it('distingue chaque épingle : Pinterest écarte les doublons', () => {
    expect(new Set(elements.map((e) => e.titre)).size).toBe(elements.length);
    expect(new Set(elements.map((e) => e.description)).size).toBe(elements.length);
    expect(new Set(elements.map((e) => e.guid)).size).toBe(elements.length);
    expect(new Set(elements.map((e) => e.image)).size).toBe(elements.length);
  });

  it('garde un titre sur une seule ligne', () => {
    for (const e of elements) {
      expect(e.titre).not.toContain('\n');
      expect(e.titre.length).toBeLessThanOrEqual(100);
    }
  });

  it('indique dans l’UTM quelle planche a fait venir la visite', () => {
    expect(elements[1].lien).toContain(`utm_content=${quiz.reference}-p1`);
  });

  it('laisse la couverture à son adresse d’image historique', () => {
    // Les épingles déjà importées pointent dessus : changer l'URL les ferait
    // réimporter comme des doublons.
    expect(elements[0].image).not.toContain('page=');
    expect(elements[1].image).toContain('page=1');
  });
});
