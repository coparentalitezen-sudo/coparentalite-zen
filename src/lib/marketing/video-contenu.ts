import type { Contenu } from './generateur';
import { validerTexte } from './garde-fous';

/**
 * Planches vidéo — dérivées de contenu.pages, jamais un remplacement.
 *
 * Une planche pensée pour être lue (comme une publication) ne retient pas
 * l'œil sur mobile, entre deux Reels : le texte y occupe le quart de
 * l'image, proportionné à sa longueur plutôt qu'à l'écran. Ici, chaque
 * planche vidéo ne porte qu'une idée courte (quinze mots au plus), dessinée
 * en très grand (rendreVisuelVideo, visuel.ts::planifierVisuelVideo).
 *
 * generateur.ts n'est pas touché : contenu.pages reste la seule source pour
 * les légendes, les garde-fous et le repli en image simple. Ce module ne
 * fait que redécouper ce texte déjà approuvé pour l'écran vidéo — il n'en
 * écrit jamais de nouveau, donc rien n'échappe à la validation déjà faite
 * par validerContenu sur le texte source (publication.ts).
 */

export const MOTS_MAX = 15;
const SECONDES_PLANCHER = 2;

/** Nombre de mots d'un texte, espaces multiples et bords ignorés. */
export function compterMots(texte: string): number {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  return mots.length;
}

/**
 * Découpe un texte en segments d'au plus `motsMax` mots.
 *
 * Trois passes, de la plus fidèle au sens à la plus mécanique :
 *
 *  1. Sur « Puis : » — le séparateur que plansReel (generateur.ts) utilise
 *     pour enchaîner plusieurs étapes dans une seule planche. Chaque étape y
 *     est déjà une idée complète et courte ; la retrouver vaut mieux que la
 *     redécouper au hasard.
 *  2. Sur les frontières de phrase (. ! ?), pour un texte qui n'est pas un
 *     enchaînement d'étapes mais dépasse quand même la limite.
 *  3. Un découpage brut par mots, uniquement si un segment obtenu par les
 *     deux premières passes dépasse encore `motsMax` — une seule phrase
 *     inhabituellement longue, par exemple. Cette passe garantit la limite
 *     dans tous les cas, au prix de couper au milieu d'une idée.
 */
export function decouperTexte(texte: string, motsMax = MOTS_MAX): string[] {
  const nettoye = texte.trim();
  if (!nettoye) return [];
  if (compterMots(nettoye) <= motsMax) return [nettoye];

  const parEtapes = nettoye.split(/\s*Puis\s*:\s*/).map((s) => s.trim()).filter(Boolean);
  const segments = parEtapes.length > 1
    ? parEtapes
    : nettoye.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

  return segments.flatMap((segment) => (
    compterMots(segment) <= motsMax ? [segment] : decouperParMots(segment, motsMax)
  ));
}

/** Dernier recours : groupes de `motsMax` mots, sans égard au sens. */
function decouperParMots(texte: string, motsMax: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const groupes: string[] = [];
  for (let i = 0; i < mots.length; i += motsMax) {
    groupes.push(mots.slice(i, i + motsMax).join(' '));
  }
  return groupes;
}

export interface PlancheVideoTexte {
  texte: string;
  secondes: number;
  /** Position dans la vidéo (1-based) et nombre total de planches — pour le repère de progression. */
  position: number;
  total: number;
}

/**
 * Planche de fin, ajoutée automatiquement à chaque Reel.
 *
 * Un texte fixe, jamais dérivé d'un contenu variable : passée une fois par
 * validerTexte (vérifié ci-dessous et par la non-régression du fichier de
 * test), elle le reste pour toujours. Le garde-fou n'en reste pas moins actif
 * en code — pas seulement relu une fois à l'écriture — au cas où ce texte
 * changerait un jour sans qu'on y repense.
 *
 * « CoparentalitéZen » est volontairement absent : l'adresse le porte déjà,
 * et l'ajouter transformait le texte en deux mots longs côte à côte
 * (« CoparentalitéZen » et « coparentalitezen.fr », seize et dix-neuf
 * caractères) — la combinaison qui avait fait déborder la première version
 * du cadre 1080×1920, même une fois la taille de police réduite pour cette
 * planche (voir tailleTexteVideo, visuel.ts). Un seul mot long reste
 * largement dans les clous.
 */
export const TEXTE_APPEL_VIDEO = 'Rendez-vous sur coparentalitezen.fr';
export const SECONDES_APPEL_VIDEO = 3;

/**
 * Répartit une durée entre plusieurs segments, au prorata de leur nombre de
 * mots — un segment deux fois plus long reste deux fois plus longtemps à
 * l'écran — avec un plancher pour qu'aucun ne se réduise à un flash.
 *
 * Le total peut dériver de quelques centièmes de seconde après arrondi et
 * plancher : sans conséquence pratique, et une seconde décimale de plus
 * n'ajouterait rien de perceptible à l'écran.
 */
function repartirSecondes(segments: string[], secondesTotal: number): number[] {
  if (segments.length === 1) return [secondesTotal];

  const mots = segments.map(compterMots);
  const totalMots = mots.reduce((a, b) => a + b, 0) || 1;
  return mots.map((m) => Math.max(SECONDES_PLANCHER, Math.round((m / totalMots) * secondesTotal)));
}

/**
 * Planches vidéo d'un contenu Reel, dans l'ordre d'affichage — planche
 * d'appel à l'action comprise, en dernière position.
 *
 * Une planche source qui tient déjà en quinze mots produit une seule planche
 * vidéo, à la durée inchangée : la découpe ne s'applique qu'à ce qui en a
 * besoin, comme demandé pour « ce qui aide » — et, par le même mécanisme,
 * pour toute autre planche qui dépasserait la limite.
 *
 * L'appel à l'action n'est ajouté que s'il passe validerTexte : un texte fixe
 * qui échouerait — après une modification malheureuse de la constante,
 * par exemple — est omis plutôt que publié en violation d'un garde-fou.
 * Le reste du Reel n'en est pas empêché pour autant.
 */
export function planchesVideo(contenu: Contenu): PlancheVideoTexte[] {
  const planchesContenu = contenu.pages.flatMap((page) => {
    const segments = decouperTexte(page.texte);
    const secondes = repartirSecondes(segments, page.secondes ?? 0);
    return segments.map((texte, i) => ({ texte, secondes: secondes[i] }));
  });

  const appelValide = validerTexte(TEXTE_APPEL_VIDEO).length === 0;
  const toutes = appelValide
    ? [...planchesContenu, { texte: TEXTE_APPEL_VIDEO, secondes: SECONDES_APPEL_VIDEO }]
    : planchesContenu;

  const total = toutes.length;
  return toutes.map((p, i) => ({ ...p, position: i + 1, total }));
}
