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
  expressionMusique, ambianceDe, AMBIANCES,
} = await import('../src/lib/marketing/video');

describe('arguments d’assemblage', () => {
  const milieu = { index: 1, total: 3 };

  it('fond par le blanc entre deux planches, jamais au début ni à la fin', () => {
    const m = argumentsPlanche('a', 'o.mp4', milieu).join(' ');
    expect(m.match(/fade=t=(in|out):st=[\d.]+:d=[\d.]+:color=white/g)).toHaveLength(2);
    const seule = argumentsPlanche('a', 'o.mp4', { index: 0, total: 1 }).join(' ');
    expect(seule).not.toContain('fade=t=');
  });

  it('fait entrer le texte en mouvement quand la planche a deux calques', () => {
    const anime = argumentsPlanche({ fond: 'f', texte: 't' }, 'o.mp4', milieu).join(' ');
    expect(anime).toContain('alpha=1');
    expect(anime).toMatch(/overlay=x=0:y='/);
    const fixe = argumentsPlanche('a', 'o.mp4', milieu).join(' ');
    expect(fixe).not.toContain('alpha=1');
    // L'accroche, elle, est là dès la première image.
    const accroche = argumentsPlanche({ fond: 'f', texte: 't' }, 'o.mp4', { index: 0, total: 3 }).join(' ');
    expect(accroche).not.toContain('alpha=1');
    expect(accroche).toContain('overlay=x=0:y=0');
  });

  it('fait avancer la barre de progression depuis la place de la planche', () => {
    const a = argumentsPlanche('a', 'o.mp4', { index: 2, total: 7 }).join(' ');
    expect(a).toContain(`(2+t/${DUREE_PLANCHE})/7`);
  });

  it('borne la mémoire de l’encodage et recopie l’image sans la réencoder', () => {
    // Un graphe unique pour toutes les planches dépassait la mémoire de Vercel.
    expect(argumentsPlanche('a', 'o.mp4', milieu)).toEqual(expect.arrayContaining(['-threads', '2']));
    expect(argumentsConcatenation('l.txt', 'o.mp4', { duree: 10, ambiance: 0 }))
      .toEqual(expect.arrayContaining(['-c:v', 'copy']));
  });

  it('compose une musique différente selon l’ambiance, et toujours valide', () => {
    const ambiances = Array.from({ length: AMBIANCES }, (_, i) => expressionMusique(i));
    expect(new Set(ambiances).size).toBe(AMBIANCES);
    // Indices négatifs ou au-delà : on retombe sur une ambiance existante.
    expect(ambiances).toContain(expressionMusique(-1));
    expect(ambiances).toContain(expressionMusique(AMBIANCES + 1));
  });

  it('garde la même musique pour une même référence', () => {
    expect(ambianceDe('2026s44-reel-1')).toBe(ambianceDe('2026s44-reel-1'));
    expect(ambianceDe('x')).toBeGreaterThanOrEqual(0);
    expect(ambianceDe('x')).toBeLessThan(AMBIANCES);
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
      // Une planche sur deux en calques, pour éprouver les deux chemins.
      const entree = i % 2 ? { fond: image, texte: image } : image;
      execFileSync(cheminFfmpeg!, argumentsPlanche(entree, segment, { index: i, total: images.length }));
      return segment;
    });
    const liste = path.join(dossier, 'segments.txt');
    writeFileSync(liste, segments.map((f) => `file '${f}'`).join('\n'));
    const sortie = path.join(dossier, 'reel.mp4');
    execFileSync(cheminFfmpeg!, argumentsConcatenation(liste, sortie, { duree: dureeVideo(4), ambiance: 1 }));
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

    // La musique est bien audible : la piste n'est pas muette.
    const volume = spawnSync(cheminFfmpeg!, ['-hide_banner', '-i', sortie, '-af', 'volumedetect', '-f', 'null', '-'])
      .stderr.toString();
    const moyenne = Number(/mean_volume: (-?[\d.]+) dB/.exec(volume)![1]);
    expect(moyenne).toBeGreaterThan(-40);
    expect(volume).not.toMatch(/max_volume: 0\.0 dB/);
  }, 60_000);
});
