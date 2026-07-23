'use client';

import { useCallback, useEffect, useState } from 'react';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import { listerDepenses, reviserDepense, urlJustificatif, type DepenseListe, type Membre } from '@/lib/actions';
import { computePairBalance, balanceLabel, formatCents, type ExpenseForBalance } from '@/lib/money';

const LIBELLES: Record<string, { texte: string; classe: string }> = {
  draft: { texte: 'Brouillon', classe: 'bg-muted text-soft' },
  sent: { texte: 'En attente de réponse', classe: 'bg-muted text-soft' },
  seen: { texte: 'Vue', classe: 'bg-muted text-soft' },
  to_validate: { texte: 'Précision demandée', classe: 'bg-wait-bg text-wait' },
  validated: { texte: 'Validée', classe: 'bg-ok-bg text-ok' },
  partially_validated: { texte: 'Partiellement validée', classe: 'bg-wait-bg text-wait' },
  disputed: { texte: 'Dépense à vérifier', classe: 'bg-err-bg text-err' },
  cancelled: { texte: 'Annulée', classe: 'bg-muted text-soft' },
  partially_reimbursed: { texte: 'Partiellement remboursée', classe: 'bg-wait-bg text-wait' },
  reimbursed: { texte: 'Remboursée', classe: 'bg-ok-bg text-ok' },
};

function frDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Depenses() {
  const { ctx, recharger } = useContexte();
  const [depenses, setDepenses] = useState<DepenseListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [moi, setMoi] = useState<string | null>(null);

  const charger = useCallback(async (householdId: string) => {
    const r = await listerDepenses(householdId);
    if (r.status === 'ok') { setDepenses(r.data); setErreur(null); }
    else if (r.status === 'error') setErreur(r.message);
  }, []);

  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    charger(ctx.contexte.foyer.id);
    import('@/lib/supabase/client').then(({ supabaseBrowser }) => {
      const s = supabaseBrowser();
      s?.auth.getUser().then(({ data }) => setMoi(data.user?.id ?? null));
    });
  }, [ctx, charger]);

  async function reviser(id: string, action: 'validate' | 'dispute', householdId: string) {
    setMsg(null);
    const r = await reviserDepense(id, action);
    if (r.status === 'ok') {
      setMsg(action === 'validate' ? 'Dépense validée.' : 'Dépense signalée à vérifier — l’autre parent en est informé.');
      charger(householdId);
    } else if (r.status === 'error') setErreur(r.message);
  }

  async function ouvrirJustificatif(id: string) {
    const r = await urlJustificatif(id);
    if (r.status === 'ok') window.open(r.data, '_blank');
    else if (r.status === 'error') setErreur(r.message);
  }

  const membres: Membre[] = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const p1 = membres[0]; const p2 = membres[1];

  let solde: ReturnType<typeof computePairBalance> | null = null;
  if (p1 && p2 && depenses) {
    const validees: ExpenseForBalance[] = depenses
      .filter((d) => d.statut === 'validated' || d.statut === 'reimbursed' || d.statut === 'partially_reimbursed')
      .map((d) => ({ paidBy: d.payePar, allocations: d.parts }));
    solde = computePairBalance(p1.profileId, p2.profileId, validees);
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Dépenses</h1>

      {msg && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{msg}</p>}
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour voir vos dépenses réelles." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && (
        <>
          {solde && p1 && p2 && (
            <section className="card space-y-2 p-4">
              <h2 className="text-sm font-bold text-soft">Solde entre parents</h2>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{balanceLabel(solde, p1.profileId)}</p>
                <ParentBadge name={p1.nom} initial={p1.initiale} colorKey={p1.couleur === 'coral' ? 'coral' : 'navy'} compact />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                <p className="font-bold">{balanceLabel(solde, p2.profileId)}</p>
                <ParentBadge name={p2.nom} initial={p2.initiale} colorKey={p2.couleur === 'coral' ? 'coral' : 'navy'} compact />
              </div>
              <p className="text-xs text-soft">Calculé sur les dépenses validées uniquement.</p>
            </section>
          )}
          {p1 && !p2 && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-soft">
              Le solde apparaîtra dès que le second parent aura rejoint le foyer.
            </p>
          )}

          {depenses === null && <Chargement />}
          {depenses?.length === 0 && (
            <Vide titre="Aucune dépense enregistrée"
                  texte="Ajoutez votre première dépense partagée : elle sera répartie automatiquement."
                  action={{ href: '/app/ajouter', label: 'Ajouter une dépense' }} />
          )}

          {depenses && depenses.length > 0 && (
            <ul className="space-y-3">
              {depenses.map((d) => {
                const payeur = membres.find((m) => m.profileId === d.payePar);
                const statut = LIBELLES[d.statut] ?? { texte: d.statut, classe: 'bg-muted text-soft' };
                const aValider = d.statut === 'sent' && moi !== null && d.payePar !== moi;
                return (
                  <li key={d.id} className="card space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{d.titre}</p>
                        <p className="text-sm text-soft">
                          {[d.categorie, frDate(d.date)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 text-lg font-bold">{formatCents(d.montantCents)}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {payeur && (
                        <ParentBadge name={payeur.nom} initial={payeur.initiale}
                          colorKey={payeur.couleur === 'coral' ? 'coral' : 'navy'} />
                      )}
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statut.classe}`}>{statut.texte}</span>
                    </div>
                    {d.justificatifs > 0 && (
                      <button type="button" className="text-sm font-bold text-navy-text underline"
                              onClick={() => ouvrirJustificatif(d.id)}>
                        Voir le justificatif
                      </button>
                    )}
                    {aValider && (
                      <div className="flex gap-2 border-t border-line pt-2">
                        <button className="btn btn-primary flex-1"
                          onClick={() => reviser(d.id, 'validate', ctx.contexte.foyer.id)}>Valider</button>
                        <button className="btn btn-ghost flex-1"
                          onClick={() => reviser(d.id, 'dispute', ctx.contexte.foyer.id)}>À vérifier</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <BottomNav active="/app/depenses" />
    </main>
  );
}
