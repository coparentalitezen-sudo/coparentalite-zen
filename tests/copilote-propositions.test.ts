import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lib/copilote/analyse';
import {
  proposer, themeDe, formatsDe, prixRond, titrePropose, tagsProposes, descriptionProposee, THEMES,
} from '../src/lib/copilote/propositions';
import { verifierTexte, verifierObjet } from '../src/lib/copilote/garde-fous';
import { construireRapport, rapportTexte, rapportHtml, objetCourriel } from '../src/lib/copilote/rapport';
import { ajouterJours } from '../src/lib/copilote/dates';
import type { Vente, ProduitCatalogue, PlateformeBoutique } from '../src/lib/copilote/types';

const FIN = '2026-11-15';
const AUJOURDHUI = '2026-11-16';
let n = 0;

function vente(titre: string, jours: number, o: Partial<Vente> = {}): Vente {
  n++;
  return {
    plateforme: 'etsy' as PlateformeBoutique, commande: `c${n}`, ligne: '',
    produitRef: titre.toLowerCase().replace(/\W+/g, '-'), titre, quantite: 1,
    montantCentimes: 790, devise: 'EUR', venduLe: ajouterJours(FIN, -jours), ...o,
  };
}
const serie = (titre: string, jours: number[], o: Partial<Vente> = {}) => jours.map((j) => vente(titre, j, o));

// Une boutique plausible : un best-seller budget vendu sur Etsy seulement,
// un calendrier daté, un produit en perte de vitesse, un peu de Payhip.
const VENTES: Vente[] = [
  ...serie('Budget familial mensuel Google Sheets', [1, 2, 3, 5, 8, 12, 20, 25]),
  ...serie('Suivi des dépenses du foyer Google Sheets', [2, 4, 9, 14], { montantCentimes: 590 }),
  ...serie('Calendrier de garde alternée 2026', [1, 6, 11, 30, 31], { montantCentimes: 500 }),
  ...serie('Planning repas semaine', [2, 30, 33, 36, 40], { montantCentimes: 400 }),
  ...serie('Carnet de liaison deux maisons', [3, 10, 17], { plateforme: 'payhip', produitRef: 'ph1', montantCentimes: 650 }),
];

const CATALOGUE: ProduitCatalogue[] = [{
  plateforme: 'etsy', reference: 'planning-repas', titre: 'Planning repas semaine',
  prixCentimes: 400, devise: 'EUR', tags: ['repas', 'menu'], description: 'Court.',
}];

const analyse = analyser({ ventes: VENTES, catalogue: CATALOGUE, fin: FIN });
const p = proposer(analyse, AUJOURDHUI);

describe('outils de rédaction', () => {
  it('reconnaît le thème d’un produit', () => {
    expect(themeDe('Calendrier de garde alternée 2026')?.id).toBe('coparentalite');
    expect(themeDe('Budget familial mensuel')?.id).toBe('budget');
    expect(themeDe('Planning repas semaine')?.id).toBe('organisation');
    expect(themeDe('Coloriage licorne')).toBeNull();
  });

  it('ne retient que les formats annoncés', () => {
    expect(formatsDe('Budget Google Sheets et Excel')).toEqual(['Google Sheets', 'Excel']);
    expect(formatsDe('Budget familial')).toEqual([]);
  });

  it('arrondit les prix en ,90', () => {
    expect(prixRond(790)).toBe(790);
    expect(prixRond(1000)).toBe(990);
    expect(prixRond(30)).toBe(90);
  });

  it('place le mot-clé en tête, garde les formats connus, respecte 140 caractères', () => {
    const t = titrePropose('Tableau mensuel Google Sheets', THEMES[1], ['Google Sheets', 'Excel']);
    expect(t).toBe('Budget familial – Tableau mensuel Google Sheets | Excel');
    expect(titrePropose('x '.repeat(100), THEMES[1], []).length).toBeLessThanOrEqual(140);
    // Mot-clé déjà présent au début : titre conservé.
    expect(titrePropose('Budget familial mensuel', THEMES[1], [])).toBe('Budget familial mensuel');
  });

  it('propose au plus 13 tags uniques de 20 caractères au plus', () => {
    const tags = tagsProposes(['budget', 'Budget', 'un tag beaucoup trop long pour etsy'], THEMES[1], ['Excel']);
    expect(tags.length).toBeLessThanOrEqual(13);
    expect(tags.filter((t) => t === 'budget')).toHaveLength(1);
    expect(tags.every((t) => t.length <= 20)).toBe(true);
    expect(tags).toContain('excel');
  });

  it('n’invente pas de format : laisse un emplacement à compléter', () => {
    const d = descriptionProposee('Budget familial', THEMES[1], []);
    expect(d).toMatch(/\[à compléter : format du fichier\]/);
    expect(d).not.toMatch(/Excel|Sheets|PDF/);
  });

  it('rappelle qu’un modèle de coparentalité n’est pas un conseil juridique', () => {
    expect(descriptionProposee('X', THEMES[0], [])).toMatch(/ne remplace pas un conseil juridique/);
  });
});

