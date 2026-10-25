/**
 * Règle anti-doublon : que faire d'un Short déjà enregistré ?
 *
 * Module pur, séparé de la publication pour être testé sans base ni réseau.
 */

export type Visibilite = 'private' | 'unlisted' | 'public';

/** Au-delà, le Short du jour est abandonné : deux passages par jour, trois jours. */
export const MAX_TENTATIVES = 6;
/** Durée de la réservation : au-delà, une exécution interrompue est considérée morte. */
export const VERROU_MS = 10 * 60_000;

export interface LigneShort {
  id: string;
  cle_idempotence: string;
  statut: 'en_attente' | 'en_cours' | 'publiee' | 'echec' | 'a_verifier';
  tentatives: number;
  verrou_jusqua: string | null;
  session_envoi: string | null;
  taille_octets: number | null;
  video_id: string | null;
  titre: string;
  description: string;
  visibilite_demandee: Visibilite;
  jour: string;
}

export type Decision = 'publier' | 'deja' | 'occupe' | 'a_verifier' | 'abandon';

/** Que faire d'un Short déjà en base ? Pure, pour être testée seule. */
export function decider(ligne: LigneShort, maintenant = Date.now()): Decision {
  if (ligne.statut === 'publiee') return 'deja';
  if (ligne.statut === 'a_verifier') return 'a_verifier';
  if (ligne.statut === 'en_cours' && ligne.verrou_jusqua
      && Date.parse(ligne.verrou_jusqua) > maintenant) return 'occupe';
  if (ligne.tentatives >= MAX_TENTATIVES) return 'abandon';
  return 'publier';
}

