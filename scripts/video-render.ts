/**
 * Rendu des vidéos de Reels — GitHub Actions, pas Vercel.
 *
 * ffmpeg encode une vidéo bien au-delà des dix secondes que l'offre Hobby de
 * Vercel accorde à une route (AGENTS.md, « Tâches planifiées ») ; un runner
 * GitHub Actions n'a pas cette limite. D'où ce script, lancé par
 * .github/workflows/video-marketing.yml plutôt que par un cron Vercel.
 *
 * Pour chaque Reel de la semaine (CADENCE dans generateur.ts, trois par
 * semaine) : télécharge ses planches déjà rendues par adresse signée (comme
 * le ferait Meta), assemble le diaporama minuté (video.ts), dépose le
 * fichier dans le seau marketing-videos (migration 00054), et note son
 * chemin sur marketing_contenus (migration 00055). publication.ts n'a plus
 * ensuite qu'à le relire.
 *
 * Un Reel déjà rendu (video_chemin non nul) n'est pas rendu une seconde fois
 * : les planches d'une semaine passée ne changent jamais (genererSemaine est
 * déterministe), retraiter ne ferait que payer du calcul pour rien.
 *
 * L'échec d'un Reel n'interrompt pas les autres : trois Reels indépendants,
 * un défaut d'affichage sur l'un ne doit pas priver les deux autres de leur
 * vidéo.
 */

try {
  process.loadEnvFile('.env.local');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { genererSemaine } from '../src/lib/marketing/generateur';
import { genererVideo, dureeTotale } from '../src/lib/marketing/video';
import { telechargerPlanchesReel } from './video-partage';
// Chemin direct vers supabaseService(), jamais via depot.ts : depot.ts porte
// 'server-only', qui lève une exception dès son chargement en dehors de
// Next.js — y compris sous tsx. Même raisonnement que redacteur-test.ts.
import { supabaseService } from '../src/lib/supabase/server';

const SEAU = 'marketing-videos';

async function dejaRendue(reference: string): Promise<boolean> {
  const service = supabaseService();
  if (!service) return false;
  const { data } = await service.from('marketing_contenus')
    .select('video_chemin').eq('reference', reference).maybeSingle();
  return Boolean(data?.video_chemin);
}

async function rendreEtDeposer(base: string, reference: string, dossier: string): Promise<void> {
  const contenu = genererSemaine(new Date(), base).find((c) => c.reference === reference);
  if (!contenu) throw new Error('Contenu introuvable dans la semaine en cours.');

  const planches = await telechargerPlanchesReel(contenu, base, dossier);
  const cheminLocal = join(dossier, `${reference}.mp4`);

  console.log(`  planches : ${planches.length}, durée : ${dureeTotale(planches)} s`);
  const rendu = await genererVideo(planches, cheminLocal);
  if (!rendu.ok) throw new Error(`ffmpeg : ${rendu.erreur}`);

  const service = supabaseService();
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente : dépôt impossible.');

  const { readFile } = await import('node:fs/promises');
  const octets = await readFile(cheminLocal);
  const cheminSeau = `${reference}.mp4`;

  const { error: erreurDepot } = await service.storage.from(SEAU)
    .upload(cheminSeau, octets, { contentType: 'video/mp4', upsert: true });
  if (erreurDepot) throw new Error(`Dépôt dans le seau : ${erreurDepot.message}`);

  const { error: erreurEcriture } = await service.from('marketing_contenus')
    .update({ video_chemin: cheminSeau, video_rendue_le: new Date().toISOString() })
    .eq('reference', reference);
  if (erreurEcriture) throw new Error(`Écriture en base : ${erreurEcriture.message}`);
}

async function main() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://coparentalitezen.fr';
  const reels = genererSemaine(new Date(), base).filter((c) => c.format === 'reel');

  console.log(`Rendu vidéo — ${reels.length} Reel(s) cette semaine.\n`);

  let rendus = 0;
  let echecs = 0;

  for (const contenu of reels) {
    console.log(`── ${contenu.reference} ${'─'.repeat(20)}`);

    if (await dejaRendue(contenu.reference)) {
      console.log('  déjà rendue, ignorée.\n');
      continue;
    }

    const dossier = await mkdtemp(join(tmpdir(), 'video-render-'));
    try {
      await rendreEtDeposer(base, contenu.reference, dossier);
      console.log('  déposée dans le seau marketing-videos.\n');
      rendus += 1;
    } catch (e) {
      console.error(`  échec : ${e instanceof Error ? e.message : String(e)}\n`);
      echecs += 1;
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  }

  console.log(`Terminé — ${rendus} rendue(s), ${echecs} échec(s).`);
  if (echecs > 0 && rendus === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Échec du script :', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
