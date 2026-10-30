// Contrôle après « next build » : le filtre ffmpeg compilé doit être intact.
//
// Incident du 30/10/2026 : le minifieur (SWC) avait fusionné deux gabarits de
// chaîne et supprimé « :force_original_aspect_ratio=decrease, ». Le code source
// et ses tests étaient justes, seul le code de production était faux : aucun
// Short ne pouvait être monté. Ce contrôle lit le code réellement déployé et
// fait échouer le build plutôt que de laisser partir une vidéo impossible.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const racine = '.next/server';
const attendu = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:';
const casse = /scale=\d+:\d+pad=/;

let trouve = false;
const fautifs = [];
const parcourir = (dossier) => {
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) { parcourir(chemin); continue; }
    if (!nom.endsWith('.js')) continue;
    const code = readFileSync(chemin, 'utf8');
    if (code.includes(attendu)) trouve = true;
    if (casse.test(code)) fautifs.push(chemin);
  }
};
parcourir(racine);

if (fautifs.length || !trouve) {
  console.error('✗ Filtre ffmpeg altéré dans le build :', fautifs.length ? fautifs.join(', ') : 'filtre attendu introuvable');
  process.exit(1);
}
console.log('✓ Filtre ffmpeg intact dans le build.');
