import { describe, it, expect, vi } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('server-only', () => ({}));

import {
  publierVideo, apresIssue, etatReservationExistante, DELAI_INTERRUPTION_MS,
  type Dependances, type Plateforme, type Reservation,
} from '@/lib/marketing/publication-video';
import { evaluerVideo, type LigneVideo } from '@/lib/marketing/videos';
import { heureAtteinte, heureParis, jourParis, jourSemaineParis } from '@/lib/marketing/horaire';

// 2026-11-06 à 11 h, heure de Paris (UTC+1).
const MIDI = new Date('2026-11-06T10:00:00Z');
const CONTROLES_VERTS = { ok: true, controles: ['voix', 'lecture', 'fichier', 'format', 'duree', 'sonie', 'noir'].map((nom) => ({ nom, ok: true })) };

function video(p: Partial<LigneVideo> = {}): LigneVideo {
  return { cle: '2026s45-reel-1', source: 'reel', jour: '2026-11-06', reference: '2026s45-reel-1', statut: 'prete',
    controles: CONTROLES_VERTS, chemin_video: 'x/video.mp4', chemin_affiche: 'x/affiche.jpg', erreur: null, ...p };
}

/** Faux environnement : enregistre chaque appel, publie seulement si on le lui demande. */
function faux(o: {
  autorisee?: boolean; mode?: string; heure?: number; ligne?: LigneVideo | null;
  reservation?: Reservation | (() => Promise<Reservation>); publier?: Dependances['publier'];
} = {}) {
  const appels = { publier: 0, conclure: [] as [string, boolean, string | undefined][], issue: [] as boolean[], signaler: [] as string[], aVerifier: 0, video: 0, reglages: 0 };
  const d: Dependances = {
    maintenant: MIDI,
    autorisation: async () => (o.autorisee === false ? { autorisee: false, motif: 'Publication suspendue pour toutes les plateformes.' } : { autorisee: true }),
    reglages: async () => { appels.reglages += 1; return { heure: o.heure ?? 9, mode: o.mode ?? 'automatique' }; },
    video: async () => { appels.video += 1; return o.ligne === undefined ? video() : o.ligne; },
    reserver: async () => (typeof o.reservation === 'function' ? o.reservation() : (o.reservation ?? { etat: 'reservee', id: 'pub-1' })),
    marquerAVerifier: async () => { appels.aVerifier += 1; },
    conclure: async (id, ok, _id, erreur) => { appels.conclure.push([id, ok, erreur]); },
    publier: o.publier ?? (async () => { appels.publier += 1; return { ok: true, idExterne: 'media-42' }; }),
    issue: async (_p, ok) => { appels.issue.push(ok); },
    signaler: async (cle) => { appels.signaler.push(cle); },
  };
  if (o.publier) {
    const f = o.publier;
    d.publier = async (p, l) => { appels.publier += 1; return f(p, l); };
  }
  return { d, appels };
}

