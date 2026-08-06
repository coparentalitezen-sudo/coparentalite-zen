import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const NOMS = [
  'LEGAL_PUBLISHER_NAME', 'NEXT_PUBLIC_LEGAL_NAME',
  'LEGAL_PUBLISHER_SIREN', 'LEGAL_SIREN', 'NEXT_PUBLIC_LEGAL_SIREN',
  'LEGAL_PUBLISHER_ADDRESS', 'LEGAL_ADDRESS', 'NEXT_PUBLIC_LEGAL_ADDRESS',
  'LEGAL_CONTACT_EMAIL', 'SUPPORT_EMAIL', 'NEXT_PUBLIC_SUPPORT_EMAIL',
  'LEGAL_PUBLISHER_FORM', 'LEGAL_MEDIATOR',
];

/** Le module lit l'environnement à l'import : il faut le recharger. */
async function relire() {
  vi.resetModules();
  return import('../src/lib/legal');
}

describe('identité légale', () => {
  beforeEach(() => { for (const n of NOMS) delete process.env[n]; });
  afterEach(() => { for (const n of NOMS) delete process.env[n]; });

  it('accepte les noms de variables déjà en place', async () => {
    process.env.LEGAL_PUBLISHER_NAME = 'Sekou SAS';
    process.env.LEGAL_PUBLISHER_ADDRESS = '1 rue des Lilas, Paris';
    process.env.LEGAL_CONTACT_EMAIL = 'contact@exemple.fr';
    const { legal } = await relire();
    expect(legal.nom).toBe('Sekou SAS');
    expect(legal.adresse).toBe('1 rue des Lilas, Paris');
    expect(legal.email).toBe('contact@exemple.fr');
  });

  it('accepte aussi les anciens noms préfixés', async () => {
    process.env.NEXT_PUBLIC_LEGAL_NAME = 'Ancienne SARL';
    const { legal } = await relire();
    expect(legal.nom).toBe('Ancienne SARL');
  });

  it('préfère le nom en place quand les deux existent', async () => {
    process.env.LEGAL_PUBLISHER_NAME = 'En place';
    process.env.NEXT_PUBLIC_LEGAL_NAME = 'Ancien';
    const { legal } = await relire();
    expect(legal.nom).toBe('En place');
  });

  it('ignore une variable vide plutôt que d’afficher du blanc', async () => {
    process.env.LEGAL_PUBLISHER_NAME = '   ';
    process.env.NEXT_PUBLIC_LEGAL_NAME = 'Repli';
    const { legal } = await relire();
    expect(legal.nom).toBe('Repli');
  });

  it('ne se déclare complète que si le SIREN et l’adresse y sont', async () => {
    process.env.LEGAL_PUBLISHER_NAME = 'Sekou SAS';
    const sansSiren = await relire();
    expect(sansSiren.identiteComplete()).toBe(false);

    process.env.LEGAL_PUBLISHER_SIREN = '123456789';
    process.env.LEGAL_PUBLISHER_ADDRESS = '1 rue des Lilas';
    const complete = await relire();
    expect(complete.identiteComplete()).toBe(true);
  });
});

describe('valeurs d’attente et saisies fautives', () => {
  beforeEach(() => { for (const n of NOMS) delete process.env[n]; });
  afterEach(() => { for (const n of NOMS) delete process.env[n]; });

  it('écarte une consigne recopiée à la place d’une adresse', async () => {
    // Cas réellement survenu : la consigne du formulaire a été enregistrée
    // telle quelle, prête à s'afficher sur des mentions légales publiques.
    process.env.LEGAL_CONTACT_EMAIL = 'ton adresse e-mail de contact';
    const { legal } = await relire();
    expect(legal.email).toBe('contact@coparentalitezen.fr');
  });

  it('retient la première valeur qui est vraiment une adresse', async () => {
    process.env.LEGAL_CONTACT_EMAIL = 'à compléter';
    process.env.SUPPORT_EMAIL = 'aide@exemple.fr';
    const { legal } = await relire();
    expect(legal.email).toBe('aide@exemple.fr');
  });

  it('n’accepte un SIREN que s’il a neuf chiffres', async () => {
    process.env.LEGAL_PUBLISHER_NAME = 'Sekou SAS';
    process.env.LEGAL_PUBLISHER_ADDRESS = '12 rue des Lilas, 75011 Paris';
    process.env.LEGAL_PUBLISHER_SIREN = 'bientôt';
    const invalide = await relire();
    expect(invalide.identiteComplete()).toBe(false);
    expect(invalide.etatIdentite().siren).toBe('valeur invalide');

    process.env.LEGAL_PUBLISHER_SIREN = '123 456 789';
    const valide = await relire();
    expect(valide.identiteComplete()).toBe(true);
    expect(valide.etatIdentite().siren).toBe('renseigné');
  });

  it('signale une adresse postale manifestement incomplète', async () => {
    process.env.LEGAL_PUBLISHER_NAME = 'Sekou SAS';
    process.env.LEGAL_PUBLISHER_SIREN = '123456789';
    process.env.LEGAL_PUBLISHER_ADDRESS = 'Paris';
    const { identiteComplete, etatIdentite } = await relire();
    expect(etatIdentite().adresse).toBe('valeur trop courte');
    expect(identiteComplete()).toBe(false);
  });
});
