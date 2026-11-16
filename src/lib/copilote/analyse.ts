/**
 * Analyse des ventes : ce qui marche, ce qui stagne, ce qui se vend ensemble.
 *
 * Pure et déterministe : mêmes ventes, même date, même résultat. Rien ici ne
 * lit la base ni l'horloge.
 *
 * GARDE-FOUS, TOUS DÉLIBÉRÉS (les mêmes que la boucle marketing, bilan.ts)
 *
 *  1. Rien n'est conclu sous trois ventes. Un produit vendu deux fois n'est ni
 *     un succès ni un échec : il n'est pas encore mesuré.
 *  2. Les comparaisons se font sur 28 jours, pas sur 7. Une semaine de
 *     produits numériques, c'est souvent trois ventes : y lire une tendance
 *     reviendrait à commenter un tirage au sort.
 *  3. Les montants ne sont jamais additionnés entre devises. Le chiffre
 *     d'affaires est donné dans la devise la plus fréquente ; les autres sont
 *     listées à part plutôt que converties à un taux inventé.
 */

import { normaliser } from './csv';
import { referenceDepuisTitre } from './import';
import { ajouterJours, ecartJours } from './dates';
import type { PlateformeBoutique, Vente, ProduitCatalogue, ReleveVues } from './types';

export const MINIMUM_VENTES = 3;
export const SEUIL_VUES = 100;
export const CONVERSION_FAIBLE = 0.01;
export const JOURS_SANS_VENTE = 45;
/** Deux titres sont le même produit au-delà de cette ressemblance. */
export const SIMILARITE_MEME_PRODUIT = 0.6;

export type StatutProduit =
  'moteur' | 'en_hausse' | 'stagne' | 'faible_conversion' | 'stable' | 'trop_tot';

export interface FicheProduit {
  /** Identifiant stable du produit, toutes plateformes confondues. */
  cle: string;
  titre: string;
  plateformes: PlateformeBoutique[];
  unitesParPlateforme: Partial<Record<PlateformeBoutique, number>>;
  unites7: number;
  unitesPrec7: number;
  unites28: number;
  unitesPrec28: number;
  unites90: number;
  unitesTotal: number;
  /** Chiffre d'affaires sur 28 jours, dans la devise principale. */
  caCentimes28: number;
  /** Prix moyen observé à la vente, dans la devise principale. */
  prixMoyenCentimes: number | null;
  derniereVente: string | null;
  vues: number | null;
  conversion: number | null;
  statut: StatutProduit;
  motif: string;
  catalogue: ProduitCatalogue[];
}

export interface ChiffresPeriode {
  debut: string;
  fin: string;
  unites: number;
  commandes: number;
  /** Dans la devise principale. */
  caCentimes: number;
  panierMoyenCentimes: number | null;
}

export interface CoAchat {
  a: string;
  b: string;
  commandes: number;
}

export interface Analyse {
  devise: string;
  autresDevises: string[];
  semaine: ChiffresPeriode;
  precedente: ChiffresPeriode;
  /** Variation des unités vendues d'une semaine sur l'autre, en %. */
  evolution: number | null;
  parPlateforme: { plateforme: PlateformeBoutique; unites: number; caCentimes: number }[];
  plateformesActives: PlateformeBoutique[];
  derniereVenteParPlateforme: Partial<Record<PlateformeBoutique, string>>;
  produits: FicheProduit[];
  coAchats: CoAchat[];
  totalVentes: number;
}

// ---------- Ressemblance des titres ----------

/** Mots qui ne disent rien du produit : liaisons, formats, années. */
const MOTS_VIDES = new Set([
  'le', 'la', 'les', 'des', 'une', 'un', 'de', 'du', 'et', 'en', 'au', 'aux', 'sur', 'par',
  'pour', 'avec', 'ton', 'ta', 'tes', 'vos', 'votre', 'mon', 'ma', 'mes', 'the', 'and', 'for',
  'your', 'with', 'google', 'sheets', 'sheet', 'excel', 'pdf', 'notion', 'canva', 'template',
  'modele', 'fichier', 'numerique', 'telechargement', 'telecharger', 'digital', 'download',
  'imprimable', 'printable', 'instant', 'version', 'outil', 'tableau',
]);

export function motsSignificatifs(titre: string): string[] {
  return [...new Set(normaliser(titre).split(' ')
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m) && !/^\d+$/.test(m)))];
}

/** Indice de Jaccard entre deux ensembles de mots. */
export function similarite(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sb = new Set(b);
  const communs = a.filter((m) => sb.has(m)).length;
  return communs / (a.length + b.length - communs);
}

// ---------- Regroupement des produits ----------

interface Famille {
  cle: string;
  titre: string;
  mots: string[];
  refs: Set<string>; // « plateforme|produitRef »
}

