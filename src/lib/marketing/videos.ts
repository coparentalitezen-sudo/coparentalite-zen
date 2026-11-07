/**
 * Vidéos animées : lecture de leur état et accès à leurs fichiers.
 *
 * Une vidéo n'est publiable que si son rendu est « prete » ET que chacun de
 * ses contrôles bloquants est vert. La base l'impose déjà (contrainte
 * marketing_videos_prete_controlee) ; le code le revérifie quand même : un
 * contrôle qui manquerait ici publierait une vidéo qu'aucun humain n'a vue.
 *
 * Fichiers dans l'espace de stockage PRIVÉ « videos ». Les plateformes qui
 * vont chercher la vidéo elles-mêmes (Meta) reçoivent une adresse signée de
 * quinze minutes, créée juste avant l'appel ; YouTube reçoit les octets.
 */

export const SEAU_VIDEOS = 'videos';
/** Durée de vie d'une adresse signée remise à Meta : le temps qu'Instagram récupère la vidéo. */
export const DUREE_URL_SIGNEE_S = 15 * 60;

export const cleYoutube = (jour: string) => `yt-${jour}`;

export interface Controle { nom: string; ok: boolean; mesure?: unknown; detail?: string }
export interface LigneVideo {
  cle: string;
  source: 'youtube' | 'reel';
  jour: string;
  reference: string;
  statut: 'a_rendre' | 'en_cours' | 'prete' | 'echec';
  controles: { ok: boolean; controles: Controle[] } | null;
  chemin_video: string | null;
  chemin_affiche: string | null;
  erreur: string | null;
}

export type EtatVideo =
  | { ok: true; ligne: LigneVideo }
  | { ok: false; code: 'absente' | 'en_rendu' | 'refusee' | 'incoherente'; motif: string };

export const COLONNES_VIDEO = 'cle, source, jour, reference, statut, controles, chemin_video, chemin_affiche, erreur';

/** Une vidéo est-elle publiable ? Fonction pure : toute la décision est ici, testée sans base. */
export function evaluerVideo(ligne: LigneVideo | null | undefined): EtatVideo {
  if (!ligne) return { ok: false, code: 'absente', motif: 'Vidéo animée absente : elle n’a pas encore été rendue.' };
  if (ligne.statut === 'a_rendre' || ligne.statut === 'en_cours') {
    return { ok: false, code: 'en_rendu', motif: 'Vidéo animée pas encore prête (rendu en attente ou en cours).' };
  }
  const echoues = (ligne.controles?.controles ?? []).filter((c) => !c.ok).map((c) => c.nom);
  if (ligne.statut === 'echec') {
    const detail = echoues.length ? `contrôles en échec : ${echoues.join(', ')}` : (ligne.erreur ?? 'rendu en échec');
    return { ok: false, code: 'refusee', motif: `Vidéo refusée, aucune publication — ${detail}.` };
  }
  const tousVerts = ligne.controles?.ok === true
    && (ligne.controles.controles?.length ?? 0) > 0
    && echoues.length === 0;
  if (!tousVerts || !ligne.chemin_video) {
    return { ok: false, code: 'incoherente', motif: 'Vidéo marquée prête sans contrôles tous verts : publication refusée.' };
  }
  return { ok: true, ligne };
}

// ---- Accès base et stockage (le client est passé : le module reste testable) ----

interface ClientStockage {
  storage: {
    from(seau: string): {
      download(chemin: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
      createSignedUrl(chemin: string, secondes: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
}

/** Octets de la vidéo, pour un envoi direct (YouTube). */
export async function telechargerVideo(service: ClientStockage, chemin: string): Promise<Buffer> {
  const { data, error } = await service.storage.from(SEAU_VIDEOS).download(chemin);
  if (error || !data) throw new Error(`Lecture de la vidéo impossible : ${error?.message ?? 'fichier absent'}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Adresse signée de courte durée, pour une plateforme qui va chercher la vidéo (Meta). */
export async function adresseSignee(service: ClientStockage, chemin: string, secondes = DUREE_URL_SIGNEE_S): Promise<string> {
  const { data, error } = await service.storage.from(SEAU_VIDEOS).createSignedUrl(chemin, secondes);
  if (error || !data?.signedUrl) throw new Error(`Adresse signée impossible : ${error?.message ?? 'inconnue'}`);
  return data.signedUrl;
}
