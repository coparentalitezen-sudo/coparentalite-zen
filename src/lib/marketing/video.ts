import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import cheminFfmpegStatique from 'ffmpeg-static';

/**
 * Vidéo d'un Reel : diaporama minuté des planches déjà rendues.
 *
 * Les Reels sont aujourd'hui publiés comme une simple image (la première
 * planche), alors que generateur.ts prévoit déjà quatre planches successives
 * avec une durée en secondes chacune (Page.secondes, « pour les Reels
 * seulement ») — accroche, problème, ce qui aide, transition. Ce module ne
 * fait que ce que cette structure appelle : un diaporama à coupe franche,
 * chaque planche tenue sa durée déclarée, sans effet ni musique.
 *
 * ffmpeg est appelé en sous-processus plutôt que via une bibliothèque
 * (fluent-ffmpeg ou autre) : une dépendance de plus pour composer une
 * quinzaine d'arguments n'en valait pas le poids, et la construction de la
 * commande se teste aussi bien nue.
 *
 * LE BINAIRE VIENT DE ffmpeg-static, PAS DU SYSTÈME
 * Un Mac Intel sans Homebrew (plus maintenu sur cette architecture) ne peut
 * plus installer ffmpeg par les moyens habituels. ffmpeg-static télécharge à
 * l'installation npm le binaire correspondant à la machine — macOS Intel et
 * Apple Silicon, Linux (dont les runners GitHub Actions), Windows — sans
 * dépendre d'un gestionnaire de paquets système. S'il ne s'est pas résolu
 * (plateforme non couverte, téléchargement bloqué), on retombe sur `ffmpeg`
 * du PATH plutôt que d'échouer d'emblée : une installation système existante
 * continue de fonctionner.
 *
 * N'importe jamais 'server-only' ni depot.ts : ce fichier tourne aussi bien
 * dans une route Next.js que dans un script tsx lancé par GitHub Actions
 * (scripts/video-render.ts, scripts/video-test.ts), où le runtime Next.js
 * n'existe pas.
 */

const CHEMIN_FFMPEG = cheminFfmpegStatique ?? 'ffmpeg';

export interface PlancheVideo {
  /**
   * Chemin absolu vers l'image déjà rendue, sur le disque local. En pratique
   * un JPEG (/api/marketing/visuel-public reconvertit depuis le PNG
   * d'ImageResponse — Instagram refuse le PNG), mais ce module ne suppose
   * aucun format précis : ffmpeg décode par contenu.
   */
  cheminImage: string;
  /** Durée d'affichage, en secondes. */
  secondes: number;
}

/** Largeur et hauteur des Reels — celles de FORMATS.vertical dans visuel.ts. */
export const LARGEUR_REEL = 1080;
export const HAUTEUR_REEL = 1920;

/**
 * Échappe un chemin pour la liste du démultiplexeur concat.
 *
 * Le format n'admet qu'une apostrophe simple comme délimiteur ; une
 * apostrophe dans le chemin lui-même doit être fermée, échappée, puis
 * rouverte — la convention documentée de ffmpeg pour ce format.
 */
function echapperCheminConcat(chemin: string): string {
  return chemin.replace(/'/g, "'\\''");
}

/**
 * Liste au format du démultiplexeur concat de ffmpeg.
 *
 * La dernière planche est répétée sans durée déclarée : la durée d'un
 * segment se déduit du début du suivant, pas d'un champ propre. Sans cette
 * répétition, la dernière planche s'affiche un instant et non le temps prévu
 * — un piège documenté du format, pas une négligence.
 */
export function construireListeConcat(planches: PlancheVideo[]): string {
  const lignes = planches.flatMap((p) => [
    `file '${echapperCheminConcat(p.cheminImage)}'`,
    `duration ${p.secondes}`,
  ]);
  const derniere = planches[planches.length - 1];
  if (derniere) lignes.push(`file '${echapperCheminConcat(derniere.cheminImage)}'`);
  return `${lignes.join('\n')}\n`;
}

/** Durée totale du diaporama, en secondes. */
export function dureeTotale(planches: PlancheVideo[]): number {
  return planches.reduce((somme, p) => somme + p.secondes, 0);
}

/**
 * Arguments de la commande ffmpeg, séparés de son exécution pour être
 * vérifiés sans qu'ffmpeg soit installé.
 *
 * Bande son : un silence, pas une absence. Un flux audio manquant est un motif
 * de rejet documenté des conteneurs Reels côté Meta ; -shortest cale sa durée
 * sur celle, réelle, de la vidéo plutôt que sur le générateur infini.
 *
 * scale + pad : les planches sortent déjà de rendreVisuel à 1080×1920
 * (FORMATS.vertical), donc sans effet ici en pratique — mais un gabarit
 * modifié un jour sans toucher à ce fichier ne produirait pas une vidéo mal
 * cadrée en silence.
 */
export function argumentsFfmpeg(cheminListe: string, cheminSortie: string): string[] {
  return [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', cheminListe,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest',
    '-vf', `scale=${LARGEUR_REEL}:${HAUTEUR_REEL}:force_original_aspect_ratio=decrease,`
      + `pad=${LARGEUR_REEL}:${HAUTEUR_REEL}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    cheminSortie,
  ];
}

export interface ResultatVideo {
  ok: boolean;
  erreur?: string;
}

/** Lance ffmpeg et attend son issue, sans jamais lever d'exception. */
function executerFfmpeg(args: string[]): Promise<ResultatVideo> {
  return new Promise((resoudre) => {
    let processus: ReturnType<typeof spawn>;
    try {
      processus = spawn(CHEMIN_FFMPEG, args);
    } catch (e) {
      resoudre({ ok: false, erreur: `ffmpeg introuvable — ${String(e)}` });
      return;
    }

    let erreurs = '';
    processus.stderr?.on('data', (d) => { erreurs += String(d); });
    processus.on('error', (e) => resoudre({ ok: false, erreur: `ffmpeg introuvable — ${String(e)}` }));
    processus.on('close', (code) => {
      if (code === 0) resoudre({ ok: true });
      else resoudre({ ok: false, erreur: erreurs.trim().slice(-500) || `ffmpeg a quitté avec le code ${code}` });
    });
  });
}

/**
 * Produit le fichier vidéo à l'adresse demandée.
 *
 * La liste concat est écrite dans un fichier temporaire propre à cet appel
 * (nommé par un uuid, pas par la référence du contenu) : deux générations
 * lancées en parallèle — le test local et un rendu réel, par exemple — ne
 * doivent jamais se marcher dessus.
 */
export async function genererVideo(
  planches: PlancheVideo[], cheminSortie: string,
): Promise<ResultatVideo> {
  if (planches.length === 0) return { ok: false, erreur: 'Aucune planche à assembler.' };

  const cheminListe = join(tmpdir(), `video-liste-${randomUUID()}.txt`);
  try {
    await writeFile(cheminListe, construireListeConcat(planches), 'utf8');
    return await executerFfmpeg(argumentsFfmpeg(cheminListe, cheminSortie));
  } finally {
    await unlink(cheminListe).catch(() => {});
  }
}
