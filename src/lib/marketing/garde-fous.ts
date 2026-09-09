/**
 * Interdictions de contenu, appliquées par du code.
 *
 * Trois règles éditoriales existaient déjà, mais seulement sous forme de
 * commentaires dans banque.ts et de mentions dans les pages juridiques : rien
 * ne les faisait respecter. Comme ce dispositif ne passe par aucun modèle de
 * langage — genererSemaine est déterministe —, il n'y a d'ailleurs pas de
 * prompt où les écrire ; l'unique endroit fiable est donc une vérification
 * exécutée avant publication, sur le texte réellement produit.
 *
 *  1. Pas de conseil juridique personnalisé : ce module ne recommande jamais
 *     de consulter un professionnel, il repère l'inverse — une affirmation
 *     présentée comme s'appliquant avec certitude à la situation du lecteur.
 *  2. Pas de promesse de disparition des conflits : la coparentalité ne rend
 *     pas les désaccords impossibles, et le prétendre est un mensonge
 *     publicitaire autant qu'une fausse promesse aux parents qui liraient.
 *  3. Respect des deux parents : aucun contenu ne désigne un parent comme
 *     fautif ni ne prend parti — la même règle que banque.ts s'impose déjà en
 *     commentaire pour la matière écrite à la main.
 *
 * DES EXPRESSIONS PRÉCISES, PAS DES MOTS ISOLÉS
 * Bloquer le mot « loi » ou « conflit » condamnerait des phrases légitimes du
 * dépôt lui-même (« Elle ne donne aucun conseil juridique », CGU). Chaque
 * motif cible donc une affirmation assertive et personnalisée, pas un thème.
 * Ce n'est pas une garantie sémantique complète — un contournement habile
 * resterait possible — mais un filet fiable contre les tournures qui
 * produisent réellement ces trois défauts.
 */

import type { Contenu } from './generateur';

export type CategorieInterdiction =
  | 'conseil_juridique_personnalise'
  | 'promesse_disparition_conflits'
  | 'partialite_parent';

interface Motif {
  categorie: CategorieInterdiction;
  description: string;
  expression: RegExp;
}

const MOTIFS: Motif[] = [
  // ---------- 1. Conseil juridique personnalisé ----------
  {
    categorie: 'conseil_juridique_personnalise',
    description: 'Affirme un droit ou une issue légale comme certaine pour le lecteur.',
    expression: /\b(vous avez( le)? droit a|la loi vous (donne|accorde|garantit|permet)|legalement,? vous (pouvez|devez|obtiendrez)|le juge (vous )?(donnera|accordera|tranchera en votre faveur))\b/,
  },
  {
    categorie: 'conseil_juridique_personnalise',
    description: 'Présente une réponse comme un conseil juridique appliqué au cas du lecteur.',
    expression: /\b(voici (le |votre )?conseil juridique|dans votre cas,? la loi|votre avocat vous dira)\b/,
  },
  // ---------- 2. Promesse de disparition des conflits ----------
  {
    categorie: 'promesse_disparition_conflits',
    description: 'Promet la disparition ou l’absence totale de conflit.',
    expression: /\b(plus (aucun|jamais de) conflit|(fini(e)?(s)?|disparait(ront)?|elimine[znt]*|supprime[znt]*) (les |vos |tous les )?(conflits|disputes|tensions|desaccords)|sans (aucun )?conflit|zero conflit)\b/,
  },
  // ---------- 3. Respect des deux parents ----------
  {
    categorie: 'partialite_parent',
    description: 'Désigne un parent comme fautif ou prend parti contre lui.',
    expression: /\b(lautre parent (a tort|ment|est fautif|ne comprend rien)|(mauvais|mechant|meilleur) parent|prouvez que lautre parent|contre lautre parent|votre ex (a tort|ment))\b/,
  },
];

/**
 * Les interdictions, en phrases lisibles — dérivées de MOTIFS, jamais
 * réécrites à part.
 *
 * Sert à composer le prompt système de redacteur.ts : la même source décrit
 * ce qu'un texte ne doit pas faire et ce que le code vérifie ensuite, de sorte
 * qu'ajouter une interdiction ici la fait apparaître aux deux endroits sans
 * rien dupliquer.
 */
export const DESCRIPTIONS_INTERDICTIONS: readonly string[] = MOTIFS.map((m) => m.description);

/**
 * Minuscules, sans accents, sans apostrophe : les motifs n'ont à couvrir
 * qu'une seule graphie. L'apostrophe typographique (’) est celle du reste
 * du dépôt (banque.ts, CGU) ; l'ignorer plutôt que la distinguer de la
 * droite évite de manquer une occurrence pour une simple différence de
 * clavier.
 */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0027\u2019\u0060]/g, '')
    .toLowerCase();
}

export interface Violation {
  categorie: CategorieInterdiction;
  description: string;
  champ: string;
  extrait: string;
}

export interface ResultatValidation {
  ok: boolean;
  violations: Violation[];
}

/** Vérifie un texte isolé — utile pour valider un brouillon avant qu'il rejoigne un contenu. */
export function validerTexte(texte: string, champ = 'texte'): Violation[] {
  const normalise = normaliser(texte);
  const violations: Violation[] = [];
  for (const motif of MOTIFS) {
    const trouve = motif.expression.exec(normalise);
    if (trouve) {
      violations.push({
        categorie: motif.categorie, description: motif.description, champ,
        // Extrait du texte normalisé, pas de l'original : la normalisation
        // (accents, apostrophes) ne conserve pas les mêmes indices, un
        // extrait pris dans le texte source à cet index tomberait à côté.
        extrait: normalise.slice(Math.max(0, trouve.index - 20), trouve.index + trouve[0].length + 20).trim(),
      });
    }
  }
  return violations;
}

/**
 * Vérifie un contenu complet, sur tous les textes destinés à être publiés.
 *
 * Appelée avant publication (publication.ts pour Meta, la route pinterest.xml
 * pour Pinterest) : un contenu qui échoue n'est jamais envoyé, quel que soit
 * le mode (validation humaine ou automatique) et quelle que soit la
 * plateforme.
 */
export function validerContenu(contenu: Contenu): ResultatValidation {
  const violations: Violation[] = [
    ...validerTexte(contenu.accroche, 'accroche'),
    ...validerTexte(contenu.legendeInstagram, 'legendeInstagram'),
    ...validerTexte(contenu.legendeFacebook, 'legendeFacebook'),
    ...contenu.pages.flatMap((page, i) => validerTexte(page.texte, `pages[${i}].texte`)),
  ];
  return { ok: violations.length === 0, violations };
}
