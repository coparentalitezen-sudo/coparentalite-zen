import 'server-only';
import { configEmail, envoyerEmail } from '@/lib/email';
import { administrateurs } from '@/lib/marketing/administration';
import { expurger } from '@/lib/marketing/meta';

/**
 * Alertes d'exploitation : échec de rendu, de contrôle ou de publication,
 * suspension automatique, récapitulatif de la semaine.
 *
 * Écrites en base par quiconque constate le problème (le rendu dans GitHub
 * Actions comme la publication dans Vercel), envoyées par Vercel seul : c'est
 * lui qui détient la clé de messagerie. Une clé unique par alerte : la même
 * panne constatée à chaque passage horaire n'envoie qu'un message.
 *
 * Les messages passent par expurger() : aucun jeton ne doit sortir dans un
 * courriel, même tronqué.
 */

export type NiveauAlerte = 'echec' | 'suspension' | 'recapitulatif' | 'information';
export interface Alerte { cle: string; niveau: NiveauAlerte; sujet: string; message: string }

interface ClientAlertes {
  from(table: 'marketing_alertes'): {
    upsert(ligne: object, o: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export async function signaler(service: ClientAlertes, a: Alerte): Promise<void> {
  const { error } = await service.from('marketing_alertes').upsert({
    cle: a.cle.slice(0, 200), niveau: a.niveau,
    sujet: expurger(a.sujet).slice(0, 200), message: expurger(a.message).slice(0, 4000),
  }, { onConflict: 'cle', ignoreDuplicates: true });
  if (error) console.error('[alertes] enregistrement impossible', error.message);
}

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Envoie par courriel les alertes en attente, à chaque adresse de ADMIN_EMAILS. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function envoyerAlertesEnAttente(service: any): Promise<{ envoyees: number; motif?: string }> {
  const config = configEmail();
  const destinataires = administrateurs();
  const { data: alertes } = await service.from('marketing_alertes')
    .select('id, niveau, sujet, message').is('envoyee_le', null)
    .order('created_at', { ascending: true }).limit(20);
  if (!alertes?.length) return { envoyees: 0 };
  if (!config || destinataires.length === 0) {
    const motif = !config ? 'Courriel non configuré (RESEND_API_KEY).' : 'ADMIN_EMAILS vide.';
    for (const a of alertes) await service.from('marketing_alertes').update({ erreur_envoi: motif }).eq('id', a.id);
    return { envoyees: 0, motif };
  }
  let envoyees = 0;
  for (const a of alertes as { id: string; niveau: string; sujet: string; message: string }[]) {
    const prefixe = a.niveau === 'echec' ? '⚠️ ' : a.niveau === 'suspension' ? '⛔ ' : '';
    const objet = `${prefixe}Coparentalité Zen — ${a.sujet}`;
    const lien = `${config.origine}/admin/videos`;
    const html = `<!doctype html><html lang="fr"><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#FAF7F2;margin:0">
      <div style="max-width:560px;margin:0 auto;padding:28px 20px"><div style="background:#fff;border-radius:18px;padding:22px">
      <h1 style="font-size:18px;margin:0 0 12px;color:#101B2C">${echapper(a.sujet)}</h1>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5;color:#3E4C5A;margin:0">${echapper(a.message)}</pre>
      <p style="margin:20px 0 0"><a href="${echapper(lien)}" style="background:#4E6381;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;display:inline-block;font-weight:700">Ouvrir l’administration</a></p>
      </div></div></body></html>`;
    const texte = `${a.sujet}\n\n${a.message}\n\n${lien}`;
    let erreur: string | null = null;
    for (const d of destinataires) erreur = (await envoyerEmail(config, d, objet, html, texte)) ?? erreur;
    await service.from('marketing_alertes').update(
      erreur ? { erreur_envoi: expurger(erreur, config.cle) } : { envoyee_le: new Date().toISOString(), erreur_envoi: null },
    ).eq('id', a.id);
    if (!erreur) envoyees += 1;
  }
  return { envoyees };
}
