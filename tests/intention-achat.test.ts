import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  memoriserIntention, lireIntention, oublierIntention, destinationApresInscription,
} from '../src/lib/intention-achat';

/** sessionStorage minimal, suffisant pour ce que le module en attend. */
function faireStockage(defaillant = false): Storage {
  const donnees = new Map<string, string>();
  return {
    get length() { return donnees.size; },
    clear: () => donnees.clear(),
    key: (i: number) => [...donnees.keys()][i] ?? null,
    getItem: (k: string) => {
      if (defaillant) throw new Error('stockage refusé');
      return donnees.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (defaillant) throw new Error('quota');
      donnees.set(k, v);
    },
    removeItem: (k: string) => { donnees.delete(k); },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('window', { sessionStorage: faireStockage() });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('mémorisation du choix', () => {
  it('retrouve une intention d’abonnement annuel', () => {
    memoriserIntention({ type: 'abonnement', periodicite: 'year' });
    expect(lireIntention()).toMatchObject({ type: 'abonnement', periodicite: 'year' });
  });

  it('retrouve le mode de règlement choisi', () => {
    memoriserIntention({ type: 'abonnement', periodicite: 'year', mode: 'partage' });
    expect(lireIntention()?.mode).toBe('partage');
  });

  it('ne rend rien quand rien n’a été choisi', () => {
    expect(lireIntention()).toBeNull();
  });

  it('oublie sur demande', () => {
    memoriserIntention({ type: 'abonnement' });
    oublierIntention();
    expect(lireIntention()).toBeNull();
  });

  it('ne consomme pas l’intention à la lecture', () => {
    memoriserIntention({ type: 'extension', extensionId: 'ext-6' });
    lireIntention();
    expect(lireIntention()?.extensionId).toBe('ext-6');
  });
});

describe('robustesse', () => {
  it('périme une intention vieille de plus d’un jour', () => {
    const t0 = 1_000_000_000_000;
    memoriserIntention({ type: 'abonnement' }, t0);
    expect(lireIntention(t0 + 25 * 3600 * 1000)).toBeNull();
  });

  it('conserve une intention encore fraîche', () => {
    const t0 = 1_000_000_000_000;
    memoriserIntention({ type: 'abonnement' }, t0);
    expect(lireIntention(t0 + 3600 * 1000)).not.toBeNull();
  });

  it('ignore un contenu illisible plutôt que de planter l’inscription', () => {
    window.sessionStorage.setItem('czen:intention-achat', '{{{');
    expect(lireIntention()).toBeNull();
  });

  it('ignore un type inventé', () => {
    window.sessionStorage.setItem('czen:intention-achat',
      JSON.stringify({ type: 'cadeau', enregistreeLe: Date.now() }));
    expect(lireIntention()).toBeNull();
  });

  it('n’échoue pas quand le stockage est refusé — navigation privée', () => {
    vi.stubGlobal('window', { sessionStorage: faireStockage(true) });
    expect(() => memoriserIntention({ type: 'abonnement' })).not.toThrow();
    expect(lireIntention()).toBeNull();
  });

  it('n’échoue pas côté serveur, où window n’existe pas', () => {
    vi.stubGlobal('window', undefined);
    expect(() => memoriserIntention({ type: 'abonnement' })).not.toThrow();
    expect(lireIntention()).toBeNull();
  });
});

describe('destination après inscription', () => {
  it('renvoie à l’accueil sans intention', () => {
    expect(destinationApresInscription(null)).toBe('/app/accueil');
  });

  it('rouvre la page d’offre avec la formule choisie', () => {
    const url = destinationApresInscription({
      type: 'abonnement', periodicite: 'year', enregistreeLe: Date.now(),
    });
    expect(url).toContain('/app/offre?');
    expect(url).toContain('periodicite=year');
  });

  it('reporte le mode de règlement', () => {
    const url = destinationApresInscription({
      type: 'abonnement', mode: 'partage', enregistreeLe: Date.now(),
    });
    expect(url).toContain('mode=partage');
  });

  it('ne fabrique jamais d’URL de paiement : la session naît côté serveur', () => {
    const url = destinationApresInscription({
      type: 'abonnement', periodicite: 'year', enregistreeLe: Date.now(),
    });
    expect(url).not.toContain('stripe');
    expect(url).not.toContain('checkout');
  });
});
