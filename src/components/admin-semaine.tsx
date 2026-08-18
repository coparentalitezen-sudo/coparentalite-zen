'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  actionStatut, actionValiderTout, actionLegende, actionSuspendre, actionMode,
} from '@/app/admin/actions';

/**
 * File de validation hebdomadaire.
 *
 * Conçue pour un pouce sur un iPhone : une carte par contenu, deux boutons
 * pleine largeur, et la validation groupée en tête — c'est le geste réel du
 * dimanche soir, sept validations à la suite étant une corvée que personne ne
 * tient trois semaines.
 *
 * Les erreurs s'affichent à l'endroit de l'action, pas en haut de page : un
 * message hors champ sur un écran de téléphone n'est jamais lu.
 */

export interface ContenuAffiche {
  reference: string;
  jour: number;
  format: 'reel' | 'carrousel' | 'publication';
  categorie: string;
  niche: string;
  accroche: string;
  legendeInstagram: string;
  legendeFacebook: string;
  texteAlternatif: string;
  pages: { titre: string; texte: string; secondes?: number }[];
  statut: string;
}

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const ETIQUETTES: Record<string, string> = {
  en_attente: 'En attente', valide: 'Validé', rejete: 'Rejeté',
  publie: 'Publié', echec: 'Échec', brouillon: 'Brouillon',
};

function Copier({ texte, libelle }: { texte: string; libelle: string }) {
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost w-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setFait(true); setErreur(false);
          setTimeout(() => setFait(false), 2000);
        } catch {
          // Le presse-papiers peut être refusé. Le dire plutôt que de laisser
          // croire que la copie a eu lieu : coller du vide dans Instagram se
          // découvrirait trop tard.
          setErreur(true);
        }
      }}
    >
      {erreur ? 'Copie refusée — sélectionnez le texte' : fait ? 'Copié' : libelle}
    </button>
  );
}

