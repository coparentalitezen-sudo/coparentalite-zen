import { describe, it, expect } from 'vitest';
import { gabaritNotification, configEmail } from '../src/lib/email';

describe('gabarit des notifications par courriel', () => {
  it('porte le prénom, le titre et le corps', () => {
    const { html, texte } = gabaritNotification(
      'Camille', 'Changement de garde demain', 'Les enfants passent chez Sekouba.', null,
    );
    expect(html).toContain('Camille');
    expect(html).toContain('Changement de garde demain');
    expect(texte).toContain('Les enfants passent chez Sekouba.');
  });

  it('n’ajoute un bouton que s’il mène quelque part', () => {
    const sans = gabaritNotification('Camille', 'Titre', null, null);
    expect(sans.html).not.toContain('Ouvrir l’application');
    const avec = gabaritNotification('Camille', 'Titre', null, 'https://exemple.fr/app/planning');
    expect(avec.html).toContain('https://exemple.fr/app/planning');
    expect(avec.texte).toContain('https://exemple.fr/app/planning');
  });

  it('neutralise le balisage venu des données', () => {
    // Un prénom d'enfant ou un libellé de dépense ne doit jamais pouvoir
    // injecter du code dans le message : ce sont des saisies libres.
    const { html } = gabaritNotification(
      '<script>alert(1)</script>', 'Dépense « <b>école</b> »', null, null,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>école</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rappelle comment ne plus recevoir ces messages', () => {
    const { html, texte } = gabaritNotification('Camille', 'Titre', null, null);
    expect(html).toContain('Notifications');
    expect(texte).toContain('Notifications');
  });

  it('reste silencieux sans clé configurée', () => {
    delete process.env.RESEND_API_KEY;
    expect(configEmail()).toBeNull();
  });
});
