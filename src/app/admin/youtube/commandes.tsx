'use client';

import { useState, useTransition } from 'react';
import {
  actionActiverYoutube, actionPublierEssai, actionDeconnecter, actionVisibilite,
} from './actions';

/**
 * Commandes de l'écran YouTube. Les gestes qui publient ou coupent
 * demandent deux appuis : un téléphone dans une poche ne doit rien déclencher.
 */
function useCommande() {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);
  return {
    enCours, retour,
    lancer: (f: () => Promise<{ ok: boolean; message: string }>) =>
      demarrer(async () => setRetour(await f())),
  };
}

function Retour({ retour }: { retour: { ok: boolean; message: string } | null }) {
  if (!retour) return null;
  return <p role="status" className={`text-sm ${retour.ok ? 'text-soft' : 'text-err'}`}>{retour.message}</p>;
}

export function Interrupteur({ actif }: { actif: boolean }) {
  const c = useCommande();
  return (
    <div className="space-y-2">
      <button type="button" disabled={c.enCours}
        onClick={() => c.lancer(() => actionActiverYoutube(!actif))}
        className={`btn w-full ${actif ? 'btn-ghost' : 'btn-primary'}`}>
        {c.enCours ? '…' : actif ? 'Arrêter la publication YouTube' : 'Activer la publication quotidienne'}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}

export function ChoixVisibilite({ valeur }: { valeur: string }) {
  const c = useCommande();
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Visibilité des Shorts quotidiens</span>
        <select defaultValue={valeur} disabled={c.enCours}
          onChange={(e) => c.lancer(() => actionVisibilite(e.target.value as 'private' | 'unlisted' | 'public'))}>
          <option value="private">Privée</option>
          <option value="unlisted">Non répertoriée</option>
          <option value="public">Publique</option>
        </select>
      </label>
      <Retour retour={c.retour} />
    </div>
  );
}

export function BoutonEssai() {
  const c = useCommande();
  const [arme, setArme] = useState(false);
  return (
    <div className="space-y-2">
      <button type="button" disabled={c.enCours} className="btn btn-ghost w-full"
        onClick={() => {
          if (!arme) { setArme(true); return; }
          setArme(false);
          c.lancer(actionPublierEssai);
        }}>
        {c.enCours ? 'Fabrication et envoi… (jusqu’à une minute)'
          : arme ? 'Confirmer l’envoi d’un Short privé' : 'Publier un Short d’essai (privé)'}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}

export function BoutonDeconnecter() {
  const c = useCommande();
  const [arme, setArme] = useState(false);
  return (
    <div className="space-y-2">
      <button type="button" disabled={c.enCours} className="btn btn-ghost w-full"
        onClick={() => {
          if (!arme) { setArme(true); return; }
          setArme(false);
          c.lancer(actionDeconnecter);
        }}>
        {arme ? 'Confirmer la déconnexion' : 'Déconnecter la chaîne'}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}
