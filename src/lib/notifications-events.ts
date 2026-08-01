'use client';

/**
 * Événement local partagé entre la page Notifications et la cloche.
 * Il évite d'attendre le rafraîchissement périodique après une action.
 */
import { synchroniserBadgeApplication } from './app-badge';

export const NOTIFICATIONS_CHANGE_EVENT = 'coparentalite:notifications-change';

export interface NotificationsChangeDetail {
  unreadCount?: number;
}

export function signalerChangementNotifications(unreadCount?: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NotificationsChangeDetail>(
    NOTIFICATIONS_CHANGE_EVENT,
    { detail: { unreadCount } },
  ));

  if (typeof unreadCount === 'number') {
    void synchroniserBadgeApplication(unreadCount);
  }
}
