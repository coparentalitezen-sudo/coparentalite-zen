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
 * Origine déduite du site de provenance, quand l'adresse ne porte aucun UTM.
 *
 * Sans cela, une visite venue d'une recherche Google, d'un lien tapé après un
 * Short YouTube (les liens des descriptions de Shorts ne sont pas cliquables)
 * ou d'un partage n'était comptée nulle part, et l'inscription qui suivait
 * n'avait pas d'origine. Seul le nom du site de provenance est retenu, jamais
 * l'adresse complète ; la page d'arrivée sert de « contenu ».
 *
 * Une visite sans site de provenance (adresse tapée, favori, application) ou
 * venant du site lui-même reste sans origine : elle ne se distingue pas du
 * retour d'un parent déjà inscrit.
 */
const IGNORES = /(^|\.)(stripe\.com|supabase\.co|vercel\.app|vercel\.com)$/;
const SITES: [RegExp, string][] = [
  [/^(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|webmail\.|mail\.)/, 'email'],
  [/(^|\.)google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)(duckduckgo\.com|qwant\.com|ecosia\.org|search\.yahoo\.com)$/, 'autre-moteur'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, 'pinterest'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)(chatgpt\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/, 'assistant-ia'],
];
export function origineReferent(referent: string, chemin: string, hoteCourant: string): Origine | null {
  let hote: string;
  try { hote = new URL(referent).hostname.toLowerCase(); } catch { return null; }
  if (!hote) return null;
  const courant = hoteCourant.toLowerCase().replace(/^www\./, '');
  if (hote.replace(/^www\./, '') === courant || IGNORES.test(hote)) return null;
  const trouve = SITES.find(([motif]) => motif.test(hote));
  // Un moteur ou un réseau gagne sur l'IA : gemini.google.com doit compter comme assistant.
  const source = hote === 'gemini.google.com' ? 'assistant-ia' : trouve ? trouve[1] : 'autre-site';
  const page = nettoyerValeur(chemin.replace(/^\/+|\/+$/g, '').replace(/\//g, '.')) || 'accueil';
  return { source, campagne: 'referent', contenu: page };
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

/**
 * Visite à ne pas compter : robot déclaré, navigateur sans tête, outil en ligne
 * de commande, ou requête sans les en-têtes qu'envoie tout vrai navigateur.
 *
 * Constaté avant le 9/11 : chaque Short YouTube recevait deux à quatre « clics »,
 * tous le jour même de sa publication, jamais ensuite. C'est la signature des
 * robots qui vérifient les liens d'une description, pas de spectateurs.
 */
const ROBOT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|python|curl|wget|java\/|go-http|node-fetch|undici|axios|okhttp|httpclient|scrapy|phantomjs|selenium|playwright|puppeteer/i;
export function estRobot(agent: string | null, langue: string | null): boolean {
  if (!agent || !/^Mozilla\//.test(agent)) return true;
  if (ROBOT.test(agent)) return true;
  return !langue;
}
