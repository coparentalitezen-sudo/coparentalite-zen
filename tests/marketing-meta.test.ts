import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  configurationMeta, etatConfiguration, expurger, appelGraph,
  verifierConnexion, permissions, publierImageInstagram, publierFacebook,
  natureDuJeton, aptitudes, jetonDePage, expirationJeton,
  VERSION_GRAPH, type ConfigurationMeta,
} from '../src/lib/marketing/meta';

const CONFIG: ConfigurationMeta = {
  appId: '111', pageId: '222', igUserId: '333',
  jeton: 'EAAtresLongJetonDeTest1234567890abcdef',
};

/** Faux serveur : enregistre les appels et renvoie des réponses préparées. */
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
    process.env.META_APP_ID = '111';
    process.env.META_PAGE_ID = '222';
    process.env.META_IG_USER_ID = '333';
    process.env.META_LONG_LIVED_TOKEN = 'jeton';
  });
  afterEach(() => {
    for (const c of ['META_APP_ID', 'META_APP_SECRET', 'META_PAGE_ID', 'META_IG_USER_ID', 'META_LONG_LIVED_TOKEN']) {
      delete process.env[c];
    }
  });

  it('refuse une configuration incomplète plutôt que d’en deviner une', () => {
    delete process.env.META_IG_USER_ID;
    expect(configurationMeta()).toBeNull();
  });

  it('accepte une configuration complète', () => {
    expect(configurationMeta()?.pageId).toBe('222');
  });

  it('rapporte l’état sans jamais révéler une valeur', () => {
    const etat = etatConfiguration();
    expect(etat.META_APP_ID).toBe(true);
    expect(etat.META_APP_SECRET).toBe(false);
    expect(JSON.stringify(etat)).not.toContain('jeton');
  });
});

describe('expurgation des messages', () => {
  it('masque un paramètre access_token', () => {
    expect(expurger('GET /me?access_token=EAAsecret123&fields=id'))
      .toBe('GET /me?access_token=[masqué]&fields=id');
  });

  it('masque un jeton reconnaissable même hors paramètre', () => {
    expect(expurger('jeton EAAabcdefghijklmnopqrstuvwxyz invalide'))
      .not.toContain('EAAabcdefghijklmnopqrstuvwxyz');
  });

  it('masque la valeur exacte du jeton en cours', () => {
    expect(expurger(`échec avec ${CONFIG.jeton}`, CONFIG.jeton)).not.toContain(CONFIG.jeton);
  });

  it('borne la longueur enregistrée', () => {
    expect(expurger('a'.repeat(2000)).length).toBeLessThanOrEqual(500);
  });
});

describe('appel Graph', () => {
  it('place le jeton dans l’en-tête et jamais dans l’adresse', async () => {
    const f = faussaire([{ corps: { id: '222' } }]);
    await appelGraph('/222?fields=id', CONFIG, { requete: f.requete });
    expect(f.appels[0].url).not.toContain(CONFIG.jeton);
    expect(f.appels[0].url).not.toContain('access_token');
    expect((f.appels[0].init?.headers as Record<string, string>).Authorization)
      .toBe(`Bearer ${CONFIG.jeton}`);
  });

  it('vise la version d’API déclarée', async () => {
    const f = faussaire([{ corps: {} }]);
    await appelGraph('/me', CONFIG, { requete: f.requete });
    expect(f.appels[0].url).toContain(`/${VERSION_GRAPH}/me`);
  });

  it('ne lève jamais d’exception, même en panne réseau', async () => {
    const r = await appelGraph('/me', CONFIG, {
      requete: async () => { throw new Error(`échec vers ${CONFIG.jeton}`); },
    });
    expect(r.ok).toBe(false);
    expect(r.erreur).not.toContain(CONFIG.jeton);
  });

  it('expurge l’erreur renvoyée par Meta', async () => {
    const f = faussaire([{
      statut: 400,
      corps: { error: { message: `Invalid token: ${CONFIG.jeton}`, code: 190 } },
    }]);
    const r = await appelGraph('/me', CONFIG, { requete: f.requete });
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain('400');
    expect(r.erreur).not.toContain(CONFIG.jeton);
  });
});

