/**
 * Suivi d'origine par paramètres UTM.
 *
 * Ce qui est mesuré : combien de personnes ont ouvert l'application depuis un
 * contenu donné, et combien s'y sont inscrites. Rien d'autre. Pas
 * d'identifiant, pas d'adresse IP, pas d'empreinte de navigateur.
 *
 * C'est ce choix qui rend le comptage possible sans bandeau de consentement :
 * il n'y a personne à reconnaître, seulement des occurrences à additionner.
 *
 * Les valeurs viennent d'une URL publique, donc de n'importe qui. Elles sont
 * traitées comme hostiles : jeu de caractères restreint, longueur bornée,
 * valeurs par défaut si absentes.
 */

export interface Origine {
  source: string;
  campagne: string;
  contenu: string;
}

/** Longueur maximale retenue, identique à la borne posée en base. */
const LONGUEUR_MAX = 64;

/**
 * Normalise une valeur reçue d'une URL.
 *
 * Seuls lettres, chiffres, tiret, tiret bas et point survivent. Un paramètre
 * fantaisiste devient ainsi une chaîne courte et inoffensive plutôt qu'un
 * texte arbitraire recopié dans un tableau de bord.
 */
export function nettoyerValeur(brut: string | null | undefined): string {
  if (!brut) return '';
  return brut
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, LONGUEUR_MAX);
}

/**
 * Extrait l'origine d'une chaîne de requête.
 *
 * Renvoie null si aucune source n'est indiquée : une visite directe n'a pas
 * d'origine, et lui en inventer une fausserait tous les comptages.
 */
export function lireOrigine(recherche: string | URLSearchParams): Origine | null {
  const params = typeof recherche === 'string'
    ? new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche)
    : recherche;

  const source = nettoyerValeur(params.get('utm_source'));
  if (!source) return null;

  return {
    source,
    // Une source sans campagne ni contenu reste exploitable ; on la range
    // sous une valeur explicite plutôt que sous une chaîne vide, qui se
    // confondrait avec une donnée manquante à la lecture.
    campagne: nettoyerValeur(params.get('utm_campaign')) || 'inconnue',
    contenu: nettoyerValeur(params.get('utm_content')) || 'inconnu',
  };
}

/**
 * Construit le lien à placer dans une légende ou une biographie.
 *
 * Le medium est constant : ces publications ne sont jamais sponsorisées.
 */
export function construireLien(
  base: string,
  origine: Origine,
  chemin = '/',
): string {
  const url = new URL(chemin, base);
  url.searchParams.set('utm_source', nettoyerValeur(origine.source));
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', nettoyerValeur(origine.campagne) || 'acquisition');
  url.searchParams.set('utm_content', nettoyerValeur(origine.contenu) || 'inconnu');
  return url.toString();
}
