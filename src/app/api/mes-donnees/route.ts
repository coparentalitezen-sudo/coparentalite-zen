import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Export des données personnelles — article 20 du RGPD.
 *
 * Toute personne peut obtenir les données qu'elle nous a confiées, dans un
 * format lisible par une machine, et les emporter ailleurs. C'est un droit,
 * pas une faveur : il doit être exerçable sans nous écrire ni attendre.
 *
 * Le relevé est constitué avec la session du demandeur, jamais avec la clé de
 * service : les règles de sécurité de la base s'appliquent donc telles quelles,
 * et nul ne peut obtenir par ce chemin ce qu'il ne voit pas déjà à l'écran.
 * Un parent exporte son foyer, pas celui du voisin.
 */
export const dynamic = 'force-dynamic';

/** Tables rattachées au foyer, exportées telles quelles. */
const PAR_FOYER = [
  'household_members', 'children', 'child_contacts',
  'custody_rules', 'custody_exceptions', 'calendar_events',
  'expenses', 'expense_shares', 'expense_children', 'reimbursements',
  'recurring_expenses', 'expense_categories', 'documents',
  'notifications', 'notification_preferences', 'subscriptions',
] as const;

export async function GET() {
  const supabase = await supabaseServer();
  if (!supabase) {
    return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Connectez-vous pour exporter vos données.' },
      { status: 401 });
  }

  const { data: profil } = await supabase
    .from('profiles').select('*').eq('id', user.id).maybeSingle();

  const { data: membres } = await supabase
    .from('household_members').select('household_id')
    .eq('profile_id', user.id).is('deleted_at', null);

  const idsFoyers = (membres ?? []).map((m) => m.household_id as string);

  const { data: foyers } = idsFoyers.length > 0
    ? await supabase.from('households').select('*').in('id', idsFoyers)
    : { data: [] };

  const contenu: Record<string, unknown> = {};
  for (const table of PAR_FOYER) {
    if (idsFoyers.length === 0) { contenu[table] = []; continue; }
    const { data, error } = await supabase.from(table).select('*').in('household_id', idsFoyers);
    // Une table refusée par les règles de sécurité ne doit pas faire échouer
    // l'export entier : le demandeur reçoit le reste, et sait ce qui manque.
    contenu[table] = error ? { non_communique: error.message } : (data ?? []);
  }

  const { data: reglages } = await supabase
    .from('user_settings').select('*').eq('profile_id', user.id);
  const { data: consentements } = await supabase
    .from('consent_logs').select('*').eq('profile_id', user.id);

  const relevé = {
    a_propos_de_cet_export: {
      genere_le: new Date().toISOString(),
      concerne: user.email,
      portee: 'Données du compte et des foyers dont vous êtes membre.',
      note: 'Les données saisies par l’autre parent lui appartiennent également ; '
        + 'elles figurent ici parce que vous y avez accès dans l’application.',
      droits: 'Rectification, effacement, opposition : voir l’écran Confidentialité.',
    },
    compte: { id: user.id, email: user.email, cree_le: user.created_at },
    profil,
    foyers,
    reglages: reglages ?? [],
    consentements: consentements ?? [],
    ...contenu,
  };

  const jour = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(relevé, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="coparentalite-zen-${jour}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
