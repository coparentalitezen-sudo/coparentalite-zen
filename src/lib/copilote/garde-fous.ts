/**
 * Garde-fous éditoriaux du copilote.
 *
 * Tout texte proposé — idée de produit, titre, description, et demain les
 * contenus rédigés par un modèle de langage — passe par ici avant d'atteindre
 * la file de validation. Trois interdits, non négociables :
 *
 *  1. Aucune promesse de revenus ni d'économies chiffrées.
 *  2. Aucun conseil juridique personnalisé : un modèle de tableau n'est pas
 *     un avocat, et le laisser entendre exposerait l'acheteur comme le vendeur.
 *  3. Le respect des deux parents : rien qui désigne l'autre parent comme un
 *     adversaire. Ces outils servent l'organisation autour de l'enfant.
 *
 * Les motifs ciblent des formulations affirmatives : « ceci n'est pas un
 * conseil juridique » doit rester possible, « vos droits sont » ne l'est pas.
 */

import { normaliser } from './csv';

interface Regle {
  famille: 'revenus' | 'juridique' | 'parents';
  motif: RegExp;
  explication: string;
}

const REGLES: Regle[] = [
  // ---------- 1. Promesses de revenus ----------
  { famille: 'revenus', motif: /\b(gagne[rz]?|gagnez|empoche[rz]?)\b.{0,20}\b(argent|euros?|revenus?)\b/,
    explication: 'promesse de gain d’argent' },
  { famille: 'revenus', motif: /\brevenus? (garanti|passif|assure)/, explication: 'revenu garanti ou passif' },
  { famille: 'revenus', motif: /\b\d+ ?(euros?|eur|k)? ?(par|chaque|\/) ?(mois|jour|semaine|an)\b.{0,15}\b(gagne|revenu|benefice|economi)/,
    explication: 'montant de gain chiffré' },
  { famille: 'revenus', motif: /\b(economise[rz]?|economisez) \d+/, explication: 'économies chiffrées promises' },
  { famille: 'revenus', motif: /\b(devenez|devenir) riche|argent facile|liberte financiere garantie/,
    explication: 'promesse d’enrichissement' },
  { famille: 'revenus', motif: /\bresultats? garantis?\b/, explication: 'résultat garanti' },

  // ---------- 2. Conseil juridique personnalisé ----------
  { famille: 'juridique', motif: /\bvos droits (sont|vous permettent|vous garantissent)/,
    explication: 'affirmation sur les droits du lecteur' },
  { famille: 'juridique', motif: /\b(le|la) juge (vous )?(accordera|donnera|tranchera en votre faveur|decidera en votre faveur)/,
    explication: 'prédiction d’une décision de justice' },
  { famille: 'juridique', motif: /\b(valeur|preuve) (juridique|legale) (garantie|assuree)|\b100 (pour ?cent )?(legal|conforme)/,
    explication: 'garantie de valeur juridique' },
  { famille: 'juridique', motif: /\b(remplace|vaut|evite) (un |votre |l )?avocat/,
    explication: 'se substituer à un avocat' },
  { famille: 'juridique', motif: /\b(gagner|gagnez) (votre|ton|le) (proces|dossier|audience)/,
    explication: 'promesse d’issue judiciaire' },

  // ---------- 3. Respect des deux parents ----------
  { famille: 'parents', motif: /\bex (toxique|manipulat|narcissi|pervers)/, explication: 'qualificatif hostile envers l’autre parent' },
  { famille: 'parents', motif: /\b(pervers )?narcissique/, explication: 'qualificatif hostile envers l’autre parent' },
  { famille: 'parents', motif: /\b(mauvais|pire|faux) (parent|pere|mere)\b/, explication: 'jugement d’un parent' },
  { famille: 'parents', motif: /\bcontre (votre|ton|l autre|son) (ex|parent|pere|mere|conjoint)/,
    explication: 'parent présenté comme adversaire' },
  { famille: 'parents', motif: /\b(prouver|prouvez|demontrer) que (l autre|votre ex|ton ex)/,
    explication: 'constitution de preuves contre l’autre parent' },
  { famille: 'parents', motif: /\b(pieger|piegez|faire payer) (votre|ton|l )?(ex|autre parent)/,
    explication: 'intention de nuire à l’autre parent' },
];

export interface Probleme {
  famille: Regle['famille'];
  explication: string;
  extrait: string;
}

/** Les problèmes d'un texte ; une liste vide signifie qu'il peut être proposé. */
export function verifierTexte(texte: string): Probleme[] {
  const n = normaliser(texte);
  const problemes: Probleme[] = [];
  for (const r of REGLES) {
    const m = n.match(r.motif);
    if (m) problemes.push({ famille: r.famille, explication: r.explication, extrait: m[0] });
  }
  return problemes;
}

/** Vérifie tous les textes d'un objet (récursivement). */
export function verifierObjet(valeur: unknown): Probleme[] {
  if (typeof valeur === 'string') return verifierTexte(valeur);
  if (Array.isArray(valeur)) return valeur.flatMap(verifierObjet);
  if (valeur && typeof valeur === 'object') return Object.values(valeur).flatMap(verifierObjet);
  return [];
}
