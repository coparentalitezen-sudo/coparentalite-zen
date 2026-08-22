import { describe, it, expect } from 'vitest';
import { genererSemaine, semaineIso, sujetsDeLaSemaine, CADENCE, APPEL_ACTION } from '../src/lib/marketing/generateur';
import { BANQUE } from '../src/lib/marketing/banque';
import { planifierVisuel } from '../src/lib/marketing/visuel';
import { QUESTIONS } from '../src/lib/quiz';

const BASE = 'https://coparentalitezen.fr';
const LUNDI = new Date('2026-08-17T10:00:00Z');

describe('numéro de semaine', () => {
  it('compte selon la norme ISO', () => {
    expect(semaineIso(new Date('2026-01-01T12:00:00Z'))).toBe(1);
    expect(semaineIso(new Date('2026-08-17T12:00:00Z'))).toBe(34);
  });
});

describe('génération d’une semaine', () => {
  const semaine = genererSemaine(LUNDI, BASE);

  it('produit sept contenus', () => {
    expect(semaine).toHaveLength(7);
  });

  it('respecte la cadence : trois Reels, deux carrousels, deux publications', () => {
    const compte = (f: string) => semaine.filter((c) => c.format === f).length;
    expect(compte('reel')).toBe(3);
    expect(compte('carrousel')).toBe(2);
    expect(compte('publication')).toBe(2);
  });

  it('attribue à chaque jour le format prévu par la cadence', () => {
    for (const c of semaine) expect(c.format).toBe(CADENCE[c.jour]);
  });

  it('couvre les sept jours sans doublon', () => {
    expect(new Set(semaine.map((c) => c.jour)).size).toBe(7);
  });

  it('est reproductible : deux appels donnent le même résultat', () => {
    expect(genererSemaine(LUNDI, BASE)).toEqual(semaine);
  });

  it('donne le même résultat pour deux jours de la même semaine', () => {
    const jeudi = new Date('2026-08-20T18:00:00Z');
    expect(genererSemaine(jeudi, BASE)).toEqual(semaine);
  });

  it('change d’une semaine à l’autre', () => {
    const suivante = genererSemaine(new Date('2026-08-24T10:00:00Z'), BASE);
    expect(suivante.map((c) => c.reference)).not.toEqual(semaine.map((c) => c.reference));
  });

  it('donne à chaque contenu une référence unique et lisible', () => {
    const refs = semaine.map((c) => c.reference);
    expect(new Set(refs).size).toBe(7);
    for (const r of refs) expect(r).toMatch(/^2026s34-(reel|carrousel|publication)-[1-7]$/);
  });
});

