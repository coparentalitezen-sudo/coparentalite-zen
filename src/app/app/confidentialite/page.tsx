'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BottomNav } from '@/components/ui';
import { legal } from '@/lib/legal';

/**
 * Confidentialité et droits sur les données.
 *
 * L'écran Plus annonçait cette rubrique depuis le début, mais renvoyait vers
 * les paramètres du foyer : le droit était promis sans être exerçable. Il l'est
 * ici, sans démarche ni délai pour l'export.
 */
export default function Confidentialite() {
  const [enCours, setEnCours] = useState(false);
  /** Suppression : deux temps, parce qu'elle est irréversible. */
  const [confirme, setConfirme] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [suppression, setSuppression] = useState<string | null>(null);
  const [efface, setEfface] = useState(false);

  async function supprimer() {
    setSuppression(null);
    setEnCours(true);
    try {
      const r = await fetch('/api/supprimer-compte', { method: 'POST' });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) { setSuppression(corps.message ?? 'La suppression a échoué.'); return; }
      setEfface(true);
      // Laisser le message se lire avant de quitter l'application.
      setTimeout(() => { window.location.href = '/'; }, 4000);
    } catch {
      setSuppression('La suppression a échoué. Vérifiez votre connexion.');
    } finally {
      setEnCours(false);
    }
  }

  async function telecharger() {
    setEnCours(true);
    try {
      // Un lien direct suffirait, mais l'attente serait invisible sur un
      // foyer chargé : le bouton doit dire qu'il travaille.
      const r = await fetch('/api/mes-donnees');
      if (!r.ok) throw new Error('export indisponible');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coparentalite-zen-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Repli : le navigateur ouvre le relevé, l'utilisateur l'enregistre.
      window.location.href = '/api/mes-donnees';
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-28 pt-4">
      <h1 className="font-display text-[22px] font-bold tracking-tight">Confidentialité</h1>

      <section className="card space-y-3 px-4 py-5">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">
          Emporter vos données
        </h2>
        <p className="text-[13px] leading-snug text-soft">
          Vous obtenez l’ensemble de ce que contient votre compte : foyer,
          enfants, rythme de garde, périodes, dépenses, remboursements et
          réglages. Le fichier est au format JSON, lisible par une machine comme
          l’exige le règlement européen.
        </p>
        <button className="btn btn-primary w-full" onClick={telecharger} disabled={enCours}>
          {enCours ? 'Préparation…' : 'Télécharger mes données'}
        </button>
        <p className="text-[12px] leading-snug text-soft">
          Ce relevé contient des informations sur vos enfants et sur l’autre
          parent. Conservez-le comme vous conserveriez un dossier familial.
        </p>
      </section>

      <section className="card space-y-3 px-4 py-5">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">
          Vos autres droits
        </h2>
        <ul className="space-y-2 text-[13px] leading-snug text-soft">
          <li>
            <strong className="text-navy-text">Rectification</strong> — corrigez
            directement dans l’application : enfants, foyer, dépenses, rythme.
          </li>
          <li>
            <strong className="text-navy-text">Effacement</strong> — la
            suppression de votre compte efface vos données personnelles. Le
            planning partagé reste visible pour l’autre parent, qui en est
            également responsable ; nous ne pouvons pas effacer son exemplaire
            sans le priver de l’organisation de ses propres enfants.
          </li>
          <li>
            <strong className="text-navy-text">Opposition et limitation</strong> —
            écrivez-nous, nous répondons sous un mois.
          </li>
        </ul>
        <p className="text-[13px] font-bold">
          {legal.email}
        </p>
      </section>

      <section className="card space-y-3 px-4 py-5">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">
          Supprimer mon compte
        </h2>
        {efface ? (
          <p role="status" className="rounded-xl bg-ok-bg px-3 py-2 text-sm font-bold text-ok">
            Votre compte est supprimé. Vous allez être déconnecté.
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-snug text-soft">
              Votre nom, votre adresse, vos réglages, vos appareils et vos
              notifications sont effacés. Un éventuel abonnement est résilié
              avant toute chose, pour qu’aucun prélèvement ne survive à votre
              compte.
            </p>
            <p className="text-[13px] leading-snug text-soft">
              Le planning d’un foyer partagé demeure : l’autre parent y organise
              ses propres enfants et peut avoir à produire les justificatifs de
              dépenses. Vos écritures y apparaîtront sous la mention
              « Compte supprimé ». Un foyer où vous étiez seul est fermé avec
              vous.
            </p>
            <p className="text-[13px] font-bold">Cette action est irréversible.</p>

            {!confirme ? (
              <button className="btn btn-ghost w-full text-err"
                      onClick={() => setConfirme(true)}>
                Supprimer mon compte
              </button>
            ) : (
              <div className="space-y-2">
                <label htmlFor="confirmation" className="block text-[13px] font-bold">
                  Écrivez SUPPRIMER pour confirmer
                </label>
                <input id="confirmation" className="w-full" value={saisie}
                       autoCapitalize="characters" autoCorrect="off"
                       onChange={(e) => setSaisie(e.target.value)} />
                <button className="btn btn-primary w-full"
                        disabled={enCours || saisie.trim().toUpperCase() !== 'SUPPRIMER'}
                        onClick={supprimer}>
                  {enCours ? 'Suppression…' : 'Confirmer la suppression'}
                </button>
                <button className="btn btn-ghost w-full" onClick={() => setConfirme(false)}>
                  Annuler
                </button>
              </div>
            )}
            {suppression && (
              <p role="alert" className="rounded-xl bg-err-bg px-3 py-2 text-sm font-bold text-err">
                {suppression}
              </p>
            )}
          </>
        )}
      </section>

      <Link href="/app/plus" className="btn btn-ghost w-full">
        Revenir à Plus
      </Link>

      <BottomNav active="/app/plus" />
    </main>
  );
}
