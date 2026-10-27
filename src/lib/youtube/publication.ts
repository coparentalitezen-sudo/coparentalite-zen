import 'server-only';
import { supabaseService } from '@/lib/supabase/server';
import { lireParametresPlateforme, publicationAutorisee } from '@/lib/marketing/depot';
import { rendrePlanche } from '@/lib/marketing/rendu';
import { assemblerVideo, SEAU_REELS } from '@/lib/marketing/video';
import { lireGrilleTarifaire } from '@/lib/tarifs';
import { chiffrer, cleDeChiffrement, dechiffrer } from './chiffrement';
import {
  CHAINE_ATTENDUE, configOAuth, rafraichir, ErreurOAuth, type ConfigOAuth,
} from './oauth';
import {
  ouvrirSession, etatSession, transferer, lireVideos, ErreurEnvoi, type VideoCreee,
} from './envoi';
import { decider, VERROU_MS, type LigneShort, type Visibilite } from './decision';
import {
  shortDuJour, planchesDuShort, titreDuShort, descriptionDuShort, motsClesDuShort,
  jourAParis, type ShortDuJour,
} from './short';

/**
 * Publication d'un YouTube Short.
 *
 * Appelée par la tâche quotidienne (deux passages : le second ne fait rien si
 * le premier a abouti) et par le bouton d'essai de l'administration.
 *
 * Garanties, dans l'ordre où elles jouent :
 *   1. arrêts : général, puis canal YouTube — un essai respecte l'arrêt
 *      général, la tâche quotidienne respecte les deux ;
 *   2. un seul Short par jour, garanti en base (index unique sur le jour) ;
 *   3. une seule exécution à la fois sur un même Short : la réservation est
 *      une mise à jour conditionnelle (le nombre de tentatives sert de
 *      version) — deux exécutions simultanées, une seule l'obtient ;
 *   4. aucun second envoi à l'aveugle : la session d'envoi est enregistrée
 *      avant le transfert, et interrogée avant toute nouvelle tentative ;
 *   5. « publiée » seulement si YouTube a renvoyé un identifiant, sur la
 *      chaîne attendue — puis confirmé par une relecture de la vidéo.
 *
 * Chaque exécution laisse un rapport dans marketing_journal (tâche
 * « youtube »), y compris quand elle ne publie rien.
 */

type Service = NonNullable<ReturnType<typeof supabaseService>>;

export type { Visibilite } from './decision';

export interface RapportYoutube {
  jour: string;
  publie: boolean;
  statut: 'publiee' | 'deja' | 'ignore' | 'echec' | 'a_verifier' | 'occupe';
  cle?: string;
  videoId?: string;
  visibilite?: string | null;
  motif?: string;
}

async function journaliser(service: Service, rapport: RapportYoutube): Promise<void> {
  const { error } = await service.from('marketing_journal').insert({
    tache: 'youtube', jour: rapport.jour, source: 'shorts', publie: rapport.publie, rapport,
  });
  if (error) console.error('[youtube] journal', error.message);
}

// ---------------- Jetons ----------------

/** Jeton d'accès valable, rafraîchi au besoin. Marque la connexion révoquée si Google la refuse. */
async function jetonAcces(service: Service, config: ConfigOAuth, cle: Buffer): Promise<string> {
  const { data: c } = await service.from('marketing_youtube_connexion')
    .select('etat, jeton_rafraichissement, jeton_acces, jeton_acces_expire')
    .eq('id', true).maybeSingle();
  if (!c || c.etat !== 'active' || !c.jeton_rafraichissement) {
    throw new ErreurOAuth('Chaîne YouTube non connectée.', 'non_connectee', true, false);
  }
  if (c.jeton_acces && c.jeton_acces_expire
      && Date.parse(c.jeton_acces_expire) > Date.now() + 120_000) {
    return dechiffrer(c.jeton_acces, cle);
  }
  try {
    const jetons = await rafraichir(config, dechiffrer(c.jeton_rafraichissement, cle));
    await service.from('marketing_youtube_connexion').update({
      jeton_acces: chiffrer(jetons.acces, cle),
      jeton_acces_expire: jetons.expireLe.toISOString(),
      // Google peut faire tourner le jeton de rafraîchissement : on garde le dernier.
      ...(jetons.rafraichissement
        ? { jeton_rafraichissement: chiffrer(jetons.rafraichissement, cle) } : {}),
      derniere_erreur: null,
    }).eq('id', true);
    return jetons.acces;
  } catch (e) {
    if (e instanceof ErreurOAuth && e.revoque) {
      await service.from('marketing_youtube_connexion').update({
        etat: 'revoquee',
        jeton_acces: null,
        jeton_acces_expire: null,
        derniere_erreur: `${e.message} Reconnectez la chaîne depuis l’administration.`,
      }).eq('id', true);
    }
    throw e;
  }
}

