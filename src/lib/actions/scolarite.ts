'use client';

/**
 * Emploi du temps scolaire (import photo).
 *
 * Lecture de l'image et appel à Claude en vision : passe par notre propre
 * route API (/api/scolarite/import-edt), jamais d'appel direct au
 * fournisseur depuis le navigateur (clé secrète). Écriture définitive :
 * uniquement après relecture/validation humaine côté écran, via
 * enregistrerImportEdt — voir enregistrer_edt_import (migration 00050).
 */
import { supabaseBrowser, ok, err, lisible, detail, type ActionResult } from './core';

export interface CreneauEdt {
  id?: string;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
  matiere: string | null;
  salle: string | null;
  professeur: string | null;
  semaineAb: 'A' | 'B' | null;
  source?: 'photo' | 'manuel';
}

export interface EtatScolarite {
  actif: boolean;
  importsUtilises: number;
  importsMax: number;
  semaineAbActive: boolean;
  dateAncrageSemaineA: string | null;
}

export interface CreneauFoyer extends CreneauEdt {
  childId: string;
  semaineAbActive: boolean;
  dateAncrageSemaineA: string | null;
}

export interface ExtractionEdt {
  anneeScolaire: string;
  semaineAbDetectee: boolean;
  creneaux: CreneauEdt[];
}

export async function getEtatScolarite(
  householdId: string, childId: string, anneeScolaire: string,
): Promise<ActionResult<EtatScolarite>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('edt_scolaire_etat', {
    p_household: householdId, p_child: childId, p_annee: anneeScolaire,
  });
  if (error) return err(lisible('Impossible de lire l’état de l’emploi du temps.', error), detail(error));
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return ok({
    actif: Boolean(l?.actif),
    importsUtilises: Number(l?.imports_utilises ?? 0),
    importsMax: Number(l?.imports_max ?? 0),
    semaineAbActive: Boolean(l?.semaine_ab_active),
    dateAncrageSemaineA: (l?.date_ancrage_semaine_a as string) ?? null,
  });
}

export async function listerCreneaux(
  childId: string, anneeScolaire: string,
): Promise<ActionResult<CreneauEdt[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('list_edt_creneaux', {
    p_child: childId, p_annee: anneeScolaire,
  });
  if (error) return err(lisible('Impossible de charger l’emploi du temps.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map(versCreneauEdt));
}

/** Tout le foyer, pour la superposition dans le planning de garde. */
export async function listerCreneauxFoyer(
  householdId: string, anneeScolaire: string,
): Promise<ActionResult<CreneauFoyer[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.rpc('list_edt_creneaux_foyer', {
    p_household: householdId, p_annee: anneeScolaire,
  });
  if (error) return err(lisible('Impossible de charger l’emploi du temps du foyer.', error), detail(error));
  return ok(((data ?? []) as Record<string, unknown>[]).map((c) => ({
    ...versCreneauEdt(c),
    childId: c.child_id as string,
    semaineAbActive: Boolean(c.semaine_ab_active),
    dateAncrageSemaineA: (c.date_ancrage_semaine_a as string) ?? null,
  })));
}

function versCreneauEdt(c: Record<string, unknown>): CreneauEdt {
  return {
    id: c.id as string | undefined,
    jourSemaine: Number(c.jour_semaine),
    heureDebut: String(c.heure_debut).slice(0, 5),
    heureFin: String(c.heure_fin).slice(0, 5),
    matiere: (c.matiere as string) ?? null,
    salle: (c.salle as string) ?? null,
    professeur: (c.professeur as string) ?? null,
    semaineAb: (c.semaine_ab as 'A' | 'B') ?? null,
    source: (c.source as 'photo' | 'manuel') ?? undefined,
  };
}

/**
 * Envoie la photo à la lecture automatique. N'écrit rien en base : le
 * résultat doit être relu et validé à l'écran avant tout enregistrement
 * (voir enregistrerImportEdt).
 */
export async function importerPhotoEdt(
  childId: string, imageBase64: string, mimeType: string, anneeScolaire?: string,
): Promise<ActionResult<ExtractionEdt>> {
  try {
    const reponse = await fetch('/api/scolarite/import-edt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ childId, imageBase64, mimeType, anneeScolaire }),
    });
    const corps = await reponse.json() as {
      anneeScolaire?: string; semaineAbDetectee?: boolean;
      creneaux?: Record<string, unknown>[]; message?: string;
    };
    if (!reponse.ok) {
      return err(corps.message ?? 'La lecture de la photo n’a pas abouti. Réessayez.');
    }
    return ok({
      anneeScolaire: corps.anneeScolaire ?? '',
      semaineAbDetectee: Boolean(corps.semaineAbDetectee),
      creneaux: (corps.creneaux ?? []).map(versCreneauEdt),
    });
  } catch (e) {
    return err('La lecture de la photo n’a pas abouti. Vérifiez votre connexion.', detail(e));
  }
}

/**
 * Enregistrement définitif, après validation humaine des créneaux relus à
 * l'écran. Remplace uniquement les créneaux source='photo' de cet
 * enfant/année ; les créneaux ajoutés à la main sont conservés.
 */
export async function enregistrerImportEdt(
  householdId: string, childId: string, anneeScolaire: string,
  semaineAbActive: boolean, dateAncrageSemaineA: string | null,
  creneaux: CreneauEdt[],
): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.rpc('enregistrer_edt_import', {
    p_household: householdId,
    p_child: childId,
    p_annee: anneeScolaire,
    p_semaine_ab_active: semaineAbActive,
    p_date_ancrage: dateAncrageSemaineA,
    p_creneaux: creneaux.map((c) => ({
      jour_semaine: c.jourSemaine,
      heure_debut: c.heureDebut,
      heure_fin: c.heureFin,
      matiere: c.matiere,
      salle: c.salle,
      professeur: c.professeur,
      semaine_ab: c.semaineAb,
    })),
  });
  if (error) return err(lisible('L’enregistrement de l’emploi du temps n’a pas abouti.', error), detail(error));
  return ok(undefined);
}
