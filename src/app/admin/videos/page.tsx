import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseService } from '@/lib/supabase/server';
import { estAdministrateurConnecte } from '@/lib/youtube/acces';
import { decalerJour, jourParis } from '@/lib/marketing/horaire';
import { SEAU_VIDEOS, type Controle } from '@/lib/marketing/videos';
import { Suspendre, Reactiver, ChoixHeure, Rerendre, Republier, ConfirmerAbsente } from './commandes';

/**
 * Publication automatique des vidéos : à regarder APRÈS coup.
 *
 * Rien ici n'est nécessaire pour que les vidéos partent : les contrôles
 * bloquants remplacent la validation. L'écran sert à voir ce qui est parti,
 * pourquoi quelque chose n'est pas parti, et à tout arrêter d'un geste.
 *
 * Les vidéos sont dans un espace privé : le lecteur reçoit une adresse signée
 * de dix minutes, créée à l'affichage de la page, jamais enregistrée.
 */
export const dynamic = 'force-dynamic';

const NOMS: Record<string, string> = { global: 'Toutes les plateformes', instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', pinterest: 'Pinterest' };
const STATUTS_VIDEO: Record<string, string> = { a_rendre: 'À rendre', en_cours: 'Rendu en cours', prete: 'Prête, contrôles verts', echec: 'Refusée' };
const STATUTS_PUB: Record<string, string> = { publiee: 'Publiée', envoyee: 'Envoi en cours', echec: 'Échec', a_verifier: 'À vérifier', en_attente: 'En attente', en_cours: 'En cours', abandonnee: 'Abandonnée' };

interface Pub { plateforme: string; statut: string; id: string | null; erreur: string | null; lien: string | null }

export default async function PageVideos() {
  if (!await estAdministrateurConnecte()) notFound();
  const service = supabaseService();
  if (!service) notFound();
  const aujourdhui = jourParis();

  const [{ data: reglages }, { data: videos }, { data: alertes }] = await Promise.all([
    service.from('marketing_parametres').select('plateforme, actif, mode, suspendu_motif, heure, echecs_consecutifs').order('plateforme'),
    service.from('marketing_videos').select('cle, source, jour, reference, statut, controles, chemin_video, chemin_affiche, duree, erreur, tentatives, rendue_le')
      .gte('jour', decalerJour(aujourdhui, -14)).order('jour', { ascending: false }).limit(40),
    service.from('marketing_alertes').select('niveau, sujet, message, envoyee_le, erreur_envoi, created_at')
      .order('created_at', { ascending: false }).limit(15),
  ]);

  const cles = (videos ?? []).map((v) => v.cle);
  const jours = (videos ?? []).filter((v) => v.source === 'youtube').map((v) => `short-${v.jour}`);
  const [{ data: pubsMeta }, { data: shorts }] = await Promise.all([
    cles.length ? service.from('marketing_publications').select('cle_idempotence, plateforme, statut, meta_media_id, derniere_erreur')
      .in('cle_idempotence', cles.flatMap((c) => [`${c}:instagram`, `${c}:facebook`])) : Promise.resolve({ data: [] }),
    jours.length ? service.from('marketing_youtube_shorts').select('cle_idempotence, statut, video_id, erreur_message, visibilite_obtenue')
      .in('cle_idempotence', jours) : Promise.resolve({ data: [] }),
  ]);

  const publications = (cle: string, source: string, jour: string): Pub[] => {
    if (source === 'youtube') {
      const s = (shorts ?? []).find((x) => x.cle_idempotence === `short-${jour}`);
      return [{ plateforme: 'youtube', statut: s?.statut ?? 'absente', id: s?.video_id ?? null,
        erreur: s?.erreur_message ?? null, lien: s?.video_id ? `https://youtu.be/${s.video_id}` : null }];
    }
    return (['instagram', 'facebook'] as const).map((p) => {
      const m = (pubsMeta ?? []).find((x) => x.cle_idempotence === `${cle}:${p}`);
      return { plateforme: p, statut: m?.statut ?? 'absente', id: m?.meta_media_id ?? null, erreur: m?.derniere_erreur ?? null,
        lien: m?.meta_media_id && p === 'facebook' ? `https://www.facebook.com/${m.meta_media_id}` : null };
    });
  };

  // Adresses signées de 10 minutes, pour le seul affichage de cette page.
  const signer = async (chemin: string | null) => {
    if (!chemin) return null;
    const { data } = await service.storage.from(SEAU_VIDEOS).createSignedUrl(chemin, 600);
    return data?.signedUrl ?? null;
  };
  const lecteurs = await Promise.all((videos ?? []).map(async (v) => ({
    cle: v.cle, video: await signer(v.chemin_video), affiche: await signer(v.chemin_affiche),
  })));

  const global = (reglages ?? []).find((r) => r.plateforme === 'global');
  const canaux = (reglages ?? []).filter((r) => r.plateforme !== 'global');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <Link href="/admin" className="text-sm font-bold text-navy-text underline">Administration</Link>
        <h1 className="font-display text-2xl font-semibold">Publication automatique</h1>
        <p className="text-sm text-soft">Rien ne part sans que tous les contrôles d’une vidéo soient verts. Cet écran sert à regarder après coup et à tout arrêter.</p>
      </header>

      <section className={`card space-y-3 p-4 ${global?.actif ? '' : 'border-2 border-err'}`}>
        <h2 className="font-bold">Arrêt d’urgence</h2>
        <p className="text-sm">
          {global?.actif ? <>Publication automatique <strong>en service</strong>.</>
            : <><strong className="text-err">Tout est suspendu</strong>{global?.suspendu_motif ? ` — ${global.suspendu_motif}` : ''}.</>}
        </p>
        {global?.actif
          ? <Suspendre plateforme="global" libelle="Tout suspendre" />
          : <Reactiver plateforme="global" libelle="Reprendre toutes les publications" />}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Plateformes</h2>
        <ul className="divide-y divide-line">
          {canaux.map((r) => (
            <li key={r.plateforme} className="space-y-2 py-3">
              <p className="text-sm">
                <strong>{NOMS[r.plateforme] ?? r.plateforme}</strong> — {r.actif ? (r.mode === 'automatique' ? 'automatique' : 'mode validation') : <span className="text-err">suspendu</span>}
                {r.plateforme !== 'tiktok' && r.plateforme !== 'pinterest' && <> · à partir de {r.heure ?? 10} h</>}
                {r.echecs_consecutifs > 0 && <span className="text-err"> · {r.echecs_consecutifs} échec(s) consécutif(s)</span>}
              </p>
              {!r.actif && r.suspendu_motif && <p className="text-sm text-soft">{r.suspendu_motif}</p>}
              {r.plateforme === 'tiktok' ? (
                <p className="text-xs text-soft">Bloqué volontairement : aucune solution officielle de TikTok ne permet une publication sans geste humain à chaque vidéo. Les autres plateformes ne sont pas concernées.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {r.plateforme !== 'pinterest' && <ChoixHeure plateforme={r.plateforme} heure={r.heure ?? 10} />}
                  {r.actif ? <Suspendre plateforme={r.plateforme} libelle={`Suspendre ${NOMS[r.plateforme] ?? r.plateforme}`} />
                    : <Reactiver plateforme={r.plateforme} libelle={`Réactiver ${NOMS[r.plateforme] ?? r.plateforme}`} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Vidéos</h2>
        {(videos ?? []).length === 0 && <p className="text-sm text-soft">Aucune vidéo rendue pour le moment.</p>}
        <ul className="space-y-6">
          {(videos ?? []).map((v) => {
            const l = lecteurs.find((x) => x.cle === v.cle);
            const controles = ((v.controles as { controles?: Controle[] } | null)?.controles ?? []);
            const pubs = publications(v.cle, v.source, v.jour);
            return (
              <li key={v.cle} className="space-y-2 border-t border-line pt-4 first:border-0 first:pt-0">
                <p className="text-sm">
                  <strong>{v.jour}</strong> · {v.source === 'youtube' ? 'Short du jour' : 'Reel'} · <code>{v.cle}</code>
                </p>
                <p className={`text-sm font-bold ${v.statut === 'echec' ? 'text-err' : v.statut === 'prete' ? 'text-ok' : 'text-soft'}`}>
                  {STATUTS_VIDEO[v.statut] ?? v.statut}{v.duree ? ` · ${v.duree} s` : ''}{v.tentatives > 1 ? ` · ${v.tentatives} rendus` : ''}
                </p>
                {v.erreur && <p className="text-sm text-err">{v.erreur}</p>}
                {l?.video && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video controls preload="none" playsInline poster={l.affiche ?? undefined} src={l.video}
                    className="aspect-[9/16] w-full max-w-xs rounded-xl bg-ink" />
                )}
                {controles.length > 0 && (
                  <ul className="flex flex-wrap gap-1 text-xs">
                    {controles.map((c) => (
                      <li key={c.nom} title={c.detail || undefined}
                        className={`rounded-full px-2 py-1 ${c.ok ? 'bg-ok-bg text-ok' : 'bg-err-bg text-err'}`}>
                        {c.ok ? '✓' : '✗'} {c.nom}{c.mesure !== null && c.mesure !== undefined && typeof c.mesure !== 'object' ? ` ${String(c.mesure)}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="space-y-1 text-sm">
                  {pubs.map((p) => (
                    <li key={p.plateforme} className="space-y-1">
                      <p>
                        {NOMS[p.plateforme]} : <strong>{STATUTS_PUB[p.statut] ?? (p.statut === 'absente' ? 'pas encore publiée' : p.statut)}</strong>
                        {p.lien && <> — <a className="text-navy-text underline" href={p.lien} target="_blank" rel="noreferrer">voir</a></>}
                        {!p.lien && p.id && <> — identifiant {p.id}</>}
                      </p>
                      {p.erreur && p.statut !== 'publiee' && <p className="text-xs text-err">{p.erreur}</p>}
                      {v.statut === 'prete' && (p.statut === 'echec' || p.statut === 'absente') && v.jour <= aujourdhui
                        && (p.plateforme !== 'youtube' || v.jour === aujourdhui)
                        && <Republier cle={v.cle} plateforme={p.plateforme as 'instagram' | 'facebook' | 'youtube'} />}
                      {p.statut === 'a_verifier' && p.plateforme !== 'youtube'
                        && <ConfirmerAbsente cle={v.cle} plateforme={p.plateforme as 'instagram' | 'facebook'} />}
                    </li>
                  ))}
                </ul>
                {v.statut !== 'en_cours' && !pubs.some((p) => ['publiee', 'envoyee', 'a_verifier', 'en_cours'].includes(p.statut))
                  && <Rerendre cle={v.cle} />}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-bold">Alertes récentes</h2>
        {(alertes ?? []).length === 0 && <p className="text-sm text-soft">Aucune alerte.</p>}
        <ul className="divide-y divide-line">
          {(alertes ?? []).map((a) => (
            <li key={`${a.created_at}-${a.sujet}`} className="py-2 text-sm">
              <p className={`font-bold ${a.niveau === 'echec' || a.niveau === 'suspension' ? 'text-err' : ''}`}>{a.sujet}</p>
              <p className="whitespace-pre-wrap text-soft">{a.message.slice(0, 600)}</p>
              <p className="text-xs text-soft">
                {new Date(a.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · {a.envoyee_le ? 'envoyée par courriel' : a.erreur_envoi ? `non envoyée : ${a.erreur_envoi}` : 'en attente d’envoi'}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
