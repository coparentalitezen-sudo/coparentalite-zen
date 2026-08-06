import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { configEmail, gabaritNotification, envoyerEmail } from '@/lib/email';

/**
 * Acheminement des notifications par courriel.
 *
 * Frère jumeau de l'acheminement des notifications poussées, et pour cause :
 * même file, mêmes préférences, même trace empêchant le double envoi. Seule
 * la remise diffère.
 *
 * Réservé à la tâche planifiée : la file couvre tous les foyers.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reponse(corps: unknown, statut = 200) {
  return NextResponse.json(corps, { status: statut });
}

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

export async function GET(requete: Request) {
  const config = configEmail();
  if (!config) return reponse({ message: 'Envoi de courriels non configuré.' }, 503);
  if (!autorise(requete)) return reponse({ message: 'Non autorisé.' }, 401);

  const service = supabaseService();
  if (!service) return reponse({ message: 'Clé de service absente.' }, 503);

  const bilan = { envoyes: 0, echecs: 0 };

  try {
    const { data, error } = await service.rpc('notifications_a_envoyer_email', { p_limite: 100 });
    if (error) throw new Error(error.message);

    for (const l of (data ?? []) as Record<string, string>[]) {
      // Le prénom d'usage suffit : ces messages se lisent en trois secondes.
      const prenom = (l.prenom ?? '').split(' ')[0] || 'bonjour';
      const lien = l.href && config.origine ? `${config.origine}${l.href}` : null;
      const { html, texte } = gabaritNotification(prenom, l.titre, l.corps ?? null, lien);

      const souci = await envoyerEmail(config, l.destinataire, l.titre, html, texte);

      if (souci === null) {
        bilan.envoyes += 1;
        await service.rpc('tracer_envoi_email', {
          p_notification: l.id, p_statut: 'envoye',
        });
      } else {
        bilan.echecs += 1;
        // Tracer l'échec vaut mieux que de réessayer indéfiniment : une adresse
        // fautive bloquerait toute la file derrière elle.
        await service.rpc('tracer_envoi_email', {
          p_notification: l.id, p_statut: 'echec', p_message: souci,
        });
      }
    }
    return reponse(bilan);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[email]', message);
    return reponse({ message: 'Acheminement impossible.', cause: message }, 502);
  }
}
