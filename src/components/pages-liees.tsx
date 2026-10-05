import Link from 'next/link';
import { autresPages } from '@/lib/marketing/pages-thematiques';

/**
 * Liens vers les autres pages thématiques.
 *
 * Une page qui ne mène nulle part reste isolée, pour le lecteur comme pour
 * le moteur qui la parcourt : c'était le défaut des pages de conseil. Chaque
 * page thématique renvoie donc vers toutes les autres.
 */
export function PagesLiees({ chemin }: { chemin: string }) {
  return (
    <nav aria-labelledby="pages-liees" className="space-y-3 border-t border-black/10 pt-6">
      <h2 id="pages-liees" className="font-display text-xl font-semibold">
        Pour aller plus loin
      </h2>
      <ul className="space-y-2">
        {autresPages(chemin).map((page) => (
          <li key={page.chemin}>
            <Link href={page.chemin} className="font-bold text-navy-text underline">
              {page.libelle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
