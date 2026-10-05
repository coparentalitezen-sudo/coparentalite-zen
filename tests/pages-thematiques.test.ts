import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sitemap from '../src/app/sitemap';
import { BANQUE } from '../src/lib/marketing/banque';
import { genererSemaine, type Contenu } from '../src/lib/marketing/generateur';
import {
  autresPages, pageDeLaNiche, PAGES_THEMATIQUES,
} from '../src/lib/marketing/pages-thematiques';
import { elementsDuContenu, lienEpinglePinterest } from '../src/lib/marketing/pinterest';

const BASE = 'https://coparentalitezen.fr';

function contenuDeLaNiche(niche: string): Contenu {
  const contenu = genererSemaine(new Date('2026-08-17T10:00:00Z'), BASE)[0];
  return { ...contenu, niche, categorie: 'conseil' };
}

describe('table intention → page thématique', () => {
  it('associe chaque intention retenue à sa page', () => {
    expect(pageDeLaNiche('vacances-scolaires')?.chemin).toBe('/vacances-scolaires-parents-separes');
    expect(pageDeLaNiche('depenses-partagees')?.chemin).toBe('/partage-frais-enfants-parents-separes');
    expect(pageDeLaNiche('pension')?.chemin).toBe('/pension-alimentaire-suivi');
    expect(pageDeLaNiche('echange-enfants')?.chemin).toBe('/echange-des-enfants');
    expect(pageDeLaNiche('garde-alternee')?.chemin).toBe('/calendrier-garde-alternee');
  });

  it('ne renvoie rien pour une intention sans page', () => {
    expect(pageDeLaNiche('anniversaires')).toBeNull();
    expect(pageDeLaNiche('inconnue')).toBeNull();
  });

  it('ne référence que des niches réelles de la banque', () => {
    const niches = new Set(BANQUE.map((sujet) => sujet.niche));
    for (const page of PAGES_THEMATIQUES) {
      for (const niche of page.niches) expect(niches).toContain(niche);
    }
  });

  it('ne rattache jamais une niche à deux pages', () => {
    const niches = PAGES_THEMATIQUES.flatMap((page) => page.niches);
    expect(new Set(niches).size).toBe(niches.length);
  });

  it('pointe vers des pages qui existent', () => {
    for (const page of PAGES_THEMATIQUES) {
      expect(existsSync(`src/app${page.chemin}/page.tsx`)).toBe(true);
    }
  });

  it('relie chaque page à toutes les autres', () => {
    for (const page of PAGES_THEMATIQUES) {
      const liees = autresPages(page.chemin).map((p) => p.chemin);
      expect(liees).toHaveLength(PAGES_THEMATIQUES.length - 1);
      expect(liees).not.toContain(page.chemin);
      const source = readFileSync(`src/app${page.chemin}/page.tsx`, 'utf8');
      expect(source).toContain('<PagesLiees');
    }
  });
});

describe('destination des épingles Pinterest', () => {
  it('mène à la page thématique quand l’intention correspond, UTM conservés', () => {
    const contenu = contenuDeLaNiche('pension');
    const lien = new URL(lienEpinglePinterest(BASE, contenu));
    expect(lien.pathname).toBe('/pension-alimentaire-suivi');
    expect(lien.searchParams.get('utm_source')).toBe('pinterest');
    expect(lien.searchParams.get('utm_campaign')).toBe('conseils');
    expect(lien.searchParams.get('utm_content')).toBe(contenu.reference);
  });

  it('garde la page de conseil par défaut', () => {
    const contenu = contenuDeLaNiche('anniversaires');
    const lien = new URL(lienEpinglePinterest(BASE, contenu));
    expect(lien.pathname).toBe(`/conseils/${contenu.reference}`);
    expect(lien.searchParams.get('utm_content')).toBe(contenu.reference);
  });

  it('s’applique au flux réel', () => {
    const [element] = elementsDuContenu(contenuDeLaNiche('echange-enfants'), BASE);
    expect(element.lien).toContain('/echange-des-enfants?');
  });
});

describe('plan du site', () => {
  const urls = sitemap().map((entree) => entree.url);

  it('déclare les pages thématiques', () => {
    for (const page of PAGES_THEMATIQUES) {
      expect(urls).toContain(new URL(page.chemin, BASE).toString());
    }
  });

  it('ne déclare plus les pages de conseil, marquées noindex', () => {
    expect(urls.some((url) => url.includes('/conseils/'))).toBe(false);
    const source = readFileSync('src/app/conseils/[reference]/page.tsx', 'utf8');
    expect(source).toContain('robots: { index: false');
  });
});