describe('idées de produits', () => {
  it('en propose exactement trois, chacune justifiée', () => {
    expect(p.idees).toHaveLength(3);
    for (const i of p.idees) {
      expect(i.justification.length).toBeGreaterThan(0);
      expect(i.cible).not.toBe('');
    }
  });

  it('propose de publier le best-seller sur l’autre plateforme utilisée', () => {
    const diffusion = p.idees.find((i) => i.nature === 'diffusion');
    expect(diffusion?.titre).toMatch(/Budget familial mensuel.*Payhip/);
    expect(diffusion?.prixSuggereCentimes).toBe(790);
    expect(diffusion?.hypothese).toBe(false);
  });

  it('prépare l’édition suivante d’un produit daté qui se vend', () => {
    const tous = [...p.idees];
    const saison = proposer(analyser({
      ventes: serie('Calendrier de garde alternée 2026', [1, 2, 3, 4]), fin: FIN,
    }), AUJOURDHUI).idees.find((i) => i.nature === 'saison');
    expect(saison?.titre).toMatch(/Édition 2027.*Calendrier de garde alternée 2027/);
    expect(tous.length).toBe(3);
  });

  it('suggère un pack quand deux produits sont achetés ensemble, moins cher que les deux', () => {
    const ventes = [
      vente('Budget familial', 1, { commande: 'K1' }), vente('Suivi épargne objectifs', 1, { commande: 'K1', montantCentimes: 500 }),
      vente('Budget familial', 2, { commande: 'K2' }), vente('Suivi épargne objectifs', 2, { commande: 'K2', montantCentimes: 500 }),
      vente('Budget familial', 3, { commande: 'K3' }), vente('Suivi épargne objectifs', 3, { commande: 'K3', montantCentimes: 500 }),
    ];
    const pack = proposer(analyser({ ventes, fin: FIN }), AUJOURDHUI).idees.find((i) => i.nature === 'pack');
    expect(pack?.justification[0]).toMatch(/3 commandes/);
    expect(pack!.prixSuggereCentimes!).toBeLessThan(790 + 500);
  });

  it('sans ventes, propose quand même trois idées, marquées comme hypothèses', () => {
    const vide = proposer(analyser({ ventes: [], fin: FIN }), AUJOURDHUI);
    expect(vide.idees).toHaveLength(3);
    expect(vide.idees.every((i) => i.hypothese)).toBe(true);
    expect(vide.idees[0].justification.join(' ')).toMatch(/à confirmer/);
  });

  it('ne propose pas de créer un produit qui existe déjà', () => {
    const titres = p.idees.map((i) => i.titre.toLowerCase());
    expect(titres.some((t) => t.startsWith('carnet de liaison'))).toBe(false);
  });

  it('est déterministe', () => {
    expect(proposer(analyse, AUJOURDHUI)).toEqual(p);
  });
});

describe('améliorations de fiches', () => {
  it('en propose trois au plus, la fiche qui stagne en premier', () => {
    expect(p.ameliorations.length).toBeGreaterThan(0);
    expect(p.ameliorations.length).toBeLessThanOrEqual(3);
    expect(p.ameliorations[0].produit).toBe('Planning repas semaine');
  });

  it('chiffre ses constats à partir de la fiche importée', () => {
    const a = p.ameliorations[0];
    expect(a.ficheImportee).toBe(true);
    expect(a.constats.join(' ')).toMatch(/4 → 1 ventes/);
    expect(a.constats.join(' ')).toMatch(/2 tags sur 13/);
    expect(a.constats.join(' ')).toMatch(/Description de 6 caractères/);
    expect(a.titrePropose).toMatch(/^Planner familial – Planning repas semaine/);
    expect(a.tagsProposes.slice(0, 2)).toEqual(['repas', 'menu']);
  });

  it('signale quand la fiche n’a pas été importée', () => {
    const autre = p.ameliorations.find((x) => !x.ficheImportee);
    if (autre) expect(autre.constats.join(' ')).toMatch(/Fiche non importée/);
  });
});