describe('aucun échec ne publie', () => {
  it('vidéo refusée par ses contrôles : rien ne part, une alerte, aucun succès annoncé', async () => {
    const { d, appels } = faux({ ligne: video({ statut: 'echec', controles: { ok: false, controles: [{ nom: 'voix', ok: false, detail: '1 écart' }] } }) });
    const r = await publierVideo(d, 'k', 'instagram');
    expect(r).toMatchObject({ statut: 'bloquee', publie: false });
    expect(r.motif).toMatch(/voix/);
    expect(appels.publier).toBe(0);
    expect(appels.conclure).toEqual([]);
    expect(appels.signaler).toHaveLength(1);
  });
  it('vidéo « prete » mais avec un contrôle rouge (incohérence) : refusée', async () => {
    const ligne = video({ controles: { ok: true, controles: [{ nom: 'sonie', ok: false }] } });
    const { d, appels } = faux({ ligne });
    expect((await publierVideo(d, 'k', 'facebook')).statut).toBe('bloquee');
    expect(appels.publier).toBe(0);
  });
  it('vidéo « prete » sans fichier ou sans aucun contrôle : refusée', async () => {
    for (const ligne of [video({ chemin_video: null }), video({ controles: { ok: true, controles: [] } }), video({ controles: null })]) {
      const { d, appels } = faux({ ligne });
      expect((await publierVideo(d, 'k', 'instagram')).statut).toBe('bloquee');
      expect(appels.publier).toBe(0);
    }
  });
  it('vidéo absente ou en cours de rendu : rien ne part', async () => {
    for (const ligne of [null, video({ statut: 'a_rendre', controles: null }), video({ statut: 'en_cours', controles: null })]) {
      const { d, appels } = faux({ ligne });
      const r = await publierVideo(d, 'k', 'instagram');
      expect(r.statut).toBe('bloquee');
      expect(appels.publier).toBe(0);
    }
  });
  it('la plateforme répond « ok » sans identifiant : échec, jamais présenté comme publié', async () => {
    const { d, appels } = faux({ publier: async () => ({ ok: true }) });
    const r = await publierVideo(d, 'k', 'instagram');
    expect(r).toMatchObject({ statut: 'echec', publie: false });
    expect(appels.conclure[0][1]).toBe(false);
    expect(appels.issue).toEqual([false]);
  });
  it('la plateforme refuse ou lève une exception : échec consigné, alerte, compteur', async () => {
    for (const publier of [async () => ({ ok: false, erreur: '(#100) refus' }), async () => { throw new Error('réseau coupé'); }]) {
      const { d, appels } = faux({ publier: publier as Dependances['publier'] });
      const r = await publierVideo(d, 'k', 'facebook');
      expect(r).toMatchObject({ statut: 'echec', publie: false });
      expect(appels.conclure[0][1]).toBe(false);
      expect(appels.issue).toEqual([false]);
      expect(appels.signaler.length).toBe(1);
    }
  });
  it('réservation impossible (base indisponible) : rien ne part', async () => {
    const { d, appels } = faux({ reservation: async () => { throw new Error('Contenu introuvable en base.'); } });
    expect((await publierVideo(d, 'k', 'instagram')).statut).toBe('echec');
    expect(appels.publier).toBe(0);
  });
  it('seule une publication confirmée par un identifiant est un succès', async () => {
    const { d, appels } = faux();
    const r = await publierVideo(d, 'k', 'instagram');
    expect(r).toMatchObject({ statut: 'publiee', publie: true, idExterne: 'media-42' });
    expect(appels.conclure).toEqual([['pub-1', true, undefined]]);
    expect(appels.issue).toEqual([true]);
  });
});

describe('arrêt d’urgence et calendrier', () => {
  it('suspendu : on ne lit même pas la vidéo', async () => {
    const { d, appels } = faux({ autorisee: false });
    const r = await publierVideo(d, 'k', 'instagram');
    expect(r.statut).toBe('suspendu');
    expect(appels.video + appels.publier).toBe(0);
  });
  it('mode validation : aucune publication automatique', async () => {
    const { d, appels } = faux({ mode: 'validation' });
    expect((await publierVideo(d, 'k', 'instagram')).statut).toBe('suspendu');
    expect(appels.publier).toBe(0);
  });
  it('avant l’heure réglée : attente ; « Republier » ignore l’heure mais pas les contrôles', async () => {
    const { d, appels } = faux({ heure: 18 });
    expect((await publierVideo(d, 'k', 'instagram')).statut).toBe('attente');
    expect(appels.publier).toBe(0);
    const refus = faux({ heure: 18, ligne: video({ statut: 'echec', controles: { ok: false, controles: [{ nom: 'noir', ok: false }] } }) });
    expect((await publierVideo(refus.d, 'k', 'instagram', { ignorerHeure: true })).statut).toBe('bloquee');
    expect(refus.appels.publier).toBe(0);
    const force = faux({ heure: 18 });
    expect((await publierVideo(force.d, 'k', 'instagram', { ignorerHeure: true })).statut).toBe('publiee');
  });
  it('vidéo prévue un jour suivant : jamais publiée en avance', async () => {
    const { d, appels } = faux({ ligne: video({ jour: '2026-11-07' }) });
    expect((await publierVideo(d, 'k', 'instagram')).statut).toBe('attente');
    expect(appels.publier).toBe(0);
  });
  it('l’heure est celle de Paris, heure d’été comprise', () => {
    expect(heureParis(new Date('2026-11-06T10:00:00Z'))).toBe(11);
    expect(heureParis(new Date('2026-07-06T10:00:00Z'))).toBe(12);
    expect(heureAtteinte(11, new Date('2026-11-06T10:00:00Z'))).toBe(true);
    expect(heureAtteinte(12, new Date('2026-11-06T10:00:00Z'))).toBe(false);
    expect(jourParis(new Date('2026-11-06T23:30:00Z'))).toBe('2026-11-07');
    expect(jourSemaineParis(new Date('2026-11-09T07:00:00Z'))).toBe(1);
  });
});

