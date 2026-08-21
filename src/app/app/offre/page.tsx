'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { Icone } from '@/components/icons';
import { PastilleOffre } from '@/components/premium';
import { useContexte } from '@/lib/use-contexte';
import {
  getOffre, listerExtensions, listerAchats, ouvrirPaiement, ouvrirPortail,
  type Offre, type Extension, type AchatExtension,
} from '@/lib/actions';
import { formatCents } from '@/lib/money';

function dateLongue(iso: string) {
  return new Date(iso.length > 10 ? iso : iso + 'T12:00:00')
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Fonctions incluses dans Zen Plus, formulées par le bénéfice concret. */
const AVANTAGES = [
  'Planning sans limite de durée, autant d’années que nécessaire',
  'Vacances et changements ponctuels illimités',
  'Export PDF mensuel du planning et des dépenses',
  'Historique complet des modifications',
  'Justificatifs multiples par dépense',
];

function ContenuOffre() {
  const { ctx, recharger } = useContexte();
  const parametres = useSearchParams();
  const [offre, setOffre] = useState<Offre | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [achats, setAchats] = useState<AchatExtension[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [periodicite, setPeriodicite] = useState<'month' | 'year'>('year');
  /**
   * Suivi de la confirmation après un retour de Stripe.
   * 'attente' tant que le webhook n'a pas crédité, 'lent' s'il tarde.
   */
  const [confirmation, setConfirmation] = useState<'attente' | 'ok' | 'lent' | null>(null);

  const retourPaiement = parametres.get('paiement');
  const typeAchat = parametres.get('type');

  const charger = useCallback(() => {
    if (ctx.etat !== 'pret') return;
    const hid = ctx.contexte.foyer.id;
    getOffre(hid).then((r) => {
      if (r.status === 'ok') setOffre(r.data);
      else if (r.status === 'error') setErreur(r.message);
    });
    listerExtensions().then((r) => { if (r.status === 'ok') setExtensions(r.data); });
    listerAchats(hid).then((r) => { if (r.status === 'ok') setAchats(r.data); });
  }, [ctx]);

  useEffect(charger, [charger]);

  /**
   * Retour de Stripe.
   *
   * Le paiement est encaissé côté Stripe, mais le droit ne s'ouvre qu'à
   * l'arrivée du webhook, quelques secondes plus tard. Une seule tentative de
   * rechargement ne suffisait pas : passé ce délai, l'écran continuait
   * d'annoncer l'offre gratuite alors que l'abonnement était bien payé.
   *
   * On interroge donc l'offre jusqu'à ce que le droit apparaisse, une trentaine
   * de secondes durant. Le reste de l'application est prévenu au passage, pour
   * que les bandeaux d'horizon disparaissent eux aussi.
   */
  const contexteRecharge = useRef(recharger);
  contexteRecharge.current = recharger;

  useEffect(() => {
    if (retourPaiement === 'annule') {
      setMsg('Paiement annulé. Rien ne vous a été facturé.');
      return undefined;
    }
    if (retourPaiement !== 'reussi' || ctx.etat !== 'pret') return undefined;

    const hid = ctx.contexte.foyer.id;
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    let reference: number | null = null;   // mois crédités avant le paiement
    setConfirmation('attente');

    const attendreCredit = async (essai: number) => {
      if (!vivant) return;
      const r = await getOffre(hid);
      if (!vivant) return;
      if (r.status === 'ok') {
        setOffre(r.data);
        if (reference === null) reference = r.data.moisAjoutes;
        const credite = typeAchat === 'extension'
          ? r.data.moisAjoutes > reference
          : r.data.illimite;
        if (credite) {
          setConfirmation('ok');
          listerAchats(hid).then((a) => { if (a.status === 'ok' && vivant) setAchats(a.data); });
          contexteRecharge.current();     // bandeaux et pastilles suivent
          return;
        }
      }
      if (essai >= 15) { setConfirmation('lent'); return; }
      minuteur = setTimeout(() => { void attendreCredit(essai + 1); }, 2000);
    };

    void attendreCredit(0);
    return () => { vivant = false; if (minuteur) clearTimeout(minuteur); };
  }, [retourPaiement, typeAchat, ctx]);

  const estProprietaire = ctx.etat === 'pret'
    && (ctx.contexte.foyer.role === 'owner' || ctx.contexte.foyer.role === 'admin');

  async function acheter(type: 'extension' | 'abonnement', extensionId?: string) {
    if (ctx.etat !== 'pret') return;
    setErreur(null); setMsg(null);
    setEnCours(extensionId ?? type);
    const r = await ouvrirPaiement({
      householdId: ctx.contexte.foyer.id, type, extensionId, periodicite,
    });
    setEnCours(null);
    if (r.status === 'ok') window.location.href = r.data;
    else if (r.status === 'error') setErreur(r.message);
    else setErreur('Session non authentifiée. Reconnectez-vous.');
  }

  async function gerer() {
    if (ctx.etat !== 'pret') return;
    setErreur(null); setEnCours('portail');
    const r = await ouvrirPortail(ctx.contexte.foyer.id);
    setEnCours(null);
    if (r.status === 'ok') window.location.href = r.data;
    else if (r.status === 'error') setErreur(r.message);
  }

  return (
    <main className="space-y-4 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[19px] font-semibold tracking-tight">Votre offre</h1>
        <PastilleOffre offre={offre} />
      </div>

      {confirmation === 'ok' && (
        <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">
          Paiement confirmé. Votre offre est à jour.
        </p>
      )}
      {msg && (
        <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">{msg}</p>
      )}
      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}
      {ctx.etat === 'demo' && <Vide titre="Mode démonstration" texte="Connectez-vous pour gérer votre offre." />}
      {erreur && <Erreur message={erreur} />}

      {ctx.etat === 'pret' && offre && (
        <>
          {/* État actuel */}
          <section className="card px-4 py-5">
            {!offre.illimite && (confirmation === 'attente' || confirmation === 'lent') ? (
              <>
                <p className="font-display text-[17px] font-semibold tracking-tight">
                  {confirmation === 'attente' ? 'Activation en cours…' : 'Activation plus longue que prévu'}
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-soft">
                  Votre paiement a bien été reçu. L’ouverture des droits est
                  confirmée par notre prestataire de paiement, ce qui prend
                  généralement quelques secondes.
                  {confirmation === 'lent'
                    && ' La confirmation tarde ; rien n’est perdu, votre paiement est enregistré.'}
                </p>
                <button className="btn btn-ghost mt-3 w-full" onClick={charger}>
                  Actualiser
                </button>
                {confirmation === 'lent' && (
                  <p className="mt-2 text-[12px] leading-snug text-soft">
                    Si l’offre n’apparaît toujours pas d’ici quelques minutes,
                    écrivez-nous : le paiement est tracé de notre côté et sera
                    honoré sans nouvelle démarche de votre part.
                  </p>
                )}
              </>
            ) : offre.illimite ? (
              <>
                <p className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
                  <span className="text-[#1F7A45]"><Icone nom="check" taille={18} /></span>
                  Zen Plus actif
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-soft">
                  Votre planning n’a aucune limite de durée.
                  {offre.periodiciteActive === 'year' && ' Formule annuelle.'}
                  {offre.periodiciteActive === 'month' && ' Formule mensuelle.'}
                  {offre.abonnementFin && (
                    offre.resiliationProgrammee
                      ? ` Votre abonnement prend fin le ${dateLongue(offre.abonnementFin)} ; vous en gardez le bénéfice jusque-là.`
                      : ` Prochain renouvellement le ${dateLongue(offre.abonnementFin)}.`
                  )}
                </p>
                {estProprietaire && (
                  <button className="btn btn-ghost mt-3 w-full" disabled={enCours === 'portail'}
                          onClick={gerer}>
                    {enCours === 'portail' ? 'Ouverture…' : 'Gérer l’abonnement et les factures'}
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="font-display text-[17px] font-semibold tracking-tight">
                  3 mois gratuits
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-soft">
                  {offre.horizon && (
                    <>Votre planning couvre jusqu’au <strong>{dateLongue(offre.horizon)}</strong>.</>
                  )}
                  {' '}
                  {offre.moisOfferts} mois offerts
                  {offre.moisAjoutes > 0 && `, ${offre.moisAjoutes} mois ajoutés`}.
                </p>
                {offre.joursRestants !== null && (
                  <p className={`mt-2 text-[13px] font-bold ${
                    offre.joursRestants <= 0 ? 'text-err'
                    : offre.joursRestants <= 30 ? 'text-wait' : 'text-soft'}`}>
                    {offre.joursRestants <= 0
                      ? 'Limite atteinte : la planification au-delà demande des mois supplémentaires.'
                      : `${offre.joursRestants} jour${offre.joursRestants > 1 ? 's' : ''} restants.`}
                  </p>
                )}
                <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-[13px] leading-snug text-soft">
                  Quoi qu’il arrive, vos dépenses, vos remboursements et vos
                  justificatifs restent accessibles et exportables. La limite ne
                  concerne que la planification dans le futur.
                </p>
              </>
            )}
          </section>

          {/* Abonnement */}
          {!offre.illimite && (
            <section className="card px-4 py-5">
              <h2 className="font-display text-[17px] font-semibold tracking-tight">
                {offre.planLibelle}
              </h2>

              {/* Deux formules ; l'annuelle est proposée par défaut car moins chère */}
              <fieldset className="mt-3">
                <legend className="sr-only">Formule d’abonnement</legend>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={periodicite === 'year'}
                    onClick={() => setPeriodicite('year')}
                    className={`btn flex-col py-2.5 ${periodicite === 'year' ? 'btn-primary' : 'btn-ghost'}`}>
                    <span className="text-[15px] font-bold tabular-nums">
                      {formatCents(offre.prixAnnuelCents)}
                    </span>
                    <span className="text-[11px] font-semibold opacity-85">par an</span>
                  </button>
                  <button type="button" aria-pressed={periodicite === 'month'}
                    onClick={() => setPeriodicite('month')}
                    className={`btn flex-col py-2.5 ${periodicite === 'month' ? 'btn-primary' : 'btn-ghost'}`}>
                    <span className="text-[15px] font-bold tabular-nums">
                      {formatCents(offre.prixMensuelCents)}
                    </span>
                    <span className="text-[11px] font-semibold opacity-85">par mois</span>
                  </button>
                </div>
                {offre.prixMensuelCents * 12 > offre.prixAnnuelCents && (
                  <p className="mt-1.5 text-center text-[11px] font-semibold text-[#1F7A45]">
                    La formule annuelle vous fait économiser{' '}
                    {formatCents(offre.prixMensuelCents * 12 - offre.prixAnnuelCents)} par an.
                  </p>
                )}
              </fieldset>
              <ul className="mt-3 space-y-2">
                {AVANTAGES.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-[13px] leading-snug">
                    <span aria-hidden className="mt-0.5 shrink-0 text-[#1F7A45]">
                      <Icone nom="check" taille={14} />
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
              {estProprietaire ? (
                <button className="btn btn-primary mt-4 w-full" disabled={enCours === 'abonnement'}
                        onClick={() => acheter('abonnement')}>
                  {enCours === 'abonnement' ? 'Ouverture du paiement…' : 'Passer à Zen Plus'}
                </button>
              ) : (
                <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-[13px] text-soft">
                  Seul le parent qui a créé le foyer peut souscrire.
                </p>
              )}
              <p className="mt-2 text-center text-[11px] text-soft/85">
                Sans engagement, résiliable à tout moment.
              </p>
            </section>
          )}

          {/* Extensions ponctuelles */}
          {!offre.illimite && extensions.length > 0 && (
            <section className="card px-4 py-5">
              <h2 className="font-display text-[17px] font-semibold tracking-tight">
                Ajouter des mois à la carte
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-soft">
                Paiement unique, sans abonnement. Les mois achetés vous restent acquis.
              </p>
              <ul className="mt-2 divide-y divide-line-soft">
                {extensions.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-snug">{e.libelle}</span>
                      <span className="text-[12px] text-soft/85">
                        soit {formatCents(Math.round(e.prixCents / e.mois))} par mois
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums">
                      {formatCents(e.prixCents)}
                    </span>
                    {estProprietaire && (
                      <button className="btn btn-ghost shrink-0 px-3 py-2 text-[13px]"
                              disabled={enCours === e.id}
                              onClick={() => acheter('extension', e.id)}>
                        {enCours === e.id ? '…' : 'Ajouter'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Historique des achats */}
          {achats.length > 0 && (
            <section className="card px-4 py-5">
              <h2 className="font-display text-[17px] font-semibold tracking-tight">Vos achats</h2>
              <ul className="mt-2 divide-y divide-line-soft">
                {achats.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold">+{a.mois} mois</span>
                      <span className="text-[12px] text-soft/85">{dateLongue(a.date)}</span>
                    </span>
                    <span className="shrink-0 text-[14px] font-bold tabular-nums">
                      {formatCents(a.montantCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="px-1 text-center text-[11px] leading-snug text-soft/85">
            Paiements traités par Stripe. Nous ne conservons aucune donnée bancaire.
            <br />
            <Link href="/app/plus" className="underline">Retour aux réglages</Link>
          </p>
        </>
      )}

      <BottomNav active="/app/plus" />
    </main>
  );
}

/**
 * useSearchParams impose une frontière Suspense lors de la génération
 * statique : le retour de paiement est lu dans l'URL, côté navigateur.
 */
export default function OffrePage() {
  return (
    <Suspense fallback={<main className="px-4 pt-3"><Chargement /></main>}>
      <ContenuOffre />
    </Suspense>
  );
}
