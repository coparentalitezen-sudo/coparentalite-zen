import 'server-only';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import cheminFfmpeg from 'ffmpeg-static';
import { supabaseService } from '@/lib/supabase/server';

/**
 * Fabrication des vidéos « réel ».
 *
 * Les contenus de format reel n'étaient que des planches fixes : Instagram et
 * Facebook ne pouvaient donc les recevoir qu'en carrousel, alors que le réel
 * est le format le plus montré aux personnes qui ne suivent pas encore le
 * compte. On assemble ici les planches en une vidéo verticale, avec un fondu
 * par le blanc entre chacune.
 *
 * La vidéo est déposée dans un espace de stockage public : Meta ne reçoit pas
 * de fichier, il vient le chercher à une adresse. Elle y reste, rangée sous la
 * référence du contenu, pour qu'une nouvelle tentative réutilise la même
 * vidéo au lieu d'en refabriquer une.
 */

const executer = promisify(execFile);

/** Espace de stockage public des vidéos. */
export const SEAU_REELS = 'reels';

/** Durée d'affichage de chaque planche, fondus compris, en secondes. */
export const DUREE_PLANCHE = 3.5;

/** Durée du fondu par le blanc entre deux planches, en secondes. */
export const DUREE_FONDU = 0.3;

const LARGEUR = 1080;
const HAUTEUR = 1920;
const IMAGES_PAR_SECONDE = 30;

/**
 * Arguments ffmpeg pour fabriquer le segment d'une planche.
 *
 * Chaque planche est encodée seule, puis les segments sont mis bout à bout
 * sans réencodage. Un seul graphe pour toutes les planches (fondus enchaînés)
 * gardait toutes les images en mémoire en même temps : près de 1 Go pour un
 * Short, et la fonction Vercel s'arrêtait faute de mémoire. Planche par
 * planche, avec deux fils d'encodage, on reste autour de 120 Mo.
 *
 * Isolé et pur pour pouvoir être vérifié sans lancer ffmpeg. La planche est
 * mise à l'échelle et centrée sur fond blanc plutôt que déformée ; une piste
 * audio muette est ajoutée, car certaines vérifications de Meta refusent une
 * vidéo sans piste son, sans le dire clairement.
 */
export function argumentsPlanche(
  image: string,
  sortie: string,
  position: { premiere: boolean; derniere: boolean },
): string[] {
  const fondus = [
    position.premiere ? '' : `,fade=t=in:st=0:d=${DUREE_FONDU}:color=white`,
    position.derniere ? ''
      : `,fade=t=out:st=${(DUREE_PLANCHE - DUREE_FONDU).toFixed(2)}:d=${DUREE_FONDU}:color=white`,
  ].join('');
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-framerate', String(IMAGES_PAR_SECONDE), '-t', String(DUREE_PLANCHE), '-i', image,
    '-f', 'lavfi', '-t', String(DUREE_PLANCHE), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex',
    `[0:v]scale=${LARGEUR}:${HAUTEUR}:force_original_aspect_ratio=decrease,`
      + `pad=${LARGEUR}:${HAUTEUR}:(ow-iw)/2:(oh-ih)/2:color=white,`
      + `setsar=1,format=yuv420p${fondus}[v]`,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-crf', '23', '-r', String(IMAGES_PAR_SECONDE), '-threads', '2', '-x264-params', 'rc-lookahead=10',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest', sortie,
  ];
}

/** Arguments ffmpeg pour mettre les segments bout à bout, sans réencodage. */
export function argumentsConcatenation(liste: string, sortie: string): string[] {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', liste,
    '-c', 'copy', '-movflags', '+faststart', sortie,
  ];
}

/** Durée de la vidéo produite pour un nombre de planches, en secondes. */
export function dureeVideo(planches: number): number {
  return DUREE_PLANCHE * planches;
}

/** Assemble des images PNG en vidéo MP4. Renvoie le fichier. */
export async function assemblerVideo(images: ArrayBuffer[]): Promise<Buffer> {
  if (!cheminFfmpeg) throw new Error('ffmpeg indisponible sur ce serveur.');
  if (images.length === 0) throw new Error('Aucune planche à assembler.');

  const dossier = await mkdtemp(path.join(tmpdir(), 'reel-'));
  try {
    const segments: string[] = [];
    // Une planche après l'autre : jamais deux encodages en mémoire à la fois.
    for (const [i, image] of images.entries()) {
      const fichier = path.join(dossier, `planche-${i}.png`);
      const segment = path.join(dossier, `segment-${i}.mp4`);
      await writeFile(fichier, Buffer.from(image));
      await executer(cheminFfmpeg, argumentsPlanche(fichier, segment, {
        premiere: i === 0, derniere: i === images.length - 1,
      }), { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
      segments.push(segment);
    }
    const liste = path.join(dossier, 'segments.txt');
    await writeFile(liste, segments.map((f) => `file '${f}'`).join('\n'));
    const sortie = path.join(dossier, 'reel.mp4');
    await executer(cheminFfmpeg, argumentsConcatenation(liste, sortie), {
      timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    });
    return await readFile(sortie);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

/** Nom du fichier d'une référence dans l'espace de stockage. */
export function nomVideo(reference: string): string {
  return `${reference.replace(/[^a-z0-9-]/gi, '')}.mp4`;
}

/**
 * Adresse publique de la vidéo d'une référence, fabriquée au besoin.
 *
 * `fabriquer` n'est appelé que si la vidéo n'existe pas encore : le rendu des
 * planches est la partie coûteuse, inutile de la refaire à chaque tentative.
 */
export async function videoPublique(
  reference: string,
  fabriquer: () => Promise<ArrayBuffer[]>,
): Promise<{ ok: true; url: string } | { ok: false; erreur: string }> {
  const service = supabaseService();
  if (!service) return { ok: false, erreur: 'Stockage indisponible.' };

  // Crée l'espace public s'il n'existe pas ; l'erreur « existe déjà » est
  // attendue à chaque appel sauf le premier.
  await service.storage.createBucket(SEAU_REELS, { public: true }).catch(() => undefined);

  const nom = nomVideo(reference);
  const seau = service.storage.from(SEAU_REELS);
  const url = seau.getPublicUrl(nom).data.publicUrl;

  const { data: existants } = await seau.list('', { search: nom });
  if (existants?.some((f) => f.name === nom)) return { ok: true, url };

  try {
    const video = await assemblerVideo(await fabriquer());
    const { error } = await seau.upload(nom, video, {
      contentType: 'video/mp4', upsert: true,
    });
    if (error) return { ok: false, erreur: `Dépôt de la vidéo : ${error.message}` };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, erreur: `Fabrication de la vidéo : ${(e as Error).message}` };
  }
}