describe('doublons et reprises après interruption', () => {
  it('déjà publiée : rien n’est renvoyé', async () => {
    const { d, appels } = faux({ reservation: { etat: 'deja', id: 'pub-1', idExterne: 'media-1' } });
    expect((await publierVideo(d, 'k', 'instagram')).statut).toBe('deja');
    expect(appels.publier).toBe(0);
  });
  it('une autre exécution publie en ce moment : on s’abstient', async () => {
    const { d, appels } = faux({ reservation: { etat: 'occupee', id: 'pub-1' } });
    expect((await publierVideo(d, 'k', 'instagram')).statut).toBe('occupe');
    expect(appels.publier).toBe(0);
  });
  it('exécution interrompue, issue inconnue : à vérifier, signalée, JAMAIS republiée', async () => {
    const { d, appels } = faux({ reservation: { etat: 'interrompue', id: 'pub-1' } });
    const r = await publierVideo(d, 'k', 'instagram');
    expect(r).toMatchObject({ statut: 'a_verifier', publie: false });
    expect(appels.aVerifier).toBe(1);
    expect(appels.signaler).toHaveLength(1);
    expect(appels.publier).toBe(0);
  });
  it('deux exécutions simultanées : une seule publication', async () => {
    let prise = false;
    const reserver = async (): Promise<Reservation> => {
      await new Promise((r) => setTimeout(r, 5));
      if (prise) return { etat: 'occupee', id: 'pub-1' };
      prise = true; return { etat: 'reservee', id: 'pub-1' };
    };
    let publications = 0;
    const publier = async () => { publications += 1; return { ok: true, idExterne: 'm' }; };
    const a = faux({ reservation: reserver, publier }), b = faux({ reservation: reserver, publier });
    const [ra, rb] = await Promise.all([publierVideo(a.d, 'k', 'instagram'), publierVideo(b.d, 'k', 'instagram')]);
    expect(publications).toBe(1);
    expect([ra.statut, rb.statut].sort()).toEqual(['occupe', 'publiee']);
  });
  it('lecture d’une réservation existante', () => {
    const t = new Date('2026-11-06T10:00:00Z');
    expect(etatReservationExistante('publiee', null, t)).toBe('deja');
    expect(etatReservationExistante('a_verifier', null, t)).toBe('interrompue');
    expect(etatReservationExistante('envoyee', new Date(t.getTime() - 60_000).toISOString(), t)).toBe('occupee');
    expect(etatReservationExistante('envoyee', new Date(t.getTime() - DELAI_INTERRUPTION_MS - 1).toISOString(), t)).toBe('interrompue');
    expect(etatReservationExistante('envoyee', null, t)).toBe('interrompue');
    expect(etatReservationExistante('echec', null, t)).toBe('reprendre');
  });
});

describe('suspension automatique', () => {
  it('suspend au deuxième échec consécutif, un succès remet à zéro', () => {
    expect(apresIssue(0, false)).toEqual({ echecs: 1, suspendre: false });
    expect(apresIssue(1, false)).toEqual({ echecs: 2, suspendre: true });
    expect(apresIssue(1, true)).toEqual({ echecs: 0, suspendre: false });
  });
  it('TikTok reste bloqué sans rien tenter, sans gêner les autres plateformes', async () => {
    const appels: Plateforme[] = [];
    const base = faux();
    const d: Dependances = { ...base.d, autorisation: async (p) => (p === 'tiktok' ? { autorisee: false, motif: 'Bloqué : TikTok exige un geste humain.' } : { autorisee: true }),
      publier: async (p) => { appels.push(p); return { ok: true, idExterne: 'id' }; } };
    const rt = await publierVideo(d, 'k', 'tiktok');
    const ri = await publierVideo(d, 'k', 'instagram');
    expect(rt).toMatchObject({ statut: 'suspendu', publie: false });
    expect(rt.motif).toMatch(/TikTok/);
    expect(ri.statut).toBe('publiee');
    expect(appels).toEqual(['instagram']);
  });
});

