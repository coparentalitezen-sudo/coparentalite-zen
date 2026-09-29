/**
 * Gabarits visuels.
 *
 * Rendus avec ImageResponse, inclus dans Next.js : aucune dépendance à
 * installer, aucun service à payer, et un rendu identique d'une machine à
 * l'autre puisqu'il ne dépend d'aucun navigateur.
 *
 * Les modèles sont séparés des textes, qui viennent du générateur : produire
 * une nouvelle variation ne demande donc pas de toucher au dessin.
 *
 * Trois contraintes tiennent lieu de charte :
 *   * le texte doit rester lisible sur un écran de téléphone tenu à bout de
 *     bras — d'où des corps de 44 pixels et plus sur 1080 de large ;
 *   * les couleurs sont celles de l'application, pas celles d'une campagne ;
 *   * aucune photographie d'enfant. Le dessin s'en passe entièrement, ce qui
 *     règle la question du droit à l'image avant qu'elle ne se pose.
 */

import type { Contenu } from './generateur';
import { rechercheDuContenu } from './pinterest';

// Reprises telles quelles de globals.css, où elles ont été mesurées sur le
// logo officiel. Les redéfinir ici « à peu près » produirait des visuels
// légèrement décalés de l'application, ce qui se voit dès qu'on les met côte
// à côte.
export const COULEURS = {
  fond: '#FCF9F6',    // --color-cream
  encre: '#101B2C',   // --color-ink
  marine: '#4E6381',  // --color-navy
  doux: '#4A5568',    // --color-soft
  carte: '#FFFFFF',   // --color-card
  // Le corail de l'application, dans ses deux versions : la foncée reste
  // lisible sur le fond crème, la claire sur le fond marine d'une couverture.
  corail: '#A85548',       // --color-coral-text
  corailClair: '#E4A196',  // --color-coral
};

/** Les deux seuls formats publiés. */
export const FORMATS = {
  /** Publications et carrousels. */
  carre: { largeur: 1080, hauteur: 1350 },
  /** Reels et stories. */
  vertical: { largeur: 1080, hauteur: 1920 },
  /** Épingle Pinterest — ratio recommandé 2:3. */
  pinterest: { largeur: 1000, hauteur: 1500 },
} as const;

export type NomFormat = keyof typeof FORMATS;

export interface Planche {
  /** Le texte principal, seul élément que l'œil doit accrocher. */
  texte: string;
  /**
   * Appel à l'action, détaché du texte principal.
   *
   * Séparé plutôt que concaténé : fondu dans le paragraphe, il se lit comme
   * une phrase de plus et personne n'y va. Il est dessiné plus grand, en
   * corail, à l'écart — c'est la seule chose que doit retenir un lecteur
   * arrivé au bout du carrousel.
   */
  appel?: string;
  /** Mention discrète en haut : le sujet, ou le numéro de planche. */
  surtitre?: string;
  /** Rang et total, pour les carrousels : « 3 / 6 ». */
  rang?: { position: number; total: number };
  /** Une couverture s'affiche plus grand et sur fond marine. */
  couverture?: boolean;
}

/**
 * Taille de police adaptée à la longueur du texte.
 *
 * Une taille fixe produit soit des titres minuscules, soit des paragraphes qui
 * débordent. Le calcul reste volontairement grossier : au-delà de trois
 * paliers, on gagne en finesse ce qu'on perd en prévisibilité.
 */
export function tailleTexte(texte: string, couverture: boolean): number {
  const n = texte.length;
  if (couverture) return n < 60 ? 84 : n < 120 ? 64 : 52;
  return n < 90 ? 62 : n < 180 ? 50 : 44;
}

/**
 * Description du visuel, indépendante du moteur de rendu.
 *
 * Cette séparation permet de tester la mise en page — tailles, découpage,
 * mentions — sans produire d'image, donc sans rien qui dépende d'une police
 * ou d'un système de fichiers.
 */
export interface PlanVisuel {
  largeur: number;
  hauteur: number;
  fond: string;
  couleurTexte: string;
  taille: number;
  surtitre: string | null;
  texte: string;
  /** Appel à l'action, ou null si la planche n'en porte pas. */
  appel: string | null;
  /** Nettement plus grand que le texte : c'est ce qui le détache. */
  tailleAppel: number;
  couleurAppel: string;
  pagination: string | null;
  signature: string;
}

export function planifierVisuel(planche: Planche, format: NomFormat): PlanVisuel {
  const { largeur, hauteur } = FORMATS[format];
  const couverture = planche.couverture ?? false;
  const taille = tailleTexte(planche.texte, couverture);
  return {
    largeur,
    hauteur,
    fond: couverture ? COULEURS.marine : COULEURS.fond,
    couleurTexte: couverture ? '#FFFFFF' : COULEURS.encre,
    taille,
    surtitre: planche.surtitre ?? null,
    texte: planche.texte,
    appel: planche.appel ?? null,
    // Un tiers plus grand : assez pour trancher au premier coup d'œil, pas
    // assez pour déborder d'une planche déjà chargée.
    tailleAppel: Math.round(taille * 1.35),
    couleurAppel: couverture ? COULEURS.corailClair : COULEURS.corail,
    pagination: planche.rang ? `${planche.rang.position} / ${planche.rang.total}` : null,
    signature: 'coparentalitezen.fr',
  };
}


/**
 * La planche à dessiner pour un contenu, une page et un format.
 *
 * Sur la couverture d'une épingle, la formulation de recherche remplace
 * l'accroche : Pinterest lit le texte incrusté dans l'image et s'en sert pour
 * classer, si bien qu'un visuel annonçant « planning garde alternée à
 * imprimer » répond à une requête, là où « Vous recomptez les semaines sur vos
 * doigts ? » n'en sert aucune. Les visuels d'Instagram et de Facebook gardent
 * l'accroche, qui y fait exactement ce qu'on attend d'elle : arrêter l'œil
 * dans un fil.
 */
export function plancheVisuel(
  contenu: Contenu, page: number, format: NomFormat,
): Planche {
  const texte = format === 'pinterest' && page === 0
    ? (rechercheDuContenu(contenu) ?? contenu.pages[page].texte)
    : contenu.pages[page].texte;

  return {
    texte,
    appel: contenu.pages[page].appel,
    surtitre: page === 0 ? undefined : contenu.pages[page].titre,
    couverture: page === 0,
    rang: contenu.format === 'carrousel'
      ? { position: page + 1, total: contenu.pages.length }
      : undefined,
  };
}
