import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { BANQUE } from '@/lib/marketing/banque';
import { ETAPES_COURTES, LONGUEUR_MAX_ETAPE_COURTE } from '@/lib/marketing/etapes-courtes';
import {
  scenarioVideo, graineDe, enLettres, textePrononce, lignesVoix, scenarioDuContenu,
} from '@/lib/marketing/scenario-video';
import { genererSemaine } from '@/lib/marketing/generateur';
// Module JavaScript partagé avec la page de rendu.
import { minuter, ecarts, lecture, exigenceControle, DUREE_MAX, FIN, APRES, CARTE_RETARD } from '../video-gabarit/minutage.mjs';

/** Voix estimée de la synthèse « Denise » : environ 12,5 caractères par seconde (mesure prudente). */
const voixEstimee = (t: string) => [...t].length / 12.5;
const minutageDe = (s: ReturnType<typeof scenarioVideo>, debit = voixEstimee) => minuter(
  s.lignes.map((l) => ({ id: l.id, role: l.role, numero: l.numero, texte: l.texte })),
  Object.fromEntries(s.lignes.map((l) => [l.id, debit(l.voix)])),
);

describe('étapes courtes', () => {
  it('couvrent chaque sujet de la banque, trois étapes de 45 caractères au plus', () => {
    for (const s of BANQUE) {
      const e = ETAPES_COURTES[s.niche];
      expect(e, s.niche).toHaveLength(3);
      for (const x of e) expect([...x].length, x).toBeLessThanOrEqual(LONGUEUR_MAX_ETAPE_COURTE);
    }
  });
  it('n’ajoutent aucun chiffre (aucune donnée inventée)', () => {
    for (const e of Object.values(ETAPES_COURTES)) for (const x of e) expect(x).not.toMatch(/\d/);
  });
});

describe('scénario', () => {
  const sujet = BANQUE[0];
  it('est déterministe : même référence, même scénario', () => {
    const a = scenarioVideo(sujet, sujet.accroches[0], 'yt-2026-11-06');
    const b = scenarioVideo(sujet, sujet.accroches[0], 'yt-2026-11-06');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(graineDe('yt-2026-11-06')).toBe(a.graine);
    expect(scenarioVideo(sujet, sujet.accroches[0], 'yt-2026-11-07').graine).not.toBe(a.graine);
  });
  it('suit la structure accroche → 3 étapes → apport, avec les textes de la banque', () => {
    const s = scenarioVideo(sujet, sujet.accroches[1], 'x');
    expect(s.lignes.map((l) => l.id)).toEqual(['accroche', 'e1', 'e2', 'e3', 'apport']);
    expect(s.lignes[0].texte).toBe(sujet.accroches[1]);
    expect(s.lignes.slice(1, 4).map((l) => l.texte)).toEqual(ETAPES_COURTES[sujet.niche]);
    expect(s.lignes[4].texte).toBe(sujet.apport);
    expect(s.fin.site).toBe('coparentalitezen.fr');
  });
  it('écrit les nombres en lettres pour la voix, pas pour le sous-titre', () => {
    expect(enLettres(21)).toBe('vingt-et-un');
    expect(enLettres(80)).toBe('quatre-vingts');
    expect(enLettres(97)).toBe('quatre-vingt-dix-sept');
    expect(textePrononce('Trois lignes, 2 parents, 15 jours.')).toBe('Trois lignes, deux parents, quinze jours.');
  });
  it('fournit les lignes de voix au format de la bibliothèque', () => {
    const s = scenarioVideo(sujet, sujet.accroches[0], 'x');
    expect(lignesVoix(s)[0]).toMatchObject({ id: 'accroche', voice: 'fr-FR-DeniseNeural' });
  });
  it('refuse un contenu qui n’est pas un Reel', () => {
    const semaine = genererSemaine(new Date('2026-11-02T08:00:00Z'), 'https://www.coparentalitezen.fr');
    const reel = semaine.find((c) => c.format === 'reel')!;
    const autre = semaine.find((c) => c.format !== 'reel')!;
    expect(scenarioDuContenu(reel).reference).toBe(reel.reference);
    expect(() => scenarioDuContenu(autre)).toThrow(/pas un Reel/);
  });
});

