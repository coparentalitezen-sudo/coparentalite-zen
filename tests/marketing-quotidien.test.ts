import { describe, expect, it } from 'vitest';
import { histoireDuJour, urlVisuelQuotidien, assurerVisuelDuJour } from '../src/lib/marketing/quotidien';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('visuels quotidiens', () => {
  it('sélectionne une histoire différente chaque jour, puis répète un cycle cohérent', () => {
    const depart = Date.UTC(2026, 8, 28);
    const histoires = Array.from({ length: 28 }, (_, i) =>
      histoireDuJour(new Date(depart + i * 86_400_000).toISOString().slice(0, 10)));
    expect(new Set(histoires.map((h) => h?.question)).size).toBe(28);
    expect(new Set(histoires.map((h) => h?.fichier)).size).toBe(7);
    expect(histoires.every((h) => h?.legende.includes('www.coparentalitezen.fr'))).toBe(true);
    expect(histoires.every((h) => h?.texteAlternatif.includes('Lien dans ma bio'))).toBe(true);
    expect(histoireDuJour(new Date(depart + 28 * 86_400_000).toISOString().slice(0, 10))?.question)
      .toBe(histoires[0]?.question);
    expect(histoireDuJour('2026-09-27')?.question).toBe('Les billets sont pris pour quelles dates ?');
  });

  it('rejette une date impossible et signe une URL différente chaque jour', () => {
    process.env.CRON_SECRET = 'secret-de-test';
    expect(histoireDuJour('2026-02-30')).toBeNull();
    const a = urlVisuelQuotidien('2026-09-28', 'https://www.coparentalitezen.fr');
    const b = urlVisuelQuotidien('2026-09-29', 'https://www.coparentalitezen.fr');
    expect(a).toContain('/api/marketing/visuel-quotidien?jour=2026-09-28&jeton=');
    expect(a).not.toBe(b);
    delete process.env.CRON_SECRET;
  });

  it('ne prépare pas un deuxième post si un visuel a déjà été publié aujourd’hui', async () => {
    process.env.CRON_SECRET = 'secret-de-test';
    let insertions = 0;
    const service = { from: () => {
      let filtre = '';
      const requete = {
        select: () => requete,
        eq: (colonne: string) => { filtre = colonne; return requete; },
        gte: (colonne: string) => { filtre = colonne; return requete; },
        limit: async () => ({ data: filtre === 'publie_le' ? [{ id: 'precedent' }] : [], error: null }),
        upsert: () => { insertions += 1; return requete; },
      };
      return requete;
    } } as unknown as Pick<SupabaseClient, 'from'>;
    expect(await assurerVisuelDuJour(service, '2026-09-28', 'https://www.coparentalitezen.fr'))
      .toBe('deja');
    expect(insertions).toBe(0);
    delete process.env.CRON_SECRET;
  });
});
