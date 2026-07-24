/**
 * Indicateur de sérénité du foyer — COUCHE PRÉSENTATION UNIQUEMENT.
 *
 * Ce score mesure la COMPLÉTUDE ADMINISTRATIVE du foyer : ce qui est
 * configuré et ce qui est à jour. Il ne compare jamais les deux parents
 * et n'entre dans aucun calcul monétaire — le solde reste produit par
 * money.ts, seul juge des montants.
 *
 * Fonction pure : aucun accès réseau, aucun effet de bord, testable.
 */

export interface EtatFoyer {
  /** Le second parent a rejoint le foyer. */
  deuxParents: boolean;
  /** Au moins un enfant enregistré. */
  auMoinsUnEnfant: boolean;
  /** Un rythme de garde est défini. */
  rythmeDefini: boolean;
  /** Nombre de dépenses en attente de validation. */
  depensesEnAttente: number;
  /** Nombre de dépenses signalées à vérifier. */
  depensesAVerifier: number;
  /** Solde net entre parents, en centimes (0 = équilibré). */
  soldeCents: number;
}

export interface Serenite {
  pourcentage: number;
  libelle: string;
  /** Points d'attention restants, formulés positivement. */
  restant: string[];
}

const CRITERES: { poids: number; ok: (e: EtatFoyer) => boolean; manque: string }[] = [
  { poids: 25, ok: (e) => e.deuxParents, manque: 'Inviter le second parent' },
  { poids: 20, ok: (e) => e.auMoinsUnEnfant, manque: 'Ajouter un enfant' },
  { poids: 20, ok: (e) => e.rythmeDefini, manque: 'Définir le rythme de garde' },
  { poids: 15, ok: (e) => e.depensesEnAttente === 0, manque: 'Des dépenses attendent une validation' },
  { poids: 10, ok: (e) => e.depensesAVerifier === 0, manque: 'Des dépenses sont à vérifier' },
  { poids: 10, ok: (e) => e.soldeCents === 0, manque: 'Un montant reste à régulariser' },
];

export function calculerSerenite(e: EtatFoyer): Serenite {
  let points = 0;
  const restant: string[] = [];
  for (const c of CRITERES) {
    if (c.ok(e)) points += c.poids;
    else restant.push(c.manque);
  }
  const pourcentage = Math.max(0, Math.min(100, Math.round(points)));
  const libelle =
    pourcentage >= 90 ? 'Tout est à jour'
    : pourcentage >= 70 ? 'Presque à jour'
    : pourcentage >= 40 ? 'Quelques actions à faire'
    : 'Foyer à compléter';
  return { pourcentage, libelle, restant };
}
