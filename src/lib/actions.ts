'use client';

/**
 * Couche d'accès aux données.
 * Supabase quand il est configuré ; sinon résultat « demo » explicite.
 * Aucune fonction ne renvoie un faux succès silencieux.
 */
import { supabaseBrowser } from './supabase/client';
import { splitAmount, type ShareRule, type Allocation } from './money';
import { checkFile, buildStoragePath, type AllowedMime, MAX_JUSTIFICATIF_BYTES } from './files';
import type { CustodyPattern } from './custody';

export type ActionResult<T = undefined> =
  | { status: 'ok'; data: T }
  | { status: 'demo' }
  | { status: 'error'; message: string; details?: string };

const ok = <T,>(data: T): ActionResult<T> => ({ status: 'ok', data });
const err = (message: string, details?: string): ActionResult<never> =>
  ({ status: 'error', message, details });

/** Détail technique brut, affiché derrière un dépliant pendant la bêta. */
function detail(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const o = e as Record<string, unknown>;
  return [o.message, o.details, o.hint, o.code].filter(Boolean).join(' · ') || undefined;
}

/** Message lisible : le détail technique n'apparaît qu'en développement. */
function lisible(fallback: string, e: unknown): string {
  const brut = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (process.env.NODE_ENV !== 'production' && brut) return `${fallback} (${brut})`;
  if (/foyer|parent|montant|part|autoris|expir|utilis|révoqu|requis/i.test(brut)) return brut;
  return fallback;
}

// ---------------- Types ----------------
export interface Membre { profileId: string; nom: string; role: string; couleur: 'navy' | 'coral' | 'sage'; initiale: string; }
export interface Enfant { id: string; prenom: string; couleur: string; naissance: string | null; }
export interface Categorie { id: string; nom: string; }
export interface Foyer { id: string; nom: string; role: string; }
export interface Contexte { foyer: Foyer; membres: Membre[]; enfants: Enfant[]; categories: Categorie[]; }

export interface DepenseListe {
  id: string; titre: string; montantCents: number; date: string;
  categorie: string | null; payePar: string; statut: string;
  enfants: string[]; parts: Allocation[]; justificatifs: number;
}

// ---------------- Contexte du foyer ----------------
/** null = l'utilisateur n'a pas encore de foyer (cas normal, pas une erreur). */
export async function getContexte(): Promise<ActionResult<Contexte | null>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  try {
    // Deux requêtes simples plutôt qu'une jointure imbriquée : household_members
    // et households ont toutes deux une colonne deleted_at, ce qui rend le filtre
    // ambigu côté PostgREST.
    const { data: membre, error: e1 } = await supabase
      .from('household_members')
      .select('role, household_id')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (e1) return err(lisible('Impossible de charger votre foyer.', e1), detail(e1));
    if (!membre) return ok(null);

    const { data: foyer, error: e2 } = await supabase
      .from('households')
      .select('id, name, deleted_at')
      .eq('id', membre.household_id as string)
      .maybeSingle();
    if (e2) return err(lisible('Impossible de charger votre foyer.', e2), detail(e2));
    if (!foyer || foyer.deleted_at) return ok(null);
    const h = foyer as unknown as { id: string; name: string; deleted_at: string | null };

    const [membres, enfants, categories] = await Promise.all([
      supabase.from('household_members')
        .select('profile_id, role, color_key, profiles!inner(display_name)')
        .eq('household_id', h.id).is('deleted_at', null),
      supabase.from('children')
        .select('id, first_name, color, birth_date')
        .eq('household_id', h.id).is('deleted_at', null).is('archived_at', null)
        .order('first_name'),
      supabase.from('expense_categories')
        .select('id, name').is('deleted_at', null).order('sort_order'),
    ]);

    return ok({
      foyer: { id: h.id, nom: h.name, role: membre.role as string },
      membres: (membres.data ?? []).map((m) => {
        const p = m.profiles as unknown as { display_name: string };
        const nom = p?.display_name ?? 'Parent';
        return {
          profileId: m.profile_id as string,
          nom,
          role: m.role as string,
          couleur: (m.color_key as 'navy' | 'coral' | 'sage') ?? 'navy',
          initiale: nom.charAt(0).toUpperCase(),
        };
      }),
      enfants: (enfants.data ?? []).map((c) => ({
        id: c.id as string, prenom: c.first_name as string,
        couleur: (c.color as string) ?? '#9AA791', naissance: (c.birth_date as string) ?? null,
      })),
      categories: (categories.data ?? []).map((c) => ({ id: c.id as string, nom: c.name as string })),
    });
  } catch (e) {
    return err(lisible('Chargement impossible. Vérifiez votre connexion.', e), detail(e));
  }
}

