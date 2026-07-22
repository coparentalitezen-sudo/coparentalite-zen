/**
 * COPARENTALITÉ ZEN — Validation des justificatifs et documents.
 * Miroir côté client des contraintes BDD (mime_type, size_bytes) et de la
 * convention de chemin Storage {household_id}/{uuid}.{ext} exigée par les
 * policies de la migration 00005.
 */

export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MAX_JUSTIFICATIF_BYTES = 10 * 1024 * 1024; // 10 Mo (aligné BDD)
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;     // 20 Mo

const EXT_BY_MIME: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
};

export type FileCheckResult = { ok: true } | { ok: false; message: string };

export function checkFile(
  file: { type: string; size: number; name: string },
  maxBytes: number = MAX_JUSTIFICATIF_BYTES
): FileCheckResult {
  if (!ALLOWED_MIME.includes(file.type as AllowedMime)) {
    return { ok: false, message: 'Formats acceptés : PDF, JPEG, PNG ou HEIC.' };
  }
  if (file.size <= 0) {
    return { ok: false, message: 'Le fichier est vide.' };
  }
  if (file.size > maxBytes) {
    const mo = Math.round(maxBytes / 1024 / 1024);
    return { ok: false, message: `Le fichier dépasse la taille maximale de ${mo} Mo.` };
  }
  return { ok: true };
}

/**
 * Chemin Storage sûr : {household_id}/{uuid}.{ext}.
 * Le nom d'origine n'apparaît JAMAIS dans le chemin (pas d'injection, pas de
 * caractères spéciaux, pas de fuite d'information) — il est conservé en BDD
 * dans la colonne file_name pour l'affichage.
 */
export function buildStoragePath(householdId: string, mime: AllowedMime, uuid: string): string {
  const clean = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!clean.test(householdId)) throw new Error('Identifiant de foyer invalide');
  if (!clean.test(uuid)) throw new Error('Identifiant de fichier invalide');
  return `${householdId}/${uuid}.${EXT_BY_MIME[mime]}`;
}

/** Libellé taille lisible. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
