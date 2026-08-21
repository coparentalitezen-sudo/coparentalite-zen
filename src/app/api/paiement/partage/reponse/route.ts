import { NextResponse } from 'next/server';
import { supabaseServer, supabaseService } from '@/lib/supabase/server';
import { configStripe, creerSessionEmpreinte } from '@/lib/stripe';
import { cleIdempotencePaiement } from '@/lib/payment-idempotency';
import { estExpiree } from '@/lib/paiement-partage';

/**
 * Réponse du second parent à une demande de partage.
 *
 * Accepter n'engage aucun débit : cela ouvre une empreinte de carte, exactement
 * comme pour le premier parent. Les deux abonnements ne seront créés qu'une
 * fois les deux empreintes prises.
 *
 * Refuser ferme le règlement. Comme rien n'a été prélevé à ce stade, il n'y a
 * jamais de remboursement à traiter.
 */
export async function POST(requete: Request) {
  const config = configStripe();
  if (!config) {
    return NextResponse.json(
      { message: 'Les paiements ne sont pas encore activés sur cette installation.' },
      { status: 503 },
    );
  }

  const supabase = await supabaseServer();
  const service = supabaseService();
  if (!supabase || !service) {
    return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Connectez-vous pour répondre.' }, { status: 401 });
  }

  let corps: { arrangementId?: string; reponse?: string };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  const { arrangementId } = corps;
  const reponse = corps.reponse;
  if (!arrangementId || (reponse !== 'accepte' && reponse !== 'refuse')) {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  // La contribution est lue sous service_role, mais elle n'est trouvée que si
  // elle appartient à l'utilisateur connecté : un parent ne peut ni accepter
  // ni refuser la part de l'autre.
  const { data: part } = await service
    .from('subscription_contributions')
    .select('id, household_id, status, amount_cents, stripe_customer_id')
    .eq('arrangement_id', arrangementId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!part) {
    return NextResponse.json(
      { message: 'Aucune demande de partage ne vous attend.' },
      { status: 404 },
    );
  }

  // Appartenance au foyer revérifiée côté serveur, indépendamment de la ligne.
  const { data: membre } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', part.household_id)
    .eq('profile_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!membre) {
    return NextResponse.json({ message: 'Foyer inaccessible.' }, { status: 403 });
  }

  // Une réponse déjà donnée ne se rejoue pas : ni double empreinte, ni
  // réouverture d'un règlement clos.
  if (part.status !== 'awaiting_partner') {
    return NextResponse.json(
      { message: 'Cette demande a déjà reçu une réponse.' },
      { status: 409 },
    );
  }

  const { data: arrangement } = await service
    .from('subscription_payment_arrangements')
    .select('id, status, expires_at, billing_period')
    .eq('id', arrangementId)
    .maybeSingle();

  if (!arrangement || estExpiree(arrangement.expires_at as string | null)) {
    await service.from('subscription_payment_arrangements')
      .update({ status: 'expired' }).eq('id', arrangementId);
    return NextResponse.json(
      { message: 'Cette demande de partage a expiré. L’autre parent peut en relancer une.' },
      { status: 409 },
    );
  }

  if (reponse === 'refuse') {
    const { error } = await service.rpc('enregistrer_contribution', {
      p_arrangement: arrangementId,
      p_user: user.id,
      p_status: 'refused',
      p_amount: part.amount_cents,
    });
    if (error) {
      console.error('[partage:refus]', error.message);
      return NextResponse.json({ message: 'Le refus n’a pas pu être enregistré.' }, { status: 502 });
    }
    await service.from('subscription_payment_arrangements')
      .update({ status: 'refused' }).eq('id', arrangementId);
    // Aucune carte n'a été débitée : rien à rembourser.
    return NextResponse.json({ etat: 'refuse' });
  }

  try {
    const { error } = await service.rpc('enregistrer_contribution', {
      p_arrangement: arrangementId,
      p_user: user.id,
      p_status: 'awaiting_second_setup',
      p_amount: part.amount_cents,
    });
    if (error) throw new Error(error.message);

    await service.from('subscription_payment_arrangements')
      .update({ status: 'awaiting_second_setup' }).eq('id', arrangementId);

    const session = await creerSessionEmpreinte({
      config,
      householdId: part.household_id as string,
      arrangementId: arrangementId as string,
      userId: user.id,
      montantCents: Number(part.amount_cents),
      emailClient: user.email ?? undefined,
      clientExistant: (part.stripe_customer_id as string) ?? null,
      cleIdempotence: cleIdempotencePaiement({
        userId: user.id,
        householdId: part.household_id as string,
        type: 'abonnement',
        resource: `partage-accept:${arrangementId}`,
      }),
    });

    return NextResponse.json({
      etat: 'accepte',
      url: session.url,
      votrePart: Number(part.amount_cents),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    console.error('[partage:acceptation]', message);
    return NextResponse.json(
      { message: 'L’enregistrement de votre carte n’a pas pu être ouvert. Réessayez.' },
      { status: 502 },
    );
  }
}