// ---------------- Vidéo ----------------

async function offreGratuiteActive(): Promise<boolean> {
  const grille = await lireGrilleTarifaire();
  return Boolean(grille?.some((f) => f.planId === 'free' && f.fonctions.some((x) => /3 mois/.test(x))));
}

/**
 * Le MP4 du Short, fabriqué une fois puis relu du stockage : une nouvelle
 * tentative renvoie exactement le même fichier, de la même taille — ce
 * qu'exige la reprise d'une session d'envoi.
 */
async function fichierVideo(service: Service, cle: string, s: ShortDuJour): Promise<Buffer> {
  const nom = `youtube/${cle.replace(/[^a-z0-9-]/gi, '')}.mp4`;
  const seau = service.storage.from(SEAU_REELS);
  const { data: existant } = await seau.download(nom);
  if (existant) return Buffer.from(await existant.arrayBuffer());

  const offre = await offreGratuiteActive();
  // Une planche après l'autre : le rendu en parallèle de sept images
  // 1080×1920 s'ajoutait à l'encodage et dépassait la mémoire de Vercel.
  const images: ArrayBuffer[] = [];
  for (const p of planchesDuShort(s, offre)) {
    images.push(await (await rendrePlanche(p, 'vertical')).arrayBuffer());
  }
  const video = await assemblerVideo(images);
  await service.storage.createBucket(SEAU_REELS, { public: true }).catch(() => undefined);
  const { error } = await seau.upload(nom, video, { contentType: 'video/mp4', upsert: true });
  if (error) throw new Error(`Dépôt de la vidéo : ${error.message}`);
  return video;
}

// ---------------- Envoi avec reprise ----------------

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Envoie la vidéo dans la session de la ligne, en la créant au besoin, sans jamais doubler. */
async function envoyer(
  service: Service, ligne: LigneShort, acces: string, video: Buffer,
): Promise<VideoCreee> {
  let session = ligne.session_envoi;
  let depart = 0;

  if (session && ligne.taille_octets === video.byteLength) {
    const etat = await etatSession(acces, session, video.byteLength);
    if (etat.etat === 'terminee') return etat.video;     // déjà arrivée : on l'enregistre
    if (etat.etat === 'partielle') depart = etat.recus;
    if (etat.etat === 'introuvable') session = null;     // rien n'a été créé
  } else {
    session = null;
  }

  if (!session) {
    session = await ouvrirSession(acces, {
      titre: ligne.titre, description: ligne.description,
      motsCles: motsClesDuShort(shortDuJour(ligne.jour)),
      visibilite: ligne.visibilite_demandee,
    }, video.byteLength);
    // Enregistrée AVANT le transfert : c'est elle qui permettra de savoir,
    // après une coupure, si la vidéo est arrivée.
    await service.from('marketing_youtube_shorts')
      .update({ session_envoi: session, taille_octets: video.byteLength })
      .eq('id', ligne.id);
  }

  try {
    return await transferer(acces, session, video, depart);
  } catch (e) {
    // Coupure pendant ou après le transfert : on demande à YouTube ce qu'il a
    // reçu avant de conclure quoi que ce soit.
    if (e instanceof ErreurEnvoi && e.temporaire) {
      const etat = await etatSession(acces, session, video.byteLength).catch(() => null);
      if (etat?.etat === 'terminee') return etat.video;
      if (etat?.etat === 'partielle') return transferer(acces, session, video, etat.recus);
    }
    throw e;
  }
}

// ---------------- Exécution ----------------

export interface Options {
  /** Publication d'essai depuis l'administration, hors Short du jour, dans la visibilité réglée. */
  essai?: boolean;
  maintenant?: Date;
}

