'use client';

/**
 * Règlement partagé entre les deux parents — côté navigateur.
 *
 * Comme pour le reste de la facturation, le client ne transmet qu'une
 * intention : ni montant, ni droit. Les deux montants renvoyés servent
 * uniquement à l'affichage avant confirmation ; celui qui sera réellement
 * facturé est recalculé côté serveur.
 */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';
import type { EtatAgrege, StatutPart } from '../paiement-partage';

export interface PartVue {
  parentId: string;
  montantCents: number;
  statut: StatutPart;
  estMoi: boolean;
}

export interface PartageVue {
  arrangementId: string;
  mode: 'full' | 'half';
  etatArrangement: string;
  partsAttendues: number;
  totalCents: number;
  periodicite: 'month' | 'year';
  expireLe: string | null;
  parts: PartVue[];
}

/**
 * Lit le règlement en cours du foyer.
 *
 * Passe par la fonction lire_partage : les tables elles-mêmes sont fermées
 * aux parents, et aucun identifiant Stripe ne traverse cette frontière.
 */
export async function lirePartage(householdId: string): Promise<ActionResult<PartageVue | null>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('lire_partage', { p_household: householdId });
  if (error) return err(lisible('Impossible de lire votre règlement.', error), detail(error));

  const lignes = (data ?? []) as Record<string, unknown>[];
  if (lignes.length === 0) return ok(null);

  const tete = lignes[0];
  return ok({
    arrangementId: tete.arrangement_id as string,
    mode: tete.mode as 'full' | 'half',
    etatArrangement: tete.etat_arrangement as string,
    partsAttendues: Number(tete.parts_attendues),
    totalCents: Number(tete.total_cents),
    periodicite: tete.periodicite as 'month' | 'year',
    expireLe: (tete.expire_le as string) ?? null,
    // Une part peut être absente si la jointure n'a rien trouvé : on ne
    // fabrique pas de ligne fantôme pour autant.
    parts: lignes
      .filter((l) => l.parent_id)
      .map((l) => ({
        parentId: l.parent_id as string,
        montantCents: Number(l.part_cents),
        statut: l.etat_part as StatutPart,
        estMoi: Boolean(l.est_moi),
      })),
  });
}

/** Ouvre un règlement partagé. Renvoie l'URL d'enregistrement de la carte. */
export async function ouvrirPartage(input: {
  householdId: string;
  periodicite: 'month' | 'year';
}): Promise<ActionResult<{ url: string; votrePart: number; partAutreParent: number }>> {
  try {
    const reponse = await fetch('/api/paiement/partage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const corps = await reponse.json() as {
      url?: string; votrePart?: number; partAutreParent?: number; message?: string;
    };
    if (!reponse.ok || !corps.url) {
      return err(corps.message ?? 'Le règlement partagé n’a pas pu être ouvert.');
    }
    return ok({
      url: corps.url,
      votrePart: Number(corps.votrePart ?? 0),
      partAutreParent: Number(corps.partAutreParent ?? 0),
    });
  } catch (e) {
    return err('Le règlement partagé n’a pas pu être ouvert. Vérifiez votre connexion.', detail(e));
  }
}

/**
 * Réponse du second parent.
 *
 * Accepter ouvre l'enregistrement de sa carte, sans débit. Refuser ferme le
 * règlement — et comme rien n'a été prélevé, il n'y a rien à rembourser.
 */
export async function repondrePartage(input: {
  arrangementId: string;
  reponse: 'accepte' | 'refuse';
}): Promise<ActionResult<{ etat: string; url?: string }>> {
  try {
    const reponse = await fetch('/api/paiement/partage/reponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const corps = await reponse.json() as { etat?: string; url?: string; message?: string };
    if (!reponse.ok || !corps.etat) {
      return err(corps.message ?? 'Votre réponse n’a pas pu être enregistrée.');
    }
    return ok({ etat: corps.etat, url: corps.url });
  } catch (e) {
    return err('Votre réponse n’a pas pu être enregistrée. Vérifiez votre connexion.', detail(e));
  }
}

export type { EtatAgrege };
