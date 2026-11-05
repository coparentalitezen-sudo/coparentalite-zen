/**
 * Rendu des vidéos animées à publier dans les prochains jours (GitHub Actions).
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/videos/rendre.ts            # rendu planifié
 *   … rendre.ts --cle yt-2026-11-07                                                    # une seule vidéo
 *   … rendre.ts --essai <dossier> <AAAA-MM-JJ>                                         # sans base : rendu de test (PR)
 *
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (sauf --essai), LIB (Lemo-Opuscar),
 *             RENDU_JOURS (défaut 3), VOIX_MOTEUR (edge | kokoro).
 *
 * Ce script ne publie RIEN et ne détient aucun jeton de publication : il rend, contrôle,
 * dépose dans l'espace privé « videos » et écrit le statut. Une vidéo n'est « prete » que si
 * tous ses contrôles bloquants sont verts (la base le refuse sinon). Un échec n'empêche pas
 * les vidéos suivantes. Les journaux de ce dépôt public ne contiennent ni secret ni adresse signée.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { scenarioVideo, sujetDeNiche, type ScenarioVideo } from '@/lib/marketing/scenario-video';
import { cleYoutube, SEAU_VIDEOS } from '@/lib/marketing/videos';
import { jourParis, decalerJour } from '@/lib/marketing/horaire';
import { ecrireDossier, scenarioYoutube } from './scenario';

const RACINE = process.cwd();   // lancé depuis la racine du dépôt
const GABARIT = path.join(RACINE, 'video-gabarit');
const RENDUS = path.join(RACINE, 'rendus');
const MAX_ESSAIS_AUTO = 2;
const VERROU_MIN = 60;

/** Empreinte du gabarit : tout changement de code ou de ressource relance les rendus non publiés. */
function empreinteGabarit(): string {
  const h = createHash('sha256');
  const parcourir = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) parcourir(p); else h.update(n).update(readFileSync(p));
    }
  };
  parcourir(GABARIT);
  return h.digest('hex').slice(0, 16);
}
const empreinte = (s: ScenarioVideo, g: string) =>
  createHash('sha256').update(JSON.stringify(s)).update(g).digest('hex').slice(0, 24);

