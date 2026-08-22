/**
 * Accès à Stripe — côté serveur exclusivement.
 *
 * Aucune dépendance : l'API Stripe est appelée en HTTP avec fetch. Cela évite
 * d'ajouter un paquet et sa surface de mise à jour pour trois points d'entrée.
 *
 * Ce module ne s'exécute jamais dans le navigateur : il lit des secrets.
 */

const API = 'https://api.stripe.com/v1';

export interface ConfigStripe {
  cleSecrete: string;
  secretWebhook: string;
  origine: string;
}

/**
 * Renvoie la configuration, ou null si Stripe n'est pas encore configuré.
 * Le produit doit rester utilisable sans Stripe : seule la page d'offres
 * l'annonce alors comme indisponible, plutôt que de tomber en erreur.
 */
export function configStripe(): ConfigStripe | null {
  const cleSecrete = process.env.STRIPE_SECRET_KEY;
  const secretWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  const origine = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    ?? 'http://localhost:3000';
  // Les identifiants de tarif ne sont plus des variables d'environnement :
  // ils vivent dans la table plans, avec les montants qu'ils représentent.
  if (!cleSecrete || !secretWebhook) return null;
  return { cleSecrete, secretWebhook, origine };
}

export function stripeConfigure(): boolean {
  return configStripe() !== null;
}

