'use client';

import { useCallback, useEffect, useState } from 'react';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import {
  listerDepenses, reviserDepense, urlJustificatif, creerRemboursement, listerRemboursements,
  urlJustificatifRemboursement, annulerRemboursement, modifierDepense, supprimerDepense, METHODES,
  getSolde, soldeLocalTransitoire, type Solde,
  type DepenseListe, type Membre, type Remboursement,
} from '@/lib/actions';
import { balanceLabel, formatCents } from '@/lib/money';
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
  const [solde, setSolde] = useState<Solde | null>(null);
  const [formRemb, setFormRemb] = useState(false);
  const [montantR, setMontantR] = useState('');
  const [methodeR, setMethodeR] = useState<string>('bank_transfer');
  const [dateR, setDateR] = useState(() => new Date().toISOString().slice(0, 10));
  const [refR, setRefR] = useState('');
  const [fichierR, setFichierR] = useState<File | null>(null);
  const [busyR, setBusyR] = useState(false);
  const [sens, setSens] = useState<'je_rembourse' | 'il_me_rembourse'>('je_rembourse');
  // Modification d'une dépense
  const [editId, setEditId] = useState<string | null>(null);
  const [eTitre, setETitre] = useState('');
  const [eMontant, setEMontant] = useState('');
  const [eDate, setEDate] = useState('');
  const [eSplit, setESplit] = useState(5000);
  const [eBusy, setEBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);


  const charger = useCallback(async (householdId: string, p1?: string, p2?: string | null) => {
    const [d, rb, sd] = await Promise.all([
      listerDepenses(householdId), listerRemboursements(householdId), getSolde(householdId),
    ]);
    if (d.status === 'ok') { setDepenses(d.data); setErreur(null); }
    else if (d.status === 'error') setErreur(d.message);
    if (rb.status === 'ok') setRemboursements(rb.data);

    if (sd.status === 'ok') setSolde(sd.data);
    else if (sd.status === 'error' && sd.message === 'SOLDE_SERVEUR_ABSENT' && p1) {
      // Migration pas encore appliquée : repli unique, partagé avec l'accueil
      setSolde(soldeLocalTransitoire(p1, p2 ?? null,
        d.status === 'ok' ? d.data : [], rb.status === 'ok' ? rb.data : []));
    } else if (sd.status === 'error') setErreur(sd.message);
  }, []);

  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    charger(ctx.contexte.foyer.id, ctx.contexte.membres[0]?.profileId, ctx.contexte.membres[1]?.profileId);
  }, [ctx, charger]);

  async function reviser(id: string, action: 'validate' | 'dispute', householdId: string) {
    setMsg(null);
    const r = await reviserDepense(id, action);
    if (r.status === 'ok') {
      setMsg(action === 'validate' ? 'Dépense validée.' : 'Dépense signalée à vérifier — l’autre parent en est informé.');
      charger(householdId, p1?.profileId, p2?.profileId);
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

  // Montant que l'utilisateur courant doit régler (0 s'il est créancier)
  /** Adaptation du solde serveur au format d'affichage, sans recalcul. */
  const soldeAffichable = solde && solde.parent2
    ? { parentA: solde.parent1, parentB: solde.parent2, netCentsForA: solde.netCents }
    : null;

  const monDu = solde && moi
    ? (moi === solde.parent1 ? solde.netCents : -solde.netCents)
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
    const de = sens === 'je_rembourse' ? moi : autre.profileId;
    const vers = sens === 'je_rembourse' ? autre.profileId : moi;
    const r = await creerRemboursement({
      householdId, deParent: de, versParent: vers, montantCents: cents,
      methode: methodeR, date: dateR, reference: refR, justificatif: fichierR,
    });
    setBusyR(false);
    if (r.status === 'ok') {
      setMsg('Remboursement enregistré. Le solde a été mis à jour.');
      setFormRemb(false); setMontantR(''); setRefR(''); setFichierR(null);
      charger(householdId, p1?.profileId, p2?.profileId);
    } else if (r.status === 'error') setErreur(r.message);
  }

  /** Solde qui résultera de la saisie en cours — calculé à partir du solde serveur. */
  function apercuSolde(): string | null {
    if (!solde || !moi || !autre || !solde.parent2) return null;
    const clean = montantR.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
    const [e, c = ''] = clean.split('.');
    const cents = Number(e) * 100 + Number((c + '00').slice(0, 2));
    if (cents <= 0) return null;
    const de = sens === 'je_rembourse' ? moi : autre.profileId;
    // Un règlement du parent 1 vers le parent 2 augmente le net du parent 1
    const futurNet = solde.netCents + (de === solde.parent1 ? cents : -cents);
    return balanceLabel(
      { parentA: solde.parent1, parentB: solde.parent2, netCentsForA: futurNet },
      moi,
    );
  }

  async function annuler(id: string, householdId: string) {
    if (!confirm('Annuler ce remboursement ? La ligne est conservée dans l’historique et la trace est journalisée.')) return;
    const r = await annulerRemboursement(id);
    if (r.status === 'ok') { setMsg('Remboursement annulé. Le solde a été recalculé.'); charger(householdId, p1?.profileId, p2?.profileId); }
    else if (r.status === 'error') setErreur(r.message);
  }

  function ouvrirEdition(d: DepenseListe) {
    setEditId(d.id);
    setETitre(d.titre);
    setEMontant((d.montantCents / 100).toFixed(2).replace('.', ','));
    setEDate(d.date);
    setESplit(d.repartition ?? 5000);
    setErreur(null); setMsg(null);
  }

  async function enregistrerEdition(d: DepenseListe, householdId: string) {
    if (!p1) return;
    setErreur(null);
    if (!eTitre.trim()) { setErreur('Indiquez un titre.'); return; }
    const clean = eMontant.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) { setErreur('Indiquez un montant valide, par exemple 24,90.'); return; }
    const [ent, cts = ''] = clean.split('.');
    const cents = Number(ent) * 100 + Number((cts + '00').slice(0, 2));
    const payeur = membres.find((m) => m.profileId === d.payePar) ?? p1;
    const autreP = membres.find((m) => m.profileId !== d.payePar);
    const regles = autreP
      ? [{ kind: 'percentage' as const, parentId: payeur.profileId, basisPoints: eSplit },
         { kind: 'percentage' as const, parentId: autreP.profileId, basisPoints: 10000 - eSplit }]
      : [{ kind: 'percentage' as const, parentId: payeur.profileId, basisPoints: 10000 }];

    setEBusy(true);
    const r = await modifierDepense({
      expenseId: d.id, titre: eTitre, montantCents: cents, date: eDate,
      categorieId: d.categorieId, enfantIds: d.enfants, regles,
    });
    setEBusy(false);
    if (r.status === 'ok') {
      setMsg('Dépense modifiée. Elle repasse en attente de validation par l’autre parent.');
      setEditId(null); charger(householdId, p1?.profileId, p2?.profileId);
    } else if (r.status === 'error') setErreur(r.message);
  }

  async function supprimer(d: DepenseListe, householdId: string) {
    if (!confirm(`Supprimer « ${d.titre} » ? La dépense sort du solde ; la ligne reste conservée dans l’historique.`)) return;
    const r = await supprimerDepense(d.id);
    if (r.status === 'ok') { setMsg('Dépense supprimée.'); charger(householdId, p1?.profileId, p2?.profileId); }
    else if (r.status === 'error') setErreur(r.message);
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
                <p className="font-bold">{soldeAffichable && balanceLabel(soldeAffichable, p1.profileId)}</p>
                <ParentBadge name={p1.nom} initial={p1.initiale} colorKey={p1.couleur === 'coral' ? 'coral' : 'navy'} compact />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                <p className="font-bold">{soldeAffichable && balanceLabel(soldeAffichable, p2.profileId)}</p>
                <ParentBadge name={p2.nom} initial={p2.initiale} colorKey={p2.couleur === 'coral' ? 'coral' : 'navy'} compact />
              </div>
              <p className="text-xs text-soft">
                Calculé sur les dépenses validées, remboursements déduits.
                {solde?.provisoire && ' — calcul provisoire, mise à jour de la base en attente.'}
              </p>

              {!formRemb && (
                <button className="btn btn-primary w-full"
                  onClick={() => { setFormRemb(true); setMontantR(jeDois > 0 ? (jeDois / 100).toFixed(2).replace('.', ',') : ''); }}>
                  {jeDois > 0 ? `Rembourser ${formatCents(jeDois)}` : 'Enregistrer un remboursement'}
                </button>
              )}

              {formRemb && autre && (
                <div className="space-y-3 border-t border-line pt-3">
                  <h3 className="font-bold">Enregistrer un remboursement</h3>
                  <fieldset>
                    <legend className="mb-1 text-sm font-bold">Qui a payé qui ?</legend>
                    <div className="flex flex-col gap-2">
                      <button type="button" aria-pressed={sens === 'je_rembourse'}
                        onClick={() => setSens('je_rembourse')}
                        className={`btn ${sens === 'je_rembourse' ? 'btn-primary' : 'btn-ghost'}`}>
                        J’ai remboursé {autre.nom}
                      </button>
                      <button type="button" aria-pressed={sens === 'il_me_rembourse'}
                        onClick={() => setSens('il_me_rembourse')}
                        className={`btn ${sens === 'il_me_rembourse' ? 'btn-primary' : 'btn-ghost'}`}>
                        {autre.nom} m’a remboursé
                      </button>
                    </div>
                  </fieldset>
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
                  {apercuSolde() && (
                    <p className="rounded-xl bg-muted px-3 py-2 text-sm font-bold" aria-live="polite">
                      Après enregistrement : {apercuSolde()}
                    </p>
                  )}
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
                      <div className="mt-1 flex flex-wrap items-center gap-4">
                        {r.justificatif && (
                          <button type="button" className="text-sm font-bold text-navy-text underline"
                            onClick={() => ouvrirJustificatifRemb(r.justificatif!)}>
                            Voir le justificatif
                          </button>
                        )}
                        {(r.creePar === moi || r.deParent === moi || r.versParent === moi) && (
                          <button type="button" className="text-sm font-bold text-err underline"
                            onClick={() => annuler(r.id, ctx.contexte.foyer.id)}>
                            Annuler
                          </button>
                        )}
                      </div>
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
                const monEcriture = moi !== null && (d.payePar === moi || d.creePar === moi);
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

                    {monEcriture && editId !== d.id && (
                      <div className="flex gap-4 border-t border-line pt-2">
                        <button type="button" className="text-sm font-bold text-navy-text underline"
                          onClick={() => ouvrirEdition(d)}>Modifier</button>
                        <button type="button" className="text-sm font-bold text-err underline"
                          onClick={() => supprimer(d, ctx.contexte.foyer.id)}>Supprimer</button>
                      </div>
                    )}

                    {editId === d.id && (
                      <div className="space-y-3 border-t border-line pt-3">
                        <h3 className="font-bold">Modifier la dépense</h3>
                        {d.statut === 'validated' && (
                          <p className="rounded-xl bg-wait-bg px-3 py-2 text-xs font-bold text-wait">
                            Cette dépense est validée : après modification, l’autre parent devra la valider à nouveau.
                          </p>
                        )}
                        <label className="block">
                          <span className="mb-1 block text-sm font-bold">Titre</span>
                          <input value={eTitre} onChange={(ev) => setETitre(ev.target.value)} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-bold">Montant (€)</span>
                          <input inputMode="decimal" value={eMontant} onChange={(ev) => setEMontant(ev.target.value)} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-sm font-bold">Date</span>
                          <input type="date" value={eDate} onChange={(ev) => setEDate(ev.target.value)} />
                        </label>
                        {p2 && (
                          <fieldset>
                            <legend className="mb-1 text-sm font-bold">Répartition (part du payeur)</legend>
                            <div className="grid grid-cols-4 gap-2">
                              {[5000, 6000, 7000, 10000].map((bp) => (
                                <button key={bp} type="button" aria-pressed={eSplit === bp}
                                  onClick={() => setESplit(bp)}
                                  className={`btn ${eSplit === bp ? 'btn-primary' : 'btn-ghost'} px-0 text-sm`}>
                                  {bp / 100} %
                                </button>
                              ))}
                            </div>
                          </fieldset>
                        )}
                        <button className="btn btn-primary w-full" disabled={eBusy}
                          onClick={() => enregistrerEdition(d, ctx.contexte.foyer.id)}>
                          {eBusy ? 'Enregistrement…' : 'Enregistrer les modifications'}
                        </button>
                        <button className="btn btn-ghost w-full" onClick={() => setEditId(null)}>Annuler</button>
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
