import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { lireMesures, lireBilans, lireParcoursQuiz } from '@/lib/marketing/depot';
import {
  performances, regrouper, entonnoir, meilleuresAccroches,
} from '@/lib/marketing/mesures';
import { BoutonRelever } from './bouton-relever';
import { BoutonPublier } from './bouton-publier';
import { supabaseService } from '@/lib/supabase/server';
import { syntheseYoutube, DEBUT_FILTRE_ROBOTS, type SyntheseYoutube } from '@/lib/youtube/resultats';

/**
 * Tableau de bord.
 *
 * Ce qui est mesuré ici vient entièrement de nous : clics attribués par
 * paramètres UTM, inscriptions rattachées à leur contenu d'origine,
 * abonnements en cours. Rien ne dépend d'un service tiers, donc rien n'est
 * indisponible.
 *
 * Ce que Meta seul connaît — portée, vues, taux de lecture, interactions —
 * est annoncé comme en attente plutôt qu'affiché à zéro. Un zéro se lirait
 * « personne n'a vu », alors que la vérité est « nous ne le savons pas encore ».
 */
export const dynamic = 'force-dynamic';

function Bloc({ titre, valeur, precision }: {
  titre: string; valeur: string; precision?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-soft">{titre}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{valeur}</p>
      {precision && <p className="text-sm text-soft">{precision}</p>}
    </div>
  );
}