describe('vérification de la connexion', () => {
  it('identifie la page puis le compte Instagram', async () => {
    const f = faussaire([
      { corps: { id: '222', name: 'Coparentalitezen' } },
      { corps: { id: '333', username: 'coparentalitezen' } },
    ]);
    const r = await verifierConnexion(CONFIG, f.requete);
    expect(r.ok).toBe(true);
    expect(r.donnees).toEqual({ page: 'Coparentalitezen', instagram: 'coparentalitezen' });
  });

  it('dit laquelle des deux identifications a échoué', async () => {
    const f = faussaire([{ statut: 400, corps: { error: { message: 'Page inconnue' } } }]);
    const r = await verifierConnexion(CONFIG, f.requete);
    expect(r.erreur).toContain('Page');
  });

  it('ne retient que les permissions réellement accordées', async () => {
    const f = faussaire([{
      corps: { data: [
        { permission: 'instagram_content_publish', status: 'granted' },
        { permission: 'pages_manage_posts', status: 'declined' },
      ] },
    }]);
    expect((await permissions(CONFIG, f.requete)).donnees).toEqual(['instagram_content_publish']);
  });
});

describe('publication Instagram', () => {
  it('enchaîne conteneur, vérification d’état, publication', async () => {
    const f = faussaire([
      { corps: { id: 'conteneur-1' } },
      { corps: { status_code: 'FINISHED' } },
      { corps: { id: 'media-42' } },
    ]);
    const r = await publierImageInstagram(CONFIG, 'https://exemple.fr/i.png', 'Légende', 'Alt', f.requete);
    expect(r.ok).toBe(true);
    expect(r.donnees?.id).toBe('media-42');
    expect(f.appels).toHaveLength(3);
    expect(f.appels[0].url).toContain('/333/media');
    expect(f.appels[2].url).toContain('/333/media_publish');
  });

  it('transmet le texte alternatif, jamais facultatif', async () => {
    const f = faussaire([
      { corps: { id: 'c' } }, { corps: { status_code: 'FINISHED' } }, { corps: { id: 'm' } },
    ]);
    await publierImageInstagram(CONFIG, 'https://exemple.fr/i.png', 'L', 'Description', f.requete);
    expect(String(f.appels[0].init?.body)).toContain('alt_text=Description');
  });

  it('s’arrête si le conteneur n’est pas prêt, au lieu de provoquer une erreur 9007', async () => {
    const f = faussaire([
      { corps: { id: 'c' } }, { corps: { status_code: 'IN_PROGRESS' } },
    ]);
    const r = await publierImageInstagram(CONFIG, 'https://exemple.fr/i.png', 'L', 'A', f.requete);
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain('IN_PROGRESS');
    expect(f.appels).toHaveLength(2);
  });

  it('ne publie rien si le conteneur a échoué', async () => {
    const f = faussaire([{ statut: 400, corps: { error: { message: 'image inaccessible' } } }]);
    const r = await publierImageInstagram(CONFIG, 'https://exemple.fr/i.png', 'L', 'A', f.requete);
    expect(r.ok).toBe(false);
    expect(f.appels).toHaveLength(1);
  });
});

describe('publication Facebook', () => {
  it('publie sur la page et non sur le profil', async () => {
    const f = faussaire([{ corps: { id: 'photo-1', post_id: '222_999' } }]);
    const r = await publierFacebook(CONFIG, 'https://exemple.fr/i.png', 'Message', f.requete);
    expect(r.ok).toBe(true);
    expect(f.appels[0].url).toContain('/222/photos');
  });
});

