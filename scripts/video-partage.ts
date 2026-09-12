/**
 * Partagé entre video-render.ts (rendu réel, GitHub Actions) et
 * video-test.ts (vérification locale) : va chercher les planches déjà
 * rendues d'un Reel par leur adresse signée, les écrit sur disque, et rend
 * ce que video.ts::genererVideo attend.
 *
 * Séparé de src/lib/marketing/video.ts : ce fichier-là reste un pur habillage
 * de ffmpeg (aucun réseau), celui-ci fait le pont entre le générateur de
 * contenu et lui.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { urlVisuelPublic } from '../src/lib/marketing/signature';
import type { Contenu } from '../src/lib/marketing/generateur';
import type { PlancheVideo } from '../src/lib/marketing/video';

/** Durée par défaut d'une planche sans Page.secondes déclaré — ne devrait pas arriver pour un Reel. */
const SECONDES_PAR_DEFAUT = 4;

/** Télécharge les planches d'un contenu Reel et les écrit dans `dossier`. */
export async function telechargerPlanchesReel(
  contenu: Contenu, base: string, dossier: string,
): Promise<PlancheVideo[]> {
  const planches: PlancheVideo[] = [];
  for (const [i, page] of contenu.pages.entries()) {
    const url = urlVisuelPublic(base, contenu.reference, i);
    if (!url) throw new Error('Visuel non signable : CRON_SECRET manquant.');

    const reponse = await fetch(url);
    if (!reponse.ok) {
      throw new Error(`Planche ${i} de ${contenu.reference} injoignable (${reponse.status}).`);
    }

    const chemin = join(dossier, `${contenu.reference}-p${i}.png`);
    await writeFile(chemin, Buffer.from(await reponse.arrayBuffer()));
    planches.push({ cheminImage: chemin, secondes: page.secondes ?? SECONDES_PAR_DEFAUT });
  }
  return planches;
}
