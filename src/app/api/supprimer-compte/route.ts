import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { configStripe } from '@/lib/stripe';

/**
 * Suppression du compte — article 17 du RGPD.
 *
 * L'ordre des opérations est ce qui compte ici. L'abonnement est résilié
 * d'abord : une fois le profil anonymisé, plus rien ne relie le compte au
 * client Stripe, et le prélèvement continuerait au profit d'un compte qui
 * n'existe plus. Un échec de résiliation interrompt donc tout — mieux vaut un
 * effacement refusé qu'un effacement suivi d'un débit.
 */
export const dynamic = 'force-dynamic';

async function resilier(abonnement: string): Promise<string | null> {
  const config = configStripe();
  if (!config) return 'Paiements indisponibles : réessayez dans un moment.';
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${abonnement}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.cleSecrete}` },
  });
  // Un abonnement déjà résilié n'est pas une erreur : le but est atteint.
  if (r.ok || r.status === 404) return null;
  return 'Votre abonnement n’a pas pu être résilié : compte conservé pour vous éviter '
    + 'un prélèvement. Réessayez, ou écrivez-nous.';
}

export async function POST() {
  const supabase = await supabaseServer();
  if (!supabase) {
    return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Connectez-vous pour supprimer votre compte.' },
      { status: 401 });
  }

  const { data: membre } = await supabase
    .from('household_members').select('household_id')
    .eq('profile_id', user.id).is('deleted_at', null);

  const ids = (membre ?? []).map((m) => m.household_id as string);
  if (ids.length > 0) {
    const { data: abos } = await supabase
      .from('subscriptions').select('stripe_subscription_id, status')
      .in('household_id', ids);
    for (const a of abos ?? []) {
      const id = a.stripe_subscription_id as string | null;
      if (!id || a.status === 'canceled') continue;
      const souci = await resilier(id);
      if (souci) return NextResponse.json({ message: souci }, { status: 502 });
    }
  }

  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ message: 'Compte supprimé.', bilan: data });
}
