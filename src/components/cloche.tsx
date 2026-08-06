'use client';

/**
 * Cloche des notifications, avec sa pastille de non-lues.
 *
 * Le décompte se rafraîchit à l'ouverture et toutes les deux minutes : plus
 * souvent solliciterait la base sans bénéfice, moins souvent laisserait passer
 * un changement de garde imminent.
 */
import { useCallback, useEffect, useState } from 'react';

/**
 * Acheminement opportuniste des notifications poussées.
 *
 * Le plan d'hébergement ne concède qu'un passage planifié par jour : une
 * notification programmée à neuf heures du matin n'atteignait le téléphone que
 * le lendemain à trois heures. Chaque ouverture de l'application déclenche
 * donc l'acheminement des messages en attente — les siens comme ceux de
 * l'autre parent, chaque appareil ne recevant jamais que ce qui lui est
 * destiné.
 *
 * L'appel est espacé de dix minutes et silencieux : un échec ne doit ni
 * ralentir l'écran, ni s'y afficher.
 */
let dernierAcheminement = 0;
function acheminerPush() {
  if (typeof window === 'undefined') return;
  // `Notification?.permission` ne protège de rien : l'opérateur ne couvre
  // qu'une valeur nulle, pas un nom absent. Sur un iPhone dont le navigateur
  // ne connaît pas les notifications, lire ce nom lève une erreur et emporte
  // toute l'application. Seul `typeof` interroge un nom sans le déclarer.
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  const maintenant = Date.now();
  if (maintenant - dernierAcheminement < 600_000) return;
  dernierAcheminement = maintenant;
  void fetch('/api/push/envoyer').catch(() => {});
}
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { compterNonLues } from '@/lib/actions';
import { useContexte } from '@/lib/use-contexte';
import { Icone } from './icons';

/**
 * Signale que des notifications viennent d'être lues.
 *
 * Sans ce signal, la cloche garde sa pastille jusqu'au prochain rafraîchissement
 * automatique — jusqu'à deux minutes après que le parent a tout lu.
 */
export const EVENEMENT_LECTURE = 'coparentalite:notifications-lues';

export function signalerLecture() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENEMENT_LECTURE));
  }
}

export function Cloche() {
  const { ctx } = useContexte();
  const chemin = usePathname();
  const [nonLues, setNonLues] = useState(0);

  const hid = ctx.etat === 'pret' ? ctx.contexte.foyer.id : null;

  const rafraichir = useCallback(() => {
    if (!hid) return;
    compterNonLues(hid).then((r) => {
      if (r.status === 'ok') setNonLues(r.data);
    });
  }, [hid]);

  useEffect(() => {
    if (!hid) return;
    rafraichir();
    acheminerPush();

    // Trois occasions de se mettre à jour, en plus du rythme régulier :
    // une lecture signalée, un changement d'écran, un retour dans l'onglet.
    const surRetour = () => {
      if (!document.hidden) { rafraichir(); acheminerPush(); }
    };
    window.addEventListener(EVENEMENT_LECTURE, rafraichir);
    document.addEventListener('visibilitychange', surRetour);
    const minuterie = setInterval(rafraichir, 120_000);

    return () => {
      window.removeEventListener(EVENEMENT_LECTURE, rafraichir);
      document.removeEventListener('visibilitychange', surRetour);
      clearInterval(minuterie);
    };
  }, [hid, rafraichir]);

  // Quitter l'écran des notifications remet forcément le décompte à jour
  useEffect(() => { rafraichir(); }, [chemin, rafraichir]);

  const libelle = nonLues > 0
    ? `Notifications, ${nonLues} non lue${nonLues > 1 ? 's' : ''}`
    : 'Notifications';

  return (
    <Link href="/app/notifications" aria-label={libelle}
      className="relative grid h-11 w-11 place-items-center rounded-full text-ink">
      <Icone nom="cloche" taille={23} />
      {nonLues > 0 && (
        <span aria-hidden
          className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#B3423A] px-1 text-[10px] font-black text-white">
          {nonLues > 9 ? '9+' : nonLues}
        </span>
      )}
    </Link>
  );
}
