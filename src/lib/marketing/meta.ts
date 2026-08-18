/**
 * Client de l'API Graph de Meta.
 *
 * Tout passe par une fonction de requête injectable plutôt que par un appel
 * direct à fetch : c'est ce qui permet de vérifier la construction des
 * requêtes, l'enchaînement des étapes et le traitement des erreurs sans
 * joindre les serveurs de Meta ni disposer d'un jeton.
 *
 * DEUX RÈGLES ABSOLUES SUR LES SECRETS
 *
 *  1. Le jeton voyage dans l'en-tête Authorization, jamais dans l'adresse.
 *     Meta accepte les deux, mais une adresse se retrouve dans les journaux
 *     du serveur, dans ceux de l'hébergeur, et dans les messages d'erreur.
 *  2. Tout message d'erreur est expurgé avant d'être enregistré. Meta renvoie
 *     volontiers l'adresse complète de la requête fautive ; recopier ce
 *     message tel quel dans la base écrirait le jeton en clair.
 *
 * PUBLIER SUR INSTAGRAM SE FAIT EN DEUX TEMPS
 * Un conteneur est d'abord créé, puis publié. Le conteneur expire au bout de
 * vingt-quatre heures, et publier trop vite après sa création renvoie l'erreur
 * 9007 : l'état du conteneur doit donc être vérifié entre les deux.
 */

export const VERSION_GRAPH = 'v21.0';
const BASE = `https://graph.facebook.com/${VERSION_GRAPH}`;

export interface ConfigurationMeta {
  appId: string;
  pageId: string;
  igUserId: string;
  jeton: string;
}

/** Configuration lue depuis l'environnement, ou null si incomplète. */
export function configurationMeta(): ConfigurationMeta | null {
  const appId = process.env.META_APP_ID?.trim();
  const pageId = process.env.META_PAGE_ID?.trim();
  const igUserId = process.env.META_IG_USER_ID?.trim();
  const jeton = process.env.META_LONG_LIVED_TOKEN?.trim();
  if (!appId || !pageId || !igUserId || !jeton) return null;
  return { appId, pageId, igUserId, jeton };
}

/** État de configuration, sans jamais révéler une valeur. */
export function etatConfiguration(): Record<string, boolean> {
  return {
    META_APP_ID: Boolean(process.env.META_APP_ID?.trim()),
    META_APP_SECRET: Boolean(process.env.META_APP_SECRET?.trim()),
    META_PAGE_ID: Boolean(process.env.META_PAGE_ID?.trim()),
    META_IG_USER_ID: Boolean(process.env.META_IG_USER_ID?.trim()),
    META_LONG_LIVED_TOKEN: Boolean(process.env.META_LONG_LIVED_TOKEN?.trim()),
  };
}

/**
 * Expurge un message avant enregistrement.
 *
 * Trois précautions cumulées : les paramètres access_token des adresses, les
 * chaînes longues ressemblant à un jeton, et la valeur exacte du jeton en
 * cours. Les deux premières attrapent ce qui vient de Meta, la troisième ce
 * qui viendrait de notre propre code.
 */
export function expurger(message: string, jeton?: string): string {
  let propre = message
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[masqué]')
    .replace(/\bEAA[A-Za-z0-9_-]{20,}/g, '[jeton masqué]');
  if (jeton && jeton.length >= 8) {
    propre = propre.split(jeton).join('[jeton masqué]');
  }
  return propre.slice(0, 500);
}

export type Requete = (url: string, init?: RequestInit) => Promise<Response>;

export interface ResultatMeta<T> {
  ok: boolean;
  donnees?: T;
  erreur?: string;
}