describe('aptitudes réelles plutôt que déclarées', () => {
  it('reconnaît un jeton de page', async () => {
    const f = faussaire([{ corps: { id: '222' } }]);
    const r = await natureDuJeton(CONFIG, f.requete);
    expect(r.donnees?.estJetonDePage).toBe(true);
  });

  it('signale un jeton d’utilisateur, qui ne publierait pas sur la page', async () => {
    const f = faussaire([{ corps: { id: '999' } }]);
    const r = await natureDuJeton(CONFIG, f.requete);
    expect(r.donnees?.estJetonDePage).toBe(false);
  });

  it('conclut à Instagram opérationnel dès que le quota répond', async () => {
    // Le quota exige instagram_basic et instagram_content_publish : l'obtenir
    // prouve les autorisations mieux qu'une liste déclarative.
    const f = faussaire([{ corps: { data: [{ quota_usage: 0, config: { quota_total: 100 } }] } }]);
    const a = await aptitudes(CONFIG, f.requete);
    expect(a.instagram).toBe(true);
    expect(a.detailInstagram).toContain('Quota');
  });

  it('n’exige pas la liste des permissions, vide sur un jeton de page', async () => {
    const f = faussaire([
      { corps: { data: [{ quota_usage: 0, config: { quota_total: 100 } }] } },
      { corps: { id: '222' } },
    ]);
    const a = await aptitudes(CONFIG, f.requete);
    expect(a.instagram).toBe(true);
    expect(a.facebook).toBe(true);
  });

  it('ne conclut pas d’un échec en lecture que l’écriture échouerait', async () => {
    // La lecture du fil dépend d'autorisations différentes de l'écriture.
    // Seul le type de jeton est concluant sans publier.
    const f = faussaire([
      { corps: { data: [{ quota_usage: 0, config: { quota_total: 100 } }] } },
      { corps: { id: '222' } },
    ]);
    const a = await aptitudes(CONFIG, f.requete);
    expect(a.detailFacebook).toContain('publiant');
  });

  it('explique pourquoi Facebook échouerait, au lieu de dire seulement « non »', async () => {
    const f = faussaire([{ statut: 400, corps: { error: { message: 'Jeton invalide' } } }]);
    const a = await aptitudes(CONFIG, f.requete);
    expect(a.facebook).toBe(false);
    expect(a.detailFacebook.length).toBeGreaterThan(20);
  });
});

describe('dérivation du jeton de page', () => {
  it('garde tel quel un jeton déjà de page', async () => {
    const f = faussaire([{ corps: { id: '222' } }]);
    const r = await jetonDePage({ ...CONFIG, jeton: 'jeton-page-A' }, f.requete);
    expect(r.donnees).toBe('jeton-page-A');
    expect(f.appels).toHaveLength(1);
  });

  it('dérive un jeton de page depuis un jeton d’utilisateur', async () => {
    // C'est l'étape manuelle qui a été ratée deux fois. La faire faire à
    // l'application supprime la confusion plutôt que de la documenter.
    const f = faussaire([
      { corps: { id: '999' } },
      { corps: { access_token: 'jeton-de-page-derive' } },
    ]);
    const r = await jetonDePage({ ...CONFIG, jeton: 'jeton-utilisateur-B' }, f.requete);
    expect(r.ok).toBe(true);
    expect(r.donnees).toBe('jeton-de-page-derive');
    expect(f.appels[1].url).toContain('/222?fields=access_token');
  });

  it('explique une dérivation impossible au lieu de la taire', async () => {
    const f = faussaire([
      { corps: { id: '999' } },
      { corps: { id: '222' } },
    ]);
    const r = await jetonDePage({ ...CONFIG, jeton: 'jeton-utilisateur-C' }, f.requete);
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain('pages_show_list');
  });

  it('n’invente pas d’échéance sans la clé secrète', async () => {
    delete process.env.META_APP_SECRET;
    const e = await expirationJeton(CONFIG, faussaire([{ corps: {} }]).requete);
    expect(e.connue).toBe(false);
    expect(e.date).toBeNull();
    expect(e.motif).toContain('META_APP_SECRET');
  });
});
