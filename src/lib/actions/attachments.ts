'use client';

/** Justificatifs : dépôt dans un bucket privé, consultation par URL signée. */
import { supabaseBrowser, ok, err, lisible, type ActionResult } from './core';
import { checkFile, buildStoragePath, type AllowedMime, MAX_JUSTIFICATIF_BYTES } from '../files';

// ---------------- Justificatifs ----------------
export async function deposerJustificatif(householdId: string, expenseId: string, file: File): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const check = checkFile(file, MAX_JUSTIFICATIF_BYTES);
  if (!check.ok) return err(check.message);

  const path = buildStoragePath(householdId, file.type as AllowedMime, crypto.randomUUID());
  const { error: upErr } = await supabase.storage.from('justificatifs')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return err(lisible('Le dépôt du justificatif n’a pas abouti.', upErr));

  const { data: { user } } = await supabase.auth.getUser();
  const { error: dbErr } = await supabase.from('expense_attachments').insert({
    expense_id: expenseId, storage_path: path, file_name: file.name,
    mime_type: file.type, size_bytes: file.size, created_by: user!.id,
  });
  if (dbErr) {
    await supabase.storage.from('justificatifs').remove([path]); // pas de fichier orphelin
    return err(lisible('Le justificatif n’a pas pu être enregistré.', dbErr));
  }
  return ok(undefined);
}

export async function urlJustificatif(expenseId: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data: att, error } = await supabase.from('expense_attachments')
    .select('storage_path').eq('expense_id', expenseId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !att) return err('Aucun justificatif pour cette dépense.');
  const { data, error: e2 } = await supabase.storage.from('justificatifs')
    .createSignedUrl(att.storage_path as string, 300);
  if (e2 || !data) return err('Ce fichier n’est pas accessible.');
  return ok(data.signedUrl);
}
