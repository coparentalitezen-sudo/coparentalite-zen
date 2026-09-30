'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import {
  majParametres, majStatut, corrigerLegende, type Statut,
  type Plateforme,
} from '@/lib/marketing/depot';
import { publierContenu } from '@/lib/marketing/publication';
import { releverMesures } from '@/lib/marketing/releve';
import { executerPublicationPlanifiee } from '@/lib/marketing/planification';

/**
 * Contrôle d'accès des actions.
 *
 * Refait à chaque appel, et non hérité de la page qui les a affichées : une
 * action serveur est une adresse joignable directement, indépendamment de
 * l'écran qui la propose. Vérifier une seule fois à l'affichage laisserait la
 * porte ouverte à qui connaît le nom de l'action.
 */
async function exigerAdministrateur(): Promise<boolean> {
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return estAdministrateur(user?.email);
}

export async function actionStatut(
  reference: string, statut: Statut, motif?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const ok = await majStatut(reference, statut, motif);
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'L’enregistrement n’a pas abouti.' };
}

/** Validation groupée : c'est l'usage réel, une fois par semaine. */
export async function actionValiderTout(
  references: string[],
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  for (const r of references) {
    if (!await majStatut(r, 'valide')) {
      return { ok: false, message: `Échec sur ${r}. Les précédents sont validés.` };
    }
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function actionLegende(
  reference: string, plateforme: 'instagram' | 'facebook', texte: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  if (!texte.trim()) return { ok: false, message: 'Une légende vide ne serait pas publiable.' };
  const ok = await corrigerLegende(reference, plateforme, texte);
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'La correction n’a pas abouti.' };
}

/** Interrupteur d'un canal, ou arrêt d'urgence commun avec « global ». */
export async function actionSuspendre(
  plateforme: Plateforme, actif: boolean, motif?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const ok = await majParametres({
    plateforme, actif,
    suspenduMotif: actif ? null : (motif ?? 'Suspendu manuellement'),
  });
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'Le réglage n’a pas été enregistré.' };
}

export async function actionMode(
  plateforme: Exclude<Plateforme, 'global'>, mode: 'validation' | 'automatique',
): Promise<{ ok: boolean; message?: string }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };
  const ok = await majParametres({ plateforme, mode });
  if (ok) revalidatePath('/admin');
  return { ok, message: ok ? undefined : 'Le réglage n’a pas été enregistré.' };
}

/**
 * Publication déclenchée depuis l'interface.
 *
 * Appelle directement la logique partagée. La version précédente passait par
 * un appel HTTP de l'application vers sa propre route, en recopiant les
 * cookies de session : la session ne se transmettait pas, la route répondait
 * 404, et l'aller-retour n'apportait rien puisque les droits venaient d'être
 * vérifiés ici même.
 */
export async function actionPublier(
  reference: string, plateforme: 'instagram' | 'facebook',
): Promise<{ ok: boolean; message?: string; metaId?: string | null }> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };

  const r = await publierContenu(reference, plateforme);
  if (!r.ok) {
    return {
      ok: false,
      message: r.dejaPublie
        ? `Déjà publié — identifiant Meta ${r.metaId ?? 'inconnu'}.`
        : (r.erreur ?? 'Échec sans message.'),
    };
  }

  revalidatePath('/admin');
  return { ok: true, metaId: r.metaId ?? null };
}

/**
 * Relevé des mesures déclenché depuis l'interface.
 *
 * La tâche de 21h faisait déjà ce travail, mais son rapport partait dans les
 * journaux de l'hébergeur, effacés au bout d'une heure. Résultat : la table
 * des mesures est restée vide plus d'un mois sans que rien ne le signale.
 * Ce bouton rend l'échec lisible par celui qui peut le corriger.
 */
export async function actionReleverMesures(): Promise<{
  ok: boolean; message: string;
}> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };

  const r = await releverMesures();

  if (r.bloquant) return { ok: false, message: r.bloquant };

  if (r.examinees === 0) {
    return { ok: false, message: 'Aucune publication Instagram à relever.' };
  }

  revalidatePath('/admin/mesures');

  if (r.releves === 0) {
    // Le premier motif suffit : quand Meta refuse, il refuse pareil partout,
    // et afficher vingt fois la même phrase n'apprend rien de plus.
    return {
      ok: false,
      message: `Aucun relevé sur ${r.examinees} publications — ${r.echecs[0]?.erreur ?? 'motif inconnu'}`,
    };
  }

  const reste = r.echecs.length
    ? ` ${r.echecs.length} en échec — ${r.echecs[0].erreur}`
    : '';
  return { ok: true, message: `${r.releves} relevés sur ${r.examinees}.${reste}` };
}

/**
 * Rejoue la tâche de publication quotidienne et affiche ce qu'elle a fait.
 *
 * Même motif que le relevé des mesures : sans retour à l'écran, une chaîne qui
 * s'arrête ne se remarque qu'au bout de plusieurs jours, et son motif a déjà
 * disparu des journaux de l'hébergeur.
 */
export async function actionPublierPlanifie(): Promise<{
  ok: boolean; message: string;
}> {
  if (!await exigerAdministrateur()) return { ok: false, message: 'Accès refusé.' };

  const r = await executerPublicationPlanifiee();
  revalidatePath('/admin/mesures');

  const partis = r.rapports.filter((x) => x.publie);
  if (partis.length > 0) {
    return {
      ok: true,
      message: `Publié via ${r.source} sur ${partis.map((x) => x.plateforme).join(' et ')}.`,
    };
  }

  // Le premier motif suffit : quand la chaîne s'arrête, elle s'arrête pour la
  // même raison partout, et répéter la phrase n'apprend rien de plus.
  const motif = r.motif ?? r.rapports.find((x) => x.motif)?.motif ?? 'aucun motif retourné';
  return { ok: false, message: `Rien publié (${r.source}) — ${motif}` };
}
