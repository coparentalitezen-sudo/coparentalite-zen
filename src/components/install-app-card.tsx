'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@/components/icons';

type InstallationChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallationChoice>;
}

type Plateforme = 'ios' | 'android' | 'autre';

function estInstallee() {
  if (typeof window === 'undefined') return false;

  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );

  return standalone || iosStandalone;
}

function detecterPlateforme(): Plateforme {
  if (typeof navigator === 'undefined') return 'autre';

  const agent = navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(agent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (ios) return 'ios';
  if (/android/.test(agent)) return 'android';
  return 'autre';
}

/**
 * Aide d'installation PWA affichée sur l'accueil.
 *
 * - Android/Chrome : utilise l'invite native lorsqu'elle est disponible ;
 * - iPhone/iPad : explique la procédure Safari ;
 * - application déjà installée : disparaît automatiquement.
 */
export function InstallAppCard() {
  const [prete, setPrete] = useState(false);
  const [installee, setInstallee] = useState(false);
  const [invite, setInvite] = useState<BeforeInstallPromptEvent | null>(null);
  const [guideOuvert, setGuideOuvert] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const plateforme = useMemo(detecterPlateforme, []);

  useEffect(() => {
    setInstallee(estInstallee());
    setPrete(true);

    const avantInstallation = (event: Event) => {
      event.preventDefault();
      setInvite(event as BeforeInstallPromptEvent);
    };

    const apresInstallation = () => {
      setInstallee(true);
      setInvite(null);
      setGuideOuvert(false);
    };

    window.addEventListener('beforeinstallprompt', avantInstallation);
    window.addEventListener('appinstalled', apresInstallation);

    const media = window.matchMedia('(display-mode: standalone)');
    const changementAffichage = () => setInstallee(estInstallee());
    media.addEventListener?.('change', changementAffichage);

    return () => {
      window.removeEventListener('beforeinstallprompt', avantInstallation);
      window.removeEventListener('appinstalled', apresInstallation);
      media.removeEventListener?.('change', changementAffichage);
    };
  }, []);

  async function installer() {
    setMessage(null);

    if (invite) {
      await invite.prompt();
      const choix = await invite.userChoice;
      setInvite(null);

      if (choix.outcome === 'accepted') {
        setMessage('Installation en cours…');
      } else {
        setMessage('Vous pourrez installer l’application plus tard.');
      }
      return;
    }

    setGuideOuvert(true);
  }

  if (!prete || installee) return null;

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-[#CFE0F3] bg-[#EEF5FD]"
      aria-labelledby="titre-installation"
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#2C5FA8] shadow-sm">
            <Icone nom="calendrier" taille={21} />
          </span>

          <div className="min-w-0 flex-1">
            <p
              id="titre-installation"
              className="text-[15px] font-extrabold leading-snug text-navy-text"
            >
              Installer Coparentalité Zen
            </p>

            <p className="mt-1 text-[12px] leading-relaxed text-soft">
              Accédez plus vite au planning et profitez des rappels comme avec
              une application classique.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={installer}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 text-[13px] font-bold text-white"
        >
          {invite ? 'Installer l’application' : 'Voir comment l’installer'}
          <Icone nom="chevron" taille={14} />
        </button>

        {message && (
          <p className="mt-2 text-center text-[11px] font-semibold text-soft">
            {message}
          </p>
        )}
      </div>

      {guideOuvert && (
        <div className="border-t border-[#CFE0F3] bg-white px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-extrabold text-navy-text">
                {plateforme === 'ios'
                  ? 'Installation sur iPhone ou iPad'
                  : plateforme === 'android'
                    ? 'Installation sur Android'
                    : 'Installation sur votre appareil'}
              </h2>

              <p className="mt-1 text-[11px] leading-relaxed text-soft">
                {plateforme === 'ios'
                  ? 'Ouvrez cette page dans Safari pour afficher l’option d’installation.'
                  : plateforme === 'android'
                    ? 'Utilisez de préférence Google Chrome.'
                    : 'Utilisez le menu de votre navigateur pour ajouter l’application.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setGuideOuvert(false)}
              aria-label="Fermer le guide d’installation"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-soft"
            >
              ×
            </button>
          </div>

          {plateforme === 'ios' ? (
            <ol className="mt-4 space-y-3 text-[13px] leading-relaxed text-ink">
              <li className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E8F1FD] text-[12px] font-extrabold text-[#2C5FA8]">1</span>
                <span>Appuyez sur le bouton <strong>Partager</strong> de Safari.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E8F1FD] text-[12px] font-extrabold text-[#2C5FA8]">2</span>
                <span>Choisissez <strong>Sur l’écran d’accueil</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E8F1FD] text-[12px] font-extrabold text-[#2C5FA8]">3</span>
                <span>Appuyez sur <strong>Ajouter</strong>.</span>
              </li>
            </ol>
          ) : plateforme === 'android' ? (
            <ol className="mt-4 space-y-3 text-[13px] leading-relaxed text-ink">
              <li className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E8F1FD] text-[12px] font-extrabold text-[#2C5FA8]">1</span>
                <span>Ouvrez le menu <strong>⋮</strong> de Chrome.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E8F1FD] text-[12px] font-extrabold text-[#2C5FA8]">2</span>
                <span>Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E8F1FD] text-[12px] font-extrabold text-[#2C5FA8]">3</span>
                <span>Confirmez avec <strong>Installer</strong>.</span>
              </li>
            </ol>
          ) : (
            <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-[13px] leading-relaxed text-soft">
              Ouvrez le menu du navigateur, puis choisissez « Installer
              l’application » ou « Ajouter à l’écran d’accueil ».
            </p>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-soft">
            Une fois installée, cette aide disparaîtra automatiquement de la
            page d’accueil.
          </p>
        </div>
      )}
    </section>
  );
}
