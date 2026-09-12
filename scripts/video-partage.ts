/**
 * Partagé entre video-render.ts (rendu réel, GitHub Actions) et
 * video-test.ts (vérification locale) : va chercher les planches vidéo déjà
 * rendues d'un Reel par leur adresse signée, les écrit sur disque, et rend
 * ce que video.ts::genererVideo attend.
 *
 * Séparé de src/lib/marketing/video.ts : ce fichier-là reste un pur habillage
 * de ffmpeg (aucun réseau), celui-ci fait le pont entre le générateur de
 * contenu et lui.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { urlPlancheVideoPublique } from '../src/lib/marketing/signature';
import { planchesVideo } from '../src/lib/marketing/video-contenu';
import type { Contenu } from '../src/lib/marketing/generateur';
import type { PlancheVideo } from '../src/lib/marketing/video';

/**
 * Télécharge les planches vidéo d'un contenu Reel et les écrit dans
 * `dossier` — /api/marketing/video-planche, pas /api/marketing/visuel-public :
 * la mise en page vidéo (une idée par planche, en très grand, sur fond
 * contrasté) n'est pas celle des visuels statiques, et une planche source
 * dépassant quinze mots en produit ici plusieurs (video-contenu.ts).
 */
export async function telechargerPlanchesReel(
  contenu: Contenu, base: string, dossier: string,
): Promise<PlancheVideo[]> {
  const planches: PlancheVideo[] = [];
  for (const [i, planche] of planchesVideo(contenu).entries()) {
    const url = urlPlancheVideoPublique(base, contenu.reference, i);
    if (!url) throw new Error('Visuel non signable : CRON_SECRET manquant.');

    const reponse = await fetch(url);
    if (!reponse.ok) {
      throw new Error(`Planche vidéo ${i} de ${contenu.reference} injoignable (${reponse.status}).`);
    }

    // /api/marketing/video-planche renvoie du JPEG, comme visuel-public
    // (route.tsx : Instagram n'accepte pas le PNG produit par ImageResponse).
    const chemin = join(dossier, `${contenu.reference}-v${i}.jpg`);
    await writeFile(chemin, Buffer.from(await reponse.arrayBuffer()));
    planches.push({ cheminImage: chemin, secondes: planche.secondes });
  }
  return planches;
}
