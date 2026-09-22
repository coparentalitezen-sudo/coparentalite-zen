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
 * entre chacune.
 *
 * La vidéo est déposée dans un espace de stockage public : Meta ne reçoit pas
 * de fichier, il vient le chercher à une adresse. Elle y reste, rangée sous la
 * référence du contenu, pour qu'une nouvelle tentative réutilise la même
 * vidéo au lieu d'en refabriquer une.
 */

const executer = promisify(execFile);

/** Espace de stockage public des vidéos. */
export const SEAU_REELS = 'reels';

/** Durée d'affichage de chaque planche, fondu compris, en secondes. */
export const DUREE_PLANCHE = 4;

/** Durée du fondu entre deux planches, en secondes. */
export const DUREE_FONDU = 0.6;

const LARGEUR = 1080;
const HAUTEUR = 1920;
const IMAGES_PAR_SECONDE = 30;

/**
 * Arguments ffmpeg pour assembler des planches en vidéo.
 *
 * Isolé et pur pour pouvoir être vérifié sans lancer ffmpeg. Chaque planche
 * est mise à l'échelle et centrée sur fond blanc plutôt que déformée : une
 * planche d'une autre proportion garde son texte lisible.
 *
 * Une piste audio muette est ajoutée : certaines vérifications de Meta
 * refusent une vidéo sans piste son, sans le dire clairement.
 */
export function argumentsAssemblage(images: string[], sortie: string): string[] {
  const n = images.length;
  const entrees = images.flatMap((image) => [
    '-loop', '1', '-t', String(DUREE_PLANCHE), '-i', image,
  ]);

  const mises = images.map((_, i) =>
    `[${i}:v]scale=${LARGEUR}:${HAUTEUR}:force_original_aspect_ratio=decrease,`
    + `pad=${LARGEUR}:${HAUTEUR}:(ow-iw)/2:(oh-ih)/2:color=white,`
    + `setsar=1,fps=${IMAGES_PAR_SECONDE},format=yuv420p[p${i}]`);

  // Chaque fondu commence DUREE_FONDU avant la fin cumulée de ce qui précède.
  const fondus: string[] = [];
  let precedent = 'p0';
  for (let i = 1; i < n; i += 1) {
    const decalage = (DUREE_PLANCHE - DUREE_FONDU) * i;
    const suivant = i === n - 1 ? 'v' : `f${i}`;
    fondus.push(
      `[${precedent}][p${i}]xfade=transition=fade:duration=${DUREE_FONDU}`
      + `:offset=${decalage.toFixed(2)}[${suivant}]`);
    precedent = suivant;
  }
  const video = n === 1 ? 'p0' : 'v';

  const duree = DUREE_PLANCHE * n - DUREE_FONDU * (n - 1);

  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...entrees,
    '-f', 'lavfi', '-t', duree.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', [...mises, ...fondus].join(';'),
    '-map', `[${video}]`, '-map', `${n}:a`,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-crf', '23', '-r', String(IMAGES_PAR_SECONDE),
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest', '-movflags', '+faststart',
    sortie,
  ];
}

/** Durée de la vidéo produite pour un nombre de planches, en secondes. */
export function dureeVideo(planches: number): number {
  return DUREE_PLANCHE * planches - DUREE_FONDU * Math.max(0, planches - 1);
}

/** Assemble des images PNG en vidéo MP4. Renvoie le fichier. */
export async function assemblerVideo(images: ArrayBuffer[]): Promise<Buffer> {
  if (!cheminFfmpeg) throw new Error('ffmpeg indisponible sur ce serveur.');
  if (images.length === 0) throw new Error('Aucune planche à assembler.');

  const dossier = await mkdtemp(path.join(tmpdir(), 'reel-'));
  try {
    const fichiers: string[] = [];
    for (const [i, image] of images.entries()) {
      const fichier = path.join(dossier, `planche-${i}.png`);
      await writeFile(fichier, Buffer.from(image));
      fichiers.push(fichier);
    }
    const sortie = path.join(dossier, 'reel.mp4');
    await executer(cheminFfmpeg, argumentsAssemblage(fichiers, sortie), {
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
