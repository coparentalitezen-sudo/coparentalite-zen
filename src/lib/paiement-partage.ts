/**
 * Paiement partagé entre les deux parents — logique pure.
 *
 * Ce module ne connaît ni Stripe, ni Supabase, ni React. Il décrit trois
 * choses, et rien d'autre :
 *   1. comment un montant se coupe en deux sans perdre ni inventer un centime ;
 *   2. quel est l'état global d'un partage à partir de l'état de ses parts ;
 *   3. quand une demande est périmée.
 *
 * Le tenir à l'écart de toute dépendance permet de le tester exhaustivement,
 * ce qui compte : une erreur d'un centime ici est une erreur de facturation.
 */

/** Durée de validité d'une demande de partage, à compter de son émission. */
export const DUREE_DEMANDE_JOURS = 7;

/**
 * Délai laissé au second parent pour régler sa part, une fois la demande
 * acceptée. Court volontairement : au-delà, la part déjà payée doit être
 * remboursée, opération manuelle que l'on veut rare.
 */
export const DELAI_REGLEMENT_HEURES = 72;

export type TypePart = 'full' | 'half';

/**
 * Cycle de vie d'une part.
 *
 * Reflète exactement le check contraint en base (migration 00046). Aucune
 * carte n'est débitée avant ready_to_charge : le parcours prend d'abord les
 * deux empreintes, puis débite.
 *
 *   awaiting_first_setup   empreinte du parent qui ouvre le partage
 *   awaiting_partner       en attente de la réponse de l'autre parent
 *   awaiting_second_setup  accepté, empreinte du second parent attendue
 *   ready_to_charge        empreinte prise, aucun débit encore
 *   processing             abonnement Stripe créé, paiement en cours
 *   paid                   réglée et confirmée par Stripe
 *   past_due               impayé : ouvre la période de grâce, ne coupe pas
 *   failed                 échec franc du moyen de paiement
 *   refused                l'autre parent a décliné la demande
 *   expired                délai dépassé sans règlement
 *   canceled               partage abandonné
 */
export type StatutPart =
  | 'awaiting_first_setup' | 'awaiting_partner' | 'awaiting_second_setup'
  | 'ready_to_charge' | 'processing'
  | 'paid' | 'past_due' | 'failed' | 'refused' | 'expired' | 'canceled';

/** États terminaux : une part qui y entre ne repart pas vers un paiement. */
const TERMINAUX: ReadonlySet<StatutPart> = new Set<StatutPart>([
  'refused', 'expired', 'canceled',
]);

export function estTerminal(statut: StatutPart): boolean {
  return TERMINAUX.has(statut);
}

/**
 * État global d'un foyer vis-à-vis de son partage.
 *
 *   aucun            pas de partage en cours
 *   attente_accord   l'autre parent n'a pas encore répondu
 *   attente_paiement accepté, aucune part réglée
 *   moitie_payee     une part réglée, l'autre attendue
 *   actif            les deux parts réglées — l'abonnement peut être ouvert
 *   echec            une part a échoué
 *   refuse           l'autre parent a décliné
 *   expire           délai dépassé
 *   remboursement_du une part payée, l'autre perdue : régularisation attendue
 */
export type EtatPartage =
  | 'aucun' | 'attente_accord' | 'attente_paiement' | 'moitie_payee'
  | 'actif' | 'echec' | 'refuse' | 'expire' | 'remboursement_du';

export interface Part {
  statut: StatutPart;
  montantCents: number;
}

/**
 * Coupe un montant en deux parts strictement égales à un centime près.
 *
 * Travaille en centimes exclusivement : aucun flottant n'intervient, donc
 * aucune dérive d'arrondi. Sur un montant impair, la première part reçoit le
 * centime supplémentaire — règle déterministe, toujours la même, de sorte que
 * deux appels sur le même montant ne se contredisent jamais.
 *
 * Garantit : premiere + seconde === total, et premiere - seconde ∈ {0, 1}.
 */
