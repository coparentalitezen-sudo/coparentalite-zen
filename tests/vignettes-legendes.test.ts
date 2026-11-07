import { describe, it, expect } from 'vitest';
import { legendeFacebook } from '@/lib/marketing/legende-facebook';
import { VIGNETTES, VIGNETTE_MAX, vignetteDe } from '@/lib/marketing/vignettes';
import { BANQUE } from '@/lib/marketing/banque';
import { scenarioVideo } from '@/lib/marketing/scenario-video';
import { HASHTAGS } from '@/lib/marketing/generateur';
import { histoireDuJour } from '@/lib/marketing/quotidien';
import { publierReelInstagram, vignetteReelFacebook, publierFacebook, publierReelFacebook, type ConfigurationMeta } from '@/lib/marketing/meta';
import { poserMiniature } from '@/lib/youtube/envoi';

const CONFIG = { appId: '111', pageId: '222', igUserId: '333', jeton: 'jeton-secret' } as ConfigurationMeta;
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

describe('légende Facebook', () => {
  const ig = 'Qui prend la première semaine ?\n\nLes dates sont posées.\n\nL’application est sur www.coparentalitezen.fr (lien aussi dans la bio).\n\n#coparentalité #gardealternée #parentsséparés #résidencealternée';

  it('remonte deux mots-dièse à la fin du premier paragraphe et garde les autres en bas', () => {
    const fb = legendeFacebook(ig);
    const [premier, ...reste] = fb.split('\n\n');
    expect(premier).toBe('Qui prend la première semaine ? #coparentalité #gardealternée');
    expect(reste[reste.length - 1]).toBe('#parentsséparés #résidencealternée');
    // aucun mot-dièse perdu ni doublé
    for (const h of HASHTAGS) expect(fb.split(h).length - 1).toBe(1);
  });

  it('retire tout renvoi à la bio, qui n’existe pas sur une page Facebook', () => {
    expect(legendeFacebook(ig)).not.toMatch(/bio/i);
    expect(legendeFacebook('A\n\nInstallez l’application sur www.coparentalitezen.fr — lien dans ma bio.\n\n#a #b'))
      .toBe('A #a #b\n\nInstallez l’application sur www.coparentalitezen.fr.');
    expect(legendeFacebook(histoireDuJour('2026-11-09')!.legende)).not.toMatch(/bio/i);
  });

  it('est idempotente et ne touche pas un texte sans ligne de mots-dièse', () => {
    const une = legendeFacebook(ig);
    expect(legendeFacebook(une)).toBe(une);
    expect(legendeFacebook('Bonjour\n\nSuite #pas_seul en fin de phrase')).toBe('Bonjour\n\nSuite #pas_seul en fin de phrase');
  });

  it('est appliquée par chaque envoi Facebook (photo, Reel)', async () => {
    const f = faussaire([{ corps: { id: 'p1' } }]);
    await publierFacebook(CONFIG, 'https://i/x.jpg', ig, f.requete);
    expect(new URLSearchParams(String(f.appels[0].init?.body)).get('message')).toBe(legendeFacebook(ig));
    const g = faussaire([{ corps: { video_id: 'v9' } }, { corps: { success: true } }, { corps: { success: true } }]);
    await publierReelFacebook(CONFIG, 'https://v/r.mp4', ig, g.requete);
    expect(new URLSearchParams(String(g.appels[2].init?.body)).get('description')).toBe(legendeFacebook(ig));
  });
});

describe('vignettes', () => {
  it('une vignette courte par accroche de chaque niche de la banque', () => {
    for (const s of BANQUE) {
      const v = VIGNETTES[s.niche];
      expect(v, s.niche).toBeDefined();
      expect(v.length).toBe(s.accroches.length);
      for (const t of v) expect(t.length, t).toBeLessThanOrEqual(VIGNETTE_MAX);
    }
  });

  it('aucun chiffre ajouté : un nombre n’apparaît que s’il est déjà dans l’accroche', () => {
    for (const s of BANQUE) VIGNETTES[s.niche].forEach((v) => expect(v).not.toMatch(/\d/));
  });

  it('suit l’accroche choisie, et le scénario la porte', () => {
    const s = BANQUE.find((x) => x.niche === 'documents-familiaux')!;
    expect(vignetteDe(s.niche, s.accroches, s.accroches[0], 7)).toBe(VIGNETTES[s.niche][0]);
    expect(vignetteDe(s.niche, s.accroches, 'accroche inconnue', 4)).toBe(VIGNETTES[s.niche][1]);
    expect(scenarioVideo(s, s.accroches[2], 'yt-x').vignette).toBe(VIGNETTES[s.niche][2]);
  });
});

describe('envoi de la vignette', () => {
  it('Instagram : la couverture part avec le Reel', async () => {
    const f = faussaire([{ corps: { id: 'c1' } }, { corps: { status_code: 'FINISHED' } }, { corps: { id: 'm1' } }]);
    await publierReelInstagram(CONFIG, 'https://v/r.mp4', 'L', f.requete, 0, 'https://s/vignette.jpg');
    expect(new URLSearchParams(String(f.appels[0].init?.body)).get('cover_url')).toBe('https://s/vignette.jpg');
    const g = faussaire([{ corps: { id: 'c1' } }, { corps: { status_code: 'FINISHED' } }, { corps: { id: 'm1' } }]);
    await publierReelInstagram(CONFIG, 'https://v/r.mp4', 'L', g.requete, 0);
    expect(new URLSearchParams(String(g.appels[0].init?.body)).has('cover_url')).toBe(false);
  });

  it('Facebook : miniature jointe, trois essais, jeton jamais dans l’erreur', async () => {
    const ok = faussaire([{ corps: { success: true } }]);
    expect((await vignetteReelFacebook(CONFIG, 'v9', new Uint8Array([1, 2]), ok.requete, 0)).ok).toBe(true);
    expect(ok.appels[0].url).toContain('/v9/thumbnails');
    expect(ok.appels[0].init?.body).toBeInstanceOf(FormData);
    const ko = faussaire([{ statut: 400, corps: { error: { message: 'jeton-secret en traitement' } } }]);
    const r = await vignetteReelFacebook(CONFIG, 'v9', new Uint8Array([1]), ko.requete, 0);
    expect(r.ok).toBe(false);
    expect(ko.appels.length).toBe(3);
    expect(r.erreur).not.toContain('jeton-secret');
  });

  it('YouTube : miniature envoyée, refus rendu sans exception', async () => {
    const appels: string[] = [];
    const ok = await poserMiniature('acces', 'abc', new Uint8Array([1]), (async (u: string) => { appels.push(u); return new Response('{}'); }) as typeof fetch);
    expect(ok.ok).toBe(true);
    expect(appels[0]).toContain('thumbnails/set?videoId=abc');
    const refus = await poserMiniature('acces', 'abc', new Uint8Array([1]),
      (async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'forbidden' }] } }), { status: 403 })) as typeof fetch);
    expect(refus).toEqual({ ok: false, code: 'forbidden', motif: expect.stringContaining('403') });
  });
});
