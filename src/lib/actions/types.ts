'use client';

/** Types partagés par la couche d'accès aux données. */
import type { Allocation } from '../money';
import type { CustodyPattern } from '../custody';

export interface Membre {
  profileId: string; nom: string; role: string;
  couleur: 'navy' | 'coral' | 'sage'; initiale: string;
}
export interface Enfant { id: string; prenom: string; couleur: string; naissance: string | null; }
export interface Categorie { id: string; nom: string; }
export interface Foyer { id: string; nom: string; role: string; }
export interface Contexte {
  foyer: Foyer; membres: Membre[]; enfants: Enfant[];
  categories: Categorie[]; moi: string;
}

export interface DepenseListe {
  id: string; titre: string; montantCents: number; date: string;
  categorie: string | null; payePar: string; statut: string;
  enfants: string[]; parts: Allocation[]; justificatifs: number;
  creePar: string; categorieId: string | null; repartition: number | null;
  /** Motif de la dernière contestation, s'il y en a une. */
  motifContestation: string | null;
  contestePar: string | null;
}

export interface RegleGarde {
  pattern: CustodyPattern; startDate: string; parent1: string; parent2: string;
  /** Répartition jour par jour du rythme personnalisé, null pour les autres. */
  customCycle: ('P1' | 'P2')[] | null;
  /** Heure du passage d'un parent à l'autre, format HH:MM ; null si au lever. */
  handoverTime: string | null;
  /** Lieu convenu du passage, affiché aux deux parents. */
  handoverPlace: string | null;
}

/**
 * Code d'un type de période. Les cinq valeurs livrées sont indicatives : le
 * catalogue vit en base et peut en accueillir d'autres sans modification du
 * code.
 */
export type TypeException = 'holiday' | 'swap' | 'weekend' | 'travel' | 'absence' | (string & {});

export interface TypeExceptionInfo {
  code: string;
  libelle: string;
  librellePluriel: string;
  /** Rang de priorité ; le plus élevé l'emporte en cas de recouvrement. */
  priorite: number;
  icone: string;
  couleur: string;
  description: string | null;
  /** true si les dates se pré-remplissent depuis le calendrier officiel. */
  depuisCalendrier: boolean;
}

/** Une période de vacances officielle, et la décision des parents si elle existe. */
export interface PropositionVacances {
  holidayId: string;
  libelle: string;
  anneeScolaire: string | null;
  debutOfficiel: string;
  finOfficielle: string;
  exceptionId: string | null;
  parentId: string | null;
  debutRetenu: string | null;
  finRetenue: string | null;
  enfantsCouverts: number;
  enfantsTotal: number;
}

export interface ExceptionGarde {
  id: string;
  type: TypeException;
  typeLibelle: string;
  priorite: number;
  icone: string;
  couleur: string;
  anneeScolaire: string | null;
  enfantId: string;
  enfantPrenom: string;
  parentId: string;
  debut: string;          // ISO complet, heure comprise
  fin: string;
  titre: string | null;
  note: string | null;
  creePar: string;
  creeLe: string;
  modifieLe: string;
}

export interface Solde {
  netCents: number;          // > 0 : parent1 doit recevoir ; < 0 : parent1 doit régulariser
  parent1: string;
  parent2: string | null;
  debiteur: string | null;
  crediteur: string | null;
  equilibre: boolean;
  depensesComptees: number;
  depensesTotalCents: number;
  remboursementsComptes: number;
  remboursementsTotalCents: number;
  /** true = calcul local transitoire, la fonction serveur n'est pas encore installée. */
  provisoire: boolean;
}

export interface NouvelleDepense {
  householdId: string; titre: string; montantCents: number; date: string;
  categorieId: string | null; payePar: string; enfantIds: string[];
  regles: import('../money').ShareRule[]; justificatif?: File | null;
}

export interface Remboursement {
  id: string; deParent: string; versParent: string; montantCents: number;
  date: string; methode: string; reference: string | null; commentaire: string | null;
  justificatif: string | null; creePar: string;
}
