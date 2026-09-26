/**
 * Réserve de contenus prêts à publier.
 *
 * La programmation reste celle d'avant : même tâche quotidienne, mêmes
 * interrupteurs par plateforme, même mode « automatique ». La réserve ne fait
 * que passer devant le générateur combinatoire — tant qu'elle contient un
 * visuel prêt, c'est lui qui part ; dès qu'elle est vide, la publication
 * planifiée reprend exactement son comportement actuel.
 *
 * DEUX RÈGLES QUI NE SE NÉGOCIENT PAS
 *
 *  1. Pas d'image, pas de publication. Un visuel injoignable ou refusé par
 *     Instagram n'est jamais remplacé par un message en texte seul : sur un
 *     fil d'actualité, un post nu passe pour un bug et abîme le compte.
 *  2. Une plateforme qui a réussi n'est jamais republiée. Chaque réseau tient
 *     son propre statut et son propre identifiant Meta ; la reprise après
 *     échec ne touche que le réseau qui a échoué.
 *
 * Comme pour le client Meta, la fonction de requête est injectable : tout se
 * vérifie sans joindre les serveurs de Meta ni disposer d'un jeton.
 */
import {
  configurationPrete, publierImageInstagram, publierFacebook, expurger, type Requete,
} from './meta';

export type PlateformeMeta = 'instagram' | 'facebook';
type EtatPlateforme = 'en_attente' | 'publiee' | 'echec';

export interface ContenuReserve {
  id: string;
  theme: string;
  image_url: string;
  legende: string;
  texte_alternatif: string;
  statut_instagram: EtatPlateforme;
  statut_facebook: EtatPlateforme;
}

/**
 * Le strict nécessaire du client Supabase : de quoi appeler les fonctions SQL.
 * `PromiseLike` et non `Promise` : le client renvoie un constructeur de requête
 * qui s'attend mais n'est pas une promesse.
 */