function regrouperProduits(ventes: Vente[]): { familles: Famille[]; familleDe: Map<string, Famille> } {
  // Un produit par plateforme et référence, titré par sa vente la plus récente.
  const produits = new Map<string, { titre: string; jour: string; unites: number }>();
  for (const v of ventes) {
    const k = `${v.plateforme}|${v.produitRef}`;
    const p = produits.get(k);
    if (!p) produits.set(k, { titre: v.titre, jour: v.venduLe, unites: v.quantite });
    else {
      p.unites += v.quantite;
      if (v.venduLe >= p.jour) { p.titre = v.titre; p.jour = v.venduLe; }
    }
  }

  // Les plus vendus d'abord : ils donnent leur nom à la famille.
  const ordonnes = [...produits.entries()]
    .sort((x, y) => y[1].unites - x[1].unites || x[0].localeCompare(y[0]));
  const familles: Famille[] = [];
  const familleDe = new Map<string, Famille>();
  for (const [k, p] of ordonnes) {
    const mots = motsSignificatifs(p.titre);
    const cible = familles.find((f) =>
      (mots.length === 0 ? referenceDepuisTitre(p.titre) === f.cle
        : similarite(mots, f.mots) >= SIMILARITE_MEME_PRODUIT));
    if (cible) { cible.refs.add(k); familleDe.set(k, cible); continue; }
    const f: Famille = { cle: referenceDepuisTitre(p.titre), titre: p.titre, mots, refs: new Set([k]) };
    familles.push(f);
    familleDe.set(k, f);
  }
  return { familles, familleDe };
}

function meilleureFamille(titre: string, familles: Famille[], seuil: number): Famille | null {
  const mots = motsSignificatifs(titre);
  let meilleure: Famille | null = null;
  let score = seuil;
  for (const f of familles) {
    const s = similarite(mots, f.mots);
    if (s >= score) { meilleure = f; score = s; }
  }
  return meilleure;
}

// ---------- Analyse ----------

function dans(jour: string, debut: string, fin: string): boolean {
  return jour >= debut && jour <= fin;
}

