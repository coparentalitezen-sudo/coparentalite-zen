import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { lireRapport, semainesRapportees } from '@/lib/copilote/depot';
import { jourCourt } from '@/lib/copilote/dates';
import { CopiloteNav } from '@/components/copilote-nav';
import { BoutonsRapport } from './boutons';

/** Rapport hebdomadaire du copilote : chiffres clés, ce qui a marché, trois actions. */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function Bloc({ titre, valeur, precision }: { titre: string; valeur: string; precision?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-soft">{titre}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{valeur}</p>
      {precision && <p className="text-sm text-soft">{precision}</p>}
    </div>
  );
}

function Liste({ titre, items, ordonnee = false }: { titre: string; items: string[]; ordonnee?: boolean }) {
  const Balise = ordonnee ? 'ol' : 'ul';
  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-display text-lg font-semibold">{titre}</h2>
      <Balise className={`space-y-1 pl-5 text-sm ${ordonnee ? 'list-decimal' : 'list-disc'}`}>
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </Balise>
    </section>
  );
}

export default async function PageRapport({
  searchParams,
}: { searchParams: Promise<{ semaine?: string }> }) {
  const supabase = await supabaseServer();
  if (!supabase) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) notFound();

  const { semaine } = await searchParams;
  const demandee = semaine && /^\d{4}-S\d{2}$/.test(semaine) ? semaine : undefined;
  const [lu, semaines] = await Promise.all([lireRapport(demandee), semainesRapportees()]);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <CopiloteNav actif="rapport" />

      {!lu ? (
        <>
          <h1 className="font-display text-2xl font-semibold">Rapport de la semaine</h1>
          <p className="card p-4 text-sm text-soft">
            Aucun rapport pour l’instant. Dépose tes exports dans{' '}
            <Link href="/admin/boutique" className="font-bold underline">Boutiques</Link>, puis recalcule.
          </p>
          <BoutonsRapport />
        </>
      ) : (() => {
        const r = lu.rapport;
        const c = r.chiffres;
        const evolution = c.evolution === null ? 'pas de comparaison'
          : `${c.evolution > 0 ? '+' : ''}${c.evolution} % vs semaine préc.`;
        return (
          <>
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-semibold">Semaine {r.semaine}</h1>
              <p className="text-sm text-soft">
                Du {jourCourt(r.periode.debut)} au {jourCourt(r.periode.fin)} · calculé le{' '}
                {new Date(lu.majLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                {lu.envoyeLe ? ' · courriel envoyé' : lu.envoiMotif ? ` · courriel non envoyé : ${lu.envoiMotif}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Bloc titre="Ventes" valeur={String(c.unites)} precision={evolution} />
              <Bloc titre="Chiffre d’affaires" valeur={c.ca} precision={`semaine préc. : ${c.caPrecedent}`} />
              <Bloc titre="Commandes" valeur={String(c.commandes)} />
              <Bloc titre="Panier moyen" valeur={c.panierMoyen} />
            </div>
            {c.parPlateforme.length > 0 && (
              <p className="text-sm text-soft">
                {c.parPlateforme.map((x) => `${x.plateforme} : ${x.unites} · ${x.ca}`).join('  ·  ')}
                {c.autresDevises.length > 0 && ` · ventes aussi en ${c.autresDevises.join(', ')}, non additionnées`}
              </p>
            )}

            <Liste titre="Les 3 actions de la semaine" items={r.actions} ordonnee />
            <Liste titre="Ce qui a marché" items={r.reussites} />
            {r.vigilance.length > 0 && <Liste titre="À surveiller" items={r.vigilance} />}
            {r.contenus.length > 0 && (
              <Liste titre="Contenus les plus cliqués (depuis le début)"
                items={r.contenus.map((x) => `« ${x.accroche} » — ${x.clics} clics, ${x.inscriptions} inscription(s)`)} />
            )}

            <p className="text-sm">
              <Link href="/admin/propositions" className="font-bold underline">
                {r.propositions.idees} idée(s) et {r.propositions.ameliorations} amélioration(s) à valider →
              </Link>
            </p>

            <BoutonsRapport />

            {semaines.length > 1 && (
              <section className="card space-y-2 p-4 text-sm">
                <h2 className="font-display text-lg font-semibold">Semaines précédentes</h2>
                <p className="flex flex-wrap gap-3">
                  {semaines.map((s) => (
                    <Link key={s} href={`/admin/rapport?semaine=${s}`}
                      className={s === r.semaine ? 'font-bold' : 'underline'}>{s}</Link>
                  ))}
                </p>
              </section>
            )}
          </>
        );
      })()}
    </main>
  );
}
