'use client';

/**
 * Cloche des notifications, avec sa pastille de non-lues.
 *
 * Le décompte est actualisé :
 * - au chargement ;
 * - après chaque action « lu » dans l'application ;
 * - au retour sur l'onglet ;
 * - toutes les deux minutes comme filet de sécurité.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { compterNonLues } from '@/lib/actions';
import { useContexte } from '@/lib/use-contexte';
import {
  NOTIFICATIONS_CHANGE_EVENT,
  type NotificationsChangeDetail,
} from '@/lib/notifications-events';
import { synchroniserBadgeApplication } from '@/lib/app-badge';
import { Icone } from './icons';

export function Cloche() {
  const { ctx } = useContexte();
  const [nonLues, setNonLues] = useState(0);

  const householdId = ctx.etat === 'pret' ? ctx.contexte.foyer.id : null;

  const rafraichir = useCallback(async () => {
    if (!householdId) {
      setNonLues(0);
      void synchroniserBadgeApplication(0);
      return;
    }
    const r = await compterNonLues(householdId);
    if (r.status === 'ok') {
      setNonLues(r.data);
      void synchroniserBadgeApplication(r.data);
    }
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;

    void rafraichir();

    const surChangement = (event: Event) => {
      const detail = (event as CustomEvent<NotificationsChangeDetail>).detail;
      if (typeof detail?.unreadCount === 'number') {
        const total = Math.max(0, detail.unreadCount);
        setNonLues(total);
        void synchroniserBadgeApplication(total);
      } else {
        void rafraichir();
      }
    };

    const surVisibilite = () => {
      if (document.visibilityState === 'visible') void rafraichir();
    };

    window.addEventListener(NOTIFICATIONS_CHANGE_EVENT, surChangement);
    window.addEventListener('focus', rafraichir);
    document.addEventListener('visibilitychange', surVisibilite);

    const minuterie = window.setInterval(() => void rafraichir(), 120_000);

    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGE_EVENT, surChangement);
      window.removeEventListener('focus', rafraichir);
      document.removeEventListener('visibilitychange', surVisibilite);
      window.clearInterval(minuterie);
    };
  }, [householdId, rafraichir]);

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