export async function executerPublicationYoutube(options: Options = {}): Promise<RapportYoutube> {
  const maintenant = options.maintenant ?? new Date();
  const jour = jourAParis(maintenant);
  const service = supabaseService();
  if (!service) return { jour, publie: false, statut: 'echec', motif: 'Service indisponible.' };

  const fin = async (r: RapportYoutube) => { await journaliser(service, r); return r; };

  // 1. Arrêts.
  if (options.essai) {
    const global = await lireParametresPlateforme('global');
    if (!global?.actif) return fin({ jour, publie: false, statut: 'ignore', motif: 'Publication suspendue pour toutes les plateformes.' });
  } else {
    const autorisation = await publicationAutorisee('youtube');
    if (!autorisation.autorisee) return fin({ jour, publie: false, statut: 'ignore', motif: autorisation.motif });
    const reglages = await lireParametresPlateforme('youtube');
    if (reglages?.mode !== 'automatique') {
      return fin({ jour, publie: false, statut: 'ignore', motif: 'Mode validation : publication manuelle.' });
    }
  }

  // 2. Configuration et connexion.
  const config = configOAuth();
  const cle = cleDeChiffrement();
  if (!config || !cle) {
    return fin({ jour, publie: false, statut: 'echec',
      motif: 'Variables YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET ou YOUTUBE_TOKEN_KEY absentes ou invalides.' });
  }
  const { data: connexion } = await service.from('marketing_youtube_connexion')
    .select('etat, visibilite').eq('id', true).maybeSingle();
  if (connexion?.etat !== 'active') {
    return fin({ jour, publie: false, statut: 'echec',
      motif: connexion?.etat === 'revoquee'
        ? 'Autorisation YouTube révoquée ou expirée : reconnecter la chaîne.'
        : 'Chaîne YouTube non connectée.' });
  }

  // 3. Le Short, créé une fois.
  const s = shortDuJour(jour);
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const cleIdem = options.essai ? `essai-${maintenant.getTime()}` : `short-${jour}`;
  const visibilite = connexion.visibilite as Visibilite;
  const offre = await offreGratuiteActive();

  await service.from('marketing_youtube_shorts').upsert({
    jour, essai: Boolean(options.essai), cle_idempotence: cleIdem,
    sujet: s.sujet.niche, accroche: s.accroche,
    titre: titreDuShort(s), description: descriptionDuShort(s, base, offre),
    visibilite_demandee: visibilite,
  }, { onConflict: 'cle_idempotence', ignoreDuplicates: true });

  const { data: ligne } = await service.from('marketing_youtube_shorts')
    .select('id, cle_idempotence, statut, tentatives, verrou_jusqua, session_envoi, taille_octets, video_id, titre, description, visibilite_demandee, jour')
    .eq('cle_idempotence', cleIdem).maybeSingle<LigneShort>();
  if (!ligne) return fin({ jour, publie: false, statut: 'echec', cle: cleIdem, motif: 'Short introuvable après création.' });

  const decision = decider(ligne, maintenant.getTime());
  if (decision === 'deja') return fin({ jour, publie: false, statut: 'deja', cle: cleIdem, videoId: ligne.video_id ?? undefined, motif: 'Short du jour déjà publié.' });
  if (decision === 'occupe') return fin({ jour, publie: false, statut: 'occupe', cle: cleIdem, motif: 'Une autre exécution traite ce Short.' });
  if (decision === 'a_verifier') return fin({ jour, publie: false, statut: 'a_verifier', cle: cleIdem, motif: 'Short en attente de vérification humaine.' });
  if (decision === 'abandon') return fin({ jour, publie: false, statut: 'echec', cle: cleIdem, motif: `Abandonné après ${ligne.tentatives} tentatives.` });

  // 4. Réservation : une seule exécution l'obtient.
  const { data: reservee } = await service.from('marketing_youtube_shorts')
    .update({
      statut: 'en_cours', tentatives: ligne.tentatives + 1,
      verrou_jusqua: new Date(maintenant.getTime() + VERROU_MS).toISOString(),
    })
    .eq('id', ligne.id).eq('tentatives', ligne.tentatives)
    .in('statut', ['en_attente', 'echec', 'en_cours'])
    .select('id');
  if (!reservee || reservee.length === 0) {
    return fin({ jour, publie: false, statut: 'occupe', cle: cleIdem, motif: 'Réservation obtenue par une autre exécution.' });
  }

  // 5. Fabrication et envoi, avec deux nouvelles tentatives sur erreur passagère.
  let derniere: unknown = null;
  for (let essai = 0; essai < 3; essai += 1) {
    try {
      const video = await fichierVideo(service, cleIdem, s);
      let acces = await jetonAcces(service, config, cle);
      let creee: VideoCreee;
      try {
        creee = await envoyer(service, { ...ligne, ...(await relire(service, ligne.id)) }, acces, video);
      } catch (e) {
        if (!(e instanceof ErreurEnvoi && e.authentification)) throw e;
        // Jeton refusé avant son expiration annoncée : on force le renouvellement.
        await service.from('marketing_youtube_connexion').update({ jeton_acces_expire: null }).eq('id', true);
        acces = await jetonAcces(service, config, cle);
        creee = await envoyer(service, { ...ligne, ...(await relire(service, ligne.id)) }, acces, video);
      }
      return fin(await conclure(service, ligne.id, creee, acces, visibilite, jour, cleIdem));
    } catch (e) {
      derniere = e;
      const temporaire = (e instanceof ErreurEnvoi || e instanceof ErreurOAuth) ? e.temporaire : false;
      if (!temporaire) break;
      await pause(essai === 0 ? 2_000 : 6_000);
    }
  }

  const err = derniere as { message?: string; code?: string };
  await service.from('marketing_youtube_shorts').update({
    statut: 'echec', verrou_jusqua: null,
    erreur_code: err?.code ?? 'inconnue', erreur_message: err?.message ?? String(derniere),
  }).eq('id', ligne.id);
  return fin({ jour, publie: false, statut: 'echec', cle: cleIdem, motif: err?.message ?? 'Échec sans message.' });
}

