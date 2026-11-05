/**
 * Publication automatique d'une vidéo animée sur une plateforme, sans validation humaine.
 *
 * Les contrôles bloquants du rendu remplacent la validation. Ordre imposé,
 * chaque étape pouvant arrêter la suivante — jamais l'inverse :
 *
 *   1. arrêt d'urgence (réglage global + réglage de la plateforme) ;
 *   2. heure réglée atteinte, jour prévu atteint ;
 *   3. vidéo « prete » avec tous ses contrôles verts (sinon : aucune publication, alerte) ;
 *   4. réservation idempotente : une seule publication par vidéo et par plateforme.
 *      Une réservation restée « envoyee » au-delà du délai de publication signale une
 *      exécution interrompue dont l'issue est inconnue : elle passe « a_verifier », est
 *      signalée, et n'est JAMAIS republiée automatiquement (un doublon public est pire
 *      qu'une publication manquée) ;
 *   5. publication ; le résultat est consigné tel quel. Un échec n'est jamais présenté
 *      comme un succès : seul un identifiant renvoyé par la plateforme vaut publication.
 *
 * Deux échecs de publication de suite sur une plateforme la suspendent d'elle-même.
 *
 * Toutes les dépendances sont injectées : la logique se vérifie sans réseau ni base.
 */
import { evaluerVideo, type LigneVideo } from './videos';
import { heureAtteinte } from './horaire';

export type Plateforme = 'instagram' | 'facebook' | 'youtube' | 'tiktok';

export type StatutPublication =
  | 'publiee' | 'deja' | 'suspendu' | 'attente' | 'bloquee' | 'occupe' | 'a_verifier' | 'echec';

export interface RapportVideo {
  cle: string;
  plateforme: Plateforme;
  statut: StatutPublication;
  /** Vrai uniquement si la plateforme a renvoyé un identifiant de publication pendant CET appel. */
  publie: boolean;
  idExterne?: string;
  motif?: string;
}

export interface Reservation {
  etat: 'reservee' | 'deja' | 'occupee' | 'interrompue';
  id?: string;
  idExterne?: string | null;
}

export interface Dependances {
  maintenant: Date;
  autorisation(p: Plateforme): Promise<{ autorisee: boolean; motif?: string }>;
  reglages(p: Plateforme): Promise<{ heure: number | null; mode: string } | null>;
  video(cle: string): Promise<LigneVideo | null>;
  reserver(cle: string, p: Plateforme): Promise<Reservation>;
  marquerAVerifier(id: string, motif: string): Promise<void>;
  conclure(id: string, ok: boolean, idExterne?: string, erreur?: string): Promise<void>;
  /** Publie réellement ; ne doit rien faire d'autre. */
  publier(p: Plateforme, ligne: LigneVideo): Promise<{ ok: boolean; idExterne?: string; erreur?: string }>;
  issue(p: Plateforme, ok: boolean, motif?: string): Promise<void>;
  signaler(cle: string, niveau: 'echec' | 'suspension' | 'information', sujet: string, message: string): Promise<void>;
}

const NOMS: Record<Plateforme, string> = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };

