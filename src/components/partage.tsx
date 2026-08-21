'use client';

/**
 * Règlement du foyer : choix du mode, et suivi du partage.
 *
 * Le choix entre les deux modes est présenté sans hiérarchie. Ni pastille
 * « recommandé », ni ordre suggestif, ni formulation valorisante d'un côté :
 * ces deux options touchent à un équilibre financier entre deux parents
 * séparés, et l'application n'a pas à peser dessus. Elle décrit, elle
 * n'oriente pas.
 */
import { useState } from 'react';
import { Icone } from '@/components/icons';
import { formatCents } from '@/lib/money';
import { repartirMoitie, libelleEtat, agreger, type EtatAgrege } from '@/lib/paiement-partage';
import type { PartageVue } from '@/lib/actions/partage';

export type ModeReglement = 'integral' | 'partage';

/**
 * Question posée avant toute ouverture de session Stripe.
 * Les deux montants exacts sont affichés : sur un tarif impair, l'un des deux
 * parents paie un centime de plus, et le taire serait une mauvaise surprise.
 */
export function ChoixModeReglement({
  totalCents, choix, onChoisir, desactive,
}: {
  totalCents: number;
  choix: ModeReglement | null;
  onChoisir: (mode: ModeReglement) => void;
  desactive?: boolean;
}) {
  const { premiere, seconde } = repartirMoitie(totalCents);

  return (
    <fieldset className="mt-4" disabled={desactive}>
      <legend className="font-display text-[15px] font-semibold tracking-tight">
        Comment souhaitez-vous procéder au paiement ?
      </legend>

      <div className="mt-3 space-y-2">
        <button
          type="button"
          aria-pressed={choix === 'partage'}
          onClick={() => onChoisir('partage')}
          className={`w-full rounded-xl border-2 px-3.5 py-3 text-left transition ${
            choix === 'partage' ? 'border-navy bg-muted' : 'border-line bg-white'
          }`}
        >
          <span className="block text-[14px] font-bold text-navy-text">
            Partager le paiement à 50/50
          </span>
          <span className="mt-1 block text-[13px] leading-snug text-soft">
            Chaque parent règle 50 % de l’abonnement. L’abonnement sera activé
            lorsque l’autre parent aura accepté le partage et réglé sa part.
          </span>
          <span className="mt-2 block text-[12px] font-semibold tabular-nums text-navy-text">
            {formatCents(premiere)} pour vous · {formatCents(seconde)} pour l’autre parent
          </span>
          <span className="mt-1 block text-[12px] leading-snug text-soft">
            Aucun prélèvement tant que les deux cartes ne sont pas enregistrées.
          </span>
        </button>

        <button
          type="button"
          aria-pressed={choix === 'integral'}
          onClick={() => onChoisir('integral')}
          className={`w-full rounded-xl border-2 px-3.5 py-3 text-left transition ${
            choix === 'integral' ? 'border-navy bg-muted' : 'border-line bg-white'
          }`}
        >
          <span className="block text-[14px] font-bold text-navy-text">
            Régler la totalité
          </span>
          <span className="mt-1 block text-[13px] leading-snug text-soft">
            Je règle la totalité maintenant. L’abonnement du foyer sera activé
            immédiatement après confirmation du paiement.
          </span>
          <span className="mt-2 block text-[12px] font-semibold tabular-nums text-navy-text">
            {formatCents(totalCents)}
          </span>
        </button>
      </div>

      <p className="mt-2.5 text-[12px] leading-snug text-soft">
        Quel que soit le mode retenu, les deux parents conservent exactement les
        mêmes droits sur le planning, les dépenses et les décisions. Payer ne
        donne aucun pouvoir supplémentaire.
      </p>
    </fieldset>
  );
}

/** Traduit un état en couleur, sans dramatiser un simple retard. */
function tonalite(etat: EtatAgrege): string {
  if (etat === 'actif') return 'bg-ok-bg text-ok';
  if (etat === 'interrompu' || etat === 'invalide') return 'bg-err-bg text-err';
  return 'bg-wait-bg text-wait';
}

/**
 * Suivi du règlement partagé, visible par les deux parents.
 *
 * L'autre parent doit pouvoir constater que l'abonnement est actif et où en
 * est chaque moitié — sans jamais accéder aux données bancaires du payeur.
 * Rien de ce qui vient de Stripe ne transite jusqu'ici.
 */
export function SuiviPartage({
  partage, onRepondre, enCours,
}: {
  partage: PartageVue;
  onRepondre: (reponse: 'accepte' | 'refuse') => void;
  enCours: string | null;
}) {
  const etat = agreger(
    {
      mode: partage.mode,
      partsAttendues: partage.partsAttendues === 1 ? 1 : 2,
      totalCents: partage.totalCents,
      expireLe: partage.expireLe,
    },
    partage.parts.map((p) => ({
      statut: p.statut, montantCents: p.montantCents, parentId: p.parentId,
    })),
  );

  const maPart = partage.parts.find((p) => p.estMoi);
  const doitRepondre = maPart?.statut === 'awaiting_partner';

  return (
    <section className="card px-4 py-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">
          Règlement partagé
        </h2>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${tonalite(etat)}`}>
          {libelleEtat(etat)}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {partage.parts.map((p) => (
          <li key={p.parentId} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate">
              {p.estMoi ? 'Votre part' : 'Part de l’autre parent'}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-bold tabular-nums">{formatCents(p.montantCents)}</span>
              {p.statut === 'paid' ? (
                <span className="text-[#1F7A45]" aria-label="réglée">
                  <Icone nom="check" taille={14} />
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-soft">
                  {p.statut === 'awaiting_partner' ? 'en attente'
                    : p.statut === 'refused' ? 'refusée'
                    : p.statut === 'expired' ? 'expirée'
                    : p.statut === 'past_due' ? 'impayée'
                    : p.statut === 'failed' ? 'échouée'
                    : 'en cours'}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[12px] leading-snug text-soft">
        Total {formatCents(partage.totalCents)}
        {partage.periodicite === 'year' ? ' par an.' : ' par mois.'}
        {' '}L’abonnement du foyer ne s’ouvre qu’une fois les deux parts réglées.
      </p>

      {etat === 'grace' && (
        <p className="mt-2 rounded-xl bg-wait-bg px-3 py-2 text-[12px] leading-snug text-wait">
          Un paiement n’a pas abouti. Votre accès reste ouvert le temps de
          mettre à jour le moyen de paiement concerné.
        </p>
      )}
      {etat === 'remboursement_du' && (
        <p className="mt-2 rounded-xl bg-wait-bg px-3 py-2 text-[12px] leading-snug text-wait">
          Le règlement s’est interrompu alors qu’une part avait été prélevée.
          Nous régularisons cette somme ; vous n’avez aucune démarche à faire.
        </p>
      )}

      {doitRepondre && (
        <div className="mt-4">
          <p className="text-[13px] leading-snug">
            L’autre parent vous propose de partager l’abonnement.
            Votre part serait de <strong>{formatCents(maPart.montantCents)}</strong>.
            Rien ne sera prélevé avant que vous ayez enregistré votre carte.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={enCours !== null}
              onClick={() => onRepondre('accepte')}
            >
              {enCours === 'accepte' ? 'Ouverture…' : 'Accepter et payer ma part'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={enCours !== null}
              onClick={() => onRepondre('refuse')}
            >
              {enCours === 'refuse' ? 'Enregistrement…' : 'Refuser'}
            </button>
          </div>
          {partage.expireLe && (
            <p className="mt-2 text-[11px] text-soft">
              Cette demande expire le{' '}
              {new Date(partage.expireLe).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
