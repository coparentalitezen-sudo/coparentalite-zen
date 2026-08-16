'use client';

import { useEffect, useState } from 'react';
import { track } from '@vercel/analytics';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Plateforme = 'ios' | 'android' | 'autre';

function detecterPlateforme(): Plateforme {
  if (typeof navigator === 'undefined') return 'autre';
  const ua = navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'autre';
}

function estInstallee(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return standalone || iosStandalone;
}

const CLE_INSTALLATION_MESUREE = 'cz.installation.mesuree';

// iOS Safari ne déclenche jamais « appinstalled ». On mesure donc la première
// ouverture en mode autonome, ce qui reste le seul signal fiable d'installation.
function mesurerPremiereOuvertureAutonome(plateforme: Plateforme) {
  try {
    if (window.localStorage.getItem(CLE_INSTALLATION_MESUREE)) return;
    window.localStorage.setItem(CLE_INSTALLATION_MESUREE, new Date().toISOString());
  } catch {
    return;
  }
  track('pwa_premiere_ouverture_autonome', { plateforme });
}

export function InstallAppCard({ permanent = false }: { permanent?: boolean }) {
  const [installee, setInstallee] = useState(false);
  const [plateforme, setPlateforme] = useState<Plateforme>('autre');
  const [invite, setInvite] = useState<BeforeInstallPromptEvent | null>(null);
  const [guideOuvert, setGuideOuvert] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const plateformeDetectee = detecterPlateforme();
    const dejaInstallee = estInstallee();
    setInstallee(dejaInstallee);
    setPlateforme(plateformeDetectee);

    if (dejaInstallee) {
      mesurerPremiereOuvertureAutonome(plateformeDetectee);
    }

    const media = window.matchMedia('(display-mode: standalone)');
    const verifierInstallation = () => {
      const autonome = estInstallee();
      setInstallee(autonome);
      if (autonome) mesurerPremiereOuvertureAutonome(plateformeDetectee);
    };
    const capterInvitation = (event: Event) => {
      event.preventDefault();
      setInvite(event as BeforeInstallPromptEvent);
      track('pwa_invite_disponible', { plateforme: plateformeDetectee });
    };
    const confirmerInstallation = () => {
      setInstallee(true);
      setInvite(null);
      setMessage('Application installée.');
      track('pwa_installee', { plateforme: plateformeDetectee });
    };

    media.addEventListener?.('change', verifierInstallation);
    window.addEventListener('beforeinstallprompt', capterInvitation);
    window.addEventListener('appinstalled', confirmerInstallation);

    return () => {
      media.removeEventListener?.('change', verifierInstallation);
      window.removeEventListener('beforeinstallprompt', capterInvitation);
      window.removeEventListener('appinstalled', confirmerInstallation);
    };
  }, []);

  async function installerAndroid() {
    if (!invite) {
      setGuideOuvert(true);
      track('pwa_guide_ouvert', { plateforme });
      return;
    }

    await invite.prompt();
    const choix = await invite.userChoice;
    setInvite(null);

    if (choix.outcome === 'accepted') {
      setMessage('Installation lancée.');
      track('pwa_invite_acceptee', { plateforme });
    } else {
      setMessage('Installation annulée. Vous pourrez recommencer plus tard.');
      track('pwa_invite_refusee', { plateforme });
    }
  }

  function basculerGuide() {
    const ouvrir = !guideOuvert;
    setGuideOuvert(ouvrir);
    if (ouvrir) track('pwa_guide_ouvert', { plateforme });
  }

  if (installee && !permanent) return null;

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-[#CFE0F4] bg-[#F2F7FD]"
      aria-labelledby={permanent ? 'titre-installation-parametres' : 'titre-installation-accueil'}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[22px] shadow-sm"
          >
            📲
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-soft">
              Accès rapide
            </p>
            <h2
              id={permanent ? 'titre-installation-parametres' : 'titre-installation-accueil'}
              className="mt-1 font-display text-[17px] font-semibold tracking-tight text-navy-text"
            >
              {installee ? 'Coparentalité Zen est installée' : 'Installer Coparentalité Zen'}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-soft">
              {installee
                ? 'L’application est disponible depuis votre écran d’accueil.'
                : 'Ouvrez plus vite votre planning et profitez des rappels comme avec une application classique.'}
            </p>
          </div>
        </div>

        {!installee && (
          <div className="mt-4">
            {plateforme === 'android' && (
              <button type="button" className="btn btn-primary w-full" onClick={installerAndroid}>
                Installer l’application
              </button>
            )}

            {plateforme === 'ios' && (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={basculerGuide}
                aria-expanded={guideOuvert}
              >
                Voir comment installer sur iPhone
              </button>
            )}

            {plateforme === 'autre' && (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={basculerGuide}
                aria-expanded={guideOuvert}
              >
                Voir les instructions d’installation
              </button>
            )}
          </div>
        )}

        {message && (
          <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-navy-text">
            {message}
          </p>
        )}

        {guideOuvert && !installee && (
          <div className="mt-3 rounded-2xl bg-white p-3 text-[13px] leading-relaxed text-soft">
            {plateforme === 'ios' ? (
              <ol className="space-y-2">
                <li><strong>1.</strong> Ouvrez cette page dans <strong>Safari</strong>.</li>
                <li><strong>2.</strong> Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).</li>
                <li><strong>3.</strong> Choisissez <strong>Sur l’écran d’accueil</strong>.</li>
                <li><strong>4.</strong> Touchez <strong>Ajouter</strong>.</li>
              </ol>
            ) : plateforme === 'android' ? (
              <ol className="space-y-2">
                <li><strong>1.</strong> Ouvrez le menu de Chrome avec les <strong>trois points</strong>.</li>
                <li><strong>2.</strong> Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</li>
                <li><strong>3.</strong> Confirmez avec <strong>Installer</strong>.</li>
              </ol>
            ) : (
              <p>
                Ouvrez le menu de votre navigateur, puis choisissez <strong>Installer l’application</strong>
                ou <strong>Ajouter à l’écran d’accueil</strong>. Chrome ou Safari sont recommandés.
              </p>
            )}
          </div>
        )}

        {!installee && (
          <p className="mt-3 text-center text-[10px] leading-relaxed text-soft/85">
            Aucun téléchargement depuis l’App Store ou le Play Store n’est nécessaire.
          </p>
        )}
      </div>
    </section>
  );
}
