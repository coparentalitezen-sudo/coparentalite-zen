'use client';

/**
 * Progression de la configuration, affichée tant que le foyer n'est pas prêt.
 *
 * Elle disparaît d'elle-même une fois toutes les étapes accomplies : un
 * bandeau permanent finirait par être ignoré, et n'aurait plus rien à dire.
 */
import Link from 'next/link';
import { etapes, avancement, prochaineEtape, type EtatConfiguration } from '@/lib/configuration';
import { Icone } from './icons';

/** Version compacte : une ligne, pour l'accueil. */
export function ProgressionCompacte({ etat }: { etat: EtatConfiguration }) {
  const a = avancement(etat);
  if (a.terminee) return null;
  const suivante = prochaineEtape(etat);
  if (!suivante) return null;

  return (
    <Link href={suivante.href}
      className="card flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted">
      <span aria-hidden
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-p1-bg text-[13px] font-black text-navy-text">
        {a.faites}/{a.total}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-soft">
          Configuration en cours
        </span>
        <span className="block truncate font-bold leading-snug">
          {suivante.numero}. {suivante.titre}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-soft/60">
        <Icone nom="chevron" taille={18} />
      </span>
    </Link>
  );
}

/** Version détaillée : la liste complète, pour l'écran du foyer. */
export function ProgressionDetaillee({ etat }: { etat: EtatConfiguration }) {
  const liste = etapes(etat);
  const a = avancement(etat);

  return (
    <section className="card px-4 py-5" aria-label="Progression de la configuration">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">
          {a.terminee ? 'Configuration terminée' : 'Configuration de votre foyer'}
        </h2>
        <span className="text-[13px] font-bold tabular-nums text-soft">
          {a.faites}/{a.total}
        </span>
      </div>

      {/* Barre de progression : repère visuel, doublé du décompte chiffré */}
      <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-[#22A15B] transition-[width]"
             style={{ width: `${a.pourcentage}%` }} />
      </div>

      <ol className="mt-3 space-y-2.5">
        {liste.map((e) => (
          <li key={e.cle} className="flex items-start gap-3">
            <span aria-hidden
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                e.fait ? 'bg-[#E7F4EC] text-[#1F7A45]' : 'bg-muted text-soft'}`}>
              {e.fait ? <Icone nom="check" taille={13} /> : e.numero}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[15px] leading-snug ${
                e.fait ? 'font-semibold text-soft' : 'font-bold'}`}>
                {e.titre}
                {e.facultative && !e.fait && (
                  <span className="ml-1.5 text-[11px] font-semibold text-soft/85">facultatif</span>
                )}
              </span>
              {!e.fait && (
                <span className="mt-0.5 block text-[13px] leading-snug text-soft/85">
                  {e.aQuoiCaSert}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {a.terminee && (
        <p className="mt-3 rounded-xl bg-ok-bg px-3 py-2 text-[13px] font-bold text-ok">
          Votre foyer est prêt. Vous pouvez modifier ces réglages à tout moment.
        </p>
      )}
    </section>
  );
}
