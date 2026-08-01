'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui';
import { seDeconnecter } from '@/lib/actions';

const rubriques: [string, string, string | null][] = [
  ['Enfants', 'Ajouter, modifier, archiver', '/app/enfants'],
  ['Paramètres du foyer', 'Membres, rythme de garde, invitation', '/app/foyer'],
  ['Rendez-vous', 'Consultations, réunions, activités et affaires à prévoir', '/app/rendez-vous'],
  ['Vacances scolaires', 'Répartir les cinq périodes de l’année', '/app/vacances'],
  ['Changements et exceptions', 'Échanges, voyages, absences ponctuelles', '/app/exceptions'],
  ['Notifications', 'Choisir ce dont vous voulez être prévenu', '/app/notifications/reglages'],
  ['Votre offre', 'Durée du planning, Zen Plus, factures', '/app/offre'],
  ['Confidentialité', 'Export de vos données, droits RGPD', '/app/foyer'],
  ['Documents', 'Justificatifs et attestations', null],
  ['Messages', 'Échanges liés au planning et aux dépenses', null],
  ['Rapports', 'PDF mensuel et annuel, CSV, ICS', null],
  ['Notifications', 'Préférences par catégorie', null],
  ['Abonnement', 'Gratuit — découvrir Premium', null],
  ['Aide', 'Guide et questions fréquentes', null],
];

export default function Plus() {
  const router = useRouter();
  return (
    <main className="space-y-4 px-4 py-4">
      <h1 className="font-display text-xl font-semibold">Plus</h1>
      <ul className="card divide-y divide-line">
        {rubriques.map(([label, sous, href]) => (
          <li key={label}>
            {href ? (
              <Link href={href} className="flex min-h-14 w-full items-center justify-between px-4 py-2 text-left">
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-soft">{sous}</span>
                </span>
                <span aria-hidden className="text-soft">›</span>
              </Link>
            ) : (
              <div className="flex min-h-14 w-full items-center justify-between px-4 py-2 text-left opacity-60">
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-soft">{sous}</span>
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-soft">À venir</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost w-full"
        onClick={async () => { await seDeconnecter(); router.push('/'); router.refresh(); }}>
        Se déconnecter
      </button>
      <BottomNav active="/app/plus" />
    </main>
  );
}
