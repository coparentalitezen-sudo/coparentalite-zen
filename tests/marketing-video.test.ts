import { describe, it, expect } from 'vitest';
import {
  construireListeConcat, dureeTotale, argumentsFfmpeg,
  LARGEUR_REEL, HAUTEUR_REEL, type PlancheVideo,
} from '../src/lib/marketing/video';

const PLANCHES: PlancheVideo[] = [
  { cheminImage: '/tmp/a.png', secondes: 3 },
  { cheminImage: '/tmp/b.png', secondes: 6 },
  { cheminImage: '/tmp/c.png', secondes: 14 },
  { cheminImage: '/tmp/d.png', secondes: 5 },
];

describe('liste concat', () => {
  it('déclare chaque planche avec sa durée, dans l’ordre', () => {
    const liste = construireListeConcat(PLANCHES);
    expect(liste).toBe(
      "file '/tmp/a.png'\nduration 3\n"
      + "file '/tmp/b.png'\nduration 6\n"
      + "file '/tmp/c.png'\nduration 14\n"
      + "file '/tmp/d.png'\nduration 5\n"
      + "file '/tmp/d.png'\n",
    );
  });

  it('répète la dernière planche sans durée, comme l’exige le démultiplexeur concat', () => {
    const lignes = construireListeConcat(PLANCHES).trim().split('\n');
    expect(lignes.at(-1)).toBe("file '/tmp/d.png'");
    expect(lignes.at(-2)).toBe('duration 5');
  });

  it('échappe une apostrophe dans un chemin', () => {
    const liste = construireListeConcat([{ cheminImage: "/tmp/l'accroche.png", secondes: 3 }]);
    expect(liste).toContain("file '/tmp/l'\\''accroche.png'");
  });

  it('ne lève pas sur une liste vide (genererVideo la refuse en amont)', () => {
    expect(() => construireListeConcat([])).not.toThrow();
    expect(construireListeConcat([]).trim()).toBe('');
  });
});

describe('durée totale', () => {
  it('additionne les secondes de chaque planche', () => {
    expect(dureeTotale(PLANCHES)).toBe(28);
  });
});

describe('arguments ffmpeg', () => {
  const args = argumentsFfmpeg('/tmp/liste.txt', '/tmp/sortie.mp4');

  it('lit la liste concat en entrée', () => {
    expect(args).toContain('/tmp/liste.txt');
    expect(args).toContain('concat');
  });

  it('ajoute une piste audio silencieuse, calée sur la durée de la vidéo', () => {
    expect(args.join(' ')).toContain('anullsrc');
    expect(args).toContain('-shortest');
  });

  it('cadre au format vertical des Reels', () => {
    const filtre = args[args.indexOf('-vf') + 1];
    expect(filtre).toContain(`scale=${LARGEUR_REEL}:${HAUTEUR_REEL}`);
    expect(filtre).toContain(`pad=${LARGEUR_REEL}:${HAUTEUR_REEL}`);
  });

  it('encode en h264/aac avec démarrage rapide', () => {
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '+faststart']));
  });

  it('écrit à l’adresse de sortie demandée', () => {
    expect(args.at(-1)).toBe('/tmp/sortie.mp4');
  });
});
