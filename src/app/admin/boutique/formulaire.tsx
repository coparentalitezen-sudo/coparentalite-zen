'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { actionImporter, type ResultatAction } from '../copilote-actions';

export function FormulaireImport() {
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [enCours, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);

  return (
    <form ref={formulaire} className="card space-y-3 p-4"
      action={(donnees) => demarrer(async () => {
        setResultat(null);
        const r = await actionImporter(donnees);
        setResultat(r);
        if (r.ok) formulaire.current?.reset();
      })}>
      <label className="block space-y-1 text-sm font-bold">
        <span>Fichier CSV</span>
        <input type="file" name="fichier" accept=".csv,text/csv,text/plain" required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-sm font-bold">
          <span>Plateforme</span>
          <select name="source" defaultValue="auto">
            <option value="auto">Détecter</option>
            <option value="etsy">Etsy</option>
            <option value="payhip">Payhip</option>
            <option value="gumroad">Gumroad</option>
            <option value="generique">Générique</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm font-bold">
          <span>Contenu</span>
          <select name="type" defaultValue="auto">
            <option value="auto">Détecter</option>
            <option value="ventes">Ventes</option>
            <option value="catalogue">Fiches produits</option>
            <option value="vues">Vues</option>
          </select>
        </label>
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={enCours}>
        {enCours ? 'Import en cours…' : 'Importer'}
      </button>

      {resultat && (
        <div role="status" className={`rounded-xl p-3 text-sm ${resultat.ok ? 'bg-ok-bg text-ok' : 'bg-err-bg text-err'}`}>
          <p className="font-bold">{resultat.message}</p>
          {resultat.details && resultat.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5">{resultat.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
          )}
          {resultat.ok && (
            <p className="mt-2">
              Une fois tous tes exports déposés :{' '}
              <Link href="/admin/rapport" className="font-bold underline">recalculer le rapport</Link>.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
