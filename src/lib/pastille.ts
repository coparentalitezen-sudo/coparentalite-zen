/**
 * Pastille de l'icône d'accueil.
 *
 * Le chiffre rouge posé sur l'icône, comme celui de Messages ou de Mail. Il
 * relève de l'API Badging, distincte des notifications : une notification
 * s'affiche puis disparaît, la pastille demeure jusqu'à ce que le parent ait
 * lu. C'est elle qui fait revenir dans l'application sans qu'on l'y invite.
 *
 * Conditions de fonctionnement sur iPhone : l'application doit être installée
 * sur l'écran d'accueil, et l'autorisation de notifier accordée. Ouverte dans
 * Safari, l'appel n'échoue pas, il n'a simplement aucun effet — il n'y a pas
 * d'icône à décorer.
 *
 * Chaque appel est gardé deux fois : par l'existence du nom, et par une
 * capture d'erreur. Les implémentations diffèrent, certaines refusent quand la
 * permission manque, et une pastille absente ne justifie jamais d'interrompre
 * l'écran qui la demandait.
 */

interface NavigateurAPastille {
  setAppBadge?: (nombre?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Pose ou retire la pastille selon le décompte.
 *
 * Zéro efface plutôt que d'afficher « 0 » : un badge à zéro attire l'œil pour
 * rien, et certaines plateformes le rendent comme une pastille vide.
 */
export function poserPastille(nonLues: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & NavigateurAPastille;
  try {
    if (nonLues > 0) {
      void nav.setAppBadge?.(nonLues)?.catch(() => {});
    } else {
      void nav.clearAppBadge?.()?.catch(() => {});
    }
  } catch {
    /* API absente ou refusée : sans conséquence sur le reste de l'écran */
  }
}
