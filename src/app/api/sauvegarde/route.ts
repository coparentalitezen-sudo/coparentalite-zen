import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase/server';

/**
 * Sauvegarde intégrale des données.
 *
 * Une application qui porte le planning de familles séparées ne peut pas se
 * contenter des sauvegardes de l'hébergeur : elles protègent d'une panne de
 * machine, pas d'une erreur humaine — une migration maladroite, une
 * suppression de trop. Ce relevé est indépendant, lisible sans outil, et
 * peut être rejoué table par table.
 *
 * Il est déposé dans un seau privé du stockage, accessible à la seule clé de
 * service. Les justificatifs joints aux dépenses n'y figurent pas : ce sont
 * des fichiers, déjà conservés par le stockage lui-même.
 *
 * L'accès est réservé à la tâche planifiée. Un relevé pareil, entre d'autres
 * mains, livrerait l'intégralité des foyers.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SEAU = 'sauvegardes';

/** Ce qui doit pouvoir être reconstitué. Les journaux ne s'y trouvent pas. */
const TABLES = [
  'profiles', 'households', 'household_members', 'invitations',
  'children', 'child_contacts',
  'custody_rules', 'custody_periods', 'custody_exceptions', 'school_holidays',
  'calendar_events', 'exchange_requests',
  'expense_categories', 'expenses', 'expense_children', 'expense_shares',
  'expense_comments', 'recurring_expenses', 'reimbursements',
  'documents', 'conversations', 'messages',
  'notification_preferences', 'plans', 'subscriptions',
  'user_settings', 'consent_logs',
] as const;

function autorise(requete: Request): boolean {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) return false;
  return requete.headers.get('authorization') === `Bearer ${attendu}`;
}

export async function GET(requete: Request) {
  if (!autorise(requete)) {
    return NextResponse.json({ message: 'Accès refusé.' }, { status: 401 });
  }

  const supabase = supabaseService();
  if (!supabase) {
    return NextResponse.json({ message: 'Clé de service absente.' }, { status: 503 });
  }

  const contenu: Record<string, unknown> = {};
  const soucis: string[] = [];
  let lignes = 0;

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      // Une table manquante ne doit pas emporter la sauvegarde : le reste vaut
      // toujours mieux que rien, et le manque est consigné.
      soucis.push(`${table} · ${error.message}`);
      continue;
    }
    contenu[table] = data ?? [];
    lignes += (data ?? []).length;
  }

  const horodatage = new Date().toISOString();
  const releve = {
    genere_le: horodatage,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'inconnue',
    tables: TABLES.length - soucis.length,
    lignes,
    ...(soucis.length > 0 ? { non_sauvegarde: soucis } : {}),
    donnees: contenu,
  };

  const corps = JSON.stringify(releve);
  const nom = `${horodatage.slice(0, 10)}/sauvegarde-${horodatage.slice(11, 16).replace(':', 'h')}.json`;

  const { error: depot } = await supabase.storage.from(SEAU).upload(nom, corps, {
    contentType: 'application/json',
    upsert: true,
  });

  if (depot) {
    // Le dépôt a échoué : le dire franchement plutôt que de laisser croire
    // qu'une sauvegarde existe. C'est le mensonge le plus coûteux qui soit.
    return NextResponse.json({
      message: `Sauvegarde constituée mais non déposée : ${depot.message}`,
      lignes, tables: releve.tables,
    }, { status: 500 });
  }

  return NextResponse.json({
    fichier: nom, lignes, tables: releve.tables,
    ...(soucis.length > 0 ? { soucis } : {}),
  });
}