export default async function PageMesures() {
  const supabase = await supabaseServer();
  if (!supabase) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) notFound();

  const [donnees, bilans, quiz] = await Promise.all([
    lireMesures(), lireBilans(3), lireParcoursQuiz(),
  ]);
  if (!donnees) notFound();

  const lignes = performances(
    donnees.contenus, donnees.visites, donnees.originesInscrits, donnees.releves);
  const publies = donnees.contenus.filter((c) => c.statut === 'publie').length;
  const clics = lignes.reduce((s, l) => s + l.clics, 0);
  const inscriptions = lignes.reduce((s, l) => s + l.inscriptions, 0);
  const tunnel = entonnoir(clics, inscriptions, inscriptions, donnees.abonnements);
  const parNiche = regrouper(lignes, 'niche');
  const parFormat = regrouper(lignes, 'format');
  const accroches = meilleuresAccroches(lignes);

  // Ce que la tâche quotidienne a fait en dernier. Sans cette ligne, « rien
  // n'est parti » reste invérifiable une fois les journaux de l'hébergeur
  // effacés, c'est-à-dire au bout d'une heure.
  const service = supabaseService();
  const { data: passages } = service
    ? await service
      .from('marketing_journal')
      .select('jour, source, publie, rapport, created_at')
      .eq('tache', 'publier-planifie')
      .order('created_at', { ascending: false })
      .limit(1)
    : { data: null };
  // YouTube : Shorts des trente derniers jours, clics, inscriptions venues de YouTube, abonnés.
  let youtube: SyntheseYoutube | null = null;
  if (service) {
    const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [shorts, visites, origines, chaine] = await Promise.all([
      service.from('marketing_youtube_shorts').select('jour, titre, video_id, vues')
        .eq('statut', 'publiee').eq('essai', false).gte('jour', depuis),
      service.from('marketing_visites').select('contenu, jour, clics').eq('source', 'youtube'),
      service.from('profiles').select('origine_contenu').eq('origine_source', 'youtube'),
      service.from('marketing_youtube_chaine').select('jour, abonnes, abonnes_masques, vues')
        .order('jour', { ascending: false }).limit(30),
    ]);
    youtube = syntheseYoutube(shorts.data ?? [], visites.data ?? [],
      (origines.data ?? []).map((o) => o.origine_contenu as string | null), chaine.data ?? []);
  }
  const dernier = passages?.[0] as
    | { jour: string; source: string; publie: boolean;
        rapport: { motif?: string; rapports?: { motif?: string }[] } }
    | undefined;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <Link href="/admin" className="text-sm font-bold text-navy-text underline">
          ← Retour aux publications
        </Link>
        <h1 className="font-display text-2xl font-semibold">Résultats</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Bloc titre="Inscriptions des 7 derniers jours"
          valeur={`${donnees.inscriptionsSeptJours} / 10`}
          precision="Objectif : 10 nouveaux comptes par semaine" />
        <Bloc titre="Contenus publiés" valeur={String(publies)}
          precision={`${donnees.contenus.length} au total`} />
        <Bloc titre="Clics vers l’application" valeur={String(clics)} />
        <Bloc titre="Inscriptions attribuées" valeur={String(inscriptions)}
          precision={`${tunnel.tauxInscription} % des clics`} />
        <Bloc titre="Abonnements en cours" valeur={String(donnees.abonnements)} />
      </div>

      {youtube && (
        <section className="card space-y-3 p-4">
          <h2 className="font-display text-lg font-semibold">YouTube</h2>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-muted p-3">
              <p className="font-display text-xl font-semibold">
                {youtube.abonnesMasques ? 'masqués' : youtube.abonnes ?? '—'}
              </p>
              <p className="text-xs text-soft">
                abonnés{youtube.progression !== null
                  ? ` · ${youtube.progression >= 0 ? '+' : ''}${youtube.progression} en ${youtube.progressionJours} j`
                  : ''}
              </p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="font-display text-xl font-semibold">{youtube.vues ?? '—'}</p>
              <p className="text-xs text-soft">vues (30 jours)</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="font-display text-xl font-semibold">{youtube.clics}</p>
              <p className="text-xs text-soft">clics vers le site</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="font-display text-xl font-semibold">{youtube.inscrits}</p>
              <p className="text-xs text-soft">inscriptions venues de YouTube</p>
            </div>
          </div>
          {youtube.lignes.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {youtube.lignes.map((l) => (
                <li key={l.jour} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    <span className="text-soft">{l.jour.slice(8, 10)}/{l.jour.slice(5, 7)} · </span>
                    {l.videoId
                      ? <a className="underline" href={`https://www.youtube.com/shorts/${l.videoId}`} target="_blank" rel="noreferrer">{l.titre.split(' | ')[0]}</a>
                      : l.titre.split(' | ')[0]}
                  </span>
                  <span className="shrink-0 text-soft">
                    {l.vues ?? '—'} vues · {l.clics} clic{l.clics > 1 ? 's' : ''} · {l.inscrits} inscr.
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-soft">
            Abonnés relevés chaque jour{youtube.releveLe ? ` (dernier relevé le ${youtube.releveLe})` : ' — premier relevé au prochain passage'}.
            Clics comptés depuis le {DEBUT_FILTRE_ROBOTS.split('-').reverse().join('/')}, robots exclus :
            avant, les robots de YouTube qui vérifient les liens étaient comptés comme des visiteurs.
          </p>
        </section>
      )}

      <section className="card space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">Parcours du questionnaire</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted p-3">
            <p className="font-display text-xl font-semibold">{quiz.commences}</p>
            <p className="text-xs text-soft">commencés</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="font-display text-xl font-semibold">{quiz.termines}</p>
            <p className="text-xs text-soft">terminés</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="font-display text-xl font-semibold">{quiz.clicsInscription}</p>
            <p className="text-xs text-soft">vers inscription</p>
          </div>
        </div>
        <p className="text-xs text-soft">
          Comptage agrégé, sans réponse au questionnaire ni donnée concernant les enfants.
        </p>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">Portée, vues, interactions</h2>
        <p className="text-sm text-soft">
          Ces chiffres n’existent que chez Instagram : ils sont relevés chaque soir.
          Ils ne sont pas affichés à zéro, ce qui laisserait croire que personne n’a vu
          les publications.
        </p>
        <p className="text-sm text-soft">
          {donnees.releves.size > 0
            ? `${donnees.releves.size} publication${donnees.releves.size > 1 ? 's' : ''} relevée${donnees.releves.size > 1 ? 's' : ''}.`
            : 'Aucun relevé à ce jour — le bouton ci-dessous affiche le motif exact du refus.'}
        </p>
        <BoutonRelever />
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">Publication quotidienne</h2>
        <p className="text-sm text-soft">
          {dernier
            ? `Dernier passage le ${dernier.jour} (${dernier.source}) : ${
              dernier.publie
                ? 'publié.'
                : `rien publié — ${dernier.rapport?.motif
                  ?? dernier.rapport?.rapports?.find((r) => r.motif)?.motif
                  ?? 'motif inconnu'}`}`
            : 'Aucun passage enregistré pour l’instant.'}
        </p>
        <BoutonPublier />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Par micro-niche</h2>
        {parNiche.length === 0 ? (
          <p className="text-sm text-soft">Aucun contenu enregistré pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {parNiche.slice(0, 8).map((n) => (
              <li key={n.cle} className="flex items-center justify-between gap-3 py-2">
                <span className="font-bold">{n.cle}</span>
                <span className="text-soft">
                  {n.clics} clic{n.clics > 1 ? 's' : ''} · {n.inscriptions} inscr. · {n.contenus} contenu{n.contenus > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-soft">
          Classement par inscriptions rapportées au nombre de contenus, et non par volume
          brut : sans cela, une niche traitée vingt fois passerait toujours devant une
          niche traitée deux fois, quelle que soit son efficacité réelle.
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Par format</h2>
        {parFormat.length === 0 ? (
          <p className="text-sm text-soft">Aucun contenu enregistré pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {parFormat.map((f) => (
              <li key={f.cle} className="flex items-center justify-between gap-3 py-2">
                <span className="font-bold">{f.cle}</span>
                <span className="text-soft">{f.clics} clic{f.clics > 1 ? 's' : ''} · {f.contenus} contenu{f.contenus > 1 ? 's' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Accroches les plus cliquées</h2>
        {accroches.length === 0 ? (
          <p className="text-sm text-soft">
            Pas encore assez de contenus mesurés pour comparer. Classer deux accroches
            reviendrait à désigner un gagnant par tirage au sort — et cette désignation
            orienterait ensuite toute la production.
          </p>
        ) : (
          <ol className="space-y-2 text-sm">
            {accroches.map((a) => (
              <li key={a.reference} className="rounded-xl bg-muted p-3">
                <p className="font-bold">{a.accroche}</p>
                <p className="text-soft">{a.clics} clics · {a.niche} · {a.format}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Bilans hebdomadaires</h2>
        {bilans.length === 0 ? (
          <p className="text-sm text-soft">
            Le premier bilan sera rédigé lundi matin, après la détection.
          </p>
        ) : (
          <ul className="space-y-3">
            {bilans.map((b) => (
              <li key={b.semaine} className="rounded-xl bg-muted p-3">
                <p className="text-xs font-bold uppercase text-soft">{b.semaine}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{b.texte}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">Coût des services</h2>
        <p className="text-sm text-soft">
          0 € par mois. Génération des textes et des visuels dans l’application,
          planification et hébergement compris dans les formules déjà en place,
          API Meta et sources de détection gratuites.
        </p>
      </section>
    </main>
  );
}
