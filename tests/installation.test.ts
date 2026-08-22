import { describe, it, expect, afterEach } from 'vitest';
import {
  estInstallee, detecterPlateforme, etapesInstallation, beneficesInstallation,
} from '../src/lib/installation';
import { poserPastille } from '../src/lib/pastille';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const IPAD_MODERNE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120';

describe('estInstallee', () => {
  it('reconnaît une application lancée depuis l’écran d’accueil', () => {
    expect(estInstallee((r) => r.includes('standalone'), undefined)).toBe(true);
  });

  it('reconnaît la propriété historique de Safari sur iOS', () => {
    // Safari n'a longtemps pas géré display-mode : sans ce second signal,
    // l'encart resterait affiché après installation sur iPhone.
    expect(estInstallee(() => false, true)).toBe(true);
  });

  it('reconnaît les modes plein écran et minimal', () => {
    expect(estInstallee((r) => r.includes('fullscreen'), undefined)).toBe(true);
    expect(estInstallee((r) => r.includes('minimal-ui'), undefined)).toBe(true);
  });

  it('ne se déclenche pas dans un navigateur ordinaire', () => {
    expect(estInstallee(() => false, undefined)).toBe(false);
    expect(estInstallee(() => false, false)).toBe(false);
  });
});

describe('detecterPlateforme', () => {
  it('reconnaît un iPhone', () => {
    expect(detecterPlateforme(IPHONE)).toBe('ios');
  });

  it('reconnaît un iPad moderne, qui se présente comme un Mac', () => {
    // Depuis iPadOS 13, seul le tactile distingue un iPad d'un Mac
    expect(detecterPlateforme(IPAD_MODERNE, true)).toBe('ios');
    expect(detecterPlateforme(IPAD_MODERNE, false)).toBe('bureau');
  });

  it('reconnaît un appareil Android', () => {
    expect(detecterPlateforme(ANDROID)).toBe('android');
  });

  it('reconnaît un ordinateur', () => {
    expect(detecterPlateforme(MAC)).toBe('bureau');
    expect(detecterPlateforme('Mozilla/5.0 (Windows NT 10.0)')).toBe('bureau');
  });

  it('ne se trompe pas sur un agent inconnu', () => {
    expect(detecterPlateforme('')).toBe('inconnue');
  });
});

describe('etapesInstallation', () => {
  it('donne une marche à suivre pour chaque plateforme', () => {
    for (const p of ['ios', 'android', 'bureau', 'inconnue'] as const) {
      const e = etapesInstallation(p);
      expect(e.length, p).toBeGreaterThanOrEqual(2);
      expect(e[0].numero).toBe(1);
    }
  });

  it('emploie les intitulés que le parent lit à l’écran', () => {
    // Une paraphrase obligerait à chercher : on reprend les mots du système
    const ios = etapesInstallation('ios').map((e) => e.texte).join(' ');
    expect(ios).toContain('Partager');
    expect(ios).toContain('écran d’accueil');

    const android = etapesInstallation('android').map((e) => e.texte).join(' ');
    expect(android).toContain('Installer');
  });

  it('numérote les étapes sans trou', () => {
    for (const p of ['ios', 'android', 'bureau'] as const) {
      const numeros = etapesInstallation(p).map((e) => e.numero);
      expect(numeros).toEqual(numeros.map((_, i) => i + 1));
    }
  });
});

describe('beneficesInstallation', () => {
  it('signale sur iPhone que les alertes en dépendent', () => {
    // Ce n'est pas un argument commercial : sans installation, iOS refuse
    // purement et simplement les notifications.
    const b = beneficesInstallation('ios').join(' ');
    expect(b).toContain('indispensable');
  });

  it('reste factuel sur les autres plateformes', () => {
    const b = beneficesInstallation('android').join(' ');
    expect(b).not.toContain('indispensable');
    expect(b.length).toBeGreaterThan(50);
  });
});

describe('pastille de l’icône', () => {
  /** Un navigateur qui expose l'API, et un qui l'ignore. */
  function faux(avecApi: boolean) {
    const appels: (number | 'efface')[] = [];
    const nav = avecApi
      ? {
        setAppBadge: (n?: number) => { appels.push(n ?? 0); return Promise.resolve(); },
        clearAppBadge: () => { appels.push('efface'); return Promise.resolve(); },
      }
      : {};
    return { appels, nav };
  }

  const original = globalThis.navigator;
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: original, configurable: true,
    });
  });

  function installer(nav: object) {
    Object.defineProperty(globalThis, 'navigator', {
      value: nav, configurable: true,
    });
  }

  it('affiche le nombre de non-lues', () => {
    const { appels, nav } = faux(true);
    installer(nav);
    poserPastille(3);
    expect(appels).toEqual([3]);
  });

  it('efface plutôt que d’afficher zéro', () => {
    const { appels, nav } = faux(true);
    installer(nav);
    poserPastille(0);
    expect(appels).toEqual(['efface']);
  });

  it('ne rompt pas sur un navigateur sans l’API', () => {
    const { nav } = faux(false);
    installer(nav);
    expect(() => poserPastille(2)).not.toThrow();
  });
});