function devisePrincipale(ventes: Vente[]): { devise: string; autres: string[] } {
  const compte = new Map<string, number>();
  for (const v of ventes) compte.set(v.devise, (compte.get(v.devise) ?? 0) + 1);
  const triees = [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { devise: triees[0]?.[0] ?? 'EUR', autres: triees.slice(1).map(([d]) => d) };
}

function chiffres(ventes: Vente[], debut: string, fin: string, devise: string): ChiffresPeriode {
  const v = ventes.filter((x) => dans(x.venduLe, debut, fin));
  const commandes = new Set(v.map((x) => `${x.plateforme}|${x.commande}`)).size;
  const enDevise = v.filter((x) => x.devise === devise);
  const ca = enDevise.reduce((s, x) => s + x.montantCentimes, 0);
  const commandesDevise = new Set(enDevise.map((x) => `${x.plateforme}|${x.commande}`)).size;
  return {
    debut, fin,
    unites: v.reduce((s, x) => s + x.quantite, 0),
    commandes,
    caCentimes: ca,
    panierMoyenCentimes: commandesDevise > 0 ? Math.round(ca / commandesDevise) : null,
  };
}

/** Variation en %, ou null quand la base est nulle (une division n'aurait aucun sens). */
export function variation(actuel: number, precedent: number): number | null {
  if (precedent === 0) return null;
  return Math.round(((actuel - precedent) / precedent) * 100);
}

export function analyser(entree: {
  ventes: Vente[];
  catalogue?: ProduitCatalogue[];
  vues?: ReleveVues[];
  /** Dernier jour de la période analysée (inclus). */
  fin: string;
}): Analyse {
  const { ventes, fin } = entree;
  const catalogue = entree.catalogue ?? [];
  const releves = entree.vues ?? [];
  const { devise, autres } = devisePrincipale(ventes);

  const debut7 = ajouterJours(fin, -6);
  const semaine = chiffres(ventes, debut7, fin, devise);
  const precedente = chiffres(ventes, ajouterJours(fin, -13), ajouterJours(fin, -7), devise);
  const debut28 = ajouterJours(fin, -27);
  const debutPrec28 = ajouterJours(fin, -55);
  const finPrec28 = ajouterJours(fin, -28);
  const debut90 = ajouterJours(fin, -89);

  // ---------- Plateformes ----------
  const derniereVenteParPlateforme: Partial<Record<PlateformeBoutique, string>> = {};
  for (const v of ventes) {
    const d = derniereVenteParPlateforme[v.plateforme];
    if (!d || v.venduLe > d) derniereVenteParPlateforme[v.plateforme] = v.venduLe;
  }
  const plateformesActives = (['etsy', 'payhip', 'gumroad'] as PlateformeBoutique[])
    .filter((p) => ventes.some((v) => v.plateforme === p && dans(v.venduLe, debut90, fin)));
  const parPlateforme = plateformesActives.map((plateforme) => {
    const v = ventes.filter((x) => x.plateforme === plateforme && dans(x.venduLe, debut7, fin));
    return {
      plateforme,
      unites: v.reduce((s, x) => s + x.quantite, 0),
      caCentimes: v.filter((x) => x.devise === devise).reduce((s, x) => s + x.montantCentimes, 0),
    };
  });

  // ---------- Produits ----------
  const { familles, familleDe } = regrouperProduits(ventes);
  const ventesDe = new Map<Famille, Vente[]>();
  for (const v of ventes) {
    const f = familleDe.get(`${v.plateforme}|${v.produitRef}`)!;
    if (!ventesDe.has(f)) ventesDe.set(f, []);
    ventesDe.get(f)!.push(v);
  }

  // Les fiches du catalogue sans aucune vente forment leur propre famille :
  // un produit qui ne se vend pas du tout est justement ce qu'il faut voir.
  const catalogueDe = new Map<Famille, ProduitCatalogue[]>();
  for (const c of catalogue) {
    let f = meilleureFamille(c.titre, familles, 0.5);
    if (!f) {
      f = { cle: referenceDepuisTitre(c.titre), titre: c.titre, mots: motsSignificatifs(c.titre), refs: new Set() };
      familles.push(f);
    }
    if (!catalogueDe.has(f)) catalogueDe.set(f, []);
    catalogueDe.get(f)!.push(c);
  }

  // Dernier relevé de vues par produit, rattaché à sa famille.
  const derniersReleves = new Map<string, ReleveVues>();
  for (const r of releves) {
    const k = `${r.plateforme}|${r.produitRef}`;
    const d = derniersReleves.get(k);
    if (!d || r.releveLe > d.releveLe) derniersReleves.set(k, r);
  }
  const vuesDe = new Map<Famille, ReleveVues[]>();
  for (const [k, r] of derniersReleves) {
    const f = familleDe.get(k) ?? meilleureFamille(r.titre, familles, 0.5);
    if (!f) continue;
    if (!vuesDe.has(f)) vuesDe.set(f, []);
    vuesDe.get(f)!.push(r);
  }

  const unitesEntre = (v: Vente[], d: string, f: string) =>
    v.filter((x) => dans(x.venduLe, d, f)).reduce((s, x) => s + x.quantite, 0);

  const fiches: FicheProduit[] = familles.map((f) => {
    const v = ventesDe.get(f) ?? [];
    const cat = catalogueDe.get(f) ?? [];
    const enDevise = v.filter((x) => x.devise === devise);
    const unitesDevise = enDevise.reduce((s, x) => s + x.quantite, 0);
    const derniereVente = v.reduce<string | null>((m, x) => (!m || x.venduLe > m ? x.venduLe : m), null);
    const titre = v.length > 0
      ? v.reduce((m, x) => (x.venduLe >= m.venduLe ? x : m)).titre
      : f.titre;

    const unitesParPlateforme: Partial<Record<PlateformeBoutique, number>> = {};
    for (const x of v) {
      if (dans(x.venduLe, debut90, fin)) {
        unitesParPlateforme[x.plateforme] = (unitesParPlateforme[x.plateforme] ?? 0) + x.quantite;
      }
    }
    const plateformes = [...new Set([...v.map((x) => x.plateforme), ...cat.map((c) => c.plateforme)])].sort();

    // Conversion : ventes des trente jours qui précèdent le relevé, sur les
    // plateformes relevées seulement, rapportées aux vues de ces mêmes jours.
    const rel = vuesDe.get(f) ?? [];
    let vues: number | null = null;
    let conversion: number | null = null;
    if (rel.length > 0) {
      vues = rel.reduce((s, r) => s + r.vues, 0);
      const vendues = rel.reduce((s, r) => s + unitesEntre(
        v.filter((x) => x.plateforme === r.plateforme), ajouterJours(r.releveLe, -29), r.releveLe), 0);
      conversion = vues > 0 ? vendues / vues : null;
    }

    return {
      cle: f.cle,
      titre,
      plateformes,
      unitesParPlateforme,
      unites7: unitesEntre(v, debut7, fin),
      unitesPrec7: unitesEntre(v, ajouterJours(fin, -13), ajouterJours(fin, -7)),
      unites28: unitesEntre(v, debut28, fin),
      unitesPrec28: unitesEntre(v, debutPrec28, finPrec28),
      unites90: unitesEntre(v, debut90, fin),
      unitesTotal: v.reduce((s, x) => s + x.quantite, 0),
      caCentimes28: enDevise.filter((x) => dans(x.venduLe, debut28, fin))
        .reduce((s, x) => s + x.montantCentimes, 0),
      prixMoyenCentimes: unitesDevise > 0
        ? Math.round(enDevise.reduce((s, x) => s + x.montantCentimes, 0) / unitesDevise)
        : (cat.find((c) => c.prixCentimes !== null && c.devise === devise)?.prixCentimes ?? null),
      derniereVente,
      vues,
      conversion,
      statut: 'stable',
      motif: '',
      catalogue: cat,
    };
  });

  classer(fiches, fin);
  fiches.sort((a, b) => b.unites28 - a.unites28 || b.unitesTotal - a.unitesTotal
    || a.cle.localeCompare(b.cle));

  // ---------- Achats groupés ----------
  const commandes = new Map<string, Set<string>>();
  for (const v of ventes) {
    const k = `${v.plateforme}|${v.commande}`;
    if (!commandes.has(k)) commandes.set(k, new Set());
    commandes.get(k)!.add(familleDe.get(`${v.plateforme}|${v.produitRef}`)!.cle);
  }
  const paires = new Map<string, number>();
  for (const cles of commandes.values()) {
    const l = [...cles].sort();
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const k = `${l[i]}\u0000${l[j]}`;
        paires.set(k, (paires.get(k) ?? 0) + 1);
      }
    }
  }
  const coAchats = [...paires.entries()]
    .map(([k, n]) => { const [a, b] = k.split('\u0000'); return { a, b, commandes: n }; })
    .sort((x, y) => y.commandes - x.commandes || x.a.localeCompare(y.a));

  return {
    devise,
    autresDevises: autres,
    semaine,
    precedente,
    evolution: variation(semaine.unites, precedente.unites),
    parPlateforme,
    plateformesActives,
    derniereVenteParPlateforme,
    produits: fiches,
    coAchats,
    totalVentes: ventes.length,
  };
}

