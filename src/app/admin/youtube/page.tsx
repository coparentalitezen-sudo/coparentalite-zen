import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseService } from '@/lib/supabase/server';
import { estAdministrateurConnecte } from '@/lib/youtube/acces';
import { configOAuth, CHAINE_ATTENDUE } from '@/lib/youtube/oauth';
import { cleDeChiffrement } from '@/lib/youtube/chiffrement';
import { shortDuJour, titreDuShort, jourAParis } from '@/lib/youtube/short';
import { lireParametresPlateforme } from '@/lib/marketing/depot';
import { Interrupteur, ChoixVisibilite, BoutonEssai, BoutonDeconnecter } from './commandes';

/**
 * Pilotage des YouTube Shorts.
 *
 * Aucun jeton n'est lu pour cet affichage : la requête ne sélectionne que
 * l'état, la chaîne et les dates. Les vues viennent du relevé de la tâche
 * quotidienne ; tant qu'il n'a pas eu lieu, elles sont annoncées comme
 * inconnues, pas comme nulles.
 */
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { ok: boolean; texte: string }> = {
  ok: { ok: true, texte: 'Chaîne connectée et vérifiée.' },
  refusee: { ok: false, texte: 'Autorisation refusée sur l’écran de Google.' },
  state: { ok: false, texte: 'Retour refusé : session expirée ou lien invalide. Recommencez depuis ce bouton.' },
  configuration: { ok: false, texte: 'Variables YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET ou YOUTUBE_TOKEN_KEY absentes.' },
  autorisations: { ok: false, texte: 'Les deux autorisations demandées sont nécessaires : recommencez sans en décocher.' },
  'sans-rafraichissement': { ok: false, texte: 'Google n’a pas remis de jeton durable. Recommencez la connexion.' },
  'mauvaise-chaine': { ok: false, texte: `La chaîne choisie n’est pas Coparentalité Zen (${CHAINE_ATTENDUE}). Rien n’a été enregistré.` },
  enregistrement: { ok: false, texte: 'L’enregistrement de la connexion a échoué.' },
  google: { ok: false, texte: 'Google a refusé l’échange. Vérifiez l’URI de redirection déclarée.' },
};

const STATUTS: Record<string, string> = {
  en_attente: 'En attente', en_cours: 'En cours', publiee: 'Publiée',
  echec: 'Échec', a_verifier: 'À vérifier',
};

/** Prochain passage de la tâche (08:00 UTC), affiché à l'heure de Paris. */
function prochainPassage(maintenant = new Date()): string {
  const p = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate(), 8));
  if (p <= maintenant) p.setUTCDate(p.getUTCDate() + 1);
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(p);
}

