'use client';

import { useCallback, useEffect, useState } from 'react';
import { BottomNav, ParentBadge } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import {
  listerDepenses, reviserDepense, creerRemboursement, listerRemboursements,
  listerJustificatifs, urlJustificatifParId, retirerJustificatif, type Justificatif,
  urlJustificatifRemboursement, annulerRemboursement, modifierDepense, supprimerDepense, METHODES,
  getSolde, soldeLocalTransitoire, type Solde,
  type DepenseListe, type Membre, type Remboursement,
} from '@/lib/actions';
import { balanceLabel, formatCents } from '@/lib/money';
import { checkFile, formatBytes, MAX_JUSTIFICATIF_BYTES } from '@/lib/files';
import { Icone, PASTILLES, categorieVisuel } from '@/components/icons';

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

function majuscule(t: string) { return t.charAt(0).toUpperCase() + t.slice(1); }
/** « 25 juil. » — repère court en tête de ligne. */
function jourMois(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
    .replace('.', '');
}
/** « juillet 2026 » à partir d'une clé AAAA-MM. */
function moisLong(cle: string) {
  return new Date(cle + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
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
  // Modification d'une dépense
  const [editId, setEditId] = useState<string | null>(null);
  const [eTitre, setETitre] = useState('');
  const [eMontant, setEMontant] = useState('');
  const [eDate, setEDate] = useState('');
  const [eSplit, setESplit] = useState(5000);
  const [eBusy, setEBusy] = useState(false);
  const [eErreur, setEErreur] = useState<string | null>(null);
  const [busyRevue, setBusyRevue] = useState<string | null>(null);
  const [contesteId, setContesteId] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  const [ouvertRembId, setOuvertRembId] = useState<string | null>(null);
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

  async function reviser(id: string, action: 'validate' | 'dispute', householdId: string, motif?: string) {
    setMsg(null); setEErreur(null); setEditId(null);
    if (busyRevue) return;                       // garde contre le double clic
    setBusyRevue(id);
    const r = await reviserDepense(id, action, motif);
    setBusyRevue(null);
    if (r.status === 'ok') {
      setMsg(action === 'validate'
        ? 'Dépense validée. Le solde est à jour.'
        : 'Dépense signalée à vérifier. Elle apparaît maintenant comme telle pour les deux parents.');
      setContesteId(null); setMotif('');
      charger(householdId, p1?.profileId, p2?.profileId);
    } else if (r.status === 'error') {
      // affichée sur la dépense concernée, là où l'action a été déclenchée
      setEditId(id); setEErreur(r.message);
    }
  }

  /**
   * Justificatifs dépliés d'une dépense.
   *
   * Chargés à la demande plutôt qu'avec la liste des dépenses : la plupart
   * des dépenses n'en portent qu'un, et la plupart ne seront pas ouvertes.
   */
  const [justifsDe, setJustifsDe] = useState<string | null>(null);
  const [justifs, setJustifs] = useState<Justificatif[]>([]);
  const [justifsCharge, setJustifsCharge] = useState(false);

  async function basculerJustificatifs(id: string) {
    if (justifsDe === id) { setJustifsDe(null); return; }
    setJustifsDe(id); setJustifs([]); setJustifsCharge(false);
    const r = await listerJustificatifs(id);
    setJustifsCharge(true);
    if (r.status === 'ok') setJustifs(r.data);
    else if (r.status === 'error') { setEditId(id); setEErreur(r.message); }
  }

  async function ouvrirJustificatifParId(attachmentId: string, depenseId: string) {
    const r = await urlJustificatifParId(attachmentId);
    if (r.status === 'ok') window.open(r.data, '_blank');
    else if (r.status === 'error') { setEditId(depenseId); setEErreur(r.message); }
  }

  async function retirer(attachmentId: string, depenseId: string, foyerId: string) {
    if (!confirm('Retirer ce justificatif ? La dépense est conservée.')) return;
    const r = await retirerJustificatif(attachmentId);
    if (r.status === 'ok') {
      setJustifs((liste) => liste.filter((j) => j.id !== attachmentId));
      // Le compteur affiché sur la dépense vient de la liste : la recharger
      // évite un « 2 justificatifs » au-dessus d'une liste qui n'en montre qu'un.
      charger(foyerId, p1?.profileId, p2?.profileId);
    } else if (r.status === 'error') { setEditId(depenseId); setEErreur(r.message); }
  }

  const membres: Membre[] = ctx.etat === 'pret' ? ctx.contexte.membres : [];
  const moi = ctx.etat === 'pret' ? ctx.contexte.moi : null;
  const nom = (id: string) => membres.find((m) => m.profileId === id)?.nom ?? 'Parent';
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
    // Règle : chacun n'enregistre que les versements qu'il effectue lui-même.
    const r = await creerRemboursement({
      householdId, deParent: moi, versParent: autre.profileId, montantCents: cents,
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
    // Le versement part toujours du parent connecté vers l'autre.
    // Un règlement du parent 1 vers le parent 2 augmente le net du parent 1.
    const futurNet = solde.netCents + (moi === solde.parent1 ? cents : -cents);
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
    setEErreur(null);
    setETitre(d.titre);
    setEMontant((d.montantCents / 100).toFixed(2).replace('.', ','));
    setEDate(d.date);
    setESplit(d.repartition ?? 5000);
    setErreur(null); setMsg(null);
  }

  async function enregistrerEdition(d: DepenseListe, householdId: string) {
    if (!p1) return;
    setEErreur(null);
    if (!eTitre.trim()) { setEErreur('Indiquez un titre.'); return; }
    const clean = eMontant.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) { setEErreur('Indiquez un montant valide, par exemple 24,90.'); return; }
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
      setEditId(null); setEErreur(null);
      charger(householdId, p1?.profileId, p2?.profileId);
    } else if (r.status === 'error') {
      // affichée DANS le formulaire : l'utilisateur agit ici, pas en haut de page
      setEErreur(r.message);
    } else {
      setEErreur('Modification indisponible : session non authentifiée. Reconnectez-vous.');
    }
  }

  async function supprimer(d: DepenseListe, householdId: string) {
    if (!confirm(`Supprimer « ${d.titre} » ? La dépense sort du solde ; la ligne reste conservée dans l’historique.`)) return;
    const r = await supprimerDepense(d.id);
    if (r.status === 'ok') { setMsg('Dépense supprimée.'); charger(householdId, p1?.profileId, p2?.profileId); }
    else if (r.status === 'error') { setEditId(d.id); setEErreur(r.message); }
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

              {!formRemb && jeDois > 0 && (
                <button className="btn btn-primary w-full"
                  onClick={() => { setFormRemb(true); setMontantR((jeDois / 100).toFixed(2).replace('.', ',')); }}>
                  Rembourser {formatCents(jeDois)}
                </button>
              )}
              {!formRemb && jeDois === 0 && autre && (
                <p className="rounded-xl bg-muted px-3 py-2 text-sm text-soft">
                  {solde && solde.netCents !== 0
                    ? `C’est à ${autre.nom} d’enregistrer son remboursement lorsqu’il ou elle vous aura payé : chaque parent enregistre les versements qu’il effectue.`
                    : 'Rien à régulariser pour le moment.'}
                </p>
              )}

              {formRemb && autre && (
                <div className="space-y-3 border-t border-line pt-3">
                  <h3 className="font-bold">Vous remboursez {autre.nom}</h3>
                  <p className="rounded-xl bg-muted px-3 py-2 text-xs text-soft">
                    Chaque parent enregistre uniquement les versements qu’il effectue lui-même.
                    {autre.nom} enregistrera de son côté les remboursements qu’il ou elle vous fera.
                  </p>
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

          {depenses && depenses.length > 0 && (() => {
            // Regroupement par mois : repère de lecture immédiat dans une liste longue
            const parMois = new Map<string, DepenseListe[]>();
            for (const d of depenses) {
              const cle = d.date.slice(0, 7);
              if (!parMois.has(cle)) parMois.set(cle, []);
              parMois.get(cle)!.push(d);
            }

            return [...parMois.entries()].map(([mois, items]) => {
              const totalMois = items.reduce((n, d) => n + d.montantCents, 0);
              return (
                <section key={mois} className="card px-4 py-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-[15px] font-semibold tracking-tight">
                      {majuscule(moisLong(mois))}
                    </h2>
                    <span className="text-[13px] font-semibold tabular-nums text-soft/85">
                      {formatCents(totalMois)}
                    </span>
                  </div>

                  <ul className="mt-1 divide-y divide-line-soft">
                    {items.map((d) => {
                      const payeur = membres.find((m) => m.profileId === d.payePar);
                      const st = LIBELLES[d.statut] ?? { texte: d.statut, classe: 'bg-muted text-soft' };
                      const aValider = d.statut === 'sent' && moi !== null && d.payePar !== moi && d.creePar !== moi;
                      const monEcriture = moi !== null && (d.payePar === moi || d.creePar === moi);
                      const ouvert = ouvertId === d.id;
                      const v = categorieVisuel(d.categorie);

                      return (
                        <li key={d.id}>
                          {/* Ligne compacte : date · parent · titre · montant */}
                          <button
                            type="button"
                            onClick={() => { setOuvertId(ouvert ? null : d.id); setEditId(null); setEErreur(null); }}
                            aria-expanded={ouvert}
                            className="flex min-h-14 w-full items-center gap-2.5 py-2.5 text-left"
                          >
                            <span className="w-9 shrink-0 text-[12px] font-bold tabular-nums text-soft/85">
                              {jourMois(d.date)}
                            </span>
                            {payeur && (
                              <span aria-label={`payé par ${payeur.nom}`}
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                                  payeur.couleur === 'coral' ? 'bg-p2-bg text-coral-text' : 'bg-p1-bg text-navy-text'}`}>
                                {payeur.initiale}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-bold leading-snug">{d.titre}</span>
                              <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold ${
                                d.statut === 'validated' || d.statut === 'reimbursed' ? 'text-[#1F7A45]'
                                : d.statut === 'disputed' ? 'text-err' : 'text-soft/85'}`}>
                                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${
                                  d.statut === 'validated' || d.statut === 'reimbursed' ? 'bg-[#1F7A45]'
                                  : d.statut === 'disputed' ? 'bg-err' : 'bg-[#D98324]'}`} />
                                {st.texte}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block whitespace-nowrap text-[15px] font-bold tabular-nums">
                                {formatCents(d.montantCents)}
                              </span>
                            </span>
                            <span aria-hidden className={`shrink-0 text-soft/60 transition-transform ${ouvert ? 'rotate-90' : ''}`}>
                              <Icone nom="chevron" taille={16} />
                            </span>
                          </button>

                          {/* Détail déplié */}
                          {ouvert && (
                            <div className="space-y-3 pb-4 pl-11 pr-1">
                              <dl className="space-y-1 text-[13px]">
                                <div className="flex gap-2">
                                  <dt className="w-24 shrink-0 text-soft/85">Date</dt>
                                  <dd className="font-semibold">{frDate(d.date)}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-24 shrink-0 text-soft/85">Payé par</dt>
                                  <dd className="font-semibold">{nom(d.payePar)}</dd>
                                </div>
                                {d.categorie && (
                                  <div className="flex gap-2">
                                    <dt className="w-24 shrink-0 text-soft/85">Catégorie</dt>
                                    <dd className="flex items-center gap-1.5 font-semibold">
                                      <span className={`grid h-5 w-5 place-items-center rounded-md ${PASTILLES[v.ton]}`}>
                                        <Icone nom={v.nom} taille={12} />
                                      </span>
                                      {d.categorie}
                                    </dd>
                                  </div>
                                )}
                                {p2 && d.parts.length > 1 && (
                                  <div className="flex gap-2">
                                    <dt className="w-24 shrink-0 text-soft/85">Répartition</dt>
                                    <dd className="font-semibold">
                                      {d.parts.map((part, i) => (
                                        <span key={part.parentId}>
                                          {i > 0 && ' · '}{nom(part.parentId)} {formatCents(part.owedCents)}
                                        </span>
                                      ))}
                                    </dd>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <dt className="w-24 shrink-0 text-soft/85">Statut</dt>
                                  <dd>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.classe}`}>
                                      {st.texte}
                                    </span>
                                  </dd>
                                </div>
                              </dl>

                              {d.statut === 'disputed' && (
                                <p className="rounded-xl bg-err-bg px-3 py-2 text-[13px] text-err">
                                  <strong>À vérifier</strong>
                                  {d.contestePar && ` — signalé par ${nom(d.contestePar)}`}
                                  {d.motifContestation ? ` : « ${d.motifContestation} »` : '.'}
                                  {monEcriture && ' Modifiez la dépense pour repartir sur une base acceptée.'}
                                </p>
                              )}

                              {d.justificatifs > 0 && (
                                <div className="space-y-2">
                                  <button type="button"
                                          className="text-[13px] font-bold text-navy-text underline"
                                          aria-expanded={justifsDe === d.id}
                                          onClick={() => basculerJustificatifs(d.id)}>
                                    {d.justificatifs === 1
                                      ? 'Voir le justificatif'
                                      : `Voir les ${d.justificatifs} justificatifs`}
                                  </button>

                                  {justifsDe === d.id && (
                                    <ul className="space-y-1.5">
                                      {!justifsCharge && (
                                        <li className="text-[13px] text-soft">Chargement…</li>
                                      )}
                                      {justifsCharge && justifs.length === 0 && (
                                        <li className="text-[13px] text-soft">
                                          Aucun justificatif disponible.
                                        </li>
                                      )}
                                      {justifs.map((j) => (
                                        <li key={j.id}
                                            className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                                          <button type="button"
                                                  className="flex-1 truncate text-left text-[13px] font-bold text-navy-text underline"
                                                  onClick={() => ouvrirJustificatifParId(j.id, d.id)}>
                                            {j.nomFichier}
                                          </button>
                                          <span className="shrink-0 text-[11px] text-soft">
                                            {Math.max(1, Math.round(j.taille / 1024))} Ko
                                          </span>
                                          {monEcriture && (
                                            <button type="button"
                                                    aria-label={`Retirer ${j.nomFichier}`}
                                                    className="shrink-0 text-[12px] font-bold text-err underline"
                                                    onClick={() => retirer(j.id, d.id, ctx.contexte.foyer.id)}>
                                              Retirer
                                            </button>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}

                              {aValider && contesteId !== d.id && (
                                <div className="flex gap-2">
                                  <button className="btn btn-primary flex-1" disabled={busyRevue === d.id}
                                    onClick={() => reviser(d.id, 'validate', ctx.contexte.foyer.id)}>
                                    {busyRevue === d.id ? '…' : 'Valider'}
                                  </button>
                                  <button className="btn btn-ghost flex-1" disabled={busyRevue === d.id}
                                    onClick={() => { setContesteId(d.id); setMotif(''); }}>
                                    À vérifier
                                  </button>
                                </div>
                              )}

                              {aValider && contesteId === d.id && (
                                <div className="space-y-2 rounded-xl bg-muted p-3">
                                  <label className="block">
                                    <span className="mb-1 block text-[13px] font-bold">
                                      Qu’est-ce qui vous semble à vérifier ?
                                    </span>
                                    <input value={motif} onChange={(e) => setMotif(e.target.value)}
                                      maxLength={200} placeholder="Montant, date, dépense déjà réglée…" />
                                    <span className="mt-1 block text-[11px] text-soft/85">
                                      Ce motif sera visible par {nom(d.payePar)}, qui pourra corriger la dépense.
                                    </span>
                                  </label>
                                  <button className="btn btn-primary w-full" disabled={busyRevue === d.id || motif.trim().length < 3}
                                    onClick={() => reviser(d.id, 'dispute', ctx.contexte.foyer.id, motif.trim())}>
                                    {busyRevue === d.id ? 'Envoi…' : 'Signaler à vérifier'}
                                  </button>
                                  <button className="btn btn-ghost w-full" onClick={() => setContesteId(null)}>
                                    Annuler
                                  </button>
                                </div>
                              )}

                              {monEcriture && editId !== d.id && (
                                <div className="flex gap-4">
                                  <button type="button" className="text-[13px] font-bold text-navy-text underline"
                                          onClick={() => ouvrirEdition(d)}>Modifier</button>
                                  <button type="button" className="text-[13px] font-bold text-err underline"
                                          onClick={() => supprimer(d, ctx.contexte.foyer.id)}>Supprimer</button>
                                </div>
                              )}

                              {editId === d.id && (
                                <div className="space-y-3 border-t border-line-soft pt-3">
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
                                  {eErreur && (
                                    <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                                      {eErreur}
                                    </p>
                                  )}
                                  <button className="btn btn-primary w-full" disabled={eBusy}
                                    onClick={() => enregistrerEdition(d, ctx.contexte.foyer.id)}>
                                    {eBusy ? 'Enregistrement…' : 'Enregistrer les modifications'}
                                  </button>
                                  <button className="btn btn-ghost w-full" onClick={() => setEditId(null)}>Annuler</button>
                                </div>
                              )}

                              {eErreur && editId === d.id && null}
                              {eErreur && editId !== d.id && ouvertId === d.id && (
                                <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                                  {eErreur}
                                </p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            });
          })()}

          {remboursements.length > 0 && (() => {
            // Même grammaire de lecture que les dépenses : groupé par mois,
            // ligne compacte, détail au clic.
            const parMois = new Map<string, Remboursement[]>();
            for (const r of remboursements) {
              const cle = r.date.slice(0, 7);
              if (!parMois.has(cle)) parMois.set(cle, []);
              parMois.get(cle)!.push(r);
            }

            return [...parMois.entries()].map(([mois, items]) => {
              const total = items.reduce((n, r) => n + r.montantCents, 0);
              return (
                <section key={`remb-${mois}`} className="card px-4 py-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-[15px] font-semibold tracking-tight">
                      Remboursements · {majuscule(moisLong(mois))}
                    </h2>
                    <span className="text-[13px] font-semibold tabular-nums text-soft/85">
                      {formatCents(total)}
                    </span>
                  </div>

                  <ul className="mt-1 divide-y divide-line-soft">
                    {items.map((r) => {
                      const de = membres.find((m) => m.profileId === r.deParent);
                      const vers = membres.find((m) => m.profileId === r.versParent);
                      const methode = METHODES.find((m) => m.valeur === r.methode)?.libelle ?? r.methode;
                      const ouvert = ouvertRembId === r.id;
                      const monOperation = r.creePar === moi || r.deParent === moi || r.versParent === moi;
                      const jeSuisPayeur = r.deParent === moi;

                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => setOuvertRembId(ouvert ? null : r.id)}
                            aria-expanded={ouvert}
                            className="flex min-h-14 w-full items-center gap-2.5 py-2.5 text-left"
                          >
                            <span className="w-9 shrink-0 text-[12px] font-bold tabular-nums text-soft/85">
                              {jourMois(r.date)}
                            </span>
                            {de && (
                              <span aria-label={`versé par ${de.nom}`}
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                                  de.couleur === 'coral' ? 'bg-p2-bg text-coral-text' : 'bg-p1-bg text-navy-text'}`}>
                                {de.initiale}
                              </span>
                            )}
                            <span aria-hidden className="shrink-0 text-soft/60">
                              <Icone nom="chevron" taille={13} />
                            </span>
                            {vers && (
                              <span aria-label={`reçu par ${vers.nom}`}
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                                  vers.couleur === 'coral' ? 'bg-p2-bg text-coral-text' : 'bg-p1-bg text-navy-text'}`}>
                                {vers.initiale}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-bold leading-snug">
                                {jeSuisPayeur ? `Vous avez remboursé ${vers?.nom ?? ''}` : `${de?.nom ?? 'Parent'} vous a remboursé`}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] font-semibold text-soft/85">
                                {methode}
                              </span>
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums">
                              {formatCents(r.montantCents)}
                            </span>
                            <span aria-hidden className={`shrink-0 text-soft/60 transition-transform ${ouvert ? 'rotate-90' : ''}`}>
                              <Icone nom="chevron" taille={16} />
                            </span>
                          </button>

                          {ouvert && (
                            <div className="space-y-3 pb-4 pl-11 pr-1">
                              <dl className="space-y-1 text-[13px]">
                                <div className="flex gap-2">
                                  <dt className="w-24 shrink-0 text-soft/85">Date</dt>
                                  <dd className="font-semibold">{frDate(r.date)}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-24 shrink-0 text-soft/85">Sens</dt>
                                  <dd className="font-semibold">
                                    {de?.nom ?? 'Parent'} → {vers?.nom ?? 'Parent'}
                                  </dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-24 shrink-0 text-soft/85">Moyen</dt>
                                  <dd className="font-semibold">{methode}</dd>
                                </div>
                                {r.reference && (
                                  <div className="flex gap-2">
                                    <dt className="w-24 shrink-0 text-soft/85">Référence</dt>
                                    <dd className="break-all font-semibold">{r.reference}</dd>
                                  </div>
                                )}
                                {r.commentaire && (
                                  <div className="flex gap-2">
                                    <dt className="w-24 shrink-0 text-soft/85">Note</dt>
                                    <dd>{r.commentaire}</dd>
                                  </div>
                                )}
                              </dl>

                              <div className="flex flex-wrap items-center gap-4">
                                {r.justificatif && (
                                  <button type="button" className="text-[13px] font-bold text-navy-text underline"
                                          onClick={() => ouvrirJustificatifRemb(r.justificatif!)}>
                                    Voir le justificatif
                                  </button>
                                )}
                                {monOperation && (
                                  <button type="button" className="text-[13px] font-bold text-err underline"
                                          onClick={() => annuler(r.id, ctx.contexte.foyer.id)}>
                                    Annuler ce remboursement
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            });
          })()}

        </>
      )}

      <BottomNav active="/app/depenses" />
    </main>
  );
}
