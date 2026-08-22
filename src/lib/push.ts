/**
 * Notifications poussées — côté serveur exclusivement.
 *
 * Le protocole Web Push exige un chiffrement de bout en bout : le serveur de
 * distribution (Apple, Google, Mozilla) relaie un message qu'il ne peut pas
 * lire. La bibliothèque web-push s'en charge ; l'implémenter à la main
 * demanderait ECDH, HKDF et AES-GCM, pour un résultat plus fragile.
 *
 * SUR IPHONE : le Push n'est disponible qu'à partir d'iOS 16.4, et uniquement
 * si l'application est installée sur l'écran d'accueil. Depuis Safari, la
 * permission ne peut même pas être demandée — l'interface doit donc expliquer
 * la marche à suivre plutôt que d'échouer sans mot dire.
 */
import webpush from 'web-push';

export interface ConfigPush {
  clePublique: string;
  clePrivee: string;
  contact: string;
}

export function configPush(): ConfigPush | null {
  const clePublique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const clePrivee = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT ?? 'mailto:contact@coparentalite-zen.fr';
  if (!clePublique || !clePrivee) return null;
  return { clePublique, clePrivee, contact };
}

export function pushConfigure(): boolean {
  return configPush() !== null;
}

export interface AbonnementPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface MessagePush {
  titre: string;
  corps?: string | null;
  href?: string | null;
  /** Regroupe les alertes d'une même conversation sur l'appareil. */
  etiquette?: string;
  /**
   * Nombre de notifications non lues du destinataire, pour la pastille.
   *
   * Il voyage dans le message parce que le service worker, seul actif quand
   * l'application est fermée, n'a aucun accès à la base. Absent, la pastille
   * se contente d'un incrément — un chiffre approché qui dérive.
   */
  nonLues?: number | null;
}

export type ResultatEnvoi =
  | { statut: 'envoye' }
  | { statut: 'expire' }        // l'abonnement n'est plus valide, à retirer
  | { statut: 'echec'; message: string };

/**
 * Envoie une notification à un appareil.
 *
 * Un abonnement expiré (404 ou 410) n'est pas une erreur : l'utilisateur a
 * désinstallé l'application ou révoqué la permission. Il doit être retiré,
 * sans quoi chaque envoi ultérieur échouerait pour rien.
 */
export async function envoyerPush(
  config: ConfigPush, abonnement: AbonnementPush, message: MessagePush,
): Promise<ResultatEnvoi> {
  webpush.setVapidDetails(config.contact, config.clePublique, config.clePrivee);

  try {
    await webpush.sendNotification(
      {
        endpoint: abonnement.endpoint,
        keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
      },
      JSON.stringify({
        title: message.titre,
        body: message.corps ?? '',
        url: message.href ?? '/app/notifications',
        tag: message.etiquette ?? 'coparentalite-zen',
        // Omis plutôt qu'envoyé à zéro quand le compte est inconnu : le
        // service worker distingue l'absence d'information d'un compte nul,
        // et retombe alors sur son incrément.
        ...(typeof message.nonLues === 'number' && message.nonLues >= 0
          ? { nonLues: message.nonLues } : {}),
      }),
      { TTL: 24 * 3600 },   // une alerte vieille d'un jour n'a plus d'objet
    );
    return { statut: 'envoye' };
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return { statut: 'expire' };
    return {
      statut: 'echec',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
