import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signerVisuel, verifierVisuel, urlVisuelPublic } from '../src/lib/marketing/signature';

describe('signature des visuels', () => {
  beforeEach(() => { process.env.CRON_SECRET = 'secret-de-test'; });
  afterEach(() => { delete process.env.CRON_SECRET; });

  it('produit une empreinte de 128 bits', () => {
    expect(signerVisuel('2026s34-carrousel-2', 0)).toHaveLength(32);
  });

  it('accepte sa propre signature', () => {
    expect(verifierVisuel('2026s34-carrousel-2', 0,
      signerVisuel('2026s34-carrousel-2', 0))).toBe(true);
  });

  it('refuse la signature d’une autre planche du même contenu', () => {
    expect(verifierVisuel('2026s34-carrousel-2', 1,
      signerVisuel('2026s34-carrousel-2', 0))).toBe(false);
  });

  it('refuse la signature d’un autre contenu', () => {
    expect(verifierVisuel('2026s34-carrousel-3', 0,
      signerVisuel('2026s34-carrousel-2', 0))).toBe(false);
  });

  it('refuse une signature absente, vide ou tronquée', () => {
    const bonne = signerVisuel('2026s34-reel-1', 0)!;
    expect(verifierVisuel('2026s34-reel-1', 0, null)).toBe(false);
    expect(verifierVisuel('2026s34-reel-1', 0, '')).toBe(false);
    expect(verifierVisuel('2026s34-reel-1', 0, bonne.slice(0, 31))).toBe(false);
  });

  it('change entièrement si le secret change', () => {
    const avant = signerVisuel('2026s34-reel-1', 0);
    process.env.CRON_SECRET = 'un-autre-secret';
    expect(signerVisuel('2026s34-reel-1', 0)).not.toBe(avant);
  });

  it('ne signe rien sans secret, plutôt que de signer avec une valeur vide', () => {
    delete process.env.CRON_SECRET;
    expect(signerVisuel('2026s34-reel-1', 0)).toBeNull();
    expect(verifierVisuel('2026s34-reel-1', 0, 'x'.repeat(32))).toBe(false);
    expect(urlVisuelPublic('https://coparentalitezen.fr', '2026s34-reel-1', 0)).toBeNull();
  });

  it('construit une adresse complète et signée', () => {
    const url = new URL(urlVisuelPublic('https://coparentalitezen.fr', '2026s34-reel-1', 0)!);
    expect(url.pathname).toBe('/api/marketing/visuel-public');
    expect(url.searchParams.get('ref')).toBe('2026s34-reel-1');
    expect(verifierVisuel('2026s34-reel-1', 0, url.searchParams.get('jeton'))).toBe(true);
  });

  it('ne laisse jamais fuir le secret dans l’adresse', () => {
    process.env.CRON_SECRET = 'valeur-tres-reconnaissable';
    expect(urlVisuelPublic('https://coparentalitezen.fr', '2026s34-reel-1', 0))
      .not.toContain('valeur-tres-reconnaissable');
  });
});
