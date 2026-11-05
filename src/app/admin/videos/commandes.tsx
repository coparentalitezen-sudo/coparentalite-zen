'use client';

import { useState, useTransition } from 'react';
import {
  actionSuspendre, actionReactiver, actionHeure, actionRerendre, actionRepublier, actionConfirmerAbsente,
} from './actions';

/**
 * Commandes de l'écran des vidéos. Ce qui publie ou coupe demande deux appuis :
 * un téléphone dans une poche ne doit rien déclencher. Les erreurs s'affichent
 * sous le bouton qui les a provoquées.
 */
type Retour = { ok: boolean; message: string };
function useCommande() {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<Retour | null>(null);
  return { enCours, retour, lancer: (f: () => Promise<Retour>) => demarrer(async () => setRetour(await f())) };
}
function Retour({ retour }: { retour: Retour | null }) {
  if (!retour) return null;
  return <p role="status" className={`text-sm ${retour.ok ? 'text-ok' : 'text-err'}`}>{retour.message}</p>;
}

type Reglable = 'global' | 'instagram' | 'facebook' | 'youtube' | 'pinterest';

export function Suspendre({ plateforme, libelle }: { plateforme: Reglable; libelle: string }) {
  const c = useCommande();
  const [motif, setMotif] = useState('');
  const [arme, setArme] = useState(false);
  return (
    <div className="space-y-2">
      <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={300}
        placeholder="Motif (obligatoire)" aria-label={`Motif de suspension — ${libelle}`} className="w-full" />
      <button type="button" disabled={c.enCours} className={`btn w-full ${plateforme === 'global' ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => { if (!arme) { setArme(true); return; } setArme(false); c.lancer(() => actionSuspendre(plateforme, motif)); }}>
        {c.enCours ? '…' : arme ? `Confirmer : ${libelle}` : libelle}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}

export function Reactiver({ plateforme, libelle }: { plateforme: Reglable; libelle: string }) {
  const c = useCommande();
  const [arme, setArme] = useState(false);
  return (
    <div className="space-y-2">
      <button type="button" disabled={c.enCours} className="btn btn-ghost w-full"
        onClick={() => { if (!arme) { setArme(true); return; } setArme(false); c.lancer(() => actionReactiver(plateforme)); }}>
        {c.enCours ? '…' : arme ? `Confirmer : ${libelle}` : libelle}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}

export function ChoixHeure({ plateforme, heure }: { plateforme: Exclude<Reglable, 'global'>; heure: number }) {
  const c = useCommande();
  return (
    <div className="space-y-1">
      <label className="block text-sm">
        <span className="mr-2">Heure (Paris)</span>
        <select defaultValue={heure} disabled={c.enCours} onChange={(e) => c.lancer(() => actionHeure(plateforme, Number(e.target.value)))}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}
        </select>
      </label>
      <Retour retour={c.retour} />
    </div>
  );
}

export function Rerendre({ cle }: { cle: string }) {
  const c = useCommande();
  return (
    <div className="space-y-1">
      <button type="button" disabled={c.enCours} className="btn btn-ghost w-full" onClick={() => c.lancer(() => actionRerendre(cle))}>
        {c.enCours ? '…' : 'Re-rendre'}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}

export function Republier({ cle, plateforme }: { cle: string; plateforme: 'instagram' | 'facebook' | 'youtube' }) {
  const c = useCommande();
  const [arme, setArme] = useState(false);
  return (
    <div className="space-y-1">
      <button type="button" disabled={c.enCours} className="btn btn-ghost w-full"
        onClick={() => { if (!arme) { setArme(true); return; } setArme(false); c.lancer(() => actionRepublier(cle, plateforme)); }}>
        {c.enCours ? 'Envoi… (jusqu’à deux minutes)' : arme ? `Confirmer : republier sur ${plateforme}` : `Republier sur ${plateforme}`}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}

export function ConfirmerAbsente({ cle, plateforme }: { cle: string; plateforme: 'instagram' | 'facebook' }) {
  const c = useCommande();
  const [arme, setArme] = useState(false);
  return (
    <div className="space-y-1">
      <button type="button" disabled={c.enCours} className="btn btn-ghost w-full"
        onClick={() => { if (!arme) { setArme(true); return; } setArme(false); c.lancer(() => actionConfirmerAbsente(cle, plateforme)); }}>
        {arme ? 'Confirmer : elle n’est PAS en ligne' : `Vérifié : absente de ${plateforme}`}
      </button>
      <Retour retour={c.retour} />
    </div>
  );
}
