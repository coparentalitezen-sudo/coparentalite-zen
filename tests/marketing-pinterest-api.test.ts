import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  configurationPinterest, etatConfigurationPinterest, expurger, appelPinterest,
  listerEpinglesTableau, analytiquesEpingle, VERSION_API,
  type ConfigurationPinterest,
} from '../src/lib/marketing/pinterest-api';

const CONFIG: ConfigurationPinterest = { jeton: 'jetonDeTestTresLong1234567890', tableauId: '999' };

function faussaire(reponses: { statut?: number; corps: unknown }[]) {
  const appels: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const requete = async (url: string, init?: RequestInit) => {
    appels.push({ url, init });
    const r = reponses[Math.min(i++, reponses.length - 1)];
    return new Response(JSON.stringify(r.corps), { status: r.statut ?? 200 });
  };
  return { requete, appels };
}

describe('configuration', () => {
  beforeEach(() => {
    process.env.PINTEREST_ACCESS_TOKEN = 'jeton';
    process.env.PINTEREST_BOARD_ID = '999';
  });
  afterEach(() => {
    delete process.env.PINTEREST_ACCESS_TOKEN;
    delete process.env.PINTEREST_BOARD_ID;
  });

  it('refuse une configuration incomplète', () => {
    delete process.env.PINTEREST_BOARD_ID;
    expect(configurationPinterest()).toBeNull();
  });

  it('accepte une configuration complète', () => {
    expect(configurationPinterest()?.tableauId).toBe('999');
  });

  it('rapporte l’état sans révéler le jeton', () => {
    const etat = etatConfigurationPinterest();
    expect(etat.PINTEREST_ACCESS_TOKEN).toBe(true);
    expect(JSON.stringify(etat)).not.toContain('jeton');
  });
});

describe('expurgation', () => {
  it('masque access_token dans une adresse', () => {
    expect(expurger('/pins?access_token=secret123&foo=bar'))
      .toBe('/pins?access_token=[masqué]&foo=bar');
  });

  it('masque la valeur exacte du jeton', () => {
    expect(expurger(`échec avec ${CONFIG.jeton}`, CONFIG.jeton)).not.toContain(CONFIG.jeton);
  });
});

describe('appel Pinterest', () => {
  it('place le jeton dans l’en-tête, jamais dans l’adresse', async () => {
    const f = faussaire([{ corps: { id: '1' } }]);
    await appelPinterest('/pins/1', CONFIG, { requete: f.requete });
    expect(f.appels[0].url).not.toContain(CONFIG.jeton);
    expect((f.appels[0].init?.headers as Record<string, string>).Authorization)
      .toBe(`Bearer ${CONFIG.jeton}`);
  });

  it('vise la version d’API déclarée', async () => {
    const f = faussaire([{ corps: {} }]);
    await appelPinterest('/pins/1', CONFIG, { requete: f.requete });
    expect(f.appels[0].url).toContain(`/${VERSION_API}/pins/1`);
  });

  it('ne lève jamais d’exception', async () => {
    const r = await appelPinterest('/pins/1', CONFIG, {
      requete: async () => { throw new Error(`échec vers ${CONFIG.jeton}`); },
    });
    expect(r.ok).toBe(false);
    expect(r.erreur).not.toContain(CONFIG.jeton);
  });

  it('expurge l’erreur renvoyée par Pinterest', async () => {
    const f = faussaire([{ statut: 401, corps: { message: `jeton invalide ${CONFIG.jeton}` } }]);
    const r = await appelPinterest('/pins/1', CONFIG, { requete: f.requete });
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain('401');
    expect(r.erreur).not.toContain(CONFIG.jeton);
  });
});

describe('liste des épingles d’un tableau', () => {
  it('agrège les pages jusqu’à l’absence de bookmark', async () => {
    const f = faussaire([
      { corps: { items: [{ id: 'a' }, { id: 'b' }], bookmark: 'suite' } },
      { corps: { items: [{ id: 'c' }] } },
    ]);
    const r = await listerEpinglesTableau(CONFIG, f.requete);
    expect(r.ok).toBe(true);
    expect(r.donnees?.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(f.appels).toHaveLength(2);
    expect(f.appels[1].url).toContain('bookmark=suite');
  });

  it('vise le bon tableau', async () => {
    const f = faussaire([{ corps: { items: [] } }]);
    await listerEpinglesTableau(CONFIG, f.requete);
    expect(f.appels[0].url).toContain(`/boards/${CONFIG.tableauId}/pins`);
  });

  it('remonte l’erreur sans continuer à paginer', async () => {
    const f = faussaire([{ statut: 500, corps: { message: 'panne' } }]);
    const r = await listerEpinglesTableau(CONFIG, f.requete);
    expect(r.ok).toBe(false);
    expect(f.appels).toHaveLength(1);
  });
});

describe('analytique d’une épingle', () => {
  it('demande les quatre métriques attendues', async () => {
    const f = faussaire([{ corps: { all: { summary_metrics: {} } } }]);
    await analytiquesEpingle(CONFIG, 'pin-1', new Date('2026-01-01'), new Date('2026-01-05'), f.requete);
    expect(f.appels[0].url).toContain('metric_types=IMPRESSION%2CSAVE%2CPIN_CLICK%2COUTBOUND_CLICK');
    expect(f.appels[0].url).toContain('/pins/pin-1/analytics');
  });

  it('lit les quatre métriques renvoyées', async () => {
    const f = faussaire([{
      corps: { all: { summary_metrics: { IMPRESSION: 100, SAVE: 5, PIN_CLICK: 3, OUTBOUND_CLICK: 2 } } },
    }]);
    const r = await analytiquesEpingle(CONFIG, 'pin-1', new Date('2026-01-01'), new Date('2026-01-05'), f.requete);
    expect(r.donnees).toEqual({ impressions: 100, saves: 5, pinClicks: 3, outboundClicks: 2 });
  });

  it('renvoie des zéros plutôt qu’une exception si une métrique manque', async () => {
    const f = faussaire([{ corps: { all: {} } }]);
    const r = await analytiquesEpingle(CONFIG, 'pin-1', new Date('2026-01-01'), new Date('2026-01-05'), f.requete);
    expect(r.donnees).toEqual({ impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0 });
  });

  it('borne la fenêtre demandée à la limite acceptée par l’API', async () => {
    const f = faussaire([{ corps: { all: { summary_metrics: {} } } }]);
    await analytiquesEpingle(CONFIG, 'pin-1', new Date('2020-01-01'), new Date('2026-01-05'), f.requete);
    const url = new URL(f.appels[0].url);
    const debut = new Date(url.searchParams.get('start_date')!);
    const fin = new Date(url.searchParams.get('end_date')!);
    const jours = (fin.getTime() - debut.getTime()) / 86_400_000;
    expect(jours).toBeLessThanOrEqual(90);
  });
});
