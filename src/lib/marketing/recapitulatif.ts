import 'server-only';
import { signaler } from './alertes';
import { decalerJour } from './horaire';

/**
 * Récapitulatif hebdomadaire, envoyé le lundi matin : ce qui est parti la
 * semaine passée, sur quelle plateforme, avec le lien quand il existe, et ce
 * qui a échoué. Construit depuis la base, jamais depuis la mémoire d'un
 * passage : une semaine où la tâche a redémarré dix fois donne le même texte.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function preparerRecapitulatif(service: any, aujourdhui: string): Promise<string> {
  const depuis = decalerJour(aujourdhui, -7);
  const [{ data: meta }, { data: yt }, { data: videos }] = await Promise.all([
    service.from('marketing_publications')
      .select('plateforme, statut, meta_media_id, derniere_erreur, publie_le, updated_at, marketing_contenus(reference, format)')
      .gte('updated_at', `${depuis}T00:00:00Z`).order('updated_at'),
    service.from('marketing_youtube_shorts')
      .select('jour, statut, video_id, titre, erreur_message, essai').gte('jour', depuis).lt('jour', aujourdhui).order('jour'),
    service.from('marketing_videos')
      .select('cle, jour, statut, erreur, controles').gte('jour', depuis).lt('jour', aujourdhui).order('jour'),
  ]);
  const lignes: string[] = [`Semaine du ${depuis} au ${decalerJour(aujourdhui, -1)}`, ''];
  const publiees: string[] = [], echecs: string[] = [];
  for (const p of (meta ?? []) as { plateforme: string; statut: string; meta_media_id: string | null; derniere_erreur: string | null; publie_le: string | null; marketing_contenus: { reference: string; format: string } | null }[]) {
    const ref = p.marketing_contenus?.reference ?? '?';
    const lien = p.plateforme === 'facebook' && p.meta_media_id ? ` — https://www.facebook.com/${p.meta_media_id}` : p.meta_media_id ? ` — id ${p.meta_media_id}` : '';
    if (p.statut === 'publiee') publiees.push(`• ${p.plateforme} · ${ref} (${p.marketing_contenus?.format ?? ''})${lien}`);
    else if (p.statut === 'echec' || p.statut === 'a_verifier') echecs.push(`• ${p.plateforme} · ${ref} : ${p.statut} — ${p.derniere_erreur ?? ''}`);
  }
  for (const s of (yt ?? []) as { jour: string; statut: string; video_id: string | null; titre: string; erreur_message: string | null; essai: boolean }[]) {
    if (s.essai) continue;
    if (s.statut === 'publiee') publiees.push(`• youtube · ${s.jour} « ${s.titre} » — https://youtu.be/${s.video_id}`);
    else echecs.push(`• youtube · ${s.jour} : ${s.statut} — ${s.erreur_message ?? ''}`);
  }
  for (const v of (videos ?? []) as { cle: string; jour: string; statut: string; erreur: string | null; controles: { controles?: { nom: string; ok: boolean }[] } | null }[]) {
    if (v.statut !== 'echec') continue;
    const ko = (v.controles?.controles ?? []).filter((c) => !c.ok).map((c) => c.nom).join(', ');
    echecs.push(`• vidéo ${v.cle} (${v.jour}) refusée au rendu : ${ko || v.erreur || 'erreur'}`);
  }
  lignes.push(`Publié (${publiees.length}) :`, ...(publiees.length ? publiees : ['• rien']), '');
  lignes.push(`Échecs et points à vérifier (${echecs.length}) :`, ...(echecs.length ? echecs : ['• aucun']));
  return lignes.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function programmerRecapitulatif(service: any, aujourdhui: string, semaine: string): Promise<void> {
  const message = await preparerRecapitulatif(service, aujourdhui);
  await signaler(service, { cle: `recapitulatif:${semaine}`, niveau: 'recapitulatif', sujet: 'Récapitulatif de la semaine', message });
}
