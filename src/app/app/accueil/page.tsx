'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import { listerDepenses, getRegleGarde, type DepenseListe, type RegleGarde } from '@/lib/actions';
import { computePairBalance, balanceLabel, formatCents, type ExpenseForBalance } from '@/lib/money';
import { buildSchedule, whereToday } from '@/lib/custody';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

function frDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Accueil() {
  const { ctx, recharger } = useContexte();
  const [depenses, setDepenses] = useState<DepenseListe[] | null>(null);
  const [regle, setRegle] = useState<RegleGarde | null | 'inconnu'>('inconnu');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    const hid = ctx.contexte.foyer.id;
    listerDepenses(hid).then((r) => {
      if (r.status === 'ok') setDepenses(r.data);
      else if (r.status === 'error') setErreur(r.message);
    });
    getRegleGarde(hid).then((r) => {
      if (r.status === 'ok') setRegle(r.data);
      else if (r.status === 'error') setErreur(r.message);
    });
  }, [ctx]);

  const membres = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const enfants = ctx.etat === 'pret' ? ctx.contexte.enfants : [];
  const p1 = membres[0]; const p2 = membres[1];
  const today = aujourdhui();

  // Garde du jour, calculée par le moteur à partir de la règle du foyer
  let gardeAujourdhui: { parent: string; prochain: string | null; prochainParent: string | null } | null = null;
  if (regle && regle !== 'inconnu' && regle.parent2) {
    try {
      const debut = regle.startDate;
      const fin = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
      const periodes = buildSchedule(
        { pattern: regle.pattern, startDate: debut, parent1: regle.parent1, parent2: regle.parent2 },
        debut < today ? debut : today, fin
      );
      const t = whereToday(periodes, today);
      if (t) gardeAujourdhui = { parent: t.parentId, prochain: t.nextChange, prochainParent: t.nextParent };
    } catch { /* règle incohérente : on n'affiche rien plutôt qu'une information fausse */ }
  }

  const nom = (id: string) => membres.find((m) => m.profileId === id)?.nom ?? 'Parent';
  const membre = (id: string) => membres.find((m) => m.profileId === id);

  let solde = null;
  if (p1 && p2 && depenses) {
    const validees: ExpenseForBalance[] = depenses
      .filter((d) => d.statut === 'validated' || d.statut === 'reimbursed')
      .map((d) => ({ paidBy: d.payePar, allocations: d.parts }));
    solde = computePairBalance(p1.profileId, p2.profileId, validees);
  }
  const aValider = (depenses ?? []).filter((d) => d.statut === 'sent');
  const recentes = (depenses ?? []).slice(0, 3);

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="sr-only">Accueil</h1>

      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour retrouver vos données réelles." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          <section className="card p-4">
            <h2 className="text-sm font-bold text-soft">Aujourd’hui, {frDate(today)}</h2>
            {enfants.length === 0 ? (
              <p className="mt-2 text-sm">
                Ajoutez vos enfants pour voir leur planning.{' '}
                <Link href="/app/enfants" className="font-bold text-navy-text underline">Ajouter un enfant</Link>
              </p>
            ) : gardeAujourdhui ? (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{enfants.map((e) => e.prenom).join(' et ')} :</span>
                  {membre(gardeAujourdhui.parent) && (
                    <ParentBadge name={nom(gardeAujourdhui.parent)}
                      initial={membre(gardeAujourdhui.parent)!.initiale}
                      colorKey={membre(gardeAujourdhui.parent)!.couleur === 'coral' ? 'coral' : 'navy'} />
                  )}
                </div>
                {gardeAujourdhui.prochain && gardeAujourdhui.prochainParent && (
                  <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm">
                    Prochain changement le <strong>{frDate(gardeAujourdhui.prochain)}</strong> — chez{' '}
                    <strong>{nom(gardeAujourdhui.prochainParent)}</strong>.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm">
                Aucun rythme de garde défini.{' '}
                <Link href="/app/foyer" className="font-bold text-navy-text underline">Le définir maintenant</Link>
              </p>
            )}
          </section>

          {solde && p1 && (
            <section className="card p-4">
              <h2 className="text-sm font-bold text-soft">Entre vous</h2>
              <p className="mt-1 text-lg font-bold">{balanceLabel(solde, p1.profileId)}</p>
              <p className="text-sm text-soft">Calculé sur les dépenses validées.</p>
              <Link href="/app/depenses" className="btn btn-ghost mt-3 w-full">Voir le détail</Link>
            </section>
          )}

          {aValider.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-bold text-soft">En attente de validation ({aValider.length})</h2>
              <ul className="mt-2 divide-y divide-line">
                {aValider.slice(0, 4).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="font-bold">{d.titre}</p>
                      <p className="text-sm text-soft">payé par {nom(d.payePar)}</p>
                    </div>
                    <span className="font-bold">{formatCents(d.montantCents)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/app/depenses" className="btn btn-ghost mt-3 w-full">Ouvrir les dépenses</Link>
            </section>
          )}

          {depenses === null && <Chargement />}
          {depenses?.length === 0 && (
            <Vide titre="Aucune dépense pour l’instant"
                  texte="Enregistrez votre première dépense partagée."
                  action={{ href: '/app/ajouter', label: 'Ajouter une dépense' }} />
          )}

          {recentes.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-bold text-soft">Dépenses récentes</h2>
              <ul className="mt-2 divide-y divide-line">
                {recentes.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="font-bold">{d.titre}</p>
                      <p className="text-sm text-soft">{frDate(d.date)}</p>
                    </div>
                    <span className="font-bold">{formatCents(d.montantCents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <BottomNav active="/app/accueil" />
    </main>
  );
}