export function repartirMoitie(totalCents: number): { premiere: number; seconde: number } {
  if (!Number.isInteger(totalCents)) {
    throw new Error('Le montant doit être exprimé en centiemes entiers.');
  }
  if (totalCents < 0) {
    throw new Error('Le montant ne peut pas être négatif.');
  }
  const seconde = Math.floor(totalCents / 2);
  return { premiere: totalCents - seconde, seconde };
}

/**
 * Vérifie qu'un couple de parts reconstitue exactement le prix affiché.
 * Employé avant d'ouvrir Stripe : mieux vaut refuser d'encaisser que de
 * facturer un total qui ne correspond pas au tarif annoncé.
 */
export function sommeCoherente(parts: readonly number[], totalCents: number): boolean {
  return parts.reduce((s, p) => s + p, 0) === totalCents;
}

/**
 * Une demande est-elle périmée ?
 * Comparaison en millisecondes ; une date illisible est traitée comme périmée,
 * parce qu'un partage dont on ignore l'échéance ne doit pas rester ouvert.
 */
export function estExpiree(expiresAt: string | Date | null, maintenant: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const echeance = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const t = echeance.getTime();
  if (!Number.isFinite(t)) return true;
  return t <= maintenant.getTime();
}

/** Échéance d'une demande émise maintenant. */
export function echeanceDemande(depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + DUREE_DEMANDE_JOURS * 24 * 3600 * 1000);
}

/** Échéance de règlement, une fois la demande acceptée. */
export function echeanceReglement(depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + DELAI_REGLEMENT_HEURES * 3600 * 1000);
}

/**
 * Déduit l'état global d'un partage à partir de ses parts.
 *
 * Volontairement total et déterministe : le même jeu de parts donne toujours
 * le même état, quel que soit l'ordre dans lequel les webhooks sont arrivés.
 * C'est ce qui rend le recalcul idempotent — rejouer un événement Stripe ne
 * peut pas faire avancer l'état tout seul.
 */
export function etatPartage(parts: readonly Part[]): EtatPartage {
  if (parts.length === 0) return 'aucun';

  const nb = (s: StatutPart) => parts.filter((p) => p.statut === s).length;
  const payees = nb('paid');

  // Paiement intégral : une seule part suffit à tout.
  if (parts.length === 1) {
    switch (parts[0].statut) {
      case 'paid': return 'actif';
      case 'failed': return 'echec';
      case 'expired': return 'expire';
      case 'canceled': return 'aucun';
      default: return 'attente_paiement';
    }
  }

  if (payees === parts.length) return 'actif';
  if (nb('refused') > 0) return payees > 0 ? 'remboursement_du' : 'refuse';
  if (nb('expired') > 0) return payees > 0 ? 'remboursement_du' : 'expire';
  if (nb('failed') > 0) return 'echec';
  if (payees > 0) return 'moitie_payee';
  if (nb('awaiting_partner') > 0 || nb('awaiting_first_setup') > 0) return 'attente_accord';
  return 'attente_paiement';
}

/**
 * L'accès du foyer doit-il être ouvert ?
 *
 * Une seule règle, et elle est stricte : toutes les parts attendues sont
 * confirmées payées. L'accord de l'autre parent ne suffit jamais — seule la
 * confirmation Stripe compte.
 */
export function abonnementOuvrable(parts: readonly Part[]): boolean {
  return parts.length > 0 && parts.every((p) => p.statut === 'paid');
}

/**
 * Le partage 50/50 est-il proposé sur cette installation ?
 *
 * Deux conditions cumulatives : l'indicateur est levé, et la formule choisie
 * est l'annuelle. Le mensuel est exclu par décision commerciale — deux frais
 * fixes Stripe sur un petit montant absorberaient une part disproportionnée
 * du règlement.
 */
export function partageDisponible(periodicite: 'month' | 'year'): boolean {
  return process.env.PAYMENT_SPLIT_ENABLED === 'true' && periodicite === 'year';
}

