'use client';

import { useState, useTransition } from 'react';
import {
  actionProgrammer, actionRetirerContenu, actionAutoValider, actionPreparerPosts, type ResultatAction,
} from '../copilote-actions';
import type { ContenuEnregistre } from '@/lib/copilote/depot-contenus';

type Contenu = ContenuEnregistre & {
  visuel: string;
  etat: { instagram: string; facebook: string } | null;
  clics: Record<string, number>;
};

const ETATS: Record<string, string> = { en_attente: 'à venir', publiee: 'publiée ✓', echec: 'échec' };

function jour(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function Message({ r }: { r: ResultatAction | null }) {
  if (!r) return null;
  return <p role="status" className={`text-sm font-bold ${r.ok ? 'text-ok' : 'text-err'}`}>{r.message}</p>;
}

export function ReglagesPosts({ autoValider }: { autoValider: boolean }) {
  const [actif, setActif] = useState(autoValider);
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [enCours, demarrer] = useTransition();

  return (
    <section className="card space-y-3 p-4">
      <label className="flex items-start justify-between gap-3">
        <span>
          <span className="block font-bold">Auto-validation</span>
          <span className="block text-sm text-soft">
            Activée, les publications de chaque lundi partent sans passer par toi. À n’activer qu’une fois
            les premières relues.
          </span>
        </span>
        <input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={actif} disabled={enCours}
          onChange={(e) => {
            const v = e.target.checked;
            if (v && !window.confirm('Les prochaines publications partiront sans validation. Continuer ?')) return;
            demarrer(async () => {
              const r = await actionAutoValider(v);
              if (r.ok) setActif(v);
              setResultat(r);
            });
          }} />
      </label>
      <button type="button" className="btn btn-ghost w-full" disabled={enCours}
        onClick={() => demarrer(async () => setResultat(await actionPreparerPosts()))}>
        Préparer les publications de cette semaine
      </button>
      <Message r={resultat} />
    </section>
  );
}

export function CarteContenu({ contenu: c }: { contenu: Contenu }) {
  const [statut, setStatut] = useState(c.statut);
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [enCours, demarrer] = useTransition();
  const totalClics = Object.values(c.clics).reduce((a, b) => a + b, 0);

  const retirer = () => {
    const motif = window.prompt('Pourquoi ? (facultatif, pour mémoire)');
    if (motif === null) return;
    demarrer(async () => {
      const r = await actionRetirerContenu(c.id, motif.trim() || undefined);
      if (r.ok) setStatut('rejete');
      setResultat(r);
    });
  };

  return (
    <article className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{c.produit.titre}</p>
          <p className="text-sm text-soft">{jour(c.datePublication)}</p>
        </div>
        {statut === 'programme' && c.etat && (
          <p className="shrink-0 text-right text-xs text-soft">
            Instagram : {ETATS[c.etat.instagram] ?? c.etat.instagram}<br />
            Facebook : {ETATS[c.etat.facebook] ?? c.etat.facebook}
          </p>
        )}
      </div>

      {c.visuel && (
        // Visuel signé servi par notre propre route : next/image n'apporterait rien ici.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.visuel} alt={c.texteAlternatif} width={1080} height={1350}
          className="w-full rounded-xl border border-line" loading="lazy" />
      )}

      <details>
        <summary className="cursor-pointer text-sm font-bold">Légende Instagram</summary>
        <p className="mt-2 whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{c.legendeInstagram}</p>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-bold">Légende Facebook</summary>
        <p className="mt-2 whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{c.legendeFacebook}</p>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-bold">Épingle Pinterest</summary>
        <p className="mt-2 rounded-xl bg-muted p-3 text-sm">
          <span className="font-bold">{c.titrePinterest}</span><br />{c.descriptionPinterest}
        </p>
      </details>

      {statut === 'programme' && (
        <p className="text-sm text-soft">
          {totalClics === 0 ? 'Aucun clic pour l’instant.'
            : `${totalClics} clic${totalClics > 1 ? 's' : ''} vers la fiche (30 jours) : `
              + Object.entries(c.clics).map(([s, n]) => `${s} ${n}`).join(', ')}
        </p>
      )}

      {statut === 'en_attente' && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-primary" disabled={enCours}
            onClick={() => demarrer(async () => {
              const r = await actionProgrammer(c.id);
              if (r.ok) setStatut('programme');
              setResultat(r);
            })}>
            Valider
          </button>
          <button type="button" className="btn btn-ghost" disabled={enCours} onClick={retirer}>Rejeter</button>
        </div>
      )}
      {statut === 'programme' && c.etat?.instagram !== 'publiee' && c.etat?.facebook !== 'publiee' && (
        <button type="button" className="btn btn-ghost w-full" disabled={enCours} onClick={retirer}>
          Annuler la publication
        </button>
      )}
      {statut === 'rejete' && <p className="text-sm font-bold text-soft">Retirée.</p>}
      <Message r={resultat} />
    </article>
  );
}
