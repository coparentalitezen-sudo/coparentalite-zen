import 'server-only';
import { configurationPrete, statistiquesInstagram, expurger, etatReelFacebook, problemeReelFacebook } from './meta';
import { publicationsAMesurer, enregistrerMesure, reelsFacebookAVerifier } from './depot';
import { signaler } from './alertes';
import { supabaseService } from '@/lib/supabase/server';

/**
 * Relevé des statistiques Meta.
 *
 * Extrait de la route cron parce qu'il est désormais appelé de deux endroits :
 * la tâche de 21h et le bouton de l'écran d'administration. La raison de ce
 * bouton mérite d'être écrite : la table des mesures est restée vide pendant
 * plus d'un mois alors que quatorze publications étaient parties. La tâche
 * échouait chaque soir, son rapport partait dans les journaux de l'hébergeur,
 * et ces journaux sont effacés au bout d'une heure. Un échec que personne ne
 * peut lire équivaut à un échec qui n'existe pas — jusqu'au jour où l'on
 * demande une analyse de performance et qu'il n'y a rien à analyser.
 *
 * Le motif d'échec est donc remonté tel quel à l'appelant, expurgé du jeton,
 * plutôt que résumé en « échec ».
 */

export interface RapportMesures {
  examinees: number;
  releves: number;
  echecs: { reference: string; erreur: string }[];
  /** Reels Facebook relus : en ligne et visibles de tous, ou pourquoi pas. */
  facebook?: { reference: string; lectures: number | null; probleme: string | null; lien: string | null }[];
  /** Renseigné quand rien n'a pu être tenté : configuration ou jeton. */
  bloquant?: string;
}

/** Publications relevées par passage, pour tenir dans la durée d'exécution. */
export const PLAFOND = 25;

export async function releverMesures(plafond = PLAFOND): Promise<RapportMesures> {
  const prete = await configurationPrete();
  if (!prete.ok) {
    return { examinees: 0, releves: 0, echecs: [], bloquant: prete.erreur };
  }
  const config = prete.donnees!;

  const publications = (await publicationsAMesurer()).slice(0, plafond);

  let releves = 0;
  const echecs: { reference: string; erreur: string }[] = [];

  for (const publication of publications) {
    const r = await statistiquesInstagram(config, publication.metaMediaId);

    if (!r.ok) {
      echecs.push({
        reference: publication.reference,
        erreur: expurger(r.erreur ?? 'inconnue', config.jeton),
      });
      continue;
    }

    const m = r.donnees ?? {};
    const somme = (...noms: string[]) => {
      const presentes = noms.filter((n) => typeof m[n] === 'number');
      if (presentes.length === 0) return null;
      return presentes.reduce((total, n) => total + m[n], 0);
    };

    const ok = await enregistrerMesure(
      { id: publication.id, source: publication.source }, {
      portee: typeof m.reach === 'number' ? m.reach : null,
      vues: typeof m.views === 'number' ? m.views : null,
      interactions: somme('likes', 'comments', 'saved'),
    });

    if (ok) releves += 1;
    else echecs.push({ reference: publication.reference, erreur: 'Écriture refusée.' });
  }

  const facebook = await verifierReelsFacebook(config, echecs);
  return { examinees: publications.length, releves, echecs, facebook };
}

/**
 * Reels Facebook : vérifie qu'ils sont bien en ligne et visibles de tous, et
 * note leurs lectures. Un Reel publié mais invisible ne se voit nulle part
 * ailleurs : sans cette relecture, « 0 vue » ne dit pas si personne ne l'a
 * regardé ou si personne ne pouvait le voir. Un problème lève une alerte.
 */
async function verifierReelsFacebook(
  config: Parameters<typeof etatReelFacebook>[0],
  echecs: { reference: string; erreur: string }[],
): Promise<NonNullable<RapportMesures['facebook']>> {
  const service = supabaseService();
  const sortie: NonNullable<RapportMesures['facebook']> = [];
  for (const reel of await reelsFacebookAVerifier()) {
    const r = await etatReelFacebook(config, reel.metaMediaId);
    if (!r.ok) {
      echecs.push({ reference: `${reel.reference} (Facebook)`, erreur: expurger(r.erreur ?? 'inconnue', config.jeton) });
      continue;
    }
    const e = r.donnees!;
    const probleme = problemeReelFacebook(e);
    sortie.push({ reference: reel.reference, lectures: e.lectures, probleme, lien: e.lien });
    await enregistrerMesure({ id: reel.id, source: 'publication' }, {
      portee: e.portee, vues: e.lectures, interactions: null,
    });
    if (probleme && service) {
      await signaler(service, {
        cle: `facebook-visibilite:${reel.reference}`,
        niveau: 'echec',
        sujet: `Reel Facebook ${reel.reference} : ${probleme}`,
        message: `Le Reel ${reel.reference} est publié côté application, mais Facebook indique : ${probleme}.`
          + (e.lien ? `\nLien : ${e.lien}` : ''),
      });
    }
  }
  console.info('[mesures] reels facebook', JSON.stringify(sortie));
  return sortie;
}
