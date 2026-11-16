'use client';

import { useRef, useState, useTransition } from 'react';
import { actionLienProduit, actionAjouterProduit, type ResultatAction } from '../copilote-actions';

interface Fiche {
  id: string;
  titre: string;
  plateforme: 'etsy' | 'payhip' | 'gumroad';
  url: string | null;
}

const NOMS = { etsy: 'Etsy', payhip: 'Payhip', gumroad: 'Gumroad' } as const;

function LigneFiche({ fiche }: { fiche: Fiche }) {
  const [url, setUrl] = useState(fiche.url ?? '');
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [enCours, demarrer] = useTransition();
  const modifie = url.trim() !== (fiche.url ?? '');

  return (
    <li className="space-y-1 py-3">
      <p className="text-sm font-bold">
        {fiche.titre} <span className="font-normal text-soft">· {NOMS[fiche.plateforme]}</span>
        {fiche.url ? <span className="text-ok"> · lien ✓</span> : <span className="text-wait"> · sans lien</span>}
      </p>
      <div className="flex gap-2">
        <input type="url" inputMode="url" placeholder="https://payhip.com/b/…" value={url}
          aria-label={`Lien de ${fiche.titre}`}
          onChange={(e) => { setUrl(e.target.value); setResultat(null); }} />
        <button type="button" className="btn btn-ghost shrink-0" disabled={enCours || !modifie}
          onClick={() => demarrer(async () => setResultat(await actionLienProduit(fiche.id, url)))}>
          Enregistrer
        </button>
      </div>
      {resultat && (
        <p role="status" className={`text-xs font-bold ${resultat.ok ? 'text-ok' : 'text-err'}`}>{resultat.message}</p>
      )}
    </li>
  );
}

/**
 * Le lien de chaque fiche : c'est lui qui rend un produit « diffusable ».
 * L'export Etsy des fiches ne contient pas leur adresse, d'où la saisie ici.
 */
export function FichesLiens({ produits }: { produits: Fiche[] }) {
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [enCours, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);
  const avecLien = produits.filter((p) => p.url).length;

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Tes fiches et leurs liens</h2>
        <p className="text-sm text-soft">
          {avecLien} fiche{avecLien > 1 ? 's' : ''} sur {produits.length} avec un lien. Seules les fiches qui ont
          un lien sont mises en avant sur Instagram, Facebook et Pinterest. Le lien se copie depuis la barre
          d’adresse, sur la page publique de la fiche (Payhip, Etsy…). Les fiches avec un lien apparaissent
          aussi sur ta page publique <a href="/boutique" className="font-bold underline">/boutique</a>.
        </p>
      </div>

      {produits.length > 0 && (
        <ul className="divide-y divide-line">{produits.map((f) => <LigneFiche key={f.id} fiche={f} />)}</ul>
      )}

      <form ref={formulaire} className="space-y-2 rounded-xl bg-muted p-3"
        action={(d) => demarrer(async () => {
          const r = await actionAjouterProduit(d);
          setResultat(r);
          if (r.ok) formulaire.current?.reset();
        })}>
        <p className="text-sm font-bold">Ajouter une fiche à la main</p>
        <input name="titre" placeholder="Nom du produit (comme sur ta boutique)" required maxLength={200} />
        <input name="url" type="url" inputMode="url" placeholder="https://payhip.com/b/…" required />
        <div className="flex gap-2">
          <select name="plateforme" defaultValue="payhip" aria-label="Plateforme">
            <option value="payhip">Payhip</option>
            <option value="etsy">Etsy</option>
            <option value="gumroad">Gumroad</option>
          </select>
          <button type="submit" className="btn btn-primary shrink-0" disabled={enCours}>Ajouter</button>
        </div>
        {resultat && (
          <p role="status" className={`text-sm font-bold ${resultat.ok ? 'text-ok' : 'text-err'}`}>{resultat.message}</p>
        )}
      </form>
    </section>
  );
}
