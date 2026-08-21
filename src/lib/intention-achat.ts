/**
 * Intention d'achat conservée pendant l'inscription.
 *
 * Un visiteur qui clique sur « Choisir Zen Plus » n'a pas encore de compte.
 * Le renvoyer vers l'inscription puis l'abandonner sur l'écran d'accueil,
 * c'est lui faire refaire le chemin — et souvent le perdre. Son choix est
 * donc mémorisé, puis rejoué une fois le foyer créé.
 *
 * Ce qui est mémorisé est une INTENTION, jamais un montant ni un droit : au
 * retour, le serveur relit le tarif en base et revérifie l'appartenance au
 * foyer. Une intention falsifiée dans le navigateur ne peut donc rien obtenir
 * d'autre que ce que l'utilisateur pouvait déjà demander.
 */

const CLE = 'czen:intention-achat';

/** Durée au-delà de laquelle une intention oubliée cesse de s'appliquer. */
const VALIDITE_MS = 24 * 3600 * 1000;

export interface IntentionAchat {
  type: 'abonnement' | 'extension';
  /** Formule visée pour un abonnement. */
  periodicite?: 'month' | 'year';
  /** Offre visée pour une extension. */
  extensionId?: string;
  /** Mode de règlement choisi, s'il l'a déjà été. */
  mode?: 'integral' | 'partage';
  enregistreeLe: number;
}

/**
 * sessionStorage plutôt que localStorage : l'intention appartient à la visite
 * en cours. Un ordinateur partagé — situation banale entre parents séparés —
 * ne doit pas proposer à quelqu'un d'autre de finaliser un achat entamé.
 */
function stockage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    // Navigation privée, stockage refusé : l'inscription doit fonctionner
    // quand même, simplement sans mémoire du choix.
    return null;
  }
}

export function memoriserIntention(
  intention: Omit<IntentionAchat, 'enregistreeLe'>,
  maintenant: number = Date.now(),
): void {
  const s = stockage();
  if (!s) return;
  try {
    s.setItem(CLE, JSON.stringify({ ...intention, enregistreeLe: maintenant }));
  } catch { /* quota atteint : l'achat reste possible, sans raccourci */ }
}

/** Relit l'intention si elle est encore valide. Ne la consomme pas. */
export function lireIntention(maintenant: number = Date.now()): IntentionAchat | null {
  const s = stockage();
  if (!s) return null;
  let brut: string | null = null;
  try { brut = s.getItem(CLE); } catch { return null; }
  if (!brut) return null;

  let intention: IntentionAchat;
  try { intention = JSON.parse(brut) as IntentionAchat; } catch { return null; }

  if (intention.type !== 'abonnement' && intention.type !== 'extension') return null;
  if (typeof intention.enregistreeLe !== 'number') return null;
  if (maintenant - intention.enregistreeLe > VALIDITE_MS) {
    oublierIntention();
    return null;
  }
  return intention;
}

export function oublierIntention(): void {
  const s = stockage();
  if (!s) return;
  try { s.removeItem(CLE); } catch { /* rien à faire */ }
}

/**
 * Destination à ouvrir après l'inscription.
 *
 * Jamais une URL de paiement : la session Stripe se crée côté serveur, après
 * vérification. On se contente de rouvrir la page d'offre en lui indiquant ce
 * que le visiteur avait choisi.
 */
export function destinationApresInscription(intention: IntentionAchat | null): string {
  if (!intention) return '/app/accueil';
  const params = new URLSearchParams({ reprise: intention.type });
  if (intention.periodicite) params.set('periodicite', intention.periodicite);
  if (intention.extensionId) params.set('extension', intention.extensionId);
  if (intention.mode) params.set('mode', intention.mode);
  return `/app/offre?${params.toString()}`;
}
