import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Contrôle vocal : la comparaison accepte ce qui s'entend pareil (homophones transcrits
 * différemment par Whisper) et refuse tout mot faux, ajouté ou manquant.
 * Paires tirées du banc vocal réel (GitHub Actions, voix « Denise », Whisper « small »).
 */
const python = (() => { try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function egaux(paires: [string, string][]): boolean[] {
  const script = `import sys, json; sys.path.insert(0, ${JSON.stringify(path.resolve('video-gabarit/tools'))})
from phonetique_fr import norm_fr
print(json.dumps([norm_fr(a) == norm_fr(b) for a, b in json.loads(sys.stdin.read())]))`;
  return JSON.parse(execFileSync('python3', ['-c', script], { input: JSON.stringify(paires), encoding: 'utf8' }));
}

describe.skipIf(!python)('comparaison phonétique de la voix', () => {
  it('accepte les homophones exacts', () => {
    const r = egaux([
      ['Trois lignes après le rendez-vous évitent trois messages le lendemain.', '3 lignes après le rendez-vous et vite 3 messages le lendemain.'],
      ['Rangez l’ordonnance avec les précédentes.', "Ranger l'ordonnance avec les précédentes."],
      ['Vous recomptez les semaines sur vos doigts ?', 'Vous recontez les semaines sur vos doigts ?'],
      ['Agacé ? Attendez quelques heures pour écrire.', 'Agassé ? Attendez quelques heures pour écrire.'],
      ['Rangez-les par enfant, pas par date.', 'Ranger les parents-fans, pas par date.'],
      ['Tenez-vous aux faits : quoi, quand, où, qui.', 'Tenez-vous au fait quoi, quand ou qui.'],
      ['À trois cents kilomètres, un week-end se prépare un mois avant.', 'À 300 km, un week-end se prépare un mois avant.'],
      ['Vérifiez que l’autre parent l’a vue.', "Vérifiez que l'autre parent l'a vu."],
    ]);
    expect(r).toEqual(r.map(() => true));
  });
  it('refuse un mot faux, ajouté ou manquant', () => {
    const r = egaux([
      ['Notez le prochain rendez-vous sur place.', 'Notez le prochain rendez-vous sur la place.'],
      ['Notez la dépense le jour même.', 'Notez la défense le jour même.'],
      ['Deux parents', 'Trois parents'],
      ['Gardez la même heure', 'Gardez la même erreur'],
      ['les deux parents', 'les parents'],
      ['Fixez qui reçoit le jour même.', "Fixez qu'il reçoit le jour même."],
      ['L’anniversaire tombe un mercredi. Chez qui ?', "L'anniversaire tomba mercredi. Chez qui ?"],
      ['Rangez-le avec les autres, sans exception.', 'Brangez-le avec les autres, sans exception.'],
      ['Résumez : dit, prescrit, à suivre.', 'résumer dit prescrire à suivre'],
    ]);
    expect(r).toEqual(r.map(() => false));
  });
});
