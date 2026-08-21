import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { configStripe, signatureValide, lireAbonnement, finDePeriode, lireSetupIntent } from '@/lib/stripe';
import { declencherDebits } from '@/lib/paiement/declencher-debits';

/**
 * Réception des événements Stripe.
 *
 * C'est ici que le paiement devient un droit. Trois garde-fous :
 *   1. la signature est vérifiée — sinon n'importe qui s'offrirait un abonnement ;
 *   2. l'identifiant d'événement est enregistré — un rejeu ne crédite pas deux fois ;
 *   3. le foyer vient des métadonnées Stripe, jamais du corps de la requête.
 *
 * Toute réponse autre que 2xx pousse Stripe à réessayer : on ne renvoie donc
 * une erreur que si un nouvel essai a une chance d'aboutir.
 */
export const dynamic = 'force-dynamic';

const EVENEMENTS_ABONNEMENT = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

const EVENEMENTS_FACTURE = new Set([
  'invoice.paid',
  'invoice.payment_failed',
]);

/**
 * Traduction pour UNE moitié. Distincte de statutSupabase() : un impayé sur
 * une part ouvre une période de grâce, il ne coupe pas l'accès du foyer.
 */
function statutContribution(statutStripe: string): string {
  switch (statutStripe) {
    case 'active': return 'paid';
    case 'trialing': return 'processing';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'incomplete': return 'processing';
    case 'incomplete_expired': return 'failed';
    default: return 'canceled';
  }
}

function statutSupabase(statutStripe: string): string {
  switch (statutStripe) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due':
    case 'unpaid':
    case 'incomplete': return 'past_due';
    default: return 'canceled';   // canceled, incomplete_expired, paused
  }
}

/**
 * Aiguillage du paiement partagé.
 *
 * Renvoie true si l'abonnement Stripe appartient à un règlement partagé — le
 * traitement est alors terminé, la base ayant recalculé l'accès du foyer à
 * partir des deux moitiés. Renvoie false pour un abonnement ordinaire, que
 * l'appelant confie alors au chemin historique, inchangé.
 */
async function traiterMoitie(
  service: NonNullable<ReturnType<typeof supabaseService>>,
  idAbonnement: string,
  statut: string,
  finPeriode?: string | null,
): Promise<boolean> {
  const { data, error } = await service.rpc('maj_contribution_stripe', {
    p_stripe_subscription: idAbonnement,
    p_status: statut,
    p_period_end: finPeriode ?? null,
  });
  if (error) throw new Error(error.message);
  // 'hors_partage' : cet abonnement n'est pas une moitié.
  return data !== 'hors_partage';
}

async function confirmerEvenement(service: ReturnType<typeof supabaseService>, eventId: string) {
  if (!service) throw new Error('Client de service indisponible');
  const { error } = await service.rpc('confirm_billing_event', { p_event_id: eventId });
  if (error) throw new Error(`Confirmation de facturation impossible : ${error.message}`);
}

async function signalerEchec(
  service: NonNullable<ReturnType<typeof supabaseService>>, eventId: string, message: string,
) {
  const { error } = await service.rpc('fail_billing_event', {
    p_event_id: eventId, p_erreur: message,
  });
  if (error) console.error('[webhook] journalisation de l’échec', error.message);
}

