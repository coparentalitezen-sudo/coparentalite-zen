import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import {
  lireMesures, lireBilans, lireParcoursQuiz, lireDernierLearnings,
  lireContenusSemaine, lireJournalRedacteur, etatCollectePinterest,
} from '@/lib/marketing/depot';
import {
  performances, regrouper, entonnoir, meilleuresAccroches,
} from '@/lib/marketing/mesures';

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

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';

  const [donnees, bilans, quiz, learnings, contenusSemaine, journalRedacteur, collectePinterest] = await Promise.all([
    lireMesures(), lireBilans(3), lireParcoursQuiz(), lireDernierLearnings(),
    lireContenusSemaine(new Date(), base), lireJournalRedacteur(20), etatCollectePinterest(),
  ]);
  if (!donnees) notFound();

  const lignes = performances(donnees.contenus, donnees.visites, donnees.originesInscrits);
  const publies = donnees.contenus.filter((c) => c.statut === 'publie').length;
  const clics = lignes.reduce((s, l) => s + l.clics, 0);
  const inscriptions = lignes.reduce((s, l) => s + l.inscriptions, 0);
  const tunnel = entonnoir(clics, inscriptions, inscriptions, donnees.abonnements);
  const parNiche = regrouper(lignes, 'niche');
  const parFormat = regrouper(lignes, 'format');
  const accroches = meilleuresAccroches(lignes);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <Link href="/admin" className="text-sm font-bold text-navy-text underline">
          ← Retour aux publications
        </Link>
        <h1 className="font-display text-2xl font-semibold">Résultats</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Bloc titre="Contenus publiés" valeur={String(publies)}
          precision={`${donnees.contenus.length} au total`} />
        <Bloc titre="Clics vers l’application" valeur={String(clics)} />
        <Bloc titre="Inscriptions attribuées" valeur={String(inscriptions)}
          precision={`${tunnel.tauxInscription} % des clics`} />
        <Bloc titre="Abonnements en cours" valeur={String(donnees.abonnements)} />
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Contenus de la semaine</h2>
        {contenusSemaine.length === 0 ? (
          <p className="text-sm text-soft">Rien de généré pour cette semaine.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-soft">
                  <th className="py-1 pr-3 font-bold">Date</th>
                  <th className="py-1 pr-3 font-bold">Niche</th>
                  <th className="py-1 pr-3 font-bold">Catégorie</th>
                  <th className="py-1 pr-3 font-bold">Source</th>
                  <th className="py-1 pr-3 font-bold">Titre</th>
                  <th className="py-1 font-bold">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {contenusSemaine.map((c) => (
                  <tr key={c.reference}>
                    <td className="whitespace-nowrap py-1.5 pr-3">{c.date}</td>
                    <td className="py-1.5 pr-3">{c.niche}</td>
                    <td className="py-1.5 pr-3">{c.categorie}</td>
                    <td className="py-1.5 pr-3">{c.source}</td>
                    <td className="max-w-[16rem] truncate py-1.5 pr-3" title={c.titre}>{c.titre}</td>
                    <td className="whitespace-nowrap py-1.5">{c.statut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-soft">
          Statut déduit des données existantes, pas déclaré : généré → publié (présent dans
          le flux RSS) → épingle trouvée (id Pinterest connu) → mesuré (au moins un relevé
          dans pin_stats).
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Journal du rédacteur</h2>
        {journalRedacteur.length === 0 ? (
          <p className="text-sm text-soft">
            Aucun appel enregistré. L’agent n’est pas encore branché sur le pipeline :
            lancer <code>npm run redacteur:test</code> consigne un premier essai ici.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-soft">
                  <th className="py-1 pr-3 font-bold">Date</th>
                  <th className="py-1 pr-3 font-bold">Résultat</th>
                  <th className="py-1 font-bold">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {journalRedacteur.map((l, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      {new Date(l.date).toLocaleString('fr-FR')}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3">{l.resultat}</td>
                    <td className="py-1.5">{l.motif ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-soft">
          Chaque appel à l’agent rédacteur laisse une ligne, succès ou repli — c’est ce qui
          rend visible un repli autrement silencieux (échec d’appel, JSON non conforme,
          rejet par un garde-fou éditorial, quota hebdomadaire atteint).
        </p>
      </section>

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
          En attente de la connexion Meta. Ces chiffres n’existent que chez Instagram et
          Facebook : ils seront relevés chaque semaine une fois la connexion faite.
          Ils ne sont pas affichés à zéro, ce qui laisserait croire que personne n’a vu
          les publications.
        </p>
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

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Apprentissages Pinterest</h2>
        {!learnings ? (
          <p className="text-sm text-soft">
            Pas encore de relevé. Le premier bloc paraîtra après la première collecte
            d’analytique, deux jours au moins après la première épingle retrouvée.
          </p>
        ) : (
          <div className="rounded-xl bg-muted p-3">
            <p className="text-xs font-bold uppercase text-soft">
              {new Date(learnings.genereLe).toLocaleDateString('fr-FR')} · {learnings.nbPins} épingle{learnings.nbPins > 1 ? 's' : ''} mesurée{learnings.nbPins > 1 ? 's' : ''}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">{learnings.bloc}</p>
          </div>
        )}
        <p className="text-xs text-soft">
          Ce bloc n’ajuste rien automatiquement : la génération des contenus est
          déterministe et ne dépend d’aucun modèle de langage. Il est écrit pour guider
          la validation manuelle des prochains contenus, avant leur publication.
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg font-semibold">Dernière collecte Pinterest</h2>
        <div className="grid grid-cols-3 gap-3">
          <Bloc titre="Dernier passage" valeur={
            collectePinterest.derniereCollecte
              ? new Date(collectePinterest.derniereCollecte).toLocaleDateString('fr-FR')
              : '—'
          } />
          <Bloc titre="Épingles mesurées" valeur={String(collectePinterest.epinglesMesureesDerniereFois)} />
          <Bloc titre="Sans id Pinterest" valeur={String(collectePinterest.epinglesSansPinId)} />
        </div>
        <p className="text-xs text-soft">
          « Épingles mesurées » compte les relevés du jour de la dernière collecte
          (pin_stats). « Sans id Pinterest » compte les contenus que la découverte n’a
          pas encore rattachés à une épingle — c’est la file que decouvrirEpingles
          essaiera de résorber au prochain passage.
        </p>
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
