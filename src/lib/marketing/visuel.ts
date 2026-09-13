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
 * Gabarit d'une planche vidéo — une variante propre au diaporama des Reels
 * (video.ts), distincte de planifierVisuel : les planches statiques restent
 * inchangées, format publication comme carrousel.
 *
 * Sur mobile, entre deux Reels, une planche pensée pour être lue (comme une
 * publication) ne retient pas l'œil : le texte y occupe le quart de l'image,
 * le reste reste vide. Ici, une seule idée occupe la majeure partie de la
 * hauteur, sur un fond contrasté — jamais blanc — plutôt que d'être
 * proportionnée à sa longueur comme planifierVisuel le fait pour un texte
 * destiné à être lu posément.
 */
export interface PlanVisuelVideo {
  largeur: number;
  hauteur: number;
  fond: string;
  couleurTexte: string;
  taille: number;
  texte: string;
  signature: string;
  /** Part de la vidéo déjà écoulée à cette planche, entre 0 exclu et 1 inclus — largeur du repère de progression. */
  progression: number;
}

/**
 * Nettement plus grand que tailleTexte : une planche vidéo ne porte qu'une
 * idée courte (au plus quinze mots, imposé par video-contenu.ts), pas un
 * paragraphe à faire tenir. Rien n'empêche donc de viser une taille occupant
 * la majeure partie de la hauteur plutôt que de ménager de la place pour un
 * texte plus long qui n'arrivera jamais ici.
 *
 * Un mot isolé très long — une adresse comme coparentalitezen.fr, dix-neuf
 * caractères sans espace — déborde du cadre bien avant qu'un texte de même
 * longueur totale mais aux mots courts ne le fasse : la taille choisie sur la
 * seule longueur du texte a laissé passer un débordement horizontal réel
 * (planche d'appel à l'action, corrigé après coup). Le plafond ci-dessous est
 * calé sur un rendu réel (satori, la même moteur que rendreVisuelVideo) :
 * un mot de dix-neuf caractères déborde encore à 110px et tient à 90, un mot
 * de vingt-cinq déborde à 90 et tient à 70 — d'où le rapport ~1700 ÷
 * longueur. rendreVisuelVideo ajoute par ailleurs un word-break en dernier
 * recours, pour le cas où un mot futur, plus long encore, dépasserait quand
 * même cette estimation.
 */
export function tailleTexteVideo(texte: string): number {
  const n = texte.length;
  const based = n < 30 ? 170 : n < 60 ? 140 : n < 90 ? 110 : 90;

  const motLePlusLong = Math.max(0, ...texte.split(/\s+/).map((m) => m.length));
  const plafondMot = motLePlusLong > 10 ? Math.floor(1700 / motLePlusLong) : based;

  return Math.max(40, Math.min(based, plafondMot));
}

/**
 * @param position rang de la planche dans la vidéo (1-based)
 * @param total    nombre total de planches de cette vidéo
 */
export function planifierVisuelVideo(texte: string, position: number, total: number): PlanVisuelVideo {
  const { largeur, hauteur } = FORMATS.vertical;
  return {
    largeur,
    hauteur,
    // Marine, pas le fond crème des planches lues : c'est le même contraste
    // que planifierVisuel réserve déjà à une couverture, généralisé ici à
    // toutes les planches vidéo.
    fond: COULEURS.marine,
    couleurTexte: '#FFFFFF',
    taille: tailleTexteVideo(texte),
    texte,
    signature: 'coparentalitezen.fr',
    progression: total > 0 ? Math.min(1, position / total) : 1,
  };
}
