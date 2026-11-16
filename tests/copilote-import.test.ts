import { describe, it, expect } from 'vitest';
import {
  lireCsv, lireMontant, lireDate, deduireOrdre, normaliserEntete, deviseEntete,
} from '../src/lib/copilote/csv';
import { importerCsv, detecter } from '../src/lib/copilote/import';

const AUJOURDHUI = '2026-11-16';

// Extraits au format des exports réels, données de clients retirées.
const ETSY_VENTES = [
  'Sale Date,Item Name,Buyer,Quantity,Price,Coupon Code,Item Total,Currency,Transaction ID,Listing ID,Order ID,Variations',
  '11/09/26,"Budget familial &quot;Zen&quot; Google Sheets",X,1,7.90,,7.90,EUR,5001,L100,9001,',
  '11/10/26,Calendrier garde alternée 2026,X,2,5.00,,10.00,EUR,5002,L200,9002,',
  '11/10/26,Budget familial &quot;Zen&quot; Google Sheets,X,1,7.90,,7.90,EUR,5003,L100,9002,',
].join('\n');

const GUMROAD_VENTES = [
  'Purchase ID,Item Name,Buyer Name,Purchase Email,Purchase Date,Sale Price ($),Refunded?,Product ID,Quantity',
  'g1,Planner familial,X,x@x,2026-11-12,9.00,false,P1,1',
  'g2,Planner familial,X,x@x,2026-11-13,9.00,true,P1,1',
].join('\n');

const GENERIQUE_POINT_VIRGULE = [
  'date;plateforme;commande;produit;quantite;montant;devise',
  '13/11/2026;Payhip;PH-1;Tableau de partage des frais;1;6,50;EUR',
  '14/11/2026;payhip;PH-2;Tableau de partage des frais;1;6,50;',
].join('\n');

