import { describe, expect, it } from 'vitest';
import { genererSemaine } from '../src/lib/marketing/generateur';
import {
  contenuPinterest,
  creerFluxPinterest,
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

  it('produit un RSS 2.0 avec une image verticale par contenu', () => {
    expect(flux).toContain('<rss version="2.0"');
    expect(flux.match(/<item>/g)).toHaveLength(2);
    expect(flux.match(/<media:content/g)).toHaveLength(2);
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
});

describe('visuel Pinterest', () => {
  it('respecte le ratio vertical 2:3', () => {
    expect(planifierVisuel({ texte: 'Planning familial', couverture: true }, 'pinterest'))
      .toMatchObject({ largeur: 1000, hauteur: 1500 });
  });
});