/** Appel générique à l'API Stripe, en form-urlencoded comme elle l'attend. */
async function appel<T>(
  cle: string, chemin: string, methode: 'GET' | 'POST', champs?: Record<string, string>,
  cleIdempotence?: string,
): Promise<T> {
  const entetes: Record<string, string> = {
    Authorization: `Bearer ${cle}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-06-20',
  };
  // Une requête rejouée ne doit pas créer deux paiements.
  if (cleIdempotence) entetes['Idempotency-Key'] = cleIdempotence;

  const reponse = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: entetes,
    body: champs ? new URLSearchParams(champs).toString() : undefined,
  });
  const corps = await reponse.json();
  if (!reponse.ok) {
    const message = corps?.error?.message ?? `Stripe a répondu ${reponse.status}`;
    throw new Error(message);
  }
  return corps as T;
}

export interface SessionPaiement { id: string; url: string }

/** Paiement unique : achat de mois de planning supplémentaires. */
export async function creerSessionExtension(params: {
  config: ConfigStripe;
  householdId: string;
  extensionId: string;
  prixStripe: string | null;
  libelle: string;
  montantCents: number;
  emailClient?: string;
  cleIdempotence: string;
}): Promise<SessionPaiement> {
  const { config } = params;
  const champs: Record<string, string> = {
    mode: 'payment',
    'payment_method_types[0]': 'card',
    success_url: `${config.origine}/app/offre?paiement=reussi&type=extension`,
    cancel_url: `${config.origine}/app/offre?paiement=annule`,
    locale: 'fr',
    billing_address_collection: 'auto',
    'custom_text[submit][message]': 'Paiement sécurisé par Stripe.',
    client_reference_id: params.householdId,
    // Le foyer et l'extension voyagent dans les métadonnées : le webhook s'y
    // fie plutôt qu'à un paramètre d'URL, qu'un client pourrait falsifier.
    'metadata[household_id]': params.householdId,
    'metadata[extension_id]': params.extensionId,
    'metadata[type]': 'extension',
  };
  if (params.prixStripe) {
    champs['line_items[0][price]'] = params.prixStripe;
    champs['line_items[0][quantity]'] = '1';
  } else {
    // Pas de tarif préenregistré : on décrit le produit à la volée. Le montant
    // vient de la base, jamais du client.
    champs['line_items[0][quantity]'] = '1';
    champs['line_items[0][price_data][currency]'] = 'eur';
    champs['line_items[0][price_data][unit_amount]'] = String(params.montantCents);
    champs['line_items[0][price_data][product_data][name]'] =
      `Coparentalité Zen — ${params.libelle}`;
  }
  if (params.emailClient) {
    champs.customer_email = params.emailClient;
    champs.customer_creation = 'always';
  }

  return appel<SessionPaiement>(config.cleSecrete, '/checkout/sessions', 'POST', champs, params.cleIdempotence);
}

/** Abonnement mensuel Zen Plus. */
export async function creerSessionAbonnement(params: {
  config: ConfigStripe;
  householdId: string;
  /** Tarif Stripe résolu en base à partir de la formule demandée. */
  tarifStripe: string;
  periodicite: 'month' | 'year';
  emailClient?: string;
  clientExistant?: string | null;
  cleIdempotence: string;
}): Promise<SessionPaiement> {
  const { config } = params;
  const champs: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': params.tarifStripe,
    'line_items[0][quantity]': '1',
    success_url: `${config.origine}/app/offre?paiement=reussi&type=abonnement`,
    cancel_url: `${config.origine}/app/offre?paiement=annule`,
    locale: 'fr',
    billing_address_collection: 'auto',
    'custom_text[submit][message]': 'Paiement sécurisé par Stripe.',
    client_reference_id: params.householdId,
    'metadata[household_id]': params.householdId,
    'metadata[type]': 'abonnement',
    'metadata[periodicite]': params.periodicite,
    'subscription_data[metadata][household_id]': params.householdId,
  };
  if (params.clientExistant) champs.customer = params.clientExistant;
  else if (params.emailClient) champs.customer_email = params.emailClient;

  return appel<SessionPaiement>(config.cleSecrete, '/checkout/sessions', 'POST', champs, params.cleIdempotence);
}

/**
 * Empreinte de carte, sans aucun débit.
 *
 * Premier temps du règlement partagé : chaque parent enregistre un moyen de
 * paiement, et rien n'est prélevé. Les deux abonnements ne sont créés qu'une
 * fois les deux empreintes prises — c'est ce qui rend le remboursement
 * inutile plutôt que rare, et c'est pourquoi le mode est 'setup' et non
 * 'subscription'.
 */
export async function creerSessionEmpreinte(params: {
  config: ConfigStripe;
  householdId: string;
  arrangementId: string;
  userId: string;
  /** Montant que ce parent réglera ensuite — affiché, jamais débité ici. */
  montantCents: number;
  emailClient?: string;
  clientExistant?: string | null;
  cleIdempotence: string;
}): Promise<SessionPaiement> {
  const { config } = params;
  if (!Number.isInteger(params.montantCents) || params.montantCents <= 0) {
    throw new Error('Montant de contribution invalide.');
  }
  const champs: Record<string, string> = {
    mode: 'setup',
    'payment_method_types[0]': 'card',
    success_url: `${config.origine}/app/offre?paiement=empreinte&type=partage`,
    cancel_url: `${config.origine}/app/offre?paiement=annule`,
    locale: 'fr',
    'custom_text[submit][message]':
      'Aucun prélèvement maintenant. Votre part sera réglée lorsque les deux parents auront confirmé.',
    client_reference_id: params.householdId,
    'metadata[household_id]': params.householdId,
    'metadata[type]': 'partage_empreinte',
    'metadata[arrangement_id]': params.arrangementId,
    'metadata[user_id]': params.userId,
    'metadata[montant_cents]': String(params.montantCents),
    // Recopiées sur le Setup Intent : l'événement setup_intent.succeeded ne
    // porte pas la session, et doit rester rattachable à sa contribution.
    'setup_intent_data[metadata][household_id]': params.householdId,
    'setup_intent_data[metadata][arrangement_id]': params.arrangementId,
    'setup_intent_data[metadata][user_id]': params.userId,
  };
  if (params.clientExistant) champs.customer = params.clientExistant;
  else if (params.emailClient) champs.customer_email = params.emailClient;

  return appel<SessionPaiement>(config.cleSecrete, '/checkout/sessions', 'POST', champs, params.cleIdempotence);
}

/**
 * Produit Stripe auquel se rattache un tarif existant.
 *
 * L'API Subscriptions accepte un price_data créé à la volée, mais exige un
 * produit déjà présent — contrairement à Checkout, elle ne sait pas décrire
 * un produit inline. Plutôt que d'en créer un nouveau, on réutilise celui du
 * tarif annuel déjà configuré : le catalogue Stripe n'accueille aucun objet
 * supplémentaire, et les deux moitiés apparaissent sous le même produit que
 * l'abonnement entier.
 */
export async function produitDuTarif(config: ConfigStripe, tarifStripe: string): Promise<string> {
  const tarif = await appel<{ product?: string }>(
    config.cleSecrete, `/prices/${tarifStripe}`, 'GET',
  );
  if (!tarif.product) {
    throw new Error(`Le tarif ${tarifStripe} n'est rattaché à aucun produit Stripe.`);
  }
  return tarif.product;
}

/**
 * Abonnement d'une moitié, créé côté serveur une fois les deux empreintes
 * prises.
 *
 * Le montant vient de la base, réparti par repartirMoitie() : cette fonction
 * ne divise rien, elle facture ce qu'on lui donne. off_session, parce que le
 * parent n'est plus devant son écran au moment du débit.
 */