export async function createHousehold(name: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_household', { p_name: name });
  if (error) return err(lisible('La création du foyer n’a pas abouti.', error));
  return ok(data as string);
}

// ---------------- Enfants ----------------
export async function ajouterEnfant(
  householdId: string, prenom: string, naissance: string | null, couleur: string
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err('Session expirée. Reconnectez-vous.');
  const { data, error } = await supabase.from('children')
    .insert({
      household_id: householdId, first_name: prenom.trim(),
      birth_date: naissance || null, color: couleur, created_by: user.id,
    })
    .select('id').single();
  if (error) return err(lisible('L’ajout de l’enfant n’a pas abouti.', error));
  return ok(data.id as string);
}

export async function archiverEnfant(id: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.from('children')
    .update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return err(lisible('L’archivage n’a pas abouti.', error));
  return ok(undefined);
}

// ---------------- Rythme de garde ----------------
export interface RegleGarde { pattern: CustodyPattern; startDate: string; parent1: string; parent2: string; }

export async function getRegleGarde(householdId: string): Promise<ActionResult<RegleGarde | null>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.from('custody_rules')
    .select('pattern, start_date, starting_parent, config')
    .eq('household_id', householdId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return err(lisible('Impossible de charger le rythme de garde.', error));
  if (!data) return ok(null);
  const cfg = (data.config ?? {}) as { parent2?: string };
  return ok({
    pattern: data.pattern as CustodyPattern,
    startDate: data.start_date as string,
    parent1: data.starting_parent as string,
    parent2: cfg.parent2 ?? '',
  });
}

export async function setRegleGarde(
  householdId: string, pattern: CustodyPattern, startDate: string, parent1: string, parent2: string
): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('set_custody_rule', {
    p_household: householdId, p_pattern: pattern, p_start_date: startDate,
    p_parent1: parent1, p_parent2: parent2,
  });
  if (error) return err(lisible('L’enregistrement du rythme n’a pas abouti.', error));
  return ok(data as string);
}

// ---------------- Invitations ----------------
export async function inviteParent(householdId: string, email: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('create_invitation', { p_household: householdId, p_email: email });
  if (error) return err(lisible('L’invitation n’a pas pu être créée. Vérifiez l’adresse.', error));
  return ok(data as string);
}

export async function acceptInvitation(token: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) {
    const raw = error.message ?? '';
    const message = raw.includes('expiré') ? 'Cette invitation a expiré. Demandez-en une nouvelle.'
      : raw.includes('déjà') ? 'Cette invitation a déjà été utilisée.'
      : raw.includes('révoquée') ? 'Cette invitation a été révoquée — utilisez le lien le plus récent.'
      : raw.includes('introuvable') || raw.toLowerCase().includes('uuid') ? 'Lien incomplet ou erroné : recopiez-le en entier.'
      : raw.includes('Authentification') ? 'Connectez-vous d’abord, puis rouvrez ce lien.'
      : lisible('Cette invitation n’a pas pu être acceptée.', error);
    return err(message);
  }
  return ok(data as string);
}

// ---------------- Dépenses ----------------
export interface NouvelleDepense {
  householdId: string; titre: string; montantCents: number; date: string;
  categorieId: string | null; payePar: string; enfantIds: string[];
  regles: ShareRule[]; justificatif?: File | null;
}

/** Création transactionnelle côté serveur (aucune dépense orpheline possible). */
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
  const { data, error } = await supabase.from('expenses')
    .select(`id, title, amount_cents, spent_on, status, paid_by,
             expense_categories(name),
             expense_shares(parent_id, owed_cents),
             expense_children(child_id),
             expense_attachments(id)`)
    .eq('household_id', householdId).is('deleted_at', null)
    .order('spent_on', { ascending: false }).limit(100);
  if (error) return err(lisible('Impossible de charger les dépenses.', error));

  return ok((data ?? []).map((e) => ({
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
  })));
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

// ---------------- RGPD ----------------
export async function exportMyData(): Promise<ActionResult<Blob>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) return err(lisible('L’export n’a pas abouti.', error));
  return ok(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

export async function deleteMyAccount(): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return err(lisible('La suppression n’a pas abouti.', error));
  await supabase.auth.signOut();
  return ok(undefined);
}

export async function deleteHousehold(householdId: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('delete_household', { p_household: householdId });
  if (error) return err(lisible('Seul le propriétaire du foyer peut le supprimer.', error));
  return ok(undefined);
}

export async function seDeconnecter(): Promise<void> {
  const supabase = supabaseBrowser();
  if (supabase) await supabase.auth.signOut();
}
