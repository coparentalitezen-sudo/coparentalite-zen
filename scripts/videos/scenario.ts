/**
 * Écrit le scénario d'une vidéo et ses lignes de voix dans un dossier de rendu.
 *
 *   npx tsx scripts/videos/scenario.ts <dossier> youtube <AAAA-MM-JJ>
 *   npx tsx scripts/videos/scenario.ts <dossier> niche <niche> <accroche> <reference>
 *
 * Sorties : <dossier>/scenario.json et <dossier>/lines.json (format Lemo-Opuscar).
 * Lancé avec NODE_OPTIONS=--conditions=react-server (les modules marketing importent « server-only »).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lignesVoix, scenarioVideo, sujetDeNiche, type ScenarioVideo } from '@/lib/marketing/scenario-video';
import { shortDuJour } from '@/lib/youtube/short';

export function scenarioYoutube(jour: string): ScenarioVideo {
  const s = shortDuJour(jour);
  return scenarioVideo(s.sujet, s.accroche, `yt-${jour}`);
}

export function ecrireDossier(dossier: string, s: ScenarioVideo, voix = process.env.VOIX_EDGE || 'fr-FR-DeniseNeural') {
  mkdirSync(dossier, { recursive: true });
  writeFileSync(path.join(dossier, 'scenario.json'), JSON.stringify(s, null, 1));
  const lignes = lignesVoix(s, voix).map((l, i) => ({ ...l, text: s.lignes[i].texte, say: s.lignes[i].voix }));
  writeFileSync(path.join(dossier, 'lines.json'), JSON.stringify(lignes, null, 1));
}

if (process.argv[1]?.endsWith('scenario.ts')) {
  const [dossier, mode, ...reste] = process.argv.slice(2);
  let s: ScenarioVideo;
  if (mode === 'youtube') s = scenarioYoutube(reste[0]);
  else if (mode === 'niche') {
    const sujet = sujetDeNiche(reste[0]);
    if (!sujet) throw new Error(`Niche inconnue : ${reste[0]}`);
    s = scenarioVideo(sujet, reste[1], reste[2]);
  } else throw new Error('Mode attendu : youtube ou niche.');
  ecrireDossier(dossier, s);
  console.log(JSON.stringify({ reference: s.reference, niche: s.niche, lignes: s.lignes.map((l) => l.texte) }, null, 1));
}