export async function creerAbonnementMoitie(params: {
  config: ConfigStripe;
  householdId: string;
  arrangementId: string;
  userId: string;
  client: string;
  moyenPaiement: string;
  produit: string;
  montantCents: number;
  periodicite: 'month' | 'year';
  cleIdempotence: string;
}): Promise<{ id: string; status: string }> {
  const { config } = params;
  if (!Number.isInteger(params.montantCents) || params.montantCents <= 0) {
    throw new Error('Montant de contribution invalide.');
  }
  const champs: Record<string, string> = {
    customer: params.client,
    default_payment_method: params.moyenPaiement,
    off_session: 'true',
    'items[0][quantity]': '1',
    'items[0][price_data][currency]': 'eur',
    'items[0][price_data][product]': params.produit,
    'items[0][price_data][unit_amount]': String(params.montantCents),
    'items[0][price_data][recurring][interval]':
      params.periodicite === 'year' ? 'year' : 'month',
    description: 'Coparentalité Zen Plus — moitié réglée par un parent',
    'metadata[household_id]': params.householdId,
    'metadata[arrangement_id]': params.arrangementId,
    'metadata[user_id]': params.userId,
    'metadata[type]': 'partage',
  };
  return appel<{ id: string; status: string }>(
    config.cleSecrete, '/subscriptions', 'POST', champs, params.cleIdempotence,
  );
}

/** Session Checkout relue : sert à récupérer le client et le Setup Intent. */
export async function lireSession(config: ConfigStripe, id: string): Promise<Record<string, unknown>> {
  return appel<Record<string, unknown>>(config.cleSecrete, `/checkout/sessions/${id}`, 'GET');
}

/** Setup Intent relu : porte le moyen de paiement enregistré. */
export async function lireSetupIntent(config: ConfigStripe, id: string): Promise<Record<string, unknown>> {
  return appel<Record<string, unknown>>(config.cleSecrete, `/setup_intents/${id}`, 'GET');
}

/** Portail client : moyen de paiement, factures, résiliation. */
export async function creerSessionPortail(params: {
  config: ConfigStripe; client: string;
}): Promise<{ url: string }> {
  return appel<{ url: string }>(params.config.cleSecrete, '/billing_portal/sessions', 'POST', {
    customer: params.client,
    return_url: `${params.config.origine}/app/offre`,
  });
}

export async function lireAbonnement(config: ConfigStripe, id: string): Promise<Record<string, unknown>> {
  return appel<Record<string, unknown>>(config.cleSecrete, `/subscriptions/${id}`, 'GET');
}

/**
 * Fin de la période payée, en ISO.
 *
 * Stripe a déplacé cette date : elle figurait sur l'abonnement, elle vit
 * désormais sur chacune de ses lignes. Les deux emplacements sont lus, faute
 * de quoi un abonnement annuel n'affiche aucune date de renouvellement — le
 * seul repère qui distingue justement l'annuel du mensuel.
 */
export function finDePeriode(abo: Record<string, unknown>): string | null {
  const lignes = abo.items as { data?: { current_period_end?: number }[] } | undefined;
  const brut = (abo.current_period_end as number | undefined)
    ?? lignes?.data?.[0]?.current_period_end;
  if (!brut || !Number.isFinite(Number(brut))) return null;
  return new Date(Number(brut) * 1000).toISOString();
}

/**
 * Vérifie la signature d'un webhook Stripe.
 *
 * Sans cette vérification, n'importe qui pourrait appeler l'URL du webhook et
 * s'offrir un abonnement. C'est le point le plus sensible du parcours de
 * paiement — implémenté ici avec l'API de cryptographie standard, sans
 * dépendance.
 */
export async function signatureValide(
  corpsBrut: string, entete: string | null, secret: string, toleranceSecondes = 300,
): Promise<boolean> {
  if (!entete) return false;

  const parties = entete.split(',').reduce<Record<string, string[]>>((acc, p) => {
    const [cle, valeur] = p.split('=');
    if (!cle || !valeur) return acc;
    (acc[cle.trim()] ??= []).push(valeur.trim());
    return acc;
  }, {});

  const horodatage = parties.t?.[0];
  const signatures = parties.v1 ?? [];
  if (!horodatage || signatures.length === 0) return false;

  // Fenêtre temporelle : bloque le rejeu d'une requête interceptée
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(horodatage));
  if (!Number.isFinite(age) || age > toleranceSecondes) return false;

  const encodeur = new TextEncoder();
  const cle = await crypto.subtle.importKey(
    'raw', encodeur.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const attendu = await crypto.subtle.sign('HMAC', cle, encodeur.encode(`${horodatage}.${corpsBrut}`));
  const attenduHex = [...new Uint8Array(attendu)]
    .map((o) => o.toString(16).padStart(2, '0')).join('');

  // Comparaison à temps constant : ne renseigne pas un attaquant sur l'écart
  return signatures.some((s) => comparaisonConstante(s, attenduHex));
}

function comparaisonConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i += 1) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}
