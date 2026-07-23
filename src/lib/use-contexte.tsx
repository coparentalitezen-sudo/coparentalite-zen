'use client';

import { useCallback, useEffect, useState } from 'react';
import { getContexte, type Contexte } from './actions';

export type EtatContexte =
  | { etat: 'chargement' }
  | { etat: 'demo' }
  | { etat: 'sans-foyer' }
  | { etat: 'erreur'; message: string; details?: string }
  | { etat: 'pret'; contexte: Contexte };

/** Charge le foyer courant et tout ce qui en dépend (membres, enfants, catégories). */
export function useContexte(): { ctx: EtatContexte; recharger: () => void } {
  const [ctx, setCtx] = useState<EtatContexte>({ etat: 'chargement' });

  const charger = useCallback(() => {
    setCtx({ etat: 'chargement' });
    getContexte().then((r) => {
      if (r.status === 'demo') setCtx({ etat: 'demo' });
      else if (r.status === 'error') setCtx({ etat: 'erreur', message: r.message, details: r.details });
      else if (r.data === null) setCtx({ etat: 'sans-foyer' });
      else setCtx({ etat: 'pret', contexte: r.data });
    });
  }, []);

  useEffect(charger, [charger]);
  return { ctx, recharger: charger };
}

/** Blocs d'état réutilisables, pour ne jamais laisser un écran vide sans explication. */
export const messages = {
  chargement: 'Chargement…',
  sansFoyer: 'Créez d’abord votre foyer dans « Plus → Paramètres du foyer ».',
};