export default async function PageYoutube({
  searchParams,
}: { searchParams: Promise<{ connexion?: string }> }) {
  if (!await estAdministrateurConnecte()) notFound();
  const service = supabaseService();
  if (!service) notFound();
  const { connexion: retourConnexion } = await searchParams;

  const [{ data: connexion }, { data: shorts }, { data: journal }, { data: visites }, global, reglages] =
    await Promise.all([
      service.from('marketing_youtube_connexion')
        .select('etat, chaine_id, chaine_titre, visibilite, connecte_le, derniere_erreur, scopes')
        .eq('id', true).maybeSingle(),
      service.from('marketing_youtube_shorts')
        .select('jour, essai, titre, statut, video_id, visibilite_obtenue, erreur_message, publie_le, vues, tentatives')
        .order('created_at', { ascending: false }).limit(30),
      service.from('marketing_journal').select('jour, publie, rapport, created_at')
        .eq('tache', 'youtube').order('created_at', { ascending: false }).limit(1),
      service.from('marketing_visites').select('clics').eq('source', 'youtube'),
      lireParametresPlateforme('global'),
      lireParametresPlateforme('youtube'),
    ]);

  const configure = Boolean(configOAuth()) && Boolean(cleDeChiffrement());
  const active = connexion?.etat === 'active';
  const quotidiens = (shorts ?? []).filter((s) => !s.essai);
  const dernier = quotidiens.find((s) => s.statut === 'publiee');
  const aTraiter = (shorts ?? []).filter((s) => s.statut === 'echec' || s.statut === 'a_verifier'
    || (s.visibilite_obtenue === 'private' && Boolean(s.erreur_message)));
  const vues = (shorts ?? []).reduce((t, s) => t + (s.vues ?? 0), 0);
  const vuesConnues = (shorts ?? []).some((s) => s.vues !== null);
  const clics = (visites ?? []).reduce((t, v) => t + (v.clics ?? 0), 0);
  const aujourdhui = shortDuJour(jourAParis());
  const passage = journal?.[0] as { jour: string; publie: boolean; created_at: string; rapport: { motif?: string; statut?: string } } | undefined;
  const message = retourConnexion ? MESSAGES[retourConnexion] : null;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <Link href="/admin" className="text-sm font-bold text-navy-text underline">Administration</Link>
        <h1 className="font-display text-2xl font-semibold">YouTube Shorts</h1>
      </header>

      {message && (
        <p role="status" className={`rounded-xl px-3 py-2 text-sm font-bold ${message.ok ? 'bg-ok-bg text-ok' : 'bg-err-bg text-err'}`}>
          {message.texte}
        </p>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Connexion</h2>
        {!configure && (
          <p className="text-sm text-err">
            Configuration absente sur Vercel : YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET et YOUTUBE_TOKEN_KEY.
          </p>
        )}
        <p className="text-sm">
          État : <strong>{active ? 'active' : connexion?.etat === 'revoquee' ? 'expirée ou révoquée' : 'non connectée'}</strong>
          {connexion?.chaine_titre && <> — chaîne « {connexion.chaine_titre} »</>}
        </p>
        {connexion?.derniere_erreur && <p className="text-sm text-err">{connexion.derniere_erreur}</p>}
        {configure && (
          <a href="/api/youtube/oauth/demarrer" className="btn btn-primary w-full">
            {active ? 'Reconnecter la chaîne' : 'Connecter la chaîne YouTube'}
          </a>
        )}
        {active && <BoutonDeconnecter />}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Publication quotidienne</h2>
        <p className="text-sm">
          Canal YouTube : <strong>{reglages?.actif ? 'activé' : 'arrêté'}</strong>
          {!reglages?.actif && reglages?.suspenduMotif && <> — {reglages.suspenduMotif}</>}
          {!global?.actif && <span className="text-err"> · arrêt général de toutes les publications en vigueur</span>}
        </p>
        <p className="text-sm text-soft">
          Prochain passage : {prochainPassage()} (rattrapage à 16 h UTC si besoin).
          Short prévu aujourd’hui : « {titreDuShort(aujourdhui)} ».
        </p>
        <p className="text-sm text-soft">
          Dernier Short publié : {dernier ? `${dernier.jour}${dernier.video_id ? ` (${dernier.video_id})` : ''}` : 'aucun'}.
          {passage && <> Dernier passage : {new Date(passage.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
            {' '}— {passage.publie ? 'publié' : (passage.rapport.motif ?? passage.rapport.statut ?? 'rien publié')}.</>}
        </p>
        <Interrupteur actif={Boolean(reglages?.actif)} />
        {active && <ChoixVisibilite valeur={connexion?.visibilite ?? 'private'} />}
        {active && <BoutonEssai />}
      </section>

      <section className="grid grid-cols-3 gap-2">
        <div className="card p-3"><p className="text-xs text-soft">Shorts publiés</p>
          <p className="text-xl font-bold">{quotidiens.filter((s) => s.statut === 'publiee').length}</p></div>
        <div className="card p-3"><p className="text-xs text-soft">Vues</p>
          <p className="text-xl font-bold">{vuesConnues ? vues : '—'}</p></div>
        <div className="card p-3"><p className="text-xs text-soft">Visites du site</p>
          <p className="text-xl font-bold">{clics}</p></div>
      </section>

      {aTraiter.length > 0 && (
        <section className="card space-y-2 border-2 border-err p-4">
          <h2 className="font-bold text-err">À traiter</h2>
          {aTraiter.map((s) => (
            <p key={`${s.jour}-${s.titre}`} className="text-sm">
              {s.jour} — {STATUTS[s.statut] ?? s.statut} : {s.erreur_message ?? 'sans message'}
            </p>
          ))}
        </section>
      )}

      <section className="card space-y-2 p-4">
        <h2 className="font-bold">Historique</h2>
        {(shorts ?? []).length === 0 && <p className="text-sm text-soft">Aucun Short pour le moment.</p>}
        <ul className="divide-y divide-line">
          {(shorts ?? []).map((s) => (
            <li key={`${s.jour}-${s.publie_le ?? s.titre}-${s.essai}`} className="py-2 text-sm">
              <p className="font-bold">{s.titre}</p>
              <p className="text-soft">
                {s.jour}{s.essai ? ' · essai' : ''} · {STATUTS[s.statut] ?? s.statut}
                {s.visibilite_obtenue ? ` · ${s.visibilite_obtenue}` : ''}
                {s.vues !== null ? ` · ${s.vues} vues` : ''}
                {s.tentatives > 1 ? ` · ${s.tentatives} tentatives` : ''}
              </p>
              {s.video_id && (
                <a className="text-navy-text underline" href={`https://studio.youtube.com/video/${s.video_id}/edit`}
                  target="_blank" rel="noreferrer">Ouvrir dans YouTube Studio</a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
