import { NextResponse } from 'next/server';
import { supabaseServer, supabaseService } from '@/lib/supabase/server';
import { configStripe, creerSessionEmpreinte } from '@/lib/stripe';
import { cleIdempotencePaiement } from '@/lib/payment-idempotency';
import { repartirMoitie, sommeCoherente, echeanceDemande, partageDisponible } from '@/lib/paiement-partage';

/**
 * Ouverture d'un règlement partagé entre les deux parents.
 *
 * Le client transmet une intention, jamais un montant. Le prix est relu en
 * base, la répartition est calculée ici, et l'empreinte de carte est prise
 * sans aucun débit : rien n'est prélevé tant que les deux parents n'ont pas
 * confirmé.
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
    return NextResponse.json({ message: 'Connectez-vous pour souscrire.' }, { status: 401 });
  }

  let corps: { householdId?: string; periodicite?: string };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  const householdId = corps.householdId;
  const periodicite = corps.periodicite === 'month' ? 'month' : 'year';
  if (!householdId) {
    return NextResponse.json({ message: 'Requête invalide.' }, { status: 400 });
  }

  // Le partage n'est ouvert que sur la formule annuelle, et seulement quand
  // l'indicateur est levé. Sur le mensuel, deux frais fixes Stripe
  // absorberaient une part disproportionnée du règlement.
  if (!partageDisponible(periodicite)) {
    return NextResponse.json(
      { message: 'Le partage à 50/50 n’est pas disponible pour cette formule.' },
      { status: 409 },
    );
  }

  // Appartenance au foyer, et rôle : seul le propriétaire engage une dépense.
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
      { message: 'Seul le parent qui a créé le foyer peut engager un règlement.' },
      { status: 403 },
    );
  }

  // Un partage suppose deux parents. Le proposer à un foyer d'une personne
  // n'aurait pas de sens : la demande resterait sans destinataire.
  const { data: membres } = await supabase
    .from('household_members')
    .select('profile_id')
    .eq('household_id', householdId)
    .is('deleted_at', null);
  const autre = (membres ?? []).find((m) => m.profile_id !== user.id);
  if (!autre) {
    return NextResponse.json(
      { message: 'Invitez l’autre parent avant de partager le règlement.' },
      { status: 409 },
    );
  }

  try {
    // Le montant vient de la base — le client ne le négocie pas.
    const { data: plan } = await service
      .from('plans')
      .select('price_cents_monthly, price_cents_yearly')
      .eq('id', 'premium')
      .maybeSingle();
    const total = Number(
      periodicite === 'year' ? plan?.price_cents_yearly : plan?.price_cents_monthly,
    );
    if (!Number.isInteger(total) || total <= 0) {
      return NextResponse.json(
        { message: 'L’abonnement n’est pas encore configuré. Réessayez plus tard.' },
        { status: 503 },
      );
    }

    const { premiere, seconde } = repartirMoitie(total);
    // Garde-fou : on n'ouvre jamais un règlement dont les parts ne
    // reconstituent pas exactement le tarif annoncé.
    if (!sommeCoherente([premiere, seconde], total)) {
      console.error('[partage] répartition incohérente pour', total);
      return NextResponse.json({ message: 'Règlement indisponible.' }, { status: 500 });
    }

    // ouvrir_arrangement refuse un second règlement en cours, et refuse
    // d'ouvrir un partage si un abonnement actif court déjà.
    const { data: arrangementId, error: erreurArr } = await service.rpc('ouvrir_arrangement', {
      p_household: householdId,
      p_mode: 'half',
      p_plan: 'premium',
      p_periode: periodicite,
      p_total: total,
      p_expires: echeanceDemande().toISOString(),
    });
    if (erreurArr || !arrangementId) {
      return NextResponse.json(
        { message: erreurArr?.message ?? 'Un règlement est déjà en cours pour ce foyer.' },
        { status: 409 },
      );
    }

    // Les deux parts sont inscrites d'emblée : celle du parent qui ouvre, et
    // celle proposée à l'autre. L'autre parent voit ainsi la demande dans son
    // espace sans qu'aucune carte ait été enregistrée pour lui.
    const { error: e1 } = await service.rpc('enregistrer_contribution', {
      p_arrangement: arrangementId,
      p_user: user.id,
      p_status: 'awaiting_first_setup',
      p_amount: premiere,
    });
    const { error: e2 } = await service.rpc('enregistrer_contribution', {
      p_arrangement: arrangementId,
      p_user: autre.profile_id,
      p_status: 'awaiting_partner',
      p_amount: seconde,
    });
    if (e1 || e2) {
      throw new Error(e1?.message ?? e2?.message ?? 'Contributions non enregistrées');
    }

    const session = await creerSessionEmpreinte({
      config,
      householdId,
      arrangementId: arrangementId as string,
      userId: user.id,
      montantCents: premiere,
      emailClient: user.email ?? undefined,
      cleIdempotence: cleIdempotencePaiement({
        userId: user.id, householdId, type: 'abonnement',
        resource: `partage:${arrangementId}`,
      }),
    });

    return NextResponse.json({
      url: session.url,
      // Les deux montants exacts, affichés avant confirmation.
      votrePart: premiere,
      partAutreParent: seconde,
      total,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue';
    // Le détail Stripe reste dans les journaux du serveur, pas dans la réponse
    console.error('[partage]', message);
    return NextResponse.json(
      { message: 'Le règlement n’a pas pu être ouvert. Réessayez dans un instant.' },
      { status: 502 },
    );
  }
}