describe('minutage', () => {
  it('tient chaque sous-titre au moins max(1,8 s ; voix + 0,6 s ; caractères/12 + 1 s)', () => {
    const s = scenarioVideo(BANQUE[3], BANQUE[3].accroches[2], 'x');
    const m = minutageDe(s);
    for (const p of m.plans) {
      if (!p.sousTitre || !p.voix) continue;
      const tenue = p.sousTitre.t1 - p.sousTitre.t0;
      expect(tenue).toBeGreaterThanOrEqual(lecture(p.sousTitre.texte, p.voix.duree) - 1e-3);
      expect(tenue).toBeGreaterThanOrEqual(1.8);
      expect(tenue).toBeGreaterThanOrEqual(p.voix.duree + 0.6 - 1e-3);
      expect(tenue).toBeGreaterThanOrEqual([...p.sousTitre.texte].length / 12 + 1 - 1e-3);
    }
  });
  it('règle la durée de chaque plan sur la durée réelle de sa voix', () => {
    const s = scenarioVideo(BANQUE[0], BANQUE[0].accroches[0], 'x');
    const lente = minutageDe(s, (t) => [...t].length / 6);   // une voix deux fois plus lente
    const vive = minutageDe(s);
    expect(lente.duree).toBeGreaterThan(vive.duree);
    const e1 = lente.plans.find((p) => p.id === 'e1')!;
    expect(e1.t1 - e1.t0).toBeGreaterThan(e1.voix!.duree);
  });
  it('tient toutes les combinaisons sujet × accroche entre 20 et 35 s, sans chevauchement', () => {
    for (const sujet of BANQUE) for (const a of sujet.accroches) {
      const m = minutageDe(scenarioVideo(sujet, a, `${sujet.niche}-${a.length}`));
      expect(ecarts(m), `${sujet.niche} : ${a}`).toEqual([]);
      expect(m.duree).toBeLessThanOrEqual(DUREE_MAX);
    }
  });
  it('garde la fin immobile au moins 3 s après l’adresse du site', () => {
    const m = minutageDe(scenarioVideo(BANQUE[1], BANQUE[1].accroches[0], 'x'));
    expect(m.duree - m.fin.site).toBeGreaterThanOrEqual(3);
    expect(FIN.tenue).toBeGreaterThanOrEqual(3);
  });
  // Ce que readcheck.mjs mesure réellement (film.js, texts()) : la carte d'étape n'apparaît que
  // CARTE_RETARD après le début de sa voix et disparaît à la fin du plan ; le sous-titre de l'apport
  // reste exactement sa tenue ; l'adresse du site, FIN.tenue moins son apparition (0,3 s).
  const visibles = (m: ReturnType<typeof minuter>) => m.plans.flatMap((p) => {
    if (p.role === 'etape') return [{ id: p.id, texte: p.sousTitre!.texte, vu: p.t1 - (p.voix!.t + CARTE_RETARD) }];
    if (p.role === 'apport') return [{ id: p.id, texte: p.sousTitre!.texte, vu: p.sousTitre!.t1 - p.sousTitre!.t0 }];
    return [];
  });
  it('Short du 20/11/2026 : chaque carte passe le contrôle de lecture avec de la marge (régression)', () => {
    const lignes = [
      ['accroche', 'accroche', 'Une réunion d’école oubliée n’est presque jamais un oubli volontaire.'],
      ['e1', 'etape', 'Note la date dès réception.'], ['e2', 'etape', 'Précise qui s’y rend.'],
      ['e3', 'etape', 'Ajoute les activités récurrentes une fois.'],
      ['apport', 'apport', 'Le rendez-vous est visible par les deux parents dès qu’il est créé.'],
    ].map(([id, role, texte]) => ({ id, role, texte }));
    // durées de voix mesurées dans le rendu refusé (journal GitHub Actions du 18/11)
    const m = minuter(lignes, { accroche: 3.578, e1: 1.684, e2: 1.182, e3: 2.312, apport: 2.994 });
    for (const v of visibles(m)) expect(v.vu, v.id).toBeGreaterThanOrEqual(exigenceControle(v.texte) + 0.2);
    expect(ecarts(m)).toEqual([]);
  });
  it('toute la banque, voix rapide ou normale : chaque carte et l’adresse du site passent le contrôle de lecture', () => {
    for (const debit of [voixEstimee, (t: string) => [...t].length / 25]) {
      for (const sujet of BANQUE) for (const a of sujet.accroches) {
        const m = minutageDe(scenarioVideo(sujet, a, `${sujet.niche}-${a.length}`), debit);
        for (const v of visibles(m)) expect(v.vu, `${sujet.niche} / ${v.id} : ${v.texte}`).toBeGreaterThanOrEqual(exigenceControle(v.texte) + 0.2);
        expect(ecarts(m), `${sujet.niche} : ${a}`).toEqual([]);
      }
    }
    expect(FIN.tenue - 0.3).toBeGreaterThanOrEqual(exigenceControle('coparentalitezen.fr') + 0.1);
    expect(APRES - CARTE_RETARD).toBeGreaterThan(-0.2);
  });
  it('refuse une voix manquante plutôt que d’inventer une durée', () => {
    expect(() => minuter([{ id: 'a', role: 'accroche', texte: 'x' }], {})).toThrow(/manquante/);
  });
  it('signale une vidéo trop longue', () => {
    const s = scenarioVideo(BANQUE[0], BANQUE[0].accroches[0], 'x');
    expect(ecarts(minutageDe(s, (t) => [...t].length / 4)).join()).toMatch(/> 35 s/);
  });
});
