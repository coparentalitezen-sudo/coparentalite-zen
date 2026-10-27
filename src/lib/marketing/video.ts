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
 * compte. On assemble ici les planches en une vidéo verticale animée, avec un
 * fondu par le blanc entre chacune et une musique composée sur place.
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

/** Couleur de la barre de progression : le corail de la charte. */
const COULEUR_PROGRESSION = '0xA85548';
const EPAISSEUR_PROGRESSION = 12;

/** Entrée du texte : début et durée du glissement, amplitude en pixels. */
const ENTREE_DEBUT = 0.15;
const ENTREE_DUREE = 0.5;
const ENTREE_AMPLITUDE = 70;

/**
 * Une planche à monter : une image entière, ou deux calques (fond, texte)
 * pour que le texte entre en mouvement par-dessus un fond immobile.
 */
export type ImagePlanche = string | { fond: string; texte: string };

/**
 * Arguments ffmpeg pour fabriquer le segment d'une planche.
 *
 * Chaque planche est encodée seule, puis les segments sont mis bout à bout
 * sans réencodage. Un seul graphe pour toutes les planches (fondus enchaînés)
 * gardait toutes les images en mémoire en même temps : près de 1 Go pour un
 * Short, et la fonction Vercel s'arrêtait faute de mémoire. Planche par
 * planche, avec deux fils d'encodage, on reste autour de 120 Mo.
 *
 * Animation : avec deux calques, le texte glisse vers le haut en apparaissant
 * (départ rapide, arrivée amortie). Dans tous les cas, une barre corail en
 * bas de l'image avance d'un bout à l'autre de la vidéo : chaque segment
 * connaît sa place, la barre reprend là où le précédent l'avait laissée.
 *
 * Isolé et pur pour pouvoir être vérifié sans lancer ffmpeg. La planche est
 * mise à l'échelle et centrée sur fond blanc plutôt que déformée ; une piste
 * audio muette sert de gabarit, remplacée par la musique à l'assemblage.
 */
export function argumentsPlanche(
  image: ImagePlanche,
  sortie: string,
  position: { index: number; total: number },
): string[] {
  const premiere = position.index === 0;
  const derniere = position.index === position.total - 1;
  const calques = typeof image !== 'string';

  const entrees = calques
    ? ['-loop', '1', '-framerate', String(IMAGES_PAR_SECONDE), '-t', String(DUREE_PLANCHE), '-i', image.fond,
      '-loop', '1', '-framerate', String(IMAGES_PAR_SECONDE), '-t', String(DUREE_PLANCHE), '-i', image.texte]
    : ['-loop', '1', '-framerate', String(IMAGES_PAR_SECONDE), '-t', String(DUREE_PLANCHE), '-i', image];
  const barre = calques ? 2 : 1;
  const silence = barre + 1;

  const filtres = [
    `[0:v]scale=${LARGEUR}:${HAUTEUR}:force_original_aspect_ratio=decrease,`
      + `pad=${LARGEUR}:${HAUTEUR}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,format=yuv420p[fond]`,
  ];
  let courant = 'fond';
  if (calques && premiere) {
    // L'accroche est visible dès la première image : YouTube s'en sert
    // souvent comme miniature, et un Short qui s'ouvre sur un écran vide
    // est passé avant d'avoir été lu.
    filtres.push(`[fond][1:v]overlay=x=0:y=0[anime]`);
    courant = 'anime';
  } else if (calques) {
    const progres = `max(0,1-(t-${ENTREE_DEBUT})/${ENTREE_DUREE})`;
    filtres.push(
      `[1:v]format=rgba,fade=t=in:st=${ENTREE_DEBUT}:d=${ENTREE_DUREE}:alpha=1[texte]`,
      `[fond][texte]overlay=x=0:y='${ENTREE_AMPLITUDE}*pow(min(1,${progres}),3)':eval=frame[anime]`,
    );
    courant = 'anime';
  }
  // La barre part de -largeur et avance de (index + t/durée)/total.
  filtres.push(
    `[${courant}][${barre}:v]overlay=x='-w+w*(${position.index}+t/${DUREE_PLANCHE})/${position.total}'`
      + `:y=H-h:eval=frame[barre]`,
  );
  const fondus = [
    premiere ? '' : `fade=t=in:st=0:d=${DUREE_FONDU}:color=white`,
    derniere ? '' : `fade=t=out:st=${(DUREE_PLANCHE - DUREE_FONDU).toFixed(2)}:d=${DUREE_FONDU}:color=white`,
  ].filter(Boolean);
  filtres.push(`[barre]format=yuv420p${fondus.length ? `,${fondus.join(',')}` : ''}[v]`);

  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...entrees,
    '-f', 'lavfi', '-i',
    `color=c=${COULEUR_PROGRESSION}:s=${LARGEUR}x${EPAISSEUR_PROGRESSION}:r=${IMAGES_PAR_SECONDE}:d=${DUREE_PLANCHE}`,
    '-f', 'lavfi', '-t', String(DUREE_PLANCHE), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', filtres.join(';'),
    '-map', '[v]', '-map', `${silence}:a`,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-crf', '23', '-r', String(IMAGES_PAR_SECONDE), '-threads', '2', '-x264-params', 'rc-lookahead=10',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', String(DUREE_PLANCHE), sortie,
  ];
}

