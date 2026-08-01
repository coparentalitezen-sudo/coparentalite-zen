'use client';

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export type BadgePermissionState = 'unsupported' | 'granted' | 'denied' | 'prompt';

function navigateurBadge(): BadgeNavigator | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as BadgeNavigator;
}

export function badgeApplicationDisponible(): boolean {
  const nav = navigateurBadge();
  return Boolean(nav && typeof nav.setAppBadge === 'function');
}

export function applicationInstallee(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return standaloneMedia || iosStandalone;
}

export function permissionBadge(): BadgePermissionState {
  if (!badgeApplicationDisponible()) return 'unsupported';
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

export async function synchroniserBadgeApplication(nonLues: number): Promise<boolean> {
  const nav = navigateurBadge();
  if (!nav || typeof nav.setAppBadge !== 'function') return false;

  try {
    const total = Math.max(0, Math.trunc(nonLues));
    if (total === 0) {
      if (typeof nav.clearAppBadge === 'function') await nav.clearAppBadge();
      else await nav.setAppBadge(0);
    } else {
      await nav.setAppBadge(total);
    }
    return true;
  } catch {
    return false;
  }
}

export async function demanderPermissionBadge(): Promise<BadgePermissionState> {
  if (!badgeApplicationDisponible() || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const resultat = await Notification.requestPermission();
    return resultat === 'granted'
      ? 'granted'
      : resultat === 'denied'
        ? 'denied'
        : 'prompt';
  } catch {
    return permissionBadge();
  }
}
