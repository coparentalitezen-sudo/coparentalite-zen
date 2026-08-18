import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signature des adresses de visuels.
 *
 * Meta va chercher le média lui-même : il doit donc être accessible sans
 * session. Mais une adresse simplement publique serait énumérable — n'importe
 * qui pourrait parcourir les références et lire les contenus avant leur
 * publication, y compris ceux que vous avez rejetés.
 *
 * D'où une signature : l'adresse est publique, mais impossible à construire
 * sans connaître le secret. Elle n'expire pas, parce qu'une republication ou
 * un nouvel essai après incident doit rester possible sans regénérer les
 * liens — et parce que ces images ont de toute façon vocation à être vues.
 *
 * Le secret réutilisé est CRON_SECRET, déjà en place. Ajouter un secret de
 * plus, c'est une valeur de plus à faire tourner et à oublier de renouveler.
 */

/** Empreinte tronquée : 32 caractères hexadécimaux, soit 128 bits. */
export function signerVisuel(reference: string, page: number): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret)
    .update(`${reference}:${page}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Vérifie une signature reçue.
 *
 * La comparaison est à temps constant : une comparaison ordinaire s'arrête au
 * premier caractère différent, ce qui laisse mesurer la progression et
 * reconstruire la signature caractère par caractère.
 */
export function verifierVisuel(
  reference: string, page: number, signature: string | null,
): boolean {
  if (!signature) return false;
  const attendue = signerVisuel(reference, page);
  if (!attendue) return false;
  const a = Buffer.from(attendue);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Adresse complète, telle qu'elle sera transmise à Meta. */
export function urlVisuelPublic(
  base: string, reference: string, page: number,
): string | null {
  const signature = signerVisuel(reference, page);
  if (!signature) return null;
  const url = new URL('/api/marketing/visuel-public', base);
  url.searchParams.set('ref', reference);
  url.searchParams.set('page', String(page));
  url.searchParams.set('jeton', signature);
  return url.toString();
}
