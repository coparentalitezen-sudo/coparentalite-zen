'use client';

import { useState, useTransition } from 'react';
import { actionReleverMesures } from '../actions';

/**
 * Déclenchement manuel du relevé Meta.
 *
 * Affiche le motif d'échec tel que Meta l'a renvoyé. C'est tout l'intérêt du
 * bouton : la tâche de 21h faisait déjà ce travail, mais son échec partait
 * dans des journaux effacés au bout d'une heure, et la table est restée vide
 * plus d'un mois sans que rien ne le signale.
 */
export function BoutonRelever() {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={enCours}
        onClick={() => demarrer(async () => setRetour(await actionReleverMesures()))}
        className="btn btn-ghost w-full"
      >
        {enCours ? 'Relevé en cours…' : 'Relever maintenant'}
      </button>

      {retour && (
        <p className={`text-sm ${retour.ok ? 'text-soft' : 'text-err'}`}>
          {retour.message}
        </p>
      )}
    </div>
  );
}
