import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import { lireImports } from '@/lib/copilote/depot';
import { CopiloteNav } from '@/components/copilote-nav';
import { FormulaireImport } from './formulaire';

/**
 * Dépôt des exports CSV des boutiques.
 *
 * Remplace le « dossier » où l'on déposerait des fichiers : l'hébergeur ne
 * conserve aucun fichier d'une exécution à l'autre. Le fichier est lu,
 * converti en ventes, puis oublié — seules les ventes restent en base.
 */
export const dynamic = 'force-dynamic';

const NOMS = { etsy: 'Etsy', payhip: 'Payhip', gumroad: 'Gumroad', generique: 'Générique' } as const;
const TYPES = { ventes: 'Ventes', catalogue: 'Fiches', vues: 'Vues' } as const;

export default async function PageBoutique() {
  const supabase = await supabaseServer();
  if (!supabase) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) notFound();

  const imports = await lireImports(15);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <CopiloteNav actif="boutique" />
      <h1 className="font-display text-2xl font-semibold">Importer les exports</h1>

      <FormulaireImport />

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-display text-lg font-semibold">Où trouver chaque export</h2>
        <dl className="space-y-2">
          <div>
            <dt className="font-bold">Etsy · ventes</dt>
            <dd className="text-soft">Gestionnaire de boutique → Paramètres → Options → Télécharger les données
              → « Articles commandés » (EtsySoldOrderItems).</dd>
          </div>
          <div>
            <dt className="font-bold">Etsy · fiches</dt>
            <dd className="text-soft">Même écran → « Fiches actives » (titre, tags, description, prix).
              Sert aux améliorations de fiches.</dd>
          </div>
          <div>
            <dt className="font-bold">Gumroad · ventes</dt>
            <dd className="text-soft">Audience → Ventes → Exporter (CSV).</dd>
          </div>
          <div>
            <dt className="font-bold">Payhip · ventes</dt>
            <dd className="text-soft">Tableau de bord → Ventes → Exporter. Si le format n’est pas
              reconnu, choisis « Payhip » dans la liste.</dd>
          </div>
          <div>
            <dt className="font-bold">Format générique (n’importe quelle source)</dt>
            <dd className="text-soft">
              Colonnes <code>date ; plateforme ; commande ; produit ; quantite ; montant ; devise</code>.
              Pour les vues : <code>produit ; vues ; plateforme ; date</code> — vues des 30 derniers jours,
              recopiées depuis les statistiques de la boutique.
            </dd>
          </div>
        </dl>
        <p className="text-soft">
          Réimporter un fichier déjà déposé ne double aucune vente. Les ventes remboursées sont écartées.
        </p>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-display text-lg font-semibold">Derniers imports</h2>
        {imports.length === 0 ? (
          <p className="text-sm text-soft">Aucun import pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {imports.map((i) => (
              <li key={i.id} className="py-2">
                <p className="font-bold">
                  {NOMS[i.plateforme]} · {TYPES[i.type]} · {new Date(i.creeLe).toLocaleDateString('fr-FR')}
                </p>
                <p className="text-soft">
                  {i.fichier} — {i.lignesLues} ligne(s) lue(s), {i.ajoutees} ajoutée(s)
                  {i.ignorees > 0 ? `, ${i.ignorees} ignorée(s)` : ''}
                </p>
                {i.erreurs.length > 0 && (
                  <details className="text-soft">
                    <summary className="cursor-pointer">Remarques ({i.erreurs.length})</summary>
                    <ul className="list-disc pl-5">{i.erreurs.map((e, k) => <li key={k}>{e}</li>)}</ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