describe('exigences éditoriales de chaque contenu', () => {
  const semaine = genererSemaine(LUNDI, BASE);

  it('porte une accroche non vide', () => {
    for (const c of semaine) expect(c.accroche.length).toBeGreaterThan(10);
  });

  it('porte un texte alternatif, jamais facultatif', () => {
    for (const c of semaine) expect(c.texteAlternatif.length).toBeGreaterThan(20);
  });

  it('compte trois à cinq mots-dièse', () => {
    for (const c of semaine) {
      expect(c.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(c.hashtags.length).toBeLessThanOrEqual(5);
    }
  });

  it('n’expose qu’un seul appel à l’action sur Instagram', () => {
    for (const c of semaine) {
      const occurrences = c.legendeInstagram.split('Lien dans la bio').length - 1;
      expect(occurrences).toBe(1);
    }
  });

  it('reprend l’appel à l’action exigé', () => {
    for (const c of semaine) expect(c.legendeInstagram).toContain(APPEL_ACTION);
  });

  it('ne renvoie jamais vers la bio sur Facebook, où le lien peut figurer', () => {
    for (const c of semaine) {
      expect(c.legendeFacebook).not.toContain('Lien dans la bio');
      expect(c.legendeFacebook).toContain('utm_source=facebook');
      expect(c.legendeFacebook).toContain(`utm_content=${c.reference}`);
    }
  });

  it('distingue les deux plateformes plutôt que de recopier le même texte', () => {
    for (const c of semaine) expect(c.legendeInstagram).not.toBe(c.legendeFacebook);
  });

  it('tient la durée annoncée pour les Reels : vingt à trente-cinq secondes', () => {
    for (const c of semaine.filter((x) => x.format === 'reel')) {
      const total = c.pages.reduce((s, p) => s + (p.secondes ?? 0), 0);
      expect(total).toBeGreaterThanOrEqual(20);
      expect(total).toBeLessThanOrEqual(35);
    }
  });

  it('donne aux carrousels cinq à sept planches', () => {
    for (const c of semaine.filter((x) => x.format === 'carrousel')) {
      expect(c.pages.length).toBeGreaterThanOrEqual(5);
      expect(c.pages.length).toBeLessThanOrEqual(7);
    }
  });
});

describe('répartition éditoriale sur quatre semaines', () => {
  it('approche 40 / 25 / 20 / 10 / 5 sur le cycle complet', () => {
    const contenus = [0, 1, 2, 3].flatMap((n) =>
      genererSemaine(new Date(2026, 0, 5 + n * 7), BASE));
    const part = (c: string) =>
      (contenus.filter((x) => x.categorie === c).length / contenus.length) * 100;

    expect(part('conseil')).toBeGreaterThanOrEqual(35);
    expect(part('conseil')).toBeLessThanOrEqual(45);
    expect(part('quotidien')).toBeGreaterThanOrEqual(20);
    expect(part('demonstration')).toBeGreaterThanOrEqual(15);
    expect(part('marque')).toBeLessThanOrEqual(8);
  });
});

describe('choix des sujets', () => {
  it('fait remonter les sujets de saison', () => {
    const novembre = sujetsDeLaSemaine(11, 42);
    const position = novembre.findIndex((s) => s.niche === 'vacances-scolaires');
    expect(position).toBeLessThan(5);
  });

  it('conserve les quinze sujets', () => {
    expect(sujetsDeLaSemaine(3, 7)).toHaveLength(BANQUE.length);
    expect(BANQUE).toHaveLength(15);
  });
});

describe('garde-fous de la banque', () => {
  it('ne contient aucun chiffre présenté comme une statistique', () => {
    const texte = JSON.stringify(BANQUE);
    expect(texte).not.toMatch(/\d+\s?% des parents/);
  });

  it('donne à chaque sujet trois étapes et plusieurs accroches', () => {
    for (const s of BANQUE) {
      expect(s.etapes).toHaveLength(3);
      expect(s.accroches.length).toBeGreaterThanOrEqual(2);
      expect(s.modele.length).toBeGreaterThanOrEqual(4);
      expect(s.hashtags.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('rattache chaque sujet à une micro-niche distincte', () => {
    expect(new Set(BANQUE.map((s) => s.niche)).size).toBe(BANQUE.length);
  });
});

describe('qualité rédactionnelle', () => {
  const semaine = genererSemaine(LUNDI, BASE);

  it('ne répète jamais deux fois la même phrase dans une légende', () => {
    for (const c of semaine) {
      for (const legende of [c.legendeInstagram, c.legendeFacebook]) {
        const phrases = legende.split('\n\n').map((p) => p.trim()).filter(Boolean);
        expect(new Set(phrases).size).toBe(phrases.length);
      }
    }
  });
});

describe('mise en page des visuels', () => {
  it('choisit les deux seuls formats publiés', () => {
    expect(planifierVisuel({ texte: 'x' }, 'carre')).toMatchObject({ largeur: 1080, hauteur: 1350 });
    expect(planifierVisuel({ texte: 'x' }, 'vertical')).toMatchObject({ largeur: 1080, hauteur: 1920 });
  });

  it('garde un corps lisible sur téléphone, même pour un texte long', () => {
    const long = 'a'.repeat(400);
    expect(planifierVisuel({ texte: long }, 'carre').taille).toBeGreaterThanOrEqual(44);
  });

  it('agrandit les couvertures et les pose sur fond marine', () => {
    const c = planifierVisuel({ texte: 'Chez qui sont les enfants ?', couverture: true }, 'carre');
    expect(c.taille).toBeGreaterThan(planifierVisuel({ texte: 'Chez qui sont les enfants ?' }, 'carre').taille);
    expect(c.fond).toBe('#4E6381');
    expect(c.couleurTexte).toBe('#FFFFFF');
  });

  it('numérote les planches d’un carrousel', () => {
    expect(planifierVisuel({ texte: 'x', rang: { position: 3, total: 6 } }, 'carre').pagination)
      .toBe('3 / 6');
  });

  it('n’affiche pas de pagination hors carrousel', () => {
    expect(planifierVisuel({ texte: 'x' }, 'vertical').pagination).toBeNull();
  });

  it('donne un plan à chaque planche produite cette semaine', () => {
    for (const c of genererSemaine(LUNDI, BASE)) {
      const format = c.format === 'reel' ? 'vertical' : 'carre';
      for (const p of c.pages) {
        const plan = planifierVisuel({ texte: p.texte }, format);
        expect(plan.texte.length).toBeGreaterThan(0);
        expect(plan.taille).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

describe('cohérence de marque', () => {
  it('reprend exactement les couleurs déclarées dans la feuille de style', async () => {
    const css = await (await import('node:fs/promises'))
      .readFile('src/app/globals.css', 'utf8');
    const { COULEURS } = await import('../src/lib/marketing/visuel');
    for (const [jeton, valeur] of [
      ['--color-cream', COULEURS.fond],
      ['--color-ink', COULEURS.encre],
      ['--color-navy', COULEURS.marine],
      ['--color-soft', COULEURS.doux],
    ] as const) {
      expect(css).toContain(`${jeton}: ${valeur};`);
    }
  });
});

describe('influence des poids', () => {
  it('fait remonter une niche renforcée sans évincer les autres', () => {
    const sans = sujetsDeLaSemaine(3, 99);
    const avec = sujetsDeLaSemaine(3, 99, { pension: 3 });
    const rang = (l: typeof sans) => l.findIndex((s) => s.niche === 'pension');
    expect(rang(avec)).toBeLessThanOrEqual(rang(sans));
    expect(avec).toHaveLength(sans.length);
  });

  it('conserve tous les sujets même très affaiblis', () => {
    const poids = Object.fromEntries(BANQUE.map((s) => [s.niche, 0.25]));
    expect(sujetsDeLaSemaine(3, 7, { ...poids, pension: 3 })).toHaveLength(BANQUE.length);
  });

  it('reste déterministe à poids constants', () => {
    expect(genererSemaine(LUNDI, BASE, { pension: 2 }))
      .toEqual(genererSemaine(LUNDI, BASE, { pension: 2 }));
  });
});

describe('polices embarquées', () => {
  it('vit dans un module, jamais lu depuis node_modules à l’exécution', async () => {
    // Vercel n'embarque que ce qu'il détecte comme utilisé : un chemin
    // construit à l'exécution laisse le fichier à terre, et la route échoue
    // en production sur un ENOENT — nulle part ailleurs.
    const fs = await import('node:fs/promises');
    const source = await fs.readFile('src/lib/marketing/rendu.tsx', 'utf8');
    // Les commentaires ont le droit de citer node_modules — c'est même là
    // qu'on explique pourquoi il ne faut pas y toucher. Seul le code compte.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('node_modules');
    expect(code).not.toContain('readFile');
    expect(code).toContain("from '@/polices/inter'");
  });

  it('fournit deux graisses réellement décodables', async () => {
    const { INTER_NORMALE, INTER_GRASSE } = await import('../src/polices/inter');
    for (const police of [INTER_NORMALE, INTER_GRASSE]) {
      const octets = Buffer.from(police, 'base64');
      expect(octets.length).toBeGreaterThan(10000);
      // Signature du format woff, seul lisible par le moteur de rendu.
      expect(octets.subarray(0, 4).toString('ascii')).toBe('wOFF');
    }
  });
});

describe('carrousel du questionnaire', () => {
  /** Le créneau 8 du cycle : la semaine ISO 2 de 2026 le fait tomber. */
  const quiz = [0, 1, 2, 3]
    .flatMap((n) => genererSemaine(new Date(2026, 0, 5 + n * 7), BASE))
    .find((c) => c.categorie === 'quiz');

  it('paraît une fois par cycle de quatre semaines', () => {
    expect(quiz).toBeDefined();
  });

  it('est toujours un carrousel : une image unique ne se parcourt pas', () => {
    expect(quiz!.format).toBe('carrousel');
  });

  it('reprend les questions du questionnaire, sans les recopier', () => {
    for (const q of QUESTIONS) {
      expect(quiz!.pages.some((p) => p.texte.includes(q.intitule))).toBe(true);
    }
  });

  it('mène au questionnaire et non à l’accueil', () => {
    expect(quiz!.legendeFacebook).toContain('/quiz');
  });

  it('n’annonce pas un résultat qu’Instagram ne peut pas calculer', () => {
    // Une publication du fil n'est pas interactive : promettre un résultat
    // « en appuyant » tromperait le lecteur dès la première planche.
    for (const p of quiz!.pages) {
      expect(p.texte).not.toMatch(/appuyez sur|tapez sur|cliquez ici/i);
    }
  });
});

describe('cohérence des niches avec la base', () => {
  it('n’emploie que des niches déclarées dans la banque', () => {
    // marketing_opportunites.niche_id référence marketing_niches par clé
    // étrangère. Une niche inventée dans le générateur ne lève aucune erreur
    // visible : le contenu cesse simplement d'apparaître à la validation.
    const connues = new Set([...BANQUE.map((s) => s.niche), 'marque']);
    const contenus = [0, 1, 2, 3].flatMap((n) =>
      genererSemaine(new Date(2026, 0, 5 + n * 7), BASE));
    for (const c of contenus) {
      expect(connues).toContain(c.niche);
    }
  });
});