/** Formatage d'un montant en centimes, pour affichage avant confirmation. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(cents / 100);
}

/**
 * Agrégation d'un partage — reflet exact des règles de recalculer_partage().
 *
 * Existe pour deux raisons. D'abord parce que ces règles doivent être
 * testables sans base de données. Ensuite parce que l'interface doit pouvoir
 * afficher l'état d'un partage sans attendre un aller-retour serveur.
 *
 * L'autorité reste la base : si les deux divergent, c'est le SQL qui a
 * raison, et cette fonction est à corriger.
 */
export interface Arrangement {
  mode: TypePart;
  partsAttendues: 1 | 2;
  totalCents: number;
  expireLe?: string | Date | null;
}

export type EtatAgrege =
  | 'aucun' | 'invalide' | 'expire' | 'actif'
  | 'remboursement_du' | 'interrompu' | 'grace'
  | 'moitie_payee' | 'en_attente';

/**
 * Ne fait pas avancer un compteur : elle recalcule à partir de l'ensemble
 * des parts. Rejouer un événement, ou les recevoir dans le désordre, donne
 * donc toujours le même résultat.
 */
export function agreger(
  arrangement: Arrangement,
  parts: readonly { statut: StatutPart; montantCents: number; parentId: string }[],
  maintenant: Date = new Date(),
): EtatAgrege {
  const vives = parts.filter((p) => p.statut !== 'canceled');
  if (vives.length === 0 && parts.length === 0) return 'aucun';

  const parents = new Set(vives.map((p) => p.parentId)).size;
  const somme = vives.reduce((s, p) => s + p.montantCents, 0);
  const payees = vives.filter((p) => p.statut === 'paid').length;
  const perdues = vives.filter(
    (p) => p.statut === 'failed' || p.statut === 'refused' || p.statut === 'expired',
  ).length;
  const retard = vives.filter((p) => p.statut === 'past_due').length;

  // Cohérence du groupe. Le nombre attendu vient de l'arrangement, jamais du
  // nombre de parts trouvées.
  if (vives.length > arrangement.partsAttendues
      || parents !== vives.length
      || (vives.length === arrangement.partsAttendues && somme !== arrangement.totalCents)) {
    return 'invalide';
  }

  if (estExpiree(arrangement.expireLe ?? null, maintenant)
      && payees < arrangement.partsAttendues) {
    return 'expire';
  }

  if (vives.length === arrangement.partsAttendues && payees === arrangement.partsAttendues) {
    return 'actif';
  }

  if (perdues > 0) return payees > 0 ? 'remboursement_du' : 'interrompu';
  if (retard > 0) return 'grace';
  if (payees > 0) return 'moitie_payee';
  return 'en_attente';
}

/**
 * Disponibilité côté navigateur.
 *
 * PAYMENT_SPLIT_ENABLED n'est lisible que sur le serveur. L'interface a
 * besoin de la même réponse pour ne pas afficher un bouton qui serait ensuite
 * refusé par la route — d'où ce doublon public. La décision qui fait foi
 * reste celle du serveur : partageDisponible() est revérifiée dans
 * /api/paiement/partage, et un client modifié n'obtient rien de plus.
 */
export function partageDisponibleClient(periodicite: 'month' | 'year'): boolean {
  return process.env.NEXT_PUBLIC_PAYMENT_SPLIT_ENABLED === 'true' && periodicite === 'year';
}

/** Libellés des états, tels qu'ils sont montrés aux deux parents. */
export function libelleEtat(etat: EtatAgrege): string {
  switch (etat) {
    case 'en_attente': return 'En attente de l’autre parent';
    case 'moitie_payee': return 'Une moitié réglée, l’autre attendue';
    case 'actif': return 'Abonnement activé';
    case 'grace': return 'Paiement en difficulté — accès maintenu';
    case 'remboursement_du': return 'Règlement interrompu, régularisation en cours';
    case 'interrompu': return 'Règlement interrompu';
    case 'expire': return 'Demande expirée';
    case 'invalide': return 'Règlement incohérent';
    default: return 'Aucun règlement en cours';
  }
}