export async function publierVideo(
  d: Dependances, cle: string, plateforme: Plateforme, options: { ignorerHeure?: boolean } = {},
): Promise<RapportVideo> {
  const r = (statut: StatutPublication, motif?: string, extra: Partial<RapportVideo> = {}): RapportVideo =>
    ({ cle, plateforme, statut, publie: false, motif, ...extra });

  // 1. Arrêt d'urgence : vérifié au moment même de publier.
  const auto = await d.autorisation(plateforme);
  if (!auto.autorisee) return r('suspendu', auto.motif ?? 'Publication suspendue.');

  // 2. Mode et heure.
  const reglages = await d.reglages(plateforme);
  if (reglages?.mode !== 'automatique') return r('suspendu', 'Mode validation : aucune publication automatique.');
  if (!options.ignorerHeure && !heureAtteinte(reglages.heure, d.maintenant)) return r('attente', 'Heure de publication pas encore atteinte.');

  // 3. Vidéo contrôlée.
  const ligne = await d.video(cle);
  const etat = evaluerVideo(ligne);
  if (!etat.ok) {
    const definitif = etat.code === 'refusee' || etat.code === 'incoherente';
    await d.signaler(`video-bloquee:${cle}:${plateforme}:${etat.code}`, 'echec',
      definitif
        ? `${NOMS[plateforme]} : vidéo ${cle} refusée, non publiée`
        : `${NOMS[plateforme]} : vidéo ${cle} pas prête à l’heure prévue`,
      definitif
        ? etat.motif
        : `${etat.motif} Nouvelle tentative à chaque passage horaire ; rien ne part tant que la vidéo n’a pas passé ses contrôles.`);
    return r('bloquee', etat.motif);
  }
  const aujourdhui = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d.maintenant);
  if (etat.ligne.jour > aujourdhui) return r('attente', `Vidéo prévue le ${etat.ligne.jour}.`);

  // 4. Réservation idempotente.
  let res: Reservation;
  try {
    res = await d.reserver(cle, plateforme);
  } catch (e) {
    const motif = `Réservation impossible, rien n’a été publié : ${e instanceof Error ? e.message : String(e)}`;
    await d.signaler(`reservation:${cle}:${plateforme}:${aujourdhui}`, 'echec', `${NOMS[plateforme]} : publication impossible`, motif);
    return r('echec', motif);
  }
  if (res.etat === 'deja') return r('deja', 'Déjà publiée sur cette plateforme.', { idExterne: res.idExterne ?? undefined });
  if (res.etat === 'occupee') return r('occupe', 'Une autre exécution publie cette vidéo.');
  if (res.etat === 'interrompue') {
    const motif = 'Publication interrompue précédemment, issue inconnue : à vérifier sur la plateforme. Aucune nouvelle tentative automatique (risque de doublon).';
    if (res.id) await d.marquerAVerifier(res.id, motif);
    await d.signaler(`a-verifier:${cle}:${plateforme}`, 'echec', `${NOMS[plateforme]} : publication à vérifier`, `${cle} — ${motif}`);
    return r('a_verifier', motif);
  }

  // 5. Publication.
  let resultat: { ok: boolean; idExterne?: string; erreur?: string };
  try {
    resultat = await d.publier(plateforme, etat.ligne);
  } catch (e) {
    resultat = { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
  const reussie = resultat.ok && Boolean(resultat.idExterne);
  if (!reussie) {
    const erreur = resultat.ok ? 'La plateforme n’a renvoyé aucun identifiant : publication non confirmée.' : (resultat.erreur ?? 'Échec sans message.');
    await d.conclure(res.id!, false, undefined, erreur);
    await d.issue(plateforme, false, erreur);
    await d.signaler(`echec-publication:${cle}:${plateforme}:${aujourdhui}`, 'echec',
      `${NOMS[plateforme]} : échec de publication`, `${cle} — ${erreur}`);
    return r('echec', erreur);
  }
  await d.conclure(res.id!, true, resultat.idExterne);
  await d.issue(plateforme, true);
  return r('publiee', undefined, { publie: true, idExterne: resultat.idExterne });
}

/**
 * Suspension automatique : deux échecs de publication consécutifs coupent la plateforme.
 * Fonction pure, appliquée par l'appelant : nouvel état du compteur et suspension éventuelle.
 */
export const SEUIL_SUSPENSION = 2;
export function apresIssue(echecsAvant: number, ok: boolean): { echecs: number; suspendre: boolean } {
  if (ok) return { echecs: 0, suspendre: false };
  const echecs = echecsAvant + 1;
  return { echecs, suspendre: echecs >= SEUIL_SUSPENSION };
}

/** Délai au-delà duquel une réservation « envoyee » est réputée interrompue. */
export const DELAI_INTERRUPTION_MS = 15 * 60_000;
export function etatReservationExistante(
  statut: string, majLe: string | null, maintenant: Date,
): 'deja' | 'occupee' | 'interrompue' | 'reprendre' {
  if (statut === 'publiee') return 'deja';
  if (statut === 'a_verifier') return 'interrompue';
  if (statut === 'envoyee') {
    const age = majLe ? maintenant.getTime() - Date.parse(majLe) : Infinity;
    return age < DELAI_INTERRUPTION_MS ? 'occupee' : 'interrompue';
  }
  return 'reprendre';   // en_attente, echec : une nouvelle tentative est sûre (rien n'a été publié)
}
