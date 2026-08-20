'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  actionStatut, actionValiderTout, actionLegende, actionSuspendre, actionMode,
  actionPublier,
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
  urlsVisuels: string[];
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


/**
 * Publication en deux temps.
 *
 * Un premier appui arme, un second envoie. Publier sur un compte public est
 * irréversible : un bouton à un seul appui, sur un téléphone rangé dans une
 * poche, finirait par publier tout seul.
 *
 * L'état armé retombe au bout de dix secondes, pour qu'un bouton oublié à
 * l'écran ne reste pas prêt à partir.
 */
function PublierMaintenant({
  reference, onPublie, libelle = 'Publier sur Instagram',
}: { reference: string; onPublie: () => void; libelle?: string }) {
  const [arme, setArme] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    if (!arme) return;
    const minuterie = setTimeout(() => setArme(false), 10000);
    return () => clearTimeout(minuterie);
  }, [arme]);

  if (!arme) {
    return (
      <div className="space-y-2">
        <button
          type="button" className="btn btn-ghost w-full" disabled={enCours}
          onClick={() => { setMessage(null); setArme(true); }}
        >
          {libelle}
        </button>
        {message && <p className="text-sm font-bold text-navy-text">{message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl bg-muted p-3">
      <p className="text-sm text-soft">
        La publication partira immédiatement sur le compte coparentalitezen.
        Elle ne pourra pas être annulée depuis ici.
      </p>
      <div className="flex gap-2">
        <button
          type="button" className="btn btn-primary flex-1" disabled={enCours}
          onClick={() => demarrer(async () => {
            const r = await actionPublier(reference, 'instagram');
            if (r.ok) { onPublie(); setMessage(`Publié. Identifiant Meta : ${r.metaId ?? 'non renvoyé'}`); }
            else setMessage(r.message ?? 'Échec.');
            setArme(false);
          })}
        >
          {enCours ? 'Envoi…' : 'Confirmer la publication'}
        </button>
        <button
          type="button" className="btn btn-ghost flex-1" disabled={enCours}
          onClick={() => setArme(false)}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}


/**
 * Script de tournage d'un Reel.
 *
 * Un Reel ne peut pas être publié par l'API sans fichier vidéo, et l'encodage
 * n'est pas réalisable ici. Plutôt que d'afficher un bouton qui échouera,
 * l'écran donne ce qu'il faut pour tourner : la durée de chaque plan, le texte
 * à dire, celui à afficher, et la légende à coller ensuite.
 *
 * Le tout est copiable d'un geste : lire un script sur un écran pendant qu'on
 * filme avec le même téléphone est impossible.
 */
function ScriptTournage({ contenu }: { contenu: ContenuAffiche }) {
  const duree = contenu.pages.reduce((s, p) => s + (p.secondes ?? 0), 0);

  const script = [
    `REEL — ${contenu.accroche}`,
    `Durée visée : ${duree} secondes`,
    '',
    ...contenu.pages.flatMap((p, i) => [
      `PLAN ${i + 1} — ${p.secondes ?? '?'} s — ${p.titre}`,
      `À dire et à afficher : ${p.texte}`,
      '',
    ]),
    'LÉGENDE À COLLER APRÈS LE MONTAGE :',
    contenu.legendeInstagram,
  ].join('\n');

  return (
    <div className="space-y-2 rounded-2xl bg-muted p-3">
      <p className="text-sm font-bold text-ink">À tourner vous-même</p>
      <p className="text-sm text-soft">
        Un Reel exige un fichier vidéo : Instagram n’accepte pas qu’on le fabrique
        à distance. Comptez trois minutes avec votre téléphone. Pensez aux
        sous-titres, la plupart des gens regardent sans le son.
      </p>
      <ol className="space-y-2 text-sm">
        {contenu.pages.map((p, i) => (
          <li key={p.titre + i} className="rounded-xl bg-card p-3">
            <p className="font-bold text-ink">
              Plan {i + 1} · {p.secondes ?? '?'} s · {p.titre}
            </p>
            <p className="mt-1 text-soft">{p.texte}</p>
          </li>
        ))}
      </ol>
      <Copier texte={script} libelle="Copier le script complet" />
    </div>
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
                    href={contenu.urlsVisuels[i] || '#'}
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

      {statut === 'valide' && contenu.format !== 'reel' && (
        <PublierMaintenant
          reference={contenu.reference}
          onPublie={() => setStatut('publie')}
          libelle={contenu.format === 'carrousel'
            ? `Publier le carrousel (${contenu.pages.length} planches)`
            : 'Publier sur Instagram'}
        />
      )}

      {statut === 'valide' && contenu.format === 'reel' && (
        <ScriptTournage contenu={contenu} />
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
  contenus, globalActif, actif, mode, semaine, facebook, pinterest,
}: {
  contenus: ContenuAffiche[];
  globalActif: boolean;
  actif: boolean;
  mode: 'validation' | 'automatique';
  semaine: string;
  facebook: { actif: boolean; mode: 'validation' | 'automatique' };
  pinterest: {
    rssUrl: string;
    verificationConfiguree: boolean;
    actif: boolean;
    mode: 'validation' | 'automatique';
  };
}) {
  const [generalEnService, setGeneralEnService] = useState(globalActif);
  const [enService, setEnService] = useState(actif);
  const [modeActuel, setModeActuel] = useState(mode);
  const [facebookEnService, setFacebookEnService] = useState(facebook.actif);
  const [facebookMode, setFacebookMode] = useState(facebook.mode);
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">Pinterest automatique</p>
            <p className="text-sm text-soft">
              {pinterest.verificationConfiguree
                ? 'Le domaine est prêt à être revendiqué dans Pinterest.'
                : 'Ajoutez la clé de vérification Pinterest pour revendiquer le domaine.'}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
            pinterest.actif && generalEnService ? 'bg-navy text-white' : 'bg-muted text-soft'
          }`}>
            {pinterest.actif && generalEnService ? 'En service' : 'Suspendu'}
          </span>
        </div>
        <p className="text-sm text-soft">
          Domaine {pinterest.verificationConfiguree ? 'configuré' : 'à configurer'} · mode{' '}
          {pinterest.mode === 'automatique' ? 'automatique' : 'validation'}.
        </p>
        <div className="rounded-xl bg-muted p-3">
          <p className="text-xs font-bold uppercase text-soft">Flux RSS à connecter</p>
          <p className="mt-1 break-all text-sm">{pinterest.rssUrl}</p>
        </div>
        <Copier texte={pinterest.rssUrl} libelle="Copier l’adresse du flux Pinterest" />
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Arrêt général</p>
            <p className="text-sm text-soft">
              {generalEnService ? 'Tous les canaux peuvent fonctionner' : 'Toutes les publications sont suspendues'}
            </p>
          </div>
          <button
            type="button" className={generalEnService ? 'btn btn-ghost' : 'btn btn-primary'}
            disabled={enCours}
            onClick={() => demarrer(async () => {
              const r = await actionSuspendre('global', !generalEnService);
              if (r.ok) setGeneralEnService(!generalEnService);
              else setMessage(r.message ?? 'Échec.');
            })}
          >
            {generalEnService ? 'Tout suspendre' : 'Lever l’arrêt général'}
          </button>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Publication Instagram</p>
            <p className="text-sm text-soft">
              {enService ? 'En service' : 'Suspendue — rien ne part'}
            </p>
          </div>
          <button
            type="button" className={enService ? 'btn btn-ghost' : 'btn btn-primary'}
            disabled={enCours}
            onClick={() => demarrer(async () => {
              const r = await actionSuspendre('instagram', !enService);
              if (r.ok) setEnService(!enService);
              else setMessage(r.message ?? 'Échec.');
            })}
          >
            {enService ? 'Suspendre Instagram' : 'Activer Instagram'}
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
              const r = await actionMode('instagram', nouveau);
              if (r.ok) setModeActuel(nouveau);
              else setMessage(r.message ?? 'Échec.');
            })}
          >
            {modeActuel === 'validation' ? 'Passer en automatique' : 'Revenir à la validation'}
          </button>
        </div>

        {message && <p className="text-sm font-bold text-navy-text">{message}</p>}
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Publication Facebook</p>
            <p className="text-sm text-soft">
              {facebookEnService ? 'En service' : 'Suspendue — rien ne part'}
            </p>
          </div>
          <button
            type="button" className={facebookEnService ? 'btn btn-ghost' : 'btn btn-primary'}
            disabled={enCours}
            onClick={() => demarrer(async () => {
              const r = await actionSuspendre('facebook', !facebookEnService);
              if (r.ok) setFacebookEnService(!facebookEnService);
              else setMessage(r.message ?? 'Échec.');
            })}
          >
            {facebookEnService ? 'Suspendre Facebook' : 'Activer Facebook'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-3">
          <div>
            <p className="font-bold">Mode</p>
            <p className="text-sm text-soft">
              {facebookMode === 'validation'
                ? 'Publication déclenchée manuellement'
                : 'Publication déclenchée automatiquement'}
            </p>
          </div>
          <button
            type="button" className="btn btn-ghost" disabled={enCours}
            onClick={() => demarrer(async () => {
              const nouveau = facebookMode === 'validation' ? 'automatique' : 'validation';
              const r = await actionMode('facebook', nouveau);
              if (r.ok) setFacebookMode(nouveau);
              else setMessage(r.message ?? 'Échec.');
            })}
          >
            {facebookMode === 'validation' ? 'Passer en automatique' : 'Revenir à la validation'}
          </button>
        </div>
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
