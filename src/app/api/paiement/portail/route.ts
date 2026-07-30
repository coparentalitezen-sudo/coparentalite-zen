import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { configStripe, creerSessionPortail } from '@/lib/stripe';

/** Portail Stripe : moyen de paiement, factures, résiliation. */
export async function POST(requete: Request) {
  const config = configStripe();
  if (!config) {
    return NextResponse.json({ message: 'Les paiements ne sont pas activés.' }, { status: 503 });
  }
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Connectez-vous.' }, { status: 401 });

  let corps: { householdId?: string };
  try { corps = await requete.json(); }
  catch { return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 }); }
  if (!corps.householdId) {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  const { data: membre } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', corps.householdId)
    .eq('profile_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!membre || (membre.role !== 'owner' && membre.role !== 'admin')) {
    return NextResponse.json(
      { message: 'Seul le parent qui a créé le foyer gère l’abonnement.' },
      { status: 403 },
    );
  }

  const { data: abo } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('household_id', corps.householdId)
    .maybeSingle();
  if (!abo?.stripe_customer_id) {
    return NextResponse.json(
      { message: 'Aucun abonnement à gérer pour ce foyer.' },
      { status: 404 },
    );
  }

  try {
    const session = await creerSessionPortail({
      config, client: abo.stripe_customer_id as string,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[portail]', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { message: 'Le portail de gestion n’est pas accessible pour le moment.' },
      { status: 502 },
    );
  }
}
