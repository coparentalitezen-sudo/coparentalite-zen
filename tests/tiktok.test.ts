import { describe, it, expect } from 'vitest';
import {
  legendeTiktok, nomFichierTiktok, APPEL_TIKTOK, APPEL_TIKTOK_NOEL, LONGUEUR_MAX_LEGENDE_TIKTOK,
} from '@/lib/marketing/tiktok';

const LEGENDE_IG = 'Qui accueille les enfants dimanche ?\n\nPartage un même calendrier de garde. Essaie l’application : lien dans la bio.\n\n#coparentalité #gardealternée #parentsolo #maman #papa';
const LEGENDE_SITE = 'Le contrôle médical approche ?\n\nLe rendez-vous a sa place dans le planning. L’application est sur www.coparentalitezen.fr (lien aussi dans la bio).\n\n#coparentalité #gardealternée';

describe('légende TikTok', () => {
  it('hors campagne : retire la bio, ajoute l’adresse du site, finit par les mots-dièse du sujet', () => {
    const l = legendeTiktok(LEGENDE_IG, 'garde-alternee', '2026-10-01');
    expect(l).toBe(`Qui accueille les enfants dimanche ?\n\nPartage un même calendrier de garde.\n\n${APPEL_TIKTOK}\n\n#coparentalité #gardealternée #parentsolo #maman #papa`);
    expect(l).not.toMatch(/bio/);
  });

  it('pendant la campagne de Noël : un seul appel, vers le planning de Noël', () => {
    const l = legendeTiktok(LEGENDE_SITE, 'rendez-vous-medicaux', '2026-11-20');
    expect(l).toContain(APPEL_TIKTOK_NOEL);
    expect(l).not.toContain(APPEL_TIKTOK);
    expect(l).not.toMatch(/www\.|bio/);
    expect(l.match(/coparentalitezen\.fr/g)).toHaveLength(1);
    expect(l.endsWith('#coparentalité #gardealternée #santédesenfants #maman #papa')).toBe(true);
  });

  it('idempotente', () => {
    const une = legendeTiktok(LEGENDE_IG, 'noel', '2026-12-01');
    expect(legendeTiktok(une, 'noel', '2026-12-01')).toBe(une);
  });

  it('un titre seul (Short) suffit, une base vide donne au moins l’appel et les mots-dièse', () => {
    expect(legendeTiktok('Vacances : qui a les enfants ?', 'vacances-scolaires', '2026-10-01'))
      .toBe(`Vacances : qui a les enfants ?\n\n${APPEL_TIKTOK}\n\n#coparentalité #gardealternée #vacancesscolaires #maman #papa`);
    expect(legendeTiktok('', 'inconnue', '2026-10-01')).toBe(`${APPEL_TIKTOK}\n\n#coparentalité #gardealternée #parentsolo #maman #papa`);
  });

  it('reste sous la limite de TikTok', () => {
    expect(legendeTiktok('a'.repeat(5000), 'noel', '2026-10-01').length).toBeLessThanOrEqual(LONGUEUR_MAX_LEGENDE_TIKTOK);
  });
});

describe('nom du fichier', () => {
  it('lisible et sans caractère douteux', () => {
    expect(nomFichierTiktok('reel-2026-11-15/vacances')).toBe('coparentalite-zen-reel-2026-11-15-vacances.mp4');
    expect(nomFichierTiktok('yt-2026-11-15')).toBe('coparentalite-zen-yt-2026-11-15.mp4');
  });
});
