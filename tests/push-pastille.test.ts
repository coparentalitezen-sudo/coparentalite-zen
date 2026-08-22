import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Le décompte de non-lues embarqué dans le message poussé.
 *
 * Ce qui est vérifié ici, c'est le contrat entre la base et le service worker :
 * quand le nombre est connu, il voyage ; quand il ne l'est pas, le champ est
 * absent — et non mis à zéro, qui effacerait la pastille au lieu de laisser le
 * service worker incrémenter.
 */

const envoye: { charge: string }[] = [];

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: (_a: unknown, charge: string) => {
      envoye.push({ charge });
      return Promise.resolve();
    },
  },
}));

const CONFIG = { clePublique: 'pub', clePrivee: 'priv', contact: 'mailto:a@b.fr' };
const APPAREIL = { endpoint: 'https://push.exemple/1', p256dh: 'p', auth: 'a' };

beforeEach(() => { envoye.length = 0; });
afterEach(() => { vi.restoreAllMocks(); });

describe('charge utile poussée', () => {
  it('transporte le décompte quand il est connu', async () => {
    const { envoyerPush } = await import('../src/lib/push');
    await envoyerPush(CONFIG, APPAREIL, { titre: 'Test', nonLues: 4 });
    expect(JSON.parse(envoye[0].charge).nonLues).toBe(4);
  });

  it('transporte zéro sans le confondre avec une absence', async () => {
    const { envoyerPush } = await import('../src/lib/push');
    await envoyerPush(CONFIG, APPAREIL, { titre: 'Test', nonLues: 0 });
    expect(JSON.parse(envoye[0].charge).nonLues).toBe(0);
  });

  it('omet le champ quand le décompte est inconnu', async () => {
    const { envoyerPush } = await import('../src/lib/push');
    await envoyerPush(CONFIG, APPAREIL, { titre: 'Test', nonLues: null });
    expect('nonLues' in JSON.parse(envoye[0].charge)).toBe(false);
  });

  it('omet le champ quand rien n’est précisé', async () => {
    const { envoyerPush } = await import('../src/lib/push');
    await envoyerPush(CONFIG, APPAREIL, { titre: 'Test' });
    expect('nonLues' in JSON.parse(envoye[0].charge)).toBe(false);
  });

  it('conserve titre, corps et lien', async () => {
    const { envoyerPush } = await import('../src/lib/push');
    await envoyerPush(CONFIG, APPAREIL, {
      titre: 'Changement de garde', corps: 'Demain', href: '/app/planning', nonLues: 2,
    });
    const charge = JSON.parse(envoye[0].charge);
    expect(charge.title).toBe('Changement de garde');
    expect(charge.body).toBe('Demain');
    expect(charge.url).toBe('/app/planning');
  });
});