// ---------------- Musique ----------------

/**
 * Grilles d'accords (fondamentale, tierce, quinte, en hertz), une par
 * ambiance. La musique est composée ici, note par note : aucun morceau
 * extérieur, donc aucun droit à céder ni réclamation Content ID possible.
 */
const GRILLES: number[][][] = [
  // Do – Sol – La mineur – Fa : posée, rassurante.
  [[261.63, 329.63, 392.0], [196.0, 246.94, 293.66], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63]],
  // La mineur – Fa – Do – Sol : plus douce, un peu mélancolique.
  [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]],
  // Ré – La – Si mineur – Sol : plus lumineuse.
  [[293.66, 369.99, 440.0], [220.0, 277.18, 329.63], [246.94, 293.66, 369.99], [196.0, 246.94, 293.66]],
];

/** Nombre d'ambiances musicales disponibles. */
export const AMBIANCES = GRILLES.length;

/** Choisit, parmi quatre valeurs, celle de l'accord en cours. */
function selon(valeurs: number[], indice: string): string {
  return valeurs.reduceRight((suite, v, i) =>
    (i === valeurs.length - 1 ? String(v) : `if(eq(${indice},${i}),${v},${suite})`), '');
}

/**
 * Expression aevalsrc de la musique : une nappe d'accords qui change avec
 * chaque planche, une basse, et un arpège léger. Chaque note a une attaque
 * et une extinction douces pour éviter les claquements entre deux accords.
 */
export function expressionMusique(ambiance: number): string {
  const grille = GRILLES[((Math.trunc(ambiance) % AMBIANCES) + AMBIANCES) % AMBIANCES];
  const d = DUREE_PLANCHE;
  const k = `mod(floor(t/${d}),4)`;
  const f = (n: number) => selon(grille.map((a) => a[n]), k);
  const u = `mod(t,${d})`;
  const enveloppe = `min(1,${u}/0.6)*min(1,(${d}-${u})/0.9)`;
  const nappe = `(0.11*sin(2*PI*${f(0)}*t)+0.09*sin(2*PI*${f(1)}*t)+0.09*sin(2*PI*${f(2)}*t)`
    + `+0.03*sin(2*PI*2*${f(0)}*t))*${enveloppe}`;
  const basse = `0.14*sin(PI*${f(0)}*t)*${enveloppe}`;
  // Arpège : huit notes par accord, fondamentale-tierce-quinte-octave.
  const pas = d / 8;
  const v = `mod(t,${pas})`;
  const rang = `mod(floor(t/${pas}),4)`;
  const note = `if(eq(${rang},0),${f(0)},if(eq(${rang},1),${f(1)},if(eq(${rang},2),${f(2)},2*${f(0)})))`;
  const arpege = `0.06*sin(4*PI*${note}*t)*min(1,${v}/0.01)*exp(-5*${v})`;
  return `${nappe}+${basse}+${arpege}`;
}

