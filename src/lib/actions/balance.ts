'use client';

/** Solde entre parents. L'autorité est la fonction serveur household_balance. */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';
import { computePairBalance, type ExpenseForBalance, type ReimbursementForBalance } from '../money';
import type { Solde, DepenseListe, Remboursement } from './types';

// ---------------- Solde du foyer (autorité : le serveur) ----------------
export async function getSolde(householdId: string): Promise<ActionResult<Solde>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('household_balance', { p_household: householdId });
  if (error) {
    // Fenêtre de déploiement : le code est en ligne, la migration pas encore appliquée.
    const absente = /does not exist|PGRST202|schema cache|42883/i.test(
      `${error.message ?? ''} ${(error as { code?: string }).code ?? ''}`);
    if (absente) return err('SOLDE_SERVEUR_ABSENT');
    return err(lisible('Le solde n’a pas pu être calculé.', error), detail(error));
  }
  const l = Array.isArray(data) ? data[0] : data;
  if (!l) return err('Le solde n’a pas pu être calculé.');
  return ok({
    netCents: Number(l.net_cents ?? 0),
    parent1: l.parent_1 as string,
    parent2: (l.parent_2 as string) ?? null,
    debiteur: (l.debiteur as string) ?? null,
    crediteur: (l.crediteur as string) ?? null,
    equilibre: Boolean(l.equilibre),
    depensesComptees: Number(l.depenses_prises_en_compte ?? 0),
    depensesTotalCents: Number(l.depenses_total_cents ?? 0),
    remboursementsComptes: Number(l.remboursements_pris_en_compte ?? 0),
    remboursementsTotalCents: Number(l.remboursements_total_cents ?? 0),
    provisoire: false,
  });
}

/**
 * Repli transitoire, utilisé uniquement si la fonction serveur n'est pas encore
 * installée. Volontairement UNIQUE et partagé par tous les écrans : c'est la
 * divergence entre deux calculs locaux qui produisait deux soldes différents.
 * À supprimer une fois la migration 00013 appliquée partout.
 */
export function soldeLocalTransitoire(
  parent1: string, parent2: string | null,
  depenses: DepenseListe[], remboursements: Remboursement[],
): Solde {
  const COMPTABLES = ['validated', 'partially_reimbursed', 'reimbursed'];
  let net = 0;
  let nbDep = 0; let totalDep = 0;
  if (parent2) {
    for (const d of depenses) {
      if (!COMPTABLES.includes(d.statut)) continue;
      nbDep += 1; totalDep += d.montantCents;
      for (const p of d.parts) {
        if (d.payePar === parent1 && p.parentId === parent2) net += p.owedCents;
        else if (d.payePar === parent2 && p.parentId === parent1) net -= p.owedCents;
      }
    }
    for (const r of remboursements) {
      if (r.deParent === parent2 && r.versParent === parent1) net -= r.montantCents;
      else if (r.deParent === parent1 && r.versParent === parent2) net += r.montantCents;
    }
  }
  return {
    netCents: net, parent1, parent2,
    debiteur: net > 0 ? parent2 : net < 0 ? parent1 : null,
    crediteur: net > 0 ? parent1 : net < 0 ? parent2 : null,
    equilibre: net === 0,
    depensesComptees: nbDep, depensesTotalCents: totalDep,
    remboursementsComptes: remboursements.length,
    remboursementsTotalCents: remboursements.reduce((t, r) => t + r.montantCents, 0),
    provisoire: true,
  };
}
