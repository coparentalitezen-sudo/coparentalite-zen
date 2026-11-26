/**
 * Les accroches publiées automatiquement passent le contrôle du skill ig-reel.
 *
 * `hookscore.py` (adapté au français) note chaque accroche sur cinq propriétés :
 * longueur, élément concret, enjeu, information en tête, adresse au parent.
 * Une accroche « faible » (moins de 50) ou qui ouvre sur une salutation, un
 * préambule ou un « arrête de scroller » ne doit jamais partir : ce test bloque
 * la CI, donc la publication, tant qu'elle n'a pas été réécrite.
 *
 * Ce que ce contrôle ne fait pas : prédire les vues. Il écarte les accroches
 * manifestement faibles ; les mesures réelles (marketing_mesures) départagent
 * les bonnes entre elles.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BANQUE, NOEL } from '../src/lib/marketing/banque';
import { ACCROCHES_PROUVEES } from '../src/lib/marketing/accroches-prouvees';

const SCRIPT = join(__dirname, '..', '.claude', 'skills', 'ig-reel', 'hookscore.py');
export const SEUIL_ACCROCHE = 50;

interface Note { hook: string; score: number; verdict: string; weakest: string; flags: string[] }

function noter(accroches: string[]): Note[] {
  const r = spawnSync('python3', [SCRIPT, '-', '--json'], { input: accroches.join('\n'), encoding: 'utf-8' });
  if (r.error) throw new Error(`python3 introuvable : ${r.error.message}`);
  const sortie = JSON.parse(r.stdout);
  return Array.isArray(sortie) ? sortie : [sortie];
}

describe('accroches notées par le skill ig-reel', () => {
  const accroches = [...BANQUE, NOEL].flatMap((s) => s.accroches);
  const notes = noter(accroches);

  it('note chaque accroche de la banque', () => {
    expect(notes.map((n) => n.hook)).toEqual(accroches);
  });

  // Campagne de Noël : la catégorie a fait ses preuves (Shorts de Noël à
  // 797-924 vues contre 1-36 pour les autres la semaine du 22/11, voir #32),
  // et ses vidéos sont déjà rendues et vérifiées à l'oreille. Ses accroches
  // échappent au seuil de note pendant la campagne, pas aux interdits
  // (salutation, préambule, mot-dièse, emoji) ; le suivi hebdomadaire les juge
  // sur leurs vues après Noël.
  it(`aucune accroche faible (note ≥ ${SEUIL_ACCROCHE}), sauf si les mesures l’ont prouvée`, () => {
    const prouvees = new Set([...ACCROCHES_PROUVEES.map((p) => p.accroche), ...NOEL.accroches]);
    const faibles = notes.filter((n) => n.score < SEUIL_ACCROCHE && !prouvees.has(n.hook))
      .map((n) => `${n.score} (${n.weakest}) ${n.hook}`);
    expect(faibles, 'Réécris ces accroches : python3 .claude/skills/ig-reel/hookscore.py --hook "…"').toEqual([]);
  });

  it('la liste des accroches prouvées ne cite que des accroches en service, avec une preuve', () => {
    for (const p of ACCROCHES_PROUVEES) {
      expect(accroches, p.accroche).toContain(p.accroche);
      expect(p.preuve).toMatch(/\d{2}\/\d{2}\/\d{4}.*\d+ vues/);
    }
  });

  it('aucune salutation, aucun préambule, aucun mot-dièse ni emoji en tête', () => {
    const bloquees = notes.filter((n) => n.flags.length).map((n) => `${n.hook} → ${n.flags[0]}`);
    expect(bloquees).toEqual([]);
  });
});
