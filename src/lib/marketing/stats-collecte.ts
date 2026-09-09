import 'server-only';
import {
  configurationPinterest, listerEpinglesTableau, analytiquesEpingle, appelPinterest, type Requete,
} from './pinterest-api';
import { associerEpingles, epinglesAMesurer } from './stats';
import { produireLearnings } from './learnings';
import {
  contenusSansPinId, enregistrerPinId, contenusPourCollecte, ecrirePinStats,
  lireMesuresPinterest, enregistrerLearnings,
} from './depot';

/**
 * Boucle d'amélioration Pinterest — collecte.
 *
 * En deux temps, parce que Pinterest ne nous rend jamais l'id d'une épingle :
 * la publication se fait par flux RSS (pinterest.ts), sans appel écrivant à
 * l'API et donc sans réponse à enregistrer.
 *
 *  1. DÉCOUVERTE — on liste les épingles du tableau et on les rapproche de nos
 *     contenus par le paramètre utm_content de leur lien, qui porte déjà la
 *     référence stable du contenu (construireLien, dans utm.ts). C'est ici,
 *     et non dans pinterest.ts, que l'id Pinterest d'un contenu est appris et
 *     enregistré — pinterest.ts n'appelle jamais l'API et n'a donc rien à
 *     enregistrer lui-même.
 *
 *  2. COLLECTE — pour chaque contenu dont l'épingle est connue et publiée
 *     depuis au moins deux jours (le temps que Pinterest stabilise son
 *     analytique), on relève les métriques cumulées et on les enregistre.
 *
 * N'écrit jamais dans marketing_contenus au-delà de pin_id/pin_cree_le : la
 * découverte n'influence ni le statut ni le contenu.
 */

export interface ResultatDecouverte {
  ok: boolean;
  epinglesTrouvees: number;
  erreur?: string;
}

/** Découvre les id Pinterest des contenus qui n'en ont pas encore, et les enregistre. */
export async function decouvrirEpingles(requete?: Requete): Promise<ResultatDecouverte> {
  const config = configurationPinterest();
  if (!config) return { ok: false, epinglesTrouvees: 0, erreur: 'Pinterest n’est pas configuré.' };

  const enAttente = await contenusSansPinId();
  if (enAttente.length === 0) return { ok: true, epinglesTrouvees: 0 };

  const liste = await listerEpinglesTableau(config, requete);
  if (!liste.ok) return { ok: false, epinglesTrouvees: 0, erreur: liste.erreur };

  const associees = associerEpingles(liste.donnees ?? [], enAttente);
  for (const a of associees) {
    await enregistrerPinId(a.reference, a.pinId, a.creeLe);
  }

  return { ok: true, epinglesTrouvees: associees.length };
}

export interface ResultatCollecte {
  ok: boolean;
  epinglesMesurees: number;
  echecs: number;
  erreur?: string;
}

/** Relève l'analytique de chaque épingle mesurable et l'enregistre dans pin_stats. */
export async function collecterStats(requete?: Requete): Promise<ResultatCollecte> {
  const config = configurationPinterest();
  if (!config) return { ok: false, epinglesMesurees: 0, echecs: 0, erreur: 'Pinterest n’est pas configuré.' };

  const contenus = await contenusPourCollecte();
  const maintenant = new Date();
  const aMesurer = epinglesAMesurer(contenus, maintenant);

  const lignes: {
    pinId: string; contenuId: string; joursDepuisPub: number;
    impressions: number; saves: number; pinClicks: number; outboundClicks: number;
  }[] = [];
  let echecs = 0;

  for (const c of aMesurer) {
    const r = await analytiquesEpingle(config, c.pinId, c.pinCreeLe, maintenant, requete);
    if (!r.ok || !r.donnees) { echecs += 1; continue; }
    lignes.push({
      pinId: c.pinId, contenuId: c.contenuId, joursDepuisPub: c.jours,
      impressions: r.donnees.impressions, saves: r.donnees.saves,
      pinClicks: r.donnees.pinClicks, outboundClicks: r.donnees.outboundClicks,
    });
  }

  const ecrites = lignes.length > 0 ? await ecrirePinStats(lignes) : 0;
  return { ok: true, epinglesMesurees: ecrites, echecs };
}

