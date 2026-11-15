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

/**
 * Publication TikTok à la main, en deux appuis.
 *
 * Premier appui : la légende part dans le presse-papiers (tout de suite, tant
 * que le geste est « frais »), puis la vidéo est téléchargée dans la page.
 * Second appui : la feuille de partage d'iOS s'ouvre avec la vidéo — « TikTok »
 * pour publier directement, ou « Enregistrer la vidéo » pour la pellicule. Deux
 * appuis parce que Safari refuse d'ouvrir le partage après une attente : le
 * téléchargement de quelques mégaoctets suffit à perdre le geste.
 */
export function PreparerTiktok({ url, nom, legende }: { url: string; nom: string; legende: string }) {
  const [texte, setTexte] = useState(legende);
  const [fichier, setFichier] = useState<File | null>(null);
  const [etat, setEtat] = useState<'repos' | 'chargement' | 'pret' | 'erreur'>('repos');
  const [message, setMessage] = useState<string | null>(null);

  const copier = async () => {
    try { await navigator.clipboard.writeText(texte); return true; } catch { return false; }
  };

  const preparer = async () => {
    setEtat('chargement');
    const copie = await copier();
    try {
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error(String(reponse.status));
      const blob = await reponse.blob();
      setFichier(new File([blob], nom, { type: 'video/mp4' }));
      setEtat('pret');
      setMessage(copie ? 'Légende copiée. Vidéo prête : appuie sur « Partager la vidéo ».'
        : 'Vidéo prête. La légende n’a pas pu être copiée : utilise « Copier la légende ».');
    } catch {
      setEtat('erreur');
      setMessage('Téléchargement impossible (adresse expirée ?). Recharge la page puis réessaie, ou utilise le lien de téléchargement.');
    }
  };

  const partager = async () => {
    if (!fichier) return;
    const donnees = { files: [fichier] };
    if (typeof navigator.canShare === 'function' && navigator.canShare(donnees)) {
      try { await navigator.share(donnees); } catch { /* partage annulé : rien à signaler */ }
      return;
    }
    setMessage('Le partage de fichiers n’est pas disponible ici : utilise le lien « Télécharger la vidéo ».');
  };

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <p className="text-sm font-bold">TikTok (publication à la main)</p>
      <label className="block space-y-1 text-xs text-soft">
        <span>Légende (modifiable avant de copier)</span>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={6} maxLength={2200} className="w-full text-sm text-ink" />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {etat !== 'pret' ? (
          <button type="button" className="btn btn-primary w-full" disabled={etat === 'chargement'} onClick={preparer}>
            {etat === 'chargement' ? 'Préparation…' : '1. Préparer pour TikTok'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary w-full" onClick={partager}>2. Partager la vidéo</button>
        )}
        <button type="button" className="btn btn-ghost w-full"
          onClick={async () => setMessage(await copier() ? 'Légende copiée.' : 'Copie refusée par le navigateur : sélectionne le texte à la main.')}>
          Copier la légende
        </button>
      </div>
      <a href={url} download={nom} className="block text-xs text-navy-text underline">Télécharger la vidéo (lien valable 10 minutes)</a>
      {message && <p role="status" className={`text-sm ${etat === 'erreur' ? 'text-err' : 'text-ok'}`}>{message}</p>}
      <p className="text-xs text-soft">Dans TikTok : colle la légende, choisis la visibilité, puis publie.</p>
    </div>
  );
}