async function relire(service: Service, id: string) {
  const { data } = await service.from('marketing_youtube_shorts')
    .select('session_envoi, taille_octets').eq('id', id).maybeSingle();
  return data ?? {};
}

/** Vérifie la vidéo créée et fixe le statut final. */
async function conclure(
  service: Service, id: string, creee: VideoCreee, acces: string,
  demandee: Visibilite, jour: string, cleIdem: string,
): Promise<RapportYoutube> {
  // Une vidéo partie sur une autre chaîne : on n'y touche pas, on arrête tout.
  if (creee.chaineId && creee.chaineId !== CHAINE_ATTENDUE) {
    await service.from('marketing_youtube_shorts').update({
      statut: 'a_verifier', video_id: creee.id, chaine_id: creee.chaineId, verrou_jusqua: null,
      erreur_code: 'chaine_inattendue',
      erreur_message: `Vidéo créée sur la chaîne ${creee.chaineId} au lieu de ${CHAINE_ATTENDUE}.`,
    }).eq('id', id);
    await service.from('marketing_parametres').update({
      actif: false, suspendu_motif: 'Vidéo envoyée sur une chaîne inattendue.',
    }).eq('plateforme', 'youtube');
    return { jour, publie: false, statut: 'a_verifier', cle: cleIdem, videoId: creee.id, motif: 'Chaîne inattendue : canal YouTube suspendu.' };
  }

  // Relecture : la vidéo existe-t-elle bien, sur la bonne chaîne ?
  let verifiee: { chaineId: string | null; visibilite: string | null } | null = null;
  try {
    verifiee = (await lireVideos(acces, [creee.id])).get(creee.id) ?? null;
  } catch { /* relecture indisponible : la vérification reprendra au relevé */ }

  const visibilite = verifiee?.visibilite ?? creee.visibilite;
  // Les projets d'API non audités par YouTube voient leurs envois verrouillés
  // en privé : on le dit au lieu d'annoncer une publication publique.
  const restreinte = demandee !== 'private' && visibilite === 'private';

  await service.from('marketing_youtube_shorts').update({
    statut: 'publiee', video_id: creee.id, chaine_id: verifiee?.chaineId ?? creee.chaineId,
    visibilite_obtenue: visibilite, verrou_jusqua: null,
    publie_le: new Date().toISOString(),
    verifie_le: verifiee?.chaineId === CHAINE_ATTENDUE ? new Date().toISOString() : null,
    erreur_code: restreinte ? 'visibilite_restreinte' : null,
    erreur_message: restreinte
      ? 'YouTube a gardé la vidéo privée : projet d’API non audité par YouTube.' : null,
  }).eq('id', id);

  return {
    jour, publie: true, statut: 'publiee', cle: cleIdem, videoId: creee.id, visibilite,
    motif: restreinte ? 'Envoyée, mais maintenue privée par YouTube (audit requis).' : undefined,
  };
}

/**
 * Relève les vues des Shorts des trente derniers jours et vérifie ceux qui
 * ne l'ont pas encore été. Un appel pour cinquante vidéos : coût négligeable.
 */
export async function releverYoutube(): Promise<{ releves: number } | { erreur: string }> {
  const service = supabaseService();
  const config = configOAuth();
  const cle = cleDeChiffrement();
  if (!service || !config || !cle) return { erreur: 'Configuration incomplète.' };
  const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: lignes } = await service.from('marketing_youtube_shorts')
    .select('id, video_id').eq('statut', 'publiee').not('video_id', 'is', null)
    .gte('publie_le', depuis).limit(50);
  if (!lignes?.length) return { releves: 0 };
  try {
    const acces = await jetonAcces(service, config, cle);
    const videos = await lireVideos(acces, lignes.map((l) => l.video_id as string));
    const maintenant = new Date().toISOString();
    for (const l of lignes) {
      const v = videos.get(l.video_id as string);
      if (!v) continue;
      await service.from('marketing_youtube_shorts').update({
        vues: v.vues, vues_relevees_le: maintenant, visibilite_obtenue: v.visibilite,
        ...(v.chaineId === CHAINE_ATTENDUE ? { verifie_le: maintenant } : {}),
      }).eq('id', l.id);
    }
    return { releves: videos.size };
  } catch (e) {
    return { erreur: (e as Error).message };
  }
}