describe('état d’une vidéo', () => {
  it('ne déclare publiable qu’une vidéo prête, avec tous ses contrôles verts et son fichier', () => {
    expect(evaluerVideo(video()).ok).toBe(true);
    expect(evaluerVideo(null)).toMatchObject({ ok: false, code: 'absente' });
    expect(evaluerVideo(video({ statut: 'echec' }))).toMatchObject({ ok: false, code: 'refusee' });
    expect(evaluerVideo(video({ controles: { ok: false, controles: CONTROLES_VERTS.controles } }))).toMatchObject({ ok: false, code: 'incoherente' });
  });
});

// ---------- Contrôles bloquants réels (ffmpeg + controles.py) ----------
const ffmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('python3', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe.skipIf(!ffmpeg)('controles.py sur de vrais fichiers', { timeout: 120_000 }, () => {
  const CONTROLES = path.resolve('video-gabarit/controles.py');
  const preparer = (filtreVideo: string, filtreAudio: string, duree: number, taille = '1080x1920') => {
    const d = mkdtempSync(path.join(tmpdir(), 'controles-'));
    mkdirSync(path.join(d, 'out'));
    const sep = filtreVideo.includes('=') ? ':' : '=';
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `${filtreVideo}${sep}s=${taille}:r=24:d=${duree}`,
      '-f', 'lavfi', '-t', String(duree), '-i', filtreAudio, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
      path.join(d, 'video.mp4')]);
    writeFileSync(path.join(d, 'affiche.jpg'), 'x'); writeFileSync(path.join(d, 'sous-titres.srt'), '1\n00:00:00,000 --> 00:00:01,000\nx\n');
    writeFileSync(path.join(d, 'out', 'asr-final.log'), 'mismatches: 0 (lang=fr, model=small)\n');
    writeFileSync(path.join(d, 'out', 'readcheck.ok'), 'ok');
    return d;
  };
  const lancer = (d: string, voix = '1') => {
    const r = spawnSync('python3', [CONTROLES, d, '--voix', voix], { encoding: 'utf8', timeout: 120_000 });
    const c = JSON.parse(readFileSync(path.join(d, 'controles.json'), 'utf8')) as { ok: boolean; controles: { nom: string; ok: boolean }[] };
    rmSync(d, { recursive: true, force: true });
    return { code: r.status, c, ko: c.controles.filter((x) => !x.ok).map((x) => x.nom).sort() };
  };

  it('vidéo noire, silencieuse et trop courte : refusée sur l’image, le son et la durée', () => {
    const { code, c, ko } = lancer(preparer('color=c=black', 'anullsrc=r=44100:cl=stereo', 5));
    expect(code).toBe(1); expect(c.ok).toBe(false);
    expect(ko).toEqual(expect.arrayContaining(['duree', 'noir', 'sonie']));
  });
  it('mauvais format (paysage) : refusée', () => {
    const { ko } = lancer(preparer('color=c=0x4E6381', 'sine=f=440:r=44100', 21, '1920x1080'));
    expect(ko).toContain('format');
  });
  it('voix non vérifiée : refusée même si l’image est parfaite', () => {
    const { ko } = lancer(preparer('color=c=0x4E6381', 'sine=f=440:r=44100', 21), '0');
    expect(ko).toContain('voix');
  });
  it('fichier vidéo absent : tous les contrôles de fichier échouent', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'controles-')); mkdirSync(path.join(d, 'out'));
    const { code, ko } = lancer(d);
    expect(code).toBe(1);
    expect(ko).toEqual(expect.arrayContaining(['fichier', 'format', 'duree', 'sonie', 'noir', 'voix', 'lecture']));
    expect(existsSync(d)).toBe(false);
    expect(readdirSync(tmpdir()).length).toBeGreaterThan(0);
  });
});