export interface ClientReserve {
  rpc(nom: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface IssuePlateforme {
  publie: boolean;
  identifiant?: string;
  motif?: string;
}

export interface RapportReserve {
  id: string;
  theme: string;
  statut: string;
  instagram: IssuePlateforme;
  facebook: IssuePlateforme;
}

/** Limite d'Instagram pour une image importée par adresse. */
export const TAILLE_MAX_IMAGE = 8 * 1024 * 1024;

/**
 * Vérifie que l'image existe vraiment et que Meta saura la lire.
 *
 * Instagram refuse le PNG : le contrôle du type n'est pas du zèle, c'est la
 * différence entre un échec constaté ici, avec un motif lisible, et un refus
 * opaque de l'API après avoir créé un conteneur.
 */
export async function imageAccessible(
  url: string,
  requete: Requete = fetch,
): Promise<{ ok: true } | { ok: false; motif: string }> {
  let reponse: Response;
  try {
    reponse = await requete(url, { method: 'HEAD', redirect: 'follow' });
    // Certains hébergeurs de fichiers refusent HEAD : on demande le premier octet.
    if (reponse.status === 403 || reponse.status === 405) {
      reponse = await requete(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
    }
  } catch (erreur) {
    return { ok: false, motif: `image injoignable : ${(erreur as Error).message}` };
  }

  if (!reponse.ok) return { ok: false, motif: `image injoignable : HTTP ${reponse.status}` };

  const type = (reponse.headers.get('content-type') ?? '').toLowerCase();
  if (!type.includes('jpeg') && !type.includes('jpg')) {
    return { ok: false, motif: `format refusé par Instagram : ${type || 'type inconnu'} (JPEG attendu)` };
  }

  // Sur une réponse partielle (206), content-length vaut 1 : le poids réel
  // n'est pas connu, on ne prétend pas le vérifier.
  if (reponse.status !== 206) {
    const taille = Number(reponse.headers.get('content-length') ?? '0');
    if (taille > TAILLE_MAX_IMAGE) {
      return { ok: false, motif: `image trop lourde : ${Math.round(taille / 1024)} Ko` };
    }
  }

  return { ok: true };
}

function vide(): IssuePlateforme {
  return { publie: false, motif: 'Canal hors service.' };
}

/**
 * Prend le premier contenu prêt de la réserve et le publie.
 *
 * Renvoie `null` quand la réserve n'a rien à proposer : l'appelant enchaîne
 * alors sur la publication planifiée habituelle.
 */
export async function publierReserve(
  service: ClientReserve,
  plateformes: PlateformeMeta[],
  requete?: Requete,
): Promise<RapportReserve | null> {
  if (plateformes.length === 0) return null;

  const { data, error } = await service.rpc('reserve_prochain_contenu');
  if (error) {
    console.error('[reserve] lecture impossible', error);
    return null;
  }

  const contenu = (Array.isArray(data) ? data[0] : data) as ContenuReserve | null;
  if (!contenu?.id) return null;

  const rapport: RapportReserve = {
    id: contenu.id,
    theme: contenu.theme,
    statut: 'echec',
    instagram: contenu.statut_instagram === 'publiee' ? { publie: true } : vide(),
    facebook: contenu.statut_facebook === 'publiee' ? { publie: true } : vide(),
  };

  const finaliser = async () => {
    const { data: statut } = await service.rpc('reserve_finaliser', { p_id: contenu.id });
    rapport.statut = typeof statut === 'string' ? statut : 'echec';
    return rapport;
  };

  const echouer = async (plateforme: PlateformeMeta | 'image', motif: string) => {
    await service.rpc('reserve_enregistrer_echec', {
      p_id: contenu.id, p_plateforme: plateforme, p_erreur: motif,
    });
  };

  // 1. Image d'abord. Sans elle, aucune des deux plateformes n'est tentée.
  const image = await imageAccessible(contenu.image_url, requete);
  if (!image.ok) {
    await echouer('image', image.motif);
    for (const p of plateformes) rapport[p] = { publie: false, motif: image.motif };
    return finaliser();
  }

  const prete = await configurationPrete(requete);
  if (!prete.ok) {
    const motif = prete.erreur ?? 'Meta indisponible.';
    for (const p of plateformes) {
      if (contenu[`statut_${p}`] !== 'publiee') {
        await echouer(p, motif);
        rapport[p] = { publie: false, motif };
      }
    }
    return finaliser();
  }
  const config = prete.donnees!;

  // 2. Chaque réseau est traité pour lui-même : l'échec de l'un ne prive pas
  //    l'autre, et celui qui a déjà réussi est sauté.
  for (const plateforme of plateformes) {
    if (contenu[`statut_${plateforme}`] === 'publiee') continue;

    const resultat = plateforme === 'instagram'
      ? await publierImageInstagram(
          config, contenu.image_url, contenu.legende, contenu.texte_alternatif, requete)
      // Facebook n'accepte pas de texte alternatif sur cette route : il reste
      // porté par Instagram, où il sert réellement aux lecteurs d'écran.
      : await publierFacebook(config, contenu.image_url, contenu.legende, requete);

    if (!resultat.ok) {
      const motif = expurger(resultat.erreur ?? 'Échec sans message.', config.jeton);
      await echouer(plateforme, motif);
      rapport[plateforme] = { publie: false, motif };
      continue;
    }

    const donnees = resultat.donnees as { id?: string; post_id?: string };
    const identifiant = donnees.post_id ?? donnees.id ?? '';
    if (!identifiant) {
      const motif = 'Publication acceptée sans identifiant.';
      await echouer(plateforme, motif);
      rapport[plateforme] = { publie: false, motif };
      continue;
    }

    await service.rpc('reserve_enregistrer_succes', {
      p_id: contenu.id, p_plateforme: plateforme, p_media_id: identifiant,
    });
    rapport[plateforme] = { publie: true, identifiant };
  }

  return finaliser();
}
