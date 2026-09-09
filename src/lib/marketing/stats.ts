import { nettoyerValeur } from './utm';
import type { EpingleApi } from './pinterest-api';
import type { ContenuSansPin, ContenuACollecter } from './depot';

/**
 * Boucle d'amélioration Pinterest — logique pure.
 *
 * Séparée de stats-collecte.ts sur le même principe que mesures.ts et
 * bilan.ts vis-à-vis de depot.ts : ce qui touche la base ou le réseau vit
 * ailleurs, ce qui se vérifie sur des valeurs simples vit ici. Les types
 * importés de depot.ts le sont en « import type », effacés à la compilation :
 * ce fichier n'entraîne donc jamais le chargement de depot.ts (et de son
 * garde server-only) au moment de l'exécution, y compris dans les tests.
 */

const AGE_MINIMUM_JOURS = 2;

/** Référence portée par un lien, via son paramètre utm_content. */
export function referenceDuLien(lien: string | null | undefined): string | null {
  if (!lien) return null;
  try {
    const url = new URL(lien);
    const contenu = nettoyerValeur(url.searchParams.get('utm_content'));
    return contenu || null;
  } catch {
    return null;
  }
}

export interface EpingleAssociee {
  reference: string;
  pinId: string;
  creeLe: Date | null;
}

/**
 * Rapproche les épingles retournées par l'API des contenus qui n'ont pas
 * encore d'id connu.
 *
 * Une référence inconnue de nous (mauvais tableau, épingle ajoutée à la main)
 * est silencieusement ignorée : ce module ne mesure que ce qu'il a produit.
 */
export function associerEpingles(
  epingles: EpingleApi[], contenusEnAttente: ContenuSansPin[],
): EpingleAssociee[] {
  const parReference = new Map(contenusEnAttente.map((c) => [c.reference, c]));
  const associees: EpingleAssociee[] = [];

  for (const epingle of epingles) {
    const reference = referenceDuLien(epingle.link);
    if (!reference || !parReference.has(reference)) continue;
    associees.push({
      reference,
      pinId: epingle.id,
      creeLe: epingle.created_at ? new Date(epingle.created_at) : null,
    });
    // Une référence ne se rattache qu'une fois : Pinterest ne devrait jamais
    // créer deux épingles pour le même lien, mais s'il le faisait, la
    // première rencontrée l'emporte plutôt que la dernière au hasard de
    // l'ordre de pagination.
    parReference.delete(reference);
  }

  return associees;
}

/** Âge en jours entiers, jamais négatif : une horloge légèrement décalée ne doit pas produire -1. */
export function joursDepuisPub(creeLe: Date, maintenant: Date): number {
  const jours = Math.floor((maintenant.getTime() - creeLe.getTime()) / 86_400_000);
  return Math.max(0, jours);
}

/** Contenus dont l'épingle est assez ancienne pour être mesurée. */
export function epinglesAMesurer(
  contenus: ContenuACollecter[], maintenant: Date,
): (ContenuACollecter & { jours: number })[] {
  return contenus
    .map((c) => ({ ...c, jours: joursDepuisPub(c.pinCreeLe, maintenant) }))
    .filter((c) => c.jours >= AGE_MINIMUM_JOURS);
}
