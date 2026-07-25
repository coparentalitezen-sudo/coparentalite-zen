'use client';

import { useEffect, useState } from 'react';

/**
 * Enregistre le service worker et propose la mise à jour quand une nouvelle
 * version est déployée. Aucune logique métier : pur cycle de vie applicatif.
 *
 * La mise à jour n'est jamais imposée : couper une saisie de dépense en cours
 * serait pire que de servir la version précédente quelques minutes de plus.
 */
export function ServiceWorker() {
  const [enAttente, setEnAttente] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let annule = false;

    const enregistrer = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // Une version est déjà prête à prendre la main
        if (reg.waiting) setEnAttente(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener('statechange', () => {
            // « installed » avec un contrôleur actif = mise à jour disponible
            if (nouveau.state === 'installed' && navigator.serviceWorker.controller && !annule) {
              setEnAttente(nouveau);
            }
          });
        });

        // Recherche d'une mise à jour au retour dans l'application
        const auRetour = () => { if (document.visibilityState === 'visible') reg.update(); };
        document.addEventListener('visibilitychange', auRetour);
        return () => document.removeEventListener('visibilitychange', auRetour);
      } catch {
        // L'absence de service worker ne doit jamais empêcher l'usage
      }
    };

    enregistrer();

    // Le nouveau worker a pris la main : on recharge une seule fois
    let recharge = false;
    const onControllerChange = () => {
      if (recharge) return;
      recharge = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      annule = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!enAttente) return null;

  return (
    <div role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[0_8px_24px_rgb(16_27_44_/.3)]"
      style={{ marginLeft: '1rem', marginRight: '1rem' }}>
      <p className="min-w-0 flex-1 text-sm font-bold">Une nouvelle version est disponible.</p>
      <button
        type="button"
        className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-ink"
        onClick={() => enAttente.postMessage('SKIP_WAITING')}
      >
        Actualiser
      </button>
    </div>
  );
}
