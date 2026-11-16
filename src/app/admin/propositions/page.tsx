import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { lirePropositions, lireDecisions } from '@/lib/copilote/depot';
import { CopiloteNav } from '@/components/copilote-nav';
import { CarteProposition } from './carte';

/**
 * File de validation des propositions du copilote.
 *
 * Une proposition n'engage rien tant qu'elle n'est pas validée, et même
 * validée elle ne modifie aucune boutique : c'est une décision notée, que
 * l'on marque « réalisée » une fois la fiche réellement créée ou corrigée.
 */
export const dynamic = 'force-dynamic';

const LIBELLES = { validee: 'Validée', rejetee: 'Rejetée', realisee: 'Réalisée', en_attente: 'En attente' };

export default async function PagePropositions() {
  const supabase = await supabaseServer();
  if (!supabase) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) notFound();

  const [attente, decisions] = await Promise.all([lirePropositions(), lireDecisions(15)]);
  const idees = attente.filter((p) => p.type === 'idee');
  const ameliorations = attente.filter((p) => p.type === 'amelioration');

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <CopiloteNav actif="propositions" />
      <h1 className="font-display text-2xl font-semibold">Propositions à valider</h1>

      {attente.length === 0 && (
        <p className="card p-4 text-sm text-soft">
          Rien en attente. Les propositions arrivent chaque lundi matin, ou tout de suite depuis
          le <Link href="/admin/rapport" className="font-bold underline">rapport</Link> (« Recalculer »).
        </p>
      )}

      {idees.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Idées de produits</h2>
          {idees.map((p) => <CarteProposition key={p.id} proposition={p} />)}
        </section>
      )}

      {ameliorations.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Fiches à améliorer</h2>
          {ameliorations.map((p) => <CarteProposition key={p.id} proposition={p} />)}
        </section>
      )}

      {decisions.length > 0 && (
        <section className="card space-y-2 p-4">
          <h2 className="font-display text-lg font-semibold">Décisions récentes</h2>
          <ul className="divide-y divide-line text-sm">
            {decisions.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 py-2">
                <span>
                  {d.titre}
                  {d.motif && <span className="block text-soft">« {d.motif} »</span>}
                </span>
                <span className="shrink-0 text-soft">{LIBELLES[d.statut]} · {d.semaine}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
