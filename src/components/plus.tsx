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
  ['Confidentialité', 'Export de vos données, droits RGPD', '/app/confidentialite'],
  ['Documents', 'Ordonnances, attestations, papiers scolaires', '/app/documents'],
  ['Messages', 'Échanges liés au planning et aux dépenses', null],
  ['Abonnement', '3 mois gratuits, puis Zen Plus', '/app/offre'],
  ['Aide', 'Diagnostic guidé et questions fréquentes', '/aide'],
];

/**
 * Écran « Plus ».
 *
 * L'accès à l'administration y figure parce que l'application installée n'a
 * pas de barre d'adresse : sans lien, la page est inatteignable depuis
 * l'écran d'accueil, alors même qu'elle s'ouvre sans peine dans Safari.
 *
 * La décision d'afficher ce lien est prise sur le serveur et transmise ici.
 * Un composant client ne peut pas la prendre lui-même : la liste des
 * administrateurs n'a rien à faire dans un navigateur, et un contrôle fait
 * là serait de toute façon contournable.
 */
export function Plus({ estAdministrateur }: { estAdministrateur: boolean }) {
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

      {estAdministrateur && (
        <ul className="card divide-y divide-line">
          <li>
            <Link href="/admin" className="flex min-h-14 w-full items-center justify-between px-4 py-2 text-left">
              <span>
                <span className="block font-bold">Publications</span>
                <span className="block text-sm text-soft">Valider la semaine, suspendre, mesurer</span>
              </span>
              <span aria-hidden className="text-soft">›</span>
            </Link>
          </li>
        </ul>
      )}

      <button className="btn btn-ghost w-full"
        onClick={async () => { await seDeconnecter(); router.push('/'); router.refresh(); }}>
        Se déconnecter
      </button>
      <BottomNav active="/app/plus" />
    </main>
  );
}
