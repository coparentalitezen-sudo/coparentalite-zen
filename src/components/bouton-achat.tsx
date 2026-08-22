'use client';

/**
 * Bouton d'achat de la page d'accueil.
 *
 * Le visiteur n'est pas connecté : aucune session Stripe ne peut être ouverte
 * ici. Le bouton mémorise son choix, puis l'envoie créer son espace. Au
 * retour, la page d'offre rouvre exactement ce qu'il avait sélectionné.
 *
 * Il ne mène donc jamais à une impasse, et ne promet jamais un paiement qu'il
 * ne peut pas engager : ce qu'il annonce, c'est la création de l'espace.
 */
import { useRouter } from 'next/navigation';
import { memoriserIntention } from '@/lib/intention-achat';

export function BoutonAchat({
  type, periodicite, extensionId, libelle, variante = 'primary',
}: {
  type: 'abonnement' | 'extension';
  periodicite?: 'month' | 'year';
  extensionId?: string;
  libelle: string;
  variante?: 'primary' | 'ghost';
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={`btn ${variante === 'primary' ? 'btn-primary' : 'btn-ghost'} mt-7 w-full`}
      onClick={() => {
        // Une intention, jamais un montant : le serveur relira le tarif et
        // revérifiera l'appartenance au foyer avant d'ouvrir quoi que ce soit.
        memoriserIntention({ type, periodicite, extensionId });
        router.push('/inscription');
      }}
    >
      {libelle}
    </button>
  );
}