const pourcent = (x: number) => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

/**
 * Attribue un statut à chaque produit, avec sa raison en clair.
 * L'ordre des tests est l'ordre de priorité : une baisse se signale avant
 * un bon rang, parce que c'est elle qui demande d'agir.
 */
function classer(fiches: FicheProduit[], fin: string): void {
  const top = [...fiches]
    .filter((f) => f.unites28 >= MINIMUM_VENTES)
    .sort((a, b) => b.unites28 - a.unites28 || a.cle.localeCompare(b.cle))
    .slice(0, 3)
    .map((f) => f.cle);

  for (const f of fiches) {
    const vuesSuffisantes = f.vues !== null && f.vues >= SEUIL_VUES;
    const joursSansVente = f.derniereVente ? ecartJours(f.derniereVente, fin) : null;

    if (f.unitesTotal < MINIMUM_VENTES && !vuesSuffisantes) {
      f.statut = 'trop_tot';
      f.motif = f.unitesTotal === 0
        ? 'Aucune vente enregistrée pour l’instant.'
        : `${f.unitesTotal} vente${f.unitesTotal > 1 ? 's' : ''} au total : trop tôt pour conclure.`;
    } else if (f.unitesPrec28 >= MINIMUM_VENTES && f.unites28 <= f.unitesPrec28 / 2) {
      f.statut = 'stagne';
      f.motif = `${f.unitesPrec28} → ${f.unites28} ventes d’une période de 28 jours à l’autre.`;
    } else if (f.unitesTotal >= MINIMUM_VENTES && joursSansVente !== null
      && joursSansVente >= JOURS_SANS_VENTE) {
      f.statut = 'stagne';
      f.motif = `Aucune vente depuis ${joursSansVente} jours (${f.unitesTotal} au total).`;
    } else if (top.includes(f.cle)) {
      f.statut = 'moteur';
      f.motif = `${f.unites28} ventes sur 28 jours, parmi les trois premiers.`;
    } else if (vuesSuffisantes && f.conversion !== null && f.conversion < CONVERSION_FAIBLE) {
      f.statut = 'faible_conversion';
      f.motif = `${f.vues} vues pour ${pourcent(f.conversion)} de conversion : la fiche attire mais ne convainc pas.`;
    } else if (f.unites28 >= MINIMUM_VENTES && f.unites28 >= 1.5 * Math.max(1, f.unitesPrec28)) {
      f.statut = 'en_hausse';
      f.motif = `${f.unitesPrec28} → ${f.unites28} ventes d’une période de 28 jours à l’autre.`;
    } else {
      f.statut = 'stable';
      f.motif = `${f.unites28} vente${f.unites28 > 1 ? 's' : ''} sur 28 jours.`;
    }
  }
}
