import { describe, it, expect } from 'vitest';
import { origineReferent } from '@/lib/marketing/utm';

const H = 'www.coparentalitezen.fr';
describe('origine déduite du site de provenance', () => {
  it('reconnaît moteurs, réseaux, e-mail et assistants', () => {
    expect(origineReferent('https://www.google.fr/', '/vacances-scolaires-parents-separes', H))
      .toEqual({ source: 'google', campagne: 'referent', contenu: 'vacances-scolaires-parents-separes' });
    expect(origineReferent('https://m.youtube.com/', '/', H)?.source).toBe('youtube');
    expect(origineReferent('https://l.instagram.com/', '/quiz', H)).toMatchObject({ source: 'instagram', contenu: 'quiz' });
    expect(origineReferent('https://lm.facebook.com/', '/', H)).toMatchObject({ source: 'facebook', contenu: 'accueil' });
    expect(origineReferent('https://fr.pinterest.com/', '/conseils/2026s45-reel-4', H)).toMatchObject({ source: 'pinterest', contenu: 'conseils.2026s45-reel-4' });
    expect(origineReferent('https://mail.google.com/', '/invitation/abc', H)?.source).toBe('email');
    expect(origineReferent('https://gemini.google.com/', '/', H)?.source).toBe('assistant-ia');
    expect(origineReferent('https://chatgpt.com/', '/', H)?.source).toBe('assistant-ia');
    expect(origineReferent('https://forum.exemple.org/fil', '/', H)?.source).toBe('autre-site');
  });
  it('ignore visite directe, navigation interne, paiement et adresses invalides', () => {
    expect(origineReferent('', '/', H)).toBeNull();
    expect(origineReferent('https://coparentalitezen.fr/aide', '/', H)).toBeNull();
    expect(origineReferent('https://www.coparentalitezen.fr/aide', '/', H)).toBeNull();
    expect(origineReferent('https://checkout.stripe.com/c/pay', '/app/offre', H)).toBeNull();
    expect(origineReferent('pas une adresse', '/', H)).toBeNull();
  });
  it('ne garde que des caractères sûrs', () => {
    expect(origineReferent('https://www.google.com/', '/<script>/x', H)?.contenu).toBe('script.x');
  });
});
