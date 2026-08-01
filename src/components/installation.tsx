'use client';

/**
 * Invitation à installer l'application sur l'écran d'accueil.
 *
 * L'encart disparaît dès que l'installation est faite : une invitation
 * répétée à quelque chose de déjà accompli devient du bruit, et finit par
 * faire ignorer le reste de l'écran.
 *
 * Il se referme aussi d'un geste, et ne revient pas avant un mois : un parent
 * qui préfère le navigateur ne doit pas être relancé à chaque visite.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  estInstallee, detecterPlateforme, etapesInstallation, beneficesInstallation,
  type Plateforme,
} from '@/lib/installation';
import { Icone } from './icons';

/** Report du rappel, en jours. */
const REPORT_JOURS = 30;
const CLE_REPORT = 'czen:installation-reportee';

type Etat = 'verification' | 'masque' | 'visible';

export function EncartInstallation() {
  const [etat, setEtat] = useState<Etat>('verification');
  const [plateforme, setPlateforme] = useState<Plateforme>('inconnue');
  const [deplie, setDeplie] = useState(false);

  const evaluer = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Déjà installée : rien à proposer
    const installee = estInstallee(
      (r) => window.matchMedia(r).matches,
      (window.navigator as { standalone?: boolean }).standalone,
    );
    if (installee) { setEtat('masque'); return; }

    // Report encore valable
    try {
      const jusqua = window.localStorage?.getItem(CLE_REPORT);
      if (jusqua && Number(jusqua) > Date.now()) { setEtat('masque'); return; }
    } catch {
      // Stockage indisponible en navigation privée : on affiche, sans plus
    }

    const p = detecterPlateforme(
      navigator.userAgent,
      navigator.maxTouchPoints > 1,
    );
    setPlateforme(p);
    setEtat('visible');
  }, []);

  useEffect(() => {
    evaluer();
    // L'installation peut se faire pendant la session : on réévalue au retour
    const surRetour = () => { if (!document.hidden) evaluer(); };
    document.addEventListener('visibilitychange', surRetour);
    return () => document.removeEventListener('visibilitychange', surRetour);
  }, [evaluer]);

  function reporter() {
    try {
      window.localStorage?.setItem(
        CLE_REPORT, String(Date.now() + REPORT_JOURS * 86400000),
      );
    } catch { /* sans stockage, le report ne dure que la session */ }
    setEtat('masque');
  }

  if (etat !== 'visible') return null;

  const etapes = etapesInstallation(plateforme);
  const benefices = beneficesInstallation(plateforme);
  const surIOS = plateforme === 'ios';

  return (
    <section className="card overflow-hidden" aria-label="Installer l’application">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-p1-bg text-navy-text">
          <Icone nom="telecharger" taille={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug">
            Installez Coparentalité&nbsp;Zen
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-soft">
            {surIOS
              ? 'Sur iPhone, c’est la seule façon de recevoir les alertes.'
              : 'Ouverture directe et alertes sur votre téléphone.'}
          </p>
        </div>
        <button type="button" aria-label="Masquer cette proposition"
          onClick={reporter}
          className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-soft/60">
          <Icone nom="croix" taille={16} />
        </button>
      </div>

      <button type="button"
        onClick={() => setDeplie((d) => !d)}
        aria-expanded={deplie}
        className="flex w-full items-center justify-between gap-2 border-t border-line-soft px-4 py-3 text-left active:bg-muted">
        <span className="text-[14px] font-bold">
          {deplie ? 'Masquer la marche à suivre' : 'Comment faire ?'}
        </span>
        <span aria-hidden className={`shrink-0 text-soft/60 transition-transform ${
          deplie ? 'rotate-90' : ''}`}>
          <Icone nom="chevron" taille={16} />
        </span>
      </button>

      {deplie && (
        <div className="space-y-3 border-t border-line-soft px-4 py-3.5">
          <ol className="space-y-2">
            {etapes.map((e) => (
              <li key={e.numero} className="flex items-start gap-2.5">
                <span aria-hidden
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-black text-soft">
                  {e.numero}
                </span>
                <span className="text-[14px] leading-snug">{e.texte}</span>
              </li>
            ))}
          </ol>

          <ul className="rounded-xl bg-muted px-3 py-2.5">
            {benefices.map((b) => (
              <li key={b} className="flex items-start gap-1.5 text-[13px] leading-snug text-soft">
                <span aria-hidden className="mt-1 shrink-0 text-[#1F7A45]">
                  <Icone nom="check" taille={12} />
                </span>
                {b}
              </li>
            ))}
          </ul>

          <p className="text-[11px] leading-snug text-soft/85">
            L’installation ne prend aucune place : l’application reste la même,
            simplement accessible depuis votre écran d’accueil.
          </p>
        </div>
      )}
    </section>
  );
}
