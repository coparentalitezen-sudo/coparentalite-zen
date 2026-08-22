/**
 * Synthèse mensuelle du planning et des dépenses.
 *
 * Ce qu'un parent doit pouvoir produire : une page datée, lisible par un
 * tiers — médiateur, avocat, juge — qui montre qui a gardé les enfants
 * combien de jours, ce qui a été dépensé, et ce que chacun doit à l'autre.
 * C'est le document qu'on demande quand un désaccord dépasse le foyer.
 *
 * Aucun rendu ici : uniquement le calcul, qui se teste sans navigateur. La
 * mise en page appartient à l'écran, et la conversion en PDF au téléphone —
 * iOS sait imprimer une page en PDF, ce qui évite d'embarquer une
 * bibliothèque de rendu qui alourdirait chaque déploiement.
 */
import type { DayAssignment } from './custody';

/** Une dépense, réduite à ce dont la synthèse a besoin. */
export interface DepenseSynthese {
  id: string;
  titre: string;
  date: string;
  montantCents: number;
  payePar: string;
  statut: string;
  categorie: string | null;
  /** Part due par chaque parent, en centimes. */
  parts: { profileId: string; montantCents: number }[];
}

export interface LigneParent {
  profileId: string;
  /** Jours de garde sur le mois. */
  jours: number;
  /** Part des jours, en pourcentage entier. */
  pourcentJours: number;
  /** Ce que ce parent a effectivement décaissé. */
  avanceCents: number;
  /** Ce qui lui incombe selon la répartition convenue. */
  duCents: number;
}

export interface SyntheseMensuelle {
  /** Mois traité, au format AAAA-MM. */
  mois: string;
  premierJour: string;
  dernierJour: string;
  joursCouverts: number;
  parents: LigneParent[];
  depenses: DepenseSynthese[];
  totalCents: number;
  /**
   * Solde du premier parent vis-à-vis du second.
   * Positif : le second lui doit ; négatif : il doit au second.
   */
  soldeCents: number;
  /** Dépenses non validées, signalées à part : elles faussent toute lecture. */
  enAttente: number;
}

/** Premier et dernier jour d'un mois AAAA-MM, en ISO. */
export function bornesDuMois(mois: string): { debut: string; fin: string } {
  const [annee, m] = mois.split('-').map(Number);
  const debut = `${mois}-01`;
  // Le jour 0 du mois suivant est le dernier du mois courant, années
  // bissextiles comprises — inutile de les traiter à part.
  const dernier = new Date(Date.UTC(annee, m, 0));
  const fin = dernier.toISOString().slice(0, 10);
  return { debut, fin };
}

/** Vrai si la date ISO tombe dans le mois AAAA-MM. */
export function dansLeMois(date: string, mois: string): boolean {
  return date.slice(0, 7) === mois;
}

/**
 * Assemble la synthèse.
 *
 * Les dépenses contestées ou en attente sont comptées dans le total mais
 * signalées : les taire donnerait un document faux, les mêler sans mention
 * donnerait un document contestable.
 */
export function synthetiser(
  mois: string,
  jours: DayAssignment[],
  depenses: DepenseSynthese[],
  profils: string[],
): SyntheseMensuelle {
  const { debut, fin } = bornesDuMois(mois);
  const duMois = depenses.filter((d) => dansLeMois(d.date, mois));

  const compte = new Map<string, number>();
  for (const j of jours) {
    if (!dansLeMois(j.date, mois)) continue;
    compte.set(j.parentId, (compte.get(j.parentId) ?? 0) + 1);
  }
  const joursCouverts = [...compte.values()].reduce((s, n) => s + n, 0);

  const avance = new Map<string, number>();
  const du = new Map<string, number>();
  for (const d of duMois) {
    avance.set(d.payePar, (avance.get(d.payePar) ?? 0) + d.montantCents);
    for (const p of d.parts) {
      du.set(p.profileId, (du.get(p.profileId) ?? 0) + p.montantCents);
    }
  }

  const parents: LigneParent[] = profils.map((profileId) => {
    const n = compte.get(profileId) ?? 0;
    return {
      profileId,
      jours: n,
      pourcentJours: joursCouverts === 0 ? 0 : Math.round((n / joursCouverts) * 100),
      avanceCents: avance.get(profileId) ?? 0,
      duCents: du.get(profileId) ?? 0,
    };
  });

  const totalCents = duMois.reduce((s, d) => s + d.montantCents, 0);

  // Le solde se lit du point de vue du premier parent : ce qu'il a avancé
  // au-delà de sa part est ce que l'autre lui doit.
  const premier = parents[0];
  const soldeCents = premier ? premier.avanceCents - premier.duCents : 0;

  return {
    mois,
    premierJour: debut,
    dernierJour: fin,
    joursCouverts,
    parents,
    depenses: [...duMois].sort((a, b) => a.date.localeCompare(b.date)),
    totalCents,
    soldeCents,
    // Statuts tels qu'ils figurent en base : une dépense remboursée est
    // acquise au même titre qu'une dépense validée.
    enAttente: duMois.filter((d) =>
      d.statut !== 'validated' && d.statut !== 'reimbursed').length,
  };
}

/** Douze derniers mois, du plus récent au plus ancien, au format AAAA-MM. */
export function moisDisponibles(aujourdhui: Date, combien = 12): string[] {
  const liste: string[] = [];
  for (let i = 0; i < combien; i += 1) {
    const d = new Date(Date.UTC(
      aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() - i, 1,
    ));
    liste.push(d.toISOString().slice(0, 7));
  }
  return liste;
}

/** Nom du mois en toutes lettres, pour le titre du rapport. */
export function nomDuMois(mois: string): string {
  const [annee, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(annee, m - 1, 1))
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
