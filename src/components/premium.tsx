'use client';

/**
 * Protections Premium côté client.
 *
 * Ce sont des commodités d'affichage : elles évitent de proposer une action
 * qui sera refusée, et expliquent pourquoi. La barrière réelle est en base
 * (exiger_horizon), et elle n'est jamais contournable depuis ici — un client
 * modifié ne gagnerait rien d'autre qu'un message d'erreur du serveur.
 */
import Link from 'next/link';
import { JOURS_ALERTE, type Offre } from '@/lib/actions';
import { Icone } from './icons';

// La logique d'horizon vit dans un module sans JSX : elle est testable seule.
export { dansHorizon } from '@/lib/premium-horizon';

function dateCourte(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR',
    { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Bandeau d'information sur l'horizon.
 * Ne s'affiche que lorsqu'il est utile : à l'approche de la limite, ou passé
 * celle-ci. Un abonné ne voit rien.
 */
export function BandeauHorizon({ offre }: { offre: Offre | null }) {
  if (!offre || offre.illimite || !offre.horizon) return null;
  const restant = offre.joursRestants ?? 0;
  if (restant > JOURS_ALERTE) return null;

  const expire = restant <= 0;
  return (
    <section
      role="status"
      className={`card px-4 py-3.5 ${expire ? 'bg-err-bg' : 'bg-wait-bg'}`}
    >
      <p className={`flex items-start gap-2 text-sm font-bold ${expire ? 'text-err' : 'text-wait'}`}>
        <span aria-hidden className="mt-0.5 shrink-0"><Icone nom="calendrier" taille={16} /></span>
        <span>
          {expire
            ? `Vos 3 mois gratuits se sont terminés le ${dateCourte(offre.horizon)}.`
            : `Vos 3 mois gratuits couvrent jusqu’au ${dateCourte(offre.horizon)}.`}
        </span>
      </p>
      <p className="mt-1 pl-6 text-[13px] leading-snug text-soft">
        Vos données restent accessibles, y compris vos dépenses et vos
        justificatifs. Seule la planification au-delà de cette date demande des
        mois supplémentaires.
      </p>
      <Link href="/app/offre" className="btn btn-primary mt-3 w-full">
        Voir les options
      </Link>
    </section>
  );
}

/**
 * Message affiché à la place d'une action indisponible.
 * Formulé sans culpabilisation : la limite est celle de l'offre, pas une faute.
 */
export function LimiteAtteinte({ offre, action }: { offre: Offre; action: string }) {
  return (
    <div className="rounded-xl bg-wait-bg px-3 py-3">
      <p className="text-sm font-bold text-wait">{action} au-delà du {offre.horizon ? dateCourte(offre.horizon) : 'terme de votre offre'}</p>
      <p className="mt-1 text-[13px] leading-snug text-soft">
        Ajoutez des mois à la carte, ou passez à Zen Plus pour un planning sans limite.
      </p>
      <Link href="/app/offre" className="btn btn-primary mt-2.5 w-full">
        Voir les options
      </Link>
    </div>
  );
}

/** Pastille discrète de l'offre en cours, pour les écrans de réglages. */
export function PastilleOffre({ offre }: { offre: Offre | null }) {
  if (!offre) return null;
  if (offre.illimite) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF5F0] px-2.5 py-1 text-[11px] font-bold text-[#1F7A45]">
        <Icone nom="check" taille={12} />
        Zen Plus
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-soft">
      3 mois gratuits
      {offre.joursRestants !== null && offre.joursRestants <= JOURS_ALERTE
        && ` · ${offre.joursRestants} j`}
    </span>
  );
}