describe('garde-fous', () => {
  it.each([
    'Gagnez de l’argent avec ce planner',
    'Un revenu passif garanti',
    'Économisez 300 € par mois',
    'Vos droits sont protégés avec ce tableau',
    'Le juge vous accordera la garde',
    'Valeur juridique garantie devant le tribunal',
    'Ce modèle remplace un avocat',
    'Pour gérer un ex toxique',
    'Prouvez que l’autre parent ne paie pas',
    'Le pire parent du monde',
    'Organisez-vous contre votre ex',
  ])('refuse « %s »', (texte) => {
    expect(verifierTexte(texte).length).toBeGreaterThan(0);
  });

  it.each([
    'Ce modèle est un outil d’organisation : il ne remplace pas un conseil juridique.',
    'Gagnez du temps chaque semaine',
    'Pour organiser la garde alternée avec l’autre parent',
    'Aucune promesse d’économies : c’est toi qui gardes la main.',
    'Budget familial 2027 – 12 onglets',
  ])('accepte « %s »', (texte) => {
    expect(verifierTexte(texte)).toEqual([]);
  });

  it('aucune proposition générée ne franchit les garde-fous', () => {
    expect(verifierObjet(p)).toEqual([]);
    expect(p.ecartees).toEqual([]);
    for (const t of THEMES) {
      expect(verifierObjet({ ...t, declinaisons: t.declinaisons(2027) })).toEqual([]);
    }
  });

  it('écarte une proposition fautive et le dit', () => {
    const fautif = analyser({ ventes: serie('Gagnez de l’argent avec ce budget', [1, 2, 3, 4]), fin: FIN });
    const r = proposer(fautif, AUJOURDHUI);
    expect(r.ecartees.length).toBeGreaterThan(0);
    expect(verifierObjet(r.idees)).toEqual([]);
    expect(verifierObjet(r.ameliorations)).toEqual([]);
  });
});

describe('rapport hebdomadaire', () => {
  const r = construireRapport({
    semaine: '2026-S47', analyse, propositions: p,
    contenus: [{ accroche: 'Qui garde les enfants à Noël ?', clics: 42, inscriptions: 3 }],
    derniersImports: { etsy: '2026-11-15', payhip: '2026-11-01' },
    aujourdhui: AUJOURDHUI,
  });

  it('donne les chiffres clés de la semaine écoulée', () => {
    expect(r.periode).toEqual({ debut: '2026-11-09', fin: '2026-11-15' });
    expect(r.chiffres.unites).toBe(analyse.semaine.unites);
    expect(r.chiffres.ca).toMatch(/€$/);
  });

  it('propose exactement trois actions, la relance d’export en premier', () => {
    expect(r.actions).toHaveLength(3);
    expect(r.actions[0]).toMatch(/Payhip \(dernier import le 1 nov\.\)/);
  });

  it('cite ce qui a marché, y compris le contenu le plus cliqué', () => {
    expect(r.reussites.join(' ')).toMatch(/Budget familial mensuel/);
    expect(r.reussites.join(' ')).toMatch(/42 clics/);
  });

  it('sans aucune vente, la première action est d’importer', () => {
    const vide = construireRapport({
      semaine: '2026-S47', analyse: analyser({ ventes: [], fin: FIN }),
      propositions: proposer(analyser({ ventes: [], fin: FIN }), AUJOURDHUI),
      contenus: [], derniersImports: {}, aujourdhui: AUJOURDHUI,
    });
    expect(vide.actions[0]).toMatch(/premiers exports/);
    expect(vide.actions).toHaveLength(3);
    expect(vide.reussites[0]).toMatch(/Pas encore assez de données/);
  });

  it('se rend en texte et en HTML échappé', () => {
    const texte = rapportTexte(r);
    expect(texte).toMatch(/LES 3 ACTIONS DE LA SEMAINE/);
    const html = rapportHtml({ ...r, actions: ['<script>x</script>'] }, 'https://exemple.fr/admin/propositions');
    expect(html).not.toMatch(/<script>x/);
    expect(html).toMatch(/&lt;script&gt;/);
    expect(objetCourriel(r)).toMatch(/^Copilote 2026-S47 : \d+ ventes/);
  });

  it('ne promet rien : le rapport passe les garde-fous', () => {
    expect(verifierObjet(r)).toEqual([]);
  });
});
