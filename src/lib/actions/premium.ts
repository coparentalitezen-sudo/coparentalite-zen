'use client';

/**
 * Offres, horizon de planning et abonnement Zen Plus.
 *
 * L'autorité est la fonction serveur household_entitlement : le client
 * n'additionne jamais lui-même des mois, il lit ce que la base lui répond.
 * Toute protection ici est une commodité d'affichage — la vraie barrière est
 * en base, dans exiger_horizon().
 */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

export interface Offre {
  planId: string;
  planLibelle: string;
  /** Prix de l'abonnement et sa périodicité, lus en base — jamais codés en dur. */
  prixCents: number;
  periodicite: 'month' | 'year';
  illimite: boolean;
  /** Dernier jour couvert (AAAA-MM-JJ) ; null si illimité. */
  horizon: string | null;
  joursRestants: number | null;
  moisOfferts: number;
  moisAjoutes: number;
  abonnementActif: boolean;
  abonnementFin: string | null;
  resiliationProgrammee: boolean;
}

export interface Extension {
  id: string;
  libelle: string;
  mois: number;
  prixCents: number;
}

/** Seuil d'alerte : on prévient avant que le planning ne se ferme. */
export const JOURS_ALERTE = 30;

export async function getOffre(householdId: string): Promise<ActionResult<Offre>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('household_entitlement', { p_household: householdId });
  if (error) return err(lisible('Impossible de lire votre offre.', error), detail(error));
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!l) return err('Offre introuvable pour ce foyer.');
  return ok({
    planId: l.plan_id as string,
    planLibelle: (l.plan_label as string) ?? 'Gratuit',
    prixCents: Number(l.prix_cents ?? 0),
    periodicite: (l.periodicite as 'month' | 'year') ?? 'month',
    illimite: Boolean(l.illimite),
    horizon: (l.horizon as string) ?? null,
    joursRestants: l.jours_restants === null ? null : Number(l.jours_restants),
    moisOfferts: Number(l.mois_offerts ?? 0),
    moisAjoutes: Number(l.mois_ajoutes ?? 0),
    abonnementActif: Boolean(l.abonnement_actif),
    abonnementFin: (l.abonnement_fin as string) ?? null,
    resiliationProgrammee: Boolean(l.resiliation_programmee),
  });
}

export async function listerExtensions(): Promise<ActionResult<Extension[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase
    .from('plan_extensions')
    .select('id, label, months, price_cents')
    .eq('active', true)
    .order('sort_order');
  if (error) return err(lisible('Impossible de charger les offres.', error), detail(error));
  return ok((data ?? []).map((e) => ({
    id: e.id as string,
    libelle: e.label as string,
    mois: Number(e.months),
    prixCents: Number(e.price_cents),
  })));
}

/**
 * Ouvre un paiement Stripe. La session est créée côté serveur : le client ne
 * choisit ni le prix ni le foyer crédité, il ne transmet qu'une intention.
 */
export async function ouvrirPaiement(input: {
  householdId: string;
  type: 'extension' | 'abonnement';
  extensionId?: string;
}): Promise<ActionResult<string>> {
  try {
    const reponse = await fetch('/api/paiement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const corps = (await reponse.json()) as { url?: string; message?: string };
    if (!reponse.ok || !corps.url) {
      return err(corps.message ?? 'Le paiement n’a pas pu être ouvert. Réessayez dans un instant.');
    }
    return ok(corps.url);
  } catch (e) {
    return err('Le paiement n’a pas pu être ouvert. Vérifiez votre connexion.', detail(e));
  }
}

/** Ouvre le portail Stripe : moyen de paiement, factures, résiliation. */
export async function ouvrirPortail(householdId: string): Promise<ActionResult<string>> {
  try {
    const reponse = await fetch('/api/paiement/portail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdId }),
    });
    const corps = (await reponse.json()) as { url?: string; message?: string };
    if (!reponse.ok || !corps.url) {
      return err(corps.message ?? 'Le portail de gestion n’est pas accessible.');
    }
    return ok(corps.url);
  } catch (e) {
    return err('Le portail de gestion n’est pas accessible.', detail(e));
  }
}

/** Historique des mois acquis, pour justifier un montant en cas de question. */
export interface AchatExtension {
  id: string; extensionId: string; mois: number; montantCents: number; date: string;
}

export async function listerAchats(householdId: string): Promise<ActionResult<AchatExtension[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase
    .from('household_extensions')
    .select('id, extension_id, months, amount_cents, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) return err(lisible('Impossible de charger vos achats.', error), detail(error));
  return ok((data ?? []).map((a) => ({
    id: a.id as string,
    extensionId: a.extension_id as string,
    mois: Number(a.months),
    montantCents: Number(a.amount_cents),
    date: a.created_at as string,
  })));
}
