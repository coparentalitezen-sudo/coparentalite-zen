import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { estAdministrateur } from '@/lib/marketing/administration';
import {
  configurationMeta, etatConfiguration, verifierConnexion, permissions,
  quotaPublication, VERSION_GRAPH,
} from '@/lib/marketing/meta';
import { lireParametres } from '@/lib/marketing/depot';

/**
 * État de la connexion Meta.
 *
 * Interroge réellement Meta plutôt que de se contenter de constater la
 * présence des variables : une variable renseignée ne prouve pas qu'un jeton
 * soit valide, ni qu'il porte les bonnes autorisations, ni qu'il désigne les
 * bons comptes. C'est la différence entre « ça devrait marcher » et une preuve.
 *
 * Réservée à l'administrateur, et muette sur les valeurs : la réponse ne
 * contient que des booléens, des noms de comptes et des noms d'autorisations.
 * Aucun jeton, aucun identifiant secret.
 */
export const dynamic = 'force-dynamic';

const REQUISES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
];

export async function GET() {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ message: 'Service indisponible.' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!estAdministrateur(user?.email)) return new NextResponse('Not found', { status: 404 });

  const config = configurationMeta();
  const variables = etatConfiguration();
  const parametres = await lireParametres();

  if (!config) {
    return NextResponse.json({
      connecte: false,
      motif: 'Configuration incomplète.',
      variables,
      version_graph: VERSION_GRAPH,
    });
  }

  const [identite, accordees, quota] = await Promise.all([
    verifierConnexion(config),
    permissions(config),
    quotaPublication(config),
  ]);

  // Les manquantes sont nommées une par une. Un simple « permissions
  // insuffisantes » obligerait à tout reprendre pour trouver laquelle.
  const obtenues = accordees.donnees ?? [];
  const manquantes = REQUISES.filter((p) => !obtenues.includes(p));

  return NextResponse.json({
    connecte: identite.ok && manquantes.length === 0,
    version_graph: VERSION_GRAPH,
    variables,
    page: identite.donnees?.page ?? null,
    instagram: identite.donnees?.instagram ?? null,
    erreur_identite: identite.ok ? null : identite.erreur,
    permissions_accordees: obtenues,
    permissions_manquantes: manquantes,
    // Facebook et Instagram sont distingués : Facebook peut manquer sans
    // empêcher Instagram de publier, et l'inverse n'est pas vrai.
    peut_publier_instagram: obtenues.includes('instagram_content_publish')
      && obtenues.includes('instagram_basic'),
    peut_publier_facebook: obtenues.includes('pages_manage_posts'),
    quota_publications: quota.donnees ?? null,
    mode: parametres?.mode ?? 'validation',
    publication_active: parametres?.actif ?? false,
  });
}