export interface ResultatBouclePinterest {
  configure: boolean;
  decouverte: ResultatDecouverte | null;
  collecte: ResultatCollecte | null;
  nbPins: number | null;
  bloc: string | null;
  learningsEnregistres: boolean;
}

/**
 * Exécute la boucle Pinterest en entier : découverte, collecte, apprentissages.
 *
 * Pensée pour être appelée depuis une tâche déjà planifiée (la route bilan,
 * sur le compte Vercel Hobby de ce projet) plutôt que depuis son propre
 * cron : Hobby n'autorise qu'une exécution quotidienne par tâche, et ce
 * projet en déclare déjà six dans vercel.json. En ajouter une septième pour
 * une boucle qui, avec moins de huit épingles mesurées, ne produit encore
 * qu'une consigne de variété, n'en vaut pas le risque.
 *
 * Tolérante à l'absence de configuration : sans PINTEREST_ACCESS_TOKEN, elle
 * s'arrête proprement après le premier constat, sans faire échouer l'appelant
 * — la route bilan doit continuer à produire son bilan Meta même si Pinterest
 * n'est pas encore connecté.
 */
export async function executerBouclePinterest(requete?: Requete): Promise<ResultatBouclePinterest> {
  if (!configurationPinterest()) {
    return { configure: false, decouverte: null, collecte: null, nbPins: null, bloc: null, learningsEnregistres: false };
  }

  const decouverte = await decouvrirEpingles(requete);
  const collecte = decouverte.ok ? await collecterStats(requete) : null;

  const mesures = await lireMesuresPinterest();
  const { nbPins, bloc } = produireLearnings({ mesures });
  const learningsEnregistres = await enregistrerLearnings(nbPins, bloc);

  return { configure: true, decouverte, collecte, nbPins, bloc, learningsEnregistres };
}

export interface InspectionEpingle {
  pinId: string;
  reponse: unknown;
  erreur?: string;
}

export interface InspectionPinterest {
  configure: boolean;
  listeBrute?: unknown;
  erreurListe?: string;
  analytiquesBrutes?: InspectionEpingle[];
}

/**
 * Mode d'inspection — n'écrit rien en base.
 *
 * La forme des réponses Pinterest supposée par pinterest-api.ts
 * (« all.summary_metrics », pagination par « bookmark ») vient de la
 * documentation publique et n'a pas été vérifiée contre un compte réel. Cette
 * fonction renvoie les réponses telles quelles — sans les faire passer par
 * listerEpinglesTableau ni analytiquesEpingle, qui les réduisent déjà aux
 * seuls champs attendus — pour confirmer cette forme avant de faire confiance
 * aux chiffres qu'en tire collecterStats.
 *
 * Bornée à cinq épingles : le but est de vérifier une forme de réponse, pas
 * de dupliquer une collecte complète sans écrire.
 */
export async function inspecterEpingles(requete?: Requete): Promise<InspectionPinterest> {
  const config = configurationPinterest();
  if (!config) return { configure: false };

  const liste = await appelPinterest<{ items?: { id: string }[] }>(
    `/boards/${config.tableauId}/pins?page_size=25`, config, { requete },
  );
  if (!liste.ok) return { configure: true, erreurListe: liste.erreur };

  const echantillon = (liste.donnees?.items ?? []).slice(0, 5);
  const fin = new Date();
  const debut = new Date(fin);
  debut.setUTCDate(debut.getUTCDate() - 6);
  const parametres = new URLSearchParams({
    start_date: debut.toISOString().slice(0, 10),
    end_date: fin.toISOString().slice(0, 10),
    metric_types: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK',
  });

  const analytiquesBrutes = await Promise.all(echantillon.map(async (item): Promise<InspectionEpingle> => {
    const r = await appelPinterest<unknown>(
      `/pins/${encodeURIComponent(item.id)}/analytics?${parametres}`, config, { requete },
    );
    return { pinId: item.id, reponse: r.donnees, erreur: r.erreur };
  }));

  return { configure: true, listeBrute: liste.donnees, analytiquesBrutes };
}
