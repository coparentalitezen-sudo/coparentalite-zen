import type { SupabaseClient } from '@supabase/supabase-js';
import {
  configStripe, produitDuTarif, creerAbonnementMoitie, type ConfigStripe,
} from '@/lib/stripe';

/**
 * Débit des deux moitiés, une fois les deux empreintes réunies.
 *
 * C'est le maillon qui donne son sens au parcours Setup : jusqu'ici, aucune
 * carte n'a été débitée. Les deux abonnements ne naissent qu'ici, et
 * seulement quand toutes les parts attendues sont prêtes.
 *
 * Deux propriétés comptent plus que tout le reste :
 *
 *   1. Un seul déclenchement. Les deux empreintes arrivent par deux
 *      événements Stripe distincts, potentiellement simultanés. Un verrou par
 *      comparaison-et-échange sur l'état de l'arrangement garantit qu'un seul
 *      des deux passages crée les abonnements.
 *
 *   2. Aucun double débit. Une part portant déjà un abonnement Stripe est
 *      sautée, et la clé d'idempotence est dérivée de l'identifiant de la
 *      contribution — stable dans le temps, donc un rejeu tardif retombe sur
 *      le même abonnement au lieu d'en créer un second.
 */

interface Contribution {
  id: string;
  user_id: string;
  amount_cents: number;
  status: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_subscription_id: string | null;
}

export type ResultatDebit =
  | 'incomplet'      // toutes les parts ne sont pas prêtes
  | 'deja_engage'    // un autre passage s'en occupe ou s'en est occupé
  | 'declenche'      // les abonnements viennent d'être créés
  | 'echec';         // au moins une part n'a pas pu être débitée

export async function declencherDebits(
  service: SupabaseClient,
  arrangementId: string,
  config: ConfigStripe | null = configStripe(),
): Promise<ResultatDebit> {
  if (!config) return 'echec';

  const { data: arrangement } = await service
    .from('subscription_payment_arrangements')
    .select('id, household_id, mode, expected_contributions, status, billing_period, total_amount_cents')
    .eq('id', arrangementId)
    .maybeSingle();
  if (!arrangement) return 'echec';

  const { data: brut } = await service
    .from('subscription_contributions')
    .select('id, user_id, amount_cents, status, stripe_customer_id, stripe_payment_method_id, stripe_subscription_id')
    .eq('arrangement_id', arrangementId)
    .neq('status', 'canceled');
  const parts = (brut ?? []) as Contribution[];

  const attendues = Number(arrangement.expected_contributions);
  const pretes = parts.filter(
    (p) => p.status === 'ready_to_charge' && p.stripe_payment_method_id && p.stripe_customer_id,
  );

  // Tant qu'une empreinte manque, on ne touche à rien. C'est exactement la
  // garantie promise aux deux parents : personne n'est débité seul.
  if (parts.length !== attendues || pretes.length !== attendues) return 'incomplet';

  // Garde-fou comptable : la somme des parts doit reconstituer le total
  // annoncé. Un écart ici signifie que quelque chose a dérivé entre
  // l'ouverture et le débit — on préfère ne pas encaisser.
  const somme = pretes.reduce((s, p) => s + Number(p.amount_cents), 0);
  if (somme !== Number(arrangement.total_amount_cents)) {
    console.error('[debits] somme des parts', somme, '≠ total', arrangement.total_amount_cents);
    await service.from('subscription_payment_arrangements')
      .update({ status: 'failed' }).eq('id', arrangementId);
    return 'echec';
  }

  // Comparaison-et-échange : un seul passage bascule l'arrangement en
  // 'processing' et obtient le droit de créer les abonnements. Le second
  // reçoit zéro ligne et s'arrête là.
  const { data: gagnant } = await service
    .from('subscription_payment_arrangements')
    .update({ status: 'processing' })
    .eq('id', arrangementId)
    .neq('status', 'processing')
    .neq('status', 'active')
    .select('id');
  if (!gagnant || gagnant.length === 0) return 'deja_engage';

  let produit: string;
  try {
    const { data: tarif } = await service.rpc('tarif_stripe', {
      p_plan: 'premium',
      p_periode: arrangement.billing_period,
    });
    if (!tarif) throw new Error('Tarif Stripe introuvable pour premium.');
    // Le produit est celui du tarif déjà configuré : le catalogue Stripe
    // n'accueille aucun objet supplémentaire.
    produit = await produitDuTarif(config, tarif as string);
  } catch (e) {
    console.error('[debits] produit introuvable', e instanceof Error ? e.message : e);
    await service.from('subscription_payment_arrangements')
      .update({ status: 'failed' }).eq('id', arrangementId);
    return 'echec';
  }

  let echec = false;
  for (const part of pretes) {
    // Une part déjà rattachée à un abonnement ne se redébite pas.
    if (part.stripe_subscription_id) continue;
    try {
      const abo = await creerAbonnementMoitie({
        config,
        householdId: arrangement.household_id as string,
        arrangementId,
        userId: part.user_id,
        client: part.stripe_customer_id as string,
        moyenPaiement: part.stripe_payment_method_id as string,
        produit,
        montantCents: Number(part.amount_cents),
        periodicite: arrangement.billing_period === 'year' ? 'year' : 'month',
        // Dérivée de la contribution : stable, donc un rejeu retombe sur le
        // même abonnement Stripe au lieu d'en créer un second.
        cleIdempotence: `czen:moitie:${part.id}`,
      });
      await service.from('subscription_contributions')
        .update({
          stripe_subscription_id: abo.id,
          // 'paid' n'est jamais posé ici : seule la facture réglée, confirmée
          // par le webhook, ouvre un droit.
          status: 'processing',
        })
        .eq('id', part.id);
    } catch (e) {
      echec = true;
      const message = e instanceof Error ? e.message : String(e);
      // Le détail Stripe reste dans les journaux du serveur.
      console.error('[debits] part', part.id, message);
      await service.from('subscription_contributions')
        .update({ status: 'failed' }).eq('id', part.id);
    }
  }

  if (echec) {
    // L'agrégation décidera du sort du foyer et signalera, le cas échéant,
    // qu'une part encaissée appelle une régularisation.
    await service.rpc('recalculer_partage', { p_household: arrangement.household_id });
    return 'echec';
  }

  return 'declenche';
}