function Carte({ contenu }: { contenu: ContenuAffiche }) {
  const [statut, setStatut] = useState(contenu.statut);
  const [ouvert, setOuvert] = useState(false);
  const [legende, setLegende] = useState(contenu.legendeInstagram);
  const [edite, setEdite] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function changer(nouveau: 'valide' | 'rejete') {
    setMessage(null);
    demarrer(async () => {
      const r = await actionStatut(contenu.reference, nouveau);
      if (r.ok) setStatut(nouveau);
      else setMessage(r.message ?? 'Échec.');
    });
  }

  return (
    <article className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-soft">
            {JOURS[contenu.jour]} · {contenu.format} · {contenu.categorie}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold leading-snug">
            {contenu.accroche}
          </h3>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
          statut === 'valide' ? 'bg-navy text-white'
            : statut === 'rejete' ? 'bg-muted text-soft' : 'bg-muted text-ink'
        }`}>
          {ETIQUETTES[statut] ?? statut}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="text-sm font-bold text-navy-text underline"
      >
        {ouvert ? 'Replier' : 'Voir le détail'}
      </button>

      {ouvert && (
        <div className="space-y-4">
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase text-soft">Planches</p>
            <ol className="space-y-2 text-sm text-soft">
              {contenu.pages.map((p, i) => (
                <li key={p.titre + i} className="rounded-xl bg-muted p-3">
                  <span className="font-bold text-ink">{p.titre}</span>
                  {p.secondes ? <span className="text-xs"> · {p.secondes} s</span> : null}
                  <p className="mt-1">{p.texte}</p>
                  <a
                    className="mt-2 inline-block text-xs font-bold underline"
                    href={`/api/marketing/visuel?ref=${encodeURIComponent(contenu.reference)}&page=${i}`}
                    target="_blank" rel="noreferrer"
                  >
                    Ouvrir le visuel
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold uppercase text-soft">Légende Instagram</p>
            {edite ? (
              <>
                <textarea
                  value={legende} rows={8}
                  onChange={(e) => setLegende(e.target.value)}
                  className="w-full rounded-xl border border-black/10 p-3 text-sm"
                />
                <button
                  type="button" className="btn btn-primary w-full" disabled={enCours}
                  onClick={() => demarrer(async () => {
                    const r = await actionLegende(contenu.reference, 'instagram', legende);
                    setMessage(r.ok ? 'Légende enregistrée.' : (r.message ?? 'Échec.'));
                    if (r.ok) setEdite(false);
                  })}
                >
                  Enregistrer la légende
                </button>
              </>
            ) : (
              <>
                <p className="whitespace-pre-line rounded-xl bg-muted p-3 text-sm text-soft">
                  {legende}
                </p>
                <Copier texte={legende} libelle="Copier la légende Instagram" />
                <button
                  type="button" onClick={() => setEdite(true)}
                  className="text-sm font-bold text-navy-text underline"
                >
                  Corriger le texte
                </button>
              </>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold uppercase text-soft">Légende Facebook</p>
            <p className="whitespace-pre-line rounded-xl bg-muted p-3 text-sm text-soft">
              {contenu.legendeFacebook}
            </p>
            <Copier texte={contenu.legendeFacebook} libelle="Copier la légende Facebook" />
          </section>

          <section className="space-y-2">
            <p className="text-xs font-bold uppercase text-soft">Texte alternatif</p>
            <p className="rounded-xl bg-muted p-3 text-sm text-soft">{contenu.texteAlternatif}</p>
            <Copier texte={contenu.texteAlternatif} libelle="Copier le texte alternatif" />
          </section>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button" className="btn btn-primary flex-1" disabled={enCours || statut === 'valide'}
          onClick={() => changer('valide')}
        >
          Valider
        </button>
        <button
          type="button" className="btn btn-ghost flex-1" disabled={enCours || statut === 'rejete'}
          onClick={() => changer('rejete')}
        >
          Rejeter
        </button>
      </div>

      {message && <p className="text-sm font-bold text-navy-text">{message}</p>}
    </article>
  );
}

export function AdminSemaine({
  contenus, actif, mode, semaine,
}: {
  contenus: ContenuAffiche[];
  actif: boolean;
  mode: 'validation' | 'automatique';
  semaine: string;
}) {
  const [enService, setEnService] = useState(actif);
  const [modeActuel, setModeActuel] = useState(mode);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const enAttente = contenus.filter((c) => c.statut === 'en_attente').map((c) => c.reference);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <Link href="/app/accueil" className="text-sm font-bold text-navy-text underline">
            ← Retour à l’application
          </Link>
          <Link href="/admin/mesures" className="text-sm font-bold text-navy-text underline">
            Résultats →
          </Link>
        </div>
        <h1 className="font-display text-2xl font-semibold">Publications · {semaine}</h1>
        <p className="text-sm text-soft">
          {enAttente.length} contenu{enAttente.length > 1 ? 's' : ''} en attente sur {contenus.length}.
        </p>
      </header>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Publication automatique</p>
            <p className="text-sm text-soft">
              {enService ? 'En service' : 'Suspendue — rien ne part'}
            </p>
          </div>
          <button
            type="button" className={enService ? 'btn btn-ghost' : 'btn btn-primary'}
            disabled={enCours}
            onClick={() => demarrer(async () => {
              const r = await actionSuspendre(!enService);
              if (r.ok) setEnService(!enService);
              else setMessage(r.message ?? 'Échec.');
            })}
          >
            {enService ? 'Tout suspendre' : 'Remettre en service'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-3">
          <div>
            <p className="font-bold">Mode</p>
            <p className="text-sm text-soft">
              {modeActuel === 'validation'
                ? 'Chaque contenu attend votre accord'
                : 'Les contenus validés partent seuls'}
            </p>
          </div>
          <button
            type="button" className="btn btn-ghost" disabled={enCours}
            onClick={() => demarrer(async () => {
              const nouveau = modeActuel === 'validation' ? 'automatique' : 'validation';
              const r = await actionMode(nouveau);
              if (r.ok) setModeActuel(nouveau);
              else setMessage(r.message ?? 'Échec.');
            })}
          >
            {modeActuel === 'validation' ? 'Passer en automatique' : 'Revenir à la validation'}
          </button>
        </div>

        {message && <p className="text-sm font-bold text-navy-text">{message}</p>}
      </section>

      {enAttente.length > 0 && (
        <button
          type="button" className="btn btn-primary w-full" disabled={enCours}
          onClick={() => demarrer(async () => {
            const r = await actionValiderTout(enAttente);
            setMessage(r.ok ? 'Semaine validée.' : (r.message ?? 'Échec.'));
          })}
        >
          Valider les {enAttente.length} contenus en attente
        </button>
      )}

      {contenus.map((c) => <Carte key={c.reference} contenu={c} />)}
    </main>
  );
}