/**
 * Arguments ffmpeg de l'assemblage final : les segments bout à bout, l'image
 * recopiée sans réencodage, la piste muette remplacée par la musique.
 */
export function argumentsConcatenation(
  liste: string,
  sortie: string,
  musique: { duree: number; ambiance: number },
): string[] {
  const expression = expressionMusique(musique.ambiance);
  const fin = Math.max(0, musique.duree - 1.5).toFixed(2);
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', liste,
    '-f', 'lavfi', '-i',
    `aevalsrc='${expression}|${expression}':s=44100:d=${musique.duree.toFixed(2)}`,
    '-filter_complex',
    `[1:a]aecho=0.8:0.6:90:0.25,lowpass=f=5000,volume=1.6,`
      + `afade=t=in:st=0:d=1,afade=t=out:st=${fin}:d=1.5[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-shortest', '-movflags', '+faststart', sortie,
  ];
}

/** Durée de la vidéo produite pour un nombre de planches, en secondes. */
export function dureeVideo(planches: number): number {
  return DUREE_PLANCHE * planches;
}

/** Une planche reçue en mémoire : image entière, ou ses deux calques. */
export type PlancheRendue = ArrayBuffer | { fond: ArrayBuffer; texte: ArrayBuffer };

/**
 * Assemble des planches en vidéo MP4 animée, avec musique. Renvoie le fichier.
 *
 * `ambiance` choisit la grille d'accords : la faire varier d'une vidéo à
 * l'autre évite d'entendre deux fois de suite la même musique.
 */
export async function assemblerVideo(planches: PlancheRendue[], ambiance = 0): Promise<Buffer> {
  if (!cheminFfmpeg) throw new Error('ffmpeg indisponible sur ce serveur.');
  if (planches.length === 0) throw new Error('Aucune planche à assembler.');

  const dossier = await mkdtemp(path.join(tmpdir(), 'reel-'));
  try {
    const segments: string[] = [];
    // Une planche après l'autre : jamais deux encodages en mémoire à la fois.
    for (const [i, planche] of planches.entries()) {
      const ecrire = async (nom: string, donnees: ArrayBuffer) => {
        const fichier = path.join(dossier, nom);
        await writeFile(fichier, Buffer.from(donnees));
        return fichier;
      };
      const image: ImagePlanche = 'fond' in planche
        ? { fond: await ecrire(`fond-${i}.png`, planche.fond), texte: await ecrire(`texte-${i}.png`, planche.texte) }
        : await ecrire(`planche-${i}.png`, planche);
      const segment = path.join(dossier, `segment-${i}.mp4`);
      await executer(cheminFfmpeg, argumentsPlanche(image, segment, { index: i, total: planches.length }),
        { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
      segments.push(segment);
    }
    const liste = path.join(dossier, 'segments.txt');
    await writeFile(liste, segments.map((f) => `file '${f}'`).join('\n'));
    const sortie = path.join(dossier, 'reel.mp4');
    await executer(cheminFfmpeg, argumentsConcatenation(liste, sortie, {
      duree: dureeVideo(planches.length), ambiance,
    }), { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
    return await readFile(sortie);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

/** Ambiance musicale stable pour une référence : la même vidéo garde sa musique. */
export function ambianceDe(reference: string): number {
  let somme = 0;
  for (const c of reference) somme = (somme * 31 + c.charCodeAt(0)) % 9973;
  return somme % AMBIANCES;
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
    const video = await assemblerVideo(await fabriquer(), ambianceDe(reference));
    const { error } = await seau.upload(nom, video, {
      contentType: 'video/mp4', upsert: true,
    });
    if (error) return { ok: false, erreur: `Dépôt de la vidéo : ${error.message}` };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, erreur: `Fabrication de la vidéo : ${(e as Error).message}` };
  }
}
