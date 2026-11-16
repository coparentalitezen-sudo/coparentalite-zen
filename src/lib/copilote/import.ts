/**
 * Conversion d'un export CSV en ventes, fiches ou relevés de vues.
 *
 * Les colonnes sont reconnues par leur nom, pas par leur position : les
 * plateformes ajoutent ou réordonnent des colonnes sans prévenir, et un
 * import qui lirait la mauvaise colonne produirait des chiffres faux sans la
 * moindre erreur. Une colonne indispensable introuvable arrête l'import et le
 * dit, plutôt que de deviner.
 */

import {
  lireCsv, normaliser, normaliserEntete, deviseEntete, lireMontant,
  lireDate, deduireOrdre, decoderEntites, estVrai, type OrdreDate,
} from './csv';
import type { PlateformeBoutique, Vente, ProduitCatalogue, ReleveVues } from './types';

export type TypeImport = 'ventes' | 'catalogue' | 'vues';
export type SourceImport = PlateformeBoutique | 'generique';

export interface ResultatImport {
  type: TypeImport;
  source: SourceImport;
  lignesLues: number;
  ventes: Vente[];
  catalogue: ProduitCatalogue[];
  vues: ReleveVues[];
  ignorees: number;
  erreurs: string[];
}

/** Au-delà, les erreurs se ressemblent : en lister vingt suffit à comprendre. */
const MAX_ERREURS = 20;

/**
 * Noms possibles de chaque colonne, du plus spécifique au plus général.
 * L'ordre compte : « Item Total » (prix × quantité) passe avant « Price »
 * (prix unitaire), « Order ID » avant « Transaction ID ».
 */
const ALIAS = {
  date: ['sale date', 'date de vente', 'purchase date', 'order date', 'date de commande',
    'date de la commande', 'date paid', 'created at', 'created', 'date'],
  titre: ['item name', 'product name', 'nom du produit', 'produit', 'product', 'article',
    'item', 'titre', 'title'],
  commande: ['order id', 'order number', 'numero de commande', 'id de commande', 'commande',
    'purchase id', 'sale id', 'transaction id', 'order'],
  ligne: ['transaction id', 'line item id', 'id ligne'],
  produitRef: ['listing id', 'product id', 'id produit', 'reference', 'sku', 'product permalink'],
  quantite: ['quantity', 'quantite', 'qty'],
  montant: ['item total', 'sale price', 'montant', 'amount', 'price', 'prix', 'subtotal',
    'total', 'net total'],
  devise: ['currency', 'devise'],
  rembourse: ['refunded', 'refund status', 'rembourse', 'status', 'statut'],
  plateforme: ['plateforme', 'platform', 'boutique'],
  vues: ['vues', 'views', 'visites', 'visits'],
  tags: ['tags', 'mots cles'],
  description: ['description'],
  url: ['url', 'lien', 'listing url', 'lien etsy', 'adresse'],
  image: ['image1', 'image', 'image url', 'photo'],
} as const;

type Champ = keyof typeof ALIAS;

/** Index de colonne de chaque champ, ou -1. */
function reperer(entetes: string[]): Record<Champ, number> {
  const normes = entetes.map(normaliserEntete);
  const resultat = {} as Record<Champ, number>;
  for (const champ of Object.keys(ALIAS) as Champ[]) {
    resultat[champ] = -1;
    for (const alias of ALIAS[champ]) {
      const i = normes.indexOf(alias);
      if (i >= 0) { resultat[champ] = i; break; }
    }
  }
  return resultat;
}

/**
 * Plateforme et nature d'un fichier, d'après ses seuls en-têtes.
 * Rend null quand rien ne permet de trancher : l'opérateur choisit alors.
 */
export function detecter(entetes: string[]): { source: SourceImport; type: TypeImport } | null {
  const n = new Set(entetes.map(normaliserEntete));
  const a = (...noms: string[]) => noms.every((x) => n.has(x));

  if (a('vues') || a('views')) return { source: 'generique', type: 'vues' };
  // Export « Télécharger les données » des fiches Etsy : en-têtes en majuscules.
  if (a('title', 'tags') && !n.has('sale date')) return { source: 'etsy', type: 'catalogue' };
  if (a('sale date', 'item name') || a('listing id', 'order id')) return { source: 'etsy', type: 'ventes' };
  if (n.has('purchase id') || a('item name', 'purchase date')) return { source: 'gumroad', type: 'ventes' };
  if (n.has('plateforme') && (n.has('produit') || n.has('product'))) return { source: 'generique', type: 'ventes' };
  if ([...n].some((x) => x.includes('payhip'))) return { source: 'payhip', type: 'ventes' };
  return null;
}