describe('lecture CSV', () => {
  it('gère guillemets, virgules et retours à la ligne dans un champ', () => {
    const l = lireCsv('a,b\n"x, y","ligne 1\nligne 2"\n');
    expect(l).toEqual([['a', 'b'], ['x, y', 'ligne 1\nligne 2']]);
  });

  it('détecte le point-virgule des exports français', () => {
    expect(lireCsv('a;b\n1,5;2')[1]).toEqual(['1,5', '2']);
  });

  it('retire la marque BOM et les lignes vides', () => {
    expect(lireCsv('﻿a,b\r\n\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('dédouble les guillemets échappés', () => {
    expect(lireCsv('a\n"il a dit ""oui"""')[1][0]).toBe('il a dit "oui"');
  });
});

describe('montants', () => {
  it.each([
    ['12.50', 1250], ['12,50', 1250], ['€12.50', 1250], ['1 234,56', 123456],
    ['1,234.56', 123456], ['1.234,56', 123456], ['7', 700], ['$9.00', 900],
  ])('%s → %i centimes', (brut, attendu) => {
    expect(lireMontant(brut)).toBe(attendu);
  });

  it('refuse un texte', () => {
    expect(lireMontant('gratuit')).toBeNull();
    expect(lireMontant('')).toBeNull();
  });
});

describe('dates', () => {
  it('lit les formats ISO, français, américain et anglais', () => {
    expect(lireDate('2026-11-09 14:03:00', 'jma')).toBe('2026-11-09');
    expect(lireDate('09/11/2026', 'jma')).toBe('2026-11-09');
    expect(lireDate('11/09/26', 'mja')).toBe('2026-11-09');
    expect(lireDate('Nov 9, 2026', 'jma')).toBe('2026-11-09');
  });

  it('refuse une date impossible', () => {
    expect(lireDate('31/02/2026', 'jma')).toBeNull();
    expect(lireDate('hier', 'jma')).toBeNull();
  });

  it('tranche l’ordre jour/mois sur une seule date sans ambiguïté', () => {
    expect(deduireOrdre(['03/04/2026', '25/04/2026'], 'mja')).toBe('jma');
    expect(deduireOrdre(['03/04/2026', '04/25/2026'], 'jma')).toBe('mja');
    expect(deduireOrdre(['03/04/2026'], 'mja')).toBe('mja');
  });
});

describe('en-têtes', () => {
  it('ignore la casse, les accents et la devise entre parenthèses', () => {
    expect(normaliserEntete('Sale Price ($)')).toBe('sale price');
    expect(normaliserEntete('Quantité')).toBe('quantite');
    expect(deviseEntete('Sale Price ($)')).toBe('USD');
    expect(deviseEntete('Prix (€)')).toBe('EUR');
  });
});

describe('détection du format', () => {
  it('reconnaît chaque export', () => {
    const entetes = (csv: string) => lireCsv(csv)[0];
    expect(detecter(entetes(ETSY_VENTES))).toEqual({ source: 'etsy', type: 'ventes' });
    expect(detecter(entetes(GUMROAD_VENTES))).toEqual({ source: 'gumroad', type: 'ventes' });
    expect(detecter(entetes(GENERIQUE_POINT_VIRGULE))).toEqual({ source: 'generique', type: 'ventes' });
    expect(detecter(['TITLE', 'DESCRIPTION', 'PRICE', 'CURRENCY_CODE', 'TAGS']))
      .toEqual({ source: 'etsy', type: 'catalogue' });
    expect(detecter(['produit', 'vues'])).toEqual({ source: 'generique', type: 'vues' });
  });

  it('ne devine pas un format inconnu', () => {
    const r = importerCsv('foo,bar\n1,2', { aujourdhui: AUJOURDHUI });
    expect(r.ventes).toEqual([]);
    expect(r.erreurs[0]).toMatch(/choisis la plateforme/);
  });
});

describe('import des ventes', () => {
  it('Etsy : montant total de ligne, entités décodées, une ligne par article', () => {
    const r = importerCsv(ETSY_VENTES, { aujourdhui: AUJOURDHUI });
    expect(r.source).toBe('etsy');
    expect(r.ventes).toHaveLength(3);
    expect(r.ventes[0]).toMatchObject({
      plateforme: 'etsy', commande: '9001', ligne: '5001', produitRef: 'L100',
      titre: 'Budget familial "Zen" Google Sheets', montantCentimes: 790, venduLe: '2026-11-09',
    });
    expect(r.ventes[1]).toMatchObject({ quantite: 2, montantCentimes: 1000 });
    // Deux articles d'une même commande restent distincts.
    expect(r.ventes[1].commande).toBe(r.ventes[2].commande);
    expect(r.ventes[1].ligne).not.toBe(r.ventes[2].ligne);
  });

  it('Gumroad : écarte les ventes remboursées, devise lue dans l’en-tête', () => {
    const r = importerCsv(GUMROAD_VENTES, { aujourdhui: AUJOURDHUI });
    expect(r.ventes).toHaveLength(1);
    expect(r.ignorees).toBe(1);
    expect(r.ventes[0]).toMatchObject({ plateforme: 'gumroad', devise: 'USD', montantCentimes: 900 });
  });

  it('format générique : plateforme par ligne, montants à la française', () => {
    const r = importerCsv(GENERIQUE_POINT_VIRGULE, { aujourdhui: AUJOURDHUI });
    expect(r.ventes.map((v) => v.plateforme)).toEqual(['payhip', 'payhip']);
    expect(r.ventes[0]).toMatchObject({ montantCentimes: 650, venduLe: '2026-11-13', devise: 'EUR' });
  });

  it('signale une colonne indispensable absente au lieu de deviner', () => {
    const r = importerCsv('date,plateforme,produit\n2026-11-01,etsy,X',
      { source: 'generique', aujourdhui: AUJOURDHUI });
    expect(r.ventes).toEqual([]);
    expect(r.erreurs[0]).toMatch(/montant/);
  });

  it('écarte une ligne illisible sans bloquer les autres', () => {
    const csv = `${GENERIQUE_POINT_VIRGULE}\npas une date;payhip;PH-3;Tableau;1;6,50;EUR`;
    const r = importerCsv(csv, { aujourdhui: AUJOURDHUI });
    expect(r.ventes).toHaveLength(2);
    expect(r.ignorees).toBe(1);
    expect(r.erreurs[0]).toMatch(/Ligne 4/);
  });

  it('sans numéro de commande, un même fichier donne les mêmes clés (pas de doublon)', () => {
    const csv = 'date,plateforme,produit,montant\n2026-11-01,etsy,X,5\n2026-11-01,etsy,X,5';
    const a = importerCsv(csv, { aujourdhui: AUJOURDHUI });
    const b = importerCsv(csv, { aujourdhui: AUJOURDHUI });
    expect(a.ventes.map((v) => v.commande)).toEqual(b.ventes.map((v) => v.commande));
    // Deux achats identiques le même jour restent deux ventes.
    expect(new Set(a.ventes.map((v) => v.commande)).size).toBe(2);
  });
});

describe('export de ventes vide', () => {
  it('un export Etsy sans vente ne lit rien et ne plante pas', () => {
    const r = importerCsv('Sale Date,Item Name,Item Total,Order ID,Listing ID\n', { aujourdhui: AUJOURDHUI });
    expect(r.ventes).toEqual([]);
    expect(r.lignesLues).toBe(0);
  });
});

describe('import du catalogue et des vues', () => {
  it('catalogue Etsy : tags découpés, prix lu', () => {
    const csv = 'TITLE,DESCRIPTION,PRICE,CURRENCY_CODE,TAGS\n'
      + '"Budget familial Google Sheets","Court.",7.90,EUR,"budget,famille,sheets"';
    const r = importerCsv(csv, { aujourdhui: AUJOURDHUI });
    expect(r.catalogue[0]).toMatchObject({
      plateforme: 'etsy', titre: 'Budget familial Google Sheets', prixCentimes: 790,
      tags: ['budget', 'famille', 'sheets'],
    });
  });

  it('vues : date de relevé par défaut au jour de l’import', () => {
    const r = importerCsv('produit;vues;plateforme\nBudget familial;1 250;etsy', { aujourdhui: AUJOURDHUI });
    expect(r.vues[0]).toMatchObject({ vues: 1250, releveLe: AUJOURDHUI, plateforme: 'etsy' });
  });
});
