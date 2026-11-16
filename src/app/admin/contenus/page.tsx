import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import {
  lireContenusProduits, lireAutoValider, etatsReserve, clicsBoutique, urlVisuelProduit,
} from '@/lib/copilote/depot-contenus';
import { ajouterJours, jourIso } from '@/lib/copilote/dates';
import { CopiloteNav } from '@/components/copilote-nav';
import { CarteContenu, ReglagesPosts } from './cartes';

/**
 * File de validation des publications produits.
 *
 * Valider une publication la dépose dans la réserve : la tâche quotidienne la
 * publie alors sur Instagram et Facebook à sa date, et elle entre dans le
 * flux Pinterest. Tant qu'elle n'est partie nulle part, elle peut être retirée.
 */
export const dynamic = 'force-dynamic';

export default async function PageContenus() {
  const supabase = await supabaseServer();
  if (!supabase) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) notFound();

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
  const [attente, programmes, auto, clics] = await Promise.all([
    lireContenusProduits(['en_attente'], 20),
    lireContenusProduits(['programme'], 12),
    lireAutoValider(),
    clicsBoutique(ajouterJours(jourIso(new Date()), -29)),
  ]);
  const etats = await etatsReserve(programmes.map((p) => p.reserveId).filter((x): x is string => Boolean(x)));
  const clicsPar = new Map(clics.map((c) => [c.reference, c]));

  const vers = (c: (typeof attente)[number]) => ({
    ...c,
    visuel: urlVisuelProduit(base, c.reference, 'carre') ?? '',
    etat: c.reserveId ? etats[c.reserveId] ?? null : null,
    clics: clicsPar.get(c.reference)?.parSource ?? {},
  });

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-4 px-4 py-6">
      <CopiloteNav actif="contenus" />
      <h1 className="font-display text-2xl font-semibold">Posts produits</h1>
      <p className="text-sm text-soft">
        Deux publications par semaine (mardi et vendredi) sur tes fiches qui ont un lien. Une fois validées,
        elles partent sur Instagram et Facebook à leur date, et sur Pinterest. Le lien Facebook et Pinterest
        compte les clics, puis renvoie vers ta fiche.
      </p>

      <ReglagesPosts autoValider={auto} />

      {attente.length === 0 ? (
        <p className="card p-4 text-sm text-soft">
          Rien à valider. Les publications sont préparées chaque lundi, à condition qu’au moins une fiche ait
          un lien dans <Link href="/admin/boutique" className="font-bold underline">Boutiques</Link>.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">À valider</h2>
          {attente.map((c) => <CarteContenu key={c.id} contenu={vers(c)} />)}
        </section>
      )}

      {programmes.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Programmées et publiées</h2>
          {programmes.map((c) => <CarteContenu key={c.id} contenu={vers(c)} />)}
        </section>
      )}
    </main>
  );
}
