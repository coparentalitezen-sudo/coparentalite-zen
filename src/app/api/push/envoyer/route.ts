import { NextResponse } from 'next/server';
import { supabaseService, supabaseServer } from '@/lib/supabase/server';
import { configPush, envoyerPush } from '@/lib/push';

/**
 * Acheminement des notifications en attente vers les appareils abonnés.
 *
 * Appelée par une tâche planifiée fréquente, ou à la demande par un membre
 * connecté. Chaque envoi laisse une trace : une notification déjà poussée ne
 * l'est jamais deux fois, quel que soit le nombre de passages.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reponse(corps: unknown, statut = 200) {
  return new NextResponse(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function autorise(requete: Request): Promise<boolean> {
  const attendu = process.env.CRON_SECRET;
  if (attendu && requete.headers.get('authorization') === `Bearer ${attendu}`) return true;
  const supabase = await supabaseServer();
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return Boolean(user);
}

export async function GET(requete: Request) {
  const config = configPush();
  if (!config) {
    return reponse({ message: 'Notifications poussées non configurées.' }, 503);
  }
  if (!(await autorise(requete))) {
    return reponse({ message: 'Non autorisé.' }, 401);
  }
  const service = supabaseService();
  if (!service) return reponse({ message: 'Clé de service absente.' }, 503);

  const bilan = { envoyees: 0, expirees: 0, echecs: 0 };

  try {
    const { data, error } = await service.rpc('notifications_a_pousser', { p_limite: 100 });
    if (error) throw new Error(error.message);

    for (const l of (data ?? []) as Record<string, string>[]) {
      // La colonne non_lues vient de la migration 00047. Une base non encore
      // migrée la renvoie absente : Number(undefined) vaut NaN, écarté ici,
      // et le service worker retombe sur son incrément. L'acheminement ne
      // doit pas dépendre de l'ordre des déploiements.
      const brut = Number(l.non_lues);
      const nonLues = Number.isFinite(brut) && brut >= 0 ? brut : null;

      const r = await envoyerPush(config,
        { endpoint: l.endpoint, p256dh: l.p256dh, auth: l.auth },
        { titre: l.titre, corps: l.corps, href: l.href, nonLues });

      if (r.statut === 'envoye') {
        bilan.envoyees += 1;
        await service.rpc('tracer_envoi_push', {
          p_notification: l.notification_id, p_statut: 'envoye',
        });
      } else if (r.statut === 'expire') {
        // L'application a été désinstallée ou la permission révoquée :
        // conserver l'abonnement ferait échouer chaque envoi suivant.
        bilan.expirees += 1;
        await service.from('push_subscriptions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('endpoint', l.endpoint);
      } else {
        bilan.echecs += 1;
        await service.rpc('tracer_envoi_push', {
          p_notification: l.notification_id, p_statut: 'echec', p_message: r.message,
        });
      }
    }
    return reponse(bilan);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[push]', message);
    return reponse({ message: 'Acheminement impossible.', cause: message }, 502);
  }
}