export async function POST(requete: Request) {
  const config = configStripe();
  if (!config) {
    return NextResponse.json({ message: 'Paiements non activés.' }, { status: 503 });
  }

  const corpsBrut = await requete.text();
  const signature = requete.headers.get('stripe-signature');

  if (!(await signatureValide(corpsBrut, signature, config.secretWebhook))) {
    // Signature invalide : ne pas demander de nouvel essai
    return NextResponse.json({ message: 'Signature invalide.' }, { status: 400 });
  }

  const service = supabaseService();
  if (!service) {
    console.error('[webhook] clé de service absente : impossible de créditer');
    return NextResponse.json({ message: 'Configuration incomplète.' }, { status: 500 });
  }

  let evenement: {
    id: string; type: string;
    data: { object: Record<string, unknown> };
  };
  try {
    evenement = JSON.parse(corpsBrut);
  } catch {
    return NextResponse.json({ message: 'Corps illisible.' }, { status: 400 });
  }

  const objet = evenement.data?.object ?? {};
  const metadonnees = (objet.metadata ?? {}) as Record<string, string>;
  const householdId = metadonnees.household_id ?? null;

  // Journalisation d'abord : si l'événement est déjà connu, on s'arrête là.
  const { data: nouveau, error: erreurJournal } = await service.rpc('record_billing_event', {
    p_event_id: evenement.id,
    p_type: evenement.type,
    p_household: householdId,
    p_payload: objet,
  });
  if (erreurJournal) {
    console.error('[webhook] journalisation', erreurJournal.message);
    return NextResponse.json({ message: 'Réessayez.' }, { status: 500 });
  }
  if (nouveau === false) {
    return NextResponse.json({ recu: true, deja_traite: true });
  }

  try {
    if (evenement.type === 'checkout.session.completed') {
      const mode = objet.mode as string;

      if (mode === 'payment' && metadonnees.type === 'extension') {
        if (!householdId || !metadonnees.extension_id) {
          console.error('[webhook] extension sans métadonnées exploitables');
          await confirmerEvenement(service, evenement.id);
          return NextResponse.json({ recu: true, ignore: true });
        }
        const { error } = await service.rpc('grant_extension', {
          p_household: householdId,
          p_extension: metadonnees.extension_id,
          p_session: objet.id as string,
          p_intent: (objet.payment_intent as string) ?? null,
          p_amount: objet.amount_total ? Number(objet.amount_total) : null,
        });
        if (error) throw new Error(error.message);
      }

      // Empreinte de carte d'un règlement partagé. Aucun débit n'a eu lieu :
      // on enregistre le moyen de paiement, puis on tente le déclenchement.
      // Celui-ci ne fait quelque chose que si TOUTES les parts sont prêtes.
      if (mode === 'setup' && metadonnees.type === 'partage_empreinte') {
        const arrangementId = metadonnees.arrangement_id;
        const parentId = metadonnees.user_id;
        if (!arrangementId || !parentId) {
          console.error('[webhook] empreinte sans métadonnées exploitables');
          await confirmerEvenement(service, evenement.id);
          return NextResponse.json({ recu: true, ignore: true });
        }

        const idSetup = objet.setup_intent as string | null;
        const client = objet.customer as string | null;
        let moyenPaiement: string | null = null;
        if (idSetup) {
          const setup = await lireSetupIntent(config, idSetup);
          moyenPaiement = (setup.payment_method as string) ?? null;
        }
        if (!moyenPaiement || !client) {
          console.error('[webhook] empreinte sans moyen de paiement exploitable');
          await confirmerEvenement(service, evenement.id);
          return NextResponse.json({ recu: true, ignore: true });
        }

        // Une part déjà rattachée à un abonnement ne revient pas en arrière :
        // un événement rejoué ne doit pas rouvrir un débit déjà engagé.
        const { error: erreurPart } = await service
          .from('subscription_contributions')
          .update({
            status: 'ready_to_charge',
            stripe_customer_id: client,
            stripe_setup_intent_id: idSetup,
            stripe_payment_method_id: moyenPaiement,
          })
          .eq('arrangement_id', arrangementId)
          .eq('user_id', parentId)
          .is('stripe_subscription_id', null);
        if (erreurPart) throw new Error(erreurPart.message);

        const resultat = await declencherDebits(service, arrangementId, config);
        await confirmerEvenement(service, evenement.id);
        return NextResponse.json({ recu: true, partage: resultat });
      }

      if (mode === 'subscription' && householdId) {
        // La session ne porte pas la période : on interroge l'abonnement.
        const idAbo = objet.subscription as string;
        let finPeriode: string | null = null;
        let prix: string | null = null;
        let statut = 'active';
        let annulationProgrammee = false;
        let essaiFin: string | null = null;

        if (idAbo) {
          const abo = await lireAbonnement(config, idAbo);
          statut = statutSupabase(String(abo.status ?? 'active'));
          annulationProgrammee = Boolean(abo.cancel_at_period_end);
          finPeriode = finDePeriode(abo);
          if (abo.trial_end) {
            essaiFin = new Date(Number(abo.trial_end) * 1000).toISOString();
          }
          const items = abo.items as { data?: { price?: { id?: string } }[] } | undefined;
          prix = items?.data?.[0]?.price?.id ?? null;
        }

        const { error } = await service.rpc('upsert_subscription', {
          p_household: householdId,
          p_plan: 'premium',
          p_status: statut,
          p_customer: (objet.customer as string) ?? null,
          p_subscription: idAbo ?? null,
          p_price: prix,
          p_period_end: finPeriode,
          p_cancel_at_period_end: annulationProgrammee,
          p_trial_end: essaiFin,
        });
        if (error) throw new Error(error.message);
      }
    }


    if (EVENEMENTS_FACTURE.has(evenement.type)) {
      const idAbo = typeof objet.subscription === 'string'
        ? objet.subscription
        : ((objet.parent as { subscription_details?: { subscription?: string } } | undefined)
            ?.subscription_details?.subscription ?? null);

      // Chemin du partage. Un événement portant sur UNE moitié ne dit rien de
      // l'état du foyer : il met à jour sa part, puis l'agrégation relit les
      // deux et décide seule. Ne jamais l'envoyer à upsert_subscription, qui
      // interpréterait une moitié en difficulté comme le foyer entier.
      const traiteParPartage = idAbo
        ? await traiterMoitie(service, idAbo,
            evenement.type === 'invoice.payment_failed' ? 'past_due' : 'paid')
        : false;

      if (idAbo && !traiteParPartage) {
        const abo = await lireAbonnement(config, idAbo);
        const metaAbo = (abo.metadata ?? {}) as Record<string, string>;
        const foyer = metaAbo.household_id ?? householdId;
        if (foyer) {
          const items = abo.items as { data?: { price?: { id?: string } }[] } | undefined;
          const statut = evenement.type === 'invoice.payment_failed'
            ? 'past_due'
            : statutSupabase(String(abo.status ?? 'active'));
          const { error } = await service.rpc('upsert_subscription', {
            p_household: foyer,
            p_plan: 'premium',
            p_status: statut,
            p_customer: (abo.customer as string) ?? (objet.customer as string) ?? null,
            p_subscription: idAbo,
            p_price: items?.data?.[0]?.price?.id ?? null,
            p_period_end: finDePeriode(abo),
            p_cancel_at_period_end: Boolean(abo.cancel_at_period_end),
            p_trial_end: abo.trial_end
              ? new Date(Number(abo.trial_end) * 1000).toISOString() : null,
          });
          if (error) throw new Error(error.message);
        }
      }
    }

    if (EVENEMENTS_ABONNEMENT.has(evenement.type)) {
      // Même aiguillage : une moitié annulée ou renouvelée ne vaut pas pour
      // le foyer entier.
      const idMoitie = (objet.id as string) ?? null;
      if (idMoitie && await traiterMoitie(
        service, idMoitie,
        evenement.type === 'customer.subscription.deleted'
          ? 'canceled'
          : statutContribution(String(objet.status ?? 'active')),
        finDePeriode(objet),
      )) {
        await confirmerEvenement(service, evenement.id);
        return NextResponse.json({ recu: true, partage: true });
      }

      // L'abonnement porte lui-même la référence du foyer
      const foyer = householdId
        ?? ((objet.metadata as Record<string, string>)?.household_id ?? null);
      if (!foyer) {
        console.error('[webhook] abonnement sans foyer rattaché');
        await confirmerEvenement(service, evenement.id);
        return NextResponse.json({ recu: true, ignore: true });
      }
      const items = objet.items as { data?: { price?: { id?: string } }[] } | undefined;
      const { error } = await service.rpc('upsert_subscription', {
        p_household: foyer,
        p_plan: 'premium',
        p_status: evenement.type === 'customer.subscription.deleted'
          ? 'canceled'
          : statutSupabase(String(objet.status ?? 'active')),
        p_customer: (objet.customer as string) ?? null,
        p_subscription: (objet.id as string) ?? null,
        p_price: items?.data?.[0]?.price?.id ?? null,
        p_period_end: finDePeriode(objet),
        p_cancel_at_period_end: Boolean(objet.cancel_at_period_end),
        p_trial_end: objet.trial_end
          ? new Date(Number(objet.trial_end) * 1000).toISOString() : null,
      });
      if (error) throw new Error(error.message);
    }

    // Marqué traité seulement maintenant : un échec plus haut laisse
    // l'événement rejouable par Stripe.
    await confirmerEvenement(service, evenement.id);
    return NextResponse.json({ recu: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[webhook]', evenement.type, message);
    await signalerEchec(service, evenement.id, message);
    // 500 : Stripe réessaiera, et record_billing_event autorisera la reprise
    return NextResponse.json({ message: 'Traitement à reprendre.' }, { status: 500 });
  }
}
