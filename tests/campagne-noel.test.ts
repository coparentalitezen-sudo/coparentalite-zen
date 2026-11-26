import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { avecAppelNoel, dansCampagneNoel, DEBUT_VIDEOS } from '@/lib/marketing/campagne-noel';
import { legendeFacebook } from '@/lib/marketing/legende-facebook';
import { shortDuJour, descriptionDuShort, lienDuShort } from '@/lib/youtube/short';
import { NOEL, TOUS_LES_SUJETS } from '@/lib/marketing/banque';
import { ETAPES_COURTES, LONGUEUR_MAX_ETAPE_COURTE } from '@/lib/marketing/etapes-courtes';
import { VIGNETTES, VIGNETTE_MAX } from '@/lib/marketing/vignettes';
import { genererSemaine, sujetsDeLaSemaine } from '@/lib/marketing/generateur';
import { lienEpinglePinterest } from '@/lib/marketing/pinterest';
import { scenarioVideo } from '@/lib/marketing/scenario-video';
import { motsDiesePour } from '@/lib/marketing/mots-diese';

const LEGENDE = 'Encore à compter de tête ?\n\nÉcris le rythme une fois. Essaie l’application : lien dans la bio.\n\n#coparentalite #gardealternee #parentsolo #maman #papa';

describe('campagne de Noël : période', () => {
  it('du 12 novembre au 24 décembre, chaque année ; vidéos à partir du 14', () => {
    expect(dansCampagneNoel('2026-11-11')).toBe(false);
    expect(dansCampagneNoel('2026-11-12')).toBe(true);
    expect(dansCampagneNoel('2026-12-24')).toBe(true);
    expect(dansCampagneNoel('2026-12-25')).toBe(false);
    expect(dansCampagneNoel('2027-11-20')).toBe(true);
    expect(dansCampagneNoel('2026-11-13', DEBUT_VIDEOS)).toBe(false);
  });
});

describe('campagne de Noël : légendes', () => {
  it('Instagram : l’appel remplace la phrase « lien dans la bio », avant les mots-dièse, une seule demande', () => {
    const l = avecAppelNoel(LEGENDE, 'instagram', '2026-11-20');
    expect(l).toBe('Encore à compter de tête ?\n\nÉcris le rythme une fois.\n\n🎄 Noël chez qui ? Ton planning gratuit en 1 minute : lien dans la bio.\n\n#coparentalite #gardealternee #parentsolo #maman #papa');
    expect(l.match(/lien dans la bio/g)).toHaveLength(1);
    expect(avecAppelNoel(l, 'instagram', '2026-11-20')).toBe(l);
  });

  it('Facebook : le lien du planning, cliquable, et rien vers la bio', () => {
    const l = legendeFacebook(avecAppelNoel(LEGENDE, 'facebook', '2026-12-01'));
    expect(l).toContain('https://www.coparentalitezen.fr/planning-noel?utm_source=facebook');
    expect(l).toContain('utm_campaign=planning-noel');
    expect(l).not.toMatch(/bio/);
  });

  it('hors campagne, la légende est inchangée', () => {
    expect(avecAppelNoel(LEGENDE, 'instagram', '2026-12-26')).toBe(LEGENDE);
  });

  it('légende sans mots-dièse ni bio : l’appel s’ajoute à la fin', () => {
    expect(avecAppelNoel('Une idée.', 'instagram', '2026-11-20')).toBe('Une idée.\n\n🎄 Noël chez qui ? Ton planning gratuit en 1 minute : lien dans la bio.');
  });
});

