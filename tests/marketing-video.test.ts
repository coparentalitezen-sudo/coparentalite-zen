import { describe, it, expect, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import cheminFfmpeg from 'ffmpeg-static';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseService: () => null }));

const {
  argumentsPlanche, argumentsConcatenation, dureeVideo, nomVideo, DUREE_PLANCHE,
} = await import('../src/lib/marketing/video');

describe('arguments d’assemblage', () => {
  it('fond par le blanc entre deux planches, jamais au début ni à la fin', () => {
    const milieu = argumentsPlanche('a', 'o.mp4', { premiere: false, derniere: false }).join(' ');
    expect(milieu.match(/fade=t=(in|out)/g)).toHaveLength(2);
    const seule = argumentsPlanche('a', 'o.mp4', { premiere: true, derniere: true }).join(' ');
    expect(seule).not.toContain('fade=');
  });

  it('borne la mémoire de l’encodage et concatène sans réencoder', () => {
    // Un graphe unique pour toutes les planches dépassait la mémoire de Vercel.
    expect(argumentsPlanche('a', 'o.mp4', { premiere: true, derniere: false }))
      .toEqual(expect.arrayContaining(['-threads', '2']));
    expect(argumentsConcatenation('l.txt', 'o.mp4')).toEqual(expect.arrayContaining(['-c', 'copy']));
  });

  it('calcule une durée cohérente avec les planches', () => {
    expect(dureeVideo(4)).toBeCloseTo(DUREE_PLANCHE * 4);
    // Les réels doivent durer au moins 3 secondes.
    expect(dureeVideo(1)).toBeGreaterThanOrEqual(3);
  });

  it('ne laisse passer dans le nom de fichier que des caractères sûrs', () => {
    expect(nomVideo('2026s39-reel-1')).toBe('2026s39-reel-1.mp4');
    expect(nomVideo('../x/y')).toBe('xy.mp4');
  });
});

// Assemblage réel avec le binaire embarqué : vérifie que la chaîne de filtres
// est acceptée par ffmpeg et produit une vidéo lisible, pas seulement qu'elle
// a la bonne forme.
describe('assemblage réel', () => {
  it('produit une vidéo verticale avec piste son', () => {
    const dossier = mkdtempSync(path.join(tmpdir(), 'test-reel-'));
    const images = [0, 1, 2, 3].map((i) => {
      const f = path.join(dossier, `p${i}.png`);
      execFileSync(cheminFfmpeg!, ['-y', '-loglevel', 'error', '-f', 'lavfi',
        '-i', `color=c=0x${['ff0000', '00ff00', '0000ff', 'ffff00'][i]}:s=1080x1350`,
        '-frames:v', '1', f]);
      return f;
    });
    const segments = images.map((image, i) => {
      const segment = path.join(dossier, `s${i}.mp4`);
      execFileSync(cheminFfmpeg!, argumentsPlanche(image, segment, {
        premiere: i === 0, derniere: i === images.length - 1,
      }));
      return segment;
    });
    const liste = path.join(dossier, 'segments.txt');
    writeFileSync(liste, segments.map((f) => `file '${f}'`).join('\n'));
    const sortie = path.join(dossier, 'reel.mp4');
    execFileSync(cheminFfmpeg!, argumentsConcatenation(liste, sortie));
    expect(existsSync(sortie)).toBe(true);
    expect(statSync(sortie).size).toBeGreaterThan(10_000);

    // « ffmpeg -i » sans sortie décrit le fichier sur la sortie d'erreur.
    const infos = spawnSync(cheminFfmpeg!, ['-hide_banner', '-i', sortie]).stderr.toString();
    expect(infos).toContain('1080x1920');
    expect(infos).toMatch(/Video: h264/);
    expect(infos).toMatch(/Audio: aac/);
    const duree = /Duration: (\d+):(\d+):([\d.]+)/.exec(infos)!;
    const secondes = Number(duree[2]) * 60 + Number(duree[3]);
    expect(secondes).toBeCloseTo(dureeVideo(4), 0);
  }, 60_000);
});
