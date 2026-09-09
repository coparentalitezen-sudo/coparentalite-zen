/**
 * Client de l'API Pinterest (v5), lecture seule.
 *
 * La publication reste entièrement passive, par le flux RSS (voir pinterest.ts
 * et docs/PINTEREST.md) : ce module n'y touche pas et ne crée jamais
 * d'épingle. Il sert uniquement à la boucle d'amélioration, pour retrouver les
 * épingles que Pinterest a lui-même créées à partir du flux, puis lire leur
 * analytique.
 *
 * Mêmes règles que meta.ts pour le jeton : en-tête Authorization uniquement,
 * jamais dans l'adresse, et tout message d'erreur expurgé avant d'être
 * enregistré.
 *
 * AVERTISSEMENT SUR LA FORME DES RÉPONSES
 * La forme exacte des réponses (« all.summary_metrics », pagination par
 * « bookmark ») correspond à la documentation publique de l'API Pinterest v5
 * au moment de l'écriture. Elle n'a pas été vérifiée contre un compte réel :
 * à connecter, il faut confirmer un premier appel avant de se fier aux
 * chiffres qui en sortent.
 */

export const VERSION_API = 'v5';
const BASE = `https://api.pinterest.com/${VERSION_API}`;

/** Fenêtre analytique la plus large que l'API accepte en une requête. */
export const FENETRE_ANALYTIQUE_MAX_JOURS = 90;

export interface ConfigurationPinterest {
  jeton: string;
  tableauId: string;
}

/** Configuration lue depuis l'environnement, ou null si incomplète. */
export function configurationPinterest(): ConfigurationPinterest | null {
  const jeton = process.env.PINTEREST_ACCESS_TOKEN?.trim();
  const tableauId = process.env.PINTEREST_BOARD_ID?.trim();
  if (!jeton || !tableauId) return null;
  return { jeton, tableauId };
}

/** État de configuration, sans jamais révéler une valeur. */
export function etatConfigurationPinterest(): Record<string, boolean> {
  return {
    PINTEREST_ACCESS_TOKEN: Boolean(process.env.PINTEREST_ACCESS_TOKEN?.trim()),
    PINTEREST_BOARD_ID: Boolean(process.env.PINTEREST_BOARD_ID?.trim()),
  };
}

/** Expurge un message avant enregistrement, sur le même principe que meta.ts. */
export function expurger(message: string, jeton?: string): string {
  let propre = message.replace(/access_token=[^&\s"']+/gi, 'access_token=[masqué]');
  if (jeton && jeton.length >= 8) {
    propre = propre.split(jeton).join('[jeton masqué]');
  }
  return propre.slice(0, 500);
}

export type Requete = (url: string, init?: RequestInit) => Promise<Response>;

export interface ResultatPinterest<T> {
  ok: boolean;
  donnees?: T;
  erreur?: string;
}

/** Appel à l'API Pinterest : jeton en en-tête, erreurs expurgées, jamais d'exception. */
export async function appelPinterest<T>(
  chemin: string,
  config: ConfigurationPinterest,
  options: { requete?: Requete } = {},
): Promise<ResultatPinterest<T>> {
  const requete = options.requete ?? fetch;
  const url = `${BASE}${chemin}`;

  try {
    const reponse = await requete(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.jeton}`, Accept: 'application/json' },
    });

    const texte = await reponse.text();
    let corps: unknown;
    try { corps = JSON.parse(texte); } catch { corps = { brut: texte }; }

    if (!reponse.ok) {
      const details = corps as { message?: string };
      return {
        ok: false,
        erreur: expurger(`${reponse.status} · ${details?.message ?? texte}`.trim(), config.jeton),
      };
    }
    return { ok: true, donnees: corps as T };
  } catch (e) {
    return { ok: false, erreur: expurger(`Requête impossible : ${String(e)}`, config.jeton) };
  }
}

export interface EpingleApi {
  id: string;
  link: string | null;
  created_at: string | null;
}

interface ReponseEpinglesTableau {
  items?: EpingleApi[];
  bookmark?: string | null;
}

/**
 * Liste les épingles d'un tableau, sur toutes les pages.
 *
 * Bornée à 20 pages (jusqu'à 2000 épingles avec la taille de page maximale) :
 * un tableau qui en compterait davantage relève d'une pagination volontaire
 * par l'appelant plutôt que d'un déroulement automatique sans fin.
 */
export async function listerEpinglesTableau(
  config: ConfigurationPinterest, requete?: Requete,
): Promise<ResultatPinterest<EpingleApi[]>> {
  const epingles: EpingleApi[] = [];
  let bookmark: string | undefined;
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const parametres = new URLSearchParams({ page_size: '100' });
    if (bookmark) parametres.set('bookmark', bookmark);
    const r = await appelPinterest<ReponseEpinglesTableau>(
      `/boards/${config.tableauId}/pins?${parametres}`, config, { requete },
    );
    if (!r.ok) return { ok: false, erreur: r.erreur };

    epingles.push(...(r.donnees?.items ?? []));
    bookmark = r.donnees?.bookmark ?? undefined;
    if (!bookmark) break;
  }

  return { ok: true, donnees: epingles };
}

export interface MetriquesEpingle {
  impressions: number;
  saves: number;
  pinClicks: number;
  outboundClicks: number;
}

interface ReponseAnalytique {
  all?: { summary_metrics?: Record<string, number> };
}

/**
 * Analytique cumulée d'une épingle sur une période.
 *
 * @param depuis  date de création de l'épingle, ou toute date plus récente
 * @param jusqua  date du relevé (aujourd'hui, en pratique)
 */
export async function analytiquesEpingle(
  config: ConfigurationPinterest, pinId: string, depuis: Date, jusqua: Date, requete?: Requete,
): Promise<ResultatPinterest<MetriquesEpingle>> {
  const debutBorne = new Date(jusqua);
  debutBorne.setUTCDate(debutBorne.getUTCDate() - (FENETRE_ANALYTIQUE_MAX_JOURS - 1));
  const debut = depuis > debutBorne ? depuis : debutBorne;

  const parametres = new URLSearchParams({
    start_date: debut.toISOString().slice(0, 10),
    end_date: jusqua.toISOString().slice(0, 10),
    metric_types: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK',
  });

  const r = await appelPinterest<ReponseAnalytique>(
    `/pins/${encodeURIComponent(pinId)}/analytics?${parametres}`, config, { requete },
  );
  if (!r.ok) return { ok: false, erreur: r.erreur };

  const m = r.donnees?.all?.summary_metrics ?? {};
  return {
    ok: true,
    donnees: {
      impressions: m.IMPRESSION ?? 0,
      saves: m.SAVE ?? 0,
      pinClicks: m.PIN_CLICK ?? 0,
      outboundClicks: m.OUTBOUND_CLICK ?? 0,
    },
  };
}