describe('campagne de Noël : Shorts', () => {
  it('un jour sur deux du 14 au 24/11 (Shorts déjà rendus), puis Noël chaque jour jusqu’au 24/12', () => {
    const avant = Array.from({ length: 11 }, (_, i) => new Date(Date.UTC(2026, 10, 14 + i)).toISOString().slice(0, 10));
    for (let i = 1; i < avant.length; i++) {
      expect(shortDuJour(avant[i]).sujet.niche === 'noel' && shortDuJour(avant[i - 1]).sujet.niche === 'noel').toBe(false);
    }
    // Les Shorts déjà publiés gardent leur accroche d'origine.
    expect(shortDuJour('2026-11-15').accroche).toBe('Le 24 ou le 25 ? Décide-le à l’avance.');
    expect(shortDuJour('2026-11-21').accroche).toBe('Le 24 ou le 25 ? Décide-le à l’avance.');

    const apres = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 10, 25 + i)).toISOString().slice(0, 10));
    expect(apres.every((j) => shortDuJour(j).sujet.niche === 'noel')).toBe(true);
    // Les onze nouvelles accroches d'abord, puis chacune revient au plus tôt quatorze jours après.
    expect(new Set(apres.slice(0, 11).map((j) => shortDuJour(j).accroche)).size).toBe(11);
    expect(apres.slice(0, 11).map((j) => shortDuJour(j).accroche)).not.toContain(NOEL.accroches[0]);
    const vu = new Map<string, number>();
    apres.forEach((j, i) => {
      const a = shortDuJour(j).accroche;
      if (vu.has(a)) expect(i - vu.get(a)!).toBeGreaterThanOrEqual(14);
      vu.set(a, i);
    });
    expect(VIGNETTES.noel).toHaveLength(NOEL.accroches.length);

    expect(shortDuJour('2026-11-12').sujet.niche).not.toBe('noel');
    expect(shortDuJour('2026-11-13').sujet.niche).not.toBe('noel');
    expect(['2026-12-25', '2026-12-26', '2027-01-10'].map((j) => shortDuJour(j).sujet.niche)).not.toContain('noel');
  });

  it('Short de Noël : lien direct vers le planning ; autres Shorts : appel en deuxième ligne', () => {
    const jourNoel = ['2026-11-14', '2026-11-15'].find((j) => shortDuJour(j).sujet.niche === 'noel')!;
    expect(new URL(lienDuShort(shortDuJour(jourNoel), 'https://www.coparentalitezen.fr')).pathname).toBe('/planning-noel');
    const jourAutre = ['2026-11-14', '2026-11-15'].find((j) => j !== jourNoel)!;
    const d = descriptionDuShort(shortDuJour(jourAutre), 'https://www.coparentalitezen.fr', true).split('\n');
    expect(d[1]).toMatch(/^🎄 Noël chez qui \? .*\/planning-noel\?utm_source=youtube/);
    const avant = descriptionDuShort(shortDuJour('2026-11-11'), 'https://www.coparentalitezen.fr', true);
    expect(avant).not.toContain('planning-noel');
  });
});

describe('campagne de Noël : sujet complet, comme ceux de la banque', () => {
  it('étapes courtes, vignettes, mots-dièse, scénario vidéo', () => {
    expect(ETAPES_COURTES.noel).toHaveLength(3);
    for (const e of ETAPES_COURTES.noel) expect(e.length).toBeLessThanOrEqual(LONGUEUR_MAX_ETAPE_COURTE);
    expect(VIGNETTES.noel).toHaveLength(NOEL.accroches.length);
    for (const v of VIGNETTES.noel) expect(v.length).toBeLessThanOrEqual(VIGNETTE_MAX);
    expect(motsDiesePour('noel')).toContain('#noel');
    expect(TOUS_LES_SUJETS).toContain(NOEL);
    const s = scenarioVideo(NOEL, NOEL.accroches[0], 'yt-2026-11-15');
    expect(JSON.stringify(s)).toContain('Noël chez qui');
  });

  it('aucun vouvoiement dans le sujet de Noël', () => {
    const textes = [...NOEL.accroches, ...NOEL.etapes, NOEL.apport, ...ETAPES_COURTES.noel];
    for (const t of textes) expect(t).not.toMatch(/\b(vous|votre|vos)\b|\b(?!chez\b)[\p{L}]+ez\b/iu);
  });
});

describe('campagne de Noël : semaines et Pinterest', () => {
  it('semaines du 23/11 au 21/12 : le sujet de Noël ouvre la semaine ; avant, rien ne change', () => {
    expect(sujetsDeLaSemaine(11, 1, {}, '2026-11-23')[0]).toBe(NOEL);
    expect(sujetsDeLaSemaine(11, 1, {}, '2026-11-16')).not.toContain(NOEL);
    expect(sujetsDeLaSemaine(12, 1, {}, '2026-12-28')).not.toContain(NOEL);
    expect(genererSemaine(new Date(Date.UTC(2026, 10, 18)), 'https://x.fr').some((c) => c.niche === 'noel')).toBe(false);
    const s48 = genererSemaine(new Date(Date.UTC(2026, 10, 25)), 'https://x.fr');
    const noel = s48.find((c) => c.niche === 'noel');
    expect(noel).toBeTruthy();
    expect(new URL(lienEpinglePinterest('https://x.fr', noel!)).pathname).toBe('/planning-noel');
  });
});
