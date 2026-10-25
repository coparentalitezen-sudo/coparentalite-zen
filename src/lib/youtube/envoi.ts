/**
 * Envoi d'une vidéo par l'API YouTube Data v3, en mode « resumable ».
 *
 * Le mode reprenable n'est pas choisi pour la taille des fichiers — quelques
 * centaines de kilo-octets — mais pour l'idempotence : la session d'envoi a
 * une adresse, enregistrée en base AVANT le transfert. Si la connexion se
 * coupe pendant ou juste après l'envoi, on interroge cette adresse : YouTube
 * répond soit par la vidéo créée (envoi abouti, on l'enregistre), soit par ce
 * qu'il a reçu (on complète), soit que la session n'existe plus (aucune vidéo
 * n'a été créée, on peut repartir). Jamais de second envoi à l'aveugle, donc
 * jamais de doublon sur la chaîne.
 *
 * `fetch` est injecté : les tests rejouent chaque réponse possible de Google.
 */

type Fetch = typeof fetch;

const URL_ENVOI = 'https://www.googleapis.com/upload/youtube/v3/videos'
  + '?uploadType=resumable&part=snippet,status';

export interface MetadonneesVideo {
  titre: string;
  description: string;
  motsCles: string[];
  visibilite: 'private' | 'unlisted' | 'public';
}

/** La vidéo telle que YouTube la décrit après création. */
export interface VideoCreee {
  id: string;
  chaineId: string | null;
  visibilite: string | null;
  etatEnvoi: string | null;
}

export class ErreurEnvoi extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** Vaut la peine de réessayer : réseau, 5xx, 429. */
    readonly temporaire: boolean,
    /** Le jeton d'accès a expiré ou été refusé : rafraîchir puis réessayer. */
    readonly authentification = false,
  ) { super(message); }
}

/** Raison donnée par l'API dans un corps d'erreur, si elle existe. */
async function raison(r: Response): Promise<string> {
  const d = await r.json().catch(() => null) as
    { error?: { errors?: { reason?: string }[]; message?: string } } | null;
  return d?.error?.errors?.[0]?.reason ?? d?.error?.message ?? `http_${r.status}`;
}

async function erreurDeReponse(r: Response): Promise<ErreurEnvoi> {
  const motif = await raison(r);
  if (r.status === 401) return new ErreurEnvoi('Jeton d’accès refusé.', motif, false, true);
  // quotaExceeded et uploadLimitExceeded : rien à espérer avant demain.
  const temporaire = r.status >= 500 || r.status === 429;
  return new ErreurEnvoi(`YouTube a refusé l’envoi (HTTP ${r.status}, ${motif}).`, motif, temporaire);
}

export function videoDeReponse(d: unknown): VideoCreee {
  const v = d as {
    id?: string;
    snippet?: { channelId?: string };
    status?: { privacyStatus?: string; uploadStatus?: string };
  };
  if (!v?.id) throw new ErreurEnvoi('Réponse de YouTube sans identifiant de vidéo.', 'sans_id', false);
  return {
    id: v.id,
    chaineId: v.snippet?.channelId ?? null,
    visibilite: v.status?.privacyStatus ?? null,
    etatEnvoi: v.status?.uploadStatus ?? null,
  };
}

/** Ouvre une session d'envoi et renvoie son adresse. Aucune vidéo n'existe encore à ce stade. */
export async function ouvrirSession(
  acces: string, meta: MetadonneesVideo, taille: number, f: Fetch = fetch,
): Promise<string> {
  let r: Response;
  try {
    r = await f(URL_ENVOI, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${acces}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(taille),
      },
      body: JSON.stringify({
        snippet: {
          title: meta.titre,
          description: meta.description,
          tags: meta.motsCles,
          categoryId: '26',          // Vie pratique et style
          defaultLanguage: 'fr',
          defaultAudioLanguage: 'fr',
        },
        status: {
          privacyStatus: meta.visibilite,
          // Contenu destiné aux parents : obligatoire depuis la COPPA.
          selfDeclaredMadeForKids: false,
          embeddable: true,
        },
      }),
    });
  } catch (e) {
    throw new ErreurEnvoi(`YouTube injoignable : ${(e as Error).message}`, 'reseau', true);
  }
  if (!r.ok) throw await erreurDeReponse(r);
  const session = r.headers.get('location');
  if (!session) throw new ErreurEnvoi('YouTube n’a pas renvoyé d’adresse de session.', 'sans_session', true);
  return session;
}

