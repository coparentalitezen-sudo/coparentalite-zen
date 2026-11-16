import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  genererContenusProduits, lienSuivi, nomCourt, referenceContenu, type ProduitDiffusable,
} from '../src/lib/copilote/contenus-produits';
import { verifierObjet } from '../src/lib/copilote/garde-fous';
import { creerFluxPinterest } from '../src/lib/marketing/pinterest';
import { publierReserve, type ContenuReserve } from '../src/lib/marketing/reserve';
import { importerCsv } from '../src/lib/copilote/import';

const BASE = 'https://www.exemple.fr';
const produit = (id: string, titre: string, o: Partial<ProduitDiffusable> = {}): ProduitDiffusable => ({
  id, titre, url: `https://www.etsy.com/fr/listing/${id}/x`, tags: [], description: '', ...o,
});
const PRODUITS = [
  produit('1', 'Budget familial mensuel | Google Sheets & Excel'),
  produit('2', 'Calendrier de garde alternée 2027 - imprimable PDF'),
  produit('3', 'Planning repas semaine'),
];
const entree = (semaine: string, lundi: string, produits = PRODUITS) => ({
  produits, semaine, lundi, base: BASE, boutique: 'ParentZenFrance',
});

describe('publications produits', () => {
  const { contenus, ecartes } = genererContenusProduits(entree('2026-S47', '2026-11-16'));

  it('deux publications par semaine, le mardi et le vendredi, sur deux produits différents', () => {
    expect(contenus.map((c) => c.datePublication)).toEqual(['2026-11-17', '2026-11-20']);
    expect(new Set(contenus.map((c) => c.produitId)).size).toBe(2);
    expect(ecartes).toEqual([]);
  });

  it('fait tourner tout le catalogue au fil des semaines', () => {
    const vus = new Set<string>();
    for (const [s, l] of [['2026-S47', '2026-11-16'], ['2026-S48', '2026-11-23'], ['2026-S49', '2026-11-30']]) {
      for (const c of genererContenusProduits(entree(s, l)).contenus) vus.add(c.produitId);
    }
    expect(vus).toEqual(new Set(['1', '2', '3']));
  });

  it('est déterministe, quel que soit l’ordre de lecture des produits', () => {
    const a = genererContenusProduits(entree('2026-S47', '2026-11-16'));
    const b = genererContenusProduits(entree('2026-S47', '2026-11-16', [...PRODUITS].reverse()));
    expect(b).toEqual(a);
  });

  it('références compatibles avec la contrainte en base', () => {
    for (const c of contenus) expect(c.reference).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(referenceContenu('2026-S47', 2)).toBe('p-2026s47-2');
  });

  it('Facebook porte le lien suivi ; Instagram, où il ne serait pas cliquable, le nom de la boutique', () => {
    for (const c of contenus) {
      expect(c.legendeFacebook).toContain(lienSuivi(BASE, c.reference, 'facebook'));
      expect(c.legendeInstagram).not.toMatch(/https?:\/\//);
      expect(c.legendeInstagram).toMatch(/cherche « ParentZenFrance »/);
    }
  });

  it('ne recopie jamais un prix et ne cite que les formats annoncés par la fiche', () => {
    const tout = contenus.map((c) => `${c.legendeInstagram} ${c.legendeFacebook} ${c.descriptionPinterest}`).join(' ');
    expect(tout).not.toMatch(/€|\d+[,.]\d{2}/);
    const seul = genererContenusProduits(entree('2026-S48', '2026-11-23', [produit('9', 'Planning repas semaine')]));
    const textes = JSON.stringify(seul.contenus);
    expect(textes).not.toMatch(/Excel|Sheets|PDF/);
  });

  it('passe les garde-fous', () => {
    for (let s = 1; s <= 12; s++) {
      const r = genererContenusProduits(entree(`2027-S${String(s).padStart(2, '0')}`, '2027-01-04'));
      expect(r.ecartes).toEqual([]);
      expect(verifierObjet(r.contenus)).toEqual([]);
    }
  });

  it('écarte un produit dont le titre franchirait les garde-fous', () => {
    const r = genererContenusProduits(entree('2026-S47', '2026-11-16',
      [produit('x', 'Gagnez de l’argent avec ce budget'), produit('y', 'Revenus passifs garantis')]));
    expect(r.contenus).toEqual([]);
    expect(r.ecartes).toHaveLength(2);
  });

  it('sans lien, aucune publication ; un seul produit, une seule publication', () => {
    expect(genererContenusProduits(entree('2026-S47', '2026-11-16', [produit('1', 'X', { url: '' })])).contenus)
      .toEqual([]);
    expect(genererContenusProduits(entree('2026-S47', '2026-11-16', [PRODUITS[0]])).contenus).toHaveLength(1);
  });

  it('raccourcit le nom affiché sans couper un titre déjà court', () => {
    expect(nomCourt('Budget familial mensuel | Google Sheets & Excel')).toBe('Budget familial mensuel');
    expect(nomCourt('Planning repas semaine')).toBe('Planning repas semaine');
  });

  it('lien suivi : sur notre site, avec la source', () => {
    expect(lienSuivi(BASE, 'p-2026s47-1', 'pinterest')).toBe('https://www.exemple.fr/e/p-2026s47-1?s=pinterest');
  });
});

describe('catalogue : lien et image lus quand l’export les fournit', () => {
  it('reprend une adresse https et ignore le reste', () => {
    const r = importerCsv('TITLE,TAGS,URL,IMAGE1\nBudget,"a,b",https://www.etsy.com/listing/1,http://pas-sur.test/i.jpg',
      { aujourdhui: '2026-11-16' });
    expect(r.catalogue[0]).toMatchObject({ url: 'https://www.etsy.com/listing/1', imageUrl: null });
  });
});

describe('flux Pinterest', () => {
  it('ajoute les épingles produits à côté des contenus existants, échappées', () => {
    const flux = creerFluxPinterest([], BASE, [{
      guid: 'p-2026s47-1', titre: 'Budget & famille', lien: lienSuivi(BASE, 'p-2026s47-1', 'pinterest'),
      description: 'Desc <b>', image: `${BASE}/api/copilote/visuel?ref=p-2026s47-1&f=pinterest&jeton=x`,
      date: new Date('2026-11-17T09:00:00Z'),
    }]);
    expect(flux).toContain('<guid isPermaLink="false">p-2026s47-1</guid>');
    expect(flux).toContain('Budget &amp; famille');
    expect(flux).toContain('Desc &lt;b&gt;');
    expect(flux).toContain('/e/p-2026s47-1?s=pinterest');
    expect(flux).toContain('Tue, 17 Nov 2026 09:00:00 GMT');
  });
});

describe('réserve : légende propre à Facebook', () => {
  beforeEach(() => {
    process.env.META_APP_ID = '111'; process.env.META_PAGE_ID = '222';
    process.env.META_IG_USER_ID = '333'; process.env.META_LONG_LIVED_TOKEN = 'EAAjetonDeTest1234567890';
  });
  afterEach(() => {
    delete process.env.META_APP_ID; delete process.env.META_PAGE_ID;
    delete process.env.META_IG_USER_ID; delete process.env.META_LONG_LIVED_TOKEN;
  });

  const contenu: ContenuReserve = {
    id: 'c1', theme: 'boutique', image_url: 'https://exemple.test/v.jpg',
    legende: 'Légende Instagram sans lien', legende_facebook: 'Légende Facebook https://www.exemple.fr/e/p-1',
    texte_alternatif: 'Alt', statut_instagram: 'publiee', statut_facebook: 'en_attente',
  };

  async function messageFacebook(c: ContenuReserve): Promise<string> {
    const corps: string[] = [];
    const service = {
      rpc: async (nom: string) => ({ data: nom === 'reserve_prochain_contenu' ? c : 'publie', error: null }),
    };
    const requete = async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://exemple.test/')) {
        return new Response('', { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } });
      }
      if (url.includes('/photos')) corps.push(new URLSearchParams(String(init?.body ?? '')).get('message') ?? '');
      const json = url.includes('/me?fields=id') ? { id: '222' } : { id: 'fb-1', post_id: 'fb-1' };
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await publierReserve(service, ['instagram', 'facebook'], requete);
    return corps.join(' ');
  }

  it('Facebook reçoit sa propre légende, avec le lien', async () => {
    expect(await messageFacebook(contenu)).toContain('/e/p-1');
  });

  it('sans légende propre, Facebook reprend la légende commune comme avant', async () => {
    const corps = await messageFacebook({ ...contenu, legende_facebook: null });
    expect(corps).toContain('Légende Instagram sans lien');
  });
});
