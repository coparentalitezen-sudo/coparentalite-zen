import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publierStoryInstagram, publierStoryFacebook, type ConfigurationMeta } from '../src/lib/marketing/meta';
import { urlStoryPublic, urlVisuelPublic, verifierVisuel } from '../src/lib/marketing/signature';
import {
  etatStory, heureStory, DECALAGE_STORY_HEURES, HEURE_STORY_MAX, ESSAIS_STORY_MAX,
} from '../src/lib/marketing/stories-regles';
import { HEURE_PAR_DEFAUT } from '../src/lib/marketing/horaire';
import { plancheStory, planifierVisuel, APPEL_STORY } from '../src/lib/marketing/visuel';
import { genererSemaine } from '../src/lib/marketing/generateur';

const CONFIG: ConfigurationMeta = { appId: '111', pageId: '222', igUserId: '333', jeton: 'EAAjetonDeTest1234567890abcdef' };

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

describe('story Instagram', () => {
  it('crée un conteneur STORIES, attend son traitement, puis le publie', async () => {
    const f = faussaire([{ corps: { id: 'c1' } }, { corps: { status_code: 'FINISHED' } }, { corps: { id: 'story-9' } }]);
    const r = await publierStoryInstagram(CONFIG, 'https://exemple.fr/story.jpg', f.requete);
    expect(r).toEqual({ ok: true, donnees: { id: 'story-9' } });
    expect(f.appels[0].url).toContain('/333/media');
    const corps = String(f.appels[0].init?.body);
    expect(corps).toContain('media_type=STORIES');
    expect(corps).toContain('image_url=');
    expect(corps).not.toContain('caption');
    expect(f.appels[2].url).toContain('/333/media_publish');
    expect(String(f.appels[2].init?.body)).toContain('creation_id=c1');
  });

  it('rend l’erreur du conteneur sans publier', async () => {
    const f = faussaire([{ statut: 400, corps: { error: { message: 'Format refusé' } } }]);
    const r = await publierStoryInstagram(CONFIG, 'https://exemple.fr/story.jpg', f.requete);
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain('Format refusé');
    expect(f.appels).toHaveLength(1);
  });
});

describe('story Facebook', () => {
  it('dépose la photo sans la publier dans le fil, puis la rattache à une story', async () => {
    const f = faussaire([{ corps: { id: 'photo-1' } }, { corps: { post_id: 'story-2', success: true } }]);
    const r = await publierStoryFacebook(CONFIG, 'https://exemple.fr/story.jpg', f.requete);
    expect(r.ok).toBe(true);
    expect(r.donnees?.post_id).toBe('story-2');
    expect(f.appels[0].url).toContain('/222/photos');
    expect(String(f.appels[0].init?.body)).toContain('published=false');
    expect(f.appels[1].url).toContain('/222/photo_stories');
    expect(String(f.appels[1].init?.body)).toContain('photo_id=photo-1');
  });

  it('ne crée pas de story si la photo échoue', async () => {
    const f = faussaire([{ statut: 500, corps: { error: { message: 'panne' } } }]);
    const r = await publierStoryFacebook(CONFIG, 'https://exemple.fr/story.jpg', f.requete);
    expect(r.ok).toBe(false);
    expect(f.appels).toHaveLength(1);
  });
});

describe('adresse signée de la story', () => {
  beforeEach(() => { process.env.CRON_SECRET = 'secret-de-test'; });
  afterEach(() => { delete process.env.CRON_SECRET; });

  it('demande le format story, et sa signature ne vaut pas pour une planche', () => {
    const url = new URL(urlStoryPublic('https://www.coparentalitezen.fr', '2026s48-reel-1')!);
    expect(url.searchParams.get('format')).toBe('story');
    const jeton = url.searchParams.get('jeton');
    expect(verifierVisuel('2026s48-reel-1#story', 0, jeton)).toBe(true);
    expect(verifierVisuel('2026s48-reel-1', 0, jeton)).toBe(false);
    const planche = new URL(urlVisuelPublic('https://www.coparentalitezen.fr', '2026s48-reel-1', 0)!);
    expect(verifierVisuel('2026s48-reel-1#story', 0, planche.searchParams.get('jeton'))).toBe(false);
  });

  it('aucune adresse sans secret', () => {
    delete process.env.CRON_SECRET;
    expect(urlStoryPublic('https://www.coparentalitezen.fr', 'x')).toBeNull();
  });
});

describe('règles de la story du jour', () => {
  it('part trois heures après la publication, jamais après 21 h', () => {
    expect(heureStory(10)).toBe(10 + DECALAGE_STORY_HEURES);
    expect(heureStory(null)).toBe(HEURE_PAR_DEFAUT + DECALAGE_STORY_HEURES);
    expect(heureStory(20)).toBe(HEURE_STORY_MAX);
  });

  it('une seule story par jour et par plateforme', () => {
    expect(etatStory([], 'instagram')).toBe('a_faire');
    expect(etatStory([{ source: 'instagram', publie: true }], 'instagram')).toBe('faite');
    expect(etatStory([{ source: 'instagram', publie: true }], 'facebook')).toBe('a_faire');
  });

  it('abandonne après plusieurs échecs plutôt que d’insister toute la journée', () => {
    const echecs = Array.from({ length: ESSAIS_STORY_MAX }, () => ({ source: 'facebook', publie: false }));
    expect(etatStory(echecs.slice(1), 'facebook')).toBe('a_faire');
    expect(etatStory(echecs, 'facebook')).toBe('abandon');
  });
});

describe('visuel de la story', () => {
  const semaine = genererSemaine(new Date('2026-11-24'), 'https://www.coparentalitezen.fr');

  it('reprend l’accroche du contenu, avec un appel, sans numéro de planche', () => {
    for (const c of semaine) {
      const planche = plancheStory(c);
      expect(planche.texte).toBe(c.pages[0].texte);
      const plan = planifierVisuel(planche, 'vertical');
      expect(plan).toMatchObject({ largeur: 1080, hauteur: 1920, appel: APPEL_STORY, pagination: null });
    }
  });

  it('laisse libres les zones recouvertes par Instagram (haut et bas)', () => {
    const [haut, , bas] = planifierVisuel(plancheStory(semaine[0]), 'vertical').marges.split(' ').map((v) => parseInt(v, 10));
    expect(haut).toBeGreaterThanOrEqual(250);
    expect(bas).toBeGreaterThanOrEqual(340);
  });
});
