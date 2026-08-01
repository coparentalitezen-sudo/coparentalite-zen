import { describe, it, expect } from 'vitest';
import {
  normaliserTelephone, formaterTelephone, messageInvitation,
  lienSMS, lienCourriel,
} from '../src/lib/partage-invitation';

describe('normaliserTelephone', () => {
  it('accepte un numéro français saisi de plusieurs façons', () => {
    // Un parent tape son numéro comme il l'a en tête, pas dans un format
    for (const saisie of ['0612345678', '06 12 34 56 78', '06.12.34.56.78',
                          '06-12-34-56-78', '+33612345678', '+33 6 12 34 56 78',
                          '33612345678']) {
      expect(normaliserTelephone(saisie), saisie).toBe('+33612345678');
    }
  });

  it('accepte un numéro étranger déjà au format international', () => {
    expect(normaliserTelephone('+32475123456')).toBe('+32475123456');
    expect(normaliserTelephone('+41791234567')).toBe('+41791234567');
  });

  it('refuse ce qui n’est pas un numéro', () => {
    for (const saisie of ['', '   ', 'abc', '12', '06123456789012345',
                          '0612345', 'télé']) {
      expect(normaliserTelephone(saisie), saisie).toBeNull();
    }
  });

  it('refuse un numéro français incomplet', () => {
    expect(normaliserTelephone('061234567')).toBeNull();
    expect(normaliserTelephone('06123456789')).toBeNull();
  });
});

describe('formaterTelephone', () => {
  it('présente un numéro français par paires', () => {
    expect(formaterTelephone('+33612345678')).toBe('06 12 34 56 78');
  });
  it('laisse un numéro étranger tel quel', () => {
    expect(formaterTelephone('+32475123456')).toBe('+32475123456');
  });
  it('ne dénature pas une saisie invalide', () => {
    expect(formaterTelephone('inconnu')).toBe('inconnu');
  });
});

describe('messageInvitation', () => {
  const lien = 'https://exemple.fr/invitation/abc';

  it('nomme l’expéditeur et porte le lien', () => {
    const m = messageInvitation('Sekouba', lien);
    expect(m).toContain('Sekouba');
    expect(m).toContain(lien);
  });

  it('reste assez court pour un SMS', () => {
    // Au-delà de 160 caractères, un SMS est découpé et facturé double
    const m = messageInvitation('Sekouba', lien);
    expect(m.length).toBeLessThan(200);
  });

  it('se passe d’un prénom vide sans laisser de trou', () => {
    const m = messageInvitation('   ', lien);
    expect(m).toMatch(/^Votre coparent/);
    expect(m).not.toContain('  ');
  });
});

describe('lienSMS', () => {
  it('inclut le numéro quand il est fourni', () => {
    const l = lienSMS('06 12 34 56 78', 'Bonjour');
    expect(l).toContain('sms:+33612345678');
    expect(l).toContain('body=Bonjour');
  });

  it('ouvre la messagerie sans destinataire si le numéro manque', () => {
    expect(lienSMS(null, 'Bonjour')).toBe('sms:?&body=Bonjour');
  });

  it('ignore un numéro invalide plutôt que de produire un lien cassé', () => {
    const l = lienSMS('abc', 'Bonjour');
    expect(l).toBe('sms:?&body=Bonjour');
  });

  it('encode le message, y compris les caractères délicats', () => {
    const l = lienSMS('0612345678', 'Voici : https://a.fr/b?c=d&e=f');
    expect(l).not.toContain(' ');
    expect(l).toContain('%3A');   // deux-points encodé
    expect(l).toContain('%26');   // esperluette encodée
  });
});

describe('lienCourriel', () => {
  it('porte destinataire, sujet et message', () => {
    const l = lienCourriel('a@b.fr', 'Bonjour');
    expect(l).toContain('mailto:a@b.fr');
    expect(l).toContain('subject=');
    expect(l).toContain('body=Bonjour');
  });
});