/** Appel Graph : jeton en en-tête, erreurs expurgées, jamais d'exception. */
export async function appelGraph<T>(
  chemin: string,
  config: ConfigurationMeta,
  options: { methode?: 'GET' | 'POST'; corps?: Record<string, string>; requete?: Requete } = {},
): Promise<ResultatMeta<T>> {
  const requete = options.requete ?? fetch;
  const methode = options.methode ?? 'GET';
  const url = `${BASE}${chemin}`;

  try {
    const reponse = await requete(url, {
      method: methode,
      headers: {
        Authorization: `Bearer ${config.jeton}`,
        ...(options.corps ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(options.corps ? { body: new URLSearchParams(options.corps).toString() } : {}),
    });

    const texte = await reponse.text();
    let corps: unknown;
    try { corps = JSON.parse(texte); } catch { corps = { brut: texte }; }

    if (!reponse.ok) {
      const details = corps as { error?: { message?: string; code?: number } };
      return {
        ok: false,
        erreur: expurger(
          `${reponse.status} · ${details?.error?.message ?? texte}`.trim(),
          config.jeton,
        ),
      };
    }
    return { ok: true, donnees: corps as T };
  } catch (e) {
    // Une panne réseau ne doit pas remonter telle quelle : le message d'une
    // exception peut contenir l'adresse appelée.
    return { ok: false, erreur: expurger(`Requête impossible : ${String(e)}`, config.jeton) };
  }
}

/** Vérifie que le jeton identifie bien la page et le compte attendus. */
export async function verifierConnexion(
  config: ConfigurationMeta, requete?: Requete,
): Promise<ResultatMeta<{ page: string; instagram: string }>> {
  const page = await appelGraph<{ id: string; name: string }>(
    `/${config.pageId}?fields=id,name`, config, { requete });
  if (!page.ok) return { ok: false, erreur: `Page : ${page.erreur}` };

  const ig = await appelGraph<{ id: string; username: string }>(
    `/${config.igUserId}?fields=id,username`, config, { requete });
  if (!ig.ok) return { ok: false, erreur: `Instagram : ${ig.erreur}` };

  return {
    ok: true,
    donnees: { page: page.donnees!.name, instagram: ig.donnees!.username },
  };
}

/** Permissions réellement accordées au jeton. */
export async function permissions(
  config: ConfigurationMeta, requete?: Requete,
): Promise<ResultatMeta<string[]>> {
  const r = await appelGraph<{ data?: { permission: string; status: string }[] }>(
    '/me/permissions', config, { requete });
  if (!r.ok) return { ok: false, erreur: r.erreur };
  return {
    ok: true,
    donnees: (r.donnees?.data ?? [])
      .filter((p) => p.status === 'granted').map((p) => p.permission),
  };
}

/**
 * Publie une image simple sur Instagram.
 *
 * Le texte alternatif est transmis : il est accepté sur les publications
 * image, et l'omettre reviendrait à publier un visuel illisible pour qui
 * utilise un lecteur d'écran.
 */
export async function publierImageInstagram(
  config: ConfigurationMeta,
  urlImage: string,
  legende: string,
  texteAlternatif: string,
  requete?: Requete,
): Promise<ResultatMeta<{ id: string }>> {
  const conteneur = await appelGraph<{ id: string }>(
    `/${config.igUserId}/media`, config,
    { methode: 'POST', requete, corps: { image_url: urlImage, caption: legende, alt_text: texteAlternatif } },
  );
  if (!conteneur.ok) return { ok: false, erreur: `Conteneur : ${conteneur.erreur}` };

  const etat = await appelGraph<{ status_code?: string }>(
    `/${conteneur.donnees!.id}?fields=status_code`, config, { requete });
  if (etat.ok && etat.donnees?.status_code && etat.donnees.status_code !== 'FINISHED') {
    // Publier avant que le conteneur soit prêt renvoie l'erreur 9007. Mieux
    // vaut s'arrêter ici et réessayer que produire un échec obscur.
    return { ok: false, erreur: `Conteneur non prêt : ${etat.donnees.status_code}` };
  }

  const publie = await appelGraph<{ id: string }>(
    `/${config.igUserId}/media_publish`, config,
    { methode: 'POST', requete, corps: { creation_id: conteneur.donnees!.id } },
  );
  if (!publie.ok) return { ok: false, erreur: `Publication : ${publie.erreur}` };
  return { ok: true, donnees: publie.donnees };
}

/** Publie une photo avec légende sur la page Facebook. */
export async function publierFacebook(
  config: ConfigurationMeta,
  urlImage: string,
  message: string,
  requete?: Requete,
): Promise<ResultatMeta<{ id: string; post_id?: string }>> {
  return appelGraph<{ id: string; post_id?: string }>(
    `/${config.pageId}/photos`, config,
    { methode: 'POST', requete, corps: { url: urlImage, message } },
  );
}

/** Statistiques d'une publication Instagram déjà publiée. */
export async function statistiquesInstagram(
  config: ConfigurationMeta, mediaId: string, requete?: Requete,
): Promise<ResultatMeta<Record<string, number>>> {
  const r = await appelGraph<{ data?: { name: string; values?: { value: number }[] }[] }>(
    `/${mediaId}/insights?metric=reach,likes,comments,saved`, config, { requete });
  if (!r.ok) return { ok: false, erreur: r.erreur };
  const mesures: Record<string, number> = {};
  for (const m of r.donnees?.data ?? []) {
    mesures[m.name] = m.values?.[0]?.value ?? 0;
  }
  return { ok: true, donnees: mesures };
}

/** Publications restantes sur les vingt-quatre heures glissantes. */
export async function quotaPublication(
  config: ConfigurationMeta, requete?: Requete,
): Promise<ResultatMeta<{ utilise: number; plafond: number }>> {
  const r = await appelGraph<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
    `/${config.igUserId}/content_publishing_limit`, config, { requete });
  if (!r.ok) return { ok: false, erreur: r.erreur };
  return {
    ok: true,
    donnees: {
      utilise: r.donnees?.data?.[0]?.quota_usage ?? 0,
      plafond: r.donnees?.data?.[0]?.config?.quota_total ?? 100,
    },
  };
}

/**
 * Nature du jeton : de page, ou d'utilisateur ?
 *
 * La distinction commande tout le reste. Pour un jeton de page, « /me »
 * désigne la page elle-même ; pour un jeton utilisateur, il désigne la
 * personne. Publier sur une page exige le premier.
 */
export async function natureDuJeton(
  config: ConfigurationMeta, requete?: Requete,
): Promise<ResultatMeta<{ estJetonDePage: boolean; id: string }>> {
  const r = await appelGraph<{ id: string }>('/me?fields=id', config, { requete });
  if (!r.ok) return { ok: false, erreur: r.erreur };
  return {
    ok: true,
    donnees: { estJetonDePage: r.donnees!.id === config.pageId, id: r.donnees!.id },
  };
}

export interface Aptitudes {
  instagram: boolean;
  facebook: boolean;
  detailInstagram: string;
  detailFacebook: string;
}

/**
 * Ce que le jeton permet réellement, constaté et non déclaré.
 *
 * Interroger la liste des permissions ne renseigne pas sur un jeton de page :
 * l'API renvoie une liste vide, ce qui se lit à tort comme « aucun droit ».
 * On essaie donc les opérations elles-mêmes, en lecture seule.
 *
 * Pour Instagram, le quota de publication fait office de test : l'obtenir
 * suppose instagram_basic et instagram_content_publish. Pour Facebook, la
 * lecture des publications de la page suppose un jeton de page valide, seul
 * capable d'en écrire.
 */
export async function aptitudes(
  config: ConfigurationMeta, requete?: Requete,
): Promise<Aptitudes> {
  const [quota, nature] = await Promise.all([
    quotaPublication(config, requete),
    natureDuJeton(config, requete),
  ]);

  // Facebook ne se vérifie pas sans écrire.
  //
  // Lire le fil de la page semblait un essai commode, mais cette lecture
  // dépend d'autorisations différentes de l'écriture : elle échoue là où
  // publier réussirait, et le verdict serait faux dans le sens le plus
  // coûteux — renoncer à un canal qui fonctionne.
  //
  // Ce qui est vérifiable sans rien publier : le jeton est bien un jeton de
  // page, et il désigne la bonne page. C'est nécessaire, ce n'est pas
  // suffisant, et le dire ainsi vaut mieux qu'un « oui » ou un « non »
  // également infondés. La première publication réelle tranchera.
  const jetonDePage = nature.ok && nature.donnees!.estJetonDePage;

  return {
    instagram: quota.ok,
    facebook: jetonDePage,
    detailInstagram: quota.ok
      ? 'Quota de publication obtenu : les autorisations Instagram répondent.'
      : `Quota inaccessible — ${quota.erreur ?? 'raison inconnue'}`,
    detailFacebook: !nature.ok
      ? `Jeton illisible — ${nature.erreur}`
      : !nature.donnees!.estJetonDePage
        ? 'Jeton d’utilisateur et non de page : la publication sur la page échouerait. '
          + 'Il faut dériver un jeton de page.'
        : 'Jeton de page valide désignant la bonne page. L’écriture ne peut se '
          + 'vérifier qu’en publiant : la première publication réelle le dira.',
  };
}
