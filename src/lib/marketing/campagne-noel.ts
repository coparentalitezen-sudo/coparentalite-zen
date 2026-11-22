/**
 * Campagne de Noël : faire connaître le planning de Noël gratuit (/planning-noel).
 *
 * Décidée avec Sekou le 12/11/2026 (plan « 7 prompts ») : jusqu'au 24
 * décembre, toutes les publications renvoient vers le planning, et un Short
 * sur deux parle de Noël. Tout s'arrête seul le 25 décembre, et reprend
 * l'année suivante aux mêmes dates : aucune date d'année n'est écrite ici.
 *
 * Une seule demande par légende (règle ig-caption) : l'appel au planning
 * remplace la phrase « lien dans la bio » de la légende, il ne s'y ajoute pas.
 * Fonctions pures et idempotentes, appliquées au moment de publier.
 */

import { construireLien } from './utm';

export const NICHE_NOEL = 'noel';
export const CHEMIN_PLANNING_NOEL = '/planning-noel';

/** Légendes : dès le 12 novembre. Vidéos : à partir du 14, les Shorts des 12 et 13 étant déjà rendus. */
const DEBUT_LEGENDES = '11-12';
export const DEBUT_VIDEOS = '11-14';
const FIN = '12-24';
/**
 * À partir du 25/11, un Short de Noël chaque jour (décision du 22/11, d'après
 * les vues : ~900 pour les Shorts de Noël, quelques-unes pour les autres).
 * Les Shorts déjà rendus avant cette date gardent l'alternance d'origine.
 */
export const DEBUT_QUOTIDIEN = '11-25';

/** Rang de l'accroche de Noël du jour : chaque accroche revient le plus tard possible. */
export function rangAccrocheNoel(jour: string, nombre: number): number {
  const debut = Date.parse(`${jour.slice(0, 4)}-${DEBUT_QUOTIDIEN}T12:00:00Z`);
  const jours = Math.round((Date.parse(`${jour}T12:00:00Z`) - debut) / 86_400_000);
  // Les trois premières accroches ont déjà servi entre le 15 et le 21/11 : on commence par les nouvelles.
  const k = jours + 3;
  return ((k % nombre) + nombre) % nombre;
}

const SITE = 'https://www.coparentalitezen.fr';

/** Le jour (AAAA-MM-JJ, heure de Paris) est-il dans la campagne ? */
export function dansCampagneNoel(jour: string, debut: string = DEBUT_LEGENDES): boolean {
  const md = jour.slice(5, 10);
  return md >= debut && md <= FIN;
}

export function jourParis(maintenant = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(maintenant);
}

export function lienPlanningNoel(source: string, contenu: string, base = SITE): string {
  return construireLien(base, { source, campagne: 'planning-noel', contenu }, CHEMIN_PLANNING_NOEL);
}

const ACCROCHE = '🎄 Noël chez qui ? Ton planning gratuit en 1 minute';
const BIO = /lien dans (?:la|ma) bio/iu;
const LIGNE_DIESES = /^(#[\p{L}\p{N}_]+)(\s+#[\p{L}\p{N}_]+)*$/u;

/**
 * La légende, avec l'appel au planning de Noël pendant la campagne.
 *
 * Instagram : « … : lien dans la bio. » (le lien de la bio mène au planning).
 * Facebook : le lien lui-même, cliquable dans le texte.
 * Les phrases qui renvoyaient à la bio sont retirées ; l'appel se place
 * juste avant les mots-dièse.
 */
export function avecAppelNoel(
  legende: string, plateforme: 'instagram' | 'facebook', jour: string = jourParis(),
): string {
  if (!dansCampagneNoel(jour) || legende.includes(ACCROCHE)) return legende;

  const paragraphes = legende.trim().split(/\n{2,}/)
    .map((p) => p.split(/(?<=[.!?…])\s+/).filter((phrase) => !BIO.test(phrase)).join(' ').trim())
    .filter(Boolean);

  const appel = plateforme === 'instagram'
    ? `${ACCROCHE} : lien dans la bio.`
    : `${ACCROCHE} : ${lienPlanningNoel('facebook', 'legende')}`;

  const dernier = paragraphes[paragraphes.length - 1] ?? '';
  if (LIGNE_DIESES.test(dernier)) paragraphes.splice(paragraphes.length - 1, 0, appel);
  else paragraphes.push(appel);
  return paragraphes.join('\n\n');
}
