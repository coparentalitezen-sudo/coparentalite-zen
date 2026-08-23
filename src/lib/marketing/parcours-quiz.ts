'use client';

import {
  lireOrigineMemorisee, memoriserOrigineSiAbsente, ORIGINE_QUIZ,
} from '@/components/suivi-origine';

export type EtapeQuiz = 'commence' | 'termine' | 'clic_inscription';

const ETAPES: EtapeQuiz[] = ['commence', 'termine', 'clic_inscription'];

export function estEtapeQuiz(value: unknown): value is EtapeQuiz {
  return typeof value === 'string' && ETAPES.includes(value as EtapeQuiz);
}

/**
 * Compte une étape une seule fois par onglet, sans identifiant ni réponse.
 * Une perte de mesure ne doit jamais gêner le questionnaire.
 */
export function signalerEtapeQuiz(etape: EtapeQuiz): void {
  const cle = `czen_quiz_${etape}`;
  try {
    if (window.sessionStorage.getItem(cle)) return;
    window.sessionStorage.setItem(cle, '1');
  } catch {
    return;
  }

  const origine = lireOrigineMemorisee() ?? ORIGINE_QUIZ;
  void fetch('/api/marketing/parcours-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etape, ...origine }),
    keepalive: true,
  }).catch(() => { /* une mesure perdue ne casse rien */ });
}

/** Préserve l'origine externe, ou attribue une arrivée directe au quiz. */
export function preparerInscriptionDepuisQuiz(): void {
  memoriserOrigineSiAbsente(ORIGINE_QUIZ);
  signalerEtapeQuiz('clic_inscription');
}
