'use client';

/** Remboursements : enregistrement par le payeur, lecture, annulation. */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';
import { checkFile, buildStoragePath, type AllowedMime, MAX_JUSTIFICATIF_BYTES } from '../files';
import type { Remboursement } from './types';

// ---------------- Remboursements ----------------
export const METHODES = [
  { valeur: 'bank_transfer', libelle: 'Virement' },
  { valeur: 'cash', libelle: 'Espèces' },
  { valeur: 'external', libelle: 'Paiement externe' },
  { valeur: 'other', libelle: 'Autre' },
] as const;

export async function creerRemboursement(input: {
  householdId: string; deParent: string; versParent: string; montantCents: number;
  methode: string; date: string; reference?: string; commentaire?: string; justificatif?: File | null;
}): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  if (!Number.isInteger(input.montantCents) || input.montantCents <= 0) {
    return err('Indiquez un montant valide, par exemple 12,50.');
  }
  const { data, error } = await supabase.rpc('create_reimbursement', {
    p_household: input.householdId,
    p_from_parent: input.deParent,
    p_to_parent: input.versParent,
    p_amount_cents: input.montantCents,
    p_method: input.methode,
    p_paid_on: input.date,
    p_reference: input.reference ?? null,
    p_comment: input.commentaire ?? null,
  });
  if (error) return err(lisible('L’enregistrement du remboursement n’a pas abouti.', error), detail(error));

  const rid = data as string;
  if (input.justificatif) {
    const check = checkFile(input.justificatif, MAX_JUSTIFICATIF_BYTES);
    if (!check.ok) return err(`Remboursement enregistré, mais le justificatif a été refusé : ${check.message}`);
    const path = buildStoragePath(input.householdId, input.justificatif.type as AllowedMime, crypto.randomUUID());
    const { error: upErr } = await supabase.storage.from('justificatifs')
      .upload(path, input.justificatif, { contentType: input.justificatif.type, upsert: false });
    if (upErr) return err('Remboursement enregistré, mais le dépôt du justificatif a échoué.');
    const { error: dbErr } = await supabase.rpc('set_reimbursement_attachment',
      { p_id: rid, p_path: path });
    if (dbErr) {
      await supabase.storage.from('justificatifs').remove([path]);
      return err('Remboursement enregistré, mais le justificatif n’a pas pu être rattaché.');
    }
  }
  return ok(rid);
}

export async function listerRemboursements(householdId: string): Promise<ActionResult<Remboursement[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.from('reimbursements')
    .select('id, from_parent, to_parent, amount_cents, paid_on, method, reference, comment, attachment_path, created_by')
    .eq('household_id', householdId).is('deleted_at', null)
    .order('paid_on', { ascending: false }).limit(50);
  if (error) return err(lisible('Impossible de charger les remboursements.', error), detail(error));
  return ok((data ?? []).map((r) => ({
    id: r.id as string,
    deParent: r.from_parent as string,
    versParent: r.to_parent as string,
    montantCents: Number(r.amount_cents),
    date: r.paid_on as string,
    methode: r.method as string,
    reference: (r.reference as string) ?? null,
    commentaire: (r.comment as string) ?? null,
    justificatif: (r.attachment_path as string) ?? null,
    creePar: r.created_by as string,
  })));
}

/** Annulation logique d'un remboursement saisi par erreur (trace conservée). */
export async function annulerRemboursement(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('cancel_reimbursement', { p_id: id });
  if (error) return err(lisible('L’annulation n’a pas abouti.', error), detail(error));
  return ok(undefined);
}

/** URL signée d'un justificatif de remboursement. */
export async function urlJustificatifRemboursement(path: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(path, 300);
  if (error || !data) return err('Ce fichier n’est pas accessible.');
  return ok(data.signedUrl);
}
