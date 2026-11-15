/**
 * TikTok : publication MANUELLE, préparée par l'administration.
 *
 * Pourquoi pas l'API : les règles de partage de TikTok (Content Sharing
 * Guidelines, « Intended Use ») excluent explicitement « un outil qui aide à
 * mettre en ligne du contenu sur le(s) compte(s) que vous ou votre équipe
 * gérez ». C'est exactement notre usage : l'audit de la publication directe
 * serait refusé, et sans audit tout part en « Moi uniquement » (vérifié le
 * 15/11/2026). L'application développeur « Coparentalité Zen » existe chez
 * TikTok mais n'est pas soumise.
 *
 * À la place, l'écran /admin/videos prépare la vidéo (enregistrement ou
 * partage vers l'app TikTok depuis l'iPhone) et la légende ci-dessous, copiée
 * dans le presse-papiers. L'humain publie dans TikTok.
 *
 * Fonction pure : testée sans base ni navigateur.
 */

import { dansCampagneNoel } from './campagne-noel';
import { motsDiesePour } from './mots-diese';

/** TikTok accepte 2 200 caractères ; on reste très en dessous. */
export const LONGUEUR_MAX_LEGENDE_TIKTOK = 2200;

/** Pas de lien cliquable dans une légende TikTok : on écrit l'adresse, courte et lisible. */
export const APPEL_TIKTOK = '👉 L’appli : coparentalitezen.fr';
export const APPEL_TIKTOK_NOEL = '🎄 Noël chez qui ? Ton planning gratuit en 1 minute : coparentalitezen.fr/planning-noel';

const BIO = /lien (?:aussi )?dans (?:la|ma) bio|www\.coparentalitezen\.fr|coparentalitezen\.fr/iu;
const LIGNE_DIESES = /^(#[\p{L}\p{N}_]+)(\s+#[\p{L}\p{N}_]+)*$/u;

/**
 * Légende TikTok tirée de la légende Instagram (ou d'un titre) :
 *   * les phrases qui renvoient à la bio ou au site sont retirées ;
 *   * un seul appel est ajouté, celui du planning de Noël pendant la campagne ;
 *   * les mots-dièse du sujet terminent la légende.
 * Idempotente : la repasser ne change rien.
 */
export function legendeTiktok(base: string, niche: string, jour: string): string {
  const paragraphes = base.trim().split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !LIGNE_DIESES.test(p) && p !== APPEL_TIKTOK && p !== APPEL_TIKTOK_NOEL)
    .map((p) => p.split(/(?<=[.!?…)])\s+/).filter((phrase) => !BIO.test(phrase)).join(' ').trim())
    .filter(Boolean);

  const appel = dansCampagneNoel(jour) ? APPEL_TIKTOK_NOEL : APPEL_TIKTOK;
  const legende = [...paragraphes, appel, motsDiesePour(niche).join(' ')].join('\n\n');
  return legende.slice(0, LONGUEUR_MAX_LEGENDE_TIKTOK);
}

/** Nom du fichier proposé à l'enregistrement : lisible dans la pellicule ou les Fichiers. */
export function nomFichierTiktok(cle: string): string {
  return `coparentalite-zen-${cle.replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}.mp4`;
}
