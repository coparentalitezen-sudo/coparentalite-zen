import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';
import { configStripe, signatureValide, lireAbonnement, finDePeriode } from '@/lib/stripe';

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
      if (idAbo) {
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
            p_period_end: abo.current_period_end
              ? new Date(Number(abo.current_period_end) * 1000).toISOString() : null,
            p_cancel_at_period_end: Boolean(abo.cancel_at_period_end),
            p_trial_end: abo.trial_end
              ? new Date(Number(abo.trial_end) * 1000).toISOString() : null,
          });
          if (error) throw new Error(error.message);
        }
      }
    }

    if (EVENEMENTS_ABONNEMENT.has(evenement.type)) {
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
