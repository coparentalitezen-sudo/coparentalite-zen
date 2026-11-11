import type { Metadata } from 'next';
import Link from 'next/link';
import { anneeScolaireDuProchainNoel, dateLongue, lireNoelOfficiel } from '@/lib/noel';
import { Planificateur } from './planificateur';

/**
 * Produit d'appel : le planning des vacances de Noël en trois choix.
 *
 * Destiné au lien de la bio Instagram et aux publications de décembre. Aucun
 * compte n'est demandé pour obtenir le planning ; l'inscription n'est
 * proposée qu'après, pour le garder. Les dates sont lues dans la source
 * officielle (lib/noel.ts) : si elle ne répond pas, la page le dit au lieu
 * d'afficher des dates supposées.
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';
const CANONIQUE = new URL('/planning-noel', BASE).toString();

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const annee = anneeScolaireDuProchainNoel(new Date().toISOString()).slice(0, 4);
  const titre = `Noël ${annee} chez qui ? Ton planning de garde en 1 minute`;
  const description = 'Choisis comment vous partagez Noël et qui a le 25 : le planning des vacances '
    + `de Noël ${annee} s’affiche avec les dates officielles, à enregistrer en image. Gratuit, sans inscription.`;
  return {
    title: titre,
    description,
    alternates: { canonical: CANONIQUE },
    openGraph: { title: titre, description, type: 'website', url: CANONIQUE },
  };
}

export default async function PlanningNoel() {
  const noel = await lireNoelOfficiel(anneeScolaireDuProchainNoel(new Date().toISOString()));
  const annee = noel?.premierJour.slice(0, 4) ?? anneeScolaireDuProchainNoel(new Date().toISOString()).slice(0, 4);

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8">
      <header className="space-y-3">
        <Link href="/" className="text-sm font-bold text-navy-text underline">CoparentalitéZen</Link>
        <p className="text-xs font-bold uppercase tracking-wide text-soft/70">Gratuit · sans inscription</p>
        <h1 className="font-display text-3xl font-semibold leading-tight">
          Noël {annee} chez qui ? Ton planning en 1 minute
        </h1>
        {noel ? (
          <p className="leading-relaxed text-soft">
            Vacances du {dateLongue(noel.premierJour, false)} au {dateLongue(noel.dernierJour)},
            mêmes dates pour les zones A, B et C. Deux choix, et le planning s’affiche.
          </p>
        ) : null}
      </header>

      <div className="mt-8">
        {noel ? (
          <Planificateur noel={noel} />
        ) : (
          <p className="card p-5 leading-relaxed text-soft">
            Le calendrier scolaire officiel ne répond pas pour le moment, et nous préférons ne
            rien afficher plutôt que des dates supposées. Réessaie dans quelques minutes, ou lis{' '}
            <Link href="/vacances-noel-garde-alternee" className="font-bold text-navy-text underline">
              notre guide des vacances de Noël en garde alternée
            </Link>.
          </p>
        )}
      </div>
    </main>
  );
}
