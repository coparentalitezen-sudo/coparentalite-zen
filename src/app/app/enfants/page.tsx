'use client';

import { useState } from 'react';
import { BottomNav } from '@/components/ui';
import { Chargement, Erreur, SansFoyer, Vide } from '@/components/etats';
import { useContexte } from '@/lib/use-contexte';
import { ajouterEnfant, archiverEnfant } from '@/lib/actions';

const COULEURS = [
  { hex: '#9AA791', nom: 'Sauge' },
  { hex: '#4E6381', nom: 'Bleu marine' },
  { hex: '#E4A196', nom: 'Rose doux' },
  { hex: '#8A6A1F', nom: 'Ocre' },
];

export default function Enfants() {
  const { ctx, recharger } = useContexte();
  const [prenom, setPrenom] = useState('');
  const [naissance, setNaissance] = useState('');
  const [couleur, setCouleur] = useState(COULEURS[0].hex);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onAjouter(householdId: string) {
    setMsg(null);
    if (!prenom.trim()) { setMsg({ kind: 'err', text: 'Indiquez le prénom de l’enfant.' }); return; }
    setBusy(true);
    const r = await ajouterEnfant(householdId, prenom, naissance || null, couleur);
    setBusy(false);
    if (r.status === 'ok') {
      setPrenom(''); setNaissance('');
      setMsg({ kind: 'ok', text: 'Enfant ajouté.' });
      recharger();
    } else if (r.status === 'demo') {
      setMsg({ kind: 'ok', text: 'Mode démo : l’enfant serait ajouté.' });
    } else {
      setMsg({ kind: 'err', text: r.message });
    }
  }

  async function onArchiver(id: string, nom: string) {
    if (!confirm(`Archiver ${nom} ? Son historique est conservé, mais il n’apparaîtra plus dans les nouvelles dépenses.`)) return;
    const r = await archiverEnfant(id);
    if (r.status === 'ok') { setMsg({ kind: 'ok', text: `${nom} a été archivé·e.` }); recharger(); }
    else if (r.status === 'error') setMsg({ kind: 'err', text: r.message });
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Enfants</h1>

      {msg && (
        <p role={msg.kind === 'err' ? 'alert' : 'status'}
           className={`rounded-xl px-3 py-2 text-sm font-bold ${msg.kind === 'err' ? 'bg-err-bg text-err' : 'bg-ok-bg text-ok'}`}>
          {msg.text}
        </p>
      )}

      {ctx.etat === 'chargement' && <Chargement />}
      {ctx.etat === 'erreur' && <Erreur message={ctx.message} details={ctx.details} onReessayer={recharger} />}
      {ctx.etat === 'sans-foyer' && <SansFoyer />}

      {ctx.etat === 'pret' && ctx.contexte.enfants.length === 0 && (
        <Vide titre="Aucun enfant enregistré"
              texte="Ajoutez vos enfants pour pouvoir répartir les dépenses et bâtir le planning de garde." />
      )}

      {ctx.etat === 'pret' && ctx.contexte.enfants.length > 0 && (
        <ul className="card divide-y divide-line">
          {ctx.contexte.enfants.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-3">
                <span aria-hidden className="h-8 w-8 shrink-0 rounded-full" style={{ background: e.couleur }} />
                <span>
                  <span className="block font-bold">{e.prenom}</span>
                  {e.naissance && (
                    <span className="block text-sm text-soft">
                      Né·e le {new Date(e.naissance + 'T12:00:00').toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </span>
              </span>
              <button type="button" className="min-h-11 text-sm font-bold text-soft underline"
                      onClick={() => onArchiver(e.id, e.prenom)}>
                Archiver
              </button>
            </li>
          ))}
        </ul>
      )}

      {(ctx.etat === 'pret' || ctx.etat === 'demo') && (
        <section className="card space-y-3 p-4">
          <h2 className="font-bold">Ajouter un enfant</h2>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Prénom</span>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Léa" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Date de naissance (facultatif)</span>
            <input type="date" value={naissance} onChange={(e) => setNaissance(e.target.value)} />
          </label>
          <fieldset>
            <legend className="mb-1 text-sm font-bold">Couleur</legend>
            <div className="flex gap-2">
              {COULEURS.map((c) => (
                <button key={c.hex} type="button" aria-pressed={couleur === c.hex} aria-label={c.nom}
                  onClick={() => setCouleur(c.hex)}
                  className={`h-11 flex-1 rounded-xl border-2 ${couleur === c.hex ? 'border-navy' : 'border-transparent'}`}
                  style={{ background: c.hex }} />
              ))}
            </div>
          </fieldset>
          <button className="btn btn-primary w-full" disabled={busy}
            onClick={() => { if (ctx.etat === 'pret') onAjouter(ctx.contexte.foyer.id); }}>
            {busy ? 'Ajout…' : 'Ajouter l’enfant'}
          </button>
        </section>
      )}

      <BottomNav active="/app/plus" />
    </main>
  );
}
