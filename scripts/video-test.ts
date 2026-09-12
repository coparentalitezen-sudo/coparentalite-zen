/**
 * Vérification manuelle de la chaîne vidéo.
 *
 * Rend deux Reels de la semaine en cours dans ./video-test-sorties/ (ignoré
 * par Git), sans rien déposer dans le seau marketing-videos ni toucher
 * marketing_contenus : aucune écriture, uniquement pour juger le résultat à
 * l'œil avant de l'activer en production (VIDEO_ACTIF).
 *
 * N'exige pas VIDEO_ACTIF=true : ce drapeau gouverne la publication
 * automatique (non branchée avant validation), pas cette vérification.
 * Exige en revanche que le site soit accessible publiquement à
 * NEXT_PUBLIC_SITE_URL et que CRON_SECRET y corresponde — les planches sont
 * allées chercher par la même adresse signée que Meta utiliserait.
 *
 * Lancement : npm run video:test
 */

try {
  process.loadEnvFile('.env.local');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { genererSemaine } from '../src/lib/marketing/generateur';
import { genererVideo, dureeTotale } from '../src/lib/marketing/video';
import { telechargerPlanchesReel } from './video-partage';

const DOSSIER_SORTIE = join(process.cwd(), 'video-test-sorties');
const NOMBRE_A_TESTER = 2;

async function main() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const reels = genererSemaine(new Date(), base)
    .filter((c) => c.format === 'reel')
    .slice(0, NOMBRE_A_TESTER);

  if (reels.length === 0) {
    console.log('Aucun Reel dans la semaine en cours — rien à vérifier.');
    return;
  }

  await mkdir(DOSSIER_SORTIE, { recursive: true });
  console.log(`Chaîne vidéo — ${reels.length} Reel(s), sortie dans ${DOSSIER_SORTIE}\n`);

  for (const contenu of reels) {
    console.log(`── ${contenu.reference} ${'─'.repeat(20)}`);
    try {
      const planches = await telechargerPlanchesReel(contenu, base, DOSSIER_SORTIE);
      console.log(`  planches : ${planches.length}, durée : ${dureeTotale(planches)} s`);

      const cheminSortie = join(DOSSIER_SORTIE, `${contenu.reference}.mp4`);
      const rendu = await genererVideo(planches, cheminSortie);
      if (!rendu.ok) {
        console.error(`  échec ffmpeg : ${rendu.erreur}`);
        continue;
      }
      console.log(`  vidéo : ${cheminSortie}`);
    } catch (e) {
      console.error(`  échec : ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error('Échec du script :', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
