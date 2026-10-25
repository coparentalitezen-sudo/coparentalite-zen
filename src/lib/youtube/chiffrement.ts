import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Chiffrement des jetons OAuth avant leur entrée en base.
 *
 * AES-256-GCM : chiffré ET authentifié, si bien qu'un jeton altéré en base
 * est refusé au déchiffrement au lieu de produire n'importe quoi. La clé vit
 * dans les variables d'environnement de Vercel (YOUTUBE_TOKEN_KEY, 32 octets
 * en base64), jamais en base ni dans le code : une fuite de la base seule ne
 * donne accès à aucune chaîne YouTube.
 *
 * Format stocké : « v1.<iv>.<étiquette>.<chiffré> », chaque partie en
 * base64url. Le préfixe de version permettra de changer d'algorithme sans
 * rendre illisibles les jetons déjà enregistrés.
 */

const VERSION = 'v1';

/** Clé de chiffrement lue dans l'environnement, ou null si absente ou invalide. */
export function cleDeChiffrement(brute = process.env.YOUTUBE_TOKEN_KEY): Buffer | null {
  if (!brute) return null;
  const cle = Buffer.from(brute.trim(), 'base64');
  return cle.length === 32 ? cle : null;
}

export function chiffrer(texte: string, cle: Buffer): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv('aes-256-gcm', cle, iv);
  const chiffre = Buffer.concat([chiffreur.update(texte, 'utf8'), chiffreur.final()]);
  const etiquette = chiffreur.getAuthTag();
  return [VERSION, iv, etiquette, chiffre]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Déchiffre ; lève une erreur si le texte a été altéré ou la clé changée. */
export function dechiffrer(stocke: string, cle: Buffer): string {
  const [version, iv, etiquette, chiffre] = stocke.split('.');
  if (version !== VERSION || !iv || !etiquette || chiffre === undefined) {
    throw new Error('Jeton chiffré illisible.');
  }
  const dechiffreur = createDecipheriv('aes-256-gcm', cle, Buffer.from(iv, 'base64url'));
  dechiffreur.setAuthTag(Buffer.from(etiquette, 'base64url'));
  return Buffer.concat([
    dechiffreur.update(Buffer.from(chiffre, 'base64url')),
    dechiffreur.final(),
  ]).toString('utf8');
}