const ORDRE_PAR_DEFAUT: Record<SourceImport, OrdreDate> = {
  etsy: 'mja', gumroad: 'mja', payhip: 'jma', generique: 'jma',
};

function plateformeDe(brut: string): PlateformeBoutique | null {
  const s = normaliser(brut);
  if (s.includes('etsy')) return 'etsy';
  if (s.includes('payhip')) return 'payhip';
  if (s.includes('gumroad')) return 'gumroad';
  return null;
}

/** Référence stable d'un produit sans identifiant : son titre normalisé. */
export function referenceDepuisTitre(titre: string): string {
  return normaliser(titre).slice(0, 80);
}

/**
 * Importe un fichier.
 *
 * `source` et `type` peuvent être imposés par l'opérateur ; sinon ils sont
 * détectés. `aujourdhui` sert de date de relevé quand un fichier de vues n'en
 * porte pas.
 */
export function importerCsv(
  texte: string,
  options: { source?: SourceImport; type?: TypeImport; aujourdhui: string },
): ResultatImport {
  const lignes = lireCsv(texte);
  const vide = (type: TypeImport, source: SourceImport, erreur: string): ResultatImport => ({
    type, source, lignesLues: 0, ventes: [], catalogue: [], vues: [], ignorees: 0, erreurs: [erreur],
  });
  if (lignes.length < 2) {
    return vide(options.type ?? 'ventes', options.source ?? 'generique',
      'Le fichier ne contient aucune ligne de données.');
  }

  const [entetes, ...donnees] = lignes;
  const detecte = detecter(entetes);
  const type = options.type ?? detecte?.type ?? 'ventes';
  const source = options.source ?? detecte?.source;
  if (!source) {
    return vide(type, 'generique',
      'Format non reconnu : choisis la plateforme dans la liste avant d’importer.');
  }

  const col = reperer(entetes);
  const res: ResultatImport = {
    type, source, lignesLues: donnees.length, ventes: [], catalogue: [], vues: [], ignorees: 0, erreurs: [],
  };
  const erreur = (msg: string) => {
    res.ignorees++;
    if (res.erreurs.length < MAX_ERREURS) res.erreurs.push(msg);
  };
  const lire = (ligne: string[], champ: Champ) =>
    col[champ] >= 0 ? (ligne[col[champ]] ?? '').trim() : '';

  // Plateforme d'une ligne : imposée par le fichier, ou lue dans la colonne
  // « plateforme » du format générique.
  const plateformeLigne = (ligne: string[]): PlateformeBoutique | null =>
    source === 'generique' ? plateformeDe(lire(ligne, 'plateforme')) : source;

  if (type === 'catalogue') {
    if (col.titre < 0) return { ...res, erreurs: ['Colonne du titre introuvable.'] };
    const devise = deviseEntete(entetes[col.montant] ?? '') ?? 'EUR';
    donnees.forEach((ligne, i) => {
      const plateforme = plateformeLigne(ligne) ?? 'etsy';
      const titre = decoderEntites(lire(ligne, 'titre'));
      if (!titre) return erreur(`Ligne ${i + 2} : titre vide.`);
      const tags = lire(ligne, 'tags').split(/[,;]/).map((t) => t.trim()).filter(Boolean);
      res.catalogue.push({
        plateforme,
        reference: lire(ligne, 'produitRef') || referenceDepuisTitre(titre),
        titre,
        prixCentimes: lireMontant(lire(ligne, 'montant')),
        devise: lire(ligne, 'devise').toUpperCase() || devise,
        tags,
        description: decoderEntites(lire(ligne, 'description')),
        url: /^https:\/\//.test(lire(ligne, 'url')) ? lire(ligne, 'url') : null,
        imageUrl: /^https:\/\//.test(lire(ligne, 'image')) ? lire(ligne, 'image') : null,
      });
    });
    return res;
  }

  if (type === 'vues') {
    if (col.titre < 0 || col.vues < 0) {
      return { ...res, erreurs: ['Il faut au moins les colonnes « produit » et « vues ».'] };
    }
    const ordre = deduireOrdre(donnees.map((l) => lire(l, 'date')), ORDRE_PAR_DEFAUT[source]);
    donnees.forEach((ligne, i) => {
      const plateforme = plateformeLigne(ligne) ?? 'etsy';
      const titre = decoderEntites(lire(ligne, 'titre'));
      const vues = Number(lire(ligne, 'vues').replace(/[\s ]/g, ''));
      if (!titre || !Number.isFinite(vues) || vues < 0) {
        return erreur(`Ligne ${i + 2} : produit ou nombre de vues illisible.`);
      }
      const brute = lire(ligne, 'date');
      const releveLe = brute ? lireDate(brute, ordre) : options.aujourdhui;
      if (!releveLe) return erreur(`Ligne ${i + 2} : date « ${brute} » illisible.`);
      res.vues.push({
        plateforme,
        produitRef: lire(ligne, 'produitRef') || referenceDepuisTitre(titre),
        titre, vues: Math.round(vues), releveLe,
      });
    });
    return res;
  }

  // ---------- Ventes ----------
  const manquantes = (['date', 'titre', 'montant'] as const).filter((c) => col[c] < 0);
  if (manquantes.length > 0) {
    const noms = { date: 'date', titre: 'nom du produit', montant: 'montant' };
    return {
      ...res,
      erreurs: [`Colonne(s) introuvable(s) : ${manquantes.map((c) => noms[c]).join(', ')}.`],
    };
  }
  const deviseFichier = deviseEntete(entetes[col.montant]) ?? 'EUR';
  const ordre = deduireOrdre(donnees.map((l) => lire(l, 'date')), ORDRE_PAR_DEFAUT[source]);
  const colLigneDistincte = col.ligne >= 0 && col.ligne !== col.commande;
  const occurrences = new Map<string, number>();

  donnees.forEach((ligne, i) => {
    const n = i + 2;
    const plateforme = plateformeLigne(ligne);
    if (!plateforme) return erreur(`Ligne ${n} : plateforme absente ou inconnue.`);
    if (col.rembourse >= 0 && estVrai(lire(ligne, 'rembourse'))) {
      res.ignorees++;
      return; // Une vente remboursée n'en est pas une : ignorée sans erreur.
    }
    const titre = decoderEntites(lire(ligne, 'titre'));
    if (!titre) return erreur(`Ligne ${n} : nom du produit vide.`);
    const venduLe = lireDate(lire(ligne, 'date'), ordre);
    if (!venduLe) return erreur(`Ligne ${n} : date « ${lire(ligne, 'date')} » illisible.`);
    const montant = lireMontant(lire(ligne, 'montant'));
    if (montant === null || montant < 0) {
      return erreur(`Ligne ${n} : montant « ${lire(ligne, 'montant')} » illisible.`);
    }
    const quantite = Math.max(1, Math.round(Number(lire(ligne, 'quantite')) || 1));
    const produitRef = lire(ligne, 'produitRef') || referenceDepuisTitre(titre);
    // Sans numéro de commande, la vente est identifiée par sa date, son
    // produit et son montant, plus un rang pour deux achats identiques le même
    // jour. Un export qui chevauche le précédent retrouve ainsi les mêmes clés.
    let commande = lire(ligne, 'commande');
    if (!commande) {
      const base = `${venduLe}|${produitRef}|${montant}`;
      const rang = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, rang);
      commande = `${base}|${rang}`;
    }
    res.ventes.push({
      plateforme,
      commande,
      ligne: colLigneDistincte ? lire(ligne, 'ligne') : produitRef,
      produitRef,
      titre,
      quantite,
      montantCentimes: montant,
      devise: lire(ligne, 'devise').toUpperCase() || deviseFichier,
      venduLe,
    });
  });

  if (col.commande < 0 && res.ventes.length > 0) {
    res.erreurs.unshift(
      'Aucune colonne de numéro de commande : les ventes sont reconnues par date, produit et '
      + 'montant. Réimporter le même fichier ne crée pas de doublon.');
  }
  return res;
}