export type EtatSession =
  | { etat: 'terminee'; video: VideoCreee }
  | { etat: 'partielle'; recus: number }
  | { etat: 'introuvable' };

/**
 * Interroge une session : la vidéo a-t-elle été créée ?
 * C'est la vérification faite avant toute nouvelle tentative.
 */
export async function etatSession(
  acces: string, session: string, taille: number, f: Fetch = fetch,
): Promise<EtatSession> {
  let r: Response;
  try {
    r = await f(session, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${acces}`,
        'Content-Length': '0',
        'Content-Range': `bytes */${taille}`,
      },
    });
  } catch (e) {
    throw new ErreurEnvoi(`YouTube injoignable : ${(e as Error).message}`, 'reseau', true);
  }
  if (r.status === 200 || r.status === 201) return { etat: 'terminee', video: videoDeReponse(await r.json()) };
  if (r.status === 308) {
    const plage = r.headers.get('range');               // « bytes=0-12345 »
    const fin = plage ? Number(plage.split('-')[1]) : -1;
    return { etat: 'partielle', recus: Number.isFinite(fin) ? fin + 1 : 0 };
  }
  // Session expirée ou inconnue : rien n'a été créé, on peut en ouvrir une autre.
  if (r.status === 404 || r.status === 410) return { etat: 'introuvable' };
  throw await erreurDeReponse(r);
}

/** Envoie le fichier (ou sa fin, à partir de `depart`) dans une session ouverte. */
export async function transferer(
  acces: string, session: string, video: Uint8Array, depart = 0, f: Fetch = fetch,
): Promise<VideoCreee> {
  const morceau = video.subarray(depart);
  let r: Response;
  try {
    r = await f(session, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${acces}`,
        'Content-Type': 'video/mp4',
        'Content-Length': String(morceau.byteLength),
        ...(depart > 0
          ? { 'Content-Range': `bytes ${depart}-${video.byteLength - 1}/${video.byteLength}` }
          : {}),
      },
      body: Buffer.from(morceau),
    });
  } catch (e) {
    throw new ErreurEnvoi(`Transfert interrompu : ${(e as Error).message}`, 'reseau', true);
  }
  if (r.status === 200 || r.status === 201) return videoDeReponse(await r.json());
  if (r.status === 308) throw new ErreurEnvoi('Transfert incomplet.', 'incomplet', true);
  throw await erreurDeReponse(r);
}

/**
 * Lecture de la vidéo sur YouTube, après envoi : existe-t-elle, sur quelle
 * chaîne, avec quelle visibilité et combien de vues. Null si YouTube ne la
 * connaît pas (encore).
 */
export async function lireVideos(
  acces: string, ids: string[], f: Fetch = fetch,
): Promise<Map<string, VideoCreee & { vues: number | null }>> {
  const resultat = new Map<string, VideoCreee & { vues: number | null }>();
  if (ids.length === 0) return resultat;
  const r = await f(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id=${ids.slice(0, 50).join(',')}`,
    { headers: { Authorization: `Bearer ${acces}` } },
  );
  if (!r.ok) throw await erreurDeReponse(r);
  const d = await r.json() as {
    items?: {
      id: string; snippet?: { channelId?: string };
      status?: { privacyStatus?: string; uploadStatus?: string };
      statistics?: { viewCount?: string };
    }[];
  };
  for (const v of d.items ?? []) {
    resultat.set(v.id, {
      id: v.id,
      chaineId: v.snippet?.channelId ?? null,
      visibilite: v.status?.privacyStatus ?? null,
      etatEnvoi: v.status?.uploadStatus ?? null,
      vues: v.statistics?.viewCount !== undefined ? Number(v.statistics.viewCount) : null,
    });
  }
  return resultat;
}
