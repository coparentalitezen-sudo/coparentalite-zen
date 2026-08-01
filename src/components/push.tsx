'use client';

/**
 * Activation des notifications poussées.
 *
 * Sur iPhone, le Push exige iOS 16.4 et que l'application soit installée sur
 * l'écran d'accueil. Depuis Safari, la permission ne peut même pas être
 * demandée : mieux vaut expliquer la marche à suivre que de laisser un bouton
 * échouer sans motif.
 */
import { useCallback, useEffect, useState } from 'react';

type Etat =
  | 'verification'
  | 'indisponible'        // navigateur sans Push
  | 'installer'           // iOS hors écran d'accueil
  | 'refuse'              // permission refusée par l'utilisateur
  | 'inactif'
  | 'actif';

/** L'application tourne-t-elle depuis l'écran d'accueil ? */
function installee(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true;
}

function surIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** Clé VAPID base64url vers le format binaire attendu par l'API. */
function versOctets(base64url: string): Uint8Array {
  const complement = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + complement).replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(base64);
  return Uint8Array.from([...brut].map((c) => c.charCodeAt(0)));
}

export function ReglagePush({ clePublique }: { clePublique: string | null }) {
  const [etat, setEtat] = useState<Etat>('verification');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const verifier = useCallback(async () => {
    if (!clePublique) { setEtat('indisponible'); return; }
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // Sur iPhone, c'est presque toujours l'absence d'installation
      setEtat(surIOS() && !installee() ? 'installer' : 'indisponible');
      return;
    }
    if (surIOS() && !installee()) { setEtat('installer'); return; }
    if (Notification.permission === 'denied') { setEtat('refuse'); return; }

    const inscription = await navigator.serviceWorker.ready;
    const abonnement = await inscription.pushManager.getSubscription();
    setEtat(abonnement ? 'actif' : 'inactif');
  }, [clePublique]);

  useEffect(() => { verifier(); }, [verifier]);

  async function activer() {
    if (!clePublique || busy) return;
    setBusy(true); setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? 'refuse' : 'inactif');
        setBusy(false);
        return;
      }
      const inscription = await navigator.serviceWorker.ready;
      const abonnement = await inscription.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: versOctets(clePublique),
      });
      const brut = abonnement.toJSON() as { keys?: { p256dh?: string; auth?: string } };

      const reponse = await fetch('/api/push/abonner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'abonner',
          endpoint: abonnement.endpoint,
          p256dh: brut.keys?.p256dh,
          auth: brut.keys?.auth,
          agent: navigator.userAgent.slice(0, 200),
        }),
      });
      if (!reponse.ok) {
        const c = await reponse.json() as { message?: string };
        throw new Error(c.message ?? 'enregistrement refusé');
      }
      setEtat('actif');
      setMsg('Cet appareil recevra désormais les alertes, même application fermée.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'L’activation n’a pas abouti.');
    }
    setBusy(false);
  }

  async function desactiver() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const inscription = await navigator.serviceWorker.ready;
      const abonnement = await inscription.pushManager.getSubscription();
      if (abonnement) {
        await fetch('/api/push/abonner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'oublier', endpoint: abonnement.endpoint }),
        });
        await abonnement.unsubscribe();
      }
      setEtat('inactif');
      setMsg('Cet appareil ne recevra plus d’alertes.');
    } catch {
      setMsg('La désactivation n’a pas abouti.');
    }
    setBusy(false);
  }

  if (etat === 'verification') return null;

  return (
    <section className="card px-4 py-4">
      <h2 className="font-bold">Alertes sur cet appareil</h2>

      {etat === 'installer' && (
        <>
          <p className="mt-1 text-[13px] leading-snug text-soft">
            Sur iPhone, les alertes ne fonctionnent que si l’application est
            installée sur l’écran d’accueil.
          </p>
          <ol className="mt-2 space-y-1 text-[13px] leading-snug text-soft">
            <li>1. Touchez le bouton Partager, en bas de Safari</li>
            <li>2. Choisissez « Sur l’écran d’accueil »</li>
            <li>3. Rouvrez l’application depuis l’icône ajoutée</li>
          </ol>
        </>
      )}

      {etat === 'indisponible' && (
        <p className="mt-1 text-[13px] leading-snug text-soft">
          Ce navigateur ne prend pas en charge les alertes. Elles restent
          consultables dans l’application.
        </p>
      )}

      {etat === 'refuse' && (
        <p className="mt-1 text-[13px] leading-snug text-soft">
          Vous avez refusé les alertes pour ce site. Pour les rétablir, ouvrez
          les réglages de votre navigateur et autorisez les notifications.
        </p>
      )}

      {etat === 'inactif' && (
        <>
          <p className="mt-1 text-[13px] leading-snug text-soft">
            Recevez les changements de garde et les rappels directement sur cet
            appareil, même application fermée.
          </p>
          <button className="btn btn-primary mt-3 w-full" disabled={busy} onClick={activer}>
            {busy ? 'Activation…' : 'Activer les alertes'}
          </button>
        </>
      )}

      {etat === 'actif' && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-ok">
            Alertes actives sur cet appareil
          </p>
          <p className="mt-1 text-[13px] leading-snug text-soft">
            Le détail de ce que vous recevez se règle ci-dessous, type par type.
          </p>
          <button className="btn btn-ghost mt-3 w-full" disabled={busy} onClick={desactiver}>
            {busy ? '…' : 'Désactiver sur cet appareil'}
          </button>
        </>
      )}

      {msg && (
        <p role="status" className="mt-2 rounded-xl bg-muted px-3 py-2 text-[13px] leading-snug text-soft">
          {msg}
        </p>
      )}
    </section>
  );
}
