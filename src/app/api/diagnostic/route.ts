import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * État de la configuration serveur.
 *
 * Dit quelles variables d'environnement sont présentes — jamais leur valeur.
 * Sans cela, une variable oubliée se diagnostique par tâtonnement, ce qui a
 * coûté plusieurs allers-retours.
 *
 * Réservé aux membres d'un foyer : la liste des services configurés n'a pas à
 * être publique.
 */
export const dynamic = 'force-dynamic';

function presente(nom: string): boolean {
  const v = process.env[nom];
  return typeof v === 'string' && v.trim().length > 0;
}

export async function GET() {
  const supabase = await supabaseServer();
  if (!supabase) {
    return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Connectez-vous.' }, { status: 401 });
  }
  const { data: membre } = await supabase
    .from('household_members').select('household_id')
    .eq('profile_id', user.id).is('deleted_at', null).limit(1);
  if (!membre || membre.length === 0) {
    return NextResponse.json({ message: 'Accès réservé aux membres d’un foyer.' }, { status: 403 });
  }

  const variables = {
    supabase_url: presente('NEXT_PUBLIC_SUPABASE_URL'),
    supabase_cle_publique: presente('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    supabase_cle_service: presente('SUPABASE_SERVICE_ROLE_KEY'),
    cron_secret: presente('CRON_SECRET'),
    stripe_cle: presente('STRIPE_SECRET_KEY'),
    stripe_webhook: presente('STRIPE_WEBHOOK_SECRET'),
  };

  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_VERSION
      ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    variables,
    // Ce que chaque manque empêche concrètement
    consequences: [
      !variables.supabase_cle_service
        && 'Import des vacances scolaires impossible (SUPABASE_SERVICE_ROLE_KEY manquante).',
      !variables.cron_secret
        && 'Synchronisation hebdomadaire automatique inactive (CRON_SECRET manquante).',
      (!variables.stripe_cle || !variables.stripe_webhook)
        && 'Paiements indisponibles (clés Stripe manquantes).',
    ].filter(Boolean),
  });
}
