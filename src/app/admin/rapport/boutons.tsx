'use client';

import { useState, useTransition } from 'react';
import { actionRecalculer, type ResultatAction } from '../copilote-actions';

/**
 * Recalcul à la demande.
 *
 * Deux boutons distincts : recalculer après un import ne doit pas envoyer un
 * courriel à chaque fois. L'envoi est un geste explicite.
 */
export function BoutonsRapport() {
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [enCours, demarrer] = useTransition();
  const lancer = (envoyer: boolean) => demarrer(async () => {
    setResultat(null);
    setResultat(await actionRecalculer(envoyer));
  });

  return (
    <section className="card space-y-2 p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className="btn btn-primary" disabled={enCours} onClick={() => lancer(false)}>
          {enCours ? 'Calcul…' : 'Recalculer maintenant'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={enCours} onClick={() => lancer(true)}>
          Recalculer et m’envoyer le courriel
        </button>
      </div>
      <p className="text-xs text-soft">
        Le calcul automatique a lieu chaque lundi à 7 h (heure de Paris en hiver) et envoie le courriel une fois.
      </p>
      {resultat && (
        <p role="status" className={`text-sm font-bold ${resultat.ok ? 'text-ok' : 'text-err'}`}>
          {resultat.message}
        </p>
      )}
    </section>
  );
}
