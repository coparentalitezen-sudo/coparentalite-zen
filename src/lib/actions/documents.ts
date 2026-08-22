'use client';

/**
 * Documents du foyer : ordonnances, attestations, papiers scolaires.
 *
 * Distincts des justificatifs, qui sont rattachés à une dépense et servent à
 * la prouver. Un document vit pour lui-même : une ordonnance doit être
 * consultable par l'autre parent le jour où l'enfant est chez lui, sans
 * qu'aucune dépense ne soit en jeu.
 *
 * Le stockage réutilise le seau `documents`, dont les règles d'accès sont
 * posées depuis la migration 00005 : lecture pour les membres du foyer,
 * dépôt et retrait pour ceux qui peuvent écrire. Le chemin porte
 * l'identifiant du foyer, dont ces règles se servent — le construire
 * autrement rendrait le fichier illisible pour tout le monde, y compris son
 * auteur.
 */
import { supabaseBrowser, ok, err, lisible, type ActionResult } from './core';
import { checkFile, buildStoragePath, type AllowedMime, MAX_JUSTIFICATIF_BYTES } from '../files';

/** Types de document, tels que définis par l'énumération doc_kind en base. */
export const TYPES_DOCUMENT = [
  { code: 'prescription', libelle: 'Ordonnance' },
  { code: 'medical_certificate', libelle: 'Certificat médical' },
  { code: 'school', libelle: 'Scolaire' },
  { code: 'attestation', libelle: 'Attestation' },
  { code: 'insurance', libelle: 'Assurance' },
  { code: 'identity', libelle: 'Identité' },
  { code: 'travel', libelle: 'Voyage' },
  { code: 'authorization', libelle: 'Autorisation' },
  { code: 'agreement', libelle: 'Convention' },
  { code: 'invoice', libelle: 'Facture' },
  { code: 'receipt', libelle: 'Reçu' },
  { code: 'other', libelle: 'Autre' },
] as const;

export type TypeDocument = typeof TYPES_DOCUMENT[number]['code'];

export function libelleType(code: string): string {
  return TYPES_DOCUMENT.find((t) => t.code === code)?.libelle ?? 'Autre';
}

export interface Document {
  id: string;
  titre: string;
  type: TypeDocument;
  enfantId: string | null;
  nomFichier: string;
  typeMime: string;
  taille: number;
  expireLe: string | null;
  deposeLe: string;
  deposePar: string;
}

function versDocument(l: Record<string, unknown>): Document {
  return {
    id: l.id as string,
    titre: l.title as string,
    type: l.kind as TypeDocument,
    enfantId: (l.child_id as string | null) ?? null,
    nomFichier: l.file_name as string,
    typeMime: l.mime_type as string,
    taille: Number(l.size_bytes ?? 0),
    expireLe: (l.expires_on as string | null) ?? null,
    deposeLe: l.created_at as string,
    deposePar: l.created_by as string,
  };
}

/** Documents du foyer, du plus récent au plus ancien. */
export async function listerDocuments(
  householdId: string,
): Promise<ActionResult<Document[]>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data, error } = await supabase.from('documents')
    .select('id, title, kind, child_id, file_name, mime_type, size_bytes, expires_on, created_at, created_by')
    .eq('household_id', householdId).is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) return err(lisible('Les documents n’ont pas pu être listés.', error));
  return ok((data ?? []).map((l) => versDocument(l as Record<string, unknown>)));
}

export interface NouveauDocument {
  titre: string;
  type: TypeDocument;
  enfantId?: string | null;
  expireLe?: string | null;
  fichier: File;
}

/**
 * Dépose un document.
 *
 * Le fichier part d'abord au stockage, la ligne ensuite : l'inverse
 * laisserait une entrée pointant vers un fichier absent, qui s'afficherait
 * dans la liste et échouerait à l'ouverture. Si l'enregistrement échoue après
 * l'envoi, le fichier est retiré — un orphelin dans le seau ne se voit nulle
 * part et consomme du quota indéfiniment.
 */
export async function deposerDocument(
  householdId: string, doc: NouveauDocument,
): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };

  const titre = doc.titre.trim();
  if (titre.length < 2) return err('Donnez un titre au document.');
  if (titre.length > 120) return err('Le titre ne peut pas dépasser 120 caractères.');

  const controle = checkFile(doc.fichier, MAX_JUSTIFICATIF_BYTES);
  if (!controle.ok) return err(controle.message);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return err('Votre session a expiré. Reconnectez-vous avant de déposer le fichier.');
  }

  const chemin = buildStoragePath(
    householdId, doc.fichier.type as AllowedMime, crypto.randomUUID(),
  );
  let charge = false;

  try {
    const { error: erreurEnvoi } = await supabase.storage.from('documents')
      .upload(chemin, doc.fichier, { contentType: doc.fichier.type, upsert: false });
    if (erreurEnvoi) return err(lisible('Le dépôt du document n’a pas abouti.', erreurEnvoi));
    charge = true;

    const { error: erreurBase } = await supabase.from('documents').insert({
      household_id: householdId,
      child_id: doc.enfantId || null,
      kind: doc.type,
      title: titre,
      storage_path: chemin,
      file_name: doc.fichier.name,
      mime_type: doc.fichier.type,
      size_bytes: doc.fichier.size,
      expires_on: doc.expireLe || null,
      created_by: user.id,
    });
    if (erreurBase) return err(lisible('Le document n’a pas pu être enregistré.', erreurBase));

    charge = false;
    return ok(undefined);
  } catch (cause) {
    return err(lisible('Le document n’a pas pu être enregistré.', cause));
  } finally {
    if (charge) {
      const { error: erreurMenage } = await supabase.storage.from('documents').remove([chemin]);
      if (erreurMenage) console.error('[documents] fichier orphelin', erreurMenage.message);
    }
  }
}

/** URL signée d'un document, valable cinq minutes. */
export async function urlDocument(documentId: string): Promise<ActionResult<string>> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { data: doc, error } = await supabase.from('documents')
    .select('storage_path').eq('id', documentId).is('deleted_at', null).maybeSingle();
  if (error || !doc) return err('Ce document n’existe plus.');
  const { data, error: erreurUrl } = await supabase.storage.from('documents')
    .createSignedUrl(doc.storage_path as string, 300);
  if (erreurUrl || !data) return err('Ce fichier n’est pas accessible.');
  return ok(data.signedUrl);
}

/** Retire un document, sans effacer le fichier stocké. */
export async function retirerDocument(documentId: string): Promise<ActionResult> {
  const supabase = supabaseBrowser();
  if (!supabase) return { status: 'demo' };
  const { error } = await supabase.from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', documentId).is('deleted_at', null);
  if (error) return err(lisible('Le document n’a pas pu être retiré.', error));
  return ok(undefined);
}
