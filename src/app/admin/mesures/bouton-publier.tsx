'use client';

import { useState, useTransition } from 'react';
import { actionPublierPlanifie } from '../actions';

/**
 * Relance de la publication quotidienne.
 *
 * Un premier appui arme, un second envoie : ce bouton publie pour de bon sur
 * des comptes publics, et un téléphone dans une poche ne doit pas pouvoir le
 * déclencher seul. Le motif d'arrêt s'affiche ensuite tel quel — c'est tout
 * l'intérêt, la tâche de 9h a déjà montré qu'elle pouvait s'arrêter quatre
 * jours sans que rien ne le signale.
 */
export function BoutonPublier() {
  const [arme, setArme] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          if (!arme) { setArme(true); return; }
          setArme(false);
          demarrer(async () => setRetour(await actionPublierPlanifie()));
        }}
        className="btn btn-ghost w-full"
      >
        {enCours ? 'Publication en cours…'
          : arme ? 'Confirmer la publication' : 'Relancer la publication du jour'}
      </button>

      {arme && !enCours && (
        <p className="text-sm text-soft">
          Appuyez une seconde fois pour publier réellement.
        </p>
      )}

      {retour && (
        <p className={`text-sm ${retour.ok ? 'text-soft' : 'text-err'}`}>
          {retour.message}
        </p>
      )}
    </div>
  );
}
