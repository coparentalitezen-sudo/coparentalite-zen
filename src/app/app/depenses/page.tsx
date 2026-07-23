'use client';

import { useCallback, useEffect, useState } from 'react';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import {
  listerDepenses, reviserDepense, urlJustificatif, creerRemboursement, listerRemboursements,
  urlJustificatifRemboursement, METHODES,
  type DepenseListe, type Membre, type Remboursement,
} from '@/lib/actions';
import { computePairBalance, balanceLabel, formatCents, type ExpenseForBalance, type ReimbursementForBalance } from '@/lib/money';
import { checkFile, formatBytes, MAX_JUSTIFICATIF_BYTES } from '@/lib/files';

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
  const [remboursements, setRemboursements] = useState<Remboursement[]>([]);
  const [formRemb, setFormRemb] = useState(false);
  const [montantR, setMontantR] = useState('');
  const [methodeR, setMethodeR] = useState<string>('bank_transfer');
  const [dateR, setDateR] = useState(() => new Date().toISOString().slice(0, 10));
  const [refR, setRefR] = useState('');
  const [fichierR, setFichierR] = useState<File | null>(null);
  const [busyR, setBusyR] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);


  const charger = useCallback(async (householdId: string) => {
    const [d, rb] = await Promise.all([listerDepenses(householdId), listerRemboursements(householdId)]);
    if (d.status === 'ok') { setDepenses(d.data); setErreur(null); }
    else if (d.status === 'error') setErreur(d.message);
    if (rb.status === 'ok') setRemboursements(rb.data);
  }, []);

  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    charger(ctx.contexte.foyer.id);
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
  const moi = ctx.etat === 'pret' ? ctx.contexte.moi : null;
  const p1 = membres[0]; const p2 = membres[1];

  let solde: ReturnType<typeof computePairBalance> | null = null;
  if (p1 && p2 && depenses) {
    const validees: ExpenseForBalance[] = depenses
      .filter((d) => d.statut === 'validated' || d.statut === 'reimbursed' || d.statut === 'partially_reimbursed')
      .map((d) => ({ paidBy: d.payePar, allocations: d.parts }));
    const regles: ReimbursementForBalance[] = remboursements.map((r) => ({
      fromParent: r.deParent, toParent: r.versParent, amountCents: r.montantCents,
    }));
    solde = computePairBalance(p1.profileId, p2.profileId, validees, regles);
  }
  // Montant que l'utilisateur courant doit régler (0 s'il est créancier)
  const monDu = solde && moi
    ? (moi === solde.parentA ? -solde.netCentsForA : solde.netCentsForA)
    : 0;
  const jeDois = monDu < 0 ? Math.abs(monDu) : 0;
  const autre = membres.find((m) => m.profileId !== moi);

  async function enregistrerRemboursement(householdId: string) {
    if (!moi || !autre) return;
    setErreur(null); setMsg(null);
    const clean = montantR.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) { setErreur('Indiquez un montant valide, par exemple 12,50.'); return; }
    const [e, c = ''] = clean.split('.');
    const cents = Number(e) * 100 + Number((c + '00').slice(0, 2));
    if (fichierR) {
      const v = checkFile(fichierR, MAX_JUSTIFICATIF_BYTES);
      if (!v.ok) { setErreur(v.message); return; }
    }
    setBusyR(true);
    const r = await creerRemboursement({
      householdId, deParent: moi, versParent: autre.profileId, montantCents: cents,
      methode: methodeR, date: dateR, reference: refR, justificatif: fichierR,
    });
    setBusyR(false);
    if (r.status === 'ok') {
      setMsg('Remboursement enregistré. Le solde a été mis à jour.');
      setFormRemb(false); setMontantR(''); setRefR(''); setFichierR(null);
      charger(householdId);
    } else if (r.status === 'error') setErreur(r.message);
  }

  async function ouvrirJustificatifRemb(path: string) {
    const r = await urlJustificatifRemboursement(path);
    if (r.status === 'ok') window.open(r.data, '_blank');
    else if (r.status === 'error') setErreur(r.message);
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Dépenses</h1>

      {msg && <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{msg}</p>}
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
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
              <p className="text-xs text-soft">
                Calculé sur les dépenses validées, remboursements déduits.
              </p>

              {!formRemb && (
                <button className="btn btn-primary w-full"
                  onClick={() => { setFormRemb(true); setMontantR(jeDois > 0 ? (jeDois / 100).toFixed(2).replace('.', ',') : ''); }}>
                  {jeDois > 0 ? `Rembourser ${formatCents(jeDois)}` : 'Enregistrer un remboursement'}
                </button>
              )}

              {formRemb && autre && (
                <div className="space-y-3 border-t border-line pt-3">
                  <h3 className="font-bold">Remboursement vers {autre.nom}</h3>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Montant (€)</span>
                    <input inputMode="decimal" value={montantR} onChange={(e) => setMontantR(e.target.value)} placeholder="12,50" />
                    {jeDois > 0 && (
                      <span className="mt-1 block text-xs text-soft">
                        Solde à régulariser : {formatCents(jeDois)}. Un montant partiel est accepté.
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Moyen</span>
                    <select value={methodeR} onChange={(e) => setMethodeR(e.target.value)}>
                      {METHODES.map((m) => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Date</span>
                    <input type="date" value={dateR} onChange={(e) => setDateR(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Référence (facultatif)</span>
                    <input value={refR} onChange={(e) => setRefR(e.target.value)} placeholder="N° de virement" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Justificatif (facultatif)</span>
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/heic"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null; setFichierR(f);
                        if (f) { const v = checkFile(f, MAX_JUSTIFICATIF_BYTES); setErreur(v.ok ? null : v.message); }
                      }} />
                    {fichierR && <span className="mt-1 block text-xs text-soft">{fichierR.name} · {formatBytes(fichierR.size)}</span>}
                  </label>
                  <button className="btn btn-primary w-full" disabled={busyR}
                    onClick={() => enregistrerRemboursement(ctx.contexte.foyer.id)}>
                    {busyR ? 'Enregistrement…' : 'Enregistrer le remboursement'}
                  </button>
                  <button className="btn btn-ghost w-full" onClick={() => setFormRemb(false)}>Annuler</button>
                </div>
              )}
            </section>
          )}

          {remboursements.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-bold text-soft">Remboursements ({remboursements.length})</h2>
              <ul className="mt-2 divide-y divide-line">
                {remboursements.map((r) => {
                  const de = membres.find((m) => m.profileId === r.deParent);
                  const vers = membres.find((m) => m.profileId === r.versParent);
                  const methode = METHODES.find((m) => m.valeur === r.methode)?.libelle ?? r.methode;
                  return (
                    <li key={r.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold">{de?.nom ?? 'Parent'} → {vers?.nom ?? 'Parent'}</p>
                        <span className="font-bold">{formatCents(r.montantCents)}</span>
                      </div>
                      <p className="text-sm text-soft">
                        {[methode, frDate(r.date), r.reference].filter(Boolean).join(' · ')}
                      </p>
                      {r.justificatif && (
                        <button type="button" className="mt-1 text-sm font-bold text-navy-text underline"
                          onClick={() => ouvrirJustificatifRemb(r.justificatif!)}>
                          Voir le justificatif
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
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
