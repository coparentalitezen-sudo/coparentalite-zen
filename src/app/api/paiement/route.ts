import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { configStripe, creerSessionExtension, creerSessionAbonnement } from '@/lib/stripe';

/**
 * Ouverture d'un paiement.
 *
 * Le client transmet une intention, jamais un montant. Le prix est relu en
 * base, l'appartenance au foyer est vérifiée côté serveur, et seul le
 * propriétaire peut engager une dépense pour le foyer.
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
  if (!supabase) {
    return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Connectez-vous pour souscrire.' }, { status: 401 });
  }

  let corps: { householdId?: string; type?: string; extensionId?: string };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  const { householdId, type, extensionId } = corps;
  if (!householdId || (type !== 'extension' && type !== 'abonnement')) {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  // Seul le propriétaire engage une dépense : l'autre parent ne doit pas
  // pouvoir facturer le foyer à son insu.
  const { data: membre } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('profile_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!membre) {
    return NextResponse.json({ message: 'Foyer inaccessible.' }, { status: 403 });
  }
  if (membre.role !== 'owner' && membre.role !== 'admin') {
    return NextResponse.json(
      { message: 'Seul le parent qui a créé le foyer peut souscrire.' },
      { status: 403 },
    );
  }

  try {
    if (type === 'extension') {
      if (!extensionId) {
        return NextResponse.json({ message: 'Offre non précisée.' }, { status: 400 });
      }
      // Le montant vient de la base — le client ne peut pas le négocier.
      const { data: ext } = await supabase
        .from('plan_extensions')
        .select('id, label, months, price_cents, stripe_price_id')
        .eq('id', extensionId)
        .eq('active', true)
        .maybeSingle();
      if (!ext) {
        return NextResponse.json({ message: 'Cette offre n’existe plus.' }, { status: 404 });
      }

      const session = await creerSessionExtension({
        config,
        householdId,
        extensionId: ext.id as string,
        prixStripe: (ext.stripe_price_id as string) ?? null,
        libelle: ext.label as string,
        montantCents: Number(ext.price_cents),
        emailClient: user.email ?? undefined,
        cleIdempotence: `ext:${householdId}:${ext.id}:${Date.now()}`,
      });
      return NextResponse.json({ url: session.url });
    }

    // Abonnement : on réutilise le client Stripe existant s'il y en a un,
    // pour ne pas créer de doublon de facturation.
    const { data: abo } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, status')
      .eq('household_id', householdId)
      .maybeSingle();

    if (abo?.status === 'active' || abo?.status === 'trialing') {
      return NextResponse.json(
        { message: 'Votre foyer est déjà abonné à Zen Plus.' },
        { status: 409 },
      );
    }

    const session = await creerSessionAbonnement({
      config,
      householdId,
      emailClient: user.email ?? undefined,
      clientExistant: (abo?.stripe_customer_id as string) ?? null,
      cleIdempotence: `sub:${householdId}:${Date.now()}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    // Le détail Stripe reste dans les journaux du serveur, pas dans la réponse
    console.error('[paiement]', message);
    return NextResponse.json(
      { message: 'Le paiement n’a pas pu être ouvert. Réessayez dans un instant.' },
      { status: 502 },
    );
  }
}
