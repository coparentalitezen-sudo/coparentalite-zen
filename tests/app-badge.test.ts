import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  badgeApplicationDisponible,
  synchroniserBadgeApplication,
} from '../src/lib/app-badge';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'navigator');
});

describe('pastille de l’application', () => {
  it('déclare la fonction indisponible sans Badging API', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    expect(badgeApplicationDisponible()).toBe(false);
  });

  it('affiche le nombre de notifications non lues', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { setAppBadge },
    });

    await expect(synchroniserBadgeApplication(4)).resolves.toBe(true);
    expect(setAppBadge).toHaveBeenCalledWith(4);
  });

  it('efface la pastille quand le compteur revient à zéro', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { setAppBadge, clearAppBadge },
    });

    await expect(synchroniserBadgeApplication(0)).resolves.toBe(true);
    expect(clearAppBadge).toHaveBeenCalledOnce();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('ne bloque jamais l’application si le système refuse la pastille', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { setAppBadge: vi.fn().mockRejectedValue(new Error('not allowed')) },
    });

    await expect(synchroniserBadgeApplication(2)).resolves.toBe(false);
  });
});
