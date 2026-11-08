import { describe, it, expect } from 'vitest';
import { syntheseYoutube } from '@/lib/youtube/resultats';
import { estRobot } from '@/lib/marketing/utm';
import { lireChaine } from '@/lib/youtube/envoi';

describe('résultats YouTube', () => {
  const shorts = [
    { jour: '2026-11-09', titre: 'Un message clair | Communiquer', video_id: 'a', vues: 40 },
    { jour: '2026-11-10', titre: 'Deux rythmes', video_id: 'b', vues: null },
  ];

  it('rattache clics et inscriptions au Short, sans les clics d’avant le filtre des robots', () => {
    const s = syntheseYoutube(shorts, [
      { contenu: 'yt-2026-11-09', jour: '2026-11-09', clics: 2 },
      { contenu: 'yt-2026-11-09', jour: '2026-11-11', clics: 1 },
      { contenu: 'yt-2026-11-08', jour: '2026-11-08', clics: 4 },
    ], ['yt-2026-11-09', 'yt-2026-11-09', 'yt-2026-11-10', null, '2026s45-reel-6'], []);
    expect(s.lignes.map((l) => l.jour)).toEqual(['2026-11-10', '2026-11-09']);
    expect(s.lignes[1]).toMatchObject({ clics: 3, inscrits: 2, vues: 40 });
    expect(s.lignes[0]).toMatchObject({ clics: 0, inscrits: 1, vues: null });
    expect(s.clics).toBe(3);
    expect(s.inscrits).toBe(3);
    expect(s.vues).toBe(40);
  });

  it('abonnés : dernier relevé et progression sur sept jours, ou depuis le premier relevé', () => {
    const r = (jour: string, abonnes: number | null) => ({ jour, abonnes, vues: null });
    const s = syntheseYoutube([], [], [], [r('2026-11-09', 10), r('2026-11-12', 12), r('2026-11-16', 19), r('2026-11-17', 21)]);
    expect(s.abonnes).toBe(21);
    expect(s.progression).toBe(11);
    expect(s.progressionJours).toBe(8);
    const debut = syntheseYoutube([], [], [], [r('2026-11-09', 10), r('2026-11-11', 13)]);
    expect(debut).toMatchObject({ abonnes: 13, progression: 3, progressionJours: 2 });
    const rien = syntheseYoutube([], [], [], []);
    expect(rien).toMatchObject({ abonnes: null, progression: null, vues: null });
  });
});

describe('robots écartés du comptage des visites', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  it('compte un vrai navigateur', () => expect(estRobot(iphone, 'fr-FR,fr;q=0.9')).toBe(false));
  it('écarte robots, navigateurs sans tête, outils et requêtes sans langue', () => {
    expect(estRobot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'en')).toBe(true);
    expect(estRobot('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36', 'en-US')).toBe(true);
    expect(estRobot('facebookexternalhit/1.1', 'en')).toBe(true);
    expect(estRobot('curl/8.0', null)).toBe(true);
    expect(estRobot(null, 'fr')).toBe(true);
    expect(estRobot(iphone, null)).toBe(true);
  });
});

describe('statistiques de la chaîne', () => {
  const rep = (corps: unknown, status = 200) => (async () => new Response(JSON.stringify(corps), { status })) as unknown as typeof fetch;
  it('lit abonnés, vues et vidéos', async () => {
    expect(await lireChaine('x', rep({ items: [{ statistics: { subscriberCount: '42', viewCount: '3100', videoCount: '18', hiddenSubscriberCount: false } }] })))
      .toEqual({ abonnes: 42, masques: false, vues: 3100, videos: 18 });
  });
  it('abonnés masqués : null, jamais zéro', async () => {
    expect(await lireChaine('x', rep({ items: [{ statistics: { subscriberCount: '0', hiddenSubscriberCount: true, viewCount: '5', videoCount: '1' } }] })))
      .toMatchObject({ abonnes: null, masques: true });
  });
  it('aucune chaîne : null ; refus : erreur levée', async () => {
    expect(await lireChaine('x', rep({ items: [] }))).toBeNull();
    await expect(lireChaine('x', rep({ error: { errors: [{ reason: 'forbidden' }] } }, 403))).rejects.toBeTruthy();
  });
});
