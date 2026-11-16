'use client';

import { useState, useTransition } from 'react';
import { actionStatutProposition } from '../copilote-actions';
import type { PropositionEnregistree, StatutProposition } from '@/lib/copilote/depot';
import type { Idee, Amelioration } from '@/lib/copilote/propositions';

const NOMS = { etsy: 'Etsy', payhip: 'Payhip', gumroad: 'Gumroad' } as const;
const NATURES = { diffusion: 'Diffusion', pack: 'Pack', declinaison: 'Déclinaison', saison: 'Saison' } as const;

function prix(centimes: number | null, devise: string): string {
  if (centimes === null) return 'à fixer';
  return (centimes / 100).toLocaleString('fr-FR', { style: 'currency', currency: devise });
}

/** Bloc de texte avec bouton « Copier » : le geste réel est un copier-coller dans Etsy. */
function ACopier({ libelle, texte }: { libelle: string; texte: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-soft">{libelle}</p>
        <button type="button" className="text-xs font-bold text-navy-text underline"
          onClick={async () => {
            try { await navigator.clipboard.writeText(texte); setCopie(true); setTimeout(() => setCopie(false), 1500); }
            catch { setCopie(false); }
          }}>
          {copie ? 'Copié ✓' : 'Copier'}
        </button>
      </div>
      <p className="whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{texte}</p>
    </div>
  );
}

function CorpsIdee({ i }: { i: Idee }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full bg-muted px-2 py-1">{NATURES[i.nature]}</span>
        {i.hypothese && <span className="rounded-full bg-wait-bg px-2 py-1 text-wait">Hypothèse, à confirmer</span>}
      </p>
      <p><span className="font-bold">Pour qui :</span> {i.cible}</p>
      <p><span className="font-bold">Prix suggéré :</span> {prix(i.prixSuggereCentimes, i.devise)}</p>
      {i.plateformes.length > 0 && (
        <p><span className="font-bold">Où :</span> {i.plateformes.map((p) => NOMS[p]).join(', ')}</p>
      )}
      <ul className="list-disc space-y-1 pl-5 text-soft">{i.justification.map((j, k) => <li key={k}>{j}</li>)}</ul>
    </div>
  );
}

function CorpsAmelioration({ a }: { a: Amelioration }) {
  const titreChange = a.titrePropose !== a.titreActuel;
  return (
    <div className="space-y-3 text-sm">
      {a.plateforme && <p className="text-xs font-bold text-soft">{NOMS[a.plateforme]}</p>}
      <ul className="list-disc space-y-1 pl-5 text-soft">{a.constats.map((c, k) => <li key={k}>{c}</li>)}</ul>
      {titreChange
        ? <ACopier libelle="Titre proposé" texte={a.titrePropose} />
        : <p className="text-soft">Titre : rien à changer.</p>}
      <ACopier libelle={`Tags proposés (${a.tagsProposes.length})`} texte={a.tagsProposes.join(', ')} />
      <ACopier libelle="Description (à compléter)" texte={a.descriptionProposee} />
    </div>
  );
}

export function CarteProposition({ proposition: p }: { proposition: PropositionEnregistree }) {
  const [statut, setStatut] = useState<StatutProposition>(p.statut);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const decider = (s: StatutProposition) => {
    let motif: string | undefined;
    if (s === 'rejetee') {
      const reponse = window.prompt('Pourquoi ? (facultatif, pour mémoire)');
      if (reponse === null) return; // « Annuler » n'est pas un rejet.
      motif = reponse.trim() || undefined;
    }
    demarrer(async () => {
      const r = await actionStatutProposition(p.id, s, motif);
      if (r.ok) setStatut(s); else setMessage(r.message);
    });
  };

  return (
    <article className="card space-y-3 p-4">
      <h3 className="font-bold">{p.titre}</h3>
      {p.contenu.type === 'idee' ? <CorpsIdee i={p.contenu} /> : <CorpsAmelioration a={p.contenu} />}

      {statut === 'en_attente' ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-primary" disabled={enCours} onClick={() => decider('validee')}>
            Valider
          </button>
          <button type="button" className="btn btn-ghost" disabled={enCours} onClick={() => decider('rejetee')}>
            Rejeter
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-bold">
            {{ validee: 'Validée', rejetee: 'Rejetée', realisee: 'Réalisée ✓' }[statut]}
          </span>
          {statut === 'validee' && (
            <button type="button" className="btn btn-ghost" disabled={enCours} onClick={() => decider('realisee')}>
              Marquer comme fait
            </button>
          )}
        </div>
      )}
      {message && <p role="alert" className="text-sm text-err">{message}</p>}
    </article>
  );
}
