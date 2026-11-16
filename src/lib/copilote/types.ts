/** Types partagés du copilote business. */

export type PlateformeBoutique = 'etsy' | 'payhip' | 'gumroad';
export const PLATEFORMES: PlateformeBoutique[] = ['etsy', 'payhip', 'gumroad'];

export const NOMS_PLATEFORMES: Record<PlateformeBoutique, string> = {
  etsy: 'Etsy', payhip: 'Payhip', gumroad: 'Gumroad',
};

/** Un article vendu. Les dates sont au format AAAA-MM-JJ. */
export interface Vente {
  plateforme: PlateformeBoutique;
  commande: string;
  /** Distingue deux articles d'une même commande. */
  ligne: string;
  produitRef: string;
  titre: string;
  quantite: number;
  montantCentimes: number;
  devise: string;
  venduLe: string;
}

/** Une fiche produit telle qu'elle est en ligne. */
export interface ProduitCatalogue {
  plateforme: PlateformeBoutique;
  reference: string;
  titre: string;
  prixCentimes: number | null;
  devise: string;
  tags: string[];
  description: string;
}

/** Vues d'un produit sur les trente jours qui précèdent le relevé. */
export interface ReleveVues {
  plateforme: PlateformeBoutique;
  produitRef: string;
  titre: string;
  vues: number;
  releveLe: string;
}
