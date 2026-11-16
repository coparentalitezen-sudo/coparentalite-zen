import type { Metadata } from 'next';
import Link from 'next/link';
import { lireVitrine } from '@/lib/copilote/depot-contenus';
import { NOMS_PLATEFORMES } from '@/lib/copilote/types';

/**
 * Page boutique publique : les modèles en vente, chacun vers sa fiche.
 *
 * Elle existe pour Instagram, où aucun lien n'est cliquable dans une légende :
 * « coparentalitezen.fr/boutique » se tape en quelques secondes, et peut aussi
 * aller dans la biographie. Seules les fiches qui ont un lien y figurent ;
 * chaque bouton passe par /p/<id>, qui compte le clic puis redirige.
 *
 * Aucun prix n'est affiché : il fait foi sur la plateforme de vente, et un
 * prix recopié ici finirait par être faux.
 */
export const revalidate = 600;

const BASE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.coparentalitezen.fr';

export const metadata: Metadata = {
  title: 'Modèles à télécharger — CoparentalitéZen',
  description: 'Modèles numériques pour organiser la garde alternée, le budget et la vie de famille.',
  alternates: { canonical: new URL('/boutique', BASE).toString() },
};

export default async function Boutique() {
  const fiches = await lireVitrine();

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-12">
      <header className="space-y-3">
        <Link href="/" className="text-sm font-bold text-navy-text underline">CoparentalitéZen</Link>
        <p className="text-xs font-bold uppercase tracking-wide text-soft">Boutique</p>
        <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
          Modèles à télécharger
        </h1>
        <p className="text-lg leading-relaxed text-soft">
          Des fichiers prêts à remplir pour organiser la garde, le budget et le quotidien de la famille.
          Fichiers numériques : rien n’est envoyé par la poste.
        </p>
      </header>

      {fiches.length === 0 ? (
        <p className="card mt-6 p-4 text-soft">Les modèles arrivent bientôt.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {fiches.map((f) => (
            <li key={f.id} className="card flex items-center gap-4 p-4">
              {f.imageUrl && (
                // Image hébergée par la plateforme de vente : next/image exigerait de déclarer chaque domaine.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.imageUrl} alt="" width={96} height={96}
                  className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <h2 className="font-bold leading-snug">{f.titre}</h2>
                <a href={`/p/${f.id}`} className="btn btn-primary w-full sm:w-auto" rel="nofollow">
                  Voir sur {NOMS_PLATEFORMES[f.plateforme]}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm text-soft">
        Ces modèles sont des outils d’organisation : ils ne remplacent pas un conseil juridique.
      </p>
    </main>
  );
}
