import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { etatReelFacebook, problemeReelFacebook } from '@/lib/marketing/meta';

const config = { jeton: 'j', pageId: 'p', igUserId: 'i' } as unknown as Parameters<typeof etatReelFacebook>[0];
function requete(reponses: Record<string, unknown>) {
  return (async (url: string) => {
    const cle = Object.keys(reponses).find((k) => String(url).includes(k))!;
    return new Response(JSON.stringify(reponses[cle]), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('état d’un Reel Facebook', () => {
  it('en ligne, public, avec ses lectures', async () => {
    const r = await etatReelFacebook(config, '42', requete({
      'video_insights': { data: [{ name: 'blue_reels_play_count', values: [{ value: 37 }] }, { name: 'post_impressions_unique', values: [{ value: 30 }] }] },
      '/42?fields': { published: true, privacy: { value: 'EVERYONE' }, status: { video_status: 'ready' }, permalink_url: '/reel/42' },
    }));
    expect(r.donnees).toEqual({ publie: true, public: true, etat: 'ready', lien: 'https://www.facebook.com/reel/42', lectures: 37, portee: 30 });
    expect(problemeReelFacebook(r.donnees!)).toBeNull();
  });

  it('nomme ce qui empêche de le voir', () => {
    const base = { publie: true, public: true, etat: 'ready', lien: null, lectures: null, portee: null };
    expect(problemeReelFacebook({ ...base, publie: false, etat: 'processing' })).toBe('pas en ligne (état : processing)');
    expect(problemeReelFacebook({ ...base, public: false })).toBe('en ligne, mais pas visible de tout le monde');
    expect(problemeReelFacebook({ ...base, etat: 'error' })).toMatch(/échec/);
    expect(problemeReelFacebook({ ...base, public: null })).toBeNull();
  });
});
