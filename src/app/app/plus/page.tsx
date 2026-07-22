import Link from 'next/link';
import { BottomNav } from '@/components/ui';

const items = [
  ['Enfants', 'Léa et Noah', null], ['Documents', 'Justificatifs, attestations…', null],
  ['Messages', 'Échanges liés au planning et aux dépenses', null], ['Rapports', 'PDF mensuel et annuel, CSV, ICS', null],
  ['Notifications', 'Préférences par catégorie', null],
  ['Paramètres du foyer', 'Invitation, membres, suppression', '/app/foyer'],
  ['Abonnement', 'Gratuit — découvrir Premium', null], ['Aide', 'Guide et questions fréquentes', null],
  ['Confidentialité', 'Export de vos données, droits RGPD', '/app/foyer'],
] as const;

export default function Plus() {
  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Plus</h1>
      <ul className="card divide-y divide-line">
        {items.map(([label, sub, href]) => (
          <li key={label}>
            {href ? (
              <Link href={href} className="flex min-h-14 w-full items-center justify-between px-4 py-2 text-left">
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-soft">{sub}</span>
                </span>
                <span aria-hidden className="text-soft">›</span>
              </Link>
            ) : (
              <button className="flex min-h-14 w-full items-center justify-between px-4 py-2 text-left" type="button">
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-soft">{sub}</span>
                </span>
                <span aria-hidden className="text-soft">›</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <Link href="/" className="btn btn-ghost w-full">Se déconnecter</Link>
      <p className="text-center text-xs text-soft">
        Sections détaillées en cours de développement — la structure de navigation est définitive.
      </p>
      <BottomNav active="/app/plus" />
    </main>
  );
}