/** Rend un dossier ; renvoie le résultat des contrôles (jamais d'exception). */
function rendreDossier(dossier: string): { ok: boolean; controles: { ok: boolean; controles: { nom: string; ok: boolean; detail?: string; mesure?: unknown }[] }; journal: string } {
  const r = spawnSync('sh', [path.join(GABARIT, 'build.sh'), dossier], { encoding: 'utf8', timeout: 30 * 60_000, env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const journal = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n').filter((l) => !/^w\d+ \d+\/\d+/.test(l)).slice(-40).join('\n');
  const f = path.join(dossier, 'controles.json');
  if (existsSync(f)) {
    const c = JSON.parse(readFileSync(f, 'utf8'));
    return { ok: c.ok === true && r.status === 0, controles: c, journal };
  }
  return { ok: false, controles: { ok: false, controles: [{ nom: 'rendu', ok: false, detail: `rendu interrompu (code ${r.status ?? r.signal})` }] }, journal };
}

function resume(ligne: string) {
  console.log(ligne);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${ligne}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!process.env.LIB) throw new Error('LIB doit désigner la bibliothèque Lemo-Opuscar.');

  // Rendu d'essai, sans base ni secret (pull request) : un dossier, un jour.
  if (args[0] === '--essai') {
    const [, dossier, jour] = args;
    ecrireDossier(dossier, scenarioYoutube(jour));
    const r = rendreDossier(path.resolve(dossier));
    for (const c of r.controles.controles) resume(`${c.ok ? '✅' : '❌'} ${c.nom} ${c.mesure !== undefined ? JSON.stringify(c.mesure) : ''} ${c.detail ?? ''}`);
    if (!r.ok) { console.log(r.journal); process.exit(1); }
    return;
  }

  const url = process.env.SUPABASE_URL, cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  const db = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
  const g = empreinteGabarit();
  const aujourdhui = jourParis();
  const jours = Number(process.env.RENDU_JOURS ?? 3);
  const seule = args[0] === '--cle' ? args[1] : null;

  // 1. Ce qu'il faut publier dans les prochains jours.
  const voulues: { cle: string; source: 'youtube' | 'reel'; jour: string; scenario: ScenarioVideo }[] = [];
  for (let i = 0; i < jours; i += 1) {
    const jour = decalerJour(aujourdhui, i);
    const s = scenarioYoutube(jour);
    voulues.push({ cle: cleYoutube(jour), source: 'youtube', jour, scenario: { ...s, reference: cleYoutube(jour) } });
  }
  const { data: reels, error: eReels } = await db.from('marketing_contenus')
    .select('reference, accroche, prevu_le, statut, marketing_opportunites(niche_id)')
    .eq('format', 'reel').gte('prevu_le', aujourdhui).lte('prevu_le', decalerJour(aujourdhui, jours + 3)).neq('statut', 'rejete');
  if (eReels) throw new Error(`Lecture des Reels : ${eReels.message}`);
  for (const r of (reels ?? []) as unknown as { reference: string; accroche: string; prevu_le: string; marketing_opportunites: { niche_id: string } | null }[]) {
    const sujet = sujetDeNiche(r.marketing_opportunites?.niche_id ?? '');
    if (!sujet) { resume(`⚠️ ${r.reference} : niche inconnue, ignoré`); continue; }
    voulues.push({ cle: r.reference, source: 'reel', jour: r.prevu_le, scenario: scenarioVideo(sujet, r.accroche, r.reference) });
  }

  // 2. Lignes en base : créées, ou remises à rendre si le scénario ou le gabarit a changé et que rien n'est publié.
  for (const v of voulues) {
    if (seule && v.cle !== seule) continue;
    const e = empreinte(v.scenario, g);
    const { data: ex } = await db.from('marketing_videos').select('id, empreinte, statut').eq('cle', v.cle).maybeSingle();
    if (!ex) {
      await db.from('marketing_videos').insert({ cle: v.cle, source: v.source, jour: v.jour, reference: v.scenario.reference, scenario: v.scenario, empreinte: e });
    } else if (ex.empreinte !== e && ex.statut !== 'en_cours' && !(await dejaPubliee(db, v))) {
      await db.from('marketing_videos').update({
        scenario: v.scenario, empreinte: e, statut: 'a_rendre', tentatives: 0, controles: null,
        chemin_video: null, chemin_affiche: null, chemin_srt: null, erreur: null, updated_at: new Date().toISOString(),
      }).eq('id', ex.id);
    }
  }

  // 3. À rendre : en attente, en échec avec essais restants, ou rendu interrompu (verrou expiré).
  const maintenantIso = new Date().toISOString();
  const { data: aRendre } = await db.from('marketing_videos')
    .select('id, cle, jour, scenario, statut, tentatives, verrou_jusqua, empreinte')
    .gte('jour', aujourdhui).order('jour');
  const file = (aRendre ?? []).filter((v) => (!seule || v.cle === seule) && (
    v.statut === 'a_rendre'
    || (v.statut === 'echec' && v.tentatives < MAX_ESSAIS_AUTO)
    || (v.statut === 'en_cours' && (!v.verrou_jusqua || v.verrou_jusqua < maintenantIso))
  ));
  resume(`### Rendu des vidéos — ${file.length} à rendre (gabarit ${g})`);

  for (const v of file) {
    // Réservation conditionnelle : deux exécutions simultanées, une seule rend.
    const { data: prise } = await db.from('marketing_videos').update({
      statut: 'en_cours', tentatives: v.tentatives + 1, verrou_jusqua: new Date(Date.now() + VERROU_MIN * 60_000).toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', v.id).eq('statut', v.statut).eq('tentatives', v.tentatives).select('id');
    if (!prise?.length) { resume(`⏭️ ${v.cle} : pris par une autre exécution`); continue; }

    const dossier = path.join(RENDUS, v.cle);
    try {
      rmSync(dossier, { recursive: true, force: true }); mkdirSync(dossier, { recursive: true });
      ecrireDossier(dossier, v.scenario as ScenarioVideo);
      const r = rendreDossier(dossier);
      if (!r.ok) {
        const ko = r.controles.controles.filter((c) => !c.ok);
        const erreur = ko.map((c) => `${c.nom} : ${c.detail ?? 'échec'}`).join(' ; ').slice(0, 1000);
        await db.from('marketing_videos').update({ statut: 'echec', controles: r.controles, erreur, verrou_jusqua: null, updated_at: new Date().toISOString() }).eq('id', v.id);
        await db.from('marketing_alertes').upsert({
          cle: `rendu:${v.cle}:${v.empreinte}:${v.tentatives + 1}`, niveau: 'echec',
          sujet: `Vidéo ${v.cle} refusée par les contrôles`,
          message: `La vidéo prévue le ${v.jour} ne sera pas publiée en l’état.\n${erreur}\n${v.tentatives + 1 < MAX_ESSAIS_AUTO ? 'Un nouveau rendu sera tenté au prochain passage.' : 'Plus de nouvel essai automatique : utilisez « Re-rendre » dans l’administration.'}`,
        }, { onConflict: 'cle', ignoreDuplicates: true });
        resume(`❌ ${v.cle} (${v.jour}) : ${erreur}`);
        console.log(r.journal);
        continue;
      }
      // Dépôt d'abord, statut ensuite : une vidéo « prete » a toujours son fichier.
      const deposer = async (local: string, distant: string, type: string) => {
        const { error } = await db.storage.from(SEAU_VIDEOS).upload(distant, readFileSync(path.join(dossier, local)), { contentType: type, upsert: true });
        if (error) throw new Error(`Dépôt ${local} : ${error.message}`);
        return distant;
      };
      const base = `${v.cle}/${v.empreinte}`;
      const cheminVideo = await deposer('video.mp4', `${base}/video.mp4`, 'video/mp4');
      const cheminAffiche = await deposer('affiche.jpg', `${base}/affiche.jpg`, 'image/jpeg');
      const cheminSrt = await deposer('sous-titres.srt', `${base}/sous-titres.srt`, 'application/x-subrip');
      const duree = r.controles.controles.find((c) => c.nom === 'duree')?.mesure as number | undefined;
      const { error } = await db.from('marketing_videos').update({
        statut: 'prete', controles: r.controles, chemin_video: cheminVideo, chemin_affiche: cheminAffiche, chemin_srt: cheminSrt,
        duree: duree ?? null, taille_octets: statSync(path.join(dossier, 'video.mp4')).size, erreur: null,
        verrou_jusqua: null, rendue_le: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', v.id);
      if (error) throw new Error(`Statut : ${error.message}`);
      resume(`✅ ${v.cle} (${v.jour}) : ${duree ?? '?'} s, contrôles verts`);
    } catch (e) {
      const erreur = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await db.from('marketing_videos').update({ statut: 'echec', erreur, verrou_jusqua: null, updated_at: new Date().toISOString() }).eq('id', v.id);
      await db.from('marketing_alertes').upsert({ cle: `rendu-erreur:${v.cle}:${v.tentatives + 1}`, niveau: 'echec', sujet: `Rendu de ${v.cle} interrompu`, message: erreur }, { onConflict: 'cle', ignoreDuplicates: true });
      resume(`❌ ${v.cle} : ${erreur}`);
    }
  }
}

/** Une vidéo déjà publiée quelque part ne doit plus changer sous les yeux du public. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dejaPubliee(db: any, v: { cle: string; source: string; jour: string }): Promise<boolean> {
  if (v.source === 'youtube') {
    const { data } = await db.from('marketing_youtube_shorts').select('id').eq('cle_idempotence', `short-${v.jour}`).eq('statut', 'publiee').maybeSingle();
    return Boolean(data);
  }
  const { data } = await db.from('marketing_publications').select('id').like('cle_idempotence', `${v.cle}:%`).in('statut', ['publiee', 'envoyee', 'a_verifier']);
  return Boolean(data?.length);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
