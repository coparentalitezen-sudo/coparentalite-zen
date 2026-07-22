'use client';

/**
 * Couche d'accès aux données côté client.
 * Chaque fonction utilise Supabase quand il est configuré, sinon renvoie un
 * résultat « démo » clairement identifié — jamais un faux succès silencieux.
 */
import { supabaseBrowser } from './supabase/client';
import { splitAmount, type ShareRule } from './money';
import { checkFile, buildStoragePath, type AllowedMime, MAX_JUSTIFICATIF_BYTES } from './files';

export type ActionResult<T = undefined> =
  | { status: 'ok'; data: T }
  | { status: 'demo' }
  | { status: 'error'; message: string };

/** Foyer courant de l'utilisateur (premier foyer actif). */
export async function getMyHousehold(): Promise<ActionResult<{ id: string; name: string; role: string }>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase
    .from('household_members')
    .select('role, households!inner(id, name)')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (error) return { status: 'error', message: 'Impossible de charger votre foyer. Réessayez.' };
  if (!data) return { status: 'ok', data: null as never };
  const h = data.households as unknown as { id: string; name: string };
  return { status: 'ok', data: { id: h.id, name: h.name, role: data.role as string } };
}

export async function createHousehold(name: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_household', { p_name: name });
  if (error) return { status: 'error', message: 'La création du foyer n’a pas abouti. Réessayez.' };
  return { status: 'ok', data: data as string };
}

export async function inviteParent(householdId: string, email: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_invitation', {
    p_household: householdId, p_email: email,
  });
  if (error) return { status: 'error', message: 'L’invitation n’a pas pu être créée. Vérifiez l’adresse.' };
  return { status: 'ok', data: data as string };
}

export async function acceptInvitation(token: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) {
    const raw = error.message ?? '';
    const message = raw.includes('expiré') ? 'Cette invitation a expiré. Demandez-en une nouvelle.'
      : raw.includes('déjà') ? 'Cette invitation a déjà été utilisée.'
      : raw.includes('révoquée') ? 'Cette invitation a été révoquée.'
      : 'Cette invitation n’est pas valide.';
    return { status: 'error', message };
  }
  return { status: 'ok', data: data as string };
}

export interface NewExpense {
  householdId: string;
  title: string;
  amountCents: number;
  spentOn: string;             // YYYY-MM-DD
  category: string;
  paidBy: string;              // profile id
  childIds: string[];
  shareRules: ShareRule[];
  attachment?: File | null;
}

/** Crée la dépense + parts calculées + justificatif éventuel (bucket privé). */
export async function createExpense(input: NewExpense): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };

  let allocations;
  try {
    allocations = splitAmount(input.amountCents, input.shareRules);
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Répartition invalide.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Session expirée. Reconnectez-vous.' };

  const { data: exp, error } = await supabase
    .from('expenses')
    .insert({
      household_id: input.householdId,
      title: input.title.trim(),
      amount_cents: input.amountCents,
      spent_on: input.spentOn,
      paid_by: input.paidBy,
      status: 'sent',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !exp) return { status: 'error', message: 'L’enregistrement de la dépense n’a pas abouti.' };

  if (input.childIds.length > 0) {
    const { error: ecErr } = await supabase.from('expense_children')
      .insert(input.childIds.map((c) => ({ expense_id: exp.id, child_id: c })));
    if (ecErr) return { status: 'error', message: 'Dépense créée, mais l’association aux enfants a échoué.' };
  }

  const { error: shErr } = await supabase.from('expense_shares').insert(
    allocations.map((a) => {
      const rule = input.shareRules.find((r) => r.parentId === a.parentId);
      return {
        expense_id: exp.id, parent_id: a.parentId, owed_cents: a.owedCents,
        kind: rule?.kind ?? 'percentage',
        basis_points: rule?.kind === 'percentage' ? rule.basisPoints : null,
        fixed_cents: rule?.kind === 'fixed_amount' ? rule.fixedCents : null,
      };
    })
  );
  if (shErr) return { status: 'error', message: 'Dépense créée, mais le calcul des parts a échoué.' };

  if (input.attachment) {
    const r = await uploadJustificatif(input.householdId, exp.id, input.attachment);
    if (r.status === 'error') return { status: 'error', message: `Dépense créée, mais : ${r.message}` };
  }
  return { status: 'ok', data: exp.id };
}

/** Dépose un justificatif dans le bucket privé et l'attache à la dépense. */
export async function uploadJustificatif(householdId: string, expenseId: string, file: File): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };

  const check = checkFile(file, MAX_JUSTIFICATIF_BYTES);
  if (!check.ok) return { status: 'error', message: check.message };

  const path = buildStoragePath(householdId, file.type as AllowedMime, crypto.randomUUID());
  const { error: upErr } = await supabase.storage.from('justificatifs')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { status: 'error', message: 'Le dépôt du justificatif n’a pas abouti. Réessayez.' };

  const { data: { user } } = await supabase.auth.getUser();
  const { error: dbErr } = await supabase.from('expense_attachments').insert({
    expense_id: expenseId, storage_path: path, file_name: file.name,
    mime_type: file.type, size_bytes: file.size, created_by: user!.id,
  });
  if (dbErr) {
    await supabase.storage.from('justificatifs').remove([path]); // pas de fichier orphelin
    return { status: 'error', message: 'Le justificatif n’a pas pu être enregistré.' };
  }
  return { status: 'ok', data: undefined };
}

/** URL signée temporaire (5 min) pour consulter un justificatif privé. */
export async function getSignedUrl(path: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(path, 300);
  if (error || !data) return { status: 'error', message: 'Ce fichier n’est pas accessible.' };
  return { status: 'ok', data: data.signedUrl };
}

/** Export RGPD : récupère toutes les données et déclenche le téléchargement. */
export async function exportMyData(): Promise<ActionResult<Blob>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) return { status: 'error', message: 'L’export n’a pas abouti. Réessayez.' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  return { status: 'ok', data: blob };
}

export async function deleteMyAccount(): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { status: 'error', message: 'La suppression n’a pas abouti. Contactez le support.' };
  await supabase.auth.signOut();
  return { status: 'ok', data: undefined };
}

export async function deleteHousehold(householdId: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_household', { p_household: householdId });
  if (error) return { status: 'error', message: 'Seul le propriétaire du foyer peut le supprimer.' };
  return { status: 'ok', data: undefined };
}
