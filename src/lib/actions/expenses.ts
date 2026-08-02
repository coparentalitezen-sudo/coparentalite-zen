'use client';

/** Dépenses : création transactionnelle, lecture, modification, revue. */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';
import { splitAmount, type ShareRule, type Allocation } from '../money';
import { deposerJustificatif } from './attachments';
import type { DepenseListe, NouvelleDepense } from './types';

// ---------------- Dépenses ----------------
export async function creerDepense(input: NouvelleDepense): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };

  let parts: Allocation[];
  try {
    parts = splitAmount(input.montantCents, input.regles);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Répartition invalide.');
  }

  const shares = parts.map((p) => {
    const regle = input.regles.find((r) => r.parentId === p.parentId);
    return {
      parent_id: p.parentId,
      owed_cents: p.owedCents,
      basis_points: regle && regle.kind === 'percentage' ? regle.basisPoints : null,
    };
  });

  const { data, error } = await supabase.rpc('create_expense_full', {
    p_household: input.householdId,
    p_title: input.titre,
    p_amount_cents: input.montantCents,
    p_spent_on: input.date,
    p_category_id: input.categorieId,
    p_paid_by: input.payePar,
    p_child_ids: input.enfantIds,
    p_shares: shares,
  });
  if (error) return err(lisible('L’enregistrement de la dépense n’a pas abouti.', error));

  const expenseId = data as string;
  if (input.justificatif) {
    const r = await deposerJustificatif(input.householdId, expenseId, input.justificatif);
    if (r.status === 'error') return err(`Dépense enregistrée, mais le justificatif n’a pas été joint : ${r.message}`);
  }
  return ok(expenseId);
}

export async function listerDepenses(householdId: string): Promise<ActionResult<DepenseListe[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const pageSize = 200;
  const toutes: Record<string, unknown>[] = [];
  for (let debut = 0; ; debut += pageSize) {
    const { data, error } = await supabase.from('expenses')
      .select(`id, title, amount_cents, spent_on, status, paid_by, created_by, category_id,
               expense_categories(name),
               expense_shares(parent_id, owed_cents, basis_points),
               expense_children(child_id),
               expense_attachments(id),
               expense_comments(kind, body, author_id, created_at)`)
      .eq('household_id', householdId).is('deleted_at', null)
      .order('spent_on', { ascending: false })
      .range(debut, debut + pageSize - 1);
    if (error) return err(lisible('Impossible de charger les dépenses.', error));
    const lot = (data ?? []) as unknown as Record<string, unknown>[];
    toutes.push(...lot);
    if (lot.length < pageSize) break;
  }

  return ok(toutes.map((e) => ({
    id: e.id as string,
    titre: e.title as string,
    montantCents: Number(e.amount_cents),
    date: e.spent_on as string,
    categorie: (e.expense_categories as unknown as { name: string } | null)?.name ?? null,
    payePar: e.paid_by as string,
    statut: e.status as string,
    enfants: ((e.expense_children ?? []) as { child_id: string }[]).map((c) => c.child_id),
    parts: ((e.expense_shares ?? []) as { parent_id: string; owed_cents: number }[])
      .map((s) => ({ parentId: s.parent_id, owedCents: Number(s.owed_cents) })),
    justificatifs: ((e.expense_attachments ?? []) as unknown[]).length,
    creePar: e.created_by as string,
    categorieId: (e.category_id as string) ?? null,
    ...(() => {
      const commentaires = ((e.expense_comments ?? []) as
        { kind: string; body: string | null; author_id: string; created_at: string }[])
        .filter((c) => c.kind === 'dispute')
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const dernier = commentaires[0];
      return {
        motifContestation: dernier?.body ?? null,
        contestePar: dernier?.author_id ?? null,
      };
    })(),
    repartition: (() => {
      const parts = (e.expense_shares ?? []) as { parent_id: string; basis_points: number | null }[];
      const payeur = parts.find((s2) => s2.parent_id === e.paid_by);
      return payeur?.basis_points ?? null;
    })(),
  })));
}

export async function modifierDepense(input: {
  expenseId: string; titre: string; montantCents: number; date: string;
  categorieId: string | null; enfantIds: string[]; regles: ShareRule[];
}): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  let parts: Allocation[];
  try { parts = splitAmount(input.montantCents, input.regles); }
  catch (e) { return err(e instanceof Error ? e.message : 'Répartition invalide.'); }

  const shares = parts.map((p) => {
    const regle = input.regles.find((r) => r.parentId === p.parentId);
    return {
      parent_id: p.parentId, owed_cents: p.owedCents,
      basis_points: regle && regle.kind === 'percentage' ? regle.basisPoints : null,
    };
  });
  const { error } = await supabase.rpc('update_expense', {
    p_expense: input.expenseId, p_title: input.titre, p_amount_cents: input.montantCents,
    p_spent_on: input.date, p_category_id: input.categorieId,
    p_child_ids: input.enfantIds, p_shares: shares,
  });
  if (error) return err(lisible('La modification n’a pas abouti.', error), detail(error));
  return ok(undefined);
}

export async function supprimerDepense(expenseId: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_expense', { p_expense: expenseId });
  if (error) return err(lisible('La suppression n’a pas abouti.', error), detail(error));
  return ok(undefined);
}

export async function reviserDepense(
  expenseId: string, action: 'validate' | 'dispute' | 'clarify', commentaire?: string
): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('review_expense', {
    p_expense: expenseId, p_action: action, p_comment: commentaire ?? null, p_accepted_cents: null,
  });
  if (error) return err(lisible('L’action n’a pas abouti.', error));
  return ok(undefined);
}
